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
    assert.match(perf, /entryTitle:|progressAria:/);
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
  assert.ok(en.length > 15, 'expected the full namespace');
});

test('the Hindi performanceCheckin namespace is actually written in Hindi', () => {
  assert.match(namespaceBlock('hi', 'performanceCheckin'), /[ऀ-ॿ]/);
});

test('the new startingProfile keys (My Game, My Performance Pattern, What Helps Me, My Strengths, Refresh my profile) exist in both languages', () => {
  const keys = ['myGameTitle', 'myGameSettingsLink', 'patternTitle', 'reviewPattern', 'whatHelpsMeTitle', 'myStrengthsTitle', 'editAction', 'refreshProfileTitle', 'refreshProfileDesc'];
  for (const lang of ['en', 'hi']) {
    const block = namespaceBlock(lang, 'startingProfile');
    for (const k of keys) assert.match(block, new RegExp(`${k}:`), `${lang}.startingProfile.${k} missing`);
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

test('the Performance Profile page\'s Review pattern / helps Edit / strengths Edit all route into the SAME Check-in page, scoped by ?section=', () => {
  const targets = [...profilePage.matchAll(/navigate\('\/starting-profile\/check-in\?section=([a-z]+)'\)/g)].map((m) => m[1]);
  assert.deepEqual(new Set(targets), new Set(['pattern', 'helps', 'strengths']));
  assert.match(profilePage, /navigate\('\/starting-profile\/check-in'\)/, 'Refresh my profile opens the full, unscoped flow');
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

// ── No-change review correction ─────────────────────────────────────────────

test('the review screen never renders a Save action when there are zero changes — one clear "Go back to questions" action instead', () => {
  const anyChangeIdx = checkinPage.indexOf('anyChange ? (');
  assert.notEqual(anyChangeIdx, -1, 'Save/Go-back only render in the anyChange branch');
  // The Save button JSX itself sits after the `anyChange ? (` branch open,
  // and before its matching `) : (` no-change branch.
  const elseIdx = checkinPage.indexOf(') : (', anyChangeIdx);
  const saveIdx = checkinPage.indexOf('c.save}', anyChangeIdx);
  assert.ok(elseIdx !== -1 && saveIdx !== -1 && saveIdx < elseIdx, 'Save must be inside the anyChange-true branch, before the no-change branch');
  const goBackToQuestionsIdx = checkinPage.indexOf('c.goBackToQuestions', elseIdx);
  assert.ok(goBackToQuestionsIdx !== -1, 'the no-change branch (after the ": (") renders the dedicated back action');
});

test('handleSave guards against firing while there are zero changes (defence in depth, not just a hidden button)', () => {
  const idx = checkinPage.indexOf('async function handleSave()');
  const body = checkinPage.slice(idx, checkinPage.indexOf('\n  }', idx));
  assert.match(body, /const \{ anyChange \} = computeReviewDiff\(/);
  assert.match(body, /if \(!anyChange\) return;/);
});

test('computeReviewDiff is a pure function, reused by both the anyChange guard and the ReviewDiff renderer (one diff implementation)', () => {
  assert.match(checkinPage, /function computeReviewDiff\(/);
  assert.equal((checkinPage.match(/computeReviewDiff\(/g) || []).length, 3, 'defined once, called from handleSave and from the reviewing render');
});

test('the no-change hint copy and "Go back to questions" exist in both languages, and never call it onboarding', () => {
  for (const lang of ['en', 'hi']) {
    const block = namespaceBlock(lang, 'performanceCheckin');
    assert.match(block, /noChangesHint:/, `${lang} missing noChangesHint`);
    assert.match(block, /goBackToQuestions:/, `${lang} missing goBackToQuestions`);
    assert.doesNotMatch(block, /onboarding/i);
  }
});
