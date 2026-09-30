// Routine Builder (PR 3) — pure draft helpers. Real behavioural tests via
// node:test: no React, no network, no storage.

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  LIMITS, SITUATIONS, PURPOSES, needsTimingQuestion, timeWindowFor, suggestionRequest,
  defaultRoutineName, draftFromSuggestion, editStep, deleteStep, moveStep, addStep,
  canSave, buildSaveBody, readRoutineResponse,
} from '../src/pages/routines/builderDraft.js';

const SUGGESTED = [
  { kind: 'custom', instruction: 'Towel off', cue: null, origin: 'existing' },
  { kind: 'custom', instruction: 'Tap the line twice', cue: null, origin: 'existing' },
  { kind: 'prepare', instruction: 'Choose your plan for the next action', cue: null, origin: 'suggested' },
];
const SUGGESTION = { templateKey: 'repeated_moment.seconds.focus', templateVersion: 1 };
const save = (steps, extra = {}) => buildSaveBody({
  name: 'Between points', category: 'repeated_moment', moment: ' After every point ',
  purposeText: 'Focus on the next action', steps, suggestion: SUGGESTION, ...extra,
});

test('situations and purposes use only the existing categories and purpose keys', () => {
  assert.deepEqual([...SITUATIONS].sort(), ['own_situation', 'pressure_moment', 'repeated_moment', 'session_preparation']);
  assert.deepEqual(PURPOSES, ['settle', 'reset', 'focus', 'confidence', 'activate', 'prepare', 'not_sure']);
});

test('timing is only asked for pressure moments and own situations; defaults are sent explicitly', () => {
  assert.equal(needsTimingQuestion('repeated_moment'), false);
  assert.equal(needsTimingQuestion('session_preparation'), false);
  assert.equal(needsTimingQuestion('pressure_moment'), true);
  assert.equal(needsTimingQuestion('own_situation'), true);
  assert.equal(timeWindowFor('repeated_moment', 'longer'), 'seconds', 'default wins over a stale choice');
  assert.equal(timeWindowFor('session_preparation'), 'longer');
  assert.equal(timeWindowFor('pressure_moment', 'short'), 'short');
});

test('suggestion request carries structured inputs only, with habits verbatim', () => {
  assert.deepEqual(
    suggestionRequest({ category: 'pressure_moment', purposeKey: 'settle', timeWindow: 'seconds', habits: [' Bounce  twice '] }),
    { category: 'pressure_moment', purposeKey: 'settle', timeWindow: 'seconds', existingHabits: [' Bounce  twice '] },
  );
  assert.deepEqual(suggestionRequest({ category: 'repeated_moment', purposeKey: 'not_sure', habits: [] }),
    { category: 'repeated_moment', purposeKey: 'not_sure', timeWindow: 'seconds' });
});

test('default name comes from the moment, collapses whitespace and respects 60 characters', () => {
  assert.equal(defaultRoutineName('  After   every point ', 'Between repeated actions'), 'After every point');
  const long = 'Standing at the top of my run up before the final over when the whole team is watching me';
  const name = defaultRoutineName(long, 'In a pressure moment');
  assert.ok(name.length <= LIMITS.NAME, name);
  assert.ok(long.startsWith(name));
  assert.ok(!name.endsWith(' '));
  assert.equal(defaultRoutineName('x'.repeat(80), 'Fallback').length, LIMITS.NAME);
  assert.equal(defaultRoutineName('   ', 'In a pressure moment'), 'In a pressure moment');
});

test('existingHabits in the save body follow the final reviewed existing steps: edit, delete, reorder', () => {
  let steps = draftFromSuggestion(SUGGESTED);
  assert.deepEqual(save(steps).existingHabits, ['Towel off', 'Tap the line twice']);

  const [towel, tap] = steps;
  steps = editStep(steps, tap.key, 'Tap the line three times');
  assert.deepEqual(save(steps).existingHabits, ['Towel off', 'Tap the line three times']);
  assert.equal(steps[1].origin, 'existing', 'an edited habit is still the athlete\'s own habit');

  steps = moveStep(steps, tap.key, 'up');
  assert.deepEqual(save(steps).existingHabits, ['Tap the line three times', 'Towel off']);

  steps = deleteStep(steps, towel.key);
  assert.deepEqual(save(steps).existingHabits, ['Tap the line three times']);
  assert.deepEqual(save(steps).steps.map(s => s.instruction), ['Tap the line three times', 'Choose your plan for the next action']);

  steps = deleteStep(steps, tap.key);
  assert.deepEqual(save(steps).existingHabits, []);
});

test('editing a suggested step makes it custom; restoring the exact text makes it suggested again', () => {
  let steps = draftFromSuggestion(SUGGESTED);
  const key = steps[2].key;
  steps = editStep(steps, key, 'Choose my plan: serve wide');
  assert.equal(steps[2].origin, 'custom');
  steps = editStep(steps, key, 'Choose your plan for the next action');
  assert.equal(steps[2].origin, 'suggested');
});

test('added steps are custom, the 5-step maximum holds, and moves stay in bounds', () => {
  let steps = draftFromSuggestion(SUGGESTED);
  steps = addStep(steps);
  assert.deepEqual({ kind: steps[3].kind, origin: steps[3].origin, instruction: steps[3].instruction }, { kind: 'custom', origin: 'custom', instruction: '' });
  steps = addStep(addStep(addStep(steps)));
  assert.equal(steps.length, LIMITS.MAX_STEPS);
  assert.equal(moveStep(steps, steps[0].key, 'up'), steps);
  assert.equal(moveStep(steps, steps[4].key, 'down'), steps);
});

test('save body: trimmed name and moment, purpose text not purposeKey, no ids, no suggestion-only inputs', () => {
  const body = save(draftFromSuggestion(SUGGESTED), { role: ' Singles ' });
  assert.equal(body.moment, 'After every point');
  assert.equal(body.purpose, 'Focus on the next action');
  assert.equal(body.role, 'Singles');
  assert.equal(body.templateKey, 'repeated_moment.seconds.focus');
  assert.equal(body.templateVersion, 1);
  for (const key of ['purposeKey', 'timeWindow', 'matchType', 'reasons']) assert.ok(!(key in body), key);
  assert.ok(body.steps.every(s => Object.keys(s).sort().join() === 'cue,instruction,kind,origin' && s.cue === null));
  assert.equal(save([], { purposeText: null }).purpose, null);
  assert.ok(!('role' in save([], { role: '' })));
});

test('canSave requires a name within 60 characters and 1–5 non-empty steps', () => {
  const steps = draftFromSuggestion(SUGGESTED);
  assert.equal(canSave({ name: 'A', steps }), true);
  assert.equal(canSave({ name: '  ', steps }), false);
  assert.equal(canSave({ name: 'x'.repeat(61), steps }), false);
  assert.equal(canSave({ name: 'A', steps: [] }), false);
  assert.equal(canSave({ name: 'A', steps: addStep(steps) }), false, 'empty added step');
});

test('response reader: safety is recognised on any status, never as success or a generic error', async () => {
  const res = (status, body) => ({ status, ok: status >= 200 && status < 300, json: async () => body });
  const flagged = { safetyFlag: 'needs_support', guidance: 'Please talk to a trusted adult.' };
  assert.deepEqual(await readRoutineResponse(res(200, flagged)), { type: 'safety', guidance: flagged.guidance });
  assert.deepEqual(await readRoutineResponse(res(422, { error: 'needs_support', ...flagged })), { type: 'safety', guidance: flagged.guidance });
  assert.deepEqual(await readRoutineResponse(res(409, { error: 'routine_limit_reached' })), { type: 'limit' });
  assert.equal((await readRoutineResponse(res(201, { routine: { id: 'r1' } }))).type, 'ok');
  assert.deepEqual(await readRoutineResponse(res(400, { error: 'invalid_steps' })), { type: 'error', error: 'invalid_steps' });
  assert.deepEqual(await readRoutineResponse({ status: 500, ok: false, json: async () => { throw new Error('x'); } }), { type: 'error', error: null });
});
