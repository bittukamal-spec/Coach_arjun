// Behavioral tests for the atomic coaching-transition commit (PR-10),
// using a stubbed Prisma client — no database. The stub's $transaction
// simply invokes the callback with a recording tx object; atomicity itself
// is Prisma/Postgres behavior, so what these tests prove is the ordering:
// every revalidation happens BEFORE any write, meaning a thrown conflict
// leaves the recorded write log empty.

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  createCommitCoachingTransition,
  createLoadCoachingContext,
  CoachingStateConflictError,
  getRetryMessage,
} = require('../src/services/coaching/commitCoachingTransition');

function makeDbStub({ state = null } = {}) {
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
      update: async (args) => {
        writes.push({ op: 'coachingCycle.update', ...args });
        return { id: args.where.id, ...args.data };
      },
    },
    activeCoachingSelection: {
      create: async ({ data }) => {
        const row = { id: nextId('sel'), ...data };
        writes.push({ op: 'activeCoachingSelection.create', data });
        return row;
      },
      update: async (args) => {
        writes.push({ op: 'activeCoachingSelection.update', ...args });
        return { id: args.where.id, ...args.data };
      },
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

  return {
    writes,
    db: { $transaction: (fn) => fn(tx) },
  };
}

const PROPOSE = {
  type: 'propose_barrier',
  problemStatement: 'Freezes on penalties',
  barrierHypothesis: 'Fear of failure',
};

const PRESCRIBE = {
  type: 'prescribe_mental_rep',
  barrierConfirmationStatus: 'CONFIRMED',
  finalBarrierHypothesis: 'Fear of failure under expectations',
  practiceKey: 'pre_performance_routine',
  situation: 'Penalty kicks in league matches',
  cardContent: 'Design a 20-second routine: breath, spot, cue word, strike.',
  cueWord: 'Spot',
};

function pendingState() {
  return {
    id: 'state-A',
    userId: 'user-1',
    activeSelection: {
      id: 'sel-A',
      userCoachingStateId: 'state-A',
      userId: 'user-1',
      cycleId: 'cycle-A',
      prescriptionId: null,
      cycle: { id: 'cycle-A', userId: 'user-1', status: 'ACTIVE', barrierConfirmationStatus: 'PENDING' },
    },
  };
}

// ── No transition ────────────────────────────────────────────────────────────

test('no transition: persists only the assistant message, byte-for-byte, and returns no card', async () => {
  const { db, writes } = makeDbStub();
  const commit = createCommitCoachingTransition(db);
  const finalText = 'Plain coaching reply — no state change. ✅\n\nWith unicode & newlines.';

  const { message, card } = await commit({ userId: 'user-1', chatSessionId: 'cs-1', sessionType: null, finalText, transition: null });

  assert.equal(card, null);
  assert.equal(writes.length, 1);
  assert.equal(writes[0].op, 'message.create');
  assert.equal(writes[0].data.content, finalText);
  assert.equal(message.content, finalText);
});

// ── propose_barrier ──────────────────────────────────────────────────────────

test('propose_barrier: creates state (when absent), an ACTIVE-default cycle with the problem + hypothesis, a selection with no prescription, and the exact message', async () => {
  const { db, writes } = makeDbStub({ state: null });
  const commit = createCommitCoachingTransition(db);
  const finalText = 'Sounds like fear of failure — does that fit?';

  const { message, card } = await commit({ userId: 'user-1', chatSessionId: 'cs-1', sessionType: 'general', finalText, transition: PROPOSE });

  assert.equal(card, null, 'a barrier proposal must not emit a card');
  const ops = writes.map((w) => w.op);
  assert.deepEqual(ops, ['userCoachingState.create', 'coachingCycle.create', 'activeCoachingSelection.create', 'message.create']);

  const cycleWrite = writes.find((w) => w.op === 'coachingCycle.create');
  assert.equal(cycleWrite.data.userId, 'user-1');
  assert.equal(cycleWrite.data.problemStatement, PROPOSE.problemStatement);
  assert.equal(cycleWrite.data.barrierHypothesis, PROPOSE.barrierHypothesis);
  assert.equal(cycleWrite.data.sourceChatSessionId, 'cs-1');
  // status/barrierConfirmationStatus are not set explicitly — the schema
  // defaults (ACTIVE / PENDING) apply.
  assert.equal(cycleWrite.data.status, undefined);
  assert.equal(cycleWrite.data.barrierConfirmationStatus, undefined);

  const selWrite = writes.find((w) => w.op === 'activeCoachingSelection.create');
  assert.equal(selWrite.data.userId, 'user-1');
  assert.equal(selWrite.data.prescriptionId, undefined, 'the new selection must carry no prescription');

  assert.equal(writes.at(-1).data.content, finalText);
  assert.equal(message.content, finalText);
});

test('propose_barrier: reuses an existing state row that has no active selection', async () => {
  const { db, writes } = makeDbStub({ state: { id: 'state-A', userId: 'user-1', activeSelection: null } });
  const commit = createCommitCoachingTransition(db);

  await commit({ userId: 'user-1', chatSessionId: null, sessionType: null, finalText: 'ok', transition: PROPOSE });

  assert.ok(!writes.some((w) => w.op === 'userCoachingState.create'));
  const selWrite = writes.find((w) => w.op === 'activeCoachingSelection.create');
  assert.equal(selWrite.data.userCoachingStateId, 'state-A');
});

test('propose_barrier: a concurrent active selection makes the commit throw with zero writes', async () => {
  const { db, writes } = makeDbStub({ state: pendingState() });
  const commit = createCommitCoachingTransition(db);

  await assert.rejects(
    () => commit({ userId: 'user-1', chatSessionId: null, sessionType: null, finalText: 'x', transition: PROPOSE }),
    CoachingStateConflictError
  );
  assert.equal(writes.length, 0, 'a conflicting proposal must write nothing — not even the message');
});

// ── prescribe_mental_rep ─────────────────────────────────────────────────────

test('prescribe: updates the cycle, creates one prescription, points the selection at it, persists the exact message, and returns the card with the REAL persisted id', async () => {
  const { db, writes } = makeDbStub({ state: pendingState() });
  const commit = createCommitCoachingTransition(db);
  const finalText = 'One practice for this week — details on your card below.';

  const { message, card } = await commit({ userId: 'user-1', chatSessionId: 'cs-9', sessionType: null, finalText, transition: PRESCRIBE });

  const ops = writes.map((w) => w.op);
  assert.deepEqual(ops, ['coachingCycle.update', 'prescription.create', 'activeCoachingSelection.update', 'message.create']);

  const cycleUpdate = writes.find((w) => w.op === 'coachingCycle.update');
  assert.equal(cycleUpdate.where.id, 'cycle-A');
  assert.equal(cycleUpdate.data.barrierConfirmationStatus, 'CONFIRMED');
  assert.equal(cycleUpdate.data.barrierHypothesis, PRESCRIBE.finalBarrierHypothesis);

  const prescWrite = writes.find((w) => w.op === 'prescription.create');
  assert.equal(prescWrite.data.userId, 'user-1');
  assert.equal(prescWrite.data.cycleId, 'cycle-A', 'the prescription must link to the same active cycle');
  assert.equal(prescWrite.data.practiceKey, 'pre_performance_routine');
  assert.equal(prescWrite.data.sourceChatSessionId, 'cs-9');

  const selUpdate = writes.find((w) => w.op === 'activeCoachingSelection.update');
  assert.equal(selUpdate.where.id, 'sel-A');
  assert.equal(selUpdate.data.prescriptionId, prescWrite.id, 'selection must point at the real created prescription');

  assert.equal(card.prescriptionId, prescWrite.id, 'the card must carry the real persisted prescription id');
  assert.equal(card.practiceKey, PRESCRIBE.practiceKey);
  assert.equal(card.situation, PRESCRIBE.situation);
  assert.equal(card.cardContent, PRESCRIBE.cardContent);
  assert.equal(card.cueWord, 'Spot');

  assert.equal(message.content, finalText);
  assert.equal(writes.at(-1).data.content, finalText, 'persisted assistant text must equal emitted text');
});

test('prescribe: CORRECTED status is persisted as given', async () => {
  const { db, writes } = makeDbStub({ state: pendingState() });
  const commit = createCommitCoachingTransition(db);
  await commit({
    userId: 'user-1', chatSessionId: null, sessionType: null, finalText: 'ok',
    transition: { ...PRESCRIBE, barrierConfirmationStatus: 'CORRECTED' },
  });
  assert.equal(writes.find((w) => w.op === 'coachingCycle.update').data.barrierConfirmationStatus, 'CORRECTED');
});

test('prescribe conflict variants all throw with zero writes', async () => {
  const variants = [
    { name: 'no state at all', state: null },
    { name: 'state without selection', state: { id: 's', userId: 'user-1', activeSelection: null } },
    {
      name: 'selection already has a prescription',
      state: { id: 's', userId: 'user-1', activeSelection: { ...pendingState().activeSelection, prescriptionId: 'presc-existing' } },
    },
    {
      name: 'cycle not ACTIVE',
      state: { id: 's', userId: 'user-1', activeSelection: { ...pendingState().activeSelection, cycle: { ...pendingState().activeSelection.cycle, status: 'RESOLVED' } } },
    },
    {
      name: 'barrier no longer PENDING',
      state: { id: 's', userId: 'user-1', activeSelection: { ...pendingState().activeSelection, cycle: { ...pendingState().activeSelection.cycle, barrierConfirmationStatus: 'CONFIRMED' } } },
    },
  ];

  for (const variant of variants) {
    const { db, writes } = makeDbStub({ state: variant.state });
    const commit = createCommitCoachingTransition(db);
    await assert.rejects(
      () => commit({ userId: 'user-1', chatSessionId: null, sessionType: null, finalText: 'x', transition: PRESCRIBE }),
      CoachingStateConflictError,
      `variant "${variant.name}" must throw`
    );
    assert.equal(writes.length, 0, `variant "${variant.name}" must write nothing`);
  }
});

test('an unknown transition type throws with zero writes', async () => {
  const { db, writes } = makeDbStub();
  const commit = createCommitCoachingTransition(db);
  await assert.rejects(
    () => commit({ userId: 'user-1', chatSessionId: null, sessionType: null, finalText: 'x', transition: { type: 'abandon_cycle' } }),
    CoachingStateConflictError
  );
  assert.equal(writes.length, 0);
});

// ── loadCoachingContext ──────────────────────────────────────────────────────

test('loadCoachingContext: maps no state, a pending selection, and a prescribed selection correctly', async () => {
  const load1 = createLoadCoachingContext({ userCoachingState: { findUnique: async () => null } });
  assert.deepEqual(await load1('u'), { hasActiveSelection: false, cycleStatus: null, barrierConfirmationStatus: null, hasPrescription: false });

  const load2 = createLoadCoachingContext({ userCoachingState: { findUnique: async () => pendingState() } });
  assert.deepEqual(await load2('u'), { hasActiveSelection: true, cycleStatus: 'ACTIVE', barrierConfirmationStatus: 'PENDING', hasPrescription: false });

  const prescribed = pendingState();
  prescribed.activeSelection.prescriptionId = 'presc-1';
  prescribed.activeSelection.cycle.barrierConfirmationStatus = 'CONFIRMED';
  const load3 = createLoadCoachingContext({ userCoachingState: { findUnique: async () => prescribed } });
  assert.deepEqual(await load3('u'), { hasActiveSelection: true, cycleStatus: 'ACTIVE', barrierConfirmationStatus: 'CONFIRMED', hasPrescription: true });
});

// ── Deterministic retry copy ─────────────────────────────────────────────────

test('getRetryMessage: fixed deterministic copy in both languages, mentioning that nothing changed', () => {
  const en = getRetryMessage('en');
  const hi = getRetryMessage('hi');
  assert.equal(en, getRetryMessage('en'), 'must be deterministic');
  assert.notEqual(en, hi);
  assert.match(en, /Nothing was changed/i);
  assert.match(hi, /change nahi hua/i);
  assert.equal(getRetryMessage(undefined), en, 'unknown language falls back to English');
});
