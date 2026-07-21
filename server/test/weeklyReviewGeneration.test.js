// Behavioral tests for per-cycle Weekly Review generation: exactly one
// review per completed seven-day chat cycle, keyed and dated to that
// cycle's REAL range, retry-safe after failures, duplicate-proof across
// concurrent triggers, reading the archived cycle's own messages (never
// deleting them), user-scoped and newest-first at the route. Uses the
// injectable factories with stubbed databases — no real DB, no network.
// The safety short-circuit itself is covered in weeklyReportSafety.test.js.

const test = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const path = require('node:path');
const {
  createGenerateCycleReview,
  createGenerateMissingCycleReviews,
} = require('../src/routes/weeklyReports');
const { startTestServer, stopTestServer } = require('./helpers/testServer');

// A completed cycle with its REAL range: started Friday 10 July 2026,
// rolled over Friday 17 July 2026 (per-session seven-day boundary — note
// this is NOT a Monday-aligned calendar week).
const CYCLE = {
  sessionId: 'cs-archived-1',
  cycleStart: new Date('2026-07-10T14:30:00.000Z'),
  cycleEnd: new Date('2026-07-17T14:30:00.000Z'),
};

function makeDb({ messagesBySession = {}, existingReport = null, archivedSessions = [], failCreateWith = null } = {}) {
  const created = [];
  const findManyCalls = [];
  return {
    created,
    findManyCalls,
    db: {
      weeklyReport: {
        findUnique: async () => existingReport,
        create: async (args) => {
          if (failCreateWith) throw failCreateWith;
          // Simulate the DB unique constraint: a second row for the same
          // userId+weekStart throws exactly like Prisma would.
          if (created.some(r => r.userId === args.data.userId && r.weekStart.getTime() === args.data.weekStart.getTime())) {
            const err = new Error('Unique constraint failed on the fields: (`userId`,`weekStart`)');
            err.code = 'P2002';
            throw err;
          }
          created.push(args.data);
          return { id: `wr-${created.length}`, ...args.data };
        },
      },
      message: {
        findMany: async (args) => {
          findManyCalls.push(args);
          const rows = messagesBySession[args.where.chatSessionId] || [];
          return rows.filter(m => args.where.role === undefined || m.role === args.where.role);
        },
      },
      chatSession: {
        findMany: async (args) => {
          findManyCalls.push({ model: 'chatSession', args });
          return archivedSessions;
        },
      },
      user: { findUnique: async () => ({ language: 'en' }) },
    },
  };
}

function msg(iso, content, role = 'user') {
  return { role, content, createdAt: new Date(iso) };
}

const CYCLE_MESSAGES = [
  msg('2026-07-11T10:00:00Z', 'nervous before the trial'),
  msg('2026-07-13T10:00:00Z', 'tried the breathing cue'),
  msg('2026-07-16T10:00:00Z', 'felt calmer in the second innings'),
];

function makeAnthropic(capture, { failFirst = 0 } = {}) {
  let calls = 0;
  return () => ({
    messages: {
      create: async (args) => {
        capture.push(args);
        calls += 1;
        if (calls <= failFirst) throw new Error('model unavailable');
        return { content: [{ text: '**What you worked on**\nStaying calm.' }] };
      },
    },
  });
}

// ── One review per completed cycle, dated to the cycle's real range ────────

test('a completed cycle with enough messages generates exactly ONE review whose date range matches the archived cycle', async () => {
  const { db, created } = makeDb({ messagesBySession: { [CYCLE.sessionId]: CYCLE_MESSAGES } });
  const calls = [];
  const generate = createGenerateCycleReview({ db, createAnthropicClient: makeAnthropic(calls) });

  await generate('user-1', CYCLE);

  assert.equal(created.length, 1);
  assert.equal(created[0].userId, 'user-1');
  assert.equal(created[0].weekStart.toISOString(), CYCLE.cycleStart.toISOString(), 'weekStart = the cycle\'s real start');
  assert.equal(created[0].weekEnd.toISOString(), CYCLE.cycleEnd.toISOString(), 'weekEnd = the cycle\'s real end');
  assert.equal(created[0].messageCount, 3);
  assert.equal(calls.length, 1);
});

test('the review reads the archived cycle\'s OWN messages (by chatSessionId) and never deletes anything', async () => {
  const { db, findManyCalls } = makeDb({ messagesBySession: { [CYCLE.sessionId]: CYCLE_MESSAGES } });
  const generate = createGenerateCycleReview({ db, createAnthropicClient: makeAnthropic([]) });

  await generate('user-1', CYCLE);

  const messageRead = findManyCalls.find(c => c.where?.chatSessionId);
  assert.equal(messageRead.where.chatSessionId, CYCLE.sessionId, 'the cycle IS the session — archived messages feed the review');
  assert.equal(messageRead.where.userId, 'user-1');
  const src = readFileSync(path.join(__dirname, '../src/routes/weeklyReports.js'), 'utf8');
  assert.doesNotMatch(src, /deleteMany|\.delete\(/);
});

test('fewer than 3 messages in the cycle: nothing generated, zero Anthropic calls', async () => {
  const { db, created } = makeDb({ messagesBySession: { [CYCLE.sessionId]: CYCLE_MESSAGES.slice(0, 2) } });
  const calls = [];
  const generate = createGenerateCycleReview({ db, createAnthropicClient: makeAnthropic(calls) });
  await generate('user-1', CYCLE);
  assert.equal(created.length, 0);
  assert.equal(calls.length, 0);
});

test('the generation prompt uses the approved Weekly Review sections and forbids scores/diagnosis/invented claims', async () => {
  const { db } = makeDb({ messagesBySession: { [CYCLE.sessionId]: CYCLE_MESSAGES } });
  const calls = [];
  const generate = createGenerateCycleReview({ db, createAnthropicClient: makeAnthropic(calls) });

  await generate('user-1', CYCLE);

  const system = calls[0].system;
  for (const heading of ['**What you worked on**', '**Patterns Arjun noticed**', '**What helped**', '**Your next focus**']) {
    assert.ok(system.includes(heading), `missing approved heading ${heading}`);
  }
  assert.match(system, /Never include scores, ratings, marks, percentages, levels, diagnoses, or personality labels/);
  assert.match(system, /never invent progress|unsupported performance claims/);
  assert.match(system, /sensitive or unsafe, do not repeat/);
});

// ── Duplicate prevention ────────────────────────────────────────────────────

test('repeated requests / second tab: an existing review for the cycle short-circuits before any work', async () => {
  const { db, created, findManyCalls } = makeDb({
    messagesBySession: { [CYCLE.sessionId]: CYCLE_MESSAGES },
    existingReport: { id: 'wr-existing' },
  });
  const calls = [];
  const generate = createGenerateCycleReview({ db, createAnthropicClient: makeAnthropic(calls) });

  await generate('user-1', CYCLE);
  await generate('user-1', CYCLE);

  assert.equal(created.length, 0);
  assert.equal(calls.length, 0);
  assert.equal(findManyCalls.length, 0, 'messages are not even read once the per-cycle unique row exists');
});

test('a concurrent race past the dedup check hits the unique constraint: exactly one review survives, no unhandled rejection', async () => {
  // Both callers see "no existing report" (findUnique stubbed null), so
  // both reach create() — the second create throws the same P2002 the real
  // unique index raises, and the route-style .catch swallows it.
  const { db, created } = makeDb({ messagesBySession: { [CYCLE.sessionId]: CYCLE_MESSAGES } });
  const generate = createGenerateCycleReview({ db, createAnthropicClient: makeAnthropic([]) });

  await Promise.all([
    generate('user-1', CYCLE).catch(() => {}),
    generate('user-1', CYCLE).catch(() => {}),
  ]);

  assert.equal(created.length, 1, 'the DB unique key must leave exactly one review');
});

// ── Retry safety ────────────────────────────────────────────────────────────

test('a failed/interrupted first attempt leaves no row and a later attempt succeeds — messages still intact', async () => {
  const { db, created } = makeDb({ messagesBySession: { [CYCLE.sessionId]: CYCLE_MESSAGES } });
  const calls = [];
  const generate = createGenerateCycleReview({ db, createAnthropicClient: makeAnthropic(calls, { failFirst: 1 }) });

  // First attempt (the rollover trigger): model fails; caller catches.
  await assert.rejects(() => generate('user-1', CYCLE));
  assert.equal(created.length, 0, 'a failed attempt must write nothing');

  // Later attempt (opening /weekly-reviews): same cycle, same key — succeeds.
  await generate('user-1', CYCLE);
  assert.equal(created.length, 1);
  assert.equal(created[0].weekStart.toISOString(), CYCLE.cycleStart.toISOString());
});

// ── The retry sweep used by both trigger points ─────────────────────────────

test('generateMissingCycleReviews sweeps recent archived cycles newest-first and isolates per-cycle failures', async () => {
  const archived = [
    { id: 'cs-b', createdAt: new Date('2026-07-10T00:00:00Z'), endedAt: new Date('2026-07-17T00:00:00Z') },
    { id: 'cs-a', createdAt: new Date('2026-07-01T00:00:00Z'), endedAt: new Date('2026-07-10T00:00:00Z') },
  ];
  const { db, findManyCalls } = makeDb({ archivedSessions: archived });
  const generated = [];
  const sweep = createGenerateMissingCycleReviews({
    db,
    generate: async (userId, cycle) => {
      generated.push(cycle.sessionId);
      if (cycle.sessionId === 'cs-b') throw new Error('one bad cycle');
    },
  });

  await assert.doesNotReject(() => sweep('user-1'));

  assert.deepEqual(generated, ['cs-b', 'cs-a'], 'every recent archived cycle is attempted; a failure never stops the rest');
  const sessionQuery = findManyCalls.find(c => c.model === 'chatSession').args;
  assert.deepEqual(sessionQuery.where, { userId: 'user-1', mode: 'main', status: 'archived' });
  assert.deepEqual(sessionQuery.orderBy, { createdAt: 'desc' });
  assert.equal(sessionQuery.take, 4);
});

test('the sweep passes each archived cycle\'s REAL stored range to the generator', async () => {
  const archived = [{ id: 'cs-x', createdAt: new Date('2026-07-05T08:00:00Z'), endedAt: new Date('2026-07-12T09:30:00Z') }];
  const { db } = makeDb({ archivedSessions: archived });
  const seen = [];
  const sweep = createGenerateMissingCycleReviews({ db, generate: async (u, cycle) => seen.push(cycle) });

  await sweep('user-1');

  assert.equal(seen[0].sessionId, 'cs-x');
  assert.equal(seen[0].cycleStart.toISOString(), '2026-07-05T08:00:00.000Z');
  assert.equal(seen[0].cycleEnd.toISOString(), '2026-07-12T09:30:00.000Z');
});

// ── Route-level contract: ownership + newest-first + retry path ────────────

test('GET /api/weekly-reports source: user-scoped, newest first, bounded, and retries the sweep on every open', () => {
  const src = readFileSync(path.join(__dirname, '../src/routes/weeklyReports.js'), 'utf8');
  const route = src.slice(src.indexOf("router.get('/'"));
  assert.match(route, /generateMissingCycleReviews\(req\.userId\)/, 'opening Weekly Reviews must retry missing/failed generations');
  assert.match(route, /where: \{ userId: req\.userId \}/, 'reports must be scoped to the authenticated user');
  assert.match(route, /orderBy: \{ weekStart: 'desc' \}/, 'newest reviews must come first');
  assert.match(route, /take: 8/);
});

test('an unauthenticated GET /api/weekly-reports returns 401 — never another user\'s reviews', async () => {
  const { server, baseUrl } = await startTestServer();
  try {
    const res = await fetch(`${baseUrl}/api/weekly-reports`);
    assert.equal(res.status, 401);
  } finally {
    await stopTestServer(server);
  }
});
