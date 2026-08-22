// Unified Mind Journal reflection (PR 1) — vocabulary, validation, the Q6
// resolver, the bounded history window, and Arjun's Review contract.
// Pure-unit throughout: no database, no network, no Anthropic call.

const test = require('node:test');
const assert = require('node:assert/strict');

const { CONTEXT_TYPE_KEYS, REFLECTION_CONTEXT_KEYS } = require('../src/services/mindJournal/contextTypeVocabulary');
const { STATE_KEYS, REFLECTION_STATE_KEYS } = require('../src/services/mindJournal/stateVocabulary');
const { CONTEXT_TO_EVENTS, eventKeysForContext } = require('../src/services/mindJournal/eventVocabulary');
const { THOUGHT_KEYS, RESPONSE_KEYS, BODY_KEYS, CUE_FEEDBACK_KEYS } = require('../src/services/mindJournal/reflectionVocabulary');
const { resolveConditionalQuestion } = require('../src/services/mindJournal/resolveConditionalQuestion');
const {
  buildReflectionHistoryWindow, formatReflectionHistoryLine,
  FORBIDDEN_HISTORY_KEYS, MAX_HISTORY_ENTRIES,
} = require('../src/services/mindJournal/buildReflectionHistoryWindow');
const {
  normalizeReviewPayload, buildReviewPrompt, describeAnswers,
  createGenerateReflectionReview, MIN_PRIOR_ENTRIES_FOR_PATTERN,
} = require('../src/services/mindJournal/generateReflectionReview');
const { validateMindJournalEntry } = require('../src/services/mindJournal/validateEntry');

// A complete reflection. Every structured question is required now, so the
// baseline answers all of them; each test overrides only what it is probing.
// TRAINING + calm means the resolver shows no Q6, so these stay focused.
const base = (over = {}) => ({
  entryType: 'REFLECTION',
  contextType: 'TRAINING',
  eventTags: ['full_session'],
  states: ['calm'],
  thoughtTags: ['knew_what_to_do'],
  responseTags: ['stayed_focused'],
  ...over,
});

// ── Vocabulary ─────────────────────────────────────────────────────────────

test('every Q1 reflection context is a real MindJournalContextType key', () => {
  for (const key of REFLECTION_CONTEXT_KEYS) {
    assert.ok(CONTEXT_TYPE_KEYS.includes(key), `${key} must exist in the enum vocabulary`);
  }
  assert.equal(REFLECTION_CONTEXT_KEYS.length, 9, 'Q1 offers exactly the nine approved choices');
});

test('Q1 does not offer the superseded RECOVERY_DAY, but the enum still carries it for historical rows', () => {
  assert.ok(!REFLECTION_CONTEXT_KEYS.includes('RECOVERY_DAY'));
  assert.ok(CONTEXT_TYPE_KEYS.includes('RECOVERY_DAY'));
});

test('every Q1 context has its own small Q2 event set of roughly 6-8 choices', () => {
  for (const key of REFLECTION_CONTEXT_KEYS) {
    const events = eventKeysForContext(key);
    assert.ok(events.length >= 6 && events.length <= 8, `${key} has ${events.length} events — expected 6-8`);
    assert.equal(new Set(events).size, events.length, `${key} has duplicate event keys`);
  }
});

test('no Q2 event describes a result/performance grade', () => {
  // Anchored so an observable event that merely contains a result word
  // (e.g. "lost_focus") is not mistaken for a result/performance grade.
  const banned = /good_result|bad_result|good_performance|bad_performance|average_performance|^won$|^lost$|^success|^failure/;
  for (const [ctx, events] of Object.entries(CONTEXT_TO_EVENTS)) {
    for (const e of events) assert.doesNotMatch(e, banned, `${ctx}.${e} reintroduces result/performance grading`);
  }
});

test('an unknown context yields no valid events rather than accepting anything', () => {
  assert.deepEqual(eventKeysForContext('NOT_A_CONTEXT'), []);
});

test('Q4/Q5/Q6 vocabularies carry the approved counts and cue semantics', () => {
  assert.equal(THOUGHT_KEYS.length, 9);
  assert.equal(RESPONSE_KEYS.length, 11);
  assert.equal(BODY_KEYS.length, 9);
  assert.deepEqual(CUE_FEEDBACK_KEYS, ['helped', 'forgot', 'no_help']);
});

// ── Max-selection rules ────────────────────────────────────────────────────

const GROUPS = [
  ['eventTags', 'customEvent', ['full_session', 'part_of_session', 'coach_feedback']],
  ['thoughtTags', 'customThought', THOUGHT_KEYS.slice(0, 3)],
  ['responseTags', 'customResponse', RESPONSE_KEYS.slice(0, 3)],
  ['bodyTags', 'customBody', BODY_KEYS.slice(0, 3)],
];

for (const [tagField, customField, values] of GROUPS) {
  test(`${tagField}: two values are accepted, three are rejected`, () => {
    assert.equal(validateMindJournalEntry(base({ [tagField]: values.slice(0, 2) })).valid, true);
    const three = validateMindJournalEntry(base({ [tagField]: values }));
    assert.equal(three.valid, false);
    assert.match(three.error, /at most 2/);
  });

  test(`${tagField}: two values plus a "Write my own" exceeds the shared budget of 2`, () => {
    const over = validateMindJournalEntry(base({ [tagField]: values.slice(0, 2), [customField]: 'mine' }));
    assert.equal(over.valid, false);
    assert.match(over.error, /together must total at most 2/);
    assert.equal(validateMindJournalEntry(base({ [tagField]: values.slice(0, 1), [customField]: 'mine' })).valid, true);
  });

  test(`${tagField}: duplicate and off-vocabulary values are rejected`, () => {
    assert.equal(validateMindJournalEntry(base({ [tagField]: [values[0], values[0]] })).valid, false);
    assert.equal(validateMindJournalEntry(base({ [tagField]: ['totally_made_up'] })).valid, false);
  });
}

test('states keeps its existing 2-value budget inside a reflection', () => {
  // "tired" is one of the states that makes the body question relevant, so
  // these carry a Q6 answer — the budget, not the resolver, is under test.
  const twoStates = (over) => base({ states: ['calm', 'tired'], bodyTags: ['nothing_unusual'], ...over });
  assert.equal(validateMindJournalEntry(twoStates()).valid, true);
  assert.equal(validateMindJournalEntry(twoStates({ states: ['calm', 'tired', 'nervous'] })).valid, false);
  assert.equal(validateMindJournalEntry(twoStates({ customState: 'buzzing' })).valid, false);
});

// ── Context-adaptive Q2 validation ─────────────────────────────────────────

test('an event tag valid for one context is rejected under another', () => {
  // Competition shows the body question, so a complete one answers it.
  assert.equal(validateMindJournalEntry(base({
    contextType: 'COMPETITION', eventTags: ['key_moment'], bodyTags: ['nothing_unusual'],
  })).valid, true);
  const wrong = validateMindJournalEntry(base({ contextType: 'TRAINING', eventTags: ['key_moment'] }));
  assert.equal(wrong.valid, false);
  assert.match(wrong.error, /allowed list/);
});

test('every context accepts a "Write my own" event', () => {
  for (const key of REFLECTION_CONTEXT_KEYS) {
    const body = base({ contextType: key, eventTags: [], customEvent: 'something specific' });
    if (key === 'SOMETHING_ELSE') body.customContext = 'a travel day';
    // Contexts whose resolver shows a Q6 need it answered.
    if (resolveConditionalQuestion({ contextType: key, states: body.states }, {}) === 'body') {
      body.bodyTags = ['nothing_unusual'];
    }
    assert.equal(validateMindJournalEntry(body).valid, true, `${key} must accept a custom event`);
  }
});

// ── Custom "Write my own" validation ───────────────────────────────────────

test('custom answers are bounded and whitespace-only normalizes to null', () => {
  assert.equal(validateMindJournalEntry(base({ customEvent: 'x'.repeat(81) })).valid, false);
  assert.equal(validateMindJournalEntry(base({ customThought: 'x'.repeat(81) })).valid, false);
  const blank = validateMindJournalEntry(base({ customResponse: '   ' }));
  assert.equal(blank.valid, true);
  assert.equal(blank.value.customResponse, null);
});

test('customContext is only accepted when the athlete chose "Write my own" at Q1', () => {
  assert.equal(validateMindJournalEntry(base({ customContext: 'a travel day' })).valid, false);
  assert.equal(validateMindJournalEntry(base({
    contextType: 'SOMETHING_ELSE', customContext: 'a travel day', eventTags: ['it_happened_suddenly'],
  })).valid, true);
});

// ── Every structured question is required ─────────────────────────────────

test('a reflection with only a context is rejected', () => {
  const empty = validateMindJournalEntry({ entryType: 'REFLECTION', contextType: 'TRAINING' });
  assert.equal(empty.valid, false);
});

for (const [field, label] of [
  ['eventTags', 'Q2'], ['states', 'Q3'], ['thoughtTags', 'Q4'], ['responseTags', 'Q5'],
]) {
  test(`${label} (${field}) cannot be empty`, () => {
    const r = validateMindJournalEntry(base({ [field]: [] }));
    assert.equal(r.valid, false, `${field} must be required`);
    assert.match(r.error, /at least one answer/);
  });

  test(`${label} (${field}) is satisfied by a "Write my own" answer alone — typing is never forced elsewhere`, () => {
    const customField = { eventTags: 'customEvent', states: 'customState', thoughtTags: 'customThought', responseTags: 'customResponse' }[field];
    assert.equal(validateMindJournalEntry(base({ [field]: [], [customField]: 'in my own words' })).valid, true);
  });
}

test('Q3 accepts "Not sure" as a real answer', () => {
  assert.equal(validateMindJournalEntry(base({ states: ['not_sure'] })).valid, true);
});

test('"Not sure" stays out of the legacy quick-note and guided state vocabulary', () => {
  assert.ok(!STATE_KEYS.includes('not_sure'));
  assert.deepEqual(REFLECTION_STATE_KEYS, [...STATE_KEYS, 'not_sure']);
  assert.equal(validateMindJournalEntry({ entryType: 'QUICK_NOTE', states: ['not_sure'] }).valid, false);
  assert.equal(validateMindJournalEntry({
    entryType: 'GUIDED_REFLECTION', contextType: 'TRAINING', states: ['not_sure'], takeForward: 'x',
  }).valid, false);
});

test('no custom text is required unless "Write my own" was selected', () => {
  // A complete chips-only reflection is valid with no custom field at all.
  const r = validateMindJournalEntry(base());
  assert.equal(r.valid, true);
  for (const f of ['customEvent', 'customState', 'customThought', 'customResponse', 'customBody']) {
    assert.equal(r.value[f], null, `${f} must stay null when nothing was typed`);
  }
});

// ── Q6 is required only when the resolver would have shown it ─────────────

test('a reflection whose resolver shows Q6 must answer it', () => {
  const noQ6 = validateMindJournalEntry(base({ contextType: 'COMPETITION', eventTags: ['key_moment'] }));
  assert.equal(noQ6.valid, false, 'competition shows the body question, so it is required');
  assert.match(noQ6.error, /final question/);

  assert.equal(validateMindJournalEntry(base({
    contextType: 'COMPETITION', eventTags: ['key_moment'], bodyTags: ['tense'],
  })).valid, true);
  assert.equal(validateMindJournalEntry(base({
    contextType: 'COMPETITION', eventTags: ['key_moment'], cueFeedback: 'helped',
  })).valid, true, 'either variant satisfies it — the resolver can flip mid-reflection');
});

test('an active Focus Card makes Q6 required in a context that would otherwise skip it', () => {
  const body = base({ contextType: 'TOUGH_MOMENT', eventTags: ['made_a_mistake'] });
  assert.equal(validateMindJournalEntry(body, { hasActiveFocusCard: true }).valid, false);
  assert.equal(validateMindJournalEntry({ ...body, cueFeedback: 'forgot' }, { hasActiveFocusCard: true }).valid, true);
});

test('a reflection whose resolver shows no Q6 does not demand one', () => {
  assert.equal(validateMindJournalEntry(base()).valid, true);
  assert.equal(resolveConditionalQuestion({ contextType: 'TRAINING', states: ['calm'] }, {}), null);
});

test('the legacy narrative and note fields are rejected on a reflection', () => {
  for (const field of ['note', 'whatHappened', 'whatNoticed', 'helpedOrGotInWay', 'takeForward']) {
    const r = validateMindJournalEntry(base({ [field]: 'text' }));
    assert.equal(r.valid, false, `${field} must not be accepted on a reflection`);
  }
});

test('a reflection answers at most one Q6 — never both body and cue', () => {
  assert.equal(validateMindJournalEntry(base({ bodyTags: ['tense'] })).valid, true);
  assert.equal(validateMindJournalEntry(base({ cueFeedback: 'helped' })).valid, true);
  const both = validateMindJournalEntry(base({ bodyTags: ['tense'], cueFeedback: 'helped' }));
  assert.equal(both.valid, false);
  assert.match(both.error, /at most one of the body or cue/);
});

test('cueFeedback must be an approved value and a snapshot needs a feedback answer', () => {
  assert.equal(validateMindJournalEntry(base({ cueFeedback: 'sort_of' })).valid, false);
  assert.equal(validateMindJournalEntry(base({ cueWordSnapshot: 'Breathe' })).valid, false);
  assert.equal(validateMindJournalEntry(base({ cueFeedback: 'forgot', cueWordSnapshot: 'Breathe' })).valid, true);
});

test('the earlier entry shapes are completely unaffected by the reflection branch', () => {
  assert.equal(validateMindJournalEntry({ states: ['calm'], note: 'legacy row' }).valid, true);
  assert.equal(validateMindJournalEntry({ entryType: 'QUICK_NOTE', states: ['tired'] }).valid, true);
  assert.equal(validateMindJournalEntry({
    entryType: 'GUIDED_REFLECTION', contextType: 'TRAINING', states: ['focused'], takeForward: 'keep the routine',
  }).valid, true);
});

test('a reflection never accepts a client-supplied Arjun review field', () => {
  const { validateAllowedKeys } = require('../src/services/mindJournal/validateEntry');
  for (const forged of ['arjunNoticed', 'arjunTakeaway', 'arjunPattern', 'reviewGeneratedAt']) {
    const r = validateAllowedKeys({ entryType: 'REFLECTION', [forged]: 'x' }, require('../src/routes/mindJournal').POST_ALLOWED_KEYS || []);
    assert.equal(r.valid, false, `${forged} must never be settable by a client`);
  }
});

// ── Q6 resolver ────────────────────────────────────────────────────────────

test('cue wins whenever an active Focus Card exists and the situation could have used it', () => {
  for (const ctx of ['COMPETITION', 'TOUGH_MOMENT', 'CONFIDENCE_PRESSURE', 'SELECTION_TRIAL']) {
    assert.equal(resolveConditionalQuestion({ contextType: ctx }, { hasActiveFocusCard: true }), 'cue');
  }
});

test('cue is never asked without an active Focus Card', () => {
  assert.equal(resolveConditionalQuestion({ contextType: 'COMPETITION' }, { hasActiveFocusCard: false }), 'body');
  assert.equal(resolveConditionalQuestion({ contextType: 'OUTSIDE_SPORT' }, { hasActiveFocusCard: false }), null);
});

test('body is asked for pressure-shaped contexts, or when the athlete reported nerves', () => {
  for (const ctx of ['CONFIDENCE_PRESSURE', 'TOUGH_MOMENT', 'COMPETITION', 'SELECTION_TRIAL', 'RECOVERY_INJURY']) {
    assert.equal(resolveConditionalQuestion({ contextType: ctx }, {}), 'body');
  }
  assert.equal(resolveConditionalQuestion({ contextType: 'TRAINING', states: ['nervous'] }, {}), 'body');
  assert.equal(resolveConditionalQuestion({ contextType: 'WENT_WELL', states: ['frustrated'] }, {}), 'body');
});

test('most reflections finish after Q5', () => {
  assert.equal(resolveConditionalQuestion({ contextType: 'TRAINING', states: ['calm'] }, {}), null);
  assert.equal(resolveConditionalQuestion({ contextType: 'WENT_WELL', states: ['confident'] }, { hasActiveFocusCard: true }), null);
  assert.equal(resolveConditionalQuestion({ contextType: 'OUTSIDE_SPORT' }, { hasActiveFocusCard: true }), null);
});

test('the resolver never returns both, and is deterministic', () => {
  const answers = { contextType: 'CONFIDENCE_PRESSURE', states: ['nervous'] };
  const first = resolveConditionalQuestion(answers, { hasActiveFocusCard: true });
  assert.equal(first, 'cue');
  for (let i = 0; i < 5; i++) {
    assert.equal(resolveConditionalQuestion(answers, { hasActiveFocusCard: true }), first);
  }
});

// ── Bounded latest-10 history window ───────────────────────────────────────

const row = (i) => ({
  contextType: 'COMPETITION', eventTags: ['key_moment'], states: ['nervous'],
  thoughtTags: ['worried_about_result'], responseTags: ['went_too_fast'], bodyTags: [],
  cueFeedback: 'helped', arjunTakeaway: `takeaway ${i}`,
  customEvent: 'SECRET-EVENT', customState: 'SECRET-STATE', customThought: 'SECRET-THOUGHT',
  customResponse: 'SECRET-RESPONSE', customBody: 'SECRET-BODY', customContext: 'SECRET-CONTEXT',
  note: 'SECRET-NOTE', whatHappened: 'SECRET-NARRATIVE', cueWordSnapshot: 'SECRET-CUE',
  arjunNoticed: 'SECRET-NOTICED', arjunPattern: 'SECRET-PATTERN',
  id: 'x', userId: 'u', createdAt: new Date(),
});

test('the history window is capped at the latest 10 reflections', () => {
  assert.equal(MAX_HISTORY_ENTRIES, 10);
  assert.equal(buildReflectionHistoryWindow(Array.from({ length: 25 }, (_, i) => row(i))).length, 10);
  assert.deepEqual(buildReflectionHistoryWindow([]), []);
});

test('no athlete-written text ever enters the recurring history window', () => {
  const [item] = buildReflectionHistoryWindow([row(1)]);
  const serialized = JSON.stringify(item);
  for (const key of FORBIDDEN_HISTORY_KEYS) {
    assert.ok(!(key in item), `${key} must never appear on a history item`);
  }
  assert.doesNotMatch(serialized, /SECRET/, 'no athlete-authored or Arjun-internal text may leak into the window');
  assert.match(serialized, /takeaway 1/, "Arjun's own stored takeaway is the one narrative allowed through");
});

test('a history line stays compact and omits empty sections', () => {
  const [item] = buildReflectionHistoryWindow([{ contextType: 'TRAINING', eventTags: [], states: ['calm'], createdAt: new Date() }]);
  const line = formatReflectionHistoryLine(item);
  assert.match(line, /TRAINING \| felt: calm/);
  assert.doesNotMatch(line, /event:|thought:|did:|body:|cue:|takeaway:/);
  assert.ok(line.length < 200, 'one reflection must stay a short single line');
});

// ── Arjun's Review contract ────────────────────────────────────────────────

test('the review prompt forbids prescribing, diagnosing and problem-hunting', () => {
  const prompt = buildReviewPrompt({
    entry: { contextType: 'COMPETITION', eventTags: ['key_moment'], states: ['nervous'] },
    priorEntries: [], firstName: 'Ravi', sport: 'cricket', language: 'en',
  });
  for (const rule of [
    /Never recommend, prescribe, suggest or hint at a Mental Rep/,
    /Never diagnose/i,
    /Never describe their personality/,
    /Never invent a weakness/,
    /do not go looking for one/,
    /Never claim one answer CAUSED another/,
    /tentative language/,
    /Never tell them what to work on next/,
    /Never score, rank, grade/,
  ]) {
    assert.match(prompt, rule, `the review prompt must carry: ${rule}`);
  }
});

test('the prompt forbids a pattern outright until there are enough prior reflections', () => {
  assert.equal(MIN_PRIOR_ENTRIES_FOR_PATTERN, 3);
  const thin = buildReviewPrompt({ entry: { contextType: 'TRAINING' }, priorEntries: [row(1), row(2)], firstName: 'A', language: 'en' });
  assert.match(thin, /"pattern": null/);
  assert.doesNotMatch(thin, /previous reflections \(most recent first\)/);

  const rich = buildReviewPrompt({ entry: { contextType: 'TRAINING' }, priorEntries: [row(1), row(2), row(3)], firstName: 'A', language: 'en' });
  assert.match(rich, /previous reflections \(most recent first\)/);
  assert.match(rich, /genuinely repeats/);
});

test('a pattern is discarded even if the model returns one without enough evidence', () => {
  for (const priorCount of [0, 1, 2]) {
    const r = normalizeReviewPayload('{"noticed":"n","pattern":"invented","takeaway":"t"}', { priorCount });
    assert.equal(r.pattern, null, `a pattern must be impossible with ${priorCount} prior entries`);
  }
  assert.equal(normalizeReviewPayload('{"noticed":"n","pattern":"real","takeaway":"t"}', { priorCount: 3 }).pattern, 'real');
});

test('review JSON is fence-tolerant and every field is bounded', () => {
  const fenced = normalizeReviewPayload('```json\n{"noticed":"n","takeaway":"t"}\n```', { priorCount: 0 });
  assert.deepEqual(fenced, { noticed: 'n', takeaway: 't', pattern: null });

  const long = normalizeReviewPayload(JSON.stringify({ noticed: 'x'.repeat(2000), takeaway: 'y'.repeat(2000) }), { priorCount: 0 });
  assert.ok(long.noticed.length <= 600);
  assert.ok(long.takeaway.length <= 240);

  const junk = normalizeReviewPayload('{"noticed":42,"takeaway":"  "}', { priorCount: 0 });
  assert.deepEqual(junk, { noticed: null, takeaway: null, pattern: null });
});

test('only the answers the athlete actually gave are described to the model', () => {
  const described = describeAnswers({ contextType: 'TRAINING', eventTags: ['coach_feedback'], states: [] });
  assert.match(described, /Reflecting on: TRAINING/);
  assert.match(described, /What happened: coach_feedback/);
  assert.doesNotMatch(described, /How they felt/, 'an unanswered question must not appear at all');
});

test('an Anthropic failure resolves to an empty review instead of throwing', async () => {
  const generate = createGenerateReflectionReview(() => ({
    messages: { create: async () => { throw new Error('upstream down'); } },
  }));
  const result = await generate({ entry: { contextType: 'TRAINING' }, priorEntries: [], user: {} });
  assert.deepEqual(result, { noticed: null, takeaway: null, pattern: null });
});

test('unparseable model output also resolves to an empty review', async () => {
  const generate = createGenerateReflectionReview(() => ({
    messages: { create: async () => ({ content: [{ text: 'not json at all' }] }) },
  }));
  assert.deepEqual(
    await generate({ entry: { contextType: 'TRAINING' }, priorEntries: [], user: {} }),
    { noticed: null, takeaway: null, pattern: null },
  );
});
