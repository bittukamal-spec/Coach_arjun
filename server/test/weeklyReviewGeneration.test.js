// Behavioral tests for weekly-review generation under a pinned clock:
// exactly one review per completed coaching week, none before the boundary,
// approved section headings with no score/diagnosis language, archived
// messages read (never deleted), user scoping and newest-first ordering.
// Uses the injectable factory (createMaybeGenerateLastWeekReport) with a
// stubbed database that honors the real date filters — no real DB, no
// network. The safety short-circuit itself is covered separately in
// weeklyReportSafety.test.js.

const test = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const path = require('node:path');
const { createMaybeGenerateLastWeekReport } = require('../src/routes/weeklyReports');
const { startTestServer, stopTestServer } = require('./helpers/testServer');

// Pinned clock: Wednesday 15 July 2026, 10:00 UTC.
// Completed week: Mon 6 July 00:00 UTC → Sun 12 July 23:59:59.999 UTC.
const NOW = new Date('2026-07-15T10:00:00.000Z');
const LAST_WEEK_START = new Date('2026-07-06T00:00:00.000Z');
const LAST_WEEK_END = new Date('2026-07-12T23:59:59.999Z');

function makeDb(allMessages, { existingReport = null } = {}) {
  const created = [];
  const findManyCalls = [];
  return {
    created,
    findManyCalls,
    db: {
      weeklyReport: {
        findUnique: async () => existingReport,
        create: async (args) => {
          created.push(args.data);
          return { id: `wr-${created.length}`, ...args.data };
        },
      },
      message: {
        // Honors the real createdAt window the generator asks for, so the
        // boundary behavior is tested against genuine date filtering.
        findMany: async (args) => {
          findManyCalls.push(args);
          const { gte, lte } = args.where.createdAt || {};
          return allMessages
            .filter(m => (!gte || m.createdAt >= gte) && (!lte || m.createdAt <= lte))
            .filter(m => args.where.role === undefined || m.role === args.where.role);
        },
      },
      user: { findUnique: async () => ({ language: 'en' }) },
    },
  };
}

function msg(iso, content, role = 'user') {
  return { role, content, createdAt: new Date(iso) };
}

const LAST_WEEK_MESSAGES = [
  msg('2026-07-07T10:00:00Z', 'nervous before the trial'),
  msg('2026-07-09T10:00:00Z', 'tried the breathing cue'),
  msg('2026-07-11T10:00:00Z', 'felt calmer in the second innings'),
];

function makeAnthropic(capture) {
  return () => ({
    messages: {
      create: async (args) => {
        capture.push(args);
        return { content: [{ text: '**What you worked on**\nStaying calm.' }] };
      },
    },
  });
}

test('a completed week with enough messages generates exactly ONE review, keyed to that week', async () => {
  const { db, created } = makeDb(LAST_WEEK_MESSAGES);
  const calls = [];
  const generate = createMaybeGenerateLastWeekReport({ db, now: () => NOW, createAnthropicClient: makeAnthropic(calls) });

  await generate('user-1');

  assert.equal(created.length, 1);
  assert.equal(created[0].userId, 'user-1');
  assert.equal(created[0].weekStart.toISOString(), LAST_WEEK_START.toISOString());
  assert.equal(created[0].weekEnd.toISOString(), LAST_WEEK_END.toISOString());
  assert.equal(created[0].messageCount, 3);
  assert.equal(calls.length, 1);
});

test('before the cycle boundary: messages from the CURRENT, incomplete week never generate a review', async () => {
  const currentWeekOnly = [
    msg('2026-07-13T10:00:00Z', 'monday session went fine'),
    msg('2026-07-14T10:00:00Z', 'good focus at practice'),
    msg('2026-07-15T08:00:00Z', 'ready for the match'),
  ];
  const { db, created } = makeDb(currentWeekOnly);
  const calls = [];
  const generate = createMaybeGenerateLastWeekReport({ db, now: () => NOW, createAnthropicClient: makeAnthropic(calls) });

  await generate('user-1');

  assert.equal(created.length, 0, 'the current week is not a completed cycle');
  assert.equal(calls.length, 0, 'no Anthropic call before the boundary');
});

test('repeated requests / second tab: an existing review for the week short-circuits before any work', async () => {
  const { db, created, findManyCalls } = makeDb(LAST_WEEK_MESSAGES, { existingReport: { id: 'wr-existing' } });
  const calls = [];
  const generate = createMaybeGenerateLastWeekReport({ db, now: () => NOW, createAnthropicClient: makeAnthropic(calls) });

  await generate('user-1');
  await generate('user-1');

  assert.equal(created.length, 0);
  assert.equal(calls.length, 0);
  assert.equal(findManyCalls.length, 0, 'messages are not even read once the per-week unique row exists');
});

test('the generation prompt uses the approved Weekly Review sections and forbids scores/diagnosis/invented claims', async () => {
  const { db } = makeDb(LAST_WEEK_MESSAGES);
  const calls = [];
  const generate = createMaybeGenerateLastWeekReport({ db, now: () => NOW, createAnthropicClient: makeAnthropic(calls) });

  await generate('user-1');

  const system = calls[0].system;
  for (const heading of ['**What you worked on**', '**Patterns Arjun noticed**', '**What helped**', '**Your next focus**']) {
    assert.ok(system.includes(heading), `missing approved heading ${heading}`);
  }
  assert.match(system, /Never include scores, ratings, marks, percentages, levels, diagnoses, or personality labels/);
  assert.match(system, /never invent progress|unsupported performance claims/);
  assert.match(system, /sensitive or unsafe, do not repeat/);
});

test('generation reads messages by date window only — archived cycles\' messages are included, nothing is deleted', async () => {
  const { db, findManyCalls } = makeDb(LAST_WEEK_MESSAGES);
  const generate = createMaybeGenerateLastWeekReport({ db, now: () => NOW, createAnthropicClient: makeAnthropic([]) });

  await generate('user-1');

  assert.equal(findManyCalls.length, 1);
  const where = findManyCalls[0].where;
  assert.equal(where.userId, 'user-1');
  assert.equal(where.chatSessionId, undefined, 'no session/status filter — archived weeks still feed their review');
  assert.equal(where.status, undefined);
  // The stubbed db exposes no delete methods at all; the source must not
  // reference any either.
  const src = readFileSync(path.join(__dirname, '../src/routes/weeklyReports.js'), 'utf8');
  assert.doesNotMatch(src, /deleteMany|\.delete\(/);
});

// ── Route-level contract: ownership + newest-first ─────────────────────────

test('GET /api/weekly-reports source: user-scoped, newest first, bounded', () => {
  const src = readFileSync(path.join(__dirname, '../src/routes/weeklyReports.js'), 'utf8');
  const route = src.slice(src.indexOf("router.get('/'"));
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
