// Performance Pattern single-choice pass: every structured question that
// feeds Trigger/Reaction/Effect/Duration allows exactly one answer, every one
// of them offers a custom "something else" answer, the server rejects >1
// answer for these questions (config-driven, same validator as before), and
// a custom answer becomes a real observation shown verbatim in the profile
// pattern — never silently dropped, never labelled "Something else".
//
// No real database. Pure config/validator/rule-engine/display units, same
// style as onboardingConfig.test.js and startingProfileRules.test.js.

const test = require('node:test');
const assert = require('node:assert/strict');

const C = require('../src/onboarding/config');
const { validateAnswers } = require('../src/onboarding/validate');
const { buildRuleOutput } = require('../src/profile/ruleEngine');
const { buildStartingPattern } = require('../src/profile/displayProfile');
const cfg = require('../src/profile/ruleConfig');

// Every question this pass converted to single-choice, grouped by what it
// feeds — the exact IDs identified by inspecting ruleConfig.js's CLAUSE map
// (reaction/effect dim per question) and ruleEngine.js (duration = any
// question id ending `_recovery`/`_duration`).
const REACTION_QIDS = [
  'mistakes_first_response', 'pre_performance_signs', 'focus_when', 'confidence_trigger',
  'motivation_when', 'coach_selection_moment', 'custom_response', 'unsure_recognition',
];
const EFFECT_QIDS = [
  'mistakes_next', 'pre_performance_effect', 'focus_effect', 'confidence_effect',
  'motivation_effect', 'coach_selection_effect', 'custom_effect',
];
const MIXED_QIDS = ['family_outside_effect', 'injury_concern']; // both dims on one question
const DURATION_QIDS = [
  'pre_performance_duration', 'mistakes_recovery', 'focus_recovery', 'confidence_recovery',
  'motivation_recovery', 'coach_selection_recovery', 'family_outside_recovery', 'injury_recovery',
  'unsure_recovery', 'custom_recovery',
];
const PATTERN_QIDS = [...REACTION_QIDS, ...EFFECT_QIDS, ...MIXED_QIDS, ...DURATION_QIDS];

// Unrelated multi-select questions this pass must NOT touch.
const UNTOUCHED_MULTI_QIDS = ['difficult_moments', 'contextual_pressures', 'supports', 'strengths', 'broad_goals'];

// ── 1–4. Config cardinality ──────────────────────────────────────────────

test('every Performance Pattern question is single-choice (type single, limit 1)', () => {
  for (const qid of PATTERN_QIDS) {
    const q = C.getQuestion(qid);
    assert.ok(q, `question '${qid}' missing from config`);
    assert.equal(q.type, 'single', `${qid}.type`);
    assert.equal(q.limit, 1, `${qid}.limit`);
  }
});

test('Trigger\'s own question (primary_priority) was already single-choice — untouched', () => {
  const q = C.getQuestion('primary_priority');
  assert.equal(q.type, 'single');
  assert.equal(q.limit, 1);
});

test('unrelated multi-select questions keep their existing limits', () => {
  for (const qid of UNTOUCHED_MULTI_QIDS) {
    const q = C.getQuestion(qid);
    assert.equal(q.type, 'multi', `${qid}.type`);
    assert.ok(q.limit > 1, `${qid}.limit should still allow more than one`);
  }
});

test('every Performance Pattern question offers a custom answer', () => {
  for (const qid of PATTERN_QIDS) {
    const ids = C.answerIdsFor(qid);
    const customIds = ids.filter((id) => C.isCustom(qid, id));
    assert.equal(customIds.length, 1, `${qid} should offer exactly one custom answer`);
  }
});

// ── 5–8. Server validation (config-driven — validate.js itself is untouched) ─

// Branch-consistency context: mistakes_first_response is scoped to the
// 'mistakes' branch, so merged must resolve there — same fixture shape as
// onboardingConfig.test.js's own branch-mismatch tests.
const MISTAKES_MERGED = {
  difficult_moments: { answerIds: ['after_mistake'] },
  primary_priority: { answerIds: ['after_mistake'] },
};

test('validateAnswers rejects more than one answer for a single-choice Pattern question', () => {
  const r = validateAnswers({ mistakes_first_response: { answerIds: ['keep_thinking', 'angry_self'] } }, MISTAKES_MERGED);
  assert.equal(r.ok, false);
  assert.equal(r.code, 'LIMIT_EXCEEDED');
});

test('validateAnswers accepts exactly one predefined answer', () => {
  const r = validateAnswers({ mistakes_first_response: { answerIds: ['keep_thinking'] } }, MISTAKES_MERGED);
  assert.equal(r.ok, true);
});

test('validateAnswers accepts exactly one custom answer with valid text', () => {
  const r = validateAnswers({ mistakes_first_response: { answerIds: ['something_else'], customText: 'I go quiet' } }, MISTAKES_MERGED);
  assert.equal(r.ok, true);
  assert.equal(r.cleaned.mistakes_first_response.customText, 'I go quiet');
});

test('a predefined answer plus a custom answer together is rejected (limit 1 covers both at once)', () => {
  const r = validateAnswers({ mistakes_first_response: { answerIds: ['keep_thinking', 'something_else'], customText: 'x' } }, MISTAKES_MERGED);
  assert.equal(r.ok, false);
  assert.equal(r.code, 'LIMIT_EXCEEDED');
});

test('an unrelated multi-select question is unaffected — 3 answers still valid', () => {
  const r = validateAnswers({ strengths: { answerIds: ['hard_working', 'brave', 'calm'] } }, {});
  assert.equal(r.ok, true);
});

// ── 9–12. Rule engine: custom answers become real, verbatim observations ────

function sessionWith(branchId, priorityId, extraAnswers) {
  return {
    id: 'os-t', userId: 'u1', branchId, primaryPriorityId: priorityId,
    answers: {
      sport: { answerIds: ['cricket'] }, role_position: { answerIds: ['batter'] },
      competition_level: { answerIds: ['state'] }, experience_level: { answerIds: ['competitive'] },
      difficult_moments: { answerIds: [priorityId] }, primary_priority: { answerIds: [priorityId] },
      broad_goals: { answerIds: ['focus'] }, four_week_outcome: { answerIds: ['recover_faster'] },
      ...extraAnswers,
    },
  };
}

test('a custom reaction answer is never silently dropped — it becomes a real reaction observation carrying the athlete\'s own text', () => {
  const session = sessionWith('mistakes', 'after_mistake', {
    mistakes_first_response: { answerIds: ['something_else'], customText: 'I go completely silent' },
    mistakes_next: { answerIds: ['hesitate'] },
    mistakes_recovery: { answerIds: ['few_minutes'] },
  });
  const ro = buildRuleOutput(session);
  const obs = ro.observations.find((o) => o.questionId === 'mistakes_first_response');
  assert.ok(obs, 'custom answer must still produce an observation');
  assert.equal(obs.dim, 'reaction');
  assert.equal(obs.customText, 'I go completely silent');
});

test('a custom duration answer becomes a verbatim duration observation, not silently dropped and not guessed as quick/prolonged', () => {
  const session = sessionWith('mistakes', 'after_mistake', {
    mistakes_first_response: { answerIds: ['keep_thinking'] },
    mistakes_next: { answerIds: ['hesitate'] },
    mistakes_recovery: { answerIds: ['something_else'], customText: 'until the next time-out' },
  });
  const ro = buildRuleOutput(session);
  const obs = ro.observations.find((o) => o.questionId === 'mistakes_recovery');
  assert.ok(obs);
  assert.equal(obs.dim, 'duration');
  assert.equal(obs.customText, 'until the next time-out');
  assert.equal(ro.resilience, false, 'a custom duration answer is not assumed to be a quick recovery');
});

test('a custom answer on a mixed reaction/effect question (family_outside_effect) resolves to effect, by the question\'s structural position, not a guess about the athlete', () => {
  const session = sessionWith('family_outside', 'family_expectations', {
    family_outside_source: { answerIds: ['parents'] },
    family_outside_effect: { answerIds: ['something_else'], customText: 'I stop enjoying it entirely' },
    family_outside_recovery: { answerIds: ['few_minutes'] },
  });
  const ro = buildRuleOutput(session);
  const obs = ro.observations.find((o) => o.questionId === 'family_outside_effect');
  assert.ok(obs);
  assert.equal(obs.dim, 'effect');
  assert.equal(obs.customText, 'I stop enjoying it entirely');
});

test('a custom answer on the other mixed question (injury_concern) also resolves to effect', () => {
  const session = sessionWith('injury', 'injury_return', {
    injury_stage: { answerIds: ['returned_building_back'] },
    injury_concern: { answerIds: ['something_else'], customText: 'worried I will let the team down' },
    injury_recovery: { answerIds: ['few_minutes'] },
  });
  const ro = buildRuleOutput(session);
  const obs = ro.observations.find((o) => o.questionId === 'injury_concern');
  assert.ok(obs);
  assert.equal(obs.dim, 'effect');
});

test('cfg.questionDim derives a pure question\'s dim from CLAUSE itself — no duplicated id list', () => {
  assert.equal(cfg.questionDim('mistakes_first_response'), 'reaction');
  assert.equal(cfg.questionDim('mistakes_next'), 'effect');
  assert.equal(cfg.questionDim('family_outside_effect'), 'effect');
  assert.equal(cfg.questionDim('injury_concern'), 'effect');
});

// ── 13–15. Profile pattern output: custom text displays verbatim ────────────

test('buildStartingPattern shows a custom reaction verbatim, not the raw id and not a "Something else" label', () => {
  const ruleOutput = {
    priorityId: 'after_mistake', suggestedPriorityId: 'after_mistake', recognition: null, branch: 'mistakes',
    observations: [
      { code: 'mistakes_first_response:something_else', dim: 'reaction', questionId: 'mistakes_first_response', answerId: 'something_else', customText: 'I go completely silent' },
      { code: 'mistakes_next:hesitate', dim: 'effect', questionId: 'mistakes_next', answerId: 'hesitate' },
    ],
  };
  const { nodes } = buildStartingPattern(ruleOutput, 'en');
  const reactionNode = nodes.find((n) => n.type === 'reaction');
  assert.ok(reactionNode);
  assert.equal(reactionNode.text, 'I go completely silent');
  assert.notEqual(reactionNode.text, 'something_else');
  assert.doesNotMatch(reactionNode.text, /something else/i);
});

test('buildStartingPattern shows a custom effect verbatim alongside a predefined reaction — mixed custom/predefined works exactly the same way', () => {
  const ruleOutput = {
    priorityId: 'after_mistake', suggestedPriorityId: 'after_mistake', recognition: null, branch: 'mistakes',
    observations: [
      { code: 'mistakes_first_response:angry_self', dim: 'reaction', questionId: 'mistakes_first_response', answerId: 'angry_self' },
      { code: 'mistakes_next:something_else', dim: 'effect', questionId: 'mistakes_next', answerId: 'something_else', customText: 'My decisions get messy' },
    ],
  };
  const { nodes } = buildStartingPattern(ruleOutput, 'en');
  assert.equal(nodes.find((n) => n.type === 'reaction').text, 'frustration with yourself can rise');
  assert.equal(nodes.find((n) => n.type === 'effect').text, 'My decisions get messy');
});

test('Duration stays out of the main pattern overview\'s 3 conceptual stages — buildStartingPattern still returns it (Check-in owns showing/hiding it), the client overview is what omits it', () => {
  const ruleOutput = {
    priorityId: 'after_mistake', suggestedPriorityId: 'after_mistake', recognition: null, branch: 'mistakes',
    observations: [
      { code: 'mistakes_first_response:angry_self', dim: 'reaction', questionId: 'mistakes_first_response', answerId: 'angry_self' },
      { code: 'mistakes_recovery:something_else', dim: 'duration', questionId: 'mistakes_recovery', answerId: 'something_else', customText: 'until the next time-out' },
    ],
  };
  const { nodes } = buildStartingPattern(ruleOutput, 'en');
  const durationNode = nodes.find((n) => n.type === 'duration');
  assert.ok(durationNode, 'duration is still part of the server payload, only the client overview omits it');
  assert.equal(durationNode.text, 'until the next time-out');
});
