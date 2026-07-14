// Behavioral tests for exact prescription completion linkage (PR-12), using
// a stubbed Prisma client — no database. As with claimPrescriptionFollowUp's
// tests, the stub's $transaction simply invokes the callback with a
// recording tx object; real atomicity/rollback is Prisma/Postgres behavior.

const test = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const path = require('node:path');
const {
  createCompleteActivePrescription,
  createLoadActivePrescription,
  PrescriptionNotFoundError,
  PrescriptionMismatchError,
} = require('../src/services/coaching/completeActivePrescription');

const USER = 'user-1';

function activePrescription(overrides = {}) {
  return {
    id: 'presc-A',
    userId: USER,
    practiceKey: 'pressure_reset',
    status: 'ACTIVE',
    completedAt: null,
    ...overrides,
  };
}

function stateFor(prescriptionId, cycleStatus = 'ACTIVE') {
  return {
    userId: USER,
    activeSelection: {
      id: 'sel-A',
      prescriptionId,
      cycle: { id: 'cycle-A', status: cycleStatus },
    },
  };
}

// A single mutable "row" shared across the stub's methods so sequential /
// concurrent calls against the SAME makeDbStub() output observe each
// other's writes — same technique as claimPrescriptionFollowUp.test.js.
function makeDbStub({ prescriptionRow = null, state = null } = {}) {
  const writes = [];
  const row = prescriptionRow ? { ...prescriptionRow } : null;

  const tx = {
    prescription: {
      findUnique: async ({ where: { id } }) => (row && row.id === id ? { ...row } : null),
      updateMany: async ({ where, data }) => {
        writes.push({ op: 'prescription.updateMany', where, data });
        if (!row || row.id !== where.id) return { count: 0 };
        if (where.status !== undefined && row.status !== where.status) return { count: 0 };
        Object.assign(row, data);
        return { count: 1 };
      },
    },
    userCoachingState: {
      findUnique: async () => {
        if (!state) return null;
        return {
          ...state,
          activeSelection: state.activeSelection
            ? { ...state.activeSelection, cycle: state.activeSelection.cycle ? { ...state.activeSelection.cycle } : null }
            : null,
        };
      },
    },
  };

  return { writes, row, db: { $transaction: (fn) => fn(tx) } };
}

// ── Eligible completion ──────────────────────────────────────────────────

test('the exact active Prescription referenced by the current selection completes successfully; status becomes COMPLETED, completedAt is set once', async () => {
  const { db, writes } = makeDbStub({ prescriptionRow: activePrescription(), state: stateFor('presc-A') });
  const complete = createCompleteActivePrescription(db);

  const result = await complete({ userId: USER, prescriptionId: 'presc-A', practiceKey: 'pressure_reset' });

  assert.equal(result.completed, true);
  assert.equal(result.alreadyCompleted, false);
  assert.equal(result.prescription.status, 'COMPLETED');
  assert.ok(result.prescription.completedAt instanceof Date);

  const claimWrite = writes.find((w) => w.op === 'prescription.updateMany');
  assert.equal(claimWrite.where.id, 'presc-A');
  assert.equal(claimWrite.where.status, 'ACTIVE');
  assert.equal(claimWrite.data.status, 'COMPLETED');
});

test('completion never touches ActiveCoachingSelection or CoachingCycle — the selection stays linked and the cycle stays ACTIVE by construction (the stub has no create/update methods for either)', async () => {
  const { db } = makeDbStub({ prescriptionRow: activePrescription(), state: stateFor('presc-A') });
  const complete = createCompleteActivePrescription(db);
  // If the service tried to write activeCoachingSelection or coachingCycle,
  // this stub (which defines no such methods) would throw a TypeError and
  // the call would reject instead of resolving cleanly.
  await assert.doesNotReject(() => complete({ userId: USER, prescriptionId: 'presc-A', practiceKey: 'pressure_reset' }));
});

test('no new Prescription is created — only prescription.findUnique and prescription.updateMany are ever called', async () => {
  const { db, writes } = makeDbStub({ prescriptionRow: activePrescription(), state: stateFor('presc-A') });
  const complete = createCompleteActivePrescription(db);
  await complete({ userId: USER, prescriptionId: 'presc-A', practiceKey: 'pressure_reset' });
  assert.ok(writes.every((w) => w.op === 'prescription.updateMany'));
});

// ── Idempotency ──────────────────────────────────────────────────────────

test('a repeated completion request is idempotent: the second call returns alreadyCompleted:true with the SAME completedAt and makes no additional write', async () => {
  const { db, writes } = makeDbStub({ prescriptionRow: activePrescription(), state: stateFor('presc-A') });
  const complete = createCompleteActivePrescription(db);

  const first = await complete({ userId: USER, prescriptionId: 'presc-A', practiceKey: 'pressure_reset' });
  const second = await complete({ userId: USER, prescriptionId: 'presc-A', practiceKey: 'pressure_reset' });

  assert.equal(first.alreadyCompleted, false);
  assert.equal(second.alreadyCompleted, true);
  assert.equal(second.prescription.completedAt.getTime(), first.prescription.completedAt.getTime());

  const updateManyWrites = writes.filter((w) => w.op === 'prescription.updateMany');
  assert.equal(updateManyWrites.length, 1, 'the second call short-circuits on the already-COMPLETED check before ever reaching updateMany');
});

test('concurrent completion attempts preserve exactly one completedAt timestamp — one true winner, one settled read', async () => {
  const { db, writes } = makeDbStub({ prescriptionRow: activePrescription(), state: stateFor('presc-A') });
  const complete = createCompleteActivePrescription(db);

  const [a, b] = await Promise.all([
    complete({ userId: USER, prescriptionId: 'presc-A', practiceKey: 'pressure_reset' }),
    complete({ userId: USER, prescriptionId: 'presc-A', practiceKey: 'pressure_reset' }),
  ]);

  const winners = [a, b].filter((r) => !r.alreadyCompleted);
  const losers = [a, b].filter((r) => r.alreadyCompleted);
  assert.equal(winners.length, 1, 'exactly one request must be the true winner');
  assert.equal(losers.length, 1);
  assert.equal(a.prescription.completedAt.getTime(), b.prescription.completedAt.getTime(), 'both must observe the same settled completedAt');

  const updateManyWrites = writes.filter((w) => w.op === 'prescription.updateMany');
  assert.equal(updateManyWrites.length, 2, 'both requests attempt the conditional update; only one actually flips the row');
});

// ── Rejections ───────────────────────────────────────────────────────────

test('a practiceKey mismatch is rejected, with no write', async () => {
  const { db, writes } = makeDbStub({ prescriptionRow: activePrescription({ practiceKey: 'pressure_reset' }), state: stateFor('presc-A') });
  const complete = createCompleteActivePrescription(db);
  await assert.rejects(
    () => complete({ userId: USER, prescriptionId: 'presc-A', practiceKey: 'focus_cue_building' }),
    PrescriptionMismatchError
  );
  assert.equal(writes.length, 0);
});

test('a foreign Prescription id (belongs to another athlete) is rejected with the SAME error as a missing id — ownership is never disclosed', async () => {
  const { db, writes } = makeDbStub({ prescriptionRow: activePrescription({ userId: 'someone-else' }), state: stateFor('presc-A') });
  const complete = createCompleteActivePrescription(db);
  await assert.rejects(
    () => complete({ userId: USER, prescriptionId: 'presc-A', practiceKey: 'pressure_reset' }),
    PrescriptionNotFoundError
  );
  assert.equal(writes.length, 0);

  const { db: db2, writes: writes2 } = makeDbStub({ prescriptionRow: null, state: null });
  const complete2 = createCompleteActivePrescription(db2);
  await assert.rejects(
    () => complete2({ userId: USER, prescriptionId: 'does-not-exist', practiceKey: 'pressure_reset' }),
    PrescriptionNotFoundError
  );
  assert.equal(writes2.length, 0);
});

test('a Prescription that exists and belongs to the athlete, but is not referenced by their current active selection, is rejected', async () => {
  const { db, writes } = makeDbStub({ prescriptionRow: activePrescription({ id: 'presc-OLD' }), state: stateFor('presc-CURRENT') });
  const complete = createCompleteActivePrescription(db);
  await assert.rejects(
    () => complete({ userId: USER, prescriptionId: 'presc-OLD', practiceKey: 'pressure_reset' }),
    PrescriptionMismatchError
  );
  assert.equal(writes.length, 0);
});

test('no active selection at all returns no completion — rejected, never silently completed', async () => {
  const { db, writes } = makeDbStub({ prescriptionRow: activePrescription(), state: { userId: USER, activeSelection: null } });
  const complete = createCompleteActivePrescription(db);
  await assert.rejects(
    () => complete({ userId: USER, prescriptionId: 'presc-A', practiceKey: 'pressure_reset' }),
    PrescriptionMismatchError
  );
  assert.equal(writes.length, 0);
});

test('a selection without a Prescription yet is rejected', async () => {
  const { db, writes } = makeDbStub({
    prescriptionRow: activePrescription(),
    state: { userId: USER, activeSelection: { id: 'sel-A', prescriptionId: null, cycle: { status: 'ACTIVE' } } },
  });
  const complete = createCompleteActivePrescription(db);
  await assert.rejects(
    () => complete({ userId: USER, prescriptionId: 'presc-A', practiceKey: 'pressure_reset' }),
    PrescriptionMismatchError
  );
  assert.equal(writes.length, 0);
});

test('a non-ACTIVE selected cycle is rejected', async () => {
  const { db, writes } = makeDbStub({ prescriptionRow: activePrescription(), state: stateFor('presc-A', 'RESOLVED') });
  const complete = createCompleteActivePrescription(db);
  await assert.rejects(
    () => complete({ userId: USER, prescriptionId: 'presc-A', practiceKey: 'pressure_reset' }),
    PrescriptionMismatchError
  );
  assert.equal(writes.length, 0);
});

test('a SUPERSEDED Prescription cannot be completed', async () => {
  const { db, writes } = makeDbStub({ prescriptionRow: activePrescription({ status: 'SUPERSEDED' }), state: stateFor('presc-A') });
  const complete = createCompleteActivePrescription(db);
  await assert.rejects(
    () => complete({ userId: USER, prescriptionId: 'presc-A', practiceKey: 'pressure_reset' }),
    PrescriptionMismatchError
  );
  assert.equal(writes.length, 0);
});

test('an already-COMPLETED Prescription returns idempotent success with no write', async () => {
  const completedAt = new Date('2026-07-01T00:00:00Z');
  const { db, writes } = makeDbStub({ prescriptionRow: activePrescription({ status: 'COMPLETED', completedAt }), state: stateFor('presc-A') });
  const complete = createCompleteActivePrescription(db);

  const result = await complete({ userId: USER, prescriptionId: 'presc-A', practiceKey: 'pressure_reset' });

  assert.equal(result.completed, true);
  assert.equal(result.alreadyCompleted, true);
  assert.equal(result.prescription.completedAt.getTime(), completedAt.getTime());
  assert.equal(writes.length, 0);
});

test('malformed input (missing prescriptionId or practiceKey) is rejected before any database access', async () => {
  const { db, writes } = makeDbStub({ prescriptionRow: activePrescription(), state: stateFor('presc-A') });
  const complete = createCompleteActivePrescription(db);
  await assert.rejects(() => complete({ userId: USER, prescriptionId: '', practiceKey: 'pressure_reset' }), PrescriptionNotFoundError);
  await assert.rejects(() => complete({ userId: USER, prescriptionId: 'presc-A', practiceKey: '' }), PrescriptionMismatchError);
  assert.equal(writes.length, 0);
});

// ── loadActivePrescription: scoped strictly to the authenticated athlete ──

test('loadActivePrescription returns null when there is no active selection or no selected Prescription', async () => {
  const load1 = createLoadActivePrescription({ userCoachingState: { findUnique: async () => null } });
  assert.equal(await load1(USER), null);

  const load2 = createLoadActivePrescription({
    userCoachingState: { findUnique: async () => ({ userId: USER, activeSelection: { prescription: null } }) },
  });
  assert.equal(await load2(USER), null);
});

test('loadActivePrescription returns only the structured fields the client needs — never CoachingCycle internals, never raw ids beyond prescriptionId', async () => {
  const prescription = {
    id: 'presc-A',
    practiceKey: 'pressure_reset',
    situation: 'Free throws in the final quarter',
    cardContent: 'Card text',
    cueWord: 'Steady',
    status: 'ACTIVE',
    completedAt: null,
    cycleId: 'cycle-A', // present on the raw row — must NOT leak through
    userId: USER,        // present on the raw row — must NOT leak through
  };
  const db = {
    userCoachingState: {
      findUnique: async ({ where }) => {
        assert.equal(where.userId, USER, 'the lookup must be scoped to the requesting athlete');
        return { userId: USER, activeSelection: { prescription } };
      },
    },
  };
  const load = createLoadActivePrescription(db);
  const result = await load(USER);

  assert.deepEqual(Object.keys(result).sort(), ['cardContent', 'completedAt', 'cueWord', 'practiceKey', 'prescriptionId', 'situation', 'status'].sort());
  assert.equal(result.prescriptionId, 'presc-A');
  assert.equal(result.practiceKey, 'pressure_reset');
  assert.ok(!('cycleId' in result));
  assert.ok(!('userId' in result));
});

test('loadActivePrescription is scoped per-athlete: a different userId argument queries independently and never returns another athlete\'s row implicitly', async () => {
  const rows = {
    'athlete-1': { userId: 'athlete-1', activeSelection: { prescription: { id: 'presc-1', practiceKey: 'pressure_reset', situation: 's', cardContent: 'c', cueWord: null, status: 'ACTIVE', completedAt: null } } },
    'athlete-2': null,
  };
  const db = { userCoachingState: { findUnique: async ({ where }) => rows[where.userId] ?? null } };
  const load = createLoadActivePrescription(db);

  assert.equal((await load('athlete-1')).prescriptionId, 'presc-1');
  assert.equal(await load('athlete-2'), null);
});

// ── No Anthropic ──────────────────────────────────────────────────────────

test('the completion service never constructs or calls an Anthropic client', () => {
  const src = readFileSync(path.join(__dirname, '../src/services/coaching/completeActivePrescription.js'), 'utf8');
  assert.doesNotMatch(src, /require\(['"]@anthropic-ai\/sdk['"]\)|new Anthropic\(/, 'this module must never construct or call the Anthropic SDK');
});

// ── Legacy/generic completion never mutates Prescription ─────────────────

test('the generic Starter Plan session completion route never references Prescription', () => {
  const src = readFileSync(path.join(__dirname, '../src/routes/plan.js'), 'utf8');
  assert.doesNotMatch(src, /prescription/i, 'plan.js (PlanSession completion) must remain fully independent of Prescription');
});

test('the generic Mental Rep habit-log route never references Prescription', () => {
  const src = readFileSync(path.join(__dirname, '../src/routes/mentalRep.js'), 'utf8');
  assert.doesNotMatch(src, /prescription/i, 'the generic daily Mental Rep habit-log route must remain independent of coaching Prescriptions');
});
