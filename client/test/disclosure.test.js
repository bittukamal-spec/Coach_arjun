// Dependency-free source/copy checks for PR-3 (AI disclosure + public
// child-safety statement). Uses only Node's built-in test runner and fs —
// no Jest/Vitest/Playwright, no new dependency. Run with:
//   node --test test/**/*.test.js

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');

const translationsSrc = readFileSync(path.join(root, 'src/i18n/translations.js'), 'utf8');
const authPageSrc = readFileSync(path.join(root, 'src/pages/AuthPage.jsx'), 'utf8');
const onboardingPageSrc = readFileSync(path.join(root, 'src/pages/OnboardingPage.jsx'), 'utf8');
const termsPageSrc = readFileSync(path.join(root, 'src/pages/TermsPage.jsx'), 'utf8');
const landingPageSrc = readFileSync(path.join(root, 'src/pages/LandingPage.jsx'), 'utf8');

// Forbidden claims: no PR should ever say these things about a system that
// doesn't (yet, or ever) do them.
const FORBIDDEN_PHRASES = [
  '24/7 monitoring',
  'monitored 24/7',
  'human reviews every message',
  'a human reads every message',
  'every message is reviewed',
  'professional is always available',
  'guardian is automatically contacted',
  'guardian will be automatically contacted',
  'automatically contacts your guardian',
  'AI can diagnose',
  'diagnoses risk',
];

// ── Translation keys exist (EN + HI) ────────────────────────────────────────

test('translations: auth AI disclosure + safety line exist in English and Hindi', () => {
  // Isolate the `en` and `hi` top-level blocks so we don't just find *a*
  // match anywhere in the file — each language must define its own keys.
  const enBlock = translationsSrc.slice(translationsSrc.indexOf('\n  en: {'), translationsSrc.indexOf('\n  hi: {'));
  const hiBlock = translationsSrc.slice(translationsSrc.indexOf('\n  hi: {'));

  for (const block of [enBlock, hiBlock]) {
    const authNsStart = block.indexOf('auth: {');
    assert.ok(authNsStart !== -1, 'auth namespace not found');
    const authNs = block.slice(authNsStart, block.indexOf('\n    },', authNsStart));
    assert.match(authNs, /aiDisclosure:/, 'auth.aiDisclosure key missing');
    assert.match(authNs, /aiDisclosureSafety:/, 'auth.aiDisclosureSafety key missing');
  }
});

test('translations: onboarding AI disclosure exists in English and Hindi', () => {
  const enBlock = translationsSrc.slice(translationsSrc.indexOf('\n  en: {'), translationsSrc.indexOf('\n  hi: {'));
  const hiBlock = translationsSrc.slice(translationsSrc.indexOf('\n  hi: {'));

  for (const block of [enBlock, hiBlock]) {
    const onboardingNsStart = block.indexOf('onboarding: {');
    assert.ok(onboardingNsStart !== -1, 'onboarding namespace not found');
    const onboardingNs = block.slice(onboardingNsStart, block.indexOf('\n    },', onboardingNsStart));
    assert.match(onboardingNs, /aiDisclosure:/, 'onboarding.aiDisclosure key missing');
  }
});

test('translations: disclosure copy conveys required meaning (EN)', () => {
  assert.match(translationsSrc, /not a human coach, doctor, or therapist/);
  assert.match(translationsSrc, /cannot provide medical care, therapy, or emergency help/);
  assert.match(translationsSrc, /trusted adult/);
});

// ── Signup (AuthPage) references the disclosure keys ────────────────────────

test('AuthPage: renders the AI disclosure and safety line via translation keys, not hard-coded duplicate English', () => {
  assert.match(authPageSrc, /t\.auth\.aiDisclosure\b/);
  assert.match(authPageSrc, /t\.auth\.aiDisclosureSafety\b/);
  // Guard against ever pasting the literal disclosure sentence into JSX
  // instead of using the translation key.
  assert.doesNotMatch(authPageSrc, /not a human coach, doctor, or therapist/);
});

test('AuthPage: disclosure appears only for the signup tab, not sign-in', () => {
  const disclosureIdx = authPageSrc.indexOf('t.auth.aiDisclosure');
  const guard = authPageSrc.lastIndexOf("tab === 'signup'", disclosureIdx);
  assert.ok(guard !== -1 && guard < disclosureIdx, 'disclosure block is not gated behind the signup tab');
});

test('AuthPage: signup still requires DOB, and guardian email only appears for 13-17 (unchanged consent logic)', () => {
  assert.match(authPageSrc, /dateOfBirth: dob/);
  assert.match(authPageSrc, /needsGuardian/);
});

// ── Onboarding step 1 references the disclosure key ─────────────────────────

test('OnboardingPage: step 1 renders the AI disclosure via a translation key, visible without a modal', () => {
  assert.match(onboardingPageSrc, /t\.aiDisclosure\b/);
  assert.doesNotMatch(onboardingPageSrc, /Modal|showModal|isModalOpen/);
});

test('OnboardingPage: still 4 steps (disclosure did not add a new step)', () => {
  assert.match(onboardingPageSrc, /TOTAL_STEPS\s*=\s*4/);
});

// ── Public child-safety statement (TermsPage) ───────────────────────────────

test('TermsPage: has a clearly titled, anchored "AI and Child Safety" section', () => {
  assert.match(termsPageSrc, /id="ai-child-safety"/);
  assert.match(termsPageSrc, /AI and Child Safety/);
});

test('TermsPage: covers the required accurate points without overclaiming', () => {
  assert.match(termsPageSrc, /not.*a human coach, doctor, therapist, or emergency service/);
  assert.match(termsPageSrc, /13–17/);
  assert.match(termsPageSrc, /guardian consent/i);
  assert.match(termsPageSrc, /not.*diagnosis or treatment/);
  assert.match(termsPageSrc, /helpline and support contacts/);
  assert.match(termsPageSrc, /not.*continuously monitored/);
  assert.match(termsPageSrc, /contact a trusted adult or emergency services directly/);
  assert.match(termsPageSrc, /does not use advertising or behavioural tracking/);
  assert.match(termsPageSrc, /request account and data deletion/);
});

test('TermsPage: links to the Privacy Policy from the child-safety section', () => {
  const sectionStart = termsPageSrc.indexOf('id="ai-child-safety"');
  const sectionEnd = termsPageSrc.indexOf('</Section>', sectionStart);
  const section = termsPageSrc.slice(sectionStart, sectionEnd);
  assert.match(section, /navigate\('\/privacy'\)/);
});

test('TermsPage: scrolls to a hash anchor on load (direct navigation support)', () => {
  assert.match(termsPageSrc, /window\.location\.hash/);
  assert.match(termsPageSrc, /scrollIntoView/);
});

test('TermsPage: sections after the new one were renumbered without gaps or duplicates', () => {
  const numbers = [...termsPageSrc.matchAll(/<Section[^>]*title="(\d+)\./g)].map((m) => Number(m[1]));
  assert.deepEqual(numbers, Array.from({ length: numbers.length }, (_, i) => i + 1));
});

// ── Landing-page footer links to the child-safety section ──────────────────

test('LandingPage: footer links to the child-safety anchor', () => {
  assert.match(landingPageSrc, /#ai-child-safety/);
});

// ── No forbidden overclaims anywhere touched by this PR ─────────────────────

test('no forbidden overclaiming phrases were introduced in any touched file', () => {
  const files = { authPageSrc, onboardingPageSrc, termsPageSrc, landingPageSrc, translationsSrc };
  for (const [name, src] of Object.entries(files)) {
    for (const phrase of FORBIDDEN_PHRASES) {
      assert.ok(
        !src.toLowerCase().includes(phrase.toLowerCase()),
        `${name} contains forbidden phrase: "${phrase}"`
      );
    }
  }
});

test('does not claim safety escalation/professional review is already automated', () => {
  assert.doesNotMatch(termsPageSrc, /automatically escalate/i);
  // Must explicitly disclaim being a monitored/reviewed crisis service, never assert it.
  assert.match(termsPageSrc, /not.*a monitored or professionally reviewed crisis service/i);
});
