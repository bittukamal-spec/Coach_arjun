// Unit tests for the coaching tool validators and the approved practice
// allowlist (PR-10). Pure functions — no Anthropic, no database.

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  COACHING_TOOLS,
  LIMITS,
  validateProposeBarrier,
  validatePrescribeMentalRep,
} = require('../src/services/coaching/coachingTools');
const { APPROVED_PRACTICE_KEYS, isApprovedPracticeKey } = require('../src/services/coaching/practiceRegistry');

const NO_STATE = { hasActiveSelection: false, cycleStatus: null, barrierConfirmationStatus: null, hasPrescription: false };
const PENDING_STATE = { hasActiveSelection: true, cycleStatus: 'ACTIVE', barrierConfirmationStatus: 'PENDING', hasPrescription: false };

function validPrescription(overrides = {}) {
  return {
    barrierConfirmationStatus: 'CONFIRMED',
    finalBarrierHypothesis: 'Pressure makes his body rush in the final overs',
    practiceKey: 'pressure_reset',
    situation: 'Bowling the final over in league matches',
    cardContent: 'Before each ball in the final over: one slow breath out, feel your feet, then bowl.',
    cueWord: 'Steady',
    ...overrides,
  };
}

// ── Allowlist ────────────────────────────────────────────────────────────────

test('the approved practice allowlist matches the spec §3.2 non-game set exactly', () => {
  assert.deepEqual([...APPROVED_PRACTICE_KEYS].sort(), [
    'acclimatization_homework',
    'attentional_routine',
    'focus_cue_building',
    'guided_rehearsal',
    'mistake_reset_routine',
    'post_performance_reflection',
    'pre_performance_routine',
    'pressure_reset',
  ]);
});

test('games and paused tools are not approved practice keys', () => {
  for (const key of ['focus_lock', 'reset_rally', 'grid', 'stroop', 'games', 'reaction']) {
    assert.equal(isApprovedPracticeKey(key), false, `${key} must not be prescribable`);
  }
  assert.equal(isApprovedPracticeKey(''), false);
  assert.equal(isApprovedPracticeKey(null), false);
  assert.equal(isApprovedPracticeKey('hasOwnProperty'), false, 'prototype names must not slip through');
});

test('both coaching tools are defined with the expected names and required fields', () => {
  const names = COACHING_TOOLS.map((t) => t.name);
  assert.deepEqual(names, ['propose_barrier', 'prescribe_mental_rep']);
  const propose = COACHING_TOOLS[0];
  assert.deepEqual(propose.input_schema.required, ['problemStatement', 'barrierHypothesis']);
  const prescribe = COACHING_TOOLS[1];
  assert.deepEqual(prescribe.input_schema.required, ['barrierConfirmationStatus', 'finalBarrierHypothesis', 'practiceKey', 'situation', 'cardContent']);
});

// ── propose_barrier ──────────────────────────────────────────────────────────

test('propose_barrier: accepts a valid payload when no active selection exists', () => {
  const v = validateProposeBarrier(
    { problemStatement: 'Freezes on penalty kicks in real matches', barrierHypothesis: 'Fear of failure under expectations' },
    NO_STATE
  );
  assert.equal(v.ok, true);
});

test('propose_barrier: rejects malformed payloads', () => {
  for (const input of [null, undefined, 'text', 42, {}, { problemStatement: 'x' }, { barrierHypothesis: 'x' }]) {
    assert.equal(validateProposeBarrier(input, NO_STATE).ok, false);
  }
});

test('propose_barrier: rejects empty and over-length fields', () => {
  assert.equal(validateProposeBarrier({ problemStatement: '   ', barrierHypothesis: 'x' }, NO_STATE).ok, false);
  assert.equal(validateProposeBarrier({ problemStatement: 'x', barrierHypothesis: '' }, NO_STATE).ok, false);
  assert.equal(
    validateProposeBarrier({ problemStatement: 'p'.repeat(LIMITS.problemStatement + 1), barrierHypothesis: 'x' }, NO_STATE).ok,
    false
  );
  assert.equal(
    validateProposeBarrier({ problemStatement: 'x', barrierHypothesis: 'b'.repeat(LIMITS.barrierHypothesis + 1) }, NO_STATE).ok,
    false
  );
});

test('propose_barrier: rejected while any active selection exists (no second cycle)', () => {
  const v = validateProposeBarrier(
    { problemStatement: 'A new problem', barrierHypothesis: 'A new barrier' },
    PENDING_STATE
  );
  assert.equal(v.ok, false);
  assert.match(v.error, /already has an open coaching cycle/i);
});

// ── prescribe_mental_rep ─────────────────────────────────────────────────────

test('prescribe_mental_rep: accepts a valid CONFIRMED payload against a pending active cycle', () => {
  assert.equal(validatePrescribeMentalRep(validPrescription(), PENDING_STATE).ok, true);
});

test('prescribe_mental_rep: accepts CORRECTED and a null/omitted cueWord', () => {
  assert.equal(validatePrescribeMentalRep(validPrescription({ barrierConfirmationStatus: 'CORRECTED' }), PENDING_STATE).ok, true);
  assert.equal(validatePrescribeMentalRep(validPrescription({ cueWord: null }), PENDING_STATE).ok, true);
  const noCue = validPrescription();
  delete noCue.cueWord;
  assert.equal(validatePrescribeMentalRep(noCue, PENDING_STATE).ok, true);
});

test('prescribe_mental_rep: rejects invalid confirmation values', () => {
  for (const status of ['PENDING', 'DONE', '', null, undefined, 'confirmed']) {
    assert.equal(validatePrescribeMentalRep(validPrescription({ barrierConfirmationStatus: status }), PENDING_STATE).ok, false);
  }
});

test('prescribe_mental_rep: rejects unapproved, game, and invented practice keys', () => {
  for (const key of ['focus_lock', 'reset_rally', 'made_up_practice', 'visualization_marathon', '', null]) {
    const v = validatePrescribeMentalRep(validPrescription({ practiceKey: key }), PENDING_STATE);
    assert.equal(v.ok, false, `practiceKey "${key}" must be rejected`);
  }
});

test('prescribe_mental_rep: rejects incomplete or over-length payloads', () => {
  assert.equal(validatePrescribeMentalRep(null, PENDING_STATE).ok, false);
  assert.equal(validatePrescribeMentalRep({}, PENDING_STATE).ok, false);
  assert.equal(validatePrescribeMentalRep(validPrescription({ situation: '' }), PENDING_STATE).ok, false);
  assert.equal(validatePrescribeMentalRep(validPrescription({ cardContent: '  ' }), PENDING_STATE).ok, false);
  assert.equal(validatePrescribeMentalRep(validPrescription({ cardContent: 'c'.repeat(LIMITS.cardContent + 1) }), PENDING_STATE).ok, false);
  assert.equal(validatePrescribeMentalRep(validPrescription({ cueWord: 'w'.repeat(LIMITS.cueWord + 1) }), PENDING_STATE).ok, false);
  assert.equal(validatePrescribeMentalRep(validPrescription({ cueWord: 42 }), PENDING_STATE).ok, false);
});

test('prescribe_mental_rep: rejected without an active pending cycle', () => {
  assert.equal(validatePrescribeMentalRep(validPrescription(), NO_STATE).ok, false);
  assert.equal(
    validatePrescribeMentalRep(validPrescription(), { ...PENDING_STATE, cycleStatus: 'RESOLVED' }).ok,
    false
  );
  assert.equal(
    validatePrescribeMentalRep(validPrescription(), { ...PENDING_STATE, barrierConfirmationStatus: 'CONFIRMED' }).ok,
    false
  );
});

test('prescribe_mental_rep: rejected when the selection already has an active prescription', () => {
  const v = validatePrescribeMentalRep(validPrescription(), { ...PENDING_STATE, hasPrescription: true });
  assert.equal(v.ok, false);
  assert.match(v.error, /already has an active prescription/i);
});
