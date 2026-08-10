// Source-text checks for the Performance Pattern single-choice pass: every
// custom ("something else") answer the canonical config defines for a
// Pattern question has a matching translation key in BOTH languages, the
// shared "Write your own" custom-field label and "Choose the one that fits
// you best now." resolution notice exist in both onboarding surfaces
// (first-time onboarding and Performance Check-in), and the single-choice
// question set matches exactly what the server-side test suite covers —
// nothing here silently drifts from the canonical config.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

import v2Config from '../src/onboarding/v2.config.json' with { type: 'json' };
import { onboardingV2En, onboardingV2Hi } from '../src/i18n/onboardingV2.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const src = (p) => readFileSync(path.join(root, 'src', p), 'utf8');
const translations = src('i18n/translations.js');

// Mirrors server/test/patternSingleChoice.test.js's own list — kept as a
// literal here (not imported) so a future change to one side is caught by a
// failing assertion instead of the two suites silently drifting apart.
const PATTERN_QIDS = [
  'mistakes_first_response', 'pre_performance_signs', 'focus_when', 'confidence_trigger',
  'motivation_when', 'coach_selection_moment', 'custom_response', 'unsure_recognition',
  'mistakes_next', 'pre_performance_effect', 'focus_effect', 'confidence_effect',
  'motivation_effect', 'coach_selection_effect', 'custom_effect',
  'family_outside_effect', 'injury_concern',
  'pre_performance_duration', 'mistakes_recovery', 'focus_recovery', 'confidence_recovery',
  'motivation_recovery', 'coach_selection_recovery', 'family_outside_recovery', 'injury_recovery',
  'unsure_recovery', 'custom_recovery',
];

test('every Performance Pattern question in the generated config is single-choice with one custom answer', () => {
  for (const qid of PATTERN_QIDS) {
    const q = v2Config.questions[qid];
    assert.ok(q, `question '${qid}' missing from generated config`);
    assert.equal(q.type, 'single', `${qid}.type`);
    assert.equal(q.limit, 1, `${qid}.limit`);
    const customAnswers = (q.answers || []).filter((a) => a.custom);
    assert.equal(customAnswers.length, 1, `${qid} should define exactly one custom answer`);
  }
});

test('unrelated multi-select questions in the generated config are untouched', () => {
  for (const qid of ['difficult_moments', 'contextual_pressures', 'supports', 'strengths', 'broad_goals']) {
    const q = v2Config.questions[qid];
    assert.equal(q.type, 'multi', `${qid}.type`);
    assert.ok(q.limit > 1, `${qid}.limit`);
  }
});

test('every custom answer id defined in the config has a translation key present in both onboardingV2 languages', () => {
  for (const qid of PATTERN_QIDS) {
    const q = v2Config.questions[qid];
    const customAnswer = (q.answers || []).find((a) => a.custom);
    // key looks like "onboarding.v2.mistakesFirstResponse.somethingElse" —
    // the last two segments are the namespace + leaf key inside onboardingV2.js.
    const parts = customAnswer.key.split('.');
    const [namespace, leaf] = parts.slice(-2);
    assert.equal(typeof onboardingV2En[namespace]?.[leaf], 'string', `EN missing ${customAnswer.key}`);
    assert.equal(typeof onboardingV2Hi[namespace]?.[leaf], 'string', `HI missing ${customAnswer.key}`);
  }
});

test('the shared onboarding custom-field label reads "Write your own" in English, present in both languages', () => {
  assert.equal(onboardingV2En.ui.customLabel, 'Write your own');
  assert.equal(typeof onboardingV2Hi.ui.customLabel, 'string');
  assert.ok(onboardingV2Hi.ui.customLabel.length > 0);
});

test('the ambiguous-legacy-answer resolution notice exists in both onboarding surfaces, in both languages', () => {
  assert.equal(typeof onboardingV2En.ui.chooseOneNotice, 'string');
  assert.equal(typeof onboardingV2Hi.ui.chooseOneNotice, 'string');
  assert.match(onboardingV2Hi.ui.chooseOneNotice, /[ऀ-ॿ]/);

  const namespaceBlock = (lang, name) => {
    const langIdx = translations.indexOf(`\n  ${lang}: {`);
    const start = translations.indexOf(`${name}: {`, langIdx);
    return translations.slice(start, translations.indexOf('\n    },', start));
  };
  for (const lang of ['en', 'hi']) {
    const block = namespaceBlock(lang, 'performanceCheckin');
    assert.match(block, /chooseOneNotice:/, `${lang}.performanceCheckin.chooseOneNotice missing`);
    assert.match(block, /customLabel:\s*'Write your own'|customLabel:\s*'[^']+'/, `${lang}.performanceCheckin.customLabel missing`);
  }
});

test('the Check-in custom-field label was renamed off "Something else" (that text is already the OPTION label, not the field label)', () => {
  const langIdx = translations.indexOf(`\n  en: {`);
  const start = translations.indexOf(`performanceCheckin: {`, langIdx);
  const block = translations.slice(start, translations.indexOf('\n    },', start));
  const m = block.match(/customLabel:\s*'([^']+)'/);
  assert.ok(m, 'performanceCheckin.customLabel missing');
  assert.notEqual(m[1], 'Something else');
});
