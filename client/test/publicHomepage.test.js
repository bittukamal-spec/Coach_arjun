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

test('sign-in stays one tap away in the header', () => {
  assert.match(landing, /to="\/auth\?tab=signin"/);
});

test('the short trust tags avoid claims we cannot back', () => {
  assert.deepEqual(site.tags, ['Science-backed', 'Built on sport psychology', 'Private to you', '2-minute reps', 'Talks Hinglish']);
  assert.doesNotMatch(siteText, /made by sport psych|reviewed by a sport psych|used by .*athletes/i);
});

test('photos fall back to a drawing until the founder adds them', () => {
  assert.match(landing, /src="\/photos\/hero\.jpg"/);
  assert.match(bits, /onError=\{\(\) => setFailed\(true\)\}/);
  assert.ok(existsSync(path.join(root, 'public/photos/README.txt')));
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

test('the comparison is honest: in-person sessions win for deep or personal issues', () => {
  const best = site.whyRows.find(r => r.label === 'Best for');
  assert.equal(best.inPerson, 'Deep or personal issues');
});

test('the safety block names the real safeguards', () => {
  const s = site.safePoints.join(' ');
  assert.match(s, /not therapy/);
  assert.match(s, /helplines/);
  assert.match(s, /Under 18/);
});

test('nothing "coming soon" is advertised', () => {
  assert.doesNotMatch(siteText, /coming soon/i);
});

// ── 3. FAQ ──────────────────────────────────────────────────────────────────

test('FAQ covers the questions parents and athletes ask', () => {
  const qs = site.faqs.map(f => f.q);
  for (const q of ['Is Arjun therapy?', 'Does it actually work?', 'Who can see my chats?', 'Is it safe for under-18s?', 'Can I cancel or get a refund?']) {
    assert.ok(qs.includes(q), q);
  }
});

test('the cancel answer matches the implemented cancel-at-period-end behaviour', () => {
  assert.match(payments, /cancel_at_cycle_end: true/);
  assert.match(site.faqs.find(f => f.q.startsWith('Can I cancel')).a, /until the end of the period you paid for/);
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
