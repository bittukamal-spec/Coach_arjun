// Behavioral tests for the weekly chat-cycle rollover
// (createArchiveCompletedWeekCycles in routes/sessions.js): at the
// Monday-00:00-UTC week boundary, main sessions from completed weeks are
// ARCHIVED — never deleted — their messages stay untouched, a fresh
// active cycle becomes available (because GET / excludes archived), and
// no coaching/prescription/journal/safety state is touched. Uses the
// injectable factory with a fully stubbed database and a pinned clock —
// no real DB, no network, no Anthropic.

const test = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const path = require('node:path');
const { createArchiveCompletedWeekCycles } = require('../src/routes/sessions');
const { getWeekStart } = require('../src/utils/weekBoundary');

// Pinned clock: Wednesday 15 July 2026, 10:00 UTC.
// Current coaching week started Monday 13 July 2026, 00:00 UTC.
const NOW = new Date('2026-07-15T10:00:00.000Z');
const WEEK_START = new Date('2026-07-13T00:00:00.000Z');

test('getWeekStart pins the boundary deterministically', () => {
  assert.equal(getWeekStart(NOW).toISOString(), WEEK_START.toISOString());
});

// ── In-memory ChatSession stub that honors the exact filters the rollover
// uses. Any access to any OTHER model (message, coachingCycle, …) throws —
// proving the rollover can never delete a message or touch coaching state.

function makeDb(sessions) {
  function matches(s, where) {
    if (where.userId !== undefined && s.userId !== where.userId) return false;
    if (where.mode !== undefined && s.mode !== where.mode) return false;
    if (where.status !== undefined) {
      if (typeof where.status === 'string') {
        if (s.status !== where.status) return false;
      } else if (where.status.not !== undefined && s.status === where.status.not) return false;
    }
    if (where.createdAt?.lt !== undefined && !(s.createdAt < where.createdAt.lt)) return false;
    if (where.endedAt === null && s.endedAt !== null) return false;
    return true;
  }
  const db = {
    chatSession: {
      updateMany: async ({ where, data }) => {
        const hit = sessions.filter(s => matches(s, where));
        for (const s of hit) Object.assign(s, data);
        return { count: hit.length };
      },
    },
  };
  // Everything that is not chatSession throws on ANY property access:
  // deleting messages, or touching CoachingCycle / Prescription /
  // UserCoachingState / MindJournalEntry / SafetyEvent / User (consent),
  // would blow the test up immediately.
  return new Proxy(db, {
    get(target, prop) {
      if (prop in target) return target[prop];
      if (typeof prop === 'symbol' || prop === 'then') return undefined;
      throw new Error(`rollover must not touch db.${String(prop)}`);
    },
  });
}

function session(overrides) {
  return {
    id: 'cs-' + Math.random().toString(36).slice(2, 8),
    userId: 'user-1',
    mode: 'main',
    status: 'active',
    createdAt: new Date('2026-07-08T09:00:00.000Z'), // last week
    endedAt: null,
    ...overrides,
  };
}

test('a main session from a completed week is archived — not deleted — and stamped endedAt', async () => {
  const s = session();
  const rollover = createArchiveCompletedWeekCycles({ db: makeDb([s]), now: () => NOW });
  const count = await rollover('user-1');
  assert.equal(count, 1);
  assert.equal(s.status, 'archived');
  assert.deepEqual(s.endedAt, NOW);
});

test('an already-ended session keeps its historical endedAt when archived', async () => {
  const endedAt = new Date('2026-07-09T00:00:00.000Z');
  const s = session({ status: 'ended', endedAt });
  const rollover = createArchiveCompletedWeekCycles({ db: makeDb([s]), now: () => NOW });
  await rollover('user-1');
  assert.equal(s.status, 'archived');
  assert.equal(s.endedAt, endedAt, 'historical endedAt must never be overwritten');
});

test('the current week\'s session is left alone — the boundary is exclusive', async () => {
  const thisWeek = session({ createdAt: new Date('2026-07-13T08:00:00.000Z') });
  const exactlyBoundary = session({ createdAt: WEEK_START });
  const rollover = createArchiveCompletedWeekCycles({ db: makeDb([thisWeek, exactlyBoundary]), now: () => NOW });
  const count = await rollover('user-1');
  assert.equal(count, 0, 'no session at/after the week start may be archived');
  assert.equal(thisWeek.status, 'active');
  assert.equal(exactlyBoundary.status, 'active');
});

test('idempotent across tabs/retries: a second run archives nothing', async () => {
  const s = session();
  const db = makeDb([s]);
  const rollover = createArchiveCompletedWeekCycles({ db, now: () => NOW });
  assert.equal(await rollover('user-1'), 1);
  assert.equal(await rollover('user-1'), 0, 'already-archived cycles must not match again');
  assert.equal(s.status, 'archived');
});

test('quick-chat sessions are never part of a weekly cycle', async () => {
  const quick = session({ mode: 'quick' });
  const rollover = createArchiveCompletedWeekCycles({ db: makeDb([quick]), now: () => NOW });
  assert.equal(await rollover('user-1'), 0);
  assert.equal(quick.status, 'active');
});

test('user-scoped: only the calling user\'s sessions are archived', async () => {
  const mine = session();
  const theirs = session({ userId: 'user-2' });
  const rollover = createArchiveCompletedWeekCycles({ db: makeDb([mine, theirs]), now: () => NOW });
  await rollover('user-1');
  assert.equal(mine.status, 'archived');
  assert.equal(theirs.status, 'active', 'another user\'s cycle must never be touched');
});

test('the rollover touches ONLY ChatSession — messages, coaching, prescriptions, journal, safety and consent state are unreachable', async () => {
  // makeDb's proxy throws on any non-chatSession model access; a clean run
  // IS the proof. Belt-and-braces: the source must contain no reference to
  // any other model or to a delete of any kind.
  const rollover = createArchiveCompletedWeekCycles({ db: makeDb([session()]), now: () => NOW });
  await assert.doesNotReject(() => rollover('user-1'));

  const src = readFileSync(path.join(__dirname, '../src/routes/sessions.js'), 'utf8');
  const start = src.indexOf('function createArchiveCompletedWeekCycles');
  const end = src.indexOf('const archiveCompletedWeekCycles =');
  const fnSrc = src.slice(start, end);
  assert.ok(start !== -1 && end > start);
  assert.doesNotMatch(fnSrc, /message\.|deleteMany|\.delete\(/, 'the rollover must never delete anything or touch Message rows');
  assert.doesNotMatch(fnSrc, /coachingCycle|prescription|userCoachingState|mindJournal|safetyEvent|toolReport|user\.update/i);
});

// ── Route wiring (source-level): GET / runs the rollover first and the
// listing exposes only the current, non-archived cycle. ────────────────────

test('GET /api/sessions: rollover runs before the listing, and archived cycles are excluded from it', () => {
  const src = readFileSync(path.join(__dirname, '../src/routes/sessions.js'), 'utf8');
  const getRoute = src.slice(src.indexOf("router.get('/'"), src.indexOf("router.post('/'"));
  const rolloverIdx = getRoute.indexOf('archiveCompletedWeekCycles(req.userId)');
  const listIdx = getRoute.indexOf('findMany');
  assert.ok(rolloverIdx !== -1, 'GET / must run the weekly rollover');
  assert.ok(listIdx !== -1 && rolloverIdx < listIdx, 'rollover must run before the session listing');
  assert.match(getRoute, /status: \{ not: 'archived' \}/, 'archived cycles must not be offered back to the chat client');
});

test('end-stale still only ends ACTIVE sessions — it never resurrects or re-touches archived cycles', () => {
  const src = readFileSync(path.join(__dirname, '../src/routes/sessions.js'), 'utf8');
  const endStale = src.slice(src.indexOf("router.post('/end-stale'"), src.indexOf("router.get('/:id/messages'"));
  assert.match(endStale, /status: 'active'/);
});
