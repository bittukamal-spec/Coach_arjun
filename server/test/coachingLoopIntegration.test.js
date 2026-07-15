// Integration-style test wiring the three real coaching services together
// (runBufferedToolLoop → sanitizeFinalText → commitCoachingTransition)
// exactly as chat.js's route does, with stubbed Anthropic and Prisma — no
// network, no database. Proves the full accepted-prescription sequence
// end to end, including legacy-marker stripping (PR-10 correction 2).

const test = require('node:test');
const assert = require('node:assert/strict');
const { runBufferedToolLoop, sanitizeFinalText, buildQuickReplyPayload } = require('../src/services/coaching/bufferedToolLoop');
const { createCommitCoachingTransition } = require('../src/services/coaching/commitCoachingTransition');

// Mirrors chat.js's emission logic exactly: d, then EITHER a card (if one
// was newly committed) OR quick replies (never both), then end.
function emitLikeRoute({ finalText, committed, loopQuickReplies }) {
  const emitted = [{ t: 'd', c: finalText }];
  if (committed.card) {
    emitted.push({ t: 'card', card: committed.card });
  } else {
    const quickReplies = buildQuickReplyPayload(loopQuickReplies);
    if (quickReplies) emitted.push({ t: 'quick_replies', replies: quickReplies });
  }
  emitted.push({ t: 'end', id: committed.message.id });
  return emitted;
}

function makeAnthropicStub(responses) {
  let i = 0;
  return {
    messages: {
      create: async () => {
        const r = responses[Math.min(i, responses.length - 1)];
        i += 1;
        return r;
      },
    },
  };
}

function makeDbStub(state) {
  const writes = [];
  let idCounter = 0;
  const nextId = (prefix) => `${prefix}-${++idCounter}`;
  const tx = {
    userCoachingState: {
      findUnique: async () => state,
      create: async ({ data }) => {
        const row = { id: nextId('state'), ...data };
        writes.push({ op: 'userCoachingState.create', data });
        return row;
      },
    },
    coachingCycle: {
      create: async ({ data }) => {
        const row = { id: nextId('cycle'), ...data };
        writes.push({ op: 'coachingCycle.create', data });
        return row;
      },
      update: async (args) => { writes.push({ op: 'coachingCycle.update', ...args }); return { id: args.where.id, ...args.data }; },
    },
    activeCoachingSelection: {
      create: async ({ data }) => {
        const row = { id: nextId('sel'), ...data };
        writes.push({ op: 'activeCoachingSelection.create', data });
        return row;
      },
      update: async (args) => { writes.push({ op: 'activeCoachingSelection.update', ...args }); return { id: args.where.id, ...args.data }; },
    },
    prescription: {
      create: async ({ data }) => {
        const row = { id: nextId('presc'), ...data };
        writes.push({ op: 'prescription.create', data, id: row.id });
        return row;
      },
    },
    message: {
      create: async ({ data }) => {
        const row = { id: nextId('msg'), ...data };
        writes.push({ op: 'message.create', data });
        return row;
      },
    },
  };
  return { writes, db: { $transaction: (fn) => fn(tx) } };
}

function pendingState() {
  return {
    id: 'state-A',
    userId: 'user-1',
    activeSelection: {
      id: 'sel-A', userCoachingStateId: 'state-A', userId: 'user-1', cycleId: 'cycle-A', prescriptionId: null,
      cycle: { id: 'cycle-A', userId: 'user-1', status: 'ACTIVE', barrierConfirmationStatus: 'PENDING' },
    },
  };
}

const PRESCRIBE_INPUT = {
  barrierConfirmationStatus: 'CONFIRMED',
  finalBarrierHypothesis: 'Fear of failure under expectations',
  practiceKey: 'pre_performance_routine',
  situation: 'Penalty kicks in league matches',
  cardContent: 'Design a 20-second routine: breath, spot, cue word, strike.',
  cueWord: 'Spot',
};

test('accepted prescription end to end: legacy markers stripped, exactly one card, persisted text byte-equal to the clean emitted text', async () => {
  const dirtyFinalText = 'Here is your one practice for this week. [APP:body-reset]\n[SUGGEST: Got it | Tell me more]';

  const anthropic = makeAnthropicStub([
    {
      stop_reason: 'tool_use',
      content: [
        { type: 'text', text: 'draft reasoning, never shown to the athlete' },
        { type: 'tool_use', id: 'tu-1', name: 'prescribe_mental_rep', input: PRESCRIBE_INPUT },
      ],
    },
    { stop_reason: 'end_turn', content: [{ type: 'text', text: dirtyFinalText }] },
  ]);

  const coachingContext = { hasActiveSelection: true, cycleStatus: 'ACTIVE', barrierConfirmationStatus: 'PENDING', hasPrescription: false };

  const loop = await runBufferedToolLoop({
    anthropic, model: 'test-model', maxTokens: 800, system: 'sys',
    messages: [{ role: 'user', content: 'Yes, that is exactly it' }],
    coachingContext,
  });
  assert.equal(loop.exceededRounds, false);
  assert.equal(loop.transition.type, 'prescribe_mental_rep');

  const finalText = sanitizeFinalText(loop.finalText);
  assert.ok(!finalText.includes('[APP:'), 'no legacy [APP:] marker survives sanitization');
  assert.ok(!finalText.includes('[SUGGEST:'), 'no legacy [SUGGEST:] marker survives sanitization');
  assert.equal(finalText, 'Here is your one practice for this week.');

  const { db, writes } = makeDbStub(pendingState());
  const commit = createCommitCoachingTransition(db);
  const { message, card } = await commit({
    userId: 'user-1', chatSessionId: 'cs-1', sessionType: null, finalText, transition: loop.transition,
  });

  // Mirror exactly what chat.js emits over SSE for this sequence.
  const emitted = [{ t: 'd', c: finalText }];
  if (card) emitted.push({ t: 'card', card });
  emitted.push({ t: 'end', id: message.id });

  assert.equal(emitted.length, 3, 'expected exactly d, card, end');
  assert.equal(emitted[0].t, 'd');
  assert.ok(!emitted[0].c.includes('[APP:') && !emitted[0].c.includes('[SUGGEST:'), 'the d event must carry clean text');
  assert.equal(emitted.filter((e) => e.t === 'card').length, 1, 'exactly one structured card');
  assert.equal(emitted[2].t, 'end');

  const prescriptionWrite = writes.find((w) => w.op === 'prescription.create');
  assert.equal(card.prescriptionId, prescriptionWrite.id, 'card must carry the real persisted prescription id');
  assert.equal(writes.filter((w) => w.op === 'prescription.create').length, 1, 'exactly one prescription record');

  assert.equal(message.content, finalText, 'persisted assistant text must be byte-for-byte the emitted text');
  assert.ok(!message.content.includes('[APP:') && !message.content.includes('[SUGGEST:'), 'no legacy marker in the persisted message');
});

test('accepted prescription: even if the model also staged quick replies, only the card is emitted — never both', async () => {
  const anthropic = makeAnthropicStub([
    {
      stop_reason: 'tool_use',
      content: [
        { type: 'text', text: 'draft' },
        { type: 'tool_use', id: 'tu-1', name: 'prescribe_mental_rep', input: PRESCRIBE_INPUT },
        { type: 'tool_use', id: 'tu-2', name: 'offer_quick_replies', input: { replies: ['Got it', 'Not sure'] } },
      ],
    },
    { stop_reason: 'end_turn', content: [{ type: 'text', text: 'Here is your one practice for this week.' }] },
  ]);

  const coachingContext = { hasActiveSelection: true, cycleStatus: 'ACTIVE', barrierConfirmationStatus: 'PENDING', hasPrescription: false };
  const loop = await runBufferedToolLoop({
    anthropic, model: 'test-model', maxTokens: 800, system: 'sys',
    messages: [{ role: 'user', content: 'Yes, that is exactly it' }],
    coachingContext,
  });
  assert.equal(loop.transition.type, 'prescribe_mental_rep');
  assert.deepEqual(loop.quickReplies, ['Got it', 'Not sure'], 'the model did stage quick replies this turn');

  const finalText = sanitizeFinalText(loop.finalText);
  const { db } = makeDbStub(pendingState());
  const commit = createCommitCoachingTransition(db);
  const committed = await commit({ userId: 'user-1', chatSessionId: 'cs-1', sessionType: null, finalText, transition: loop.transition });

  const emitted = emitLikeRoute({ finalText, committed, loopQuickReplies: loop.quickReplies });

  assert.deepEqual(emitted.map((e) => e.t), ['d', 'card', 'end'], 'quick replies must never be emitted alongside a newly committed card');
});

test('normal response with quick replies (no coaching transition): emits d, then quick_replies, then end', async () => {
  const anthropic = makeAnthropicStub([
    quickTool('draft', ['Tell me more', 'Not really'], 'tu-1'),
    { stop_reason: 'end_turn', content: [{ type: 'text', text: 'How has training felt this week?' }] },
  ]);

  const coachingContext = { hasActiveSelection: false, cycleStatus: null, barrierConfirmationStatus: null, hasPrescription: false };
  const loop = await runBufferedToolLoop({
    anthropic, model: 'test-model', maxTokens: 800, system: 'sys',
    messages: [{ role: 'user', content: 'Training has been tough' }],
    coachingContext,
  });
  assert.equal(loop.transition, null);
  assert.deepEqual(loop.quickReplies, ['Tell me more', 'Not really']);

  const finalText = sanitizeFinalText(loop.finalText);
  const { db } = makeDbStub(null);
  const commit = createCommitCoachingTransition(db);
  const committed = await commit({ userId: 'user-1', chatSessionId: 'cs-1', sessionType: null, finalText, transition: loop.transition });

  const emitted = emitLikeRoute({ finalText, committed, loopQuickReplies: loop.quickReplies });
  assert.deepEqual(emitted.map((e) => e.t), ['d', 'quick_replies', 'end']);
  assert.deepEqual(emitted[1].replies, [{ id: 'reply_1', label: 'Tell me more' }, { id: 'reply_2', label: 'Not really' }]);
  assert.equal(emitted[2].id, committed.message.id);
});

test('barrier proposal can emit confirmation quick replies without a card', async () => {
  const anthropic = makeAnthropicStub([
    {
      stop_reason: 'tool_use',
      content: [
        { type: 'text', text: 'draft' },
        { type: 'tool_use', id: 'tu-1', name: 'propose_barrier', input: { problemStatement: 'Freezes on penalties', barrierHypothesis: 'Fear of failure' } },
        { type: 'tool_use', id: 'tu-2', name: 'offer_quick_replies', input: { replies: ['Yes, that feels right', 'Not quite'] } },
      ],
    },
    { stop_reason: 'end_turn', content: [{ type: 'text', text: 'Sounds like fear of failure — does that fit?' }] },
  ]);

  const coachingContext = { hasActiveSelection: false, cycleStatus: null, barrierConfirmationStatus: null, hasPrescription: false };
  const loop = await runBufferedToolLoop({
    anthropic, model: 'test-model', maxTokens: 800, system: 'sys',
    messages: [{ role: 'user', content: 'I keep freezing on penalties' }],
    coachingContext,
  });
  assert.equal(loop.transition.type, 'propose_barrier');
  assert.deepEqual(loop.quickReplies, ['Yes, that feels right', 'Not quite']);

  const finalText = sanitizeFinalText(loop.finalText);
  const { db } = makeDbStub(null);
  const commit = createCommitCoachingTransition(db);
  const committed = await commit({ userId: 'user-1', chatSessionId: 'cs-1', sessionType: null, finalText, transition: loop.transition });

  assert.equal(committed.card, null, 'a barrier proposal never produces a card');
  const emitted = emitLikeRoute({ finalText, committed, loopQuickReplies: loop.quickReplies });
  assert.deepEqual(emitted.map((e) => e.t), ['d', 'quick_replies', 'end']);
  assert.equal(emitted[0].c, 'Sounds like fear of failure — does that fit?');
});

// ── Production bugfix: repeated offer_quick_replies must not exhaust the
// round cap and force the deterministic retry (see bufferedToolLoop.test.js
// for the pure-loop-level proof; this reproduces the FULL route sequence:
// loop → sanitize → commit → SSE emission, exactly as chat.js does). ──────

test('Claude calling offer_quick_replies twice (round 1, then again in round 2) before finishing in round 3 succeeds end to end: no round-limit retry, exactly one quick_replies event, byte-equal persisted/emitted text', async () => {
  const anthropic = makeAnthropicStub([
    quickTool('draft 1', ['Yes, that feels right', 'Not quite'], 'tu-1'),
    quickTool('draft 2', ['Yes, that feels right', 'Not quite'], 'tu-2'), // the production repro: a duplicate call
    { stop_reason: 'end_turn', content: [{ type: 'text', text: 'Does that sound right?' }] },
  ]);

  const coachingContext = { hasActiveSelection: false, cycleStatus: null, barrierConfirmationStatus: null, hasPrescription: false };
  const loop = await runBufferedToolLoop({
    anthropic, model: 'test-model', maxTokens: 800, system: 'sys',
    messages: [{ role: 'user', content: 'I keep thinking about the result' }],
    coachingContext,
  });

  // The bug this fixes: without the idempotent duplicate handling, this
  // scenario used to exhaust MAX_ROUNDS (loop.exceededRounds === true,
  // loop.finalText === null), forcing chat.js's deterministic
  // "I couldn't save that coaching step" retry even though nothing was
  // ever actually wrong.
  assert.equal(loop.exceededRounds, false, 'must not exhaust the round cap on a duplicate presentation-tool call');
  assert.equal(loop.rounds, 3);
  assert.equal(loop.finalText, 'Does that sound right?');
  assert.deepEqual(loop.quickReplies, ['Yes, that feels right', 'Not quite']);

  const finalText = sanitizeFinalText(loop.finalText);
  assert.ok(finalText, 'sanitizeFinalText must not discard a real, non-empty response');

  const { db } = makeDbStub(null);
  const commit = createCommitCoachingTransition(db);
  const committed = await commit({ userId: 'user-1', chatSessionId: 'cs-1', sessionType: null, finalText, transition: loop.transition });

  // This is the same emitDeterministicRetry-avoidance chat.js relies on:
  // `if (!finalText) return emitDeterministicRetry(...)` is never reached
  // because finalText is real text, not null.
  assert.ok(finalText, 'chat.js\'s "if (!finalText)" deterministic-retry branch is never taken');

  const emitted = emitLikeRoute({ finalText, committed, loopQuickReplies: loop.quickReplies });
  assert.deepEqual(emitted.map((e) => e.t), ['d', 'quick_replies', 'end'], 'normal order: d, then quick_replies, then end');
  assert.equal(emitted.filter((e) => e.t === 'quick_replies').length, 1, 'exactly one quick_replies event');
  assert.equal(emitted[0].c, finalText, 'the emitted d event carries the exact final text');
  assert.equal(committed.message.content, finalText, 'persisted assistant text is byte-for-byte the emitted text');
  assert.equal(emitted[1].replies.length, 2);
});

test('different reply-label payloads on the duplicate offer_quick_replies call never replace the first staged set, even across a full commit', async () => {
  const anthropic = makeAnthropicStub([
    quickTool('draft 1', ['Mostly in matches', 'Mostly in training', 'Both'], 'tu-1'),
    quickTool('draft 2', ['Completely different', 'Another option'], 'tu-2'),
    { stop_reason: 'end_turn', content: [{ type: 'text', text: 'Got it, thanks for clarifying.' }] },
  ]);

  const coachingContext = { hasActiveSelection: false, cycleStatus: null, barrierConfirmationStatus: null, hasPrescription: false };
  const loop = await runBufferedToolLoop({
    anthropic, model: 'test-model', maxTokens: 800, system: 'sys',
    messages: [{ role: 'user', content: 'It happens in both' }],
    coachingContext,
  });

  assert.equal(loop.exceededRounds, false);
  assert.deepEqual(loop.quickReplies, ['Mostly in matches', 'Mostly in training', 'Both'], 'the FIRST staged set survives, never the duplicate\'s different payload');

  const finalText = sanitizeFinalText(loop.finalText);
  const { db } = makeDbStub(null);
  const commit = createCommitCoachingTransition(db);
  const committed = await commit({ userId: 'user-1', chatSessionId: 'cs-1', sessionType: null, finalText, transition: loop.transition });
  const emitted = emitLikeRoute({ finalText, committed, loopQuickReplies: loop.quickReplies });

  assert.deepEqual(
    emitted.find((e) => e.t === 'quick_replies').replies.map((r) => r.label),
    ['Mostly in matches', 'Mostly in training', 'Both']
  );
});

// ── Production bugfix: empty final text after an accepted tool call must
// recover, not exhaust rounds into the deterministic retry. Reproduces the
// exact confirmed production sequence end to end (loop → sanitize → commit
// → SSE emission), mirroring the log that surfaced it:
// { reasonCode: "EMPTY_FINAL_TEXT", rounds: 2, transitionStaged: false,
//   quickRepliesStaged: true }. ──────────────────────────────────────────

test('offer_quick_replies staged, then an empty end_turn response: one no-tools recovery call returns real text, the request succeeds, exactly one quick_replies event, byte-equal persisted/emitted text, no deterministic retry', async () => {
  const anthropic = makeAnthropicStub([
    quickTool('draft', ['Yes, that feels right', 'Not quite'], 'tu-1'),
    { stop_reason: 'end_turn', content: [{ type: 'text', text: '' }] }, // the production repro: no usable text
    { stop_reason: 'end_turn', content: [{ type: 'text', text: 'Got it — does that sound right to you?' }] }, // recovery
  ]);

  const coachingContext = { hasActiveSelection: false, cycleStatus: null, barrierConfirmationStatus: null, hasPrescription: false };
  const loop = await runBufferedToolLoop({
    anthropic, model: 'test-model', maxTokens: 800, system: 'sys',
    messages: [{ role: 'user', content: 'I keep thinking about the result' }],
    coachingContext,
  });

  assert.equal(loop.exceededRounds, false, 'recovery must never be mistaken for a round-limit failure');
  assert.equal(loop.finalTextRecoveryAttempted, true);
  assert.equal(loop.finalTextRecoverySucceeded, true);
  assert.equal(loop.finalText, 'Got it — does that sound right to you?');
  assert.deepEqual(loop.quickReplies, ['Yes, that feels right', 'Not quite'], 'the originally staged replies survive recovery');

  // This is exactly the check chat.js performs: with recovered text, the
  // `if (!finalText) return emitDeterministicRetry(...)` branch is never
  // reached — no "I couldn't save that coaching step" retry is emitted.
  const finalText = sanitizeFinalText(loop.finalText);
  assert.ok(finalText, 'no deterministic retry: recovered text is real and non-empty');

  const { db } = makeDbStub(null);
  const commit = createCommitCoachingTransition(db);
  const committed = await commit({ userId: 'user-1', chatSessionId: 'cs-1', sessionType: null, finalText, transition: loop.transition });

  const emitted = emitLikeRoute({ finalText, committed, loopQuickReplies: loop.quickReplies });
  assert.deepEqual(emitted.map((e) => e.t), ['d', 'quick_replies', 'end'], 'normal protocol order: d, then quick_replies, then end');
  assert.equal(emitted.filter((e) => e.t === 'quick_replies').length, 1, 'exactly one quick_replies event');
  assert.equal(emitted[0].c, finalText);
  assert.equal(committed.message.content, finalText, 'persisted assistant text is byte-for-byte the emitted text');
  // The hidden recovery instruction is server-internal to the Anthropic
  // call only — it never appears in what gets emitted or persisted.
  assert.ok(!emitted[0].c.includes('Your tool action has already been accepted'));
  assert.ok(!committed.message.content.includes('Your tool action has already been accepted'));
});

test('a staged prescription survives empty-text recovery and emits exactly one real card, byte-equal persisted/emitted text', async () => {
  const anthropic = makeAnthropicStub([
    {
      stop_reason: 'tool_use',
      content: [
        { type: 'text', text: 'draft' },
        { type: 'tool_use', id: 'tu-1', name: 'prescribe_mental_rep', input: PRESCRIBE_INPUT },
      ],
    },
    { stop_reason: 'end_turn', content: [{ type: 'text', text: '   ' }] }, // whitespace-only
    { stop_reason: 'end_turn', content: [{ type: 'text', text: 'Here is your one practice for this week.' }] }, // recovery
  ]);

  const coachingContext = { hasActiveSelection: true, cycleStatus: 'ACTIVE', barrierConfirmationStatus: 'PENDING', hasPrescription: false };
  const loop = await runBufferedToolLoop({
    anthropic, model: 'test-model', maxTokens: 800, system: 'sys',
    messages: [{ role: 'user', content: 'Yes, that is exactly it' }],
    coachingContext,
  });
  assert.equal(loop.transition.type, 'prescribe_mental_rep');
  assert.equal(loop.finalTextRecoverySucceeded, true);

  const finalText = sanitizeFinalText(loop.finalText);
  const { db, writes } = makeDbStub(pendingState());
  const commit = createCommitCoachingTransition(db);
  const committed = await commit({ userId: 'user-1', chatSessionId: 'cs-1', sessionType: null, finalText, transition: loop.transition });

  const emitted = emitLikeRoute({ finalText, committed, loopQuickReplies: loop.quickReplies });
  assert.deepEqual(emitted.map((e) => e.t), ['d', 'card', 'end']);
  assert.equal(emitted.filter((e) => e.t === 'card').length, 1, 'exactly one real card');
  assert.equal(writes.filter((w) => w.op === 'prescription.create').length, 1, 'exactly one prescription record');
  assert.equal(committed.message.content, finalText);
});

test('a second empty recovery response still produces the EMPTY_FINAL_TEXT deterministic-retry condition — sanitizeFinalText(loop.finalText) is null, exactly as chat.js checks', async () => {
  const anthropic = makeAnthropicStub([
    quickTool('draft', ['Yes, that feels right', 'Not quite'], 'tu-1'),
    { stop_reason: 'end_turn', content: [{ type: 'text', text: '' }] },
    { stop_reason: 'end_turn', content: [{ type: 'text', text: '' }] }, // recovery also empty
  ]);
  const coachingContext = { hasActiveSelection: false, cycleStatus: null, barrierConfirmationStatus: null, hasPrescription: false };
  const loop = await runBufferedToolLoop({
    anthropic, model: 'test-model', maxTokens: 800, system: 'sys',
    messages: [{ role: 'user', content: 'I keep thinking about the result' }],
    coachingContext,
  });
  assert.equal(loop.exceededRounds, false, 'this is an EMPTY_FINAL_TEXT case, not a ROUND_LIMIT case');
  assert.equal(loop.finalTextRecoveryAttempted, true);
  assert.equal(loop.finalTextRecoverySucceeded, false);
  // Exactly chat.js's own check: `sanitizeFinalText(loop.finalText)` null
  // means `if (!finalText) return emitDeterministicRetry(... 'EMPTY_FINAL_TEXT')`.
  assert.equal(sanitizeFinalText(loop.finalText), null);
});

function quickTool(draftText, replies, id) {
  return {
    stop_reason: 'tool_use',
    content: [
      { type: 'text', text: draftText },
      { type: 'tool_use', id, name: 'offer_quick_replies', input: { replies } },
    ],
  };
}
