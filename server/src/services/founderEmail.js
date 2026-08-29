// Founder Email Center v1 — pure content helpers (validation + safe HTML
// rendering). No Prisma, no Resend, no network here — same convention as
// services/pilotCommunications.js, which this module deliberately reuses
// rather than duplicates for the one piece that must never drift: the CTA
// route allowlist (see CTA_ROUTE_ALLOWLIST re-export below).
//
// Body formatting is intentionally tiny — paragraphs, one "**heading**"
// line per block, and "- " bullet lists — never a rich-HTML editor, and
// every raw line is HTML-escaped BEFORE any tag is wrapped around it, so
// arbitrary HTML in a founder-authored draft can never become live markup.

const { isValidCtaRoute, CTA_ROUTE_ALLOWLIST } = require('./pilotCommunications');
const { escapeHtml } = require('./email');

const MAX_FROM_NAME_LEN = 40;
const MAX_SUBJECT_LEN = 150;
const MAX_PREVIEW_LEN = 150;
const MAX_BODY_LEN = 4000;
const MAX_CTA_LABEL_LEN = 30;

// Subject/from-name are header-ish strings — reject outright rather than
// trying to sanitize, so a crafted "Subject\r\nBcc: someone@evil" can never
// reach Resend's API in any form.
function hasControlChars(value) {
  return /[\r\n\x00-\x08\x0B\x0C\x0E-\x1F]/.test(value);
}

// Full server-side validation for a founder compose payload (used by both
// POST /test and POST /send — audience is validated separately by the
// route, since only /send has one). Client validation is never trusted
// alone. Returns { ok: true, data } with a clean object, or { ok: false, error }.
function validateEmailContent(body) {
  const src = body || {};
  const { fromName, subject, previewText, body: text, ctaLabel, ctaRoute } = src;

  // fromName also rejects '<'/'>' — services/email.js's sendRawEmail builds
  // the From header as `${fromName} <${FROM}>`; either character there
  // could otherwise prematurely close/reopen that constructed address.
  if (
    typeof fromName !== 'string' || !fromName.trim() || fromName.trim().length > MAX_FROM_NAME_LEN ||
    hasControlChars(fromName) || /[<>]/.test(fromName)
  ) {
    return { ok: false, error: 'Invalid from name' };
  }
  if (typeof subject !== 'string' || !subject.trim() || subject.trim().length > MAX_SUBJECT_LEN || hasControlChars(subject)) {
    return { ok: false, error: 'Invalid subject' };
  }

  let cleanPreview = null;
  if (previewText !== undefined && previewText !== null && previewText !== '') {
    if (typeof previewText !== 'string' || previewText.trim().length > MAX_PREVIEW_LEN || hasControlChars(previewText)) {
      return { ok: false, error: 'Invalid preview text' };
    }
    cleanPreview = previewText.trim();
  }

  if (typeof text !== 'string' || !text.trim() || text.trim().length > MAX_BODY_LEN) {
    return { ok: false, error: 'Invalid body' };
  }

  let cleanCtaRoute = null;
  let cleanCtaLabel = null;
  if (ctaRoute !== undefined && ctaRoute !== null && ctaRoute !== '') {
    if (!isValidCtaRoute(ctaRoute)) return { ok: false, error: 'Invalid CTA route' };
    if (typeof ctaLabel !== 'string' || !ctaLabel.trim() || ctaLabel.trim().length > MAX_CTA_LABEL_LEN) {
      return { ok: false, error: 'Invalid CTA label' };
    }
    cleanCtaRoute = ctaRoute;
    cleanCtaLabel = ctaLabel.trim();
  }

  return {
    ok: true,
    data: {
      fromName: fromName.trim(),
      subject: subject.trim(),
      previewText: cleanPreview,
      body: text.trim(),
      ctaRoute: cleanCtaRoute,
      ctaLabel: cleanCtaLabel,
    },
  };
}

// Founder-authored plain text -> safe HTML. Blocks are separated by a
// blank line. Within a block:
//   - every line starts with "- "        -> a <ul><li> bullet list
//   - the block is exactly one line, and that line is wrapped in "**…**"
//                                          -> a bold section heading
//   - anything else                      -> a plain paragraph (internal
//                                            single newlines become <br/>)
// Every raw line is escaped individually before any tag is added — this is
// the one place arbitrary HTML in a founder draft could sneak through, and
// it never does.
function renderBodyHtml(rawBody) {
  const blocks = String(rawBody || '').replace(/\r\n/g, '\n').split(/\n\s*\n/);
  return blocks
    .map((block) => {
      const lines = block.split('\n').map((l) => l.trim()).filter(Boolean);
      if (lines.length === 0) return '';

      if (lines.every((l) => l.startsWith('- '))) {
        const items = lines.map((l) => `<li style="margin-bottom:6px;">${escapeHtml(l.slice(2).trim())}</li>`).join('');
        return `<ul style="margin:0 0 16px;padding-left:20px;color:#1A1A1A;font-size:15px;line-height:1.6;">${items}</ul>`;
      }

      const headingMatch = lines.length === 1 && /^\*\*(.+)\*\*$/.exec(lines[0]);
      if (headingMatch) {
        return `<p style="font-weight:700;font-size:16px;margin:0 0 12px;color:#185FA5;">${escapeHtml(headingMatch[1].trim())}</p>`;
      }

      const html = lines.map((l) => escapeHtml(l)).join('<br/>');
      return `<p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:#1A1A1A;">${html}</p>`;
    })
    .filter(Boolean)
    .join('\n');
}

// Full production Arjun URL for an already-validated internal CTA route —
// the server constructs this itself from the existing configured base URL
// (same CLIENT_URL fallback sendWelcomeEmail already uses), never from a
// founder-entered full URL. `route` must already have passed
// isValidCtaRoute() — this function does not re-check it.
function buildCtaUrl(route) {
  const base = process.env.CLIENT_URL || 'https://arjun.app';
  return `${base}${route}`;
}

// Assembles the full email HTML — same visual language as
// sendWelcomeEmail's light template (white background, brand blue,
// Poppins). `firstName` is the one piece of athlete personalization
// allowed (see routes/founderEmail.js); null/missing falls back to "there",
// same convention sendWelcomeEmail already uses. Never more than one CTA
// button, and never renders one without both a route and a label.
function buildEmailHtml({ fromName, subject, previewText, body, ctaLabel, ctaRoute, firstName }) {
  const safeFirstName = escapeHtml(firstName ? firstName.trim() : 'there');
  const bodyHtml = renderBodyHtml(body);
  const ctaUrl = ctaRoute && ctaLabel ? buildCtaUrl(ctaRoute) : null;
  const preheader = previewText
    ? `<div style="display:none;max-height:0;overflow:hidden;opacity:0;">${escapeHtml(previewText)}</div>`
    : '';

  return `
    <div style="font-family:'Poppins', Arial, sans-serif; max-width:480px; margin:0 auto; padding:32px 24px; background:#FFFFFF; color:#1A1A1A;">
      ${preheader}
      <p style="font-weight:700; font-size:16px; color:#185FA5; margin:0 0 24px;">${escapeHtml(fromName)}</p>
      <p style="font-size:15px; line-height:1.6; margin:0 0 16px;">Hi ${safeFirstName},</p>
      ${bodyHtml}
      ${ctaUrl ? `
      <div style="margin:24px 0;">
        <a href="${ctaUrl}" style="display:inline-block; background:#185FA5; color:#FFFFFF; text-decoration:none; padding:12px 28px; border-radius:8px; font-weight:600; font-size:15px;">
          ${escapeHtml(ctaLabel)}
        </a>
      </div>` : ''}
      <p style="font-size:15px; margin:24px 0 0;">— Arjun</p>
    </div>
  `;
}

// Subject line is never modified for a test send — the athlete-facing
// content must match exactly what a real send would produce (see
// routes/founderEmail.js's POST /test). It's the destination address, not
// the content, that marks a send as a test.
module.exports = {
  MAX_FROM_NAME_LEN,
  MAX_SUBJECT_LEN,
  MAX_PREVIEW_LEN,
  MAX_BODY_LEN,
  MAX_CTA_LABEL_LEN,
  CTA_ROUTE_ALLOWLIST,
  isValidCtaRoute,
  validateEmailContent,
  renderBodyHtml,
  buildCtaUrl,
  buildEmailHtml,
};
