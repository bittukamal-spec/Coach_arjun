// Integration-style test wiring the three real coaching services together
// (runBufferedToolLoop → sanitizeFinalText → commitCoachingTransition)
// exactly as chat.js's route does, with stubbed Anthropic and Prisma — no
// network, no database. Proves the full accepted-prescription sequence
// end to end, including legacy-marker stripping (PR-10 correction 2).

const test = require('node:test');
const assert = require('node:assert/strict');
const { runBufferedToolLoop, sanitizeFinalText } = require('../src/services/coaching/bufferedToolLoop');
const { createCommitCoachingTransition } = require('../src/services/coaching/commitCoachingTransition');

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
    userCoachingState: { findUnique: async () => state },
    coachingCycle: {
      update: async (args) => { writes.push({ op: 'coachingCycle.update', ...args }); return { id: args.where.id, ...args.data }; },
    },
    activeCoachingSelection: {
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
