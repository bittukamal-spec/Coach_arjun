// Starting Performance Profile — deterministic layer (PR 3).
// Pure tests over the rule engine, the rendered sections, the first coaching
// message, and the AI wording validator. No DB, no Anthropic API.

const test = require('node:test');
const assert = require('node:assert/strict');

const { buildRuleOutput, renderSections, hasProhibited, wordCount, groundingAnchors, RULE_VERSION } = require('../src/profile/ruleEngine');
const C = require('../src/onboarding/config');
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

test('when there is more material than the cap allows, how long it lasts keeps its slot and the extra reaction/effect is dropped', () => {
  // 2 reactions + 1 effect + a prolonged recovery answer. How long it lasts is
  // what makes a pattern recognisable, so it is no longer crowded out.
  const ro = buildRuleOutput(MISTAKES);
  assert.equal(ro.observations.length, 3);
  assert.deepEqual(ro.observations.map((o) => o.dim), ['reaction', 'reaction', 'duration']);
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

test('the validator enforces the total word ceiling', () => {
  const long = 'word '.repeat(400).trim();
  assert.equal(validate({ whatMatters: long, possiblePattern: 'a', whatHelps: 'b', whereWeBegin: 'c' }, 'en'), false);
});

// ── Grounding: the profile must actually use the onboarding answers ─────────
// Founder testing on PR 3 surfaced a profile made of filler ("Cricket means a
// lot to you", "in those moments you mentioned", "let's find which situation
// feels most important"). These lock the specifics in place.

// A realistic, fully-answered completed session.
const FULL = {
  id: 'os-full', userId: 'u1', onboardingVersion: 2, attemptNumber: 1, status: 'COMPLETED',
  branchId: 'mistakes', primaryPriorityId: 'after_mistake',
  answers: {
    sport: { answerIds: ['cricket'] },
    role_position: { answerIds: ['batter'] },
    competition_level: { answerIds: ['state'] },
    experience_level: { answerIds: ['competitive'] },
    difficult_moments: { answerIds: ['after_mistake', 'lose_focus', 'confidence_drops'] },
    primary_priority: { answerIds: ['after_mistake'] },
    mistakes_first_response: { answerIds: ['keep_thinking', 'angry_self'] },
    mistakes_next: { answerIds: ['hesitate'] },
    mistakes_recovery: { answerIds: ['most_of_session'] },
    contextual_pressures: { answerIds: ['own_expectations', 'selection_pressure'] },
    supports: { answerIds: ['clear_preparation', 'pre_routine'] },
    strengths: { answerIds: ['hard_working', 'brave'] },
    broad_goals: { answerIds: ['confidence', 'resilience'] },
    four_week_outcome: { answerIds: ['recover_faster'] },
  },
};

const FILLER = [
  /moments you (mentioned|flagged)/i,
  /means a lot to you/i,
  /which situation feels most/i,
  /finding which situation/i,
];
const noFiller = (sections, where) => {
  for (const [k, txt] of Object.entries(sections)) {
    for (const re of FILLER) assert.doesNotMatch(txt, re, `${where}/${k} fell back to filler: ${txt}`);
  }
};

test('WHAT MATTERS names the sport, role, goals and the four-week outcome — never generic filler', () => {
  const s = renderSections(buildRuleOutput(FULL), 'en');
  assert.match(s.whatMatters, /cricket/i);
  assert.match(s.whatMatters, /batter/i);
  assert.match(s.whatMatters, /confidence/i);
  assert.match(s.whatMatters, /bouncing back from setbacks/i);
  assert.match(s.whatMatters, /recover faster after mistakes/i, 'the four-week outcome must appear');
  assert.doesNotMatch(s.whatMatters, /means a lot to you/i);
});

test('A POSSIBLE PATTERN names the primary situation, a selected reaction or effect, and how long it lasts', () => {
  const s = renderSections(buildRuleOutput(FULL), 'en');
  assert.match(s.possiblePattern, /after a mistake/i, 'the primary situation must be named explicitly');
  assert.match(s.possiblePattern, /attention may stay on what went wrong|frustration with yourself|hesitate/i, 'at least one selected reaction/effect');
  assert.match(s.possiblePattern, /linger for much of the session/i, 'the recovery answer must appear');
  assert.doesNotMatch(s.possiblePattern, /moments you (mentioned|flagged)/i);
});

test('WHAT ALREADY HELPS uses the selected supports and strengths, never a placeholder when selections exist', () => {
  const s = renderSections(buildRuleOutput(FULL), 'en');
  assert.match(s.whatHelps, /clear preparation/i);
  assert.match(s.whatHelps, /routine before you perform/i);
  assert.match(s.whatHelps, /hard-working/i);
  assert.match(s.whatHelps, /brave/i);
  assert.doesNotMatch(s.whatHelps, /we'll notice what already works/i);
});

test('WHERE WE CAN BEGIN proposes one specific focus and never asks which situation matters most', () => {
  const s = renderSections(buildRuleOutput(FULL), 'en');
  assert.match(s.whereWeBegin, /after a mistake/i, 'built from the suggested priority');
  assert.match(s.whereWeBegin, /few seconds that follow/i, 'built from the explored branch');
  assert.doesNotMatch(s.whereWeBegin, /which situation feels most|finding which situation/i);
  assert.doesNotMatch(s.whereWeBegin, /try this|do this|each day|every day|for \d+ (minutes|seconds)/i, 'nothing is prescribed yet');
  assert.match(s.whereWeBegin, /not a fixed practice yet/i);
});

test('the contextual pressure the athlete selected is used, not silently dropped', () => {
  const s = renderSections(buildRuleOutput(FULL), 'en');
  assert.match(s.possiblePattern, /your own expectations/i);
});

test('no branch, in either language, can produce a profile made of filler', () => {
  const cfgAll = C.config;
  const PRIORITY = {
    pre_performance: 'before_important_performance', mistakes: 'after_mistake', focus: 'lose_focus',
    confidence: 'confidence_drops', motivation: 'low_motivation', coach_selection: 'coach_feedback',
    family_outside: 'family_expectations', injury: 'injury_return', unsure: null, custom: null,
  };
  for (const [branchId, b] of Object.entries(cfgAll.branches)) {
    const answers = {
      sport: { answerIds: ['football'] }, role_position: { answerIds: ['midfielder'] },
      difficult_moments: { answerIds: [PRIORITY[branchId] || 'not_sure'] },
      primary_priority: { answerIds: PRIORITY[branchId] ? [PRIORITY[branchId]] : [] },
      supports: { answerIds: ['staying_relaxed'] }, strengths: { answerIds: ['persistent'] },
      broad_goals: { answerIds: ['pressure'] }, four_week_outcome: { answerIds: ['trust_under_pressure'] },
    };
    for (const sid of b.screenIds || []) {
      for (const q of cfgAll.branchScreens[sid]?.questionIds || []) {
        const ids = (cfgAll.questions[q]?.answers || []).map((a) => a.id);
        answers[q] = { answerIds: [ids.includes('most_of_session') ? 'most_of_session' : ids[0]] };
      }
    }
    const ro = buildRuleOutput({ branchId, primaryPriorityId: PRIORITY[branchId], answers });
    for (const lang of ['en', 'hi']) {
      const s = renderSections(ro, lang);
      noFiller(s, `${branchId}/${lang}`);
      for (const k of SECTION_KEYS) assert.equal(hasProhibited(s[k]), false, `${branchId}/${lang}/${k}`);
      assert.ok(wordCount(s) <= 300);
    }
  }
});

test('every meaningful branch answer the athlete can pick has a phrasing — no silently ignored selections', () => {
  const cfgAll = C.config;
  const ruleCfg = require('../src/profile/ruleConfig');
  const handledElsewhere = new Set([
    ...ruleCfg.NEUTRAL_ANSWERS, ...ruleCfg.QUICK_RECOVERY, ...ruleCfg.PROLONGED_RECOVERY,
    'something_else', 'different',
  ]);
  const contextMaps = {
    pre_performance_onset: ruleCfg.ONSET_PHRASE,
    injury_stage: ruleCfg.INJURY_STAGE,
    family_outside_source: ruleCfg.FAMILY_SOURCE,
  };
  const missing = [];
  for (const b of Object.values(cfgAll.branches)) {
    for (const sid of b.screenIds || []) {
      for (const q of cfgAll.branchScreens[sid]?.questionIds || []) {
        for (const a of cfgAll.questions[q]?.answers || []) {
          if (handledElsewhere.has(a.id)) continue;
          if (contextMaps[q]?.[a.id]) continue;
          if (ruleCfg.CLAUSE[`${q}:${a.id}`]) continue;
          missing.push(`${q}:${a.id}`);
        }
      }
    }
  }
  assert.deepEqual(missing, [], `unmapped answers would be dropped from the profile: ${missing.join(', ')}`);
});

test('the athlete\'s own supports, strengths, goals and outcomes all have phrasings', () => {
  const cfgAll = C.config;
  const ruleCfg = require('../src/profile/ruleConfig');
  const custom = new Set(['different', 'havent_noticed', 'still_figuring', 'nothing_outside', 'own_goal']);
  const pairs = [
    ['supports', ruleCfg.SUPPORT_PHRASE], ['strengths', ruleCfg.STRENGTH_PHRASE],
    ['broad_goals', ruleCfg.GOAL_LABEL], ['four_week_outcome', ruleCfg.OUTCOME_LABEL],
    ['contextual_pressures', ruleCfg.CONTEXT_PHRASE],
  ];
  for (const [q, map] of pairs) {
    const missing = (cfgAll.questions[q]?.answers || []).map((a) => a.id).filter((id) => !custom.has(id) && !map[id]);
    assert.deepEqual(missing, [], `${q} has unmapped answers: ${missing.join(', ')}`);
  }
});

test('when the athlete named nothing that helps, the fallback still names their situation', () => {
  const ro = buildRuleOutput({
    ...FULL,
    answers: { ...FULL.answers, supports: { answerIds: ['different'] }, strengths: { answerIds: ['still_figuring'] } },
  });
  const s = renderSections(ro, 'en');
  assert.match(s.whatHelps, /after a mistake/i, 'the fallback must stay specific to their situation');
  assert.doesNotMatch(s.whatHelps, /we'll notice what already works/i);
});

test('an athlete who could not name one situation still gets a named situation from what they recognised', () => {
  const ro = buildRuleOutput({
    branchId: 'unsure', primaryPriorityId: null,
    answers: {
      sport: { answerIds: ['cricket'] }, difficult_moments: { answerIds: ['not_sure'] },
      unsure_recognition: { answerIds: ['one_mistake_snowballs'] },
      unsure_recovery: { answerIds: ['most_of_session'] },
      broad_goals: { answerIds: ['confidence'] }, four_week_outcome: { answerIds: ['understand_barrier'] },
    },
  });
  const s = renderSections(ro, 'en');
  assert.match(s.possiblePattern, /after a mistake/i);
  assert.match(s.whereWeBegin, /after a mistake/i);
  noFiller(s, 'unsure');
});

test('an AI rewrite that strips the athlete\'s specifics is rejected — the personalised deterministic profile is used instead', async () => {
  const ro = buildRuleOutput(FULL);
  const input = {
    firstName: 'Rahul', sport: 'cricket', role: 'batter',
    observationCodes: ro.observations.map((o) => o.code),
    drafts: renderSections(ro, 'en'), anchors: groundingAnchors(ro, 'en'), language: 'en',
  };
  const genericised = {
    whatMatters: 'Cricket means a lot to you.',
    possiblePattern: 'In those moments you mentioned, things can feel harder than usual.',
    whatHelps: "As we talk, we'll pay attention to what's already working well for you.",
    whereWeBegin: "Let's start by finding which situation feels most important.",
  };
  const res = await generateWording(input, { createClient: () => ({ messages: { create: async () => ({ content: [{ text: JSON.stringify(genericised) }] }) } }) });
  assert.equal(res.wordingStatus, 'FALLBACK_USED');
  assert.deepEqual(res.sections, input.drafts);
  // And the profile the athlete actually sees is still personalised.
  noFiller(res.sections, 'ai-failure fallback');
  assert.match(res.sections.whatMatters, /cricket/i);
  assert.match(res.sections.possiblePattern, /after a mistake/i);
  assert.match(res.sections.whatHelps, /clear preparation/i);
  assert.match(res.sections.whereWeBegin, /after a mistake/i);
});

test('a faithful AI rewrite that keeps the specifics is still accepted', async () => {
  const ro = buildRuleOutput(FULL);
  const input = {
    firstName: 'Rahul', sport: 'cricket', role: 'batter', observationCodes: [],
    drafts: renderSections(ro, 'en'), anchors: groundingAnchors(ro, 'en'), language: 'en',
  };
  const faithful = {
    whatMatters: 'You play cricket as a batter, and you want more confidence and to recover faster after mistakes.',
    possiblePattern: 'After a mistake your attention may stay on what went wrong, you may hesitate, and it can linger for much of the session.',
    whatHelps: 'Clear preparation already helps you, and you described yourself as brave and hard-working.',
    whereWeBegin: 'We can start with one recent moment after a mistake.',
  };
  const res = await generateWording(input, { createClient: () => ({ messages: { create: async () => ({ content: [{ text: JSON.stringify(faithful) }] }) } }) });
  assert.equal(res.wordingStatus, 'AI_OK');
  assert.deepEqual(res.sections, faithful);
});

test('grounding anchors are built for Hindi too, so a Hindi rewrite cannot quietly go generic', async () => {
  const ro = buildRuleOutput(FULL);
  const anchors = groundingAnchors(ro, 'hi');
  assert.ok(anchors.length >= 4, 'Hindi anchors must not be empty');
  const input = { firstName: 'Rahul', sport: 'cricket', role: 'batter', observationCodes: [], drafts: renderSections(ro, 'hi'), anchors, language: 'hi' };
  const genericHi = {
    whatMatters: 'क्रिकेट आपके लिए बहुत मायने रखता है।',
    possiblePattern: 'जिन पलों की आपने बात की, उनमें चीज़ें कठिन हो सकती हैं।',
    whatHelps: 'हम साथ में देखेंगे कि क्या काम करता है।',
    whereWeBegin: 'चलिए तय करते हैं कि कौन सी स्थिति सबसे ज़रूरी है।',
  };
  const res = await generateWording(input, { createClient: () => ({ messages: { create: async () => ({ content: [{ text: JSON.stringify(genericHi) }] }) } }) });
  assert.equal(res.wordingStatus, 'FALLBACK_USED');
  assert.deepEqual(res.sections, input.drafts);
});
