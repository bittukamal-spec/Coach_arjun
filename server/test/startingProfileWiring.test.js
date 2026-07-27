// Wiring + de-duplication guarantees for the Starting Performance Profile
// (PR 3). Source-level assertions in the repo's established style, covering
// the one place the profile enters coaching context, the retirement of the old
// profileIntro AI surface, the client flow, and the additive schema.

const test = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const path = require('node:path');

const serverSrc = (p) => readFileSync(path.join(__dirname, '../src', p), 'utf8');
const clientSrc = (p) => readFileSync(path.join(__dirname, '../../client/src', p), 'utf8');

const chat = serverSrc('routes/chat.js');
const profileIntro = serverSrc('routes/profileIntro.js');
const schema = readFileSync(path.join(__dirname, '../prisma/schema.prisma'), 'utf8');

// ── One interpretation reaches coaching ─────────────────────────────────────

test('the confirmed starting profile is injected into the main-chat system prompt as the primary context', () => {
  assert.match(chat, /## Confirmed Starting Profile \(athlete-reviewed — primary context\)/);
  assert.match(chat, /\$\{profileSection\}/);
  assert.match(chat, /const startingProfile = await loadConfirmedProfile\(req\.userId, user\.language\);/);
});

test('an UNconfirmed profile never reaches the prompt — only the athlete\'s own answer does', () => {
  assert.match(chat, /if \(startingProfile && startingProfile\.fitResponse && startingProfile\.sections\)/);
  const loader = serverSrc('profile/loadConfirmedProfile.js');
  assert.match(loader, /fitResponse: \{ not: null \}/);
});

test('the prompt tells Arjun not to re-ask whether the pattern fits, and never to present it as a diagnosis', () => {
  const idx = chat.indexOf('## Confirmed Starting Profile');
  const block = chat.slice(idx, idx + 1200);
  assert.match(block, /Do NOT ask them again whether the pattern fits/);
  assert.match(block, /Never present it as a diagnosis, score, or fixed trait/);
});

test('the older raw challenge field defers to the confirmed profile instead of competing with it', () => {
  assert.match(chat, /Biggest mental challenge:\*\* \$\{startingProfile\?\.fitResponse \? '\(see the Confirmed Starting Profile above/);
});

test('the plan\'s own narrative interpretations no longer go into the prompt (no second, competing read of the athlete)', () => {
  const idx = chat.indexOf('const planSection');
  const block = chat.slice(idx, chat.indexOf('let focusCardSection', idx) === -1 ? idx + 2000 : chat.indexOf('let focusCardSection', idx));
  assert.doesNotMatch(block, /coachNote/, 'Plan.coachNote must not be injected alongside the confirmed profile');
  assert.doesNotMatch(block, /personalizedReason/, 'PlanSession.personalizedReason must not be injected alongside the confirmed profile');
});

test('quick chat is untouched — it never loads or injects the starting profile', () => {
  const quickIdx = chat.indexOf('if (isQuickChat)');
  const quickEnd = chat.indexOf('## Athlete Profile');
  const quickSlice = chat.slice(quickIdx, quickEnd);
  assert.doesNotMatch(quickSlice, /loadConfirmedProfile/);
});

// ── The old profileIntro AI surface is retired ──────────────────────────────

test('profileIntro no longer generates its own AI interpretation', () => {
  assert.doesNotMatch(profileIntro, /@anthropic-ai\/sdk/, 'the retired route must not construct an Anthropic client');
  assert.doesNotMatch(profileIntro, /messages\.create\(/);
});

test('profileIntro no longer writes or reads User.profileIntro (the column itself is preserved)', () => {
  assert.doesNotMatch(profileIntro, /data:\s*\{\s*profileIntro/);
  assert.doesNotMatch(profileIntro, /user\.profileIntro/);
  assert.match(schema, /profileIntro\s+String\?/, 'the column must NOT be dropped in this PR');
});

test('profileIntro keeps its auth, consent and safety-screen behavior', () => {
  assert.match(profileIntro, /router\.get\('\/', authenticate, aiLimiter, requireGuardianConsent/);
  assert.match(profileIntro, /screenSafetyText\(user\.name \|\| ''\)/);
  assert.match(profileIntro, /recordSafetyEvent\(req\.userId, 'profile_intro'/);
});

test('the client no longer generates a profile intro in the background at login', () => {
  const auth = clientSrc('contexts/AuthContext.jsx');
  assert.doesNotMatch(auth, /\/api\/profile-intro/);
  assert.doesNotMatch(auth, /profileIntro:/, 'the cached intro is no longer written onto the user object');
});

test('the old mental-game-profile route redirects to the starting profile', () => {
  const app = clientSrc('App.jsx');
  const idx = app.indexOf('path="/mental-game-profile"');
  assert.ok(idx !== -1, 'the old path must still resolve for existing links');
  assert.match(app.slice(idx, idx + 160), /<Navigate to="\/starting-profile" replace \/>/);
  assert.match(app, /path="\/starting-profile"/);
});

// ── The post-onboarding flow ────────────────────────────────────────────────

test('onboarding completion opens the starting profile, not the Mind Journal', () => {
  const onboarding = clientSrc('pages/OnboardingPage.jsx');
  assert.match(onboarding, /navigate\('\/starting-profile'/);
  assert.doesNotMatch(onboarding, /'\/mind-journal'/);
});

test('the client starts the first conversation through the gated endpoint and opens that exact session', () => {
  const hook = clientSrc('hooks/useStartingProfile.js');
  assert.match(hook, /'\/api\/profile\/start-chat'/);
  assert.match(hook, /CONSENT_REQUIRED/);
  const page = clientSrc('pages/StartingProfilePage.jsx');
  // Replacement navigation + an explicit return destination, so Back from the
  // first conversation goes home rather than into the confirmation flow.
  assert.match(page, /navigate\('\/coaching', \{\s*replace: true,/);
  assert.match(page, /chatSessionId: res\.chatSessionId, returnTo: '\/dashboard', enteredFromStartingProfile: true/);
});

test('the profile screen offers exactly the three fit answers and never claims to be a diagnosis', () => {
  const page = clientSrc('pages/StartingProfilePage.jsx');
  for (const k of ['fitConfirmed', 'fitPartly', 'fitNotReally']) assert.match(page, new RegExp(`t\\.${k}`));
  assert.match(page, /t\.notDiagnosis/);
});

test('every new athlete-facing string exists in both English and Hindi', () => {
  const src = clientSrc('i18n/translations.js');
  const block = (lang) => {
    const langIdx = src.indexOf(`\n  ${lang}: {`);
    const start = src.indexOf('startingProfile: {', langIdx);
    assert.ok(start !== -1, `missing startingProfile namespace for ${lang}`);
    return src.slice(start, src.indexOf('\n    },', start));
  };
  const keys = (b) => [...b.matchAll(/^\s{6}([a-zA-Z]+):/gm)].map((m) => m[1]).sort();
  assert.deepEqual(keys(block('en')), keys(block('hi')));
});

// ── Schema ──────────────────────────────────────────────────────────────────

test('the schema change is additive: new models only, cascading from the user, nothing dropped', () => {
  assert.match(schema, /model StartingPerformanceProfile \{/);
  assert.match(schema, /model StartingProfileWording \{/);
  assert.match(schema, /enum ProfileFitResponse \{[^}]*CONFIRMED[^}]*PARTLY[^}]*NOT_REALLY/s);
  assert.match(schema, /onboardingSessionId\s+String\s+@unique/);
  assert.match(schema, /firstChatSessionId\s+String\?\s+@unique/);
  assert.match(schema, /@@unique\(\[profileId, language\]\)/);
  // The raw onboarding record and the legacy column both survive untouched.
  assert.match(schema, /model OnboardingSession \{/);
});
