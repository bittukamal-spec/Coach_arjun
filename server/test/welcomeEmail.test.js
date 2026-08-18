// Focused tests for sendWelcomeEmail() in services/email.js. The 'resend'
// package is replaced in the require cache with an in-memory fake before
// email.js is loaded, so these tests never touch the network and never
// send a real email — same require-cache technique contact.test.js uses
// for route modules, applied here one level down at the dependency itself.

const test = require('node:test');
const assert = require('node:assert/strict');

const resendPath = require.resolve('resend');
const sentEmails = [];

class FakeResend {
  constructor(apiKey) {
    this.apiKey = apiKey;
  }
  get emails() {
    return {
      send: async (payload) => {
        sentEmails.push(payload);
        return { data: { id: 'fake-email-id' }, error: null };
      },
    };
  }
}

require.cache[resendPath] = {
  id: resendPath,
  filename: resendPath,
  loaded: true,
  exports: { Resend: FakeResend },
};

process.env.RESEND_API_KEY = process.env.RESEND_API_KEY || 'test-key';
process.env.RESEND_FROM_EMAIL = process.env.RESEND_FROM_EMAIL || 'noreply@example.test';
process.env.CLIENT_URL = process.env.CLIENT_URL || 'https://arjun.test';

// Force a fresh load of email.js under this file's mocked 'resend' entry —
// other test files run in their own process, so this only affects this file.
const emailPath = require.resolve('../src/services/email');
delete require.cache[emailPath];
const { sendWelcomeEmail } = require(emailPath);

test.beforeEach(() => {
  sentEmails.length = 0;
});

async function sendAndCapture(toEmail, name) {
  await sendWelcomeEmail(toEmail, name);
  assert.equal(sentEmails.length, 1, 'expected exactly one email to be sent');
  return sentEmails[0];
}

// ── Name → greeting derivation ──────────────────────────────────────────────

test('a full name greets with just the first name', async () => {
  const { html } = await sendAndCapture('a@example.com', 'Prabhanshu Kamal');
  assert.match(html, /Hi Prabhanshu,/);
});

test('a single-word name greets with that name', async () => {
  const { html } = await sendAndCapture('a@example.com', 'Prabhanshu');
  assert.match(html, /Hi Prabhanshu,/);
});

test('leading/trailing whitespace around the name does not affect the greeting', async () => {
  const { html } = await sendAndCapture('a@example.com', '  Prabhanshu Kamal  ');
  assert.match(html, /Hi Prabhanshu,/);
});

test('a missing/empty name falls back to "Hi there,"', async () => {
  const { html } = await sendAndCapture('a@example.com', '');
  assert.match(html, /Hi there,/);
});

// ── HTML escaping (the fixed blocker) ───────────────────────────────────────

test('a malicious name is HTML-escaped, not injected raw', async () => {
  const { html } = await sendAndCapture('a@example.com', '<img src=x onerror=alert(1)>');
  // The derived first name (text up to the first space) is "<img" — the raw,
  // unescaped tag-opener must never appear in the greeting...
  assert.doesNotMatch(html, /Hi <img/);
  // ...only its escaped form should.
  assert.match(html, /Hi &lt;img,/);
});

test('a malicious name with no internal spaces is fully escaped end to end', async () => {
  const malicious = '<script>alert(1)</script>';
  const { html } = await sendAndCapture('a@example.com', malicious);
  assert.ok(!html.includes(malicious), 'raw script tag must not appear in the email HTML');
  assert.ok(
    html.includes('&lt;script&gt;alert(1)&lt;/script&gt;'),
    'escaped script tag should appear in place of the raw name'
  );
});

// ── Content contract ─────────────────────────────────────────────────────────

test('the subject is exactly the new transactional subject line', async () => {
  const { subject } = await sendAndCapture('a@example.com', 'Prabhanshu');
  assert.equal(subject, 'Welcome to Arjun — your account is ready');
});

test('exactly one "Open Arjun" CTA link is present', async () => {
  const { html } = await sendAndCapture('a@example.com', 'Prabhanshu');
  // "Open Arjun" also opens the required one-line explainer sentence, so
  // count anchor elements (the actual CTA), not the bare substring.
  const links = html.match(/<a\s/g) || [];
  assert.equal(links.length, 1, 'expected exactly one <a> element in the email');
  assert.match(html, /<a[^>]*>\s*Open Arjun\s*<\/a>/);
});

test('old marketing/promotional copy is absent', async () => {
  const { html } = await sendAndCapture('a@example.com', 'Prabhanshu');
  assert.doesNotMatch(html, /14 days/i);
  assert.doesNotMatch(html, /free access/i);
  assert.doesNotMatch(html, /Start Training/i);
  assert.doesNotMatch(html, /first 3 steps/i);
});

// ── Delivery invocation ──────────────────────────────────────────────────────

test('Resend is invoked exactly once with the expected recipient', async () => {
  const payload = await sendAndCapture('athlete@example.com', 'Prabhanshu');
  assert.equal(payload.to, 'athlete@example.com');
  assert.equal(sentEmails.length, 1);
});

test('no real network call is made — delivery goes through the in-memory fake only', async () => {
  await sendAndCapture('a@example.com', 'Prabhanshu');
  assert.ok(require.cache[resendPath].exports.Resend === FakeResend);
});
