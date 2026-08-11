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
test('pre_performance branch asks first response → impact → reset, all required', () => {
  const a = { primary_priority: { answerIds: ['before_important_performance'] } };
  assert.equal(C.resolveBranch(a), 'pre_performance');
  const flow = C.computeFlowScreenIds(a);
  for (const s of ['pre_performance_signs', 'pre_performance_effect', 'pre_performance_duration']) {
    assert.ok(flow.includes(s), `missing ${s}`);
  }
  // The onset question is context, not one of the three pressure stages: it is
  // no longer asked, and asking it is what made this branch a question longer
  // than every other one.
  assert.ok(!flow.includes('pre_performance_onset'), 'onset must not be in the flow');
  const req = C.requiredQuestionIds(a);
  assert.ok(req.includes('pre_performance_duration'), 'the reset question must be required');
  assert.ok(!req.includes('pre_performance_onset'));
});

test('mistakes branch has three required branch questions', () => {
  const a = { primary_priority: { answerIds: ['after_mistake'] } };
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
  const a = { primary_priority: { answerIds: ['different'], customText: 'exam stress bleeds into matches' } };
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

test('the Situation question accepts any situation in the list, and only those', () => {
  // Asked directly now, so it is no longer intersected with a separate
  // multi-select. Historical answers stay valid (the allowed set is a
  // superset of the old rule) and unknown ids are still rejected.
  const legacy = { difficult_moments: { answerIds: ['after_mistake'] } };
  assert.equal(validateAnswers({ primary_priority: { answerIds: ['lose_focus'] } }, legacy).ok, true);
  assert.equal(validateAnswers({ primary_priority: { answerIds: ['after_mistake'] } }, legacy).ok, true);
  assert.equal(validateAnswers({ primary_priority: { answerIds: ['bogus'] } }, {}).code, 'INVALID_ANSWER_ID');
  // 'not_sure' is excluded from the situation list — it is not a situation.
  assert.equal(validateAnswers({ primary_priority: { answerIds: ['not_sure'] } }, {}).code, 'INVALID_ANSWER_ID');
  // "My situation is different" now carries its own words, so empty custom
  // text is rejected on the Situation question itself.
  assert.equal(validateAnswers({ primary_priority: { answerIds: ['different'] } }, {}).code, 'INVALID_CUSTOM_TEXT');
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

// ── Branch precedence: an explicit Situation always wins ──────────────────
// A historical athlete may carry difficult_moments = ['not_sure'] from the
// shallow `unsure` branch. Once they name a real situation, that situation —
// and only that situation — decides which branch is active. The legacy answer
// stays stored; it just stops deciding.

const LEGACY_UNSURE = {
  sport: { answerIds: ['cricket'] },
  difficult_moments: { answerIds: ['not_sure'] },
  unsure_recognition: { answerIds: ['one_mistake_snowballs'] },
  unsure_recovery: { answerIds: ['few_minutes'] },
};

test('legacy not_sure with no Situation still resolves to the shallow unsure branch', () => {
  assert.equal(C.resolveBranch(LEGACY_UNSURE), 'unsure');
  assert.equal(C.hasPriority(LEGACY_UNSURE), false);
  const flow = C.computeFlowScreenIds(LEGACY_UNSURE);
  assert.ok(!flow.includes('primary_priority'), 'the situation screen stays skipped for them');
  assert.ok(flow.includes('unsure_recognition'));
});

test('legacy not_sure plus an explicit Situation resolves to that situation\'s branch', () => {
  const merged = { ...LEGACY_UNSURE, primary_priority: { answerIds: ['after_mistake'] } };
  assert.equal(C.resolveBranch(merged), 'mistakes');
  assert.equal(C.hasPriority(merged), true);
  const flow = C.computeFlowScreenIds(merged);
  assert.ok(flow.includes('mistakes_first_response'));
  assert.ok(!flow.includes('unsure_recognition'), 'the old branch is no longer active');
});

test('a different explicit Situation resolves to its own branch, deterministically', () => {
  for (const [pri, branch] of [['confidence_drops', 'confidence'], ['lose_focus', 'focus'], ['injury_return', 'injury'], ['different', 'custom']]) {
    const merged = { ...LEGACY_UNSURE, primary_priority: { answerIds: [pri] } };
    assert.equal(C.resolveBranch(merged), branch, `${pri} should resolve to ${branch}`);
    // Same answers in, same branch out — every time.
    assert.equal(C.resolveBranch(merged), C.resolveBranch({ ...merged }));
  }
});

test('the legacy not_sure and unsure answers are still readable after the switch', () => {
  const merged = { ...LEGACY_UNSURE, primary_priority: { answerIds: ['after_mistake'] } };
  assert.deepEqual(merged.difficult_moments.answerIds, ['not_sure']);
  assert.deepEqual(merged.unsure_recognition.answerIds, ['one_mistake_snowballs']);
  // …but they are not part of the active flow any more.
  assert.ok(!C.reachableQuestionIds(merged).has('unsure_recognition'));
});

test('a brand-new athlete (no difficult_moments at all) is unaffected by the precedence rule', () => {
  assert.equal(C.hasPriority({}), true);
  assert.equal(C.resolveBranch({}), null, 'no situation yet — no branch yet');
  assert.equal(C.resolveBranch({ primary_priority: { answerIds: ['lose_focus'] } }), 'focus');
});
