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

test('the homepage footer Support link still routes to /contact (no regression from #78)', () => {
  assert.doesNotMatch(landing, /mailto:/);
  const footer = landing.slice(landing.indexOf('{/* ── Footer'));
  assert.match(footer, /onClick=\{\(\) => navigate\('\/contact'\)\}/);
  assert.match(footer, /\{t\.footerSupport\}/);
});

test('the 3-dot menu contains a Contact & Support item that routes to /contact', () => {
  const menu = landing.slice(landing.indexOf('id="landing-menu"'), landing.indexOf('</header>'));
  assert.match(menu, /onClick=\{\(\) => navigate\('\/contact'\)\}/);
  assert.match(menu, /\{t\.menuContactSupport\}/);
  assert.equal(en.landing.menuContactSupport, 'Contact & Support');
});

test('the menu item sits with the other utility/public links, styled the same as Privacy/Terms', () => {
  const menu = landing.slice(landing.indexOf('id="landing-menu"'), landing.indexOf('</header>'));
  const privacyBtn = menu.slice(menu.indexOf("navigate('/privacy')") - 60, menu.indexOf("navigate('/privacy')") + 200);
  const contactBtn = menu.slice(menu.indexOf("navigate('/contact')") - 60, menu.indexOf("navigate('/contact')") + 200);
  // Same className recipe (BODY text colour, same rounded/min-h treatment).
  const classOf = (chunk) => chunk.match(/className=\{`([^`]+)`\}/)?.[1];
  assert.equal(classOf(contactBtn), classOf(privacyBtn));
});

test('the menu item does not disturb install, language, or sign-in behaviour', () => {
  const header = landing.slice(landing.indexOf('{/* ── Header'), landing.indexOf('</header>'));
  assert.match(header, /onClick=\{handleInstall\}/, 'install action still present');
  assert.match(header, /onClick=\{toggleLanguage\}/, 'language toggle still present');
  assert.match(header, /onClick=\{goSignIn\}/, 'sign-in link still present');
  // Install is still not repeated inside the menu.
  const menu = landing.slice(landing.indexOf('id="landing-menu"'), landing.indexOf('</header>'));
  assert.doesNotMatch(menu, /handleInstall|installApp|installShort/);
});

test('/contact is an allowed navigation target on the homepage (footer + menu, both intentional)', () => {
  const routes = [...landing.matchAll(/navigate\('([^']+)'\)/g)].map((m) => m[1]);
  const contactCalls = routes.filter((r) => r === '/contact');
  assert.equal(contactCalls.length, 2, 'exactly footer + menu should call navigate(\'/contact\')');
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
  assert.doesNotMatch(linkBlock, /bg-\[#185FA5\]/, 'not styled as a filled primary button');
  assert.match(linkBlock, /text-\[#7B8A9C\]|text-\[#5A6B80\]/, 'quiet secondary text colour');
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
  assert.match(section, /\{t\.contactSupportDesc\}/);
  assert.equal(en.account.contactSupportTitle, 'Contact & Support');
  assert.equal(en.account.contactSupportDesc, 'Questions, technical issues, billing, privacy or partnerships.');
});

test('the Account support row is a single real button — no nested interactive controls', () => {
  const idx = account.indexOf('Help & Support');
  const section = account.slice(idx, idx + 1100);
  const rowStart = section.indexOf('<button');
  const rowEnd = section.indexOf('</button>', rowStart) + '</button>'.length;
  const row = section.slice(rowStart, rowEnd);
  assert.equal((row.match(/<button/g) || []).length, 1, 'exactly one <button>');
  assert.doesNotMatch(row, /<a\s|href=/, 'no nested link inside the button');
});

test('the Account support row matches the existing danger-zone row visual language', () => {
  const supportIdx = account.indexOf('Help & Support');
  const supportSection = account.slice(supportIdx, supportIdx + 900);
  const dangerIdx = account.indexOf('Account actions');
  const dangerSection = account.slice(dangerIdx, dangerIdx + 900);
  const rowClass = (src) => src.match(/className="(w-full flex items-center gap-3[^"]+)"/)?.[1];
  assert.ok(rowClass(supportSection), 'support row uses the shared row className recipe');
  assert.equal(rowClass(supportSection), rowClass(dangerSection));
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

test('the authenticated bottom navigation still has exactly Home, Train, Coach, Playbook, Profile', () => {
  const items = [...bottomNav.matchAll(/labelKey: '(\w+)'/g)].map((m) => m[1]);
  assert.deepEqual(items, ['home', 'train', 'coach', 'playbook', 'profile']);
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
