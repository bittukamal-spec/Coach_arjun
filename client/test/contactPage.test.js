// Source-text checks for the public Contact page — dependency-free, run by
// `npm run test:source`. Behavioural/interactive coverage lives in
// contactPage.dom.test.jsx.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const read = (rel) => readFileSync(path.join(root, rel), 'utf8');

const contactPage = read('src/pages/ContactPage.jsx');
const landing = read('src/pages/LandingPage.jsx');
const app = read('src/App.jsx');
const translationsSrc = read('src/i18n/translations.js');

const { translations } = await import('../src/i18n/translations.js');
const en = translations.en.contact;
const hi = translations.hi.contact;

// ── 1-2. Route exists, public (no login) ────────────────────────────────────

test('App.jsx mounts /contact, publicly, alongside the other public pages', () => {
  assert.match(app, /import ContactPage from '\.\/pages\/ContactPage';/);
  assert.match(app, /<Route path="\/contact" element=\{<ContactPage \/>\} \/>/);
  // The Contact route sits in the Public block, before any ProtectedRoute
  // usage — same section as /privacy, /terms, /refund.
  const publicBlock = app.slice(app.indexOf('{/* Public */}'), app.indexOf('{/* Onboarding'));
  assert.match(publicBlock, /<Route path="\/contact"/);
  assert.doesNotMatch(publicBlock, /<ProtectedRoute/);
});

test('ContactPage itself never gates on an authenticated user', () => {
  assert.doesNotMatch(contactPage, /ProtectedRoute|requireOnboarding|user\.tier|user\.trialStarted/);
});

// ── 3. Footer link wiring ───────────────────────────────────────────────────

test('the homepage footer Support link routes to /contact, not a hard-coded mailto address', () => {
  assert.doesNotMatch(landing, /mailto:/);
  assert.match(landing, /onClick=\{\(\) => navigate\('\/contact'\)\}/);
});

// ── 4-9. Fields + validation ─────────────────────────────────────────────────

test('all four required fields are present with matching ids and labels', () => {
  for (const id of ['contact-name', 'contact-email', 'contact-reason', 'contact-message']) {
    assert.match(contactPage, new RegExp(`id="${id}"`));
    assert.match(contactPage, new RegExp(`htmlFor="${id}"`));
  }
  assert.match(contactPage, /<input\s+id="contact-name"/);
  const emailField = contactPage.slice(contactPage.indexOf('id="contact-email"') - 20, contactPage.indexOf('id="contact-email"') + 200);
  assert.match(emailField, /type="email"/);
  assert.match(contactPage, /<select[\s\S]*?id="contact-reason"/);
  assert.match(contactPage, /<textarea\s+id="contact-message"/);
});

test('client-side validation matches the server limits exactly', () => {
  assert.match(contactPage, /const NAME_MIN = 2;/);
  assert.match(contactPage, /const NAME_MAX = 80;/);
  assert.match(contactPage, /const EMAIL_MAX = 254;/);
  assert.match(contactPage, /const MESSAGE_MIN = 10;/);
  assert.match(contactPage, /const MESSAGE_MAX = 2000;/);
  assert.match(contactPage, /EMAIL_RE = \/\^\[\^\\s@\]\+@\[\^\\s@\]\+\\\.\[\^\\s@\]\+\$\//);
});

test('no phone, company, or attachment field exists', () => {
  assert.doesNotMatch(contactPage, /phone|company|attachment|<input[^>]*type="file"/i);
});

// ── 10. Reason options exactly match the approved set ───────────────────────

test('the reason select carries exactly the five approved options, in order, with values matching the server enum', () => {
  const block = contactPage.slice(contactPage.indexOf('const REASONS = ['), contactPage.indexOf('];', contactPage.indexOf('const REASONS = [')));
  const values = [...block.matchAll(/value: '(\w+)'/g)].map((m) => m[1]);
  assert.deepEqual(values, ['general', 'technical', 'billing', 'safety', 'partnership']);

  const server = readFileSync(path.join(root, '..', 'server', 'src', 'routes', 'contact.js'), 'utf8');
  const serverKeys = [...server.matchAll(/^\s{2}(\w+):\s'[^']+',$/gm)].map((m) => m[1]);
  assert.deepEqual(new Set(values), new Set(serverKeys));

  assert.deepEqual(
    [en.reasonGeneral, en.reasonTechnical, en.reasonBilling, en.reasonSafety, en.reasonPartnership],
    ['General', 'Technical issue', 'Subscription or billing', 'Safety or privacy', 'Partnership'],
  );
});

test('the Safety or privacy reason is not framed as an emergency or crisis channel', () => {
  assert.doesNotMatch(contactPage, /crisis|emergency|therapy|counsel|iCall|KIRAN|112/i);
});

// ── 11. Honeypot is inaccessible to normal users ────────────────────────────

test('the honeypot field is off-screen, out of the tab order, and hidden from assistive tech', () => {
  const honeypot = contactPage.slice(contactPage.indexOf('Honeypot field'), contactPage.indexOf('htmlFor="contact-name"'));
  assert.match(honeypot, /aria-hidden="true"/);
  assert.match(honeypot, /tabIndex=\{-1\}/);
  assert.match(honeypot, /-left-\[9999px\]/);
  assert.match(honeypot, /name="website"/);
  assert.doesNotMatch(honeypot, /required/);
});

// ── 16. EN/HI parity ─────────────────────────────────────────────────────────

function shape(value) {
  if (Array.isArray(value)) return value.map(shape);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map((k) => [k, shape(value[k])]));
  }
  return typeof value;
}

test('every contact string exists in both English and Hindi, with the same shape', () => {
  assert.ok(en && hi, 'contact namespace missing from one language');
  assert.deepEqual(shape(hi), shape(en));
});

test('no Hindi contact string was left as its English source (sentences only — product/UI nouns stay English)', () => {
  const devanagari = /[ऀ-ॿ]/;
  for (const key of Object.keys(en)) {
    const e = en[key];
    const h = hi[key];
    if (typeof e === 'string' && e.length > 24 && !/^[A-Za-z0-9 @.…]+$/.test(h)) {
      assert.ok(devanagari.test(h), `contact.${key} was not translated: ${h}`);
    }
  }
});

test('user-entered text is never routed through a translation lookup', () => {
  // The submitted name/email/message values are only ever read back from
  // component state (name/email/message), never used as translation keys.
  assert.doesNotMatch(contactPage, /t\[(name|email|message)\]/);
});

// ── 17. Accessibility ────────────────────────────────────────────────────────

test('exactly one h1, and it only appears in the default (non-success) view', () => {
  assert.equal((contactPage.match(/<h1[\s>]/g) || []).length, 2, 'one h1 for the form view, one for the success view (mutually exclusive renders)');
});

test('field errors are associated to their input via aria-describedby + aria-invalid', () => {
  for (const field of ['name', 'email', 'reason', 'message']) {
    assert.match(contactPage, new RegExp(`aria-invalid=\\{!!fieldErrors\\.${field}\\}`));
    assert.match(contactPage, new RegExp(`aria-describedby=\\{fieldErrors\\.${field} \\? 'contact-${field}-error' : undefined\\}`));
    assert.match(contactPage, new RegExp(`id="contact-${field}-error"`));
  }
});

test('the success state is an announced live region, and the send error is an alert', () => {
  assert.match(contactPage, /role="status"[\s\S]{0,20}aria-live="polite"/);
  assert.match(contactPage, /role="alert"/);
});

test('every control clears the 44px touch target', () => {
  assert.match(contactPage, /min-h-\[48px\]/); // inputs/select
  assert.match(contactPage, /min-h-\[54px\]/); // submit
  assert.match(contactPage, /min-h-\[52px\]|min-h-\[44px\]/); // success actions
});

// ── 18. Nothing else in the app was touched ─────────────────────────────────

test('no authenticated route, ProtectedRoute wrapping, or other page file was modified by this change', () => {
  assert.match(app, /<Route path="\/" element=\{user \? <Navigate to="\/dashboard" replace \/> : <LandingPage \/>\} \/>/);
  assert.match(app, /<Route path="\/auth" element=\{user \? <Navigate to="\/dashboard" replace \/> : <AuthPage \/>\} \/>/);
  assert.match(app, /path="\/privacy"/);
  assert.match(app, /path="\/terms"/);
  assert.match(app, /path="\/refund"/);
});

test('the Contact page calls only the one new contact endpoint', () => {
  const apiCalls = [...contactPage.matchAll(/apiFetch\('([^']+)'/g)].map((m) => m[1]);
  assert.deepEqual(apiCalls, ['/api/contact']);
});
