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

test('no transition, message persistence fails: the commit itself throws (nothing is silently swallowed here) so the route can route to its deterministic retry', async () => {
  const db = { $transaction: (fn) => fn({ message: { create: async () => { throw new Error('db write failed'); } } }) };
  const commit = createCommitCoachingTransition(db);

  await assert.rejects(
    () => commit({ userId: 'user-1', chatSessionId: null, sessionType: null, finalText: 'Plain reply.', transition: null }),
    /db write failed/
  );
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

test('prescribe: succeeds again for the same cycle when the barrier is already CONFIRMED/CORRECTED and there is no current prescriptionId (PR-13: continuing after a DID_NOT_HELP outcome)', async () => {
  for (const priorStatus of ['CONFIRMED', 'CORRECTED']) {
    const state = {
      id: 's', userId: 'user-1',
      activeSelection: { ...pendingState().activeSelection, prescriptionId: null, cycle: { ...pendingState().activeSelection.cycle, barrierConfirmationStatus: priorStatus } },
    };
    const { db, writes } = makeDbStub({ state });
    const commit = createCommitCoachingTransition(db);
    const { card } = await commit({ userId: 'user-1', chatSessionId: 'cs-1', sessionType: null, finalText: 'ok', transition: PRESCRIBE });
    assert.ok(card, `prior status ${priorStatus}: a new prescription card must be returned`);
    assert.ok(writes.some((w) => w.op === 'prescription.create'), `prior status ${priorStatus}: a new prescription must be created`);
  }
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
      // CONFIRMED/CORRECTED with no prescriptionId is now a VALID
      // re-prescription state (PR-13, after a DID_NOT_HELP outcome) — see
      // the dedicated positive test below. Only a genuinely unrecognized
      // barrierConfirmationStatus value must still be rejected here.
      name: 'barrierConfirmationStatus is not PENDING, CONFIRMED, or CORRECTED',
      state: { id: 's', userId: 'user-1', activeSelection: { ...pendingState().activeSelection, cycle: { ...pendingState().activeSelection.cycle, barrierConfirmationStatus: 'SOMETHING_ELSE' } } },
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
  assert.deepEqual(await load1('u'), {
    hasActiveSelection: false, cycleStatus: null, barrierConfirmationStatus: null, hasPrescription: false,
    prescriptionStatus: null, prescriptionOutcomeStatus: null,
  });

  const load2 = createLoadCoachingContext({ userCoachingState: { findUnique: async () => pendingState() } });
  assert.deepEqual(await load2('u'), {
    hasActiveSelection: true, cycleStatus: 'ACTIVE', barrierConfirmationStatus: 'PENDING', hasPrescription: false,
    prescriptionStatus: null, prescriptionOutcomeStatus: null,
  });

  const prescribed = pendingState();
  prescribed.activeSelection.prescriptionId = 'presc-1';
  prescribed.activeSelection.cycle.barrierConfirmationStatus = 'CONFIRMED';
  prescribed.activeSelection.prescription = { status: 'ACTIVE', outcomeStatus: null };
  const load3 = createLoadCoachingContext({ userCoachingState: { findUnique: async () => prescribed } });
  assert.deepEqual(await load3('u'), {
    hasActiveSelection: true, cycleStatus: 'ACTIVE', barrierConfirmationStatus: 'CONFIRMED', hasPrescription: true,
    prescriptionStatus: 'ACTIVE', prescriptionOutcomeStatus: null,
  });
});

test('loadCoachingContext: exposes the selected Prescription\'s status and outcomeStatus (PR-13)', async () => {
  const withOutcome = pendingState();
  withOutcome.activeSelection.prescriptionId = 'presc-2';
  withOutcome.activeSelection.cycle.barrierConfirmationStatus = 'CONFIRMED';
  withOutcome.activeSelection.prescription = { status: 'COMPLETED', outcomeStatus: 'HELPED' };
  const load = createLoadCoachingContext({ userCoachingState: { findUnique: async () => withOutcome } });
  const context = await load('u');
  assert.equal(context.prescriptionStatus, 'COMPLETED');
  assert.equal(context.prescriptionOutcomeStatus, 'HELPED');
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

// ── record_prescription_outcome lifecycle (PR-13) ─────────────────────────
// A dedicated stub: unlike PROPOSE_BARRIER/PRESCRIBE_MENTAL_REP (which only
// ever CREATE rows), this transition conditionally UPDATEs an existing
// Prescription/CoachingCycle/ActiveCoachingSelection, so the stub needs
// mutable rows the same way claimPrescriptionFollowUp.test.js and
// completeActivePrescription.test.js do.

function makeOutcomeDbStub({ selection = null, cycleRow = null, prescriptionRow = null, failAt = null } = {}) {
  const writes = [];
  let idCounter = 0;
  const nextId = (p) => `${p}-${++idCounter}`;

  const tx = {
    userCoachingState: {
      findUnique: async () => {
        if (!selection) return null;
        return {
          userId: 'user-1',
          activeSelection: {
            ...selection,
            cycle: cycleRow ? { ...cycleRow } : null,
            prescription: prescriptionRow ? { ...prescriptionRow } : null,
          },
        };
      },
    },
    prescription: {
      updateMany: async ({ where, data }) => {
        writes.push({ op: 'prescription.updateMany', where, data });
        if (!prescriptionRow || prescriptionRow.id !== where.id) return { count: 0 };
        const stillOpen = !prescriptionRow.outcomeStatus || ['NOT_TRIED', 'HELPED_A_LITTLE'].includes(prescriptionRow.outcomeStatus);
        if (!stillOpen) return { count: 0 };
        if (failAt === 'prescriptionUpdateMany') throw new Error('prescription updateMany failed');
        Object.assign(prescriptionRow, data);
        return { count: 1 };
      },
    },
    coachingCycle: {
      update: async ({ where, data }) => {
        if (failAt === 'coachingCycleUpdate') throw new Error('coachingCycle update failed');
        writes.push({ op: 'coachingCycle.update', where, data });
        Object.assign(cycleRow, data);
        return { ...cycleRow };
      },
    },
    activeCoachingSelection: {
      delete: async ({ where }) => {
        if (failAt === 'activeCoachingSelectionDelete') throw new Error('activeCoachingSelection delete failed');
        writes.push({ op: 'activeCoachingSelection.delete', where });
        return {};
      },
      update: async ({ where, data }) => {
        if (failAt === 'activeCoachingSelectionUpdate') throw new Error('activeCoachingSelection update failed');
        writes.push({ op: 'activeCoachingSelection.update', where, data });
        Object.assign(selection, data);
        return { ...selection };
      },
    },
    message: {
      create: async ({ data }) => {
        if (failAt === 'message') throw new Error('message create failed');
        const row = { id: nextId('msg'), ...data };
        writes.push({ op: 'message.create', data });
        return row;
      },
    },
  };

  return { writes, prescriptionRow, cycleRow, selection, db: { $transaction: (fn) => fn(tx) } };
}

function activeOutcomeSelection(overrides = {}) {
  return { id: 'sel-A', cycleId: 'cycle-A', prescriptionId: 'presc-A', ...overrides };
}
function activeOutcomeCycle(overrides = {}) {
  return { id: 'cycle-A', status: 'ACTIVE', ...overrides };
}
function activeOutcomePrescription(overrides = {}) {
  return {
    id: 'presc-A', userId: 'user-1', cycleId: 'cycle-A', practiceKey: 'pressure_reset',
    status: 'ACTIVE', outcomeStatus: null, completedAt: null,
    followUpOpenerClaimedAt: null, followUpOpenerMessageId: null, followUpOpenerSessionId: null,
    ...overrides,
  };
}
function outcomeTransition(overrides = {}) {
  return { type: 'record_prescription_outcome', outcomeStatus: 'HELPED', lessonText: 'It helped.', ...overrides };
}

test('HELPED: completes the Prescription, resolves the CoachingCycle, deletes the ActiveCoachingSelection, persists the lesson verbatim, and creates no new Prescription', async () => {
  const { db, writes } = makeOutcomeDbStub({
    selection: activeOutcomeSelection(), cycleRow: activeOutcomeCycle(), prescriptionRow: activeOutcomePrescription(),
  });
  const commit = createCommitCoachingTransition(db);
  const lesson = 'Resetting to the next ball helped you regain your attention.';
  const finalText = `That's great to hear. ${lesson}`;

  const { message, card } = await commit({
    userId: 'user-1', chatSessionId: 'cs-1', sessionType: null, finalText,
    transition: outcomeTransition({ outcomeStatus: 'HELPED', lessonText: lesson }),
    userMessageId: 'msg-user-1',
  });

  assert.equal(card, null);
  assert.equal(message.content, finalText, 'persisted assistant text equals emitted text');

  const prescWrite = writes.find((w) => w.op === 'prescription.updateMany');
  assert.equal(prescWrite.where.id, 'presc-A');
  assert.equal(prescWrite.data.outcomeStatus, 'HELPED');
  assert.equal(prescWrite.data.outcomeLesson, lesson);
  assert.equal(prescWrite.data.status, 'COMPLETED');
  assert.ok(prescWrite.data.completedAt instanceof Date);
  assert.equal(prescWrite.data.outcomeSourceMessageId, 'msg-user-1', 'the real current user Message id, never invented');
  assert.equal(prescWrite.data.outcomeSourceSessionId, 'cs-1');

  const cycleWrite = writes.find((w) => w.op === 'coachingCycle.update');
  assert.equal(cycleWrite.where.id, 'cycle-A');
  assert.equal(cycleWrite.data.status, 'RESOLVED');
  assert.ok(cycleWrite.data.resolvedAt instanceof Date);

  const selDelete = writes.find((w) => w.op === 'activeCoachingSelection.delete');
  assert.ok(selDelete);
  assert.equal(selDelete.where.id, 'sel-A');

  assert.ok(!writes.some((w) => w.op === 'prescription.create'), 'no new Prescription is created automatically');
});

test('HELPED: preserves an existing completedAt (already set via PR-12\'s practice-page completion) rather than overwriting it', async () => {
  const existingCompletedAt = new Date('2026-07-01T00:00:00Z');
  const { db, writes } = makeOutcomeDbStub({
    selection: activeOutcomeSelection(), cycleRow: activeOutcomeCycle(),
    prescriptionRow: activeOutcomePrescription({ status: 'COMPLETED', completedAt: existingCompletedAt }),
  });
  const commit = createCommitCoachingTransition(db);
  const lesson = 'It helped.';
  await commit({ userId: 'user-1', chatSessionId: 'cs-1', sessionType: null, finalText: lesson, transition: outcomeTransition({ outcomeStatus: 'HELPED', lessonText: lesson }) });

  const prescWrite = writes.find((w) => w.op === 'prescription.updateMany');
  assert.equal(prescWrite.data.completedAt.getTime(), existingCompletedAt.getTime());
});

test('HELPED_A_LITTLE: keeps CoachingCycle ACTIVE and ActiveCoachingSelection linked, leaves Prescription.status untouched, and resets the follow-up-opener claim fields', async () => {
  const { db, writes } = makeOutcomeDbStub({
    selection: activeOutcomeSelection(), cycleRow: activeOutcomeCycle(),
    prescriptionRow: activeOutcomePrescription({
      followUpOpenerClaimedAt: new Date('2026-07-01T00:00:00Z'), followUpOpenerMessageId: 'msg-old', followUpOpenerSessionId: 'cs-old',
    }),
  });
  const commit = createCommitCoachingTransition(db);
  const lesson = 'The reset helped a little, but pressure still pulled your attention toward the result.';
  await commit({ userId: 'user-1', chatSessionId: 'cs-1', sessionType: null, finalText: lesson, transition: outcomeTransition({ outcomeStatus: 'HELPED_A_LITTLE', lessonText: lesson }) });

  const prescWrite = writes.find((w) => w.op === 'prescription.updateMany');
  assert.equal(prescWrite.data.outcomeStatus, 'HELPED_A_LITTLE');
  assert.equal(prescWrite.data.outcomeLesson, lesson);
  assert.equal(prescWrite.data.status, undefined, 'status must not be touched — ACTIVE or COMPLETED is preserved as-is');
  assert.equal(prescWrite.data.followUpOpenerClaimedAt, null, 'the opener claim must reset so a later genuine entry can ask again');
  assert.equal(prescWrite.data.followUpOpenerMessageId, null);
  assert.equal(prescWrite.data.followUpOpenerSessionId, null);
  assert.ok(!writes.some((w) => w.op === 'coachingCycle.update'), 'cycle stays exactly as-is — no write');
  assert.ok(!writes.some((w) => w.op === 'activeCoachingSelection.delete' || w.op === 'activeCoachingSelection.update'), 'selection stays linked — no write');
  assert.ok(!writes.some((w) => w.op === 'prescription.create'), 'no automatic new Prescription');
});

test('HELPED_A_LITTLE preserves the Prescription\'s existing COMPLETED status (from PR-12\'s practice-page completion) rather than reverting or changing it', async () => {
  const { db, writes } = makeOutcomeDbStub({
    selection: activeOutcomeSelection(), cycleRow: activeOutcomeCycle(),
    prescriptionRow: activeOutcomePrescription({ status: 'COMPLETED', completedAt: new Date('2026-07-01T00:00:00Z') }),
  });
  const commit = createCommitCoachingTransition(db);
  const lesson = 'It helped a little.';
  await commit({ userId: 'user-1', chatSessionId: 'cs-1', sessionType: null, finalText: lesson, transition: outcomeTransition({ outcomeStatus: 'HELPED_A_LITTLE', lessonText: lesson }) });

  const prescWrite = writes.find((w) => w.op === 'prescription.updateMany');
  assert.equal(prescWrite.data.status, undefined, 'status is left untouched — still COMPLETED on the row afterward');
});

test('HELPED_A_LITTLE followed by a later genuine entry: the follow-up-opener claim succeeds again (reset, not permanently stuck)', async () => {
  const prescription = activeOutcomePrescription({
    followUpOpenerClaimedAt: new Date('2026-07-01T00:00:00Z'), followUpOpenerMessageId: 'msg-old', followUpOpenerSessionId: 'cs-old',
  });
  const { db, writes } = makeOutcomeDbStub({ selection: activeOutcomeSelection(), cycleRow: activeOutcomeCycle(), prescriptionRow: prescription });
  const commit = createCommitCoachingTransition(db);
  const lesson = 'It helped a little.';
  await commit({ userId: 'user-1', chatSessionId: 'cs-1', sessionType: null, finalText: lesson, transition: outcomeTransition({ outcomeStatus: 'HELPED_A_LITTLE', lessonText: lesson }) });

  // The mutable stub row now reflects the reset opener-claim fields —
  // exactly what claimPrescriptionFollowUp reads on a later genuine entry.
  assert.equal(prescription.followUpOpenerClaimedAt, null);
  assert.equal(prescription.outcomeStatus, 'HELPED_A_LITTLE');
  assert.ok(!writes.some((w) => w.op === 'prescription.create'));
});

test('a later HELPED after a prior HELPED_A_LITTLE resolves the cycle normally (completes Prescription, resolves cycle, deletes selection)', async () => {
  const { db, writes } = makeOutcomeDbStub({
    selection: activeOutcomeSelection(), cycleRow: activeOutcomeCycle(),
    prescriptionRow: activeOutcomePrescription({ outcomeStatus: 'HELPED_A_LITTLE' }),
  });
  const commit = createCommitCoachingTransition(db);
  const lesson = 'This time it really helped.';
  await commit({ userId: 'user-1', chatSessionId: 'cs-1', sessionType: null, finalText: lesson, transition: outcomeTransition({ outcomeStatus: 'HELPED', lessonText: lesson }) });

  const prescWrite = writes.find((w) => w.op === 'prescription.updateMany');
  assert.equal(prescWrite.data.outcomeStatus, 'HELPED');
  assert.equal(prescWrite.data.status, 'COMPLETED');
  assert.ok(writes.some((w) => w.op === 'coachingCycle.update' && w.data.status === 'RESOLVED'));
  assert.ok(writes.some((w) => w.op === 'activeCoachingSelection.delete'));
});

test('a later DID_NOT_HELP after a prior HELPED_A_LITTLE supersedes the Prescription and clears the selected prescriptionId normally', async () => {
  const { db, writes } = makeOutcomeDbStub({
    selection: activeOutcomeSelection(), cycleRow: activeOutcomeCycle(),
    prescriptionRow: activeOutcomePrescription({ outcomeStatus: 'HELPED_A_LITTLE' }),
  });
  const commit = createCommitCoachingTransition(db);
  const lesson = 'On reflection, this did not really help.';
  await commit({ userId: 'user-1', chatSessionId: 'cs-1', sessionType: null, finalText: lesson, transition: outcomeTransition({ outcomeStatus: 'DID_NOT_HELP', lessonText: lesson }) });

  const prescWrite = writes.find((w) => w.op === 'prescription.updateMany');
  assert.equal(prescWrite.data.outcomeStatus, 'DID_NOT_HELP');
  assert.equal(prescWrite.data.status, 'SUPERSEDED');
  assert.ok(prescWrite.data.supersededAt instanceof Date);
  const selUpdate = writes.find((w) => w.op === 'activeCoachingSelection.update');
  assert.equal(selUpdate.data.prescriptionId, null);
});

test('concurrent submissions after a prior HELPED_A_LITTLE still permit only one transition against the previously loaded state', async () => {
  const { db, writes } = makeOutcomeDbStub({
    selection: activeOutcomeSelection(), cycleRow: activeOutcomeCycle(),
    prescriptionRow: activeOutcomePrescription({ outcomeStatus: 'HELPED_A_LITTLE' }),
  });
  const commit = createCommitCoachingTransition(db);
  const helpedLesson = 'It really helped this time.';
  const didNotHelpLesson = 'It did not help after all.';

  const results = await Promise.allSettled([
    commit({ userId: 'user-1', chatSessionId: 'cs-1', sessionType: null, finalText: helpedLesson, transition: outcomeTransition({ outcomeStatus: 'HELPED', lessonText: helpedLesson }) }),
    commit({ userId: 'user-1', chatSessionId: 'cs-1', sessionType: null, finalText: didNotHelpLesson, transition: outcomeTransition({ outcomeStatus: 'DID_NOT_HELP', lessonText: didNotHelpLesson }) }),
  ]);

  const fulfilled = results.filter((r) => r.status === 'fulfilled');
  const rejected = results.filter((r) => r.status === 'rejected');
  assert.equal(fulfilled.length, 1, 'exactly one submission succeeds');
  assert.equal(rejected.length, 1);

  const updateManyWrites = writes.filter((w) => w.op === 'prescription.updateMany');
  assert.equal(updateManyWrites.length, 2, 'both attempt the conditional update; only one actually flips the row');
});

test('DID_NOT_HELP: supersedes the Prescription, clears the selection\'s prescriptionId, keeps CoachingCycle ACTIVE, creates no new Prescription in the same request', async () => {
  const { db, writes } = makeOutcomeDbStub({
    selection: activeOutcomeSelection(), cycleRow: activeOutcomeCycle(), prescriptionRow: activeOutcomePrescription(),
  });
  const commit = createCommitCoachingTransition(db);
  const lesson = 'This reset did not help enough in that situation.';
  await commit({ userId: 'user-1', chatSessionId: 'cs-1', sessionType: null, finalText: lesson, transition: outcomeTransition({ outcomeStatus: 'DID_NOT_HELP', lessonText: lesson }) });

  const prescWrite = writes.find((w) => w.op === 'prescription.updateMany');
  assert.equal(prescWrite.data.status, 'SUPERSEDED');
  assert.ok(prescWrite.data.supersededAt instanceof Date);

  const selUpdate = writes.find((w) => w.op === 'activeCoachingSelection.update');
  assert.equal(selUpdate.where.id, 'sel-A');
  assert.equal(selUpdate.data.prescriptionId, null);

  assert.ok(!writes.some((w) => w.op === 'coachingCycle.update'), 'cycle must stay ACTIVE — no cycle write');
  assert.ok(!writes.some((w) => w.op === 'activeCoachingSelection.delete'));
  assert.ok(!writes.some((w) => w.op === 'prescription.create'));
});

test('NOT_TRIED: keeps Prescription/selection/cycle active and clears the follow-up-opener claim fields so a later entry may receive another opener', async () => {
  const { db, writes } = makeOutcomeDbStub({
    selection: activeOutcomeSelection(), cycleRow: activeOutcomeCycle(),
    prescriptionRow: activeOutcomePrescription({
      followUpOpenerClaimedAt: new Date('2026-07-01T00:00:00Z'), followUpOpenerMessageId: 'msg-old', followUpOpenerSessionId: 'cs-old',
    }),
  });
  const commit = createCommitCoachingTransition(db);
  const lesson = 'You have not tested this Mental Rep in the planned situation yet.';
  await commit({ userId: 'user-1', chatSessionId: 'cs-1', sessionType: null, finalText: lesson, transition: outcomeTransition({ outcomeStatus: 'NOT_TRIED', lessonText: lesson }) });

  const prescWrite = writes.find((w) => w.op === 'prescription.updateMany');
  assert.equal(prescWrite.data.outcomeStatus, 'NOT_TRIED');
  assert.equal(prescWrite.data.followUpOpenerClaimedAt, null);
  assert.equal(prescWrite.data.followUpOpenerMessageId, null);
  assert.equal(prescWrite.data.followUpOpenerSessionId, null);
  assert.equal(prescWrite.data.status, undefined, 'status must not be touched');
  assert.ok(!writes.some((w) => w.op === 'coachingCycle.update'));
  assert.ok(!writes.some((w) => w.op === 'activeCoachingSelection.delete' || w.op === 'activeCoachingSelection.update'));
});

test('no outcome ever creates a new Prescription, CoachingCycle, or ActiveCoachingSelection', async () => {
  for (const outcomeStatus of ['HELPED', 'HELPED_A_LITTLE', 'DID_NOT_HELP', 'NOT_TRIED']) {
    const { db, writes } = makeOutcomeDbStub({
      selection: activeOutcomeSelection(), cycleRow: activeOutcomeCycle(), prescriptionRow: activeOutcomePrescription(),
    });
    const commit = createCommitCoachingTransition(db);
    const lesson = 'ok';
    await commit({ userId: 'user-1', chatSessionId: 'cs-1', sessionType: null, finalText: lesson, transition: outcomeTransition({ outcomeStatus, lessonText: lesson }) });
    assert.ok(!writes.some((w) => w.op === 'prescription.create'), `${outcomeStatus} must not create a Prescription`);
    assert.ok(!writes.some((w) => w.op === 'coachingCycle.create'), `${outcomeStatus} must not create a CoachingCycle`);
    assert.ok(!writes.some((w) => w.op === 'activeCoachingSelection.create'), `${outcomeStatus} must not create an ActiveCoachingSelection`);
  }
});

test('the final text must contain the exact lessonText verbatim — rejected with zero writes if it does not', async () => {
  const { db, writes } = makeOutcomeDbStub({
    selection: activeOutcomeSelection(), cycleRow: activeOutcomeCycle(), prescriptionRow: activeOutcomePrescription(),
  });
  const commit = createCommitCoachingTransition(db);
  await assert.rejects(
    () => commit({
      userId: 'user-1', chatSessionId: 'cs-1', sessionType: null, finalText: 'Great, glad to hear it!',
      transition: outcomeTransition({ outcomeStatus: 'HELPED', lessonText: 'Resetting helped you regain focus.' }),
    }),
    CoachingStateConflictError
  );
  assert.equal(writes.length, 0);
});

test('commit-time revalidation rejects when a FINAL outcome (HELPED or DID_NOT_HELP) was already recorded, even though the staged transition itself was well-formed', async () => {
  for (const priorOutcome of ['HELPED', 'DID_NOT_HELP']) {
    const { db, writes } = makeOutcomeDbStub({
      selection: activeOutcomeSelection(), cycleRow: activeOutcomeCycle(),
      prescriptionRow: activeOutcomePrescription({ outcomeStatus: priorOutcome }),
    });
    const commit = createCommitCoachingTransition(db);
    const lesson = 'It helped.';
    await assert.rejects(
      () => commit({ userId: 'user-1', chatSessionId: 'cs-1', sessionType: null, finalText: lesson, transition: outcomeTransition({ outcomeStatus: 'HELPED', lessonText: lesson }) }),
      CoachingStateConflictError,
      `prior outcome ${priorOutcome} must block a new one`
    );
    assert.equal(writes.length, 0, `prior outcome ${priorOutcome} must write nothing`);
  }
});

test('commit-time revalidation ALLOWS a new outcome when the prior one was HELPED_A_LITTLE or NOT_TRIED (both provisional, not final)', async () => {
  for (const priorOutcome of ['HELPED_A_LITTLE', 'NOT_TRIED']) {
    const { db, writes } = makeOutcomeDbStub({
      selection: activeOutcomeSelection(), cycleRow: activeOutcomeCycle(),
      prescriptionRow: activeOutcomePrescription({ outcomeStatus: priorOutcome }),
    });
    const commit = createCommitCoachingTransition(db);
    const lesson = 'It helped.';
    await commit({ userId: 'user-1', chatSessionId: 'cs-1', sessionType: null, finalText: lesson, transition: outcomeTransition({ outcomeStatus: 'HELPED', lessonText: lesson }) });
    assert.ok(writes.some((w) => w.op === 'prescription.updateMany'), `prior outcome ${priorOutcome} must allow the new one to be written`);
  }
});

test('commit-time revalidation rejects when there is no matching active selection/prescription/cycle/ownership — zero writes in every variant', async () => {
  const variants = [
    { name: 'no active selection at all', selection: null, cycleRow: null, prescriptionRow: null },
    { name: 'selection with no prescription', selection: activeOutcomeSelection({ prescriptionId: null }), cycleRow: activeOutcomeCycle(), prescriptionRow: null },
    { name: 'cycle not ACTIVE', selection: activeOutcomeSelection(), cycleRow: activeOutcomeCycle({ status: 'RESOLVED' }), prescriptionRow: activeOutcomePrescription() },
    { name: 'prescription belongs to a different user', selection: activeOutcomeSelection(), cycleRow: activeOutcomeCycle(), prescriptionRow: activeOutcomePrescription({ userId: 'someone-else' }) },
    { name: 'prescription cycleId does not match the selection\'s cycle', selection: activeOutcomeSelection(), cycleRow: activeOutcomeCycle(), prescriptionRow: activeOutcomePrescription({ cycleId: 'cycle-other' }) },
    { name: 'prescription SUPERSEDED', selection: activeOutcomeSelection(), cycleRow: activeOutcomeCycle(), prescriptionRow: activeOutcomePrescription({ status: 'SUPERSEDED' }) },
  ];
  for (const variant of variants) {
    const { db, writes } = makeOutcomeDbStub({ selection: variant.selection, cycleRow: variant.cycleRow, prescriptionRow: variant.prescriptionRow });
    const commit = createCommitCoachingTransition(db);
    const lesson = 'ok';
    await assert.rejects(
      () => commit({ userId: 'user-1', chatSessionId: 'cs-1', sessionType: null, finalText: lesson, transition: outcomeTransition({ outcomeStatus: 'HELPED', lessonText: lesson }) }),
      CoachingStateConflictError,
      `variant "${variant.name}" must throw`
    );
    assert.equal(writes.length, 0, `variant "${variant.name}" must write nothing`);
  }
});

test('a message-create failure happens after the outcome write — under a real transaction this rolls the outcome (and any cycle/selection change) back too', async () => {
  const { db, writes } = makeOutcomeDbStub({
    selection: activeOutcomeSelection(), cycleRow: activeOutcomeCycle(), prescriptionRow: activeOutcomePrescription(), failAt: 'message',
  });
  const commit = createCommitCoachingTransition(db);
  const lesson = 'It helped.';
  await assert.rejects(() => commit({ userId: 'user-1', chatSessionId: 'cs-1', sessionType: null, finalText: lesson, transition: outcomeTransition({ outcomeStatus: 'HELPED', lessonText: lesson }) }));

  assert.ok(writes.some((w) => w.op === 'prescription.updateMany'));
  assert.ok(!writes.some((w) => w.op === 'message.create'), 'the message create itself is what failed — never recorded');
});

test('concurrent submissions for the same Prescription allow exactly one transition — the loser sees zero rows and the whole request rejects', async () => {
  const { db, writes } = makeOutcomeDbStub({
    selection: activeOutcomeSelection(), cycleRow: activeOutcomeCycle(), prescriptionRow: activeOutcomePrescription(),
  });
  const commit = createCommitCoachingTransition(db);
  const lesson = 'It helped.';
  const args = { userId: 'user-1', chatSessionId: 'cs-1', sessionType: null, finalText: lesson, transition: outcomeTransition({ outcomeStatus: 'HELPED', lessonText: lesson }) };

  const results = await Promise.allSettled([commit(args), commit(args)]);
  const fulfilled = results.filter((r) => r.status === 'fulfilled');
  const rejected = results.filter((r) => r.status === 'rejected');
  assert.equal(fulfilled.length, 1, 'exactly one submission succeeds');
  assert.equal(rejected.length, 1);

  const updateManyWrites = writes.filter((w) => w.op === 'prescription.updateMany');
  assert.equal(updateManyWrites.length, 2, 'both attempt the conditional update; only one actually flips the row');
  const cycleUpdates = writes.filter((w) => w.op === 'coachingCycle.update');
  assert.equal(cycleUpdates.length, 1, 'only the true winner resolves the cycle — no double resolution');
  const selectionDeletes = writes.filter((w) => w.op === 'activeCoachingSelection.delete');
  assert.equal(selectionDeletes.length, 1, 'only the true winner deletes the selection — no double delete attempt');
});
