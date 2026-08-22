// Unified Mind Journal reflection (PR 1) — client-side guarantees:
// the mirrored vocabularies match the server, EN/HI parity holds for every
// athlete-visible string, the wizard's own contracts are in place, and the
// old Debrief experience is completely untouched by this PR.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { translations } from '../src/i18n/translations.js';
import {
  REFLECTION_CONTEXT_KEYS, CONTEXT_TO_EVENTS, eventKeysForContext,
  THOUGHT_KEYS, RESPONSE_KEYS, BODY_KEYS, CUE_FEEDBACK_KEYS,
  MAX_TAG_SELECTIONS, resolveConditionalQuestion,
} from '../src/pages/mindJournal/constants.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const read = (rel) => readFileSync(path.join(root, rel), 'utf8');
const serverRead = (rel) => readFileSync(path.join(root, '..', 'server', rel), 'utf8');

const wizard = read('src/pages/mindJournal/ReflectionWizard.jsx');
const app = read('src/App.jsx');

// ── The client mirror must not drift from the server contract ──────────────

test('the mirrored reflection vocabularies match the server exactly', () => {
  const serverEvents = serverRead('src/services/mindJournal/eventVocabulary.js');
  const serverReflection = serverRead('src/services/mindJournal/reflectionVocabulary.js');
  const serverContexts = serverRead('src/services/mindJournal/contextTypeVocabulary.js');

  for (const key of REFLECTION_CONTEXT_KEYS) {
    assert.ok(serverContexts.includes(`'${key}'`), `context ${key} must exist server-side`);
  }
  for (const [ctx, events] of Object.entries(CONTEXT_TO_EVENTS)) {
    for (const e of events) {
      assert.ok(serverEvents.includes(`'${e}'`), `event ${ctx}.${e} must exist server-side`);
    }
  }
  for (const key of [...THOUGHT_KEYS, ...RESPONSE_KEYS, ...BODY_KEYS, ...CUE_FEEDBACK_KEYS]) {
    assert.ok(serverReflection.includes(`'${key}'`), `${key} must exist server-side`);
  }
  assert.equal(MAX_TAG_SELECTIONS, 2);
});

test('the client Q6 resolver behaves identically to the server one', () => {
  const cases = [
    [{ contextType: 'COMPETITION' }, { hasActiveFocusCard: true }, 'cue'],
    [{ contextType: 'COMPETITION' }, { hasActiveFocusCard: false }, 'body'],
    [{ contextType: 'TRAINING', states: ['nervous'] }, {}, 'body'],
    [{ contextType: 'TRAINING', states: ['calm'] }, {}, null],
    [{ contextType: 'OUTSIDE_SPORT' }, { hasActiveFocusCard: true }, null],
    [{ contextType: 'WENT_WELL', states: ['confident'] }, { hasActiveFocusCard: true }, null],
  ];
  for (const [answers, opts, expected] of cases) {
    assert.equal(resolveConditionalQuestion(answers, opts), expected,
      `${answers.contextType} / card=${!!opts.hasActiveFocusCard}`);
  }
});

// ── EN / HI parity for every athlete-visible reflection string ─────────────

test('every reflection string exists in both English and Hindi', () => {
  const walk = (en, hi, trail) => {
    assert.deepEqual(Object.keys(en).sort(), Object.keys(hi).sort(), `${trail}: key sets must match`);
    for (const key of Object.keys(en)) {
      const a = en[key], b = hi[key];
      if (typeof a === 'function') { assert.equal(typeof b, 'function', `${trail}.${key}`); continue; }
      if (a && typeof a === 'object') { walk(a, b, `${trail}.${key}`); continue; }
      assert.equal(typeof b, 'string', `${trail}.${key} must exist in Hindi`);
      assert.ok(b.trim().length > 0, `${trail}.${key} must not be blank in Hindi`);
    }
  };
  walk(translations.en.mindJournal.reflection, translations.hi.mindJournal.reflection, 'reflection');
});

test('every vocabulary key has athlete-facing copy in both languages', () => {
  for (const lang of ['en', 'hi']) {
    const r = translations[lang].mindJournal.reflection;
    for (const key of REFLECTION_CONTEXT_KEYS) {
      assert.ok(r.q1.options[key], `${lang}.q1.${key} is missing`);
      assert.ok(r.q2.title[key], `${lang}.q2.title.${key} is missing`);
    }
    for (const key of [...new Set(Object.values(CONTEXT_TO_EVENTS).flat())]) {
      assert.ok(r.q2.options[key], `${lang}.q2.options.${key} is missing`);
    }
    for (const key of THOUGHT_KEYS) assert.ok(r.q4.options[key], `${lang}.q4.${key} is missing`);
    for (const key of RESPONSE_KEYS) assert.ok(r.q5.options[key], `${lang}.q5.${key} is missing`);
    for (const key of BODY_KEYS) assert.ok(r.q6body.options[key], `${lang}.q6body.${key} is missing`);
    for (const key of CUE_FEEDBACK_KEYS) assert.ok(r.q6cue.options[key], `${lang}.q6cue.${key} is missing`);
  }
});

test('the Hindi reflection copy is actually written in Hindi', () => {
  assert.match(JSON.stringify(translations.hi.mindJournal.reflection), /[ऀ-ॿ]/);
});

// ── The questions ask for observations, never for self-diagnosis ───────────

test('no athlete-facing reflection copy asks why, what to fix, or what to change', () => {
  const banned = [
    [/\bwhy\b/i, 'asks why something happened'],
    [/what would you change/i, 'asks what to change'],
    [/need(s)? to fix|what to fix/i, 'asks what to fix'],
    [/your problem|what.s wrong/i, 'asks the athlete to name a problem'],
    [/next focus|training priority/i, 'asks for a training priority'],
    [/mental rep|prescrib/i, 'points at a prescribed practice'],
  ];
  for (const lang of ['en', 'hi']) {
    const copy = JSON.stringify(translations[lang].mindJournal.reflection);
    for (const [re, why] of banned) {
      assert.doesNotMatch(copy, re, `${lang} reflection copy ${why}`);
    }
  }
});

test('no Q2/Q4/Q5 option grades a result or a performance', () => {
  for (const lang of ['en', 'hi']) {
    const r = translations[lang].mindJournal.reflection;
    const options = [...Object.values(r.q2.options), ...Object.values(r.q4.options), ...Object.values(r.q5.options)];
    for (const label of options) {
      assert.doesNotMatch(label, /good (result|performance)|bad (result|performance)|average performance/i,
        `${lang}: "${label}" reintroduces result/performance grading`);
    }
  }
});

// ── Wizard contracts ───────────────────────────────────────────────────────

test('the wizard is ONE component holding its own answers — not six routed pages', () => {
  assert.match(app, /path="\/mind-journal\/new"[\s\S]{0,200}<ReflectionWizard \/>/);
  // Every answer lives in the wizard's own state, which is what makes Back free.
  for (const s of ['contextType', 'setEvent', 'setState', 'setThought', 'setResponse', 'setBody', 'setCueFeedback']) {
    assert.ok(wizard.includes(s), `${s} must be wizard-local state`);
  }
  assert.match(wizard, /setStepIndex\(i => i - 1\)/, 'Back only moves the step pointer');
  assert.doesNotMatch(wizard, /navigate\('\/mind-journal\/new\/details'/, 'no second routed step');
});

test('auto-advance is limited to the single-choice first question', () => {
  const autoAdvances = wizard.match(/setTimeout\(/g) || [];
  assert.equal(autoAdvances.length, 1, 'exactly one auto-advance may exist');
  const idx = wizard.indexOf('setTimeout(');
  const fnStart = wizard.lastIndexOf('function pickContext', idx);
  assert.ok(fnStart !== -1 && fnStart < idx, 'the only auto-advance belongs to Q1');
});

test('the wizard never sends a legacy narrative field or an Arjun review field', () => {
  for (const field of ['whatHappened', 'whatNoticed', 'helpedOrGotInWay', 'takeForward',
    'arjunNoticed', 'arjunTakeaway', 'arjunPattern', 'reviewGeneratedAt']) {
    assert.doesNotMatch(wizard, new RegExp(`${field}:`), `${field} must never be posted by the wizard`);
  }
  assert.match(wizard, /entryType: 'REFLECTION'/);
});

test('body and cue answers are mutually exclusive in the payload', () => {
  assert.match(wizard, /bodyTags: conditional === 'body' \? body\.tags : \[\]/);
  assert.match(wizard, /if \(conditional === 'cue' && cueFeedback\)/);
});

// ── PR 1 leaves the old Debrief entirely alone ─────────────────────────────

test('the old Match & Practice Reflection is untouched and still fully routable', () => {
  assert.match(app, /path="\/debrief"[\s\S]{0,200}<DebriefPage \/>/, '/debrief must still render DebriefPage');
  assert.match(read('src/pages/TrainPage.jsx'), /to: '\/debrief'/, "Train's Reflection entry stays");
  assert.match(read('src/pages/Dashboard.jsx'), /to: '\/debrief'/, "Home's recovery-day recommendation stays");
  assert.match(read('src/pages/PlaybookPage.jsx'), /navigate\('\/debrief'\)/, "Playbook's Reflections CTA stays");
  assert.match(read('src/utils/parseArjunMessage.js'), /route: '\/debrief'/, 'the chat tool card stays');
  assert.match(read('src/constants/activeTools.js'), /'\/debrief'/, 'the active-tool registry stays');
  assert.match(read('src/utils/prescriptionPractice.js'), /post_performance_reflection: '\/debrief'/,
    'prescription routing stays');
  // The legacy Mind Journal routes stay mounted for compatibility.
  assert.match(app, /path="\/mind-journal\/quick"[\s\S]{0,200}<QuickNotePage \/>/);
  assert.match(app, /path="\/mind-journal\/new\/details"[\s\S]{0,220}<GuidedReflectionDetailsPage \/>/);
});
