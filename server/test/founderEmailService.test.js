// Founder Email Center v1 — pure content helpers (services/founderEmail.js).
// No Prisma, no Resend, no network — same convention as
// pilotCommunications.test.js's validateCommunicationInput coverage.

const test = require('node:test');
const assert = require('node:assert/strict');

process.env.RESEND_API_KEY = process.env.RESEND_API_KEY || 'test-key';
process.env.RESEND_FROM_EMAIL = process.env.RESEND_FROM_EMAIL || 'noreply@example.test';
process.env.CLIENT_URL = process.env.CLIENT_URL || 'https://arjun.test';

const {
  validateEmailContent,
  renderBodyHtml,
  buildCtaUrl,
  buildEmailHtml,
  CTA_ROUTE_ALLOWLIST,
  isValidCtaRoute,
} = require('../src/services/founderEmail');

function validDraft(overrides = {}) {
  return {
    fromName: 'Arjun',
    subject: 'Quick check-in',
    body: 'Just checking in on how training is going.',
    ...overrides,
  };
}

// ── validateEmailContent ─────────────────────────────────────────────────

test('accepts a minimal valid draft (no preview text, no CTA)', () => {
  const r = validateEmailContent(validDraft());
  assert.equal(r.ok, true);
  assert.equal(r.data.fromName, 'Arjun');
  assert.equal(r.data.subject, 'Quick check-in');
  assert.equal(r.data.previewText, null);
  assert.equal(r.data.ctaRoute, null);
  assert.equal(r.data.ctaLabel, null);
});

test('rejects an empty or missing fromName', () => {
  assert.equal(validateEmailContent(validDraft({ fromName: '' })).ok, false);
  assert.equal(validateEmailContent(validDraft({ fromName: undefined })).ok, false);
  assert.equal(validateEmailContent(validDraft({ fromName: '   ' })).ok, false);
});

test('rejects a fromName over the length limit', () => {
  assert.equal(validateEmailContent(validDraft({ fromName: 'x'.repeat(41) })).ok, false);
  assert.equal(validateEmailContent(validDraft({ fromName: 'x'.repeat(40) })).ok, true);
});

test('rejects a subject that is empty, missing, or too long', () => {
  assert.equal(validateEmailContent(validDraft({ subject: '' })).ok, false);
  assert.equal(validateEmailContent(validDraft({ subject: undefined })).ok, false);
  assert.equal(validateEmailContent(validDraft({ subject: 'x'.repeat(151) })).ok, false);
});

test('rejects control characters / newlines in fromName or subject (header-injection guard)', () => {
  assert.equal(validateEmailContent(validDraft({ subject: 'Hi\r\nBcc: evil@example.com' })).ok, false);
  assert.equal(validateEmailContent(validDraft({ fromName: 'Arjun\nBcc: evil@example.com' })).ok, false);
});

test('rejects "<" or ">" in fromName — it could otherwise break the constructed From header', () => {
  assert.equal(validateEmailContent(validDraft({ fromName: 'Arjun <evil@example.com>' })).ok, false);
  assert.equal(validateEmailContent(validDraft({ fromName: 'Arjun>Bcc:evil@example.com<' })).ok, false);
});

test('rejects a body that is empty, missing, or too long', () => {
  assert.equal(validateEmailContent(validDraft({ body: '' })).ok, false);
  assert.equal(validateEmailContent(validDraft({ body: undefined })).ok, false);
  assert.equal(validateEmailContent(validDraft({ body: 'x'.repeat(4001) })).ok, false);
  assert.equal(validateEmailContent(validDraft({ body: 'x'.repeat(4000) })).ok, true);
});

test('accepts optional preview text within the length limit, rejects over it', () => {
  const ok = validateEmailContent(validDraft({ previewText: 'A short teaser' }));
  assert.equal(ok.ok, true);
  assert.equal(ok.data.previewText, 'A short teaser');
  assert.equal(validateEmailContent(validDraft({ previewText: 'x'.repeat(151) })).ok, false);
});

test('accepts a CTA route from the allowlist paired with a label', () => {
  const r = validateEmailContent(validDraft({ ctaRoute: '/dashboard', ctaLabel: 'Open Arjun' }));
  assert.equal(r.ok, true);
  assert.equal(r.data.ctaRoute, '/dashboard');
  assert.equal(r.data.ctaLabel, 'Open Arjun');
});

test('rejects a CTA route outside the allowlist — no arbitrary internal route, and no external URL', () => {
  assert.equal(validateEmailContent(validDraft({ ctaRoute: '/not-a-real-route', ctaLabel: 'Go' })).ok, false);
  assert.equal(validateEmailContent(validDraft({ ctaRoute: 'https://evil.example.com', ctaLabel: 'Go' })).ok, false);
  assert.equal(validateEmailContent(validDraft({ ctaRoute: 'javascript:alert(1)', ctaLabel: 'Go' })).ok, false);
});

test('rejects a CTA route without a label', () => {
  assert.equal(validateEmailContent(validDraft({ ctaRoute: '/dashboard', ctaLabel: '' })).ok, false);
  assert.equal(validateEmailContent(validDraft({ ctaRoute: '/dashboard' })).ok, false);
});

test('the minimum required routes from the task spec are all in the allowlist', () => {
  for (const route of ['/dashboard', '/mind-journal', '/train', '/coaching', '/account']) {
    assert.ok(CTA_ROUTE_ALLOWLIST.includes(route), `${route} missing from CTA_ROUTE_ALLOWLIST`);
    assert.equal(isValidCtaRoute(route), true);
  }
});

// ── renderBodyHtml — safe formatting, no arbitrary HTML ──────────────────

test('a plain paragraph is wrapped in <p> and escaped', () => {
  const html = renderBodyHtml('Just a normal line of text.');
  assert.match(html, /<p[^>]*>Just a normal line of text\.<\/p>/);
});

test('two blank-line-separated blocks become two paragraphs', () => {
  const html = renderBodyHtml('First paragraph.\n\nSecond paragraph.');
  assert.match(html, /First paragraph\./);
  assert.match(html, /Second paragraph\./);
  assert.equal((html.match(/<p/g) || []).length, 2);
});

test('a "**Heading**" block on its own becomes a bold heading, not a paragraph', () => {
  const html = renderBodyHtml('**Big announcement**');
  assert.match(html, /Big announcement/);
  assert.doesNotMatch(html, /\*\*/);
});

test('a block where every line starts with "- " becomes a bullet list', () => {
  const html = renderBodyHtml('- First thing\n- Second thing\n- Third thing');
  assert.match(html, /<ul/);
  assert.equal((html.match(/<li/g) || []).length, 3);
  assert.match(html, /First thing/);
  assert.doesNotMatch(html, /- First thing/); // the "- " marker itself is stripped
});

test('raw HTML in the body is escaped, never rendered as live markup', () => {
  const html = renderBodyHtml('<script>alert(1)</script> and <img src=x onerror=alert(2)>');
  assert.doesNotMatch(html, /<script>/);
  assert.doesNotMatch(html, /<img/);
  assert.match(html, /&lt;script&gt;/);
});

test('raw HTML inside a bullet list item is also escaped', () => {
  const html = renderBodyHtml('- <b>bold</b> item');
  assert.doesNotMatch(html, /<b>bold<\/b>/);
  assert.match(html, /&lt;b&gt;/);
});

test('raw HTML inside a "**heading**" block is also escaped', () => {
  const html = renderBodyHtml('**<img src=x onerror=alert(1)>**');
  assert.doesNotMatch(html, /<img/);
});

// ── buildCtaUrl — server constructs the full URL, never trusts one ───────

test('builds the full URL by prefixing the route with CLIENT_URL', () => {
  assert.equal(buildCtaUrl('/dashboard'), 'https://arjun.test/dashboard');
});

// ── buildEmailHtml — assembly, greeting, single CTA ───────────────────────

test('greets with the given first name', () => {
  const html = buildEmailHtml({ ...validDraft(), firstName: 'Prabhanshu' });
  assert.match(html, /Hi Prabhanshu,/);
});

test('falls back to "Hi there," when no first name is given', () => {
  const html = buildEmailHtml({ ...validDraft(), firstName: null });
  assert.match(html, /Hi there,/);
});

test('a malicious first name is escaped, not injected raw', () => {
  const html = buildEmailHtml({ ...validDraft(), firstName: '<img src=x onerror=alert(1)>' });
  assert.doesNotMatch(html, /Hi <img/);
  assert.match(html, /Hi &lt;img/);
});

test('renders exactly one CTA link when both route and label are present', () => {
  const html = buildEmailHtml({ ...validDraft({ ctaRoute: '/dashboard', ctaLabel: 'Open Arjun' }), firstName: 'A' });
  const links = html.match(/<a\s/g) || [];
  assert.equal(links.length, 1);
  assert.match(html, /href="https:\/\/arjun\.test\/dashboard"/);
  assert.match(html, />\s*Open Arjun\s*<\/a>/);
});

test('renders no CTA link at all when route/label are absent', () => {
  const html = buildEmailHtml({ ...validDraft(), firstName: 'A' });
  assert.equal((html.match(/<a\s/g) || []).length, 0);
});

test('includes a hidden preheader from previewText when given, nothing when omitted', () => {
  const withPreview = buildEmailHtml({ ...validDraft({ previewText: 'A short teaser' }), firstName: 'A' });
  assert.match(withPreview, /A short teaser/);
  const withoutPreview = buildEmailHtml({ ...validDraft(), firstName: 'A' });
  assert.doesNotMatch(withoutPreview, /display:none/);
});
