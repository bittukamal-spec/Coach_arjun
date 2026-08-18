// Focused tests for sendGuardianConsentEmail() in services/email.js. The
// 'resend' package is replaced in the require cache with an in-memory fake
// before email.js is loaded, so these tests never touch the network and
// never send a real email — same technique as welcomeEmail.test.js, applied
// one level down at the dependency itself.

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

// Force a fresh load of email.js under this file's mocked 'resend' entry —
// other test files run in their own process, so this only affects this file.
const emailPath = require.resolve('../src/services/email');
delete require.cache[emailPath];
const { sendGuardianConsentEmail } = require(emailPath);

test.beforeEach(() => {
  sentEmails.length = 0;
});

const CONSENT_URL = 'https://arjun.test/guardian-consent?token=abc123token';

async function sendAndCapture(toEmail, athleteName, consentUrl = CONSENT_URL) {
  await sendGuardianConsentEmail(toEmail, athleteName, consentUrl);
  assert.equal(sentEmails.length, 1, 'expected exactly one email to be sent');
  return sentEmails[0];
}

// ── Name → greeting derivation ──────────────────────────────────────────────

test('a normal single-word athlete name appears in the body', async () => {
  const { html } = await sendAndCapture('guardian@example.com', 'Prabhanshu');
  assert.match(html, />Prabhanshu<\/strong> has created an account/);
});

test('a multi-word athlete name uses just the first name', async () => {
  const { html } = await sendAndCapture('guardian@example.com', 'Prabhanshu Kamal');
  assert.match(html, />Prabhanshu<\/strong> has created an account/);
  assert.match(html, /Because Prabhanshu is under 18/);
  assert.match(html, /Prabhanshu's coaching tools will stay locked/);
});

// Note: firstName here is `athleteName.split(' ')[0]` with no `.trim()` call
// (unlike sendWelcomeEmail) — a pre-existing derivation quirk this PR does
// not touch (see "do not change guardian-consent behavior"). In production
// athleteName is always the already-trimmed `user.name` from registration
// (auth.js does `name: name.trim()`), so trailing whitespace is the
// realistic case to exercise here.
test('trailing whitespace after the name does not break the greeting', async () => {
  const { html } = await sendAndCapture('guardian@example.com', 'Prabhanshu Kamal  ');
  assert.match(html, />Prabhanshu<\/strong> has created an account/);
});

test('a missing athlete name falls back to "your child"', async () => {
  const { html } = await sendAndCapture('guardian@example.com', '');
  assert.match(html, />your child<\/strong> has created an account/);
});

// ── HTML escaping (the fixed gap) ───────────────────────────────────────────

test('a malicious name with a space is HTML-escaped, not injected raw', async () => {
  const { html } = await sendAndCapture('guardian@example.com', '<img src=x onerror=alert(1)>');
  // The derived first name (text up to the first space) is "<img" — the
  // raw, unescaped tag-opener must never appear in the body...
  assert.doesNotMatch(html, />\s*<img/);
  // ...only its escaped form should, in all three interpolation sites.
  assert.match(html, /&lt;img<\/strong> has created an account/);
  assert.match(html, /Because &lt;img is under 18/);
  assert.match(html, /&lt;img's coaching tools will stay locked/);
});

test('a malicious name with no internal spaces is fully escaped end to end', async () => {
  const malicious = '<script>alert(1)</script>';
  const { html } = await sendAndCapture('guardian@example.com', malicious);
  assert.ok(!html.includes(malicious), 'raw script tag must not appear in the email HTML');
  assert.ok(
    html.includes('&lt;script&gt;alert(1)&lt;/script&gt;'),
    'escaped script tag should appear in place of the raw name'
  );
});

// ── Contract preserved (subject / link / token / recipient) ────────────────

test('subject still uses the raw first name (header text, not HTML)', async () => {
  const { subject } = await sendAndCapture('guardian@example.com', 'Prabhanshu Kamal');
  assert.equal(subject, 'Prabhanshu needs your permission to use Arjun');
});

test('the consent link is preserved verbatim, including the token', async () => {
  const consentUrl = 'https://arjun.test/guardian-consent?token=some-real-token-value';
  const { html } = await sendAndCapture('guardian@example.com', 'Prabhanshu', consentUrl);
  assert.match(html, new RegExp(`<a href="${consentUrl.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}"`));
});

test('Resend is invoked exactly once with the expected guardian recipient', async () => {
  const payload = await sendAndCapture('guardian@example.com', 'Prabhanshu');
  assert.equal(payload.to, 'guardian@example.com');
  assert.equal(sentEmails.length, 1);
});

test('no real network call is made — delivery goes through the in-memory fake only', async () => {
  await sendAndCapture('guardian@example.com', 'Prabhanshu');
  assert.ok(require.cache[resendPath].exports.Resend === FakeResend);
});
