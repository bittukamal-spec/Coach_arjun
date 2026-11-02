// Ritual PR 5 — Arjun-written routine suggestions. No database, no network:
// the context loader and the model call are fakes.

const test = require('node:test');
const assert = require('node:assert/strict');

const { suggestRoutine } = require('../src/services/routines/suggestRoutine');
const {
  createPersonalizeSuggestion, buildUserPrompt, parseSteps, parseStepsDetailed, isUnderAgeWithoutConsent,
} = require('../src/services/routines/personalizeSuggestion');

const rule = (input) => suggestRoutine(input).suggestion;

const CONTEXT = {
  aiAllowed: true,
  sport: 'Cricket',
  position: 'Opening batter',
  cueWord: 'Sharp',
  focusCards: [{ focusWord: 'Watch the ball', resetWord: 'Next ball', situation: 'After getting beaten outside off' }],
  currentFocus: 'Recover quickly after a mistake',
  profile: { whatMatters: 'Staying at the crease longer' },
  memories: [{ memKey: 'fear', value: 'Gets nervous facing fast bowlers' }],
  reflections: ['- 2 Oct: rushed my shots after an early edge'],
};

function setup({ context = CONTEXT, reply, throws } = {}) {
  const calls = [];
  const personalize = createPersonalizeSuggestion({
    loadContext: async () => context,
    callModel: async (args) => {
      calls.push(args);
      if (throws) throw new Error('model down');
      return typeof reply === 'function' ? reply(args) : reply;
    },
  });
  return { personalize, calls };
}

const INPUT = { category: 'repeated_moment', purposeKey: 'reset', existingHabits: [], name: 'After each bad delivery' };
const REPLY = JSON.stringify({ steps: [
  { kind: 'reset', instruction: 'Turn away from the bowler and let that ball go' },
  { kind: 'cue', instruction: 'Say "Next ball" as you walk back' },
] });

test('Arjun-written steps replace the rule wording but keep the rules\' shape and template family', async () => {
  const { personalize, calls } = setup({ reply: REPLY });
  const base = rule(INPUT);
  const out = await personalize({ userId: 'u1', input: INPUT, rule: base, language: 'en' });
  assert.equal(out.matchType, 'personalized');
  assert.equal(out.templateKey, `${base.templateKey}.ai`);
  assert.equal(out.timeWindow, base.timeWindow);
  assert.deepEqual(out.steps.map(s => s.instruction), [
    'Turn away from the bowler and let that ball go',
    'Say "Next ball" as you walk back',
  ]);
  assert.ok(out.steps.every(s => s.origin === 'suggested' && s.cue === null));
  assert.equal(calls.length, 1);
});

test('the prompt carries the athlete\'s relevant context and the room left', () => {
  const base = rule(INPUT);
  const prompt = buildUserPrompt({ input: INPUT, window: base.timeWindow, room: 2, ruleKinds: ['reset', 'prepare'], context: CONTEXT, language: 'en' });
  for (const expected of ['Cricket', 'Opening batter', '"Next ball"', 'Recover quickly', 'nervous facing fast bowlers', 'rushed my shots', 'After each bad delivery', 'Write exactly 2 steps']) {
    assert.ok(prompt.includes(expected), expected);
  }
});

test('the athlete\'s own steps stay first and verbatim; Arjun only fills the room left', async () => {
  const input = { ...INPUT, existingHabits: ['Towel off'] };
  const { personalize, calls } = setup({ reply: REPLY });
  const out = await personalize({ userId: 'u1', input, rule: rule(input), language: 'en' });
  assert.deepEqual(out.steps.map(s => [s.origin, s.instruction]), [
    ['existing', 'Towel off'],
    ['suggested', 'Turn away from the bowler and let that ball go'],
  ]);
  assert.match(calls[0].user, /Write exactly 1 step\./);
});

test('no model call when the athlete\'s steps already fill the window', async () => {
  const input = { ...INPUT, existingHabits: ['One', 'Two'] }; // seconds window = 2
  const { personalize, calls } = setup({ reply: REPLY });
  assert.equal(await personalize({ userId: 'u1', input, rule: rule(input), language: 'en' }), null);
  assert.equal(calls.length, 0);
});

test('falls back (null) without calling the model when AI is not allowed', async () => {
  const { personalize, calls } = setup({ context: { aiAllowed: false }, reply: REPLY });
  assert.equal(await personalize({ userId: 'u1', input: INPUT, rule: rule(INPUT), language: 'en' }), null);
  assert.equal(calls.length, 0);
});

test('athlete text that trips the safety screen is never sent to the model', async () => {
  const input = { ...INPUT, name: 'I want to die' };
  const { personalize, calls } = setup({ reply: REPLY });
  assert.equal(await personalize({ userId: 'u1', input, rule: rule(input), language: 'en' }), null);
  assert.equal(calls.length, 0);
});

test('model errors, bad JSON, empty, over-long or unsafe output all fall back to the rules', async () => {
  const cases = [
    { throws: true },
    { reply: 'Here are your steps: breathe' },
    { reply: JSON.stringify({ steps: [] }) },
    { reply: JSON.stringify({ steps: [{ kind: 'reset', instruction: 'x'.repeat(121) }] }) },
    { reply: JSON.stringify({ steps: [{ kind: 'reset', instruction: 'If it goes badly, hurt myself' }] }) },
  ];
  for (const c of cases) {
    const { personalize } = setup(c);
    assert.equal(await personalize({ userId: 'u1', input: INPUT, rule: rule(INPUT), language: 'en' }), null, JSON.stringify(c));
  }
});

test('a reply wrapped in prose or code fences is still used', async () => {
  for (const reply of [`Here is your routine:\n${REPLY}\nGood luck!`, '```json\n' + REPLY + '\n```']) {
    const { personalize } = setup({ reply });
    const out = await personalize({ userId: 'u1', input: INPUT, rule: rule(INPUT), language: 'en' });
    assert.equal(out?.matchType, 'personalized', reply.slice(0, 20));
  }
});

test('one unusable step is skipped instead of discarding the whole reply', () => {
  const text = JSON.stringify({ steps: [
    { kind: 'reset', instruction: 'x'.repeat(121) },
    { kind: 'cue', instruction: 'Say "Next ball"' },
  ] });
  assert.deepEqual(parseStepsDetailed(text, { room: 2, language: 'en', habits: [] }).steps.map(s => s.instruction), ['Say "Next ball"']);
  assert.deepEqual(parseStepsDetailed('no json here', { room: 2, language: 'en', habits: [] }), { reason: 'invalid_json' });
  assert.deepEqual(parseStepsDetailed(JSON.stringify({ steps: [{ instruction: 'x'.repeat(121) }] }), { room: 2, language: 'en', habits: [] }), { reason: 'step_too_long' });
});

test('every fallback logs a reason code and never athlete or model text', async () => {
  const logs = [];
  const orig = console.log;
  console.log = (line) => logs.push(String(line));
  try {
    await setup({ context: { aiAllowed: false }, reply: REPLY }).personalize({ userId: 'u1', input: INPUT, rule: rule(INPUT), language: 'en' });
    await setup({ reply: 'secret athlete words' }).personalize({ userId: 'u1', input: INPUT, rule: rule(INPUT), language: 'en' });
  } finally {
    console.log = orig;
  }
  const events = logs.map(l => JSON.parse(l));
  assert.deepEqual(events.map(e => e.reason), ['ai_not_allowed', 'invalid_json']);
  assert.ok(logs.every(l => !l.includes('secret') && !l.includes('After each bad delivery')));
});

test('Hindi requests need Devanagari output; English-only replies fall back', () => {
  assert.equal(parseSteps(REPLY, { room: 2, language: 'hi', habits: [] }), null);
  const hi = JSON.stringify({ steps: [{ kind: 'reset', instruction: 'बॉलर से मुड़ो और वो बॉल जाने दो' }] });
  assert.equal(parseSteps(hi, { room: 2, language: 'hi', habits: [] }).length, 1);
});

test('parseSteps strips code fences, fills up to the room, drops duplicates of habits, coerces unknown kinds', () => {
  const text = '```json\n' + JSON.stringify({ steps: [
    { kind: 'reset', instruction: 'Towel off' },
    { kind: 'teleport', instruction: 'Pick your target' },
    { kind: 'cue', instruction: 'Say Sharp' },
    { kind: 'cue', instruction: 'Extra step' },
  ] }) + '\n```';
  const steps = parseSteps(text, { room: 3, language: 'en', habits: ['towel  off'] });
  // The skipped duplicate frees its slot for the next usable step.
  assert.deepEqual(steps.map(s => [s.kind, s.instruction]), [['custom', 'Pick your target'], ['cue', 'Say Sharp'], ['cue', 'Extra step']]);
  assert.equal(parseSteps(text, { room: 1, language: 'en', habits: [] }).length, 1);
});

test('guardian consent: under-18 without consent is not allowed AI; adults and consented minors are', () => {
  const yearsAgo = (n) => new Date(Date.now() - n * 365.25 * 24 * 3600 * 1000);
  assert.equal(isUnderAgeWithoutConsent({ dateOfBirth: yearsAgo(15), guardianConsentAt: null }), true);
  assert.equal(isUnderAgeWithoutConsent({ dateOfBirth: yearsAgo(15), guardianConsentAt: new Date() }), false);
  assert.equal(isUnderAgeWithoutConsent({ dateOfBirth: yearsAgo(20), guardianConsentAt: null }), false);
  assert.equal(isUnderAgeWithoutConsent({ dateOfBirth: null, guardianConsentAt: null }), false);
});
