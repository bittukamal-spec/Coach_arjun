// Source-text checks that the in-app PricingPage matches the live Razorpay
// yearly plan (₹2,499/year, already switched over in Railway's
// RAZORPAY_PLAN_YEARLY — this pass touches presentation only) instead of the
// stale ₹1,999/year copy that predates it.
//
// Dependency-free, run by `npm run test:source`.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const read = (rel) => readFileSync(path.join(root, rel), 'utf8');

const pricingPage = read('src/pages/PricingPage.jsx');
const paymentsRoute = read('../server/src/routes/payments.js');
const translationsSrc = read('src/i18n/translations.js');
const { translations } = await import('../src/i18n/translations.js');
const en = translations.en.pricing;
const hi = translations.hi.pricing;

// The pricing namespace as raw text, per language.
function pricingNamespace(lang) {
  const langIdx = translationsSrc.indexOf(`\n  ${lang}: {`);
  assert.ok(langIdx !== -1, `missing ${lang} translations`);
  const start = translationsSrc.indexOf('pricing: {', langIdx);
  assert.ok(start !== -1, `missing pricing namespace in ${lang}`);
  return translationsSrc.slice(start, translationsSrc.indexOf('\n    },', start));
}
const enBlock = pricingNamespace('en');
const hiBlock = pricingNamespace('hi');

// Forbidden/allowed-price checks run against the actual string VALUES, not
// against the comment explaining the ₹3,588 arithmetic behind the saving.
const stripComments = (src) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
const bothBlocks = stripComments(`${enBlock}\n${hiBlock}`);

// ── 1. Correct amounts ──────────────────────────────────────────────────────

test('monthly price is ₹299/month in both languages', () => {
  assert.equal(en.monthlyPrice, '₹299/month');
  assert.equal(hi.monthlyPrice, '₹299/माह');
});

test('yearly price is ₹2,499/year in both languages', () => {
  assert.equal(en.yearlyPrice, '₹2,499/year');
  assert.equal(hi.yearlyPrice, '₹2,499/वर्ष');
});

test('the monthly-equivalent of the yearly plan is ₹208/month', () => {
  // ₹2,499 / 12 = 208.25 → ₹208 rounded, the only equivalent shown.
  assert.equal(Math.round(2499 / 12), 208);
  assert.equal(en.monthlyEquiv, '₹208/month');
  assert.equal(hi.monthlyEquiv, '₹208/माह');
});

test('the yearly saving is ₹1,089/year, and the arithmetic is correct', () => {
  // ₹299 × 12 = ₹3,588; ₹3,588 − ₹2,499 = ₹1,089 — the only saving claimed.
  assert.equal(299 * 12 - 2499, 1089);
  assert.equal(en.saveYearly, 'Save ₹1,089 a year');
  assert.equal(hi.saveYearly, 'साल में ₹1,089 बचाएं');
});

// ── 2. Old copy is gone ──────────────────────────────────────────────────────

test('the old ₹1,999/year price is gone', () => {
  assert.doesNotMatch(bothBlocks, /1,999|1999/);
  assert.doesNotMatch(pricingPage, /1,999|1999/);
});

test('the old ₹167/month equivalent is gone', () => {
  assert.doesNotMatch(bothBlocks, /₹167/);
  assert.doesNotMatch(pricingPage, /₹167/);
});

test('the old "Save ₹590" claim is gone', () => {
  assert.doesNotMatch(bothBlocks, /₹590|save590/i);
  assert.doesNotMatch(pricingPage, /save590/);
});

test('the "2 months free" claim is gone — the new plan does not bill that way', () => {
  assert.doesNotMatch(bothBlocks, /2 months free|2 महीने मुफ्त|twoMonthsFree/i);
  assert.doesNotMatch(pricingPage, /twoMonthsFree|2 months free/i);
});

test('no other yearly price appears anywhere in the pricing copy', () => {
  const prices = [...bothBlocks.matchAll(/₹[\d,]+/g)].map((m) => m[0]);
  assert.deepEqual([...new Set(prices)].sort(), ['₹1,089', '₹2,499', '₹208', '₹299']);
});

// ── 3. EN/HI numeric parity ──────────────────────────────────────────────────

test('EN and HI carry the identical numeric amounts', () => {
  const nums = (s) => s.match(/[\d,]+/g) ?? [];
  assert.deepEqual(nums(en.monthlyPrice), nums(hi.monthlyPrice));
  assert.deepEqual(nums(en.yearlyPrice), nums(hi.yearlyPrice));
  assert.deepEqual(nums(en.monthlyEquiv), nums(hi.monthlyEquiv));
  assert.deepEqual(nums(en.saveYearly), nums(hi.saveYearly));
});

test('the pricing namespace has the same keys in both languages', () => {
  assert.deepEqual(Object.keys(hi).sort(), Object.keys(en).sort());
  assert.ok(!('save590' in en) && !('save590' in hi), 'stale key removed');
  assert.ok(!('twoMonthsFree' in en) && !('twoMonthsFree' in hi), 'stale key removed');
});

// ── 4. PricingPage renders the renamed key, and only it ─────────────────────

test('PricingPage displays the new saving copy and no longer references the removed keys', () => {
  assert.match(pricingPage, /\{t\.saveYearly\}/);
  assert.doesNotMatch(pricingPage, /t\.save590|t\.twoMonthsFree/);
});

// ── 5. Payment wiring is untouched by this pass ─────────────────────────────

test('subscription creation still reads the plan ID from environment, not a hard-coded value', () => {
  assert.match(paymentsRoute, /process\.env\.RAZORPAY_PLAN_MONTHLY/);
  assert.match(paymentsRoute, /process\.env\.RAZORPAY_PLAN_YEARLY/);
  // No amount, plan ID or secret was hard-coded into the route.
  assert.doesNotMatch(paymentsRoute, /2499|1999|plan_[A-Za-z0-9]{10,}/);
});

test('the CTA wiring — planType, endpoint, Razorpay checkout — is unchanged', () => {
  assert.match(pricingPage, /handleSubscribe\('yearly'\)/);
  assert.match(pricingPage, /handleSubscribe\('monthly'\)/);
  assert.match(pricingPage, /apiFetch\('\/api\/payments\/create-subscription'/);
  assert.match(pricingPage, /body: JSON\.stringify\(\{ planType \}\)/);
  assert.match(pricingPage, /new window\.Razorpay\(options\)/);
});
