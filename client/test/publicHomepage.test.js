// Source-text checks for the public website (Playbook redesign, Nov 2026).
//
// Founder-approved: one main action ("Start free" → sign up), no prices on
// the home page, a Premium box that opens /premium (Free vs Premium) which
// leads to /plans, sport-neutral words, an honest comparison with in-person
// sessions, a light "Is AI coaching safe?" block and research-based FAQs.
// Still guarded: no audio, no fake social proof, no invented results.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const read = (rel) => readFileSync(path.join(root, rel), 'utf8');

const landing = read('src/pages/LandingPage.jsx');
const premium = read('src/pages/site/PremiumPage.jsx');
const plans = read('src/pages/site/PlansPage.jsx');
const bits = read('src/components/site/SiteBits.jsx');
const planConst = read('src/constants/plans.js');
const translationsSrc = read('src/i18n/translations.js');
const app = read('src/App.jsx');
const payments = read('../server/src/routes/payments.js');

const { translations } = await import('../src/i18n/translations.js');
const site = translations.en.site;
const siteText = JSON.stringify(site, (k, v) => (typeof v === 'function' ? v('X', 'Y') : v));

// ── 1. Hero and main action ─────────────────────────────────────────────────

test('hero headline is the approved line and there is exactly one h1', () => {
  assert.equal(site.heroTitle, 'Train your mind like a pro.');
  assert.equal((landing.match(/<h1\b/g) || []).length, 1);
});

test('the main action is Start free, which opens sign-up', () => {
  assert.equal(site.startFree, 'Start free');
  assert.match(landing, /const startFree = \(\) => navigate\('\/auth\?tab=signup'\);/);
  assert.match(landing, /onClick=\{startFree\}/);
});

test('sign-in is in the header menu (no separate header button)', () => {
  assert.match(landing, /onClick=\{\(\) => navigate\('\/auth\?tab=signin'\)\} className=\{menuItem\}/);
  assert.doesNotMatch(landing, /<Link to="\/auth\?tab=signin"/);
});

test('the five icon tags avoid claims we cannot back', () => {
  assert.deepEqual(site.tags.map(t => t.label), ['Science backed', 'Any sport', '2-minute reps', 'Private to you', 'English & Hinglish']);
  assert.doesNotMatch(siteText, /made by sport psych|reviewed by a sport psych|used by .*athletes/i);
});

test('the hero is the app on a phone, rotating through three real screens', () => {
  assert.match(landing, /<PhoneFrame maxWidth=\{250\} share=\{0\.56\}>\{heroScreens\[screen\]\}<\/PhoneFrame>/);
  assert.match(landing, /prefers-reduced-motion: reduce/);
  assert.match(landing, /onClick=\{\(\) => \{ setScreen\(n\); setPaused\(true\); \}\}/);
});

test('the final section shows a real app screenshot on a phone, not a stock photo', () => {
  assert.match(landing, /aria-label=\{t\.finalPhotoAlt\}/);
  assert.match(landing, /<RealScreen \{\.\.\.SCREENS\.coach\} \/>/);
  assert.doesNotMatch(landing, /\/photos\//);
});

test('the Say hi pill is see-through so it never hides the phone screen', () => {
  assert.match(landing, /bg-brand-500\/55 [^"]*backdrop-blur-md/);
});

// ── 2. Content stays honest ─────────────────────────────────────────────────

test('words are sport-neutral — no single-sport jargon', () => {
  assert.doesNotMatch(siteText, /\b(over|bat|batting|wicket|innings|bowl(?:er|ing)?)\b/i);
});

test('no audio, fake social proof or invented results', () => {
  assert.doesNotMatch(siteText, /audio|voice note|podcast|listen/i);
  assert.doesNotMatch(siteText, /\d+\s*%\s*(faster|better|more|improve)|testimonial|★|rated \d/i);
});

test('no prices on the home page — prices live only on /premium and /plans', () => {
  assert.doesNotMatch(landing, /₹|PLAN_PRICES|constants\/plans/);
  assert.match(landing, /to="\/premium"/);
  assert.match(premium, /to="\/plans"/);
});

test('the tick table is honest: in person wins for deep personal problems', () => {
  const row = site.whyRows.find(r => r.label === 'Deep personal problems');
  assert.equal(row.arjun, false);
  assert.equal(row.inPerson, true);
});

test('the safety block names the real safeguards', () => {
  const s = site.safePoints.map(p => `${p.title} ${p.text}`).join(' ');
  // Founder decision (Nov 2026): positive marketing lines; helplines are not
  // advertised here (they still appear in the app whenever needed).
  assert.match(s, /sport science/);
  assert.match(s, /Under 18/);
  assert.match(s, /private/);
});

test('nothing "coming soon" is advertised', () => {
  assert.doesNotMatch(siteText, /coming soon/i);
});

// ── 3. FAQ ──────────────────────────────────────────────────────────────────

test('FAQ covers the questions parents and athletes ask', () => {
  const qs = site.faqs.map(f => f.q);
  for (const q of ['Is Arjun therapy?', 'Does it actually work?', 'Who can see my chats?', 'Is it safe for under-18s?', 'Can I cancel?']) {
    assert.ok(qs.includes(q), q);
  }
});

test('the cancel answer matches the implemented cancel-at-period-end behaviour', () => {
  assert.match(payments, /cancel_at_cycle_end: true/);
  assert.match(site.faqs.find(f => f.q === 'Can I cancel?').a, /until the end of the period you paid for/);
});

test('FAQ rows are an accessible accordion', () => {
  assert.match(landing, /aria-expanded=\{open\}/);
  assert.match(landing, /aria-controls=\{`faq-\$\{i\}`\}/);
  assert.match(landing, /id=\{`faq-\$\{i\}`\}/);
});

// ── 4. Premium and plans ────────────────────────────────────────────────────

test('prices come from one place: monthly ₹500, yearly ₹2,500', () => {
  assert.match(planConst, /monthly: 500,/);
  assert.match(planConst, /yearly: 2500,/);
  for (const src of [premium, plans]) assert.doesNotMatch(src, /₹\d/);
});

test('yearly is chosen by default and shows its saving', () => {
  assert.match(plans, /useState\('yearly'\)/);
  assert.match(plans, /yearlyBadge\(yearlySavingPct\(\)\)/);
});

test('the Free vs Premium table names benefits, not feature names', () => {
  const labels = site.premiumRows.map(r => r.label).join(' ');
  assert.doesNotMatch(labels, /Pressure Reset|Quick Rep|Focus Card|Ritual/);
});

test('premium and plans pages lead to sign-up — no invented checkout', () => {
  assert.match(premium, /navigate\('\/auth\?tab=signup'\)/);
  assert.match(plans, /navigate\(`\/auth\?tab=signup&plan=\$\{plan\}`\)/);
  assert.doesNotMatch(premium + plans, /razorpay|create-subscription/i);
});

// ── 5. Routes, footer and scope ─────────────────────────────────────────────

test('App renders the website at /, and /premium and /plans are public', () => {
  assert.match(app, /<Route path="\/premium" element=\{<PremiumPage \/>\} \/>/);
  assert.match(app, /<Route path="\/plans" element=\{<PlansPage \/>\} \/>/);
  assert.match(app, /path="\/auth"/);
});

test('the footer keeps every policy link, including child safety', () => {
  for (const to of ['/privacy', '/terms', '/terms#ai-child-safety', '/refund', '/contact']) {
    assert.ok(landing.includes(`to="${to}"`), to);
  }
});

test('the website calls no API', () => {
  assert.doesNotMatch(landing + premium + plans, /apiFetch|fetch\(/);
});

test('the old website pieces are gone', () => {
  assert.ok(!existsSync(path.join(root, 'src/components/landing')));
  assert.ok(translationsSrc.includes('site: {'));
});

test('small text matches the hero line and Start for free is its own section', () => {
  assert.match(landing, /const BODY = 'text-\[15px\] leading-relaxed text-slt';/);
  assert.match(landing, /data-testid="site-free-section"/);
  assert.deepEqual(site.freePoints, ['14 days free', 'Cancel anytime']);
});
