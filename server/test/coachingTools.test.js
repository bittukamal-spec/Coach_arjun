// Unit tests for the coaching tool validators and the approved practice
// allowlist (PR-10). Pure functions — no Anthropic, no database.

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  COACHING_TOOLS,
  LIMITS,
  QUICK_REPLY_LIMITS,
  validateProposeBarrier,
  validatePrescribeMentalRep,
  validateOfferQuickReplies,
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

test('all three coaching tools are defined with the expected names and required fields', () => {
  const names = COACHING_TOOLS.map((t) => t.name);
  assert.deepEqual(names, ['propose_barrier', 'prescribe_mental_rep', 'offer_quick_replies']);
  const propose = COACHING_TOOLS[0];
  assert.deepEqual(propose.input_schema.required, ['problemStatement', 'barrierHypothesis']);
  const prescribe = COACHING_TOOLS[1];
  assert.deepEqual(prescribe.input_schema.required, ['barrierConfirmationStatus', 'finalBarrierHypothesis', 'practiceKey', 'situation', 'cardContent']);
  const offerQuickReplies = COACHING_TOOLS[2];
  assert.deepEqual(offerQuickReplies.input_schema.required, ['replies']);
  assert.equal(offerQuickReplies.input_schema.properties.replies.minItems, 2);
  assert.equal(offerQuickReplies.input_schema.properties.replies.maxItems, 3);
});

// ── offer_quick_replies tool description: mandatory bounded-question rule ───

test('offer_quick_replies tool description: mandatory for a clearly bounded 2-3 option question', () => {
  const description = COACHING_TOOLS.find((t) => t.name === 'offer_quick_replies').description;
  assert.match(description, /REQUIRED whenever your final question has exactly 2 or 3 clear, short, non-sensitive answer categories/i);
  assert.match(description, /call it in the same request rather than merely writing the options in your message text/i);
});

test('offer_quick_replies tool description: open-ended, over-three-answer, and sensitive/safety questions are explicitly exempt', () => {
  const description = COACHING_TOOLS.find((t) => t.name === 'offer_quick_replies').description;
  assert.match(description, /when the question is open-ended with no small fixed set of likely answers/i);
  assert.match(description, /when the athlete needs to explain something in their own words/i);
  assert.match(description, /when there are more than three meaningfully different answers/i);
  assert.match(description, /crisis, abuse, injury, or immediate-danger discussion/i);
});

test('offer_quick_replies tool description: prohibits chips alongside a new prescription card', () => {
  const description = COACHING_TOOLS.find((t) => t.name === 'offer_quick_replies').description;
  assert.match(description, /Do not call this in the same reply as prescribe_mental_rep/i);
  assert.match(description, /the practice card takes that reply's place, never chips/i);
});

test('offer_quick_replies tool description: labels are athlete-language not clinical, avoid near-duplicates, and "Write my own" stays client-owned', () => {
  const description = COACHING_TOOLS.find((t) => t.name === 'offer_quick_replies').description;
  assert.match(description, /in the athlete's own words rather than clinical labels/i);
  assert.match(description, /avoid near-duplicates/i);
  assert.match(description, /never include "Other", "Something else", or "Write my own" yourself/i);
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

// ── offer_quick_replies ──────────────────────────────────────────────────────

test('offer_quick_replies: accepts a valid 2-label payload', () => {
  const v = validateOfferQuickReplies({ replies: ["I'm going to get out", "I can't bat today"] });
  assert.equal(v.ok, true);
  assert.deepEqual(v.replies, ["I'm going to get out", "I can't bat today"]);
});

test('offer_quick_replies: accepts a valid 3-label payload', () => {
  const v = validateOfferQuickReplies({ replies: ['Yes, that feels right', 'Not quite', 'It happens before every match'] });
  assert.equal(v.ok, true);
  assert.equal(v.replies.length, 3);
});

test('offer_quick_replies: trims whitespace from each label', () => {
  const v = validateOfferQuickReplies({ replies: ['  Yes, that feels right  ', ' Not quite '] });
  assert.equal(v.ok, true);
  assert.deepEqual(v.replies, ['Yes, that feels right', 'Not quite']);
});

test('offer_quick_replies: rejects fewer than 2 or more than 3 replies', () => {
  assert.equal(validateOfferQuickReplies({ replies: [] }).ok, false);
  assert.equal(validateOfferQuickReplies({ replies: ['Only one'] }).ok, false);
  assert.equal(validateOfferQuickReplies({ replies: ['One', 'Two', 'Three', 'Four'] }).ok, false);
  assert.equal(QUICK_REPLY_LIMITS.min, 2);
  assert.equal(QUICK_REPLY_LIMITS.max, 3);
});

test('offer_quick_replies: rejects empty or blank labels', () => {
  assert.equal(validateOfferQuickReplies({ replies: ['', 'Not quite'] }).ok, false);
  assert.equal(validateOfferQuickReplies({ replies: ['   ', 'Not quite'] }).ok, false);
});

test('offer_quick_replies: rejects duplicate labels (case-insensitive)', () => {
  assert.equal(validateOfferQuickReplies({ replies: ['Yes', 'Yes'] }).ok, false);
  assert.equal(validateOfferQuickReplies({ replies: ['Yes', 'yes'] }).ok, false, 'duplicates must be caught case-insensitively');
});

test('offer_quick_replies: rejects labels over the length limit', () => {
  const long = 'a'.repeat(QUICK_REPLY_LIMITS.maxLabelLength + 1);
  assert.equal(validateOfferQuickReplies({ replies: [long, 'Not quite'] }).ok, false);
  const atLimit = 'a'.repeat(QUICK_REPLY_LIMITS.maxLabelLength);
  assert.equal(validateOfferQuickReplies({ replies: [atLimit, 'Not quite'] }).ok, true);
});

test('offer_quick_replies: rejects labels containing legacy markers, tool/JSON syntax, HTML, or control characters', () => {
  const badLabels = [
    '[APP:body-reset]',
    '[SUGGEST: Yes | No]',
    '<script>alert(1)</script>',
    '{"tool":"x"}',
    'Line one\nline two',
    'Tab\there',
  ];
  for (const bad of badLabels) {
    const v = validateOfferQuickReplies({ replies: [bad, 'Not quite'] });
    assert.equal(v.ok, false, `expected "${bad}" to be rejected`);
  }
});

test('offer_quick_replies: rejects "Other" / "Something else" / "Write my own" — the client adds that itself', () => {
  for (const reserved of ['Other', 'other', 'Something else', 'Write my own', 'write my own answer']) {
    const v = validateOfferQuickReplies({ replies: ['Yes, that feels right', reserved] });
    assert.equal(v.ok, false, `expected "${reserved}" to be rejected`);
  }
});

test('offer_quick_replies: rejects malformed payloads', () => {
  for (const input of [null, undefined, {}, { replies: 'not an array' }, { replies: [1, 2] }, 'text', 42]) {
    assert.equal(validateOfferQuickReplies(input).ok, false);
  }
});
