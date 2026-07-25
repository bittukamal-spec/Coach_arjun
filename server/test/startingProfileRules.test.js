// Starting Performance Profile — deterministic layer (PR 3).
// Pure tests over the rule engine, the rendered sections, the first coaching
// message, and the AI wording validator. No DB, no Anthropic API.

const test = require('node:test');
const assert = require('node:assert/strict');

const { buildRuleOutput, renderSections, hasProhibited, wordCount, RULE_VERSION } = require('../src/profile/ruleEngine');
const { buildFirstMessage } = require('../src/profile/firstMessage');
const { generateWording, validate } = require('../src/profile/aiWording');
const cfg = require('../src/profile/ruleConfig');

// ── Fixtures ────────────────────────────────────────────────────────────────

const MISTAKES = {
  id: 'os-1', userId: 'u1', onboardingVersion: 2, attemptNumber: 1, status: 'COMPLETED',
  branchId: 'mistakes', primaryPriorityId: 'after_mistake',
  answers: {
    sport: { answerIds: ['cricket'] },
    role_position: { answerIds: ['batter'] },
    competition_level: { answerIds: ['state'] },
    experience_level: { answerIds: ['competitive'] },
    difficult_moments: { answerIds: ['after_mistake', 'lose_focus'] },
    primary_priority: { answerIds: ['after_mistake'] },
    mistakes_first_response: { answerIds: ['keep_thinking', 'angry_self'] },
    mistakes_next: { answerIds: ['hesitate'] },
    mistakes_recovery: { answerIds: ['most_of_session'] },
    contextual_pressures: { answerIds: ['own_expectations'] },
    supports: { answerIds: ['clear_preparation'] },
    strengths: { answerIds: ['hard_working'] },
    broad_goals: { answerIds: ['confidence', 'focus'] },
    four_week_outcome: { answerIds: ['recover_faster'] },
  },
};

// Same athlete, but every branch answer is a "no problem here" option.
const NEUTRAL = {
  ...MISTAKES,
  id: 'os-2',
  answers: {
    ...MISTAKES.answers,
    mistakes_first_response: { answerIds: ['reset_quickly'] },
    mistakes_next: { answerIds: ['perform_normally'] },
    mistakes_recovery: { answerIds: ['few_minutes'] },
    supports: { answerIds: [] },
    strengths: { answerIds: [] },
  },
};

const SECTION_KEYS = ['whatMatters', 'possiblePattern', 'whatHelps', 'whereWeBegin'];

// ── Determinism ─────────────────────────────────────────────────────────────

test('the same onboarding session always produces the identical rule output (no randomness, no time dependence)', () => {
  const a = buildRuleOutput(MISTAKES);
  const b = buildRuleOutput(JSON.parse(JSON.stringify(MISTAKES)));
  assert.deepEqual(a, b);
  assert.equal(a.ruleVersion, RULE_VERSION);
});

test('rendered sections are deterministic per language and cover all four sections in EN and HI', () => {
  const ro = buildRuleOutput(MISTAKES);
  for (const lang of ['en', 'hi']) {
    const one = renderSections(ro, lang);
    const two = renderSections(ro, lang);
    assert.deepEqual(one, two);
    for (const k of SECTION_KEYS) {
      assert.equal(typeof one[k], 'string');
      assert.ok(one[k].trim().length > 0, `${lang}/${k} must not be empty`);
    }
  }
  // Hindi really is Hindi, English really is English.
  assert.match(renderSections(ro, 'hi').possiblePattern, /[ऀ-ॿ]/);
  assert.doesNotMatch(renderSections(ro, 'en').possiblePattern, /[ऀ-ॿ]/);
});

// ── What the engine is allowed to say ───────────────────────────────────────

test('observations are capped at three and never invent an answer the athlete did not give', () => {
  const ro = buildRuleOutput(MISTAKES);
  assert.ok(ro.observations.length <= 3, `expected ≤3 observations, got ${ro.observations.length}`);
  const given = new Set(
    Object.entries(MISTAKES.answers).flatMap(([qid, a]) => (a.answerIds || []).map((aid) => `${qid}:${aid}`))
  );
  for (const o of ro.observations) assert.ok(given.has(o.code), `unsupported observation: ${o.code}`);
});

test('neutral ("no problem here") answers produce no observations — a steady athlete is not given a pattern', () => {
  const ro = buildRuleOutput(NEUTRAL);
  assert.equal(ro.observations.length, 0);
  assert.equal(ro.resilience, true);
  const en = renderSections(ro, 'en');
  assert.match(en.possiblePattern, /starting understanding/i);
  assert.doesNotMatch(en.possiblePattern, /one possible pattern is that/i);
});

test('a prolonged recovery answer becomes an observation; a quick one becomes a resilience note instead', () => {
  // One reaction answer only, so the duration observation is not pushed out
  // by the three-observation cap (that precedence is asserted separately).
  const light = {
    ...MISTAKES,
    answers: {
      ...MISTAKES.answers,
      mistakes_first_response: { answerIds: ['keep_thinking'] },
      mistakes_next: { answerIds: [] },
    },
  };
  const prolonged = buildRuleOutput(light);
  assert.ok(prolonged.observations.some((o) => o.dim === 'duration'), 'prolonged recovery must be observable');
  assert.equal(prolonged.resilience, false);

  const quick = buildRuleOutput({
    ...light,
    answers: { ...light.answers, mistakes_recovery: { answerIds: ['few_minutes'] } },
  });
  assert.ok(!quick.observations.some((o) => o.dim === 'duration'));
  assert.equal(quick.resilience, true);
  assert.match(renderSections(quick, 'en').possiblePattern, new RegExp(cfg.RESILIENCE_NOTE.en.slice(0, 20), 'i'));
});

test('when there is more material than the cap allows, immediate reactions win over knock-on effects and duration', () => {
  const ro = buildRuleOutput(MISTAKES); // 2 reactions + 1 effect + prolonged duration
  assert.equal(ro.observations.length, 3);
  assert.deepEqual(ro.observations.map((o) => o.dim), ['reaction', 'reaction', 'effect']);
  assert.ok(!ro.observations.some((o) => o.dim === 'duration'), 'duration is the first thing dropped');
});

test('no rendered section contains diagnosis, score, ranking, severity, trait or personality-type language (EN + HI)', () => {
  for (const session of [MISTAKES, NEUTRAL]) {
    const ro = buildRuleOutput(session);
    for (const lang of ['en', 'hi']) {
      const s = renderSections(ro, lang);
      for (const k of SECTION_KEYS) {
        assert.equal(hasProhibited(s[k]), false, `${lang}/${k} contains prohibited language: ${s[k]}`);
      }
    }
  }
});

test('the whole profile stays short — under the 240-word cap the AI validator also enforces', () => {
  for (const session of [MISTAKES, NEUTRAL]) {
    const ro = buildRuleOutput(session);
    for (const lang of ['en', 'hi']) {
      assert.ok(wordCount(renderSections(ro, lang)) <= 240);
    }
  }
});

test('the suggested priority is always one of the athlete\'s own difficult moments', () => {
  const ro = buildRuleOutput(MISTAKES);
  assert.ok(MISTAKES.answers.difficult_moments.answerIds.includes(ro.suggestedPriorityId));
});

// ── First coaching message ──────────────────────────────────────────────────

const profileFor = (fit, agreed = 'after_mistake') => ({ fitResponse: fit, agreedPriorityId: agreed });

test('the first message is deterministic, greets by first name, and never re-asks whether the profile fits', () => {
  const ro = buildRuleOutput(MISTAKES);
  for (const fit of ['CONFIRMED', 'PARTLY', 'NOT_REALLY']) {
    for (const language of ['en', 'hi']) {
      const user = { name: 'Rahul Sharma', language };
      const a = buildFirstMessage(profileFor(fit), ro, user);
      const b = buildFirstMessage(profileFor(fit), ro, user);
      assert.equal(a, b, 'must be deterministic');
      assert.match(a, /Rahul/);
      assert.doesNotMatch(a, /Rahul Sharma/, 'first name only');
      assert.doesNotMatch(a, /does (this|that) fit|sahi lagta|क्या यह सही/i, 'fit is already resolved — never re-asked');
      assert.equal(hasProhibited(a), false);
    }
  }
});

test('the first message ends with the agreed quick replies, using the chip mechanism the client already parses', () => {
  const ro = buildRuleOutput(MISTAKES);
  const en = buildFirstMessage(profileFor('CONFIRMED'), ro, { name: 'Rahul', language: 'en' });
  assert.match(en, /\[SUGGEST: In my last match \| In training \| It happens often \| Something else\]$/);
  const hi = buildFirstMessage(profileFor('CONFIRMED'), ro, { name: 'Rahul', language: 'hi' });
  assert.match(hi, /\[SUGGEST: पिछले मैच में \| ट्रेनिंग में \| अक्सर होता है \| कुछ और\]$/);
  // Never the old fit-confirmation chips.
  assert.doesNotMatch(en, /That sounds accurate|Partly|Something else is more important/);
});

test('a corrected profile opens on the AGREED priority, not the suggested one', () => {
  const ro = buildRuleOutput(MISTAKES);
  const msg = buildFirstMessage(profileFor('NOT_REALLY', 'confidence_drops'), ro, { name: 'Rahul', language: 'en' });
  assert.match(msg, new RegExp(cfg.TRIGGER.confidence_drops.en.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
});

// ── AI wording layer: rephrase-only, always falls back ──────────────────────

const wordingInput = () => {
  const ro = buildRuleOutput(MISTAKES);
  return { firstName: 'Rahul', sport: 'cricket', role: 'batter', observationCodes: ro.observations.map((o) => o.code), drafts: renderSections(ro, 'en'), language: 'en' };
};
const clientReturning = (text) => () => ({ messages: { create: async () => ({ content: [{ text }] }) } });

test('valid AI wording is accepted and marked AI_OK', async () => {
  const input = wordingInput();
  const good = {
    whatMatters: 'From what you shared, you play cricket and want more confidence.',
    possiblePattern: 'One possible pattern may be that after a mistake it stays with you for a while. This is only a starting understanding.',
    whatHelps: 'Clear preparation already seems useful for you.',
    whereWeBegin: 'We can begin by understanding what happens right after a mistake.',
  };
  const res = await generateWording(input, { createClient: clientReturning(JSON.stringify(good)) });
  assert.equal(res.wordingStatus, 'AI_OK');
  assert.equal(res.deterministicFallbackUsed, false);
  assert.deepEqual(res.sections, good);
});

test('AI wording that adds a diagnosis, score or personality claim is rejected and the deterministic draft is used', async () => {
  const input = wordingInput();
  const bad = {
    whatMatters: 'From what you shared, you play cricket.',
    possiblePattern: 'Your anxiety disorder gives you a low mental toughness score for your personality type.',
    whatHelps: 'Clear preparation already seems useful for you.',
    whereWeBegin: 'We can begin by understanding what happens after a mistake.',
  };
  const res = await generateWording(input, { createClient: clientReturning(JSON.stringify(bad)) });
  assert.equal(res.wordingStatus, 'FALLBACK_USED');
  assert.equal(res.deterministicFallbackUsed, true);
  assert.deepEqual(res.sections, input.drafts);
});

test('unparseable output, a missing section, the wrong language, or an API error all fall back deterministically', async () => {
  const input = wordingInput();
  const cases = [
    clientReturning('not json at all'),
    clientReturning(JSON.stringify({ whatMatters: 'ok', possiblePattern: '', whatHelps: 'ok', whereWeBegin: 'ok' })),
    clientReturning(JSON.stringify({ whatMatters: 'आप क्रिकेट खेलते हैं।', possiblePattern: 'एक संभावित पैटर्न।', whatHelps: 'तैयारी मदद करती है।', whereWeBegin: 'हम यहाँ से शुरू करेंगे।' })),
    () => ({ messages: { create: async () => { throw new Error('timeout'); } } }),
  ];
  for (const createClient of cases) {
    const res = await generateWording(input, { createClient });
    assert.equal(res.wordingStatus, 'FALLBACK_USED');
    assert.deepEqual(res.sections, input.drafts);
  }
});

test('the AI is asked to rephrase a draft it is given — it is never asked to decide the pattern itself', async () => {
  const input = wordingInput();
  let seenPrompt = null;
  const createClient = () => ({
    messages: {
      create: async (params) => { seenPrompt = params.messages[0].content; return { content: [{ text: '{}' }] }; },
    },
  });
  await generateWording(input, { createClient });
  assert.match(seenPrompt, /Rewrite ONLY for warmth/i);
  assert.match(seenPrompt, /Do NOT add, remove, or strengthen any claim/i);
  assert.ok(seenPrompt.includes(input.drafts.possiblePattern), 'the deterministic draft must be what is sent');
});

test('the wording input carries no account metadata — no email, DOB, user id, chat history or journal', async () => {
  const { buildWordingInput } = require('../src/profile/profileService');
  const profile = { ruleOutput: buildRuleOutput(MISTAKES) };
  const user = { id: 'u1', name: 'Rahul Sharma', email: 'r@x.com', dateOfBirth: new Date(), guardianEmail: 'p@x.com' };
  const input = buildWordingInput(profile, user, 'en');
  const flat = JSON.stringify(input);
  assert.equal(input.firstName, 'Rahul');
  for (const leak of ['r@x.com', 'p@x.com', 'u1', 'Sharma']) {
    assert.ok(!flat.includes(leak), `wording input leaked ${leak}`);
  }
});

test('the validator enforces the 240-word ceiling', () => {
  const long = 'word '.repeat(300).trim();
  assert.equal(validate({ whatMatters: long, possiblePattern: 'a', whatHelps: 'b', whereWeBegin: 'c' }, 'en'), false);
});
