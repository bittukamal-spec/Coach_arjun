// Performance Profile redesign: the additive server-owned display payload,
// the athlete-controlled Current Focus, and the coaching-context behaviour.
//
// No real database, no Anthropic API. The display builder and focus logic are
// pure, so most tests call them directly; the route tests use an injected fake
// Prisma client in the same style as startingProfileApi.test.js.

const test = require('node:test');
const assert = require('node:assert/strict');
const jwt = require('jsonwebtoken');
const express = require('express');

const { createProfileRouter } = require('../src/routes/profile');
const { buildDisplayProfile, buildStartingPattern } = require('../src/profile/displayProfile');
const {
  buildFocusOptions, resolveCurrentFocus, normaliseFocusInput,
  focusLabel, focusPhrase, APPROVED_FOCUS_IDS,
} = require('../src/profile/currentFocus');
const { buildSystemPrompt } = require('../src/routes/chat');
const cfg = require('../src/profile/ruleConfig');
const { checkFocusScope } = require('../src/profile/focusScope');

const TEST_JWT_SECRET = 'performance-profile-display-test-secret';
const ORIGINAL = process.env.JWT_SECRET;
test.before(() => { process.env.JWT_SECRET = TEST_JWT_SECRET; });
test.after(() => { if (ORIGINAL === undefined) delete process.env.JWT_SECRET; else process.env.JWT_SECRET = ORIGINAL; });
const tokenFor = (userId) => jwt.sign({ userId }, TEST_JWT_SECRET, { expiresIn: '15m' });

// ── Fixtures ────────────────────────────────────────────────────────────────

const ANSWERS = {
  sport: { answerIds: ['cricket'] },
  role_position: { answerIds: ['batter'] },
  competition_level: { answerIds: ['state'] },
  experience_level: { answerIds: ['competitive'] },
  difficult_moments: { answerIds: ['after_mistake', 'lose_focus'] },
  primary_priority: { answerIds: ['after_mistake'] },
  supports: { answerIds: ['pre_routine', 'remembering_success'] },
  strengths: { answerIds: ['hard_working', 'supportive'] },
  broad_goals: { answerIds: ['focus', 'confidence'] },
  four_week_outcome: { answerIds: ['enjoy_competing'] },
};

const RULE_OUTPUT = {
  ruleVersion: 1, branch: 'mistakes',
  priorityId: 'after_mistake', suggestedPriorityId: 'after_mistake',
  sportId: 'cricket', sport: 'cricket', role: 'batter',
  goals: ['focus', 'confidence'], outcome: 'enjoy_competing',
  observations: [
    { code: 'mistakes_first_response:angry_self', dim: 'reaction', questionId: 'mistakes_first_response', answerId: 'angry_self' },
    { code: 'mistakes_next:lose_focus', dim: 'effect', questionId: 'mistakes_next', answerId: 'lose_focus' },
    { code: 'mistakes_recovery:most_of_session', dim: 'duration', questionId: 'mistakes_recovery', answerId: 'most_of_session' },
  ],
  resilience: false, onset: null, stage: null, source: null, recognition: null,
  strengths: ['hard_working', 'supportive'], supports: ['pre_routine', 'remembering_success'],
  contextual: [],
};

function makeProfile(over = {}) {
  return {
    id: 'sp-1', ruleOutput: RULE_OUTPUT, supportedObservations: RULE_OUTPUT.observations,
    suggestedPriorityId: 'after_mistake', agreedPriorityId: 'after_mistake', fitResponse: 'CONFIRMED',
    correctionSelectedId: null, correctionText: null, firstChatSessionId: null,
    generatedAt: new Date('2026-07-20T00:00:00Z'), confirmedAt: new Date('2026-07-27T00:00:00Z'),
    updatedAt: new Date('2026-07-27T00:00:00Z'), ...over,
  };
}
const WORDING = (language = 'en') => ({
  language,
  sections: {
    whatMatters: 'WM', possiblePattern: 'PATTERN TEXT',
    whatHelps: 'WH', whereWeBegin: 'BEGIN TEXT',
  },
  wordingStatus: 'AI_OK', deterministicFallbackUsed: false,
});

const build = (over = {}) => buildDisplayProfile({
  profile: makeProfile(), session: { answers: ANSWERS }, wording: WORDING(),
  focusRow: null, language: 'en', ...over,
});

// ── 1–4. Additive payload, compatibility, no AI, no regeneration ───────────

test('displayProfile is additive — every pre-existing profile field is still present and unchanged', async () => {
  const { app, client } = makeApp();
  const res = await get(app, '/api/profile/starting');
  const p = res.body.profile;
  for (const key of [
    'sections', 'priorityOptions', 'language', 'wordingStatus', 'deterministicFallbackUsed',
    'suggestedPriorityId', 'agreedPriorityPhrase', 'fitResponse', 'correctionSelectedId',
    'correctionText', 'agreedPriorityId', 'confirmedAt', 'generatedAt', 'updatedAt', 'firstChatSessionId',
  ]) {
    assert.ok(Object.prototype.hasOwnProperty.call(p, key), `missing pre-existing field: ${key}`);
  }
  assert.ok(p.displayProfile, 'displayProfile added');
  assert.deepEqual(p.sections, client.__wordings[0].sections, 'sections untouched');
});

test('a client that ignores displayProfile still gets the four prose sections', async () => {
  const { app } = makeApp();
  const res = await get(app, '/api/profile/starting');
  const s = res.body.profile.sections;
  for (const k of ['whatMatters', 'possiblePattern', 'whatHelps', 'whereWeBegin']) {
    assert.equal(typeof s[k], 'string');
  }
});

test('once the wording row exists, a profile GET makes no AI call at all', async () => {
  // Wording generation is lazy: the very first read of a language creates the
  // row. Every read after that — including every read of the redesigned
  // display payload — must be pure database work.
  let aiCalls = 0;
  const { app } = makeApp({
    generateWording: async (input) => {
      aiCalls += 1;
      return { sections: input.drafts, wordingStatus: 'FALLBACK_USED', deterministicFallbackUsed: true };
    },
  });
  await get(app, '/api/profile/starting');
  const afterFirst = aiCalls;
  await get(app, '/api/profile/starting');
  await get(app, '/api/profile/starting');
  assert.equal(aiCalls, afterFirst, 'the display payload must never trigger generation');
});

test('building the display payload itself performs no I/O and no model call', () => {
  // buildDisplayProfile is pure: it takes already-loaded rows. If it ever grew
  // a client or an Anthropic dependency, this source assertion fails.
  const src = require('node:fs').readFileSync(
    require('node:path').join(__dirname, '../src/profile/displayProfile.js'), 'utf8');
  assert.doesNotMatch(src, /PrismaClient|@anthropic-ai|messages\.(create|stream)/);
});

test('reading the profile twice does not regenerate it: same displayProfile, same stored row', async () => {
  const { app, client } = makeApp();
  const a = await get(app, '/api/profile/starting');
  const before = { ...client.__profiles[0] };
  const b = await get(app, '/api/profile/starting');
  assert.deepEqual(b.body.profile.displayProfile, a.body.profile.displayProfile);
  assert.equal(client.__profiles.length, 1, 'no second profile row created');
  assert.deepEqual(client.__profiles[0].ruleOutput, before.ruleOutput);
  assert.equal(+client.__profiles[0].generatedAt, +before.generatedAt);
  assert.equal(+client.__profiles[0].updatedAt, +before.updatedAt);
});

// ── 5. Current focus defaults to agreedPriorityId ──────────────────────────

test('with no focus row the current focus derives from the confirmed agreedPriorityId', () => {
  const dp = build({ focusRow: null });
  assert.equal(dp.currentFocus.id, 'after_mistake');
  assert.equal(dp.currentFocus.label, 'Bounce back after mistakes');
  assert.equal(dp.currentFocus.source, 'STARTING_PROFILE');
  assert.equal(dp.currentFocus.canChange, true);
});

test('an unconfirmed profile has no current focus, only a suggested one', () => {
  const dp = buildDisplayProfile({
    profile: makeProfile({ fitResponse: null, agreedPriorityId: null }),
    session: { answers: ANSWERS }, wording: WORDING(), focusRow: null, language: 'en',
  });
  assert.equal(dp.currentFocus, null, 'nothing is confirmed yet');
  assert.deepEqual(dp.suggestedFocus, { id: 'after_mistake', label: 'Bounce back after mistakes' });
});

test('a stored focus row wins over the starting priority', () => {
  const dp = build({ focusRow: { focusId: 'lose_focus', customText: null, source: 'ATHLETE_SELECTED', updatedAt: new Date('2026-07-29') } });
  assert.equal(dp.currentFocus.id, 'lose_focus');
  assert.equal(dp.currentFocus.label, 'Regain focus');
  assert.equal(dp.currentFocus.source, 'ATHLETE_SELECTED');
});

// ── 6–7. Changing focus preserves the starting profile ────────────────────

test('changing focus preserves the stored ruleOutput byte-for-byte', async () => {
  const { app, client } = makeApp();
  await get(app, '/api/profile/starting');
  const before = JSON.stringify(client.__profiles[0].ruleOutput);
  const res = await patch(app, '/api/profile/current-focus', { focusId: 'lose_focus' });
  assert.equal(res.status, 200);
  assert.equal(JSON.stringify(client.__profiles[0].ruleOutput), before);
});

test('changing focus preserves the original agreedPriorityId, suggestedPriorityId and fitResponse', async () => {
  const { app, client } = makeApp();
  await get(app, '/api/profile/starting');
  await patch(app, '/api/profile/current-focus', { focusId: 'confidence_drops' });
  const p = client.__profiles[0];
  assert.equal(p.agreedPriorityId, 'after_mistake', 'the agreed starting priority is history, not state');
  assert.equal(p.suggestedPriorityId, 'after_mistake');
  assert.equal(p.fitResponse, 'CONFIRMED');
  assert.equal(p.correctionText, null);
  assert.equal(p.correctionSelectedId, null);
});

// ── 8–12. Focus update: validation, sanitisation, safety, logging ─────────

test('a valid canonical focus is saved and the server-authored focus is returned', async () => {
  const { app, client } = makeApp();
  await get(app, '/api/profile/starting');
  const res = await patch(app, '/api/profile/current-focus', { focusId: 'pressure_increases' });
  assert.equal(res.status, 200);
  assert.equal(res.body.saved, true);
  assert.equal(res.body.currentFocus.id, 'pressure_increases');
  assert.equal(res.body.currentFocus.label, 'Handle pressure with more control');
  assert.equal(client.__focuses.length, 1);
  assert.equal(client.__focuses[0].focusId, 'pressure_increases');
});

test('custom focus text is sanitised before storage — markup never survives', async () => {
  const { app, client } = makeApp();
  await get(app, '/api/profile/starting');
  const res = await patch(app, '/api/profile/current-focus', {
    focusId: 'different', customText: '  Staying calm <script>x</script> at the crease  ',
  });
  assert.equal(res.status, 200);
  const stored = client.__focuses[0].customText;
  assert.ok(!/[<>]/.test(stored), `markup survived: ${stored}`);
  assert.ok(stored.startsWith('Staying calm'));
  assert.equal(res.body.currentFocus.label, stored);
});

test('an invalid or unknown focus id is rejected with 400 and stores nothing', async () => {
  const { app, client } = makeApp();
  await get(app, '/api/profile/starting');
  for (const body of [{}, { focusId: '' }, { focusId: 'not_a_real_focus' }, { focusId: 'drop table' }]) {
    const res = await patch(app, '/api/profile/current-focus', body);
    assert.equal(res.status, 400, JSON.stringify(body));
    assert.equal(res.body.error, 'INVALID_FOCUS');
  }
  assert.equal(client.__focuses.length, 0);
});

test('"Something else" with no usable text is rejected, not stored as an empty focus', async () => {
  const { app, client } = makeApp();
  await get(app, '/api/profile/starting');
  for (const customText of ['', '   ', '<b></b>']) {
    const res = await patch(app, '/api/profile/current-focus', { focusId: 'different', customText });
    assert.equal(res.status, 400);
    assert.equal(res.body.error, 'INVALID_FOCUS_TEXT');
  }
  assert.equal(client.__focuses.length, 0);
});

test('unsafe custom focus text is screened by the existing safety policy and never stored', async () => {
  const events = [];
  const safety = {
    screenSafetyText: () => ({ flagged: true, category: 'self_harm', riskLevel: 'high' }),
    recordSafetyEvent: (...a) => events.push(a),
    getSafetyGuidance: () => 'Support guidance text',
  };
  const { app, client } = makeApp({ safety });
  await get(app, '/api/profile/starting');
  const res = await patch(app, '/api/profile/current-focus', { focusId: 'different', customText: 'something worrying' });
  assert.equal(res.status, 200);
  assert.equal(res.body.saved, false);
  assert.equal(res.body.safetyFlag, 'needs_support');
  assert.equal(res.body.guidance, 'Support guidance text');
  assert.equal(client.__focuses.length, 0, 'flagged text is never stored');
  assert.equal(events.length, 1);
  assert.equal(events[0][1], 'profile_focus');
  // The recorded event carries a category and risk level, never the text.
  assert.ok(!JSON.stringify(events[0][3]).includes('worrying'));
});

test('no raw custom focus text is ever logged', async () => {
  const logs = [];
  const origError = console.error;
  const origLog = console.log;
  console.error = (...a) => logs.push(a.join(' '));
  console.log = (...a) => logs.push(a.join(' '));
  try {
    const { app } = makeApp();
    await get(app, '/api/profile/starting');
    await patch(app, '/api/profile/current-focus', { focusId: 'different', customText: 'SECRETFOCUSPHRASE' });
    await patch(app, '/api/profile/current-focus', { focusId: 'different', customText: '' });
  } finally {
    console.error = origError;
    console.log = origLog;
  }
  assert.ok(!logs.join('\n').includes('SECRETFOCUSPHRASE'), 'athlete focus text leaked into logs');
});

// ── 13–14. English / Hindi payloads ───────────────────────────────────────

test('the English display payload is fully localised', () => {
  const dp = build();
  assert.equal(dp.snapshot.sport, 'Cricket');
  assert.equal(dp.snapshot.role, 'Batter');
  assert.equal(dp.startingPattern.nodes[0].label, 'Situation');
  assert.equal(dp.startingPattern.nodes[1].label, 'Reaction');
  assert.equal(dp.startingPattern.nodes[2].label, 'Performance effect');
  assert.equal(dp.startingPattern.nodes[3].label, 'Duration');
});

test('the Hindi display payload is Devanagari throughout, with no English leaking into pattern text', () => {
  const dp = build({ wording: WORDING('hi'), language: 'hi' });
  const DEV = /[ऀ-ॿ]/;
  assert.match(dp.currentFocus.label, DEV);
  assert.match(dp.snapshot.sport, DEV);
  assert.match(dp.snapshot.role, DEV);
  for (const node of dp.startingPattern.nodes) {
    assert.match(node.label, DEV, `node label not Hindi: ${node.label}`);
    assert.match(node.text, DEV, `node text not Hindi: ${node.text}`);
  }
  for (const s of [...dp.supports, ...dp.strengths]) assert.match(s.label, DEV);
});

// ── 15–17. Snapshot rules ─────────────────────────────────────────────────

test('snapshot facts come from the linked onboarding session, not the User row', () => {
  const dp = build();
  assert.equal(dp.snapshot.playingContext, 'State', 'competition_level from session.answers');
  assert.equal(dp.snapshot.experience, 'Competitive', 'experience_level from session.answers');
  assert.deepEqual(dp.snapshot.goals.map((g) => g.label), ['Focus', 'Confidence']);
  assert.equal(dp.snapshot.fourWeekOutcome, 'Enjoy competing more');
});

test('competition level and experience are separate, independently omitted chips', () => {
  const noLevel = build({ session: { answers: { ...ANSWERS, competition_level: { answerIds: [] } } } });
  assert.equal(noLevel.snapshot.playingContext, null);
  assert.equal(noLevel.snapshot.experience, 'Competitive', 'the other one still shows');

  const neither = build({ session: { answers: { ...ANSWERS, competition_level: { answerIds: [] }, experience_level: { answerIds: [] } } } });
  assert.equal(neither.snapshot.playingContext, null);
  assert.equal(neither.snapshot.experience, null);
});

test('role omission rules: none/unsure are omitted, both becomes a combined label', () => {
  for (const role of ['none', 'unsure', null]) {
    const dp = build({ profile: { ...makeProfile(), ruleOutput: { ...RULE_OUTPUT, role } } });
    assert.equal(dp.snapshot.role, null, `role ${role} must be omitted, never shown raw`);
  }
  const both = build({ profile: { ...makeProfile(), ruleOutput: { ...RULE_OUTPUT, role: 'both' } } });
  assert.equal(both.snapshot.role, 'Multiple roles');
});

test('a custom role shows the athlete\'s sanitised text, and an unusable one is omitted', () => {
  const withText = build({
    profile: { ...makeProfile(), ruleOutput: { ...RULE_OUTPUT, role: 'different' } },
    session: { answers: { ...ANSWERS, role_position: { answerIds: ['different'], customText: 'opening <b>batter</b>' } } },
  });
  assert.ok(!/[<>]/.test(withText.snapshot.role));
  assert.match(withText.snapshot.role, /batter/i);

  const unusable = build({
    profile: { ...makeProfile(), ruleOutput: { ...RULE_OUTPUT, role: 'different' } },
    session: { answers: { ...ANSWERS, role_position: { answerIds: ['different'], customText: '   ' } } },
  });
  assert.equal(unusable.snapshot.role, null, 'never an empty chip');
});

test('no snapshot field is ever the string "Unknown" or a raw answer id', () => {
  const bare = buildDisplayProfile({
    profile: { ...makeProfile(), ruleOutput: { ruleVersion: 1, observations: [], goals: [], strengths: [], supports: [], contextual: [] } },
    session: { answers: {} }, wording: WORDING(), focusRow: null, language: 'en',
  });
  for (const [k, v] of Object.entries(bare.snapshot)) {
    if (Array.isArray(v)) { assert.equal(v.length, 0, k); continue; }
    assert.ok(v === null, `${k} should be omitted, got ${v}`);
  }
});

// ── 18–20. Pathway + helps integrity ──────────────────────────────────────

test('pathway order follows the stored supported observations exactly', () => {
  const dp = build();
  assert.deepEqual(dp.startingPattern.nodes.map((n) => n.type), ['situation', 'reaction', 'effect', 'duration']);
  const codes = dp.startingPattern.nodes.filter((n) => n.code).map((n) => n.code);
  assert.deepEqual(codes, RULE_OUTPUT.observations.map((o) => o.code), 'stored order, unchanged');
});

test('no node ever appears that is not in the stored observations', () => {
  const dp = build();
  const stored = new Set(RULE_OUTPUT.observations.map((o) => o.code));
  for (const n of dp.startingPattern.nodes) {
    if (n.type === 'situation') continue;
    assert.ok(stored.has(n.code), `unsupported node: ${n.code}`);
  }
});

test('an observation with no clause in config is dropped, never rendered as a raw id', () => {
  const dp = build({
    profile: { ...makeProfile(), ruleOutput: { ...RULE_OUTPUT, observations: [{ code: 'made_up:nonsense', dim: 'reaction' }] } },
  });
  assert.deepEqual(dp.startingPattern.nodes.map((n) => n.type), ['situation']);
  for (const n of dp.startingPattern.nodes) assert.ok(!/:/.test(n.text), 'no id-shaped text');
});

test('a sparse profile yields a short pathway rather than a broken one', () => {
  const dp = build({ profile: { ...makeProfile(), ruleOutput: { ...RULE_OUTPUT, observations: [] } } });
  assert.equal(dp.startingPattern.nodes.length, 1);
  assert.equal(dp.startingPattern.nodes[0].type, 'situation');
  assert.ok(dp.startingPattern.nodes[0].text);
});

test('strengths and supports contain only athlete-selected, config-phraseable values', () => {
  const dp = build({
    profile: {
      ...makeProfile(),
      ruleOutput: {
        ...RULE_OUTPUT,
        strengths: ['hard_working', 'still_figuring', 'different'],
        supports: ['pre_routine', 'havent_noticed', 'different'],
      },
    },
  });
  assert.deepEqual(dp.strengths.map((s) => s.id), ['hard_working']);
  assert.deepEqual(dp.supports.map((s) => s.id), ['pre_routine']);
  for (const s of [...dp.strengths, ...dp.supports]) {
    assert.ok(cfg.STRENGTH_PHRASE[s.id] || cfg.SUPPORT_PHRASE[s.id], `${s.id} is not an athlete-selectable id`);
  }
});

test('chip labels drop the leading article and capitalise, without changing the rule engine wording', () => {
  const dp = build();
  assert.deepEqual(dp.supports.map((s) => s.label), ['Routine before you perform', 'Remembering past success']);
  assert.deepEqual(dp.strengths.map((s) => s.label), ['Hard-working', 'Supportive teammate']);
  // The underlying rule-engine phrases are untouched.
  assert.equal(cfg.SUPPORT_PHRASE.pre_routine.en, 'a routine before you perform');
  assert.equal(cfg.STRENGTH_PHRASE.supportive.en, 'a supportive teammate');
});

// ── 21. No numerical scoring anywhere ─────────────────────────────────────

test('the display payload contains no score, rating, rank or percentage of any kind', () => {
  const dp = build({ focusRow: { focusId: 'lose_focus', customText: null, source: 'ATHLETE_SELECTED', updatedAt: new Date() } });
  const json = JSON.stringify(dp);
  for (const banned of ['score', 'rating', 'percent', 'percentile', 'rank', 'severity', 'readiness', 'toughness']) {
    assert.ok(!new RegExp(banned, 'i').test(json), `payload mentions "${banned}"`);
  }
  // No numeric leaf values outside dates — a number here would read as a measure.
  const numeric = [];
  (function walk(node, path) {
    if (node && typeof node === 'object' && !(node instanceof Date)) {
      for (const [k, v] of Object.entries(node)) walk(v, `${path}.${k}`);
    } else if (typeof node === 'number') numeric.push(path);
  })(dp, '$');
  assert.deepEqual(numeric, [], `numeric fields present: ${numeric.join(', ')}`);
});

test('the interpretation and next step are the stored wording verbatim — no new generation', () => {
  const dp = build();
  assert.equal(dp.interpretation, 'PATTERN TEXT');
  assert.equal(dp.nextStep, 'BEGIN TEXT');
});

// ── Focus options ─────────────────────────────────────────────────────────

test('focus options put the athlete\'s own onboarding areas first, then the rest, with no duplicates', () => {
  const opts = buildFocusOptions({ ownMomentIds: ['after_mistake', 'lose_focus'], language: 'en' });
  assert.deepEqual(opts.slice(0, 2).map((o) => o.id), ['after_mistake', 'lose_focus']);
  assert.ok(opts.slice(0, 2).every((o) => o.personalised === true));
  assert.ok(opts.slice(2).every((o) => o.personalised === false));
  const ids = opts.map((o) => o.id);
  assert.equal(new Set(ids).size, ids.length, 'no duplicates');
  assert.deepEqual([...ids].sort(), [...APPROVED_FOCUS_IDS].sort(), 'exactly the canonical list');
  for (const o of opts) assert.ok(o.label && !o.label.includes('_'), `unlocalised label: ${o.label}`);
});

test('the canonical focus list is exactly the onboarding difficult_moments ids — no parallel list', () => {
  const momentIds = require('../src/onboarding/config').config.questions.difficult_moments.answers
    .map((a) => a.id)
    .filter((id) => id !== 'not_sure' && id !== 'different');
  assert.deepEqual([...APPROVED_FOCUS_IDS].sort(), [...momentIds].sort());
});

test('an unknown id in the athlete\'s own moments cannot smuggle itself into the options', () => {
  const opts = buildFocusOptions({ ownMomentIds: ['made_up', 'not_sure'], language: 'en' });
  assert.ok(!opts.some((o) => ['made_up', 'not_sure'].includes(o.id)));
});

test('normaliseFocusInput strips markup but keeps the athlete\'s actual words', () => {
  const ok = normaliseFocusInput({ focusId: 'different', customText: 'calm <i>hands</i> at the crease' });
  assert.ok(!/[<>]/.test(ok.customText), 'no markup survives');
  assert.match(ok.customText, /calm/);
  assert.match(ok.customText, /crease/, 'the words inside a tag are kept — only the tag is removed');
});

test('a rejected focus never echoes the athlete\'s text in the error', () => {
  // Markup-only input sanitises to nothing, so it is rejected rather than
  // stored as an empty focus.
  for (const customText of ['<b></b>', '   ', '']) {
    try {
      normaliseFocusInput({ focusId: 'different', customText });
      assert.fail(`should have rejected: ${JSON.stringify(customText)}`);
    } catch (e) {
      assert.equal(e.code, 'INVALID_FOCUS_TEXT');
      assert.equal(e.message, 'INVALID_FOCUS_TEXT', 'the message is the code, never athlete text');
    }
  }
});

// ── 22–23. Chat context ───────────────────────────────────────────────────

const CHAT_USER = { name: 'Rahul', sport: 'cricket', language: 'en', goals: '[]', experienceLevel: 'competitive' };
const CONFIRMED_PROFILE = {
  fitResponse: 'CONFIRMED', agreedPriorityId: 'after_mistake',
  sections: { whatMatters: 'WM', possiblePattern: 'PATTERN', whatHelps: 'WH', whereWeBegin: 'BEGIN' },
};

test('the current focus enters the coaching context as its own explicit block', () => {
  const prompt = buildSystemPrompt(CHAT_USER, [], [], 'general', {
    startingProfile: CONFIRMED_PROFILE,
    currentFocus: { id: 'lose_focus', label: 'Regain focus', phrase: 'what pulls your focus away', source: 'ATHLETE_SELECTED' },
  });
  assert.match(prompt, /## Athlete's Current Focus/);
  assert.match(prompt, /The athlete currently wants to work on: what pulls your focus away/);
  assert.match(prompt, /Treat this as the athlete's present priority/);
});

test('the starting profile remains in context as historical baseline, not as the present priority', () => {
  const prompt = buildSystemPrompt(CHAT_USER, [], [], 'general', {
    startingProfile: CONFIRMED_PROFILE,
    currentFocus: { id: 'lose_focus', label: 'Regain focus', phrase: 'what pulls your focus away' },
  });
  assert.match(prompt, /## Confirmed Starting Profile/, 'baseline still present');
  assert.match(prompt, /The Starting Performance Profile remains historical baseline context/);
  // The present priority is stated before the historical baseline.
  assert.ok(prompt.indexOf("## Athlete's Current Focus") < prompt.indexOf('## Confirmed Starting Profile'));
});

test('quick chat never receives the focus block (its own minimal prompt is unaffected)', () => {
  const prompt = buildSystemPrompt(CHAT_USER, [], [], 'general', {
    isQuickChat: true,
    startingProfile: CONFIRMED_PROFILE,
    currentFocus: { id: 'lose_focus', label: 'Regain focus', phrase: 'what pulls your focus away' },
  });
  assert.doesNotMatch(prompt, /## Athlete's Current Focus/);
  assert.doesNotMatch(prompt, /## Confirmed Starting Profile/);
});

test('no focus block appears when the athlete has no focus at all', () => {
  const prompt = buildSystemPrompt(CHAT_USER, [], [], 'general', { startingProfile: CONFIRMED_PROFILE, currentFocus: null });
  assert.doesNotMatch(prompt, /## Athlete's Current Focus/);
});

// ── 24–25. A focus selection is not a barrier and not a prescription ──────

test('the focus block forbids inferring a barrier or prescribing from the selection alone', () => {
  const prompt = buildSystemPrompt(CHAT_USER, [], [], 'general', {
    startingProfile: CONFIRMED_PROFILE,
    currentFocus: { id: 'after_mistake', label: 'Bounce back after mistakes', phrase: 'what happens after a mistake' },
  });
  assert.match(prompt, /not a barrier and not a diagnosis/i);
  assert.match(prompt, /Do NOT infer a barrier from it/);
  assert.match(prompt, /do NOT prescribe a practice because of it/);
  assert.match(prompt, /Ask your normal focused questions first/);
});

test('changing focus creates no CoachingCycle, Prescription, ChatSession or Message', async () => {
  const { app, client } = makeApp();
  await get(app, '/api/profile/starting');
  const res = await patch(app, '/api/profile/current-focus', { focusId: 'confidence_drops' });
  assert.equal(res.status, 200);
  assert.equal(client.__chatSessions.length, 0, 'no chat session');
  assert.equal(client.__messages.length, 0, 'no assistant or athlete message');
  assert.equal(client.__cycles.length, 0, 'no coaching cycle');
  assert.equal(client.__prescriptions.length, 0, 'no prescription');
});

test('changing focus twice updates one row in place — no history is deleted and none accumulates', async () => {
  const { app, client } = makeApp();
  await get(app, '/api/profile/starting');
  await patch(app, '/api/profile/current-focus', { focusId: 'lose_focus' });
  await patch(app, '/api/profile/current-focus', { focusId: 'pressure_increases' });
  assert.equal(client.__focuses.length, 1);
  assert.equal(client.__focuses[0].focusId, 'pressure_increases');
  assert.equal(client.__profiles.length, 1, 'the starting profile is still there, exactly one');
});

// ── 26. Stale follow-up opener suppression ────────────────────────────────

test('a follow-up opener older than the focus change is suppressed, non-destructively', async () => {
  const { createClaimPrescriptionFollowUp } = require('../src/services/coaching/claimPrescriptionFollowUp');
  const t0 = new Date('2026-07-01T00:00:00Z');
  const t1 = new Date('2026-07-20T00:00:00Z');
  const prescription = {
    id: 'pr-1', practiceKey: 'pre_performance_routine', situation: 'Penalties',
    status: 'ACTIVE', outcomeStatus: null, followUpOpenerClaimedAt: null,
    prescribedAt: t0, updatedAt: t0,
  };
  const cycle = { id: 'cy-1', status: 'ACTIVE' };
  const created = [];
  const updated = [];
  const db = {
    $transaction: async (fn) => fn(db),
    chatSession: { findUnique: async () => ({ userId: 'u1', mode: 'main' }) },
    userCoachingState: { findUnique: async () => ({ activeSelection: { cycle, prescription } }) },
    currentCoachingFocus: { findUnique: async () => ({ updatedAt: t1 }) },
    prescription: {
      updateMany: async () => { updated.push('claim'); return { count: 1 }; },
      update: async () => { updated.push('update'); return {}; },
    },
    message: { create: async (a) => { created.push(a); return { id: 'm1' }; } },
  };
  const claim = createClaimPrescriptionFollowUp(db);
  const res = await claim({ userId: 'u1', chatSessionId: 'cs-1', language: 'en' });

  assert.equal(res.claimed, false);
  assert.equal(res.focusChangedSince, true);
  assert.ok(!res.outcomePending, 'stale outcome choices are withheld too');
  assert.deepEqual(created, [], 'no opener message persisted');
  assert.deepEqual(updated, [], 'nothing claimed, nothing marked — the old work is untouched');
  assert.equal(prescription.status, 'ACTIVE', 'prescription not resolved or abandoned');
  assert.equal(cycle.status, 'ACTIVE', 'cycle not resolved or abandoned');
  assert.equal(prescription.outcomeStatus, null, 'no outcome invented');
});

test('a prescription newer than the focus change still gets its opener', async () => {
  const { createClaimPrescriptionFollowUp } = require('../src/services/coaching/claimPrescriptionFollowUp');
  const prescription = {
    id: 'pr-1', practiceKey: 'pre_performance_routine', situation: 'Penalties',
    status: 'ACTIVE', outcomeStatus: null, followUpOpenerClaimedAt: null,
    prescribedAt: new Date('2026-07-25T00:00:00Z'), updatedAt: new Date('2026-07-25T00:00:00Z'),
  };
  const db = {
    $transaction: async (fn) => fn(db),
    chatSession: { findUnique: async () => ({ userId: 'u1', mode: 'main' }) },
    userCoachingState: { findUnique: async () => ({ activeSelection: { cycle: { id: 'cy-1', status: 'ACTIVE' }, prescription } }) },
    currentCoachingFocus: { findUnique: async () => ({ updatedAt: new Date('2026-07-10T00:00:00Z') }) },
    prescription: { updateMany: async () => ({ count: 1 }), update: async () => ({}) },
    message: { create: async ({ data }) => ({ id: 'm1', ...data }) },
  };
  const res = await createClaimPrescriptionFollowUp(db)({ userId: 'u1', chatSessionId: 'cs-1', language: 'en' });
  assert.equal(res.claimed, true);
  assert.equal(res.outcomePending, true);
});

test('with no focus row at all the opener behaves exactly as before', async () => {
  const { createClaimPrescriptionFollowUp } = require('../src/services/coaching/claimPrescriptionFollowUp');
  const db = {
    $transaction: async (fn) => fn(db),
    chatSession: { findUnique: async () => ({ userId: 'u1', mode: 'main' }) },
    userCoachingState: { findUnique: async () => ({ activeSelection: {
      cycle: { id: 'cy-1', status: 'ACTIVE' },
      prescription: { id: 'pr-1', practiceKey: 'pre_performance_routine', situation: 'S', status: 'ACTIVE', outcomeStatus: null, followUpOpenerClaimedAt: null, prescribedAt: new Date(), updatedAt: new Date() },
    } }) },
    currentCoachingFocus: { findUnique: async () => null },
    prescription: { updateMany: async () => ({ count: 1 }), update: async () => ({}) },
    message: { create: async ({ data }) => ({ id: 'm1', ...data }) },
  };
  const res = await createClaimPrescriptionFollowUp(db)({ userId: 'u1', chatSessionId: 'cs-1', language: 'en' });
  assert.equal(res.claimed, true);
});

// ── 27–28. Continue coaching idempotency + consent ────────────────────────

test('Continue coaching stays idempotent after a focus change — one session, one first message', async () => {
  const { app, client } = makeApp();
  await get(app, '/api/profile/starting');
  await patch(app, '/api/profile/current-focus', { focusId: 'lose_focus' });
  const a = await post(app, '/api/profile/start-chat');
  const b = await post(app, '/api/profile/start-chat');
  assert.equal(a.status, 200);
  assert.equal(a.body.chatSessionId, b.body.chatSessionId);
  assert.equal(client.__chatSessions.length, 1);
  assert.equal(client.__messages.length, 1);
});

test('a consent-pending minor can read the profile and change focus, but not enter coaching', async () => {
  const pending = { id: 'u1', name: 'Ravi', language: 'en', dateOfBirth: new Date('2012-01-01'), guardianConsentAt: null, guardianEmail: 'parent@example.com' };
  const { app, client } = makeApp({ user: pending, consentBlocks: true });

  const view = await get(app, '/api/profile/starting');
  assert.equal(view.status, 200);
  assert.ok(view.body.profile.displayProfile, 'full visual profile is readable');
  assert.equal(view.body.consent.pending, true);
  assert.ok(view.body.consent.guardianEmailMasked, 'guardian email is masked, never raw');
  assert.ok(!view.body.consent.guardianEmailMasked.includes('parent'), 'local part is masked');

  const focus = await patch(app, '/api/profile/current-focus', { focusId: 'lose_focus' });
  assert.equal(focus.status, 200, 'changing a saved preference is not gated');
  assert.equal(client.__chatSessions.length, 0, 'and it creates no chat session');
  assert.equal(client.__messages.length, 0);

  const chat = await post(app, '/api/profile/start-chat');
  assert.equal(chat.status, 403, 'coaching itself stays gated');
});


// ── Correction 2: the follow-up suppression uses an IMMUTABLE timestamp ────
// updatedAt is bumped after issuance by outcome recording, practice completion,
// and the opener's own claim/message-link writes. prescribedAt is set once by
// @default(now()) and written nowhere in src/, so it is the real issuance time.

const { createClaimPrescriptionFollowUp } = require('../src/services/coaching/claimPrescriptionFollowUp');

function makeFollowUpDb({ prescription, cycle, focusUpdatedAt = null }) {
  const writes = [];
  const db = {
    $transaction: async (fn) => fn(db),
    chatSession: { findUnique: async () => ({ userId: 'u1', mode: 'main' }) },
    userCoachingState: { findUnique: async () => ({ activeSelection: { cycle, prescription } }) },
    currentCoachingFocus: { findUnique: async () => (focusUpdatedAt ? { updatedAt: focusUpdatedAt } : null) },
    prescription: {
      updateMany: async (a) => { writes.push(['prescription.updateMany', a]); return { count: 1 }; },
      update: async (a) => { writes.push(['prescription.update', a]); return {}; },
    },
    coachingCycle: { update: async (a) => { writes.push(['cycle.update', a]); return {}; } },
    activeCoachingSelection: {
      update: async (a) => { writes.push(['selection.update', a]); return {}; },
      delete: async (a) => { writes.push(['selection.delete', a]); return {}; },
    },
    message: { create: async ({ data }) => { writes.push(['message.create', data]); return { id: 'm-1', ...data }; } },
    __writes: writes,
  };
  return db;
}

const activePrescription = (over = {}) => ({
  id: 'pr-1', practiceKey: 'pre_performance_routine', situation: 'Penalty kicks',
  status: 'ACTIVE', outcomeStatus: null, followUpOpenerClaimedAt: null,
  prescribedAt: new Date('2026-07-01T00:00:00Z'),
  updatedAt: new Date('2026-07-01T00:00:00Z'),
  ...over,
});

test('a prescription ISSUED BEFORE the focus change does not trigger the outdated opener', async () => {
  const prescription = activePrescription({ prescribedAt: new Date('2026-07-01T00:00:00Z') });
  const cycle = { id: 'cy-1', status: 'ACTIVE' };
  const db = makeFollowUpDb({ prescription, cycle, focusUpdatedAt: new Date('2026-07-20T00:00:00Z') });

  const res = await createClaimPrescriptionFollowUp(db)({ userId: 'u1', chatSessionId: 'cs-1', language: 'en' });
  assert.equal(res.claimed, false);
  assert.equal(res.focusChangedSince, true);
  assert.ok(!res.outcomePending, 'stale outcome choices are withheld too');
  assert.deepEqual(db.__writes, [], 'nothing written at all');
});

test('a prescription ISSUED AFTER the focus change still triggers its valid opener', async () => {
  const prescription = activePrescription({ prescribedAt: new Date('2026-07-25T00:00:00Z') });
  const db = makeFollowUpDb({
    prescription, cycle: { id: 'cy-1', status: 'ACTIVE' },
    focusUpdatedAt: new Date('2026-07-10T00:00:00Z'),
  });
  const res = await createClaimPrescriptionFollowUp(db)({ userId: 'u1', chatSessionId: 'cs-1', language: 'en' });
  assert.equal(res.claimed, true);
  assert.equal(res.outcomePending, true);
  assert.ok(db.__writes.some(([k]) => k === 'message.create'));
});

test('an unrelated updatedAt bump CANNOT make an old prescription look new', async () => {
  // The exact regression the audit found: the athlete reported
  // HELPED_A_LITTLE (or completed the practice from the practice page) after
  // changing focus, which bumps updatedAt. Keyed on updatedAt the stale opener
  // would fire; keyed on prescribedAt it stays suppressed.
  const prescription = activePrescription({
    prescribedAt: new Date('2026-07-01T00:00:00Z'),
    updatedAt: new Date('2026-07-28T00:00:00Z'), // bumped long after issuance
    outcomeStatus: 'HELPED_A_LITTLE',
  });
  const db = makeFollowUpDb({
    prescription, cycle: { id: 'cy-1', status: 'ACTIVE' },
    focusUpdatedAt: new Date('2026-07-20T00:00:00Z'),
  });
  const res = await createClaimPrescriptionFollowUp(db)({ userId: 'u1', chatSessionId: 'cs-1', language: 'en' });
  assert.equal(res.claimed, false, 'updatedAt must not be what decides this');
  assert.equal(res.focusChangedSince, true);
  assert.deepEqual(db.__writes, []);
});

test('the suppression reads prescribedAt, not updatedAt (source-level guarantee)', () => {
  const src = require('node:fs').readFileSync(
    require('node:path').join(__dirname, '../src/services/coaching/claimPrescriptionFollowUp.js'), 'utf8');
  assert.match(src, /focus\.updatedAt > prescription\.prescribedAt/);
  assert.doesNotMatch(src, /focus\.updatedAt > prescription\.updatedAt/);
});

test('prescribedAt is never written anywhere in src/ — it is genuinely immutable', () => {
  const { execSync } = require('node:child_process');
  const out = execSync(
    "grep -rn 'prescribedAt' " + require('node:path').join(__dirname, '../src') + " || true",
    { encoding: 'utf8' });
  const writes = out.split('\n').filter((l) => /prescribedAt\s*:/.test(l));
  assert.deepEqual(writes, [], `prescribedAt is assigned somewhere: ${writes.join(' | ')}`);
});

test('suppression leaves the historical cycle and prescription completely unchanged', async () => {
  const prescription = activePrescription({ prescribedAt: new Date('2026-07-01T00:00:00Z') });
  const cycle = { id: 'cy-1', status: 'ACTIVE', resolvedAt: null, abandonedAt: null };
  const before = { p: { ...prescription }, c: { ...cycle } };
  const db = makeFollowUpDb({ prescription, cycle, focusUpdatedAt: new Date('2026-07-20T00:00:00Z') });

  await createClaimPrescriptionFollowUp(db)({ userId: 'u1', chatSessionId: 'cs-1', language: 'en' });
  assert.deepEqual(prescription, before.p, 'prescription untouched');
  assert.deepEqual(cycle, before.c, 'cycle untouched — not resolved, not abandoned');
  assert.equal(prescription.followUpOpenerClaimedAt, null, 'no claim flag written');
  assert.equal(prescription.outcomeStatus, null, 'no outcome invented');
});

// ── Correction 3: performance-coaching scope for a custom focus ────────────

test('valid sport-performance focuses are accepted', () => {
  for (const text of [
    'stay calm before matches',
    'trust myself against swing bowling',
    'recover after mistakes',
    'communicate better with my coach',
    'stay focused in training',
    'return confidently after injury',
    'stop overthinking at the crease',
    'handle pressure in the last over',
  ]) {
    assert.equal(checkFocusScope(text).inScope, true, `wrongly rejected: ${text}`);
  }
});

test('informal, misspelled, short and Hinglish sport phrases are accepted', () => {
  for (const text of [
    'presure in matchs',           // misspellings
    'match me dhyan nahi rehta',   // Hinglish
    'galti ke baad tension',        // Hinglish
    'confidance',                   // misspelling, single word
    'focus',                        // single word
    'दबाव में शांत रहना',            // Devanagari
    'bowling ke time nervous',      // mixed
    'not gettin angry after a bad shot',
  ]) {
    assert.equal(checkFocusScope(text).inScope, true, `wrongly rejected: ${text}`);
  }
});

test('clearly unrelated requests are rejected', () => {
  for (const text of [
    'help me with school mathematics',
    'teach me coding',
    'plan my holiday',
    'help me choose a laptop',
    'write my homework',
    'explain algebra to me',
    'find me a hotel in Goa',
    'do my chemistry homework',
  ]) {
    const r = checkFocusScope(text);
    assert.equal(r.inScope, false, `wrongly accepted: ${text}`);
    assert.ok(r.reasonCode, 'a fixed reason code is returned');
  }
});

test('an off-topic word alongside a genuine sport focus is still accepted', () => {
  // The permissive half of the design: an athlete can mention school and sport
  // in the same breath without losing their focus.
  assert.equal(checkFocusScope('staying focused in training even during exam season').inScope, true);
  assert.equal(checkFocusScope('pressure before matches and before my board exam').inScope, true);
});

test('the scope check returns a fixed reason code and never the athlete text', () => {
  const r = checkFocusScope('help me choose a laptop SECRETPHRASE');
  assert.equal(r.inScope, false);
  assert.ok(['OFF_TOPIC_REQUEST', 'OFF_TOPIC_SUBJECT', 'EMPTY'].includes(r.reasonCode));
  assert.ok(!JSON.stringify(r).includes('SECRETPHRASE'));
});

test('an out-of-scope custom focus is rejected with 400 and stores nothing', async () => {
  const { app, client } = makeApp();
  await get(app, '/api/profile/starting');
  const res = await patch(app, '/api/profile/current-focus', {
    focusId: 'different', customText: 'help me with school mathematics',
  });
  assert.equal(res.status, 400);
  assert.equal(res.body.error, 'OUT_OF_SCOPE_FOCUS');
  assert.equal(client.__focuses.length, 0, 'nothing stored');
});

test('a rejected custom focus creates no unrelated records at all', async () => {
  const { app, client } = makeApp();
  await get(app, '/api/profile/starting');
  await patch(app, '/api/profile/current-focus', { focusId: 'different', customText: 'teach me coding' });
  assert.equal(client.__focuses.length, 0);
  assert.equal(client.__chatSessions.length, 0);
  assert.equal(client.__messages.length, 0);
  assert.equal(client.__cycles.length, 0);
  assert.equal(client.__prescriptions.length, 0);
  assert.equal(client.__toolReports.length, 0);
  assert.equal(client.__profiles.length, 1, 'the starting profile is untouched');
});

test('a rejected custom focus never enters the chat context', async () => {
  const { app, client } = makeApp();
  await get(app, '/api/profile/starting');
  await patch(app, '/api/profile/current-focus', { focusId: 'different', customText: 'plan my holiday' });

  // No focus row exists, so the context loader falls back to the confirmed
  // starting priority — the rejected text can never reach the prompt.
  const focus = resolveCurrentFocus({
    focusRow: client.__focuses[0] || null,
    profile: client.__profiles[0],
    ruleOutput: client.__profiles[0].ruleOutput,
    language: 'en',
  });
  assert.equal(focus.source, 'STARTING_PROFILE');
  const prompt = buildSystemPrompt(CHAT_USER, [], [], 'general', {
    startingProfile: CONFIRMED_PROFILE, currentFocus: focus,
  });
  assert.ok(!prompt.includes('holiday'), 'rejected focus text must never reach the prompt');
});

test('a rejected custom focus logs no raw athlete text', async () => {
  const logs = [];
  const orig = { error: console.error, warn: console.warn, log: console.log };
  console.error = (...a) => logs.push(a.join(' '));
  console.warn = (...a) => logs.push(a.join(' '));
  console.log = (...a) => logs.push(a.join(' '));
  try {
    const { app } = makeApp();
    await get(app, '/api/profile/starting');
    await patch(app, '/api/profile/current-focus', {
      focusId: 'different', customText: 'help me choose a laptop for SECRETSTUDIES',
    });
  } finally {
    Object.assign(console, orig);
  }
  const joined = logs.join('\n');
  assert.ok(!joined.includes('SECRETSTUDIES'), 'athlete text leaked into logs');
  assert.ok(/focus out of scope: OFF_TOPIC/.test(joined), 'a fixed reason code IS logged');
});

test('safety screening still runs first and is not replaced by the scope check', async () => {
  // Safety-sensitive text that would ALSO fail the scope check must take the
  // safety pathway, not the scope error — support guidance, not a nudge to
  // pick something sport-related.
  const events = [];
  const safety = {
    screenSafetyText: () => ({ flagged: true, category: 'self_harm', riskLevel: 'high' }),
    recordSafetyEvent: (...a) => events.push(a),
    getSafetyGuidance: () => 'Support guidance text',
  };
  const { app, client } = makeApp({ safety });
  await get(app, '/api/profile/starting');
  const res = await patch(app, '/api/profile/current-focus', {
    focusId: 'different', customText: 'help me choose a laptop',
  });
  assert.equal(res.status, 200);
  assert.equal(res.body.saved, false);
  assert.equal(res.body.safetyFlag, 'needs_support');
  assert.equal(res.body.guidance, 'Support guidance text');
  assert.notEqual(res.body.error, 'OUT_OF_SCOPE_FOCUS', 'safety wins over scope');
  assert.equal(events.length, 1);
  assert.equal(client.__focuses.length, 0);
});

test('safety runs before scope in the source, so it can never be skipped', () => {
  const src = require('node:fs').readFileSync(
    require('node:path').join(__dirname, '../src/profile/profileService.js'), 'utf8');
  const safetyIdx = src.indexOf('safety.screenSafetyText(customText)');
  const scopeIdx = src.indexOf('checkFocusScope(customText)');
  assert.ok(safetyIdx !== -1 && scopeIdx !== -1);
  assert.ok(safetyIdx < scopeIdx, 'safety screening must come first');
});

test('an in-scope custom focus is still saved normally', async () => {
  const { app, client } = makeApp();
  await get(app, '/api/profile/starting');
  const res = await patch(app, '/api/profile/current-focus', {
    focusId: 'different', customText: 'trust myself against swing bowling',
  });
  assert.equal(res.status, 200);
  assert.equal(res.body.saved, true);
  assert.equal(client.__focuses.length, 1);
  assert.match(res.body.currentFocus.label, /swing bowling/);
});

test('the scope module is pure — no I/O, no model call, no logging', () => {
  const src = require('node:fs').readFileSync(
    require('node:path').join(__dirname, '../src/profile/focusScope.js'), 'utf8');
  assert.doesNotMatch(src, /PrismaClient|@anthropic-ai|messages\.(create|stream)|console\./);
});

// ── Correction 1: fit status is no longer part of the Current Focus card ──
// (Client-side rendering is asserted in performanceProfile.dom.test.jsx; the
// API keeps the field for compatibility.)

test('fitStatus remains in the API payload for compatibility', () => {
  const dp = build();
  assert.equal(dp.fitStatus, 'CONFIRMED');
});

test('the current focus object carries no fit-response metadata of its own', () => {
  const dp = build();
  const keys = Object.keys(dp.currentFocus);
  for (const banned of ['fitStatus', 'fitResponse', 'confirmed', 'isConfirmed']) {
    assert.ok(!keys.includes(banned), `currentFocus must not carry ${banned}`);
  }
});

// ── Harness ───────────────────────────────────────────────────────────────

function makeApp({ user, generateWording, safety, consentBlocks = false } = {}) {
  const client = makeClient({ user });
  const deps = {
    // The real contract: returns { sections, wordingStatus,
    // deterministicFallbackUsed }. Here it always yields the deterministic
    // drafts, so no test depends on model output.
    generateWording: generateWording || (async (input) => ({
      sections: input.drafts, wordingStatus: 'FALLBACK_USED', deterministicFallbackUsed: true,
    })),
    safety: safety || {
      screenSafetyText: () => ({ flagged: false }),
      recordSafetyEvent: () => {},
      getSafetyGuidance: () => 'guidance',
    },
    requireGuardianConsent: consentBlocks
      ? (req, res) => res.status(403).json({ error: 'CONSENT_REQUIRED' })
      : (req, res, next) => next(),
  };
  const app = express();
  app.use(express.json());
  app.use('/api/profile', createProfileRouter(client, deps));
  return { app, client };
}

const AUTH = { Authorization: `Bearer ${jwt.sign({ userId: 'u1' }, TEST_JWT_SECRET, { expiresIn: '15m' })}` };

async function call(app, method, path, body) {
  const { createServer } = require('node:http');
  const server = createServer(app);
  await new Promise((r) => server.listen(0, r));
  const { port } = server.address();
  try {
    const res = await fetch(`http://127.0.0.1:${port}${path}`, {
      method,
      headers: { ...AUTH, ...(body ? { 'Content-Type': 'application/json' } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
    const text = await res.text();
    return { status: res.status, body: text ? JSON.parse(text) : null };
  } finally {
    await new Promise((r) => server.close(r));
  }
}
const get = (app, path) => call(app, 'GET', path);
const post = (app, path, body) => call(app, 'POST', path, body);
const patch = (app, path, body) => call(app, 'PATCH', path, body);

function makeClient({ user } = {}) {
  const u = user || { id: 'u1', name: 'Rahul Sharma', language: 'en', dateOfBirth: new Date('2004-01-01'), guardianConsentAt: new Date(), guardianEmail: null };
  const users = { [u.id]: u };
  const sessions = [{
    id: 'os-1', userId: u.id, onboardingVersion: 2, attemptNumber: 1, status: 'COMPLETED',
    branchId: 'mistakes', primaryPriorityId: 'after_mistake', answers: ANSWERS,
  }];
  const profiles = [];
  const wordings = [];
  const chatSessions = [];
  const messages = [];
  const focuses = [];
  const cycles = [];
  const prescriptions = [];
  const toolReports = [];
  let n = 1;

  const findProfile = (where) => profiles.find((p) =>
    (where.id === undefined || p.id === where.id) &&
    (where.onboardingSessionId === undefined || p.onboardingSessionId === where.onboardingSessionId));

  const client = {
    user: {
      findUnique: async ({ where, select }) => {
        const row = users[where.id];
        if (!row) return null;
        if (!select) return { ...row };
        const out = {};
        for (const k of Object.keys(select)) if (select[k]) out[k] = row[k];
        return out;
      },
    },
    onboardingSession: {
      findFirst: async ({ where }) => sessions.find((s) => s.userId === where.userId && (!where.status || s.status === where.status)) || null,
    },
    startingPerformanceProfile: {
      findUnique: async ({ where }) => { const p = findProfile(where); return p ? { ...p } : null; },
      findFirst: async ({ where }) => {
        const p = profiles.find((x) => x.userId === where.userId);
        return p ? { ...p } : null;
      },
      create: async ({ data }) => {
        const row = {
          id: `sp-${n++}`, profileVersion: 1, ruleVersion: 1, fitResponse: 'CONFIRMED',
          correctionSelectedId: null, correctionText: null, agreedPriorityId: 'after_mistake',
          firstChatSessionId: null, confirmedAt: new Date('2026-07-27T00:00:00Z'),
          generatedAt: new Date('2026-07-20T00:00:00Z'), updatedAt: new Date('2026-07-27T00:00:00Z'), ...data,
        };
        profiles.push(row);
        return { ...row };
      },
      update: async ({ where, data }) => { const p = findProfile(where); Object.assign(p, data); return { ...p }; },
      updateMany: async ({ where, data }) => {
        const rows = profiles.filter((p) => (where.id === undefined || p.id === where.id)
          && (where.firstChatSessionId !== null || p.firstChatSessionId === null));
        rows.forEach((r) => Object.assign(r, data));
        return { count: rows.length };
      },
    },
    startingProfileWording: {
      findUnique: async ({ where }) => {
        const k = where.profileId_language;
        const w = wordings.find((x) => x.profileId === k.profileId && x.language === k.language);
        return w ? { ...w } : null;
      },
      create: async ({ data }) => {
        const row = { id: `w-${n++}`, generatedAt: new Date(), updatedAt: new Date(), ...data };
        wordings.push(row);
        return { ...row };
      },
    },
    currentCoachingFocus: {
      findUnique: async ({ where }) => focuses.find((f) => f.userId === where.userId) || null,
      upsert: async ({ where, create, update }) => {
        const existing = focuses.find((f) => f.userId === where.userId);
        if (existing) { Object.assign(existing, update, { updatedAt: new Date() }); return { ...existing }; }
        const row = { id: `cf-${n++}`, customText: null, source: 'ATHLETE_SELECTED', createdAt: new Date(), updatedAt: new Date(), ...create };
        focuses.push(row);
        return { ...row };
      },
    },
    chatSession: { create: async ({ data }) => { const row = { id: `cs-${n++}`, createdAt: new Date(), ...data }; chatSessions.push(row); return { ...row }; } },
    message: { create: async ({ data }) => { const row = { id: `m-${n++}`, createdAt: new Date(), ...data }; messages.push(row); return { ...row }; } },
    coachingCycle: { create: async ({ data }) => { const row = { id: `cy-${n++}`, ...data }; cycles.push(row); return { ...row }; } },
    toolReport: { create: async ({ data }) => { const row = { id: `tr-${n++}`, ...data }; toolReports.push(row); return { ...row }; } },
    prescription: { create: async ({ data }) => { const row = { id: `pr-${n++}`, ...data }; prescriptions.push(row); return { ...row }; } },
    $transaction: async (fn) => fn(client),
    __profiles: profiles, __wordings: wordings, __chatSessions: chatSessions,
    __messages: messages, __users: users, __focuses: focuses,
    __cycles: cycles, __prescriptions: prescriptions, __toolReports: toolReports,
  };
  return client;
}

// ── MVP simplification: the profile shows the athlete's OWN answers ────────
// The rule engine still runs and still feeds Coach; what changed is that the
// athlete-facing payload now carries structured ids + verbatim custom text,
// so the client can print exactly what they chose.

const SIMPLE_ANSWERS = {
  ...ANSWERS,
  mistakes_first_response: { answerIds: ['angry_self'] },
  mistakes_next: { answerIds: ['lose_focus'] },
  mistakes_recovery: { answerIds: ['few_minutes'] },
};

const buildSimple = (over = {}) => buildDisplayProfile({
  profile: { ruleOutput: RULE_OUTPUT, ...(over.profile || {}) },
  session: { branchId: 'mistakes', answers: SIMPLE_ANSWERS, ...(over.session || {}) },
  wording: { sections: {} },
  language: over.language || 'en',
});

test('pressure carries the four stages as raw answers, situation first', () => {
  const dp = buildSimple();
  assert.equal(dp.pressure.branchId, 'mistakes');
  assert.deepEqual(dp.pressure.stages.map((s) => s.stage), ['situation', 'firstResponse', 'impact', 'reset']);
  assert.deepEqual(dp.pressure.stages.map((s) => s.questionId), [
    'primary_priority', 'mistakes_first_response', 'mistakes_next', 'mistakes_recovery',
  ]);
  assert.deepEqual(dp.pressure.stages.map((s) => s.answerIds[0]), [
    'after_mistake', 'angry_self', 'lose_focus', 'few_minutes',
  ]);
  // Ids and verbatim text only — no phrasing of any kind travels in here.
  for (const stage of dp.pressure.stages) {
    assert.deepEqual(Object.keys(stage).sort(), ['answerIds', 'customText', 'questionId', 'stage', 'status']);
    assert.equal(stage.status, 'set');
  }
});

test('the rule engine\'s own phrasing is never what the pressure payload says', () => {
  const dp = buildSimple();
  const serialized = JSON.stringify(dp.pressure);
  // The rendered clause for the same answer, which the profile must not use.
  assert.ok(cfg.CLAUSE['mistakes_first_response:angry_self'].en.length > 0);
  assert.ok(!serialized.includes(cfg.CLAUSE['mistakes_first_response:angry_self'].en));
  assert.ok(!serialized.includes(cfg.CLAUSE['mistakes_next:lose_focus'].en));
  // …while the interpreted pattern is still built for Coach.
  assert.ok(dp.startingPattern.nodes.length > 0);
});

test('an unanswered stage is reported unset, never filled in', () => {
  const answers = { ...SIMPLE_ANSWERS };
  delete answers.mistakes_next;
  const dp = buildSimple({ session: { branchId: 'mistakes', answers } });
  const impact = dp.pressure.stages.find((s) => s.stage === 'impact');
  assert.equal(impact.status, 'unset');
  assert.deepEqual(impact.answerIds, []);
});

test('a single-choice question holding two historical answers is reported ambiguous', () => {
  const dp = buildSimple({
    session: { branchId: 'mistakes', answers: { ...SIMPLE_ANSWERS, mistakes_first_response: { answerIds: ['keep_thinking', 'angry_self'] } } },
  });
  const stage = dp.pressure.stages.find((s) => s.stage === 'firstResponse');
  assert.equal(stage.status, 'ambiguous');
  assert.deepEqual(stage.answerIds, ['keep_thinking', 'angry_self']);
});

test('custom answer text is carried verbatim, and sanitised at read time', () => {
  const dp = buildSimple({
    session: {
      branchId: 'mistakes',
      answers: { ...SIMPLE_ANSWERS, mistakes_first_response: { answerIds: ['something_else'], customText: '<b>I go</b>  completely silent' } },
    },
  });
  const stage = dp.pressure.stages.find((s) => s.stage === 'firstResponse');
  assert.deepEqual(stage.answerIds, ['something_else']);
  assert.equal(stage.customText, 'I go completely silent');
});

test('a branch with no performance-impact question simply omits that stage', () => {
  const dp = buildDisplayProfile({
    profile: { ruleOutput: { ...RULE_OUTPUT, branch: 'injury' } },
    session: {
      branchId: 'injury',
      answers: {
        primary_priority: { answerIds: ['injury_return'] },
        injury_stage: { answerIds: ['recovering_not_playing'] },
        injury_concern: { answerIds: ['re_injury_fear'] },
        injury_recovery: { answerIds: ['few_minutes'] },
      },
    },
    wording: { sections: {} },
    language: 'en',
  });
  // No performance impact is fabricated for a branch that never asked for one…
  assert.equal(dp.pressure.stages.some((s) => s.stage === 'impact'), false);
  // …and the branch's own non-sequence question is carried as secondary
  // context, so a question the athlete answered is never invisible.
  assert.deepEqual(dp.pressure.stages.map((s) => s.stage), ['situation', 'firstResponse', 'reset', 'context']);
  const context = dp.pressure.stages.find((s) => s.stage === 'context');
  assert.equal(context.questionId, 'injury_stage');
  assert.deepEqual(context.answerIds, ['recovering_not_playing']);
});

test('the branch is re-resolved for rows written before branchId was stored', () => {
  const dp = buildSimple({ session: { branchId: null, answers: SIMPLE_ANSWERS } });
  assert.equal(dp.pressure.branchId, 'mistakes');
});

test('selections carry what-helps, strengths and both goal answers as raw ids', () => {
  const dp = buildSimple();
  assert.deepEqual(dp.selections.supports.answerIds, ['pre_routine', 'remembering_success']);
  assert.deepEqual(dp.selections.strengths.answerIds, ['hard_working', 'supportive']);
  assert.deepEqual(dp.selections.broadGoals.answerIds, ['focus', 'confidence']);
  assert.deepEqual(dp.selections.fourWeekOutcome.answerIds, ['enjoy_competing']);
  for (const key of ['supports', 'strengths', 'broadGoals', 'fourWeekOutcome']) {
    assert.equal(dp.selections[key].status, 'set');
  }
});

test('an athlete who named nothing gets "unset" selections, not empty-looking ones', () => {
  const answers = { ...SIMPLE_ANSWERS };
  delete answers.supports;
  delete answers.strengths;
  delete answers.broad_goals;
  const dp = buildSimple({ session: { branchId: 'mistakes', answers } });
  assert.equal(dp.selections.supports.status, 'unset');
  assert.equal(dp.selections.strengths.status, 'unset');
  assert.equal(dp.selections.broadGoals.status, 'unset');
  assert.equal(dp.selections.fourWeekOutcome.status, 'set');
});

test('the payload is language-independent — ids do not change with the language', () => {
  const en = buildSimple({ language: 'en' });
  const hi = buildSimple({ language: 'hi' });
  assert.deepEqual(en.pressure, hi.pressure);
  assert.deepEqual(en.selections, hi.selections);
});

// ── Coach context: the athlete's own answers as BACKGROUND ────────────────
// Simplifying the profile screen must not weaken the coaching loop. Coach
// keeps everything it had, plus a deterministic read of what the athlete
// actually told us — explicitly framed as background, never as today's
// confirmed barrier.

const { loadConfirmedProfile } = require('../src/profile/loadConfirmedProfile');

const BACKGROUND_PROFILE = {
  ...CONFIRMED_PROFILE,
  situation: 'after a mistake',
  patternSteps: [
    { type: 'situation', label: 'Situation', text: 'after a mistake' },
    { type: 'reaction', label: 'Reaction', text: 'frustration with yourself can rise' },
    { type: 'effect', label: 'Performance effect', text: 'your focus may dip' },
  ],
  supports: ['A routine before you perform'],
  strengths: ['Hard-working'],
};

test('loadConfirmedProfile returns the deterministic pressure background alongside the wording', async () => {
  const client = {
    startingPerformanceProfile: {
      findFirst: async () => ({
        fitResponse: 'CONFIRMED', agreedPriorityId: 'after_mistake', ruleOutput: RULE_OUTPUT,
        wordingVariants: [{ language: 'en', sections: CONFIRMED_PROFILE.sections }],
      }),
    },
  };
  const loaded = await loadConfirmedProfile('u1', 'en', client);
  assert.equal(loaded.fitResponse, 'CONFIRMED');
  assert.equal(loaded.agreedPriorityId, 'after_mistake');
  assert.deepEqual(loaded.sections, CONFIRMED_PROFILE.sections);
  // Situation → reaction → effect → duration, all from stored answers.
  assert.ok(loaded.situation);
  assert.deepEqual(loaded.patternSteps.map((s) => s.type), ['situation', 'reaction', 'effect', 'duration']);
  assert.deepEqual(loaded.supports, ['Routine before you perform', 'Remembering past success']);
  assert.deepEqual(loaded.strengths, ['Hard-working', 'Supportive teammate']);
});

test('Coach receives the pressure background, labelled as background only', () => {
  const prompt = buildSystemPrompt(CHAT_USER, [], [], 'general', { startingProfile: BACKGROUND_PROFILE, currentFocus: null });
  assert.match(prompt, /### What they told us \(background only\)/);
  assert.match(prompt, /When pressure hits — Situation: after a mistake → Reaction: frustration with yourself can rise → Performance effect: your focus may dip/);
  assert.match(prompt, /What helps them: A routine before you perform/);
  assert.match(prompt, /Strengths they named: Hard-working/);
});

test('the background can be asked about, but never becomes today\'s barrier on its own', () => {
  const prompt = buildSystemPrompt(CHAT_USER, [], [], 'general', { startingProfile: BACKGROUND_PROFILE, currentFocus: null });
  assert.match(prompt, /This is BACKGROUND, not today's conclusion/);
  assert.match(prompt, /You may ASK whether today is similar/);
  assert.match(prompt, /still has to confirm the barrier in their own words before any Mental Rep is offered/);
});

test('a profile with no stored background adds no block at all', () => {
  const prompt = buildSystemPrompt(CHAT_USER, [], [], 'general', { startingProfile: CONFIRMED_PROFILE, currentFocus: null });
  assert.match(prompt, /## Confirmed Starting Profile/);
  assert.doesNotMatch(prompt, /### What they told us/);
});

test('quick chat never receives the background block either', () => {
  const prompt = buildSystemPrompt(CHAT_USER, [], [], 'general', { isQuickChat: true, startingProfile: BACKGROUND_PROFILE });
  assert.doesNotMatch(prompt, /### What they told us/);
});

// ── The first coaching message must not re-word the athlete's answers ─────
// The profile they just read shows their own words. Opening the conversation
// with a rewritten version of them is the exact mismatch the simplification
// exists to remove.

const { buildFirstMessage } = require('../src/profile/firstMessage');
const { buildRuleOutput } = require('../src/profile/ruleEngine');

const MISTAKES_SESSION = {
  branchId: 'mistakes',
  primaryPriorityId: 'after_mistake',
  answers: {
    primary_priority: { answerIds: ['after_mistake'] },
    mistakes_first_response: { answerIds: ['angry_self'] },
    mistakes_next: { answerIds: ['lose_focus'] },
    mistakes_recovery: { answerIds: ['most_of_session'] },
  },
};

test('the first chat message names the situation and never restates the pattern in rule-engine words', () => {
  const ro = buildRuleOutput(MISTAKES_SESSION);
  const msg = buildFirstMessage({ fitResponse: 'CONFIRMED', agreedPriorityId: 'after_mistake' }, ro, { name: 'Rahul', language: 'en' });
  assert.match(msg, /after a mistake/, 'the athlete\'s own situation is named');
  assert.match(msg, /what happened\?$/, 'it still asks about today');
  // The clause phrasings for the answers they picked must not appear.
  for (const code of ['mistakes_first_response:angry_self', 'mistakes_next:lose_focus']) {
    assert.ok(!msg.includes(cfg.CLAUSE[code].en), `rule-engine phrasing leaked: ${cfg.CLAUSE[code].en}`);
  }
  assert.ok(!msg.includes(cfg.DURATION_PROLONGED.en));
});

test('the Hindi first message is equally free of rule-engine phrasing', () => {
  const ro = buildRuleOutput(MISTAKES_SESSION);
  const msg = buildFirstMessage({ fitResponse: 'CONFIRMED', agreedPriorityId: 'after_mistake' }, ro, { name: 'Rahul', language: 'hi' });
  for (const code of ['mistakes_first_response:angry_self', 'mistakes_next:lose_focus']) {
    assert.ok(!msg.includes(cfg.CLAUSE[code].hi), `rule-engine phrasing leaked: ${cfg.CLAUSE[code].hi}`);
  }
  assert.match(msg, /[ऀ-ॿ]/);
});

test('nothing builds the old paraphrased pattern summary any more', () => {
  const firstMessageSrc = require('node:fs').readFileSync(require.resolve('../src/profile/firstMessage'), 'utf8');
  assert.ok(!firstMessageSrc.includes('shortPattern'), 'the paraphrase generator is gone, not merely unused');
  assert.ok(!firstMessageSrc.includes('cfg.CLAUSE'));
});

// ── Coach background: verbatim where the athlete wrote it, never quotable ──

test('a custom answer reaches Coach background verbatim, exactly as the athlete wrote it', async () => {
  const ro = buildRuleOutput({
    branchId: 'mistakes',
    primaryPriorityId: 'after_mistake',
    answers: {
      primary_priority: { answerIds: ['after_mistake'] },
      mistakes_first_response: { answerIds: ['something_else'], customText: 'I go completely silent' },
      mistakes_next: { answerIds: ['lose_focus'] },
      mistakes_recovery: { answerIds: ['few_minutes'] },
    },
  });
  const client = {
    startingPerformanceProfile: {
      findFirst: async () => ({
        fitResponse: 'CONFIRMED', agreedPriorityId: 'after_mistake', ruleOutput: ro,
        wordingVariants: [{ language: 'en', sections: CONFIRMED_PROFILE.sections }],
      }),
    },
  };
  const loaded = await loadConfirmedProfile('u1', 'en', client);
  assert.ok(loaded.patternSteps.some((s) => s.text === 'I go completely silent'), 'custom text is carried unchanged');
  const prompt = buildSystemPrompt(CHAT_USER, [], [], 'general', { startingProfile: loaded, currentFocus: null });
  assert.match(prompt, /I go completely silent/);
});

test('Coach is told the background is internal notes and must not be quoted back', () => {
  const prompt = buildSystemPrompt(CHAT_USER, [], [], 'general', { startingProfile: BACKGROUND_PROFILE, currentFocus: null });
  assert.match(prompt, /internal notes, not the athlete's own wording/);
  assert.match(prompt, /NEVER quote them back verbatim/);
  assert.match(prompt, /use plain everyday words/);
});

test('the frozen coaching loop safeguards are all still stated, unweakened', () => {
  const prompt = buildSystemPrompt(CHAT_USER, [], [], 'general', { startingProfile: BACKGROUND_PROFILE, currentFocus: null });
  assert.match(prompt, /This is BACKGROUND, not today's conclusion/);
  assert.match(prompt, /You may ASK whether today is similar/);
  assert.match(prompt, /NEVER treat it as the confirmed barrier for this conversation/);
  assert.match(prompt, /still has to describe what happened today/);
  assert.match(prompt, /still has to confirm the barrier in their own words before any Mental Rep is offered/);
});

test('a stale unsure answer cannot enter Coach background once the athlete has a real situation', () => {
  const ro = buildRuleOutput({
    branchId: 'mistakes',
    primaryPriorityId: 'after_mistake',
    answers: {
      difficult_moments: { answerIds: ['not_sure'] },
      // A recognition phrase that is distinct from every situation phrase, so
      // its absence below is real evidence and not a coincidental match.
      unsure_recognition: { answerIds: ['compare_to_others'] },
      primary_priority: { answerIds: ['after_mistake'] },
      mistakes_first_response: { answerIds: ['angry_self'] },
      mistakes_next: { answerIds: ['lose_focus'] },
      mistakes_recovery: { answerIds: ['few_minutes'] },
    },
  });
  assert.equal(ro.recognition, null, 'the legacy recognition no longer feeds the active rule output');
  assert.equal(ro.observations.every((o) => o.questionId.startsWith('mistakes_')), true);
  const prompt = buildSystemPrompt(CHAT_USER, [], [], 'general', {
    startingProfile: { ...CONFIRMED_PROFILE, patternSteps: buildStartingPattern(ro, 'en').nodes, supports: [], strengths: [] },
    currentFocus: null,
  });
  assert.ok(!prompt.includes(cfg.UNSURE_TRIGGER.compare_to_others.en));
});
