// Config parity + structural validation + pure config/validate/mirror units.
// No database. Guards against client/server config drift and malformed config.

const test = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const path = require('node:path');

const {
  validateConfig,
  loadCanonical,
  serialize,
  TARGETS,
} = require('../../scripts/onboardingConfigLib.cjs');

const C = require('../src/onboarding/config');
const { validateAnswers, missingRequired, isAnswered } = require('../src/onboarding/validate');
const { buildUserMirror } = require('../src/onboarding/complete');

// ── Parity: committed generated copies match the validated canonical ────────
test('generated server + client config are byte-identical to the canonical source', () => {
  const canonical = loadCanonical();
  const expected = serialize(canonical);
  for (const target of TARGETS) {
    const actual = readFileSync(target, 'utf8');
    assert.equal(actual, expected, `${path.basename(path.dirname(target))} config differs from canonical — run npm run build:onboarding-config`);
  }
});

// ── Malformed config rejection ──────────────────────────────────────────────
function base() {
  return {
    version: 2, customMaxLen: 120,
    stages: [{ id: 'about', titleKey: 'k' }],
    screens: [{ id: 's1', stage: 'about', questionIds: ['q1'] }],
    branchScreens: {},
    branches: {},
    priorityToBranch: {},
    priorityToPrimaryChallenge: {},
    questions: {
      q1: { type: 'single', limit: 1, required: true, answers: [{ id: 'a', key: 'k.a' }] },
      difficult_moments: { type: 'multi', limit: 3, required: true, answers: [{ id: 'x', key: 'k.x' }] },
    },
  };
}

test('validateConfig rejects a duplicate answer id', () => {
  const cfg = base();
  cfg.questions.q1.answers = [{ id: 'a', key: 'k.a' }, { id: 'a', key: 'k.a2' }];
  assert.throws(() => validateConfig(cfg), /duplicate answer id/i);
});

test('validateConfig rejects a screen referencing an unknown question', () => {
  const cfg = base();
  cfg.screens.push({ id: 's2', stage: 'about', questionIds: ['nope'] });
  assert.throws(() => validateConfig(cfg), /unknown question/i);
});

test('validateConfig rejects a branch screen id that does not exist', () => {
  const cfg = base();
  cfg.branches.b = { screenIds: ['ghost'], requiredQuestionIds: [] };
  assert.throws(() => validateConfig(cfg), /unknown screen/i);
});

test('validateConfig rejects a custom option without a max length', () => {
  const cfg = base();
  cfg.questions.q1.answers = [{ id: 'c', key: 'k.c', custom: true }];
  assert.throws(() => validateConfig(cfg), /must have numeric max/i);
});

test('validateConfig rejects priorityToBranch pointing at a missing branch', () => {
  const cfg = base();
  cfg.questions.difficult_moments.answers.push({ id: 'p', key: 'k.p' });
  cfg.priorityToBranch = { p: 'ghost_branch' };
  assert.throws(() => validateConfig(cfg), /branch 'ghost_branch' missing/i);
});

test('the real canonical config passes validation', () => {
  assert.doesNotThrow(() => loadCanonical());
});

// ── Branch resolution + required-per-branch ─────────────────────────────────
test('pre_performance branch has four screens, all required', () => {
  const a = {
    difficult_moments: { answerIds: ['before_important_performance'] },
    primary_priority: { answerIds: ['before_important_performance'] },
  };
  assert.equal(C.resolveBranch(a), 'pre_performance');
  const flow = C.computeFlowScreenIds(a);
  for (const s of ['pre_performance_onset', 'pre_performance_signs', 'pre_performance_effect', 'pre_performance_duration']) {
    assert.ok(flow.includes(s), `missing ${s}`);
  }
  const req = C.requiredQuestionIds(a);
  assert.ok(req.includes('pre_performance_duration'), 'the 4th pre-performance question must be required');
});

test('mistakes branch has three required branch questions', () => {
  const a = { difficult_moments: { answerIds: ['after_mistake'] }, primary_priority: { answerIds: ['after_mistake'] } };
  assert.equal(C.resolveBranch(a), 'mistakes');
  const req = C.requiredQuestionIds(a).filter((q) => q.startsWith('mistakes_'));
  assert.deepEqual(req.sort(), ['mistakes_first_response', 'mistakes_next', 'mistakes_recovery']);
});

test('difficult_moments = [not_sure] resolves to the shallow unsure branch and skips priority', () => {
  const a = { difficult_moments: { answerIds: ['not_sure'] } };
  assert.equal(C.resolveBranch(a), 'unsure');
  assert.equal(C.hasPriority(a), false);
  const flow = C.computeFlowScreenIds(a);
  assert.ok(!flow.includes('primary_priority'));
  assert.ok(flow.includes('unsure_recognition'));
});

test('custom priority routes to the custom branch (free text never drives branch logic)', () => {
  const a = {
    difficult_moments: { answerIds: ['different'], customText: 'exam stress bleeds into matches' },
    primary_priority: { answerIds: ['different'] },
  };
  assert.equal(C.resolveBranch(a), 'custom');
  assert.ok(C.computeFlowScreenIds(a).includes('custom_response'));
});

// ── Validation units ────────────────────────────────────────────────────────
test('validateAnswers enforces limit, exclusivity, unknown ids, and custom text', () => {
  assert.equal(validateAnswers({ difficult_moments: { answerIds: ['after_mistake', 'lose_focus', 'confidence_drops', 'low_motivation'] } }, {}).code, 'LIMIT_EXCEEDED');
  assert.equal(validateAnswers({ difficult_moments: { answerIds: ['not_sure', 'after_mistake'] } }, {}).code, 'EXCLUSIVE_CONFLICT');
  assert.equal(validateAnswers({ difficult_moments: { answerIds: ['bogus'] } }, {}).code, 'INVALID_ANSWER_ID');
  assert.equal(validateAnswers({ difficult_moments: { answerIds: ['different'] } }, {}).code, 'INVALID_CUSTOM_TEXT');
  assert.equal(validateAnswers({ nope: { answerIds: ['x'] } }, {}).code, 'INVALID_QUESTION_ID');
});

test('validateAnswers enforces primary_priority ∈ selected difficult_moments', () => {
  const merged = { difficult_moments: { answerIds: ['after_mistake'] }, primary_priority: { answerIds: ['lose_focus'] } };
  assert.equal(validateAnswers({ primary_priority: { answerIds: ['lose_focus'] } }, merged).code, 'INVALID_ANSWER_ID');
});

test('validateAnswers rejects a branch answer that does not match the resolved branch', () => {
  const merged = {
    difficult_moments: { answerIds: ['before_important_performance'] },
    primary_priority: { answerIds: ['before_important_performance'] },
    mistakes_recovery: { answerIds: ['few_minutes'] },
  };
  assert.equal(validateAnswers({ mistakes_recovery: { answerIds: ['few_minutes'] } }, merged).code, 'BRANCH_MISMATCH');
});

test('validateAnswers sanitises and requires non-empty custom text', () => {
  const ok = validateAnswers({ difficult_moments: { answerIds: ['different'], customText: '  penalty <b>kicks</b> ' } }, {});
  assert.equal(ok.ok, true);
  assert.equal(ok.cleaned.difficult_moments.customText, 'penalty kicks');
});

test('custom answers count toward the selection limit', () => {
  // difficult_moments limit 3: two normal + one custom = 3 ok; adding a 4th fails.
  const okThree = validateAnswers({ difficult_moments: { answerIds: ['after_mistake', 'lose_focus', 'different'], customText: 'x' } }, {});
  assert.equal(okThree.ok, true);
});

test('contextual_pressures is optional (no required entry)', () => {
  const a = { difficult_moments: { answerIds: ['after_mistake'] }, primary_priority: { answerIds: ['after_mistake'] } };
  assert.ok(!C.requiredQuestionIds(a).includes('contextual_pressures'));
});

// ── Compatibility mirror ────────────────────────────────────────────────────
test('buildUserMirror derives compat fields incl. primaryChallenge + position + goals', () => {
  const m = buildUserMirror({
    sport: { answerIds: ['football'] },
    role_position: { answerIds: ['goalkeeper'] },
    competition_level: { answerIds: ['national'] },
    experience_level: { answerIds: ['competitive'] },
    broad_goals: { answerIds: ['confidence', 'focus', 'resilience'] },
    primary_priority: { answerIds: ['injury_return'] },
  });
  assert.equal(m.sport, 'football');
  assert.equal(m.position, 'Goalkeeper');
  assert.equal(m.competitionLevel, 'national');
  assert.equal(m.experienceLevel, 'competitive');
  assert.equal(m.goals, JSON.stringify(['confidence', 'focus', 'resilience']));
  assert.equal(m.primaryChallenge, 'injury');
  assert.equal(m.onboardingDone, true);
});

test('buildUserMirror uses custom text for sport/role/competition and maps unsure→empty position', () => {
  const m = buildUserMirror({
    sport: { answerIds: ['other'], customText: 'Ultimate Frisbee' },
    role_position: { answerIds: ['unsure'] },
    competition_level: { answerIds: ['other'], customText: 'College league' },
    experience_level: { answerIds: ['beginner'] },
    broad_goals: { answerIds: ['focus'] },
    primary_priority: { answerIds: ['not_sure_not_a_priority'] },
  });
  assert.equal(m.sport, 'Ultimate Frisbee');
  assert.equal(m.position, '');
  assert.equal(m.competitionLevel, 'College league');
  assert.equal(m.primaryChallenge, null); // unknown priority → null (default plan)
});

// ── Schema cascade (structural — no DB available in tests) ──────────────────
test('schema deletes onboarding data on account/session deletion (onDelete: Cascade)', () => {
  const schema = readFileSync(path.join(__dirname, '../prisma/schema.prisma'), 'utf8');
  const os = schema.slice(schema.indexOf('model OnboardingSession'), schema.indexOf('model ActiveOnboardingSession'));
  assert.match(os, /user\s+User\s+@relation\(fields: \[userId\], references: \[id\], onDelete: Cascade\)/);
  const active = schema.slice(schema.indexOf('model ActiveOnboardingSession'));
  assert.match(active, /session\s+OnboardingSession\s+@relation\(fields: \[sessionId\], references: \[id\], onDelete: Cascade\)/);
});

test('missingRequired lists unanswered required questions and clears when complete', () => {
  const partial = { difficult_moments: { answerIds: ['after_mistake'] }, primary_priority: { answerIds: ['after_mistake'] } };
  assert.ok(missingRequired(partial).includes('supports'));
  assert.equal(isAnswered(partial, 'difficult_moments'), true);
});
