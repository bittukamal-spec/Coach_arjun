// The public auth screens (create account + sign in) were restyled to match
// the new light homepage. This is a VISUAL change only, so these checks do two
// things: prove the light system is actually applied, and prove that nothing
// about authentication — fields, validation, endpoints, the guardian/minor
// branch, redirects or routes — moved while it was applied.
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

const auth = read('src/pages/AuthPage.jsx');
const app = read('src/App.jsx');
const translationsSrc = read('src/i18n/translations.js');
const { translations } = await import('../src/i18n/translations.js');

// ── 1. Light theme, matching the homepage ───────────────────────────────────

test('the auth page is a light surface, not the old dark shell', () => {
  assert.match(auth, /bg-\[#FAFBFD\]/, 'same canvas as the landing page');
  assert.match(auth, /text-\[#0F172A\]/, 'dark navy typography');
  assert.doesNotMatch(auth, /bg-dark-\d|text-ink|text-slt|text-muted|shadow-2xl/,
    'no themed dark-shell tokens remain');
  assert.doesNotMatch(auth, /blur-2xl/, 'the dark-page glow is gone');
});

test('it uses the homepage visual language — Arjun mark, blue CTA, soft outlines', () => {
  assert.match(auth, /import \{ ArjunWordmark \}/);
  assert.match(auth, /<ArjunWordmark size="hero"/);
  assert.match(auth, /bg-\[#185FA5\]/, 'Arjun-blue primary action');
  assert.match(auth, /rounded-3xl border border-\[#E4E9F2\] bg-white/, 'rounded white form card');
  assert.match(auth, /border-\[#D9E1EC\]/, 'cool-grey outlined inputs');
});

test('controls clear the 44px touch target and inputs are not tiny', () => {
  assert.match(auth, /min-h-\[48px\]/, 'inputs are 48px tall');
  assert.match(auth, /min-h-\[54px\] w-full/, 'the primary button is full width and 54px tall');
  assert.match(auth, /min-h-\[44px\] flex-1/, 'the tab controls are 44px tall');
});

test('both screens carry their own heading and one short line', () => {
  const { auth: a } = translations.en;
  assert.equal(a.signinHeading, 'Welcome back');
  assert.equal(a.signinSub, 'Sign in to continue with Arjun.');
  assert.equal(a.signupHeading, 'Start training your mind');
  assert.equal(a.signupSub, 'Create your Arjun account.');
  assert.match(auth, /tab === 'signup' \? t\.auth\.signupHeading : t\.auth\.signinHeading/);
  assert.match(auth, /tab === 'signup' \? t\.auth\.signupSub : t\.auth\.signinSub/);
  // Cross-links between the two screens.
  assert.match(auth, /t\.auth\.haveAccount/);
  assert.match(auth, /t\.auth\.noAccount/);
  assert.match(auth, /t\.auth\.forgotPassword/);
});

test('the new auth strings exist in English and Hindi', () => {
  const enBlock = translationsSrc.slice(translationsSrc.indexOf('\n  en: {'), translationsSrc.indexOf('\n  hi: {'));
  const hiBlock = translationsSrc.slice(translationsSrc.indexOf('\n  hi: {'));
  for (const block of [enBlock, hiBlock]) {
    const ns = block.slice(block.indexOf('auth: {'), block.indexOf('\n    },', block.indexOf('auth: {')));
    for (const key of ['signinHeading', 'signinSub', 'signupHeading', 'signupSub', 'forgotPassword', 'haveAccount', 'noAccount']) {
      assert.match(ns, new RegExp(`${key}:`), `auth.${key} missing`);
    }
  }
  for (const key of ['signinHeading', 'signupHeading', 'forgotPassword', 'haveAccount', 'noAccount']) {
    assert.notEqual(translations.hi.auth[key], translations.en.auth[key], `auth.${key} was not translated`);
  }
});

// ── 2. Nothing about authentication moved ───────────────────────────────────

test('the endpoints, payload and redirect are unchanged', () => {
  assert.match(auth, /const endpoint = tab === 'signup' \? '\/api\/auth\/register' : '\/api\/auth\/login';/);
  assert.match(auth, /name: name\.trim\(\), email: email\.trim\(\), password, dateOfBirth: dob,/);
  assert.match(auth, /\.\.\.\(needsGuardian && \{ guardianEmail: guardianEmail\.trim\(\) \}\),/);
  assert.match(auth, /loginWithUser\(data\.token, data\.user\);/);
  assert.match(auth, /navigate\(data\.user\.onboardingDone \? '\/dashboard' : '\/onboarding', \{ replace: true \}\);/);
});

test('the guardian / minor logic is untouched', () => {
  assert.match(auth, /const isUnderage = signupAge !== null && signupAge < 13;/);
  assert.match(auth, /const needsGuardian = signupAge !== null && signupAge >= 13 && signupAge < 18;/);
  assert.match(auth, /if \(tab === 'signup' && isUnderage\) \{\s*setError\(t\.auth\.underageError\);/);
  assert.match(auth, /disabled=\{busy \|\| \(tab === 'signup' && isUnderage\)\}/);
  assert.match(auth, /\{t\.auth\.guardianEmailLabel\}/);
  assert.match(auth, /\{t\.auth\.guardianEmailHint\}/);
});

test('every required field is still present, with its autocomplete and type', () => {
  for (const field of [
    /type="text" value=\{name\}/,
    /type="date" value=\{dob\}/,
    /type="email" value=\{guardianEmail\}/,
    /type="email" value=\{email\}/,
    /type="password" value=\{password\}/,
  ]) assert.match(auth, field);
  assert.equal((auth.match(/required/g) || []).length, 5, 'all five inputs stay required');
  assert.match(auth, /autoComplete=\{tab === 'signup' \? 'new-password' : 'current-password'\}/);
  assert.match(auth, /max=\{new Date\(\)\.toISOString\(\)\.slice\(0, 10\)\}/);
});

test('the AI disclosure and legal links stay on the signup screen', () => {
  assert.match(auth, /\{t\.auth\.aiDisclosure\}/);
  assert.match(auth, /\{t\.auth\.aiDisclosureSafety\}/);
  assert.match(auth, /navigate\('\/terms'\)/);
  assert.match(auth, /navigate\('\/privacy'\)/);
  assert.match(auth, /navigate\('\/forgot-password'\)/);
});

test('the routes into and out of auth are unchanged', () => {
  assert.match(auth, /searchParams\.get\('tab'\) === 'signin' \? 'signin' : 'signup'/);
  assert.match(app, /<Route path="\/auth" element=\{user \? <Navigate to="\/dashboard" replace \/> : <AuthPage \/>\} \/>/);
  assert.match(app, /<Route path="\/forgot-password" element=\{<ForgotPasswordPage \/>\} \/>/);
});

test('the auth page still talks to the API through the shared client', () => {
  assert.match(auth, /import \{ apiFetch \} from '\.\.\/api';/);
  assert.match(auth, /await apiFetch\(endpoint, \{/);
  assert.doesNotMatch(auth, /fetch\(['"`]http/, 'no direct network call was introduced');
});
