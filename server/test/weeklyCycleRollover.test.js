// Behavioral tests for the seven-day chat-cycle rollover
// (createArchiveCompletedCycles in routes/sessions.js): a cycle lasts
// exactly seven days from its own main ChatSession's createdAt — never a
// calendar boundary — and at completion the session is ARCHIVED (never
// deleted), its messages stay untouched, its endedAt records the cycle's
// real end, a fresh active cycle becomes available (GET / excludes
// archived), and no coaching/prescription/journal/safety state is
// touched. Uses the injectable factory with a fully stubbed database and
// a pinned clock — no real DB, no network, no Anthropic.

const test = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const path = require('node:path');
const { createArchiveCompletedCycles } = require('../src/routes/sessions');
const { CYCLE_LENGTH_MS, cycleCompleted, cycleRolloverBoundary } = require('../src/utils/cycleBoundary');

// Pinned clock: Monday 20 July 2026, 09:00 UTC.
const NOW = new Date('2026-07-20T09:00:00.000Z');

test('cycleBoundary helpers are deterministic and seven-day-exact', () => {
  assert.equal(CYCLE_LENGTH_MS, 7 * 24 * 60 * 60 * 1000);
  const created = new Date(NOW.getTime() - CYCLE_LENGTH_MS);
  assert.equal(cycleCompleted(created, NOW), true, 'exactly seven days old ⇒ completed');
  assert.equal(cycleCompleted(new Date(created.getTime() + 1), NOW), false, 'one ms younger ⇒ still active');
  assert.equal(cycleRolloverBoundary(NOW).toISOString(), created.toISOString());
});

// ── In-memory ChatSession stub that honors the exact filters the rollover
// uses. Any access to any OTHER model (message, coachingCycle, …) throws —
// proving the rollover can never delete a message or touch coaching state.

function makeDb(sessions) {
  function matches(s, where) {
    if (where.userId !== undefined && s.userId !== where.userId) return false;
    if (where.mode !== undefined && s.mode !== where.mode) return false;
    if (where.id?.in !== undefined && !where.id.in.includes(s.id)) return false;
    if (where.status !== undefined) {
      if (typeof where.status === 'string') {
        if (s.status !== where.status) return false;
      } else if (where.status.not !== undefined && s.status === where.status.not) return false;
    }
    if (where.createdAt?.lte !== undefined && !(s.createdAt <= where.createdAt.lte)) return false;
    return true;
  }
  const db = {
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

let idSeq = 0;
function session(overrides) {
  return {
    id: 'cs-' + (++idSeq),
    userId: 'user-1',
    mode: 'main',
    status: 'active',
    createdAt: new Date('2026-07-10T09:00:00.000Z'),
    endedAt: null,
    ...overrides,
  };
}

function daysAgo(n, ms = 0) {
  return new Date(NOW.getTime() - n * 24 * 60 * 60 * 1000 - ms);
}

// ── The seven-day boundary is per-session, not calendar-based ──────────────

test('a session created less than seven days ago is NOT archived', async () => {
  const s = session({ createdAt: daysAgo(6) }); // six days old
  const rollover = createArchiveCompletedCycles({ db: makeDb([s]), now: () => NOW });
  const completed = await rollover('user-1');
  assert.deepEqual(completed, []);
  assert.equal(s.status, 'active');
  assert.equal(s.endedAt, null);
});

test('a Sunday-created session does NOT reset on Monday — one day old is still an active cycle', async () => {
  // NOW is Monday 20 July 2026. Session created the previous evening.
  const sunday = session({ createdAt: new Date('2026-07-19T18:30:00.000Z') });
  const rollover = createArchiveCompletedCycles({ db: makeDb([sunday]), now: () => NOW });
  const completed = await rollover('user-1');
  assert.deepEqual(completed, []);
  assert.equal(sunday.status, 'active', 'the calendar reaching Monday must never archive a young cycle');
});

test('exactly seven days after createdAt the cycle rolls over (boundary inclusive)', async () => {
  const exact = session({ createdAt: daysAgo(7) });
  const rollover = createArchiveCompletedCycles({ db: makeDb([exact]), now: () => NOW });
  const completed = await rollover('user-1');
  assert.equal(completed.length, 1);
  assert.equal(exact.status, 'archived');
});

test('one millisecond short of seven days stays active; one millisecond past archives', async () => {
  const justUnder = session({ createdAt: new Date(NOW.getTime() - CYCLE_LENGTH_MS + 1) });
  const justOver = session({ id: 'cs-over', createdAt: new Date(NOW.getTime() - CYCLE_LENGTH_MS - 1) });
  const rollover = createArchiveCompletedCycles({ db: makeDb([justUnder, justOver]), now: () => NOW });
  const completed = await rollover('user-1');
  assert.equal(justUnder.status, 'active');
  assert.equal(justOver.status, 'archived');
  assert.equal(completed.length, 1);
  assert.equal(completed[0].sessionId, 'cs-over');
});

// ── Archive semantics ───────────────────────────────────────────────────────

test('archiving records the cycle\'s real range: returned descriptor and endedAt match createdAt → rollover moment', async () => {
  const createdAt = daysAgo(9);
  const s = session({ createdAt });
  const rollover = createArchiveCompletedCycles({ db: makeDb([s]), now: () => NOW });
  const [cycle] = await rollover('user-1');
  assert.equal(cycle.sessionId, s.id);
  assert.equal(cycle.cycleStart.toISOString(), createdAt.toISOString());
  assert.equal(cycle.cycleEnd.toISOString(), NOW.toISOString());
  assert.equal(s.endedAt.toISOString(), NOW.toISOString(), 'endedAt persists the cycle end for the review date range');
});

test('idempotent across tabs/retries: a second run archives nothing and returns no cycles', async () => {
  const s = session({ createdAt: daysAgo(8) });
  const db = makeDb([s]);
  const rollover = createArchiveCompletedCycles({ db, now: () => NOW });
  assert.equal((await rollover('user-1')).length, 1);
  assert.deepEqual(await rollover('user-1'), [], 'already-archived cycles must not roll over again');
});

test('a concurrent loser (updateMany claims zero rows) reports NO completed cycles — so it never triggers generation', async () => {
  const s = session({ createdAt: daysAgo(8) });
  const db = makeDb([s]);
  // Simulate the race: another tab archives between this call's findMany
  // and updateMany.
  const realFindMany = db.chatSession.findMany;
  db.chatSession.findMany = async (args) => {
    const rows = await realFindMany(args);
    s.status = 'archived'; // the other tab wins the claim first
    return rows;
  };
  const rollover = createArchiveCompletedCycles({ db, now: () => NOW });
  assert.deepEqual(await rollover('user-1'), []);
});

test('quick-chat sessions are never part of a cycle', async () => {
  const quick = session({ mode: 'quick', createdAt: daysAgo(30) });
  const rollover = createArchiveCompletedCycles({ db: makeDb([quick]), now: () => NOW });
  assert.deepEqual(await rollover('user-1'), []);
  assert.equal(quick.status, 'active');
});

test('user-scoped: only the calling user\'s sessions are archived — another user\'s cycle is untouchable', async () => {
  const mine = session({ createdAt: daysAgo(8) });
  const theirs = session({ userId: 'user-2', createdAt: daysAgo(8) });
  const rollover = createArchiveCompletedCycles({ db: makeDb([mine, theirs]), now: () => NOW });
  await rollover('user-1');
  assert.equal(mine.status, 'archived');
  assert.equal(theirs.status, 'active', 'another user\'s cycle must never be touched');
});

test('the rollover touches ONLY ChatSession — messages, coaching, prescriptions, journal, safety and consent state are unreachable', async () => {
  // makeDb's proxy throws on any non-chatSession model access; a clean run
  // IS the proof. Belt-and-braces: the source must contain no reference to
  // any other model or to a delete of any kind.
  const rollover = createArchiveCompletedCycles({ db: makeDb([session({ createdAt: daysAgo(8) })]), now: () => NOW });
  await assert.doesNotReject(() => rollover('user-1'));

  const src = readFileSync(path.join(__dirname, '../src/routes/sessions.js'), 'utf8');
  const start = src.indexOf('function createArchiveCompletedCycles');
  const end = src.indexOf('const archiveCompletedCycles =');
  const fnSrc = src.slice(start, end);
  assert.ok(start !== -1 && end > start);
  assert.doesNotMatch(fnSrc, /message\.|deleteMany|\.delete\(/, 'the rollover must never delete anything or touch Message rows');
  assert.doesNotMatch(fnSrc, /coachingCycle|prescription|userCoachingState|mindJournal|safetyEvent|toolReport|user\.update/i);
});

// ── Route wiring (source-level): rollover → non-blocking generation →
// listing that exposes only the current, non-archived cycle. ───────────────

test('GET /api/sessions: rollover runs first, review generation is fire-and-forget (never awaited), archived cycles are excluded', () => {
  const src = readFileSync(path.join(__dirname, '../src/routes/sessions.js'), 'utf8');
  const getRoute = src.slice(src.indexOf("router.get('/'"), src.indexOf("router.post('/'"));
  const rolloverIdx = getRoute.indexOf('archiveCompletedCycles(req.userId)');
  const generateIdx = getRoute.indexOf('generateMissingCycleReviews(req.userId)');
  const listIdx = getRoute.indexOf('findMany');
  assert.ok(rolloverIdx !== -1, 'GET / must run the seven-day rollover');
  assert.ok(generateIdx !== -1, 'a completed cycle must trigger review generation');
  assert.ok(rolloverIdx < generateIdx && generateIdx < listIdx, 'rollover → trigger → listing');
  // The trigger must NOT block chat entry: it runs behind a .then chain
  // with no await anywhere on it.
  assert.doesNotMatch(getRoute, /await[^\n]*generateMissingCycleReviews/, 'review generation must never block chat entry');
  assert.match(getRoute, /\.then\(active => \(active \? generateMissingCycleReviews\(req\.userId\) : null\)\)/);
  assert.match(getRoute, /status: \{ not: 'archived' \}/, 'archived cycles must not be offered back to the chat client');
});

test('the trigger reuses the ONE generator service — sessions.js defines no report generation of its own', () => {
  const src = readFileSync(path.join(__dirname, '../src/routes/sessions.js'), 'utf8');
  assert.match(src, /require\('\.\/weeklyReports'\)/);
  // sessions.js may keep its pre-existing per-session SUMMARY generator,
  // but it must never write WeeklyReport rows or carry the review prompt.
  assert.doesNotMatch(src, /weeklyReport\./, 'no duplicate report generator');
  assert.doesNotMatch(src, /Weekly Review of the athlete/, 'the review prompt lives only in weeklyReports.js');
});

test('end-stale still only ends ACTIVE sessions — it never resurrects or re-touches archived cycles', () => {
  const src = readFileSync(path.join(__dirname, '../src/routes/sessions.js'), 'utf8');
  const endStale = src.slice(src.indexOf("router.post('/end-stale'"), src.indexOf("router.get('/:id/messages'"));
  assert.match(endStale, /status: 'active'/);
});

test('archived-cycle ownership: GET /:id/messages 404s for a session the caller does not own', () => {
  const src = readFileSync(path.join(__dirname, '../src/routes/sessions.js'), 'utf8');
  const route = src.slice(src.indexOf("router.get('/:id/messages'"), src.indexOf("router.post('/:id/end'"));
  assert.match(route, /session\.userId !== req\.userId/);
  assert.match(route, /status\(404\)/);
});
