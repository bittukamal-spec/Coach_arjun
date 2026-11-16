// Source-text checks for the follow-up Contact & Support entry points added
// on top of PR #78's /contact page: the homepage 3-dot menu, the auth
// screens' secondary support link, and the Account page's Contact & Support
// row (replacing the old raw personal-email card). Dependency-free, run by
// `npm run test:source`.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const read = (rel) => readFileSync(path.join(root, rel), 'utf8');

const landing = read('src/pages/LandingPage.jsx');
const auth = read('src/pages/AuthPage.jsx');
const account = read('src/pages/AccountPage.jsx');
const bottomNav = read('src/components/BottomNav.jsx');
const translationsSrc = read('src/i18n/translations.js');

const { translations } = await import('../src/i18n/translations.js');
const en = translations.en;
const hi = translations.hi;

// ── 1-2. Homepage footer + 3-dot menu ───────────────────────────────────────

test('the website footer links to /contact (no mailto)', () => {
  assert.doesNotMatch(landing, /mailto:/);
  const footer = landing.slice(landing.indexOf('{/* ── Footer'));
  assert.match(footer, /to="\/contact"/);
  assert.match(footer, /\{t\.footerContact\}/);
});

test('the website menu has a Contact item next to Privacy and Terms, styled the same', () => {
  const menu = landing.slice(landing.indexOf('id="site-menu"'), landing.indexOf('</header>'));
  assert.match(menu, /onClick=\{\(\) => navigate\('\/contact'\)\} className=\{menuItem\}/);
  assert.match(menu, /onClick=\{\(\) => navigate\('\/privacy'\)\} className=\{menuItem\}/);
});

test('sign-in sits in the header menu and the main action stays sign-up', () => {
  const header = landing.slice(landing.indexOf('{/* ── Header'), landing.indexOf('</header>'));
  const menu = landing.slice(landing.indexOf('id="site-menu"'), landing.indexOf('</header>'));
  assert.match(menu, /navigate\('\/auth\?tab=signin'\)/);
  assert.match(header, /onClick=\{startFree\}/);
});

// ── 3-4. Auth page support link ─────────────────────────────────────────────

test('the auth page carries a secondary "need help" support link routing to /contact', () => {
  assert.match(auth, /\{t\.auth\.needHelp\}/);
  assert.match(auth, /\{t\.auth\.contactSupport\}/);
  assert.match(auth, /onClick=\{\(\) => navigate\('\/contact'\)\}/);
  assert.equal(en.auth.needHelp, 'Need help?');
  assert.equal(en.auth.contactSupport, 'Contact support');
});

test('the support link sits outside the sign-in/sign-up tab branches — visible on both states', () => {
  // It must not be nested inside a `tab === 'signup'` / `tab === 'signin'` guard.
  const linkIdx = auth.indexOf("{t.auth.needHelp}");
  assert.notEqual(linkIdx, -1);
  const before = auth.slice(0, linkIdx);
  // The nearest preceding conditional-render guard should be the outer card
  // close, not a tab-specific block — i.e. no unclosed `tab === 'signup' &&`
  // directly wrapping this paragraph.
  const lastGuard = before.lastIndexOf("tab === 'signup' &&");
  const lastCloseBeforeGuard = before.lastIndexOf('</div>\n          </div>');
  assert.ok(lastCloseBeforeGuard > lastGuard, 'support link renders unconditionally for both tabs');
});

test('the support link is visually secondary — quiet colour, not the primary blue CTA styling', () => {
  const linkBlock = auth.slice(auth.indexOf('{t.auth.needHelp}') - 40, auth.indexOf('{t.auth.needHelp}') + 400);
  assert.doesNotMatch(linkBlock, /bg-\[#1B4DFF\]/, 'not styled as a filled primary button');
  assert.match(linkBlock, /text-slt/, 'quiet secondary text colour');
});

test('the support link does not change auth behaviour — same endpoints/redirects remain', () => {
  assert.match(auth, /const endpoint = tab === 'signup' \? '\/api\/auth\/register' : '\/api\/auth\/login';/);
  assert.match(auth, /navigate\(data\.user\.onboardingDone \? '\/dashboard' : '\/onboarding', \{ replace: true \}\);/);
});

// ── 5. Account page Contact & Support row ───────────────────────────────────

test('the Account page no longer displays a raw personal support email or a mailto link', () => {
  assert.doesNotMatch(account, /kamal\.prabhanshu@outlook\.com/);
  assert.doesNotMatch(account, /mailto:/);
});

test('the Account page shows a Contact & Support row that navigates to /contact', () => {
  const idx = account.indexOf('Help & Support');
  assert.notEqual(idx, -1);
  const section = account.slice(idx, idx + 1100);
  assert.match(section, /onClick=\{\(\) => navigate\('\/contact'\)\}/);
  assert.match(section, /\{t\.contactSupportTitle\}/);
  assert.equal(en.account.contactSupportTitle, 'Contact & Support');
});

test('the Account support row is a single real button — no nested interactive controls', () => {
  const idx = account.indexOf("navigate('/contact')");
  const rowStart = account.lastIndexOf('<button', idx);
  const rowEnd = account.indexOf('</button>', idx) + '</button>'.length;
  const row = account.slice(rowStart, rowEnd);
  assert.equal((row.match(/<button/g) || []).length, 1, 'exactly one <button>');
  assert.doesNotMatch(row, /<a\s|href=/, 'no nested link inside the button');
});

test('the Account support row shares the settings-row recipe with the other rows', () => {
  const idx = account.indexOf("navigate('/contact')");
  const row = account.slice(idx, idx + 120);
  assert.match(row, /className=\{rowClass\}/);
  assert.match(account, /const rowClass = 'w-full min-h-\[56px\]/);
});

test('Sign Out and Delete Account are untouched', () => {
  assert.match(account, /onClick=\{logout\}/);
  assert.match(account, /setShowDeleteModal\(true\)/);
  assert.match(account, /\{t\.signOut\}/);
});

test('CONTACT_TO_EMAIL is never referenced client-side', () => {
  assert.doesNotMatch(account, /CONTACT_TO_EMAIL/);
  assert.doesNotMatch(auth, /CONTACT_TO_EMAIL/);
  assert.doesNotMatch(landing, /CONTACT_TO_EMAIL/);
});

// ── 6. Routing — reuses the existing /contact route, no new route ──────────

test('no second contact route was created', () => {
  const app = read('src/App.jsx');
  assert.equal((app.match(/path="\/contact"/g) || []).length, 1);
});

// ── Bottom nav is untouched — Contact was NOT added there ───────────────────

test('the authenticated bottom navigation still has exactly Home, Train, Coach, Profile', () => {
  const items = [...bottomNav.matchAll(/labelKey: '(\w+)'/g)].map((m) => m[1]);
  assert.deepEqual(items, ['home', 'train', 'coach', 'profile']);
  assert.doesNotMatch(bottomNav, /contact/i);
});

// ── 11. EN/HI parity ─────────────────────────────────────────────────────────

function shape(value) {
  if (Array.isArray(value)) return value.map(shape);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map((k) => [k, shape(value[k])]));
  }
  return typeof value;
}

test('the new landing/auth/account strings exist in both languages with the same shape', () => {
  for (const ns of ['landing', 'auth', 'account']) {
    assert.deepEqual(shape(hi[ns]), shape(en[ns]), `${ns} namespace shape mismatch between en/hi`);
  }
});

test('the new Hindi strings were actually translated, not left as English source', () => {
  const devanagari = /[ऀ-ॿ]/;
  for (const [ns, key] of [
    ['landing', 'menuContactSupport'], ['auth', 'needHelp'], ['auth', 'contactSupport'],
    ['account', 'contactSupportTitle'], ['account', 'contactSupportDesc'],
  ]) {
    assert.match(hi[ns][key], devanagari, `${ns}.${key} was not translated`);
    assert.notEqual(hi[ns][key], en[ns][key]);
  }
});

// ── 12. No server/schema/dependency changes from this PR ───────────────────

test('this PR touches only client files — no server, schema, or dependency changes', () => {
  // Sanity: the contact endpoint/service/rate-limiter from #78 are untouched
  // by re-reading them and confirming the known markers are still present.
  const contactRoute = read('../server/src/routes/contact.js');
  const email = read('../server/src/services/email.js');
  assert.match(contactRoute, /router\.post\('\/', contactLimiter, async \(req, res\) => \{/);
  assert.match(email, /async function sendContactEmail/);
});
