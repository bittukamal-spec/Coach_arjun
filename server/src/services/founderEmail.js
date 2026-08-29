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

// Single source of truth for the site's own base URL. Every "full site
// URL" this file builds — CTA links, the logo asset, and the footer's own
// website link below — starts here (same CLIENT_URL fallback
// sendWelcomeEmail already uses). Never a founder-entered or otherwise
// arbitrary value.
function getBaseUrl() {
  return process.env.CLIENT_URL || 'https://arjun.app';
}

// Full production Arjun URL for an already-validated internal CTA route —
// the server constructs this itself; `route` must already have passed
// isValidCtaRoute() — this function does not re-check it. CTA
// security/routing itself is untouched by the layout refresh below.
function buildCtaUrl(route) {
  return `${getBaseUrl()}${route}`;
}

// The real Arjun brand mark, already deployed as a static client asset
// (client/public/brand/arjun/pwa-icon-192.png — the same square PNG used
// for the PWA icon set) — reused as-is; no new logo file was added.
// Resolved to an absolute URL the same way buildCtaUrl() resolves a CTA
// route: email clients cannot resolve a relative image path, so this can
// never be one.
const LOGO_PATH = '/brand/arjun/pwa-icon-192.png';
function buildLogoUrl() {
  return `${getBaseUrl()}${LOGO_PATH}`;
}

// The footer's "coacharjun.in" link. Both the href and its own display
// text are derived from the SAME configured base, so they can never point
// at two different places — never a hard-coded "coacharjun.in" string
// disconnected from where CLIENT_URL actually sends people. Display text
// strips the protocol (and any trailing slash) only, so a real deploy
// reads "coacharjun.in", not "https://coacharjun.in".
function buildSiteLink() {
  const url = getBaseUrl();
  const domain = url.replace(/^https?:\/\//, '').replace(/\/+$/, '');
  return { url, domain };
}

// Assembles the full email HTML. Layout refresh (v1.2): a full-width white
// email body — no grey outer field, no centered/boxed "card" — with a
// left-aligned content column (max-width 640px; table has no auto-margin,
// so on a wide render it starts flush left rather than centering, and on
// mobile it just fills the available width). The Arjun logo sits top-left
// (not centered), and everything below it — headline, body, CTA, founder
// sign-off, footer — is left-aligned. Table-based layout for cross-client
// reliability (Gmail/Outlook), not flexbox/grid, and fluid via width:100%
// below the max-width, no media query needed (robust in clients like
// Gmail's Android app that strip <style> blocks). `firstName` is the one
// piece of athlete personalization allowed (see routes/founderEmail.js);
// null/missing falls back to "there", same convention sendWelcomeEmail
// already uses. Never more than one CTA button, and never renders one
// without both a route and a label — that gate, and buildCtaUrl() above,
// are exactly what they were before this refresh.
function buildEmailHtml({ subject, previewText, body, ctaLabel, ctaRoute, firstName }) {
  const safeFirstName = escapeHtml(firstName ? firstName.trim() : 'there');
  const bodyHtml = renderBodyHtml(body);
  const ctaUrl = ctaRoute && ctaLabel ? buildCtaUrl(ctaRoute) : null;
  const logoUrl = buildLogoUrl();
  const site = buildSiteLink();
  const year = new Date().getFullYear();
  const preheader = previewText
    ? `<div style="display:none;max-height:0;overflow:hidden;opacity:0;">${escapeHtml(previewText)}</div>`
    : '';

  return `
    ${preheader}
    <div style="background:#FFFFFF; font-family:'Poppins', Arial, sans-serif;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:640px; width:100%; margin:0; border-collapse:collapse; table-layout:fixed;">
        <tr>
          <td style="padding:32px 24px; color:#1A1A1A; text-align:left; word-break:break-word; overflow-wrap:break-word;">
            <img src="${logoUrl}" width="52" height="52" alt="Arjun" style="display:block; border:0; border-radius:10px; margin:0 0 28px;" />
            <p style="font-size:15px; line-height:1.6; margin:0 0 20px; text-align:left;">Hi ${safeFirstName},</p>
            ${bodyHtml}
            ${ctaUrl ? `
            <div style="margin:24px 0; text-align:left;">
              <a href="${ctaUrl}" style="display:inline-block; background:#185FA5; color:#FFFFFF; text-decoration:none; padding:14px 32px; border-radius:8px; font-weight:600; font-size:15px;">
                ${escapeHtml(ctaLabel)}
              </a>
            </div>` : ''}
            <div style="margin-top:32px; text-align:left;">
              <p style="font-size:15px; font-weight:700; color:#1A1A1A; margin:0;">Prabhanshu</p>
              <p style="font-size:13px; color:#6B7280; margin:2px 0 0;">Founder</p>
              <p style="font-size:12px; color:#9CA3AF; margin:6px 0 0;">Coach Arjun — Your personal mental coach</p>
            </div>
            <div style="margin-top:28px; padding-top:20px; border-top:1px solid #E5E7EB; text-align:left;">
              <p style="font-size:12px; color:#9CA3AF; line-height:1.6; margin:0 0 6px;">You're receiving this because you're part of the Arjun beta.</p>
              <p style="font-size:12px; color:#9CA3AF; line-height:1.6; margin:0 0 6px;">&copy; ${year} Coach Arjun. All rights reserved.</p>
              <p style="font-size:12px; margin:0;"><a href="${site.url}" style="color:#185FA5; text-decoration:underline;">${escapeHtml(site.domain)}</a></p>
            </div>
          </td>
        </tr>
      </table>
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
  LOGO_PATH,
  buildLogoUrl,
  buildSiteLink,
  buildEmailHtml,
};
