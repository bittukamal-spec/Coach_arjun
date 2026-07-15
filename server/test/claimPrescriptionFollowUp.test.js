// Behavioral tests for the deterministic next-open prescription follow-up
// (PR-11), using a stubbed Prisma client — no database. As with
// coachingCommit.test.js, the stub's $transaction simply invokes the
// callback with a recording tx object; real atomicity/rollback is
// Prisma/Postgres behavior. What these tests prove is ordering: the claim
// update runs before the message create, which runs before the id-linking
// update — so a thrown failure at any step means every write after it in
// that order never happened (and, under a real transaction, everything
// before it rolls back too).

const test = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const path = require('node:path');
const {
  createClaimPrescriptionFollowUp,
  InvalidChatSessionError,
  buildFollowUpOpener,
  buildOutcomeChoices,
} = require('../src/services/coaching/claimPrescriptionFollowUp');

function makeDbStub({ session = null, state = null, failAt = null } = {}) {
  const writes = [];
  let idCounter = 0;
  const nextId = (p) => `${p}-${++idCounter}`;

  // A single mutable prescription "row" shared across the stub's methods so
  // sequential calls against the SAME makeDbStub() output can simulate two
  // requests racing for the same atomic claim.
  const prescriptionRow = state?.activeSelection?.prescription
    ? { ...state.activeSelection.prescription }
    : null;

  const tx = {
    chatSession: {
      findUnique: async () => session,
    },
    userCoachingState: {
      findUnique: async () => {
        if (!state) return null;
        return {
          ...state,
          activeSelection: state.activeSelection
            ? { ...state.activeSelection, prescription: prescriptionRow ? { ...prescriptionRow } : null }
            : null,
        };
      },
    },
    prescription: {
      updateMany: async ({ where, data }) => {
        writes.push({ op: 'prescription.updateMany', where, data });
        if (!prescriptionRow || prescriptionRow.id !== where.id) return { count: 0 };
        if (prescriptionRow.followUpOpenerClaimedAt !== null) return { count: 0 };
        if (failAt === 'updateMany') throw new Error('claim updateMany failed');
        Object.assign(prescriptionRow, data);
        return { count: 1 };
      },
      update: async ({ where, data }) => {
        if (failAt === 'update') throw new Error('prescription id-link update failed');
        writes.push({ op: 'prescription.update', where, data });
        Object.assign(prescriptionRow, data);
        return { ...prescriptionRow };
      },
    },
    message: {
      create: async ({ data }) => {
        if (failAt === 'message') throw new Error('message create failed');
        const row = { id: nextId('msg'), createdAt: new Date('2026-07-14T10:00:00Z'), ...data };
        writes.push({ op: 'message.create', data });
        return row;
      },
    },
  };

  return { writes, prescriptionRow, db: { $transaction: (fn) => fn(tx) } };
}

const MAIN_SESSION = { userId: 'user-1', mode: 'main' };

function activePrescriptionState(overrides = {}) {
  return {
    userId: 'user-1',
    activeSelection: {
      id: 'sel-A',
      prescriptionId: 'presc-A',
      prescription: {
        id: 'presc-A',
        userId: 'user-1',
        practiceKey: 'pressure_reset',
        situation: 'Free throws in the final quarter',
        status: 'ACTIVE',
        followUpOpenerClaimedAt: null,
        followUpOpenerMessageId: null,
        ...overrides,
      },
    },
  };
}

// ── Eligible claim ────────────────────────────────────────────────────────

test('eligible active prescription creates exactly one deterministic opener, no Anthropic call', async () => {
  const { db, writes } = makeDbStub({ session: MAIN_SESSION, state: activePrescriptionState() });
  const claim = createClaimPrescriptionFollowUp(db);

  const result = await claim({ userId: 'user-1', chatSessionId: 'cs-1', language: 'en' });

  assert.equal(result.claimed, true);
  assert.equal(result.message.content, 'Last time you planned to try Pressure Reset in Free throws in the final quarter. How did it go?');
  const ops = writes.map((w) => w.op);
  assert.deepEqual(ops, ['prescription.updateMany', 'message.create', 'prescription.update']);
});

test('a brand-new claim also returns outcomePending:true and the four deterministic outcome choices', async () => {
  const { db } = makeDbStub({ session: MAIN_SESSION, state: activePrescriptionState() });
  const claim = createClaimPrescriptionFollowUp(db);
  const result = await claim({ userId: 'user-1', chatSessionId: 'cs-1', language: 'en' });

  assert.equal(result.outcomePending, true);
  assert.equal(result.outcomeChoices.length, 4);
  assert.deepEqual(result.outcomeChoices.map((c) => c.id), ['helped', 'helped_a_little', 'did_not_help', 'not_tried']);
});

test('opener uses the registry practice label and the exact persisted situation', () => {
  const text = buildFollowUpOpener({ practiceKey: 'focus_cue_building', situation: 'Penalty spot before a shootout', language: 'en' });
  assert.equal(text, 'Last time you planned to try Focus cue building (Focus Card) in Penalty spot before a shootout. How did it go?');
});

test('an unknown/legacy practice key uses the neutral fallback phrase, never fails or invents a label', () => {
  const en = buildFollowUpOpener({ practiceKey: 'retired_practice_key', situation: 'Match point', language: 'en' });
  assert.equal(en, 'Last time you planned to try your Mental Rep in Match point. How did it go?');
  const hi = buildFollowUpOpener({ practiceKey: 'retired_practice_key', situation: 'Match point', language: 'hi' });
  assert.match(hi, /आपका Mental Rep/);
});

test('English and Hindi templates both work and differ', () => {
  const en = buildFollowUpOpener({ practiceKey: 'pressure_reset', situation: 'Free kicks', language: 'en' });
  const hi = buildFollowUpOpener({ practiceKey: 'pressure_reset', situation: 'Free kicks', language: 'hi' });
  assert.match(en, /^Last time you planned to try Pressure Reset in Free kicks\. How did it go\?$/);
  assert.match(hi, /पिछली बार तुमने Free kicks में Pressure Reset करने का प्लान बनाया था। कैसा रहा\?/);
  assert.notEqual(en, hi);
});

test('persisted message content equals the returned content, byte-for-byte', async () => {
  const { db, writes } = makeDbStub({ session: MAIN_SESSION, state: activePrescriptionState() });
  const claim = createClaimPrescriptionFollowUp(db);
  const result = await claim({ userId: 'user-1', chatSessionId: 'cs-1', language: 'en' });

  const messageWrite = writes.find((w) => w.op === 'message.create');
  assert.equal(messageWrite.data.content, result.message.content);
});

test('claim timestamp and the real created Message id are stored on the Prescription', async () => {
  const { db, writes, prescriptionRow } = makeDbStub({ session: MAIN_SESSION, state: activePrescriptionState() });
  const claim = createClaimPrescriptionFollowUp(db);
  const result = await claim({ userId: 'user-1', chatSessionId: 'cs-1', language: 'en' });

  const claimWrite = writes.find((w) => w.op === 'prescription.updateMany');
  assert.ok(claimWrite.data.followUpOpenerClaimedAt instanceof Date);

  const linkWrite = writes.find((w) => w.op === 'prescription.update');
  assert.equal(linkWrite.data.followUpOpenerMessageId, result.message.id);
  assert.equal(prescriptionRow.followUpOpenerMessageId, result.message.id, 'the real persisted message id, never an invented one');
});

// ── Once-only claim ───────────────────────────────────────────────────────

test('a second claim attempt (already claimed, outcome still unanswered) returns claimed:false but still offers the deterministic outcome choices again, and writes nothing', async () => {
  const { db, writes } = makeDbStub({
    session: MAIN_SESSION,
    state: activePrescriptionState({ followUpOpenerClaimedAt: new Date('2026-07-01T00:00:00Z'), followUpOpenerMessageId: 'msg-existing' }),
  });
  const claim = createClaimPrescriptionFollowUp(db);

  const result = await claim({ userId: 'user-1', chatSessionId: 'cs-1', language: 'en' });

  assert.equal(result.claimed, false);
  assert.equal(result.outcomePending, true);
  assert.deepEqual(result.outcomeChoices, buildOutcomeChoices('en'));
  assert.equal(writes.length, 1, 'only the failed conditional updateMany attempt, no message/link write');
  assert.equal(writes[0].op, 'prescription.updateMany');
});

test('a second claim attempt after a FINAL outcome was already recorded returns bare claimed:false — no outcome choices', async () => {
  const { db, writes } = makeDbStub({
    session: MAIN_SESSION,
    state: activePrescriptionState({
      followUpOpenerClaimedAt: new Date('2026-07-01T00:00:00Z'),
      followUpOpenerMessageId: 'msg-existing',
      outcomeStatus: 'HELPED_A_LITTLE',
    }),
  });
  const claim = createClaimPrescriptionFollowUp(db);

  const result = await claim({ userId: 'user-1', chatSessionId: 'cs-1', language: 'en' });

  assert.deepEqual(result, { claimed: false });
  assert.equal(writes.length, 1);
});

test('a second claim attempt while the outcome is NOT_TRIED still offers the choices again (NOT_TRIED is replaceable, not final)', async () => {
  const { db } = makeDbStub({
    session: MAIN_SESSION,
    state: activePrescriptionState({
      followUpOpenerClaimedAt: new Date('2026-07-01T00:00:00Z'),
      followUpOpenerMessageId: 'msg-existing',
      outcomeStatus: 'NOT_TRIED',
    }),
  });
  const claim = createClaimPrescriptionFollowUp(db);

  const result = await claim({ userId: 'user-1', chatSessionId: 'cs-1', language: 'en' });

  assert.equal(result.claimed, false);
  assert.equal(result.outcomePending, true);
  assert.ok(Array.isArray(result.outcomeChoices));
});

test('simulated competing claims (two sequential calls against the same stub state): exactly one Message is created', async () => {
  const { db, writes } = makeDbStub({ session: MAIN_SESSION, state: activePrescriptionState() });
  const claim = createClaimPrescriptionFollowUp(db);

  const [first, second] = await Promise.all([
    claim({ userId: 'user-1', chatSessionId: 'cs-1', language: 'en' }),
    claim({ userId: 'user-1', chatSessionId: 'cs-1', language: 'en' }),
  ]);

  const winners = [first, second].filter((r) => r.claimed);
  const losers = [first, second].filter((r) => !r.claimed);
  assert.equal(winners.length, 1, 'exactly one request must win');
  assert.equal(losers.length, 1);
  assert.equal(losers[0].claimed, false);
  // The loser still sees the outcome as pending (nothing has been answered
  // yet) and gets the same deterministic choices as the winner.
  assert.equal(losers[0].outcomePending, true);
  assert.ok(Array.isArray(losers[0].outcomeChoices));

  const messageWrites = writes.filter((w) => w.op === 'message.create');
  assert.equal(messageWrites.length, 1, 'no duplicate assistant messages remain');
});

// ── Session validation ────────────────────────────────────────────────────

test('a foreign chat session (belongs to another athlete) is rejected before any write', async () => {
  const { db, writes } = makeDbStub({ session: { userId: 'someone-else', mode: 'main' }, state: activePrescriptionState() });
  const claim = createClaimPrescriptionFollowUp(db);
  await assert.rejects(
    () => claim({ userId: 'user-1', chatSessionId: 'cs-1', language: 'en' }),
    InvalidChatSessionError
  );
  assert.equal(writes.length, 0);
});

test('a non-main (quick) chat session is rejected before any write', async () => {
  const { db, writes } = makeDbStub({ session: { userId: 'user-1', mode: 'quick' }, state: activePrescriptionState() });
  const claim = createClaimPrescriptionFollowUp(db);
  await assert.rejects(
    () => claim({ userId: 'user-1', chatSessionId: 'cs-1', language: 'en' }),
    InvalidChatSessionError
  );
  assert.equal(writes.length, 0);
});

test('a non-existent chat session is rejected before any write', async () => {
  const { db, writes } = makeDbStub({ session: null, state: activePrescriptionState() });
  const claim = createClaimPrescriptionFollowUp(db);
  await assert.rejects(
    () => claim({ userId: 'user-1', chatSessionId: 'cs-missing', language: 'en' }),
    InvalidChatSessionError
  );
  assert.equal(writes.length, 0);
});

test('a malformed/missing chatSessionId is rejected before touching the database at all', async () => {
  const { db, writes } = makeDbStub({ session: MAIN_SESSION, state: activePrescriptionState() });
  const claim = createClaimPrescriptionFollowUp(db);
  await assert.rejects(() => claim({ userId: 'user-1', chatSessionId: '', language: 'en' }), InvalidChatSessionError);
  await assert.rejects(() => claim({ userId: 'user-1', chatSessionId: null, language: 'en' }), InvalidChatSessionError);
  assert.equal(writes.length, 0);
});

// ── Eligibility gates ──────────────────────────────────────────────────────

test('no coaching state at all returns claimed:false', async () => {
  const { db, writes } = makeDbStub({ session: MAIN_SESSION, state: null });
  const claim = createClaimPrescriptionFollowUp(db);
  assert.deepEqual(await claim({ userId: 'user-1', chatSessionId: 'cs-1', language: 'en' }), { claimed: false });
  assert.equal(writes.length, 0);
});

test('no active selection returns claimed:false', async () => {
  const { db, writes } = makeDbStub({ session: MAIN_SESSION, state: { userId: 'user-1', activeSelection: null } });
  const claim = createClaimPrescriptionFollowUp(db);
  assert.deepEqual(await claim({ userId: 'user-1', chatSessionId: 'cs-1', language: 'en' }), { claimed: false });
  assert.equal(writes.length, 0);
});

test('a selection with no prescription returns claimed:false', async () => {
  const { db, writes } = makeDbStub({
    session: MAIN_SESSION,
    state: { userId: 'user-1', activeSelection: { id: 'sel-A', prescriptionId: null, prescription: null } },
  });
  const claim = createClaimPrescriptionFollowUp(db);
  assert.deepEqual(await claim({ userId: 'user-1', chatSessionId: 'cs-1', language: 'en' }), { claimed: false });
  assert.equal(writes.length, 0);
});

test('a non-ACTIVE (completed/superseded) prescription returns claimed:false', async () => {
  for (const status of ['COMPLETED', 'SUPERSEDED']) {
    const { db, writes } = makeDbStub({ session: MAIN_SESSION, state: activePrescriptionState({ status }) });
    const claim = createClaimPrescriptionFollowUp(db);
    assert.deepEqual(await claim({ userId: 'user-1', chatSessionId: 'cs-1', language: 'en' }), { claimed: false }, `status ${status}`);
    assert.equal(writes.length, 0, `status ${status} must write nothing`);
  }
});

// ── Failure ordering (rollback is a real-transaction guarantee; here we
// prove the write ORDER, matching coachingCommit.test.js's own convention).

test('a message-create failure means the claim write happened but nothing after it did — under a real transaction this rolls the claim back too', async () => {
  const { db, writes } = makeDbStub({ session: MAIN_SESSION, state: activePrescriptionState(), failAt: 'message' });
  const claim = createClaimPrescriptionFollowUp(db);
  await assert.rejects(() => claim({ userId: 'user-1', chatSessionId: 'cs-1', language: 'en' }), /message create failed/);
  const ops = writes.map((w) => w.op);
  assert.deepEqual(ops, ['prescription.updateMany'], 'no message and no id-link write must follow a failed message create');
});

test('a prescription id-link update failure happens after the message create — under a real transaction this rolls the message back too', async () => {
  const { db, writes } = makeDbStub({ session: MAIN_SESSION, state: activePrescriptionState(), failAt: 'update' });
  const claim = createClaimPrescriptionFollowUp(db);
  await assert.rejects(() => claim({ userId: 'user-1', chatSessionId: 'cs-1', language: 'en' }), /prescription id-link update failed/);
  const ops = writes.map((w) => w.op);
  assert.deepEqual(ops, ['prescription.updateMany', 'message.create'], 'the id-link write itself must be the one that failed, recording nothing after it');
});

// ── No Anthropic, no coaching-cycle mutation ─────────────────────────────

test('the claim service never constructs or calls an Anthropic client', () => {
  const src = readFileSync(
    path.join(__dirname, '../src/services/coaching/claimPrescriptionFollowUp.js'),
    'utf8'
  );
  assert.doesNotMatch(src, /require\(['"]@anthropic-ai\/sdk['"]\)|new Anthropic\(/, 'this module must never construct or call the Anthropic SDK');
});

test('a successful claim never touches coachingCycle or activeCoachingSelection — the cycle is never resolved or abandoned', async () => {
  const { db, writes } = makeDbStub({ session: MAIN_SESSION, state: activePrescriptionState() });
  const claim = createClaimPrescriptionFollowUp(db);
  await claim({ userId: 'user-1', chatSessionId: 'cs-1', language: 'en' });
  assert.ok(!writes.some((w) => w.op.startsWith('coachingCycle')), 'no coachingCycle write of any kind');
  assert.ok(!writes.some((w) => w.op.startsWith('activeCoachingSelection')), 'no activeCoachingSelection write of any kind');
});

// ── Deterministic outcome follow-up choices (PR-13, section B) ───────────

test('buildOutcomeChoices: exactly four deterministic English choices with the required ids', () => {
  const choices = buildOutcomeChoices('en');
  assert.deepEqual(choices, [
    { id: 'helped', label: 'It helped' },
    { id: 'helped_a_little', label: 'It helped a little' },
    { id: 'did_not_help', label: 'It did not help' },
    { id: 'not_tried', label: 'I did not try it' },
  ]);
});

test('buildOutcomeChoices: exactly four deterministic Hindi choices with the same ids, differing labels', () => {
  const en = buildOutcomeChoices('en');
  const hi = buildOutcomeChoices('hi');
  assert.deepEqual(hi.map((c) => c.id), en.map((c) => c.id));
  for (let i = 0; i < en.length; i++) {
    assert.notEqual(en[i].label, hi[i].label);
    assert.ok(hi[i].label.length > 0);
  }
});

test('buildOutcomeChoices: is a pure deterministic function — same language always yields the same choices', () => {
  assert.deepEqual(buildOutcomeChoices('en'), buildOutcomeChoices('en'));
  assert.deepEqual(buildOutcomeChoices('hi'), buildOutcomeChoices('hi'));
});
