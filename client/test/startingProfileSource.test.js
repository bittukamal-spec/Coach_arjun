// Source-text guarantees for the Starting Performance Profile screen (PR 3):
// translation parity, no hardcoded athlete-facing copy, and the retirement of
// the old profile-intro experience on the client.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const src = (p) => readFileSync(path.join(__dirname, '../src', p), 'utf8');
const page = src('pages/StartingProfilePage.jsx');
const hook = src('hooks/useStartingProfile.js');
const translations = src('i18n/translations.js');

function namespaceBlock(lang) {
  const langIdx = translations.indexOf(`\n  ${lang}: {`);
  assert.ok(langIdx !== -1, `missing ${lang} translations`);
  const start = translations.indexOf('startingProfile: {', langIdx);
  assert.ok(start !== -1, `missing startingProfile namespace in ${lang}`);
  return translations.slice(start, translations.indexOf('\n    },', start));
}
const keysOf = (block) => [...block.matchAll(/^\s{6}([a-zA-Z]+):/gm)].map((m) => m[1]);

test('the startingProfile namespace exists in both languages with identical keys', () => {
  const en = keysOf(namespaceBlock('en'));
  const hi = keysOf(namespaceBlock('hi'));
  assert.ok(en.length > 20, 'expected the full namespace');
  assert.deepEqual([...en].sort(), [...hi].sort());
});

test('the Hindi namespace is actually written in Hindi', () => {
  assert.match(namespaceBlock('hi'), /[ऀ-ॿ]/);
});

test('every athlete-facing string on the page comes from translations, not hardcoded JSX', () => {
  // No bare sentence-like text nodes between tags.
  const textNodes = [...page.matchAll(/>\s*([A-Z][a-z]+ [a-z][^<{}]{8,})</g)].map((m) => m[1]);
  assert.deepEqual(textNodes, [], `hardcoded copy found: ${textNodes.join(' | ')}`);
});

// The four prose blocks were replaced by the structured display payload. The
// page now renders server-authored strings from displayProfile instead of four
// paragraphs — see the redesign tests further down.
test('the page renders the server-owned display payload, not raw onboarding answers', () => {
  assert.match(page, /profile\?\.displayProfile/);
  assert.match(page, /dp\?\.startingPattern/);
  assert.match(page, /dp\?\.currentFocus/);
  assert.match(page, /dp\?\.nextStep/);
});

test('the page never invents an interpretation of its own', () => {
  assert.doesNotMatch(page, /anthropic|messages\.create/i);
  // No client-side mapping of an answer id to a psychological label: the only
  // config lookup left is the correction flow's own difficult_moments options.
  const cfgLookups = [...page.matchAll(/CFG\.getQuestion\('([^']+)'\)/g)].map((m) => m[1]);
  assert.deepEqual(cfgLookups, ['difficult_moments']);
  for (const map of ['CLAUSE', 'SUPPORT_PHRASE', 'STRENGTH_PHRASE', 'FOCUS_ACTION_LABEL', 'GOAL_LABEL']) {
    assert.doesNotMatch(page, new RegExp(map), `${map} must stay server-side`);
  }
});

test('the three fit answers are the only fit values sent to the server', () => {
  const fits = [...page.matchAll(/setFit\('([A-Z_]+)'\)/g)].map((m) => m[1]).sort();
  assert.deepEqual(fits, ['CONFIRMED', 'NOT_REALLY', 'PARTLY']);
});

test('corrections are limited to the athlete\'s own options plus their own words, with the shared text limit', () => {
  assert.match(page, /profile\?\.priorityOptions/);
  assert.match(page, /const CORRECTION_MAX = 120;/);
  assert.match(page, /isValidCustomText\(correctionText, CORRECTION_MAX\)/);
});

test('the hook talks to the four profile endpoints and nothing else', () => {
  const paths = [...hook.matchAll(/apiFetch\('([^']+)'/g)].map((m) => m[1]).sort();
  assert.deepEqual(paths, [
    '/api/profile/confirm', '/api/profile/current-focus',
    '/api/profile/start-chat', '/api/profile/starting',
  ]);
});

test('the retired mental-game profile page is gone from the client', () => {
  assert.equal(existsSync(path.join(__dirname, '../src/pages/MentalGameProfilePage.jsx')), false);
  assert.doesNotMatch(src('App.jsx'), /MentalGameProfilePage/);
  assert.doesNotMatch(src('pages/AccountPage.jsx'), /to="\/mental-game-profile"/);
});

// ── Back navigation out of the first conversation ───────────────────────────
// Founder preview: Back from the first coaching chat returned to the Starting
// Profile the athlete had just finished confirming.

const chatPage = src('pages/ChatPage.jsx');

test('the profile opens the first conversation with replacement navigation and an explicit return destination', () => {
  assert.match(page, /navigate\('\/coaching', \{\s*replace: true,/);
  assert.match(page, /returnTo: '\/dashboard'/);
  assert.match(page, /enteredFromStartingProfile: true/);
});

test('Chat honours that return destination on Back, and only for that entry path', () => {
  assert.match(chatPage, /enteredFromStartingProfile \? \(location\.state\?\.returnTo \|\| '\/dashboard'\) : null/);
  assert.match(chatPage, /backOverrideRef\.current\s*\?\s*navigate\(backOverrideRef\.current, \{ replace: true \}\)/);
});

test('every other Chat entry path keeps the existing Back behaviour', () => {
  // The fallback is still the plain history back, and there is exactly one
  // back control — no global redirect of every Chat exit to the dashboard.
  assert.match(chatPage, /:\s*navigate\(-1\)\)/);
  assert.equal((chatPage.match(/navigate\(-1\)/g) || []).length, 1);
  assert.equal((chatPage.match(/aria-label="Go back"/g) || []).length, 1);
});

test('the chat footer navigation stays out of this change (reserved for PR 4)', () => {
  assert.doesNotMatch(chatPage, /BottomNav/, 'the shared footer is PR 4 scope');
  const app = src('App.jsx');
  const idx = app.indexOf('path="/coaching"');
  assert.ok(idx !== -1);
  // The route still renders ChatPage + BottomNav exactly as it did before.
  assert.match(app.slice(idx, idx + 220), /<ChatPage \/>\s*<BottomNav \/>/);
});

test('the confirmation summary renders a server-supplied phrase, not an onboarding display label', () => {
  assert.match(page, /profile\?\.agreedPriorityPhrase/);
  assert.match(page, /t\.savedBody\(agreedPhrase\)/);
  // The only remaining config lookup is for the correction option LIST, which
  // is where display labels belong.
  const configUses = [...page.matchAll(/CFG\.getQuestion\('difficult_moments'\)/g)];
  assert.equal(configUses.length, 1);
});

test('the confirmation sentence template cannot produce "We\'ll start with When…"', () => {
  const en = namespaceBlock('en');
  assert.match(en, /savedBody: \(focus\) => `We\\'ll start by exploring \$\{focus\}\.`/);
  assert.doesNotMatch(en, /We\\'ll start with \$\{focus\}/);
  assert.match(namespaceBlock('hi'), /savedBody: \(focus\) =>/);
});

// ── Two modes: first-time flow vs saved profile view ───────────────────────

test('mode is resolved from the stored profile, not from navigation state alone', () => {
  // fitResponse is the source of truth; entryMode only refines it.
  assert.match(page, /const confirmed = !!profile\?\.fitResponse;/);
  assert.match(page, /const savedMode = confirmed && \(!justConfirmed \|\| entryMode === 'saved-profile'\);/);
  // Navigation state is read once and never trusted as the deciding factor.
  assert.match(page, /useRef\(location\.state\?\.entryMode \|\| null\)\.current/);
});

test('the completion transition renders only on the screen that just confirmed', () => {
  assert.match(page, /\{confirmed && !savedMode && \(/);
  assert.match(page, /setJustConfirmed\(true\);/);
});

test('the saved view has its own heading and NO subtitle underneath it', () => {
  assert.match(page, /savedMode \? t\.savedTitleShort : t\.title/);
  // The subtitle renders only in first-time mode.
  assert.match(page, /\{!savedMode && <p[^>]*>\{t\.subtitle\}<\/p>\}/);
  const en = namespaceBlock('en');
  assert.match(en, /savedTitleShort: 'Your Performance Profile'/);
});

test('the saved view shows the current focus, the response and a date, and stays read-only', () => {
  assert.match(page, /t\.currentFocusLabel/);
  assert.match(page, /FIT_STATUS_KEY\[profile\.fitResponse\]/);
  assert.match(page, /t\.updatedOn\(/);
  // No editing was built: the only correction field on the page sits inside
  // the unconfirmed block, above the completion transition.
  const unconfirmedIdx = page.indexOf('{!confirmed && (');
  const transitionIdx = page.indexOf('{confirmed && !savedMode && (');
  const fieldIdx = page.indexOf('<CustomAnswerField');
  assert.ok(unconfirmedIdx !== -1 && transitionIdx !== -1 && fieldIdx !== -1);
  assert.ok(fieldIdx > unconfirmedIdx && fieldIdx < transitionIdx, 'the correction field must stay in the first-time flow');
  assert.equal((page.match(/<CustomAnswerField/g) || []).length, 1);
  assert.equal((page.match(/<SelectableOption/g) || []).length, 4);
});

test('the coaching action in the saved view reuses the idempotent endpoint, never a second start', () => {
  assert.match(page, /\{savedMode && !consent\.pending && \(/);
  assert.match(page, /onClick=\{handleStartChat\}/);
  // One handler, one endpoint — no second creation path was added.
  assert.equal((page.match(/startChat\(\)/g) || []).length, 1);
});

test('entry modes are passed from onboarding, Account and the legacy redirect', () => {
  assert.match(src('pages/OnboardingPage.jsx'), /entryMode: 'onboarding-completion'/);
  assert.match(src('pages/AccountPage.jsx'), /state=\{\{ entryMode: 'saved-profile' \}\}/);
  const app = src('App.jsx');
  const idx = app.indexOf('path="/mental-game-profile"');
  assert.match(app.slice(idx, idx + 200), /<Navigate to="\/starting-profile" replace state=\{\{ entryMode: 'saved-profile' \}\} \/>/);
});

test('the saved-view strings exist in both languages', () => {
  for (const key of ['savedViewTitle', 'savedViewSubtitle', 'agreedFocusLabel', 'statusLabel', 'statusConfirmed', 'statusPartly', 'statusCorrected', 'lastUpdated', 'continueCoaching']) {
    assert.match(namespaceBlock('en'), new RegExp(`${key}:`), `missing en.${key}`);
    assert.match(namespaceBlock('hi'), new RegExp(`${key}:`), `missing hi.${key}`);
  }
});

test('the visual redesign is present and shares one component tree across modes', () => {
  for (const c of ['CurrentFocusCard', 'ProfileChipGroup', 'PerformancePathway', 'ProfileSectionCard', 'ChangeFocusDialog']) {
    assert.match(page, new RegExp(c), `missing ${c}`);
  }
  // Still no measurement visuals of any kind.
  assert.doesNotMatch(page, /recharts|RadarChart|Gauge|skill-bar|percentile/i);
});
