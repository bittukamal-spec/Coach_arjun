// Ritual rebuild PR 1 — pure unit tests for routine validation and the
// legacy-ritual mapping. No database, no network, no AI.

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  LIMITS, validateCreateRoutine, validatePatchRoutine, bodyTooLarge, collectRoutineText, isValidRoutineId,
} = require('../src/services/routines/validateRoutine');
const {
  parseLegacySteps, legacyToRoutineSteps, routineStepsToLegacy, mergeLegacyIntoRoutineSteps,
} = require('../src/services/routines/legacyRitual');

function validBody(overrides = {}) {
  return {
    name: 'Between points',
    category: 'repeated_moment',
    moment: 'After every point',
    startTrigger: 'Ball goes dead',
    existingHabits: ['Fix my strings'],
    purpose: 'Let go of the last point',
    steps: [
      { kind: 'reset', instruction: 'Turn away and fix the strings', origin: 'existing' },
      { kind: 'prepare', instruction: 'Pick the next serve', cue: 'Next', origin: 'suggested' },
    ],
    ...overrides,
  };
}

test('create: accepts every category and normalizes text', () => {
  for (const category of ['repeated_moment', 'pressure_moment', 'session_preparation', 'own_situation']) {
    const r = validateCreateRoutine(validBody({ category, name: '  Padded  ' }));
    assert.equal(r.valid, true, category);
    assert.equal(r.value.name, 'Padded');
  }
});

test('create: steps get stable server-generated ids when absent; supplied ids are kept', () => {
  const r = validateCreateRoutine(validBody({
    steps: [{ kind: 'cue', instruction: 'Say it' }, { id: 'keep_me-1', kind: 'custom', instruction: 'x' }],
  }));
  assert.equal(r.valid, true);
  assert.match(r.value.steps[0].id, /^[0-9a-f-]{36}$/);
  assert.equal(r.value.steps[0].origin, 'custom');
  assert.equal(r.value.steps[0].cue, null);
  assert.equal(r.value.steps[1].id, 'keep_me-1');
});

test('create: missing required fields are rejected', () => {
  assert.equal(validateCreateRoutine(validBody({ name: undefined })).error, 'name_required');
  assert.equal(validateCreateRoutine(validBody({ name: '   ' })).error, 'name_required');
  assert.equal(validateCreateRoutine(validBody({ category: 'match_day' })).error, 'invalid_category');
  assert.equal(validateCreateRoutine(validBody({ steps: undefined })).error, 'invalid_steps');
});

test('create: invalid nested step payloads are rejected', () => {
  const cases = [
    [[], 'invalid_steps'],
    [Array.from({ length: LIMITS.MAX_STEPS + 1 }, () => ({ kind: 'cue', instruction: 'x' })), 'invalid_steps'],
    ['not-an-array', 'invalid_steps'],
    [[null], 'invalid_step'],
    [[['cue', 'x']], 'invalid_step'],
    [[{ kind: 'cue', instruction: 'x', score: 5 }], 'invalid_step'],
    [[{ kind: 'meditate', instruction: 'x' }], 'invalid_step_kind'],
    [[{ kind: 'cue', instruction: '   ' }], 'invalid_step_instruction'],
    [[{ kind: 'cue', instruction: 42 }], 'invalid_step_instruction'],
    [[{ kind: 'cue', instruction: 'x'.repeat(LIMITS.INSTRUCTION + 1) }], 'step_instruction_too_long'],
    [[{ kind: 'cue', instruction: 'x', cue: 'y'.repeat(LIMITS.CUE + 1) }], 'step_cue_too_long'],
    [[{ kind: 'cue', instruction: 'x', cue: 7 }], 'invalid_step_cue'],
    [[{ kind: 'cue', instruction: 'x', origin: 'ai' }], 'invalid_step_origin'],
    [[{ kind: 'cue', instruction: 'x', id: 'has space' }], 'invalid_step_id'],
    [[{ kind: 'cue', instruction: 'x', id: { $ne: 1 } }], 'invalid_step_id'],
    [[{ kind: 'cue', instruction: 'x', id: 'a' }, { kind: 'cue', instruction: 'y', id: 'a' }], 'duplicate_step_id'],
  ];
  for (const [steps, error] of cases) {
    assert.equal(validateCreateRoutine(validBody({ steps })).error, error, JSON.stringify(steps).slice(0, 60));
  }
});

test('create: string limits, habits, template metadata and unknown keys', () => {
  assert.equal(validateCreateRoutine(validBody({ name: 'n'.repeat(LIMITS.NAME + 1) })).error, 'name_too_long');
  assert.equal(validateCreateRoutine(validBody({ moment: 'm'.repeat(LIMITS.MOMENT + 1) })).error, 'moment_too_long');
  assert.equal(validateCreateRoutine(validBody({ role: 5 })).error, 'invalid_role');
  assert.equal(validateCreateRoutine(validBody({ existingHabits: 'bounce ball' })).error, 'invalid_existing_habits');
  assert.equal(validateCreateRoutine(validBody({ existingHabits: Array(LIMITS.MAX_HABITS + 1).fill('x') })).error, 'invalid_existing_habits');
  assert.equal(validateCreateRoutine(validBody({ existingHabits: ['h'.repeat(LIMITS.HABIT + 1)] })).error, 'existing_habit_too_long');
  assert.equal(validateCreateRoutine(validBody({ templateKey: 'Bad Key' })).error, 'invalid_template_key');
  assert.equal(validateCreateRoutine(validBody({ templateVersion: 1.5 })).error, 'invalid_template_version');
  assert.equal(validateCreateRoutine(validBody({ userId: 'someone-else' })).error, 'unexpected_field');
  assert.equal(validateCreateRoutine(validBody({ sourceRoutineId: 'bad id!' })).error, 'invalid_source_routine_id');
  assert.equal(validateCreateRoutine([]).error, 'invalid_body');
  assert.equal(validateCreateRoutine(null).error, 'invalid_body');

  const ok = validateCreateRoutine(validBody({ templateKey: 'between_points.v1', templateVersion: 1, sport: '', role: null }));
  assert.equal(ok.valid, true);
  assert.equal(ok.value.sport, null);
  assert.equal(ok.value.role, null);
});

test('patch: partial, non-empty, and cannot re-point adaptation lineage', () => {
  assert.equal(validatePatchRoutine({}).error, 'empty_patch');
  assert.equal(validatePatchRoutine({ sourceRoutineId: 'abc' }).error, 'unexpected_field');
  assert.equal(validatePatchRoutine({ name: '' }).error, 'name_required');
  const r = validatePatchRoutine({ purpose: 'Stay in the moment' });
  assert.deepEqual(r, { valid: true, value: { purpose: 'Stay in the moment' } });
});

test('request size, id shape and safety-text collection', () => {
  assert.equal(bodyTooLarge({ name: 'x'.repeat(LIMITS.MAX_BODY_BYTES) }), true);
  assert.equal(bodyTooLarge(validBody()), false);
  assert.equal(isValidRoutineId('clx123abc'), true);
  assert.equal(isValidRoutineId('../etc'), false);
  const text = collectRoutineText({ name: 'a', moment: 'b', existingHabits: ['c', 3], steps: [{ instruction: 'd', cue: 'e' }, null], extra: 'ignored' });
  assert.deepEqual(text, ['a', 'b', 'c', 'd', 'e']);
  assert.deepEqual(collectRoutineText('nope'), []);
});

test('legacy: parse preserves order and wording, tolerates bad data', () => {
  const raw = JSON.stringify([
    { type: 'breathe', label: 'Box breathing × 3 rounds' },
    { type: 'weird', label: '  Keep my spacing  ' },
    { type: 'cue', label: '' },
    'junk',
    { type: 'cue', label: "Say: 'Sharp and ready'" },
  ]);
  assert.deepEqual(parseLegacySteps(raw), [
    { type: 'breathe', label: 'Box breathing × 3 rounds' },
    { type: 'custom', label: '  Keep my spacing  ' },
    { type: 'cue', label: "Say: 'Sharp and ready'" },
  ]);
  assert.deepEqual(parseLegacySteps('{not json'), []);
  assert.deepEqual(parseLegacySteps(null), []);
  assert.deepEqual(parseLegacySteps('{"a":1}'), []);
});

test('legacy: routine steps round-trip to the legacy mirror; new kinds appear as custom', () => {
  const steps = legacyToRoutineSteps([{ type: 'physical', label: 'Jump 3 times' }, { type: 'cue', label: 'Sharp' }]);
  assert.deepEqual(steps.map(s => [s.kind, s.instruction, s.origin, s.cue]), [
    ['physical', 'Jump 3 times', 'custom', null], ['cue', 'Sharp', 'custom', null],
  ]);
  assert.deepEqual(routineStepsToLegacy([...steps, { kind: 'reset', instruction: 'Towel off' }]), [
    { type: 'physical', label: 'Jump 3 times' }, { type: 'cue', label: 'Sharp' }, { type: 'custom', label: 'Towel off' },
  ]);
});

test('legacy merge: unchanged positions keep id/kind/cue/origin; edits keep id and drop the stale cue', () => {
  const existing = [
    { id: 's1', kind: 'reset', instruction: 'Towel off', cue: 'Clean', origin: 'existing' },
    { id: 's2', kind: 'cue', instruction: 'Say next', cue: 'Next', origin: 'suggested' },
  ];
  const merged = mergeLegacyIntoRoutineSteps(existing, [
    { type: 'custom', label: 'Towel off' },
    { type: 'cue', label: 'Say ready' },
    { type: 'physical', label: 'Bounce twice' },
  ]);
  assert.deepEqual(merged[0], existing[0]);
  assert.deepEqual(merged[1], { id: 's2', kind: 'cue', instruction: 'Say ready', cue: null, origin: 'custom' });
  assert.equal(merged[2].kind, 'physical');
  assert.equal(merged[2].instruction, 'Bounce twice');
  assert.notEqual(merged[2].id, 's1');
  // Removing a step on the legacy side removes it here too.
  assert.equal(mergeLegacyIntoRoutineSteps(existing, [{ type: 'custom', label: 'Towel off' }]).length, 1);
});

test('legacy text collection for the safety screen: name plus every label, strings only', () => {
  const { collectLegacyRitualText } = require('../src/services/routines/legacyRitual');
  assert.deepEqual(collectLegacyRitualText('Name', [{ label: 'a' }, null, { label: 5 }, 'x', { label: 'b' }]), ['Name', 'a', 'b']);
  assert.deepEqual(collectLegacyRitualText(undefined, 'not-array'), []);
  assert.equal(collectLegacyRitualText('x'.repeat(5000), [])[0].length, 2000);
});
