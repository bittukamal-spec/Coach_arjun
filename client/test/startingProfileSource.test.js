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
test('the page renders the athlete\'s own stored answers, resolved through the shared config', () => {
  assert.match(page, /profile\?\.displayProfile/);
  assert.match(page, /dp\?\.pressure\?\.stages/);
  assert.match(page, /dp\?\.selections/);
  assert.match(page, /dp\?\.currentFocus/);
  // Labels come from the same translation keys the questions themselves used.
  assert.match(page, /answerLabels\(/);
  assert.match(page, /from '\.\.\/onboarding\/labels'/);
});

test('the page never invents an interpretation of its own', () => {
  assert.doesNotMatch(page, /anthropic|messages\.create/i);
  // No client-side psychological mapping: the label resolver only ever reads
  // the answer's own translation key.
  for (const map of ['CLAUSE', 'SUPPORT_PHRASE', 'STRENGTH_PHRASE', 'FOCUS_ACTION_LABEL', 'GOAL_LABEL']) {
    assert.doesNotMatch(page, new RegExp(map), `${map} must stay server-side`);
  }
  // The rule engine's own rendered prose is no longer drawn anywhere.
  for (const gone of ['dp.interpretation', 'dp?.interpretation', 'dp.nextStep', 'dp?.nextStep', 'startingPattern']) {
    assert.ok(!page.includes(gone), `${gone} must not be rendered on the profile`);
  }
});

test('the label resolver shows custom athlete text verbatim, and never translates it', () => {
  const labels = src('onboarding/labels.js');
  assert.match(labels, /if \(CFG\.isCustom\(qid, id\)\) return raw\.customText \|\| null;/);
  // An ambiguous or unset answer resolves to nothing — the caller decides
  // what neutral state to show; this file never picks one of the stored ids.
  assert.match(labels, /raw\.status === 'unset' \|\| raw\.status === 'ambiguous'/);
});

test('confirmation sends the one fit value the simplified summary offers', () => {
  const fits = [...page.matchAll(/confirm\(\{ fit: '([A-Z_]+)' \}\)/g)].map((m) => m[1]);
  assert.deepEqual(fits, ['CONFIRMED']);
  // The stored lifecycle contract is untouched: the hook still posts to the
  // same endpoint, and the server still owns fitResponse/confirmedAt.
  assert.match(hook, /apiFetch\('\/api\/profile\/confirm'/);
});

test('the hook talks to the five profile endpoints and nothing else', () => {
  // Performance Check-in added PATCH /api/profile/answers alongside the
  // original four — the hook still owns exactly this set.
  const paths = [...hook.matchAll(/apiFetch\('([^']+)'/g)].map((m) => m[1]).sort();
  assert.deepEqual(paths, [
    '/api/profile/answers', '/api/profile/confirm', '/api/profile/current-focus',
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
  // Stage C translated the back control's accessible name (it was a
  // hardcoded English "Go back"). Still exactly one back control, still
  // labelled — the label now comes from the translation table.
  assert.equal((chatPage.match(/aria-label=\{t\.backAria\}/g) || []).length, 1);
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
  // The page never composes a sentence from a raw onboarding display label:
  // it has no direct config-question lookup left at all.
  assert.equal([...page.matchAll(/CFG\.getQuestion\(/g)].length, 0);
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
  assert.match(page, /savedMode \? t\.savedTitleShort : t\.summaryTitle/);
  // The subtitle renders only in first-time mode.
  assert.match(page, /\{!savedMode && <p[^>]*>\{t\.summarySubtitle\}<\/p>\}/);
  const en = namespaceBlock('en');
  assert.match(en, /savedTitleShort: 'Your Performance Profile'/);
  assert.match(en, /summaryTitle: 'Your starting profile'/);
});

test('the saved view shows the current focus and a date, and stays read-only', () => {
  assert.match(page, /t\.currentFocusLabel/);
  assert.match(page, /t\.updatedOn\(/);
  // The profile's fit response describes the one-time Starting Profile review,
  // not the mutable current focus, so it is deliberately not rendered here.
  assert.doesNotMatch(page, /FIT_STATUS_KEY/);
  assert.doesNotMatch(page, /t\.currentResponse/);
  // The profile itself edits nothing inline: every change goes through a
  // section-scoped flow on its own screen.
  assert.equal((page.match(/<CustomAnswerField/g) || []).length, 0);
  assert.equal((page.match(/<SelectableOption/g) || []).length, 0);
  const unconfirmedIdx = page.indexOf('{!confirmed && (');
  const transitionIdx = page.indexOf('{confirmed && !savedMode && (');
  assert.ok(unconfirmedIdx !== -1 && transitionIdx !== -1);
});

test('Modernization pass 2: "Continue coaching" was removed from the saved view — Coach stays reachable via the bottom nav instead', () => {
  assert.doesNotMatch(page, /ContinueCoachingRow/);
  assert.doesNotMatch(page, /\{savedMode && !consent\.pending && \(/);
  // The idempotent start-chat call is still used, but ONLY by the one-time
  // completion transition — no second creation path was added anywhere.
  assert.match(page, /\{confirmed && !savedMode && \(/);
  assert.equal((page.match(/onClick=\{handleStartChat\}/g) || []).length, 1);
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
  for (const c of ['CurrentFocusCard', 'ProfileChipGroup', 'PressureSequence', 'ProfileSectionCard', 'ChangeFocusDialog']) {
    assert.match(page, new RegExp(c), `missing ${c}`);
  }
  // Still no measurement visuals of any kind.
  assert.doesNotMatch(page, /recharts|RadarChart|Gauge|skill-bar|percentile/i);
});

// ── Branch precedence must not drift between client and server ────────────
// The client recomputes the branch while the athlete is mid-edit (to decide
// which follow-ups to ask); the server recomputes it on save. If the two
// disagree, an athlete is asked one branch's questions and has them rejected
// by the other — which is exactly the defect this rule fixes for legacy
// `unsure` athletes.

const clientConfig = src('onboarding/config.js');
const serverConfig = readFileSync(path.join(__dirname, '../../server/src/onboarding/config.js'), 'utf8');

const resolveBranchBody = (source) => {
  const start = source.indexOf('resolveBranch(answers) {');
  assert.notEqual(start, -1, 'resolveBranch not found');
  return source.slice(start, source.indexOf('\n}', start));
};

test('an explicit Situation decides the branch before any legacy not_sure answer, on both sides', () => {
  for (const [name, source] of [['client', clientConfig], ['server', serverConfig]]) {
    const body = resolveBranchBody(source);
    const priIdx = body.indexOf("selectedIds(answers, 'primary_priority')");
    const dmIdx = body.indexOf("selectedIds(answers, 'difficult_moments')");
    assert.ok(priIdx !== -1 && dmIdx !== -1, `${name}: both reads must exist`);
    assert.ok(priIdx < dmIdx, `${name}: the explicit Situation must be read first`);
    assert.match(body, /not_sure/, `${name}: the legacy fallback is still honoured`);
  }
});

test('the two implementations of resolveBranch are the same logic, not two dialects', () => {
  const normalise = (s) => s.replace(/\/\/.*$/gm, '').replace(/\s+/g, ' ').replace(/^export /, '').trim();
  assert.equal(normalise(resolveBranchBody(clientConfig)), normalise(resolveBranchBody(serverConfig)));
});

test('the situation question and the pressure stage order are read from config, not hardcoded per branch', () => {
  for (const source of [clientConfig, serverConfig]) {
    assert.match(source, /config\.situationQuestionId/);
    assert.match(source, /config\.pressureRoles/);
    assert.match(source, /'firstResponse', 'impact', 'reset', 'context'/);
  }
});

// ── One place per idea ─────────────────────────────────────────────────────
// Goals (the broader areas), Current Focus (what they're working on now) and
// the 4-week target (the near-term outcome) each appear once, in one card.

test('the goals edit affordance exists exactly once on the profile', () => {
  assert.equal([...page.matchAll(/editPath\('goals'\)/g)].length, 1);
});

test('the starting-summary copy names Arjun and says it is background, in both languages', () => {
  const en = namespaceBlock('en');
  const hi = namespaceBlock('hi');
  assert.match(en, /summarySubtitle: "This is what you told Arjun\. He'll use it as background and still check what's happening today\."/);
  assert.match(hi, /summarySubtitle: '.*Arjun.*'/);
  assert.match(hi, /[ऀ-ॿ]/);
  // The confirmation controls and their contract are untouched by the copy fix.
  assert.match(en, /looksRight: 'Looks right'/);
  assert.match(en, /changeSomething: 'Change something'/);
  assert.match(page, /confirm\(\{ fit: 'CONFIRMED' \}\)/);
});

test('the three goal-ish labels are distinct in both languages', () => {
  for (const lang of ['en', 'hi']) {
    const block = namespaceBlock(lang);
    const grab = (key) => block.match(new RegExp(`${key}: '([^']+)'`))?.[1];
    const values = [grab('goalsLabel'), grab('fourWeekLabel'), grab('currentFocusLabel')];
    assert.equal(new Set(values).size, 3, `${lang}: goals/4-week/current-focus labels must not collide`);
  }
  assert.equal(namespaceBlock('en').match(/goalsLabel: '([^']+)'/)[1], 'Goals');
  assert.equal(namespaceBlock('en').match(/fourWeekLabel: '([^']+)'/)[1], '4-week target');
});
