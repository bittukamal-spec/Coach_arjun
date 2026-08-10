// Source-text checks for the Performance Check-in flow: translation parity,
// the "never call it onboarding" contract for returning-user copy, the
// shared-component reuse guarantee, and the namespace-collision regression
// this pass found and fixed (see git history — a second `checkin:` key in
// the same language object silently shadowed the pre-existing legacy
// "Daily Pulse" namespace).

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const src = (p) => readFileSync(path.join(root, 'src', p), 'utf8');

const translations = src('i18n/translations.js');
const checkinPage = src('pages/PerformanceCheckinPage.jsx');
const profilePage = src('pages/StartingProfilePage.jsx');
const checkinQuestion = src('components/profile/CheckinQuestion.jsx');
const app = src('App.jsx');

function namespaceBlock(lang, name) {
  const langIdx = translations.indexOf(`\n  ${lang}: {`);
  assert.ok(langIdx !== -1, `missing ${lang} translations`);
  const start = translations.indexOf(`${name}: {`, langIdx);
  assert.ok(start !== -1, `missing ${name} namespace in ${lang}`);
  return translations.slice(start, translations.indexOf('\n    },', start));
}
const keysOf = (block) => [...block.matchAll(/^\s{6}([a-zA-Z]+):/gm)].map((m) => m[1]).sort();

// ── The namespace-collision regression ──────────────────────────────────────

test('performanceCheckin is its own namespace, distinct from the legacy "checkin" (Daily Pulse) namespace', () => {
  for (const lang of ['en', 'hi']) {
    const legacy = namespaceBlock(lang, 'checkin');
    const perf = namespaceBlock(lang, 'performanceCheckin');
    assert.notEqual(legacy, perf);
    // The legacy namespace is untouched — still the Daily Pulse check-in.
    assert.match(legacy, /moodLabel:|focusLabel:|confidenceLabel:/);
    // The new namespace carries Check-in-flow-specific keys the legacy one
    // never had.
    assert.match(perf, /progressAria:|changeSituationTitle:/);
  }
});

test('the page reads L.performanceCheckin, never the legacy L.checkin', () => {
  assert.match(checkinPage, /const c = L\.performanceCheckin;/);
  assert.doesNotMatch(checkinPage, /L\.checkin\b/);
});

// ── EN/HI parity ─────────────────────────────────────────────────────────────

test('performanceCheckin has identical keys in English and Hindi', () => {
  const en = keysOf(namespaceBlock('en', 'performanceCheckin'));
  const hi = keysOf(namespaceBlock('hi', 'performanceCheckin'));
  assert.deepEqual(en, hi);
  assert.ok(en.length > 10, 'expected the full namespace');
});

test('the Hindi performanceCheckin namespace is actually written in Hindi', () => {
  assert.match(namespaceBlock('hi', 'performanceCheckin'), /[ऀ-ॿ]/);
});

test('the simplified startingProfile keys exist in both languages', () => {
  const keys = [
    'myGameTitle', 'myGameSettingsLink', 'whatHelpsMeTitle', 'myStrengthsTitle', 'editAction', 'updateAction',
    'pressureTitle', 'pressureSituation', 'pressureFirstResponse', 'pressureImpact', 'pressureReset',
    'pressureResetInline', 'notSetYet', 'needsUpdate', 'goalsLabel', 'fourWeekLabel', 'updateGoals',
    'summaryTitle', 'summarySubtitle', 'summaryMainFocus', 'summaryWhenPressure', 'summaryWhatHelps',
    'summaryStrengths', 'looksRight', 'changeSomething',
  ];
  for (const lang of ['en', 'hi']) {
    const block = namespaceBlock(lang, 'startingProfile');
    for (const k of keys) assert.match(block, new RegExp(`${k}:`), `${lang}.startingProfile.${k} missing`);
  }
});

test('the retired full-check-in copy is gone from both languages', () => {
  for (const lang of ['en', 'hi']) {
    const profile = namespaceBlock(lang, 'startingProfile');
    const perf = namespaceBlock(lang, 'performanceCheckin');
    for (const k of ['patternTitle', 'reviewPattern', 'refreshProfileTitle', 'refreshProfileDesc']) {
      assert.doesNotMatch(profile, new RegExp(`\\b${k}:`), `${lang}.startingProfile.${k} should be gone`);
    }
    for (const k of ['entryTitle', 'entryHeadline', 'entryTime', 'reviewTitle', 'noChanges', 'unchanged', 'goBackToQuestions']) {
      assert.doesNotMatch(perf, new RegExp(`\\b${k}:`), `${lang}.performanceCheckin.${k} should be gone`);
    }
  }
});

// ── Never call it "onboarding" in returning-user copy ───────────────────────

test('no user-visible performanceCheckin copy contains the word "onboarding"', () => {
  for (const lang of ['en', 'hi']) {
    const block = namespaceBlock(lang, 'performanceCheckin');
    assert.doesNotMatch(block, /onboarding/i);
  }
});

// ── Shared-component reuse: one implementation, not four ────────────────────

test('CheckinQuestion is the one shared question renderer, reusing onboarding\'s own SelectableOption/CustomAnswerField/config', () => {
  assert.match(checkinQuestion, /from '\.\.\/onboarding'/);
  assert.match(checkinQuestion, /from '\.\.\/\.\.\/onboarding\/config'/);
  assert.match(checkinQuestion, /SelectableOption/);
  assert.match(checkinQuestion, /CustomAnswerField/);
});

test('every Profile edit entry point is section-scoped, and none opens a full-profile flow', () => {
  const targets = [...profilePage.matchAll(/editPath\('([a-z]+)'\)/g)].map((m) => m[1]);
  assert.deepEqual(new Set(targets), new Set(['pressure', 'helps', 'strengths', 'goals']));
  assert.doesNotMatch(profilePage, /navigate\('\/starting-profile\/check-in'\)/, 'no unscoped full-profile refresh exists');
});

test('an unscoped check-in visit redirects to the profile instead of 404ing an old bookmark', () => {
  assert.match(checkinPage, /if \(!scoped\) return <Navigate to="\/starting-profile" replace \/>;/);
  // The pre-simplification section name still resolves.
  assert.match(checkinPage, /SECTION_ALIASES = \{ pattern: 'pressure' \}/);
});

// ── Routing ──────────────────────────────────────────────────────────────────

test('the /starting-profile/check-in route is registered, protected, and requires onboarding', () => {
  const idx = app.indexOf('path="/starting-profile/check-in"');
  assert.notEqual(idx, -1);
  const block = app.slice(idx, idx + 200);
  assert.match(block, /<ProtectedRoute requireOnboarding=\{true\}>/);
  assert.match(block, /<PerformanceCheckinPage \/>/);
});

// ── Behaviour protection ─────────────────────────────────────────────────────

test('Check-in never touches sport, role, competition level or experience — Settings-owned fields stay out of the flow', () => {
  // These question ids must never appear as a screen this page can walk.
  assert.doesNotMatch(checkinPage, /'sport'|'role_position'|'competition_level'|'experience_level'/);
});

test('the Check-in save call sends only the answers in scope for THIS run, never the whole draft map', () => {
  assert.match(checkinPage, /const payload = \{\};/);
  assert.match(checkinPage, /for \(const sid of screenIds\)/);
  assert.match(checkinPage, /updateAnswers\(payload\)/);
});

// ── Saves happen straight from the last question ────────────────────────────

test('the last question of a scoped edit saves — there is no review screen in the page at all', () => {
  assert.match(checkinPage, /const isLast = step >= total - 1;/);
  assert.match(checkinPage, /if \(isLast\) \{ await handleSave\(\); return; \}/);
  for (const gone of ['computeReviewDiff', 'ReviewDiff', 'reviewing', 'anyChange', 'c.reviewTitle', 'c.unchanged']) {
    assert.ok(!checkinPage.includes(gone), `${gone} should be gone from the page`);
  }
});

test('the save action is labelled "Save changes" in both languages, and never calls itself onboarding', () => {
  assert.match(checkinPage, /isLast \? c\.save : c\.next/);
  for (const lang of ['en', 'hi']) {
    const block = namespaceBlock(lang, 'performanceCheckin');
    assert.match(block, /save:/, `${lang} missing save`);
    assert.doesNotMatch(block, /onboarding/i);
  }
  assert.match(namespaceBlock('en', 'performanceCheckin'), /save: 'Save changes'/);
});

test('changing the situation is confirmed with the athlete before the flow moves on', () => {
  assert.match(checkinPage, /function orphanedBranchQuestions\(\)/);
  assert.match(checkinPage, /setConfirmBranchChange\(\{ nextStep: step \+ 1 \}\)/);
  for (const lang of ['en', 'hi']) {
    const block = namespaceBlock(lang, 'performanceCheckin');
    for (const k of ['changeSituationTitle', 'changeSituationBody', 'changeSituationConfirm', 'changeSituationCancel']) {
      assert.match(block, new RegExp(`${k}:`), `${lang}.performanceCheckin.${k} missing`);
    }
  }
});
