// Coaching continuity across the seven-day chat-cycle rollover: archiving
// a completed cycle must leave the coaching layer fully working in the
// fresh cycle. These tests exercise the REAL services (rollover, opener
// claim, outcome commit) against stubbed databases: an active
// prescription stays active, an unclaimed deterministic follow-up opener
// is claimed into the NEW session, an already-claimed opener is never
// duplicated, outcome recording still links to the correct prescription,
// and coaching cycle + barrier state survive untouched.

const test = require('node:test');
const assert = require('node:assert/strict');
const { createArchiveCompletedCycles } = require('../src/routes/sessions');
const { createClaimPrescriptionFollowUp } = require('../src/services/coaching/claimPrescriptionFollowUp');
const { createCommitCoachingTransition } = require('../src/services/coaching/commitCoachingTransition');

const NOW = new Date('2026-07-20T09:00:00.000Z');
const EIGHT_DAYS_AGO = new Date(NOW.getTime() - 8 * 24 * 60 * 60 * 1000);

// ── Shared fixture: one athlete mid-coaching-loop when the cycle rolls ─────
// The OLD session started >7 days ago; coaching state points at an ACTIVE
// cycle with a confirmed barrier and an ACTIVE prescription whose
// follow-up opener has not been claimed yet.

function makeCoachingFixture({ openerClaimed = false } = {}) {
  const oldSession = {
    id: 'cs-old', userId: 'user-1', mode: 'main', status: 'active',
    createdAt: EIGHT_DAYS_AGO, endedAt: null,
  };
  const newSession = {
    id: 'cs-new', userId: 'user-1', mode: 'main', status: 'active',
    createdAt: NOW, endedAt: null,
  };
  const prescriptionRow = {
    id: 'presc-A', userId: 'user-1', cycleId: 'cycle-A',
    practiceKey: 'pressure_reset',
    situation: 'the last over of a tight chase',
    cardContent: 'Reset: breath, spot, cue.',
    cueWord: 'Steady',
    status: 'ACTIVE',
    outcomeStatus: null,
    completedAt: null,
    followUpOpenerClaimedAt: openerClaimed ? new Date('2026-07-14T10:00:00.000Z') : null,
    followUpOpenerSessionId: openerClaimed ? 'cs-old' : null,
    followUpOpenerMessageId: openerClaimed ? 'msg-old-opener' : null,
  };
  const cycleRow = {
    id: 'cycle-A', userId: 'user-1', status: 'ACTIVE',
    barrierHypothesis: 'Fear of failure under expectations',
    barrierConfirmationStatus: 'CONFIRMED',
  };
  const state = {
    id: 'state-A', userId: 'user-1',
    activeSelection: {
      id: 'sel-A', userCoachingStateId: 'state-A', userId: 'user-1',
      cycleId: 'cycle-A', prescriptionId: 'presc-A',
      cycle: cycleRow,
      prescription: prescriptionRow,
    },
  };
  return { oldSession, newSession, prescriptionRow, cycleRow, state };
}

// Rollover db stub: chat sessions only; the coaching rows sit alongside so
// we can prove — by value — that the rollover leaves them byte-identical.
function makeRolloverDb(sessions) {
  function matches(s, where) {
    if (where.userId !== undefined && s.userId !== where.userId) return false;
    if (where.mode !== undefined && s.mode !== where.mode) return false;
    if (where.id?.in !== undefined && !where.id.in.includes(s.id)) return false;
    if (where.status?.not !== undefined && s.status === where.status.not) return false;
    if (where.createdAt?.lte !== undefined && !(s.createdAt <= where.createdAt.lte)) return false;
    return true;
  }
  return {
    chatSession: {
      findMany: async ({ where, select }) => sessions
        .filter(s => matches(s, where))
        .map(s => Object.fromEntries(Object.keys(select).map(k => [k, s[k]]))),
      updateMany: async ({ where, data }) => {
        const hit = sessions.filter(s => matches(s, where));
        for (const s of hit) Object.assign(s, data);
        return { count: hit.length };
      },
    },
  };
}

// Claim/commit db stub over the SAME live fixture rows, mirroring the
// pattern in claimPrescriptionFollowUp.test.js / coachingCommit.test.js.
function makeCoachingDb(fixture) {
  const writes = [];
  let msgSeq = 0;
  const sessionsById = { [fixture.oldSession.id]: fixture.oldSession, [fixture.newSession.id]: fixture.newSession };
  const tx = {
    chatSession: {
      findUnique: async ({ where }) => sessionsById[where.id] || null,
    },
    userCoachingState: {
      findUnique: async () => ({
        ...fixture.state,
        activeSelection: {
          ...fixture.state.activeSelection,
          cycle: { ...fixture.cycleRow },
          prescription: { ...fixture.prescriptionRow },
        },
      }),
    },
    prescription: {
      updateMany: async ({ where, data }) => {
        writes.push({ op: 'prescription.updateMany', where, data });
        const p = fixture.prescriptionRow;
        if (p.id !== where.id) return { count: 0 };
        if ('followUpOpenerClaimedAt' in where && p.followUpOpenerClaimedAt !== where.followUpOpenerClaimedAt) return { count: 0 };
        if (where.OR && !where.OR.some(cond => p.outcomeStatus === cond.outcomeStatus)) return { count: 0 };
        Object.assign(p, data);
        return { count: 1 };
      },
      update: async ({ where, data }) => {
        writes.push({ op: 'prescription.update', where, data });
        Object.assign(fixture.prescriptionRow, data);
        return { ...fixture.prescriptionRow };
      },
    },
    coachingCycle: {
      update: async (args) => {
        writes.push({ op: 'coachingCycle.update', ...args });
        Object.assign(fixture.cycleRow, args.data);
        return { ...fixture.cycleRow };
      },
    },
    activeCoachingSelection: {
      update: async (args) => { writes.push({ op: 'selection.update', ...args }); return args; },
      delete: async (args) => { writes.push({ op: 'selection.delete', ...args }); return args; },
    },
    message: {
      create: async ({ data }) => {
        const row = { id: `msg-new-${++msgSeq}`, createdAt: NOW, ...data };
        writes.push({ op: 'message.create', data: row });
        return row;
      },
    },
  };
  return { writes, db: { $transaction: (fn) => fn(tx) } };
}

async function rollOver(fixture) {
  const rollover = createArchiveCompletedCycles({
    db: makeRolloverDb([fixture.oldSession, fixture.newSession]),
    now: () => NOW,
  });
  return rollover('user-1');
}

// ── 1 & 5: prescription, cycle and barrier state survive the rollover ──────

test('an active prescription, coaching cycle, and barrier state are byte-identical after rollover', async () => {
  const fixture = makeCoachingFixture();
  const prescriptionBefore = JSON.stringify(fixture.prescriptionRow);
  const cycleBefore = JSON.stringify(fixture.cycleRow);
  const stateBefore = JSON.stringify(fixture.state);

  const completed = await rollOver(fixture);

  assert.equal(completed.length, 1, 'the old cycle rolled over');
  assert.equal(fixture.oldSession.status, 'archived');
  assert.equal(fixture.newSession.status, 'active', 'the fresh cycle is available');
  assert.equal(JSON.stringify(fixture.prescriptionRow), prescriptionBefore, 'prescription untouched — still ACTIVE, opener unclaimed');
  assert.equal(JSON.stringify(fixture.cycleRow), cycleBefore, 'coaching cycle + barrier hypothesis/confirmation untouched');
  assert.equal(JSON.stringify(fixture.state), stateBefore, 'active selection untouched');
});

// ── 2: unclaimed opener is claimed into the NEW cycle ──────────────────────

test('after rollover, entering the fresh cycle claims the deterministic follow-up opener INTO the new session', async () => {
  const fixture = makeCoachingFixture();
  await rollOver(fixture);

  const { writes, db } = makeCoachingDb(fixture);
  const claim = createClaimPrescriptionFollowUp(db);
  const result = await claim({ userId: 'user-1', chatSessionId: 'cs-new', language: 'en' });

  assert.equal(result.claimed, true);
  assert.match(result.message.content, /Last time you planned to try/);
  assert.match(result.message.content, /the last over of a tight chase/);
  const msgWrite = writes.find(w => w.op === 'message.create');
  assert.equal(msgWrite.data.chatSessionId, 'cs-new', 'the opener is persisted in the NEW active cycle, not the archived one');
  assert.equal(fixture.prescriptionRow.followUpOpenerSessionId, 'cs-new');
  assert.equal(fixture.prescriptionRow.followUpOpenerMessageId, result.message.id);
  // And the athlete gets the deterministic outcome chips to answer with.
  assert.equal(result.outcomePending, true);
  assert.ok(Array.isArray(result.outcomeChoices) && result.outcomeChoices.length === 4);
});

// ── 3: an already-claimed opener is never duplicated in the new cycle ──────

test('an opener already claimed in the OLD cycle is not re-posted after rollover — no duplicate message', async () => {
  const fixture = makeCoachingFixture({ openerClaimed: true });
  await rollOver(fixture);

  const { writes, db } = makeCoachingDb(fixture);
  const claim = createClaimPrescriptionFollowUp(db);
  const result = await claim({ userId: 'user-1', chatSessionId: 'cs-new', language: 'en' });

  assert.equal(result.claimed, false);
  assert.equal(writes.filter(w => w.op === 'message.create').length, 0, 'no second opener message may ever be written');
  assert.equal(fixture.prescriptionRow.followUpOpenerSessionId, 'cs-old', 'the original claim record is untouched');
  assert.equal(fixture.prescriptionRow.followUpOpenerMessageId, 'msg-old-opener');
  // The still-pending outcome is re-offered without a new opener.
  assert.equal(result.outcomePending, true);
});

// ── 4: outcome recording still links to the correct prescription ───────────

test('recording an outcome in the fresh cycle links to the SAME prescription, with the new session/message as source', async () => {
  const fixture = makeCoachingFixture();
  await rollOver(fixture);

  // Opener claimed on entry into the new cycle…
  const claimDb = makeCoachingDb(fixture);
  await createClaimPrescriptionFollowUp(claimDb.db)({ userId: 'user-1', chatSessionId: 'cs-new', language: 'en' });

  // …then the athlete's reply records the outcome through the real commit.
  const commitDb = makeCoachingDb(fixture);
  const commit = createCommitCoachingTransition(commitDb.db);
  const lessonText = 'The breath-and-cue reset held up in the last over.';
  await commit({
    userId: 'user-1',
    chatSessionId: 'cs-new',
    sessionType: null,
    finalText: `Love that. ${lessonText}`,
    transition: { type: 'record_prescription_outcome', outcomeStatus: 'HELPED', lessonText },
    userMessageId: 'msg-user-42',
  });

  assert.equal(fixture.prescriptionRow.id, 'presc-A');
  assert.equal(fixture.prescriptionRow.outcomeStatus, 'HELPED', 'outcome landed on the exact prescription from before the rollover');
  assert.equal(fixture.prescriptionRow.outcomeLesson, lessonText);
  assert.equal(fixture.prescriptionRow.outcomeSourceSessionId, 'cs-new', 'sourced from the new cycle');
  assert.equal(fixture.prescriptionRow.outcomeSourceMessageId, 'msg-user-42');
  assert.equal(fixture.prescriptionRow.status, 'COMPLETED');
});
