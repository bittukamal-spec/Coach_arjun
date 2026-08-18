// Focused tests for GET /api/founder/pilot-overview (Phase 1).
//
// Real HTTP requests against a hand-rolled Prisma stub — no database is
// ever touched, no production connection of any kind. The founder session
// token is a real jsonwebtoken signed with a test secret, exercising the
// exact same verification path founderAuthenticate uses in production
// (same technique as founderSafetyEventsApi.test.js).
//
// The stub honors Prisma's `select` by projecting rows to only the
// requested keys — the same guarantee the real client provides — so a test
// asserting a forbidden field never appears in the HTTP response is a
// genuine proof that the route's query shape (not just its response
// mapping) never reads that data, not merely that the mapping code happens
// to omit it today.

const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const jwt = require('jsonwebtoken');
const { createFounderPilotOverviewRouter } = require('../src/routes/founderPilotOverview');

const TEST_SECRET = 'founder-pilot-overview-test-secret';
const ORIGINAL_SECRET = process.env.FOUNDER_SESSION_SECRET;

test.before(() => { process.env.FOUNDER_SESSION_SECRET = TEST_SECRET; });
test.after(() => {
  if (ORIGINAL_SECRET === undefined) delete process.env.FOUNDER_SESSION_SECRET;
  else process.env.FOUNDER_SESSION_SECRET = ORIGINAL_SECRET;
});

function validToken() {
  return jwt.sign({ role: 'founder' }, TEST_SECRET, { expiresIn: '15m' });
}

// ── Minimal Prisma stub ──────────────────────────────────────────────────

function project(row, select) {
  if (!select) return row;
  const out = {};
  for (const k of Object.keys(select)) {
    if (select[k]) out[k] = row[k];
  }
  return out;
}

function matchWhere(row, where) {
  if (!where) return true;
  return Object.entries(where).every(([key, cond]) => {
    const val = row[key];
    if (cond && typeof cond === 'object' && !(cond instanceof Date)) {
      if ('gte' in cond) return val instanceof Date && val.getTime() >= cond.gte.getTime();
      if ('not' in cond) return cond.not === null ? val !== null && val !== undefined : val !== cond.not;
      if ('in' in cond) return cond.in.includes(val);
      throw new Error(`unsupported where condition: ${JSON.stringify(cond)}`);
    }
    return val === cond;
  });
}

function makeStubClient({ users, onboardingSessions, messages, prescriptions, chatSessionCount }) {
  return {
    user: {
      count: async ({ where } = {}) => users.filter((u) => matchWhere(u, where)).length,
      findMany: async ({ where, orderBy, take, select } = {}) => {
        let list = users.filter((u) => matchWhere(u, where));
        if (orderBy?.createdAt === 'desc') list = [...list].sort((a, b) => b.createdAt - a.createdAt);
        if (typeof take === 'number') list = list.slice(0, take);
        return list.map((u) => project(u, select));
      },
    },
    onboardingSession: {
      findMany: async ({ where, select } = {}) =>
        onboardingSessions.filter((s) => matchWhere(s, where)).map((s) => project(s, select)),
    },
    message: {
      findMany: async ({ where, select } = {}) =>
        messages.filter((m) => matchWhere(m, where)).map((m) => project(m, select)),
    },
    chatSession: {
      count: async () => chatSessionCount,
    },
    prescription: {
      findMany: async ({ where, select } = {}) =>
        prescriptions.filter((p) => matchWhere(p, where)).map((p) => project(p, select)),
    },
  };
}

// ── Fixtures ─────────────────────────────────────────────────────────────
// Dates are constructed relative to the exact UTC-midnight boundary the
// route itself computes, with a generous margin around the 7-day rolling
// window, so the test is not sensitive to when in the day it happens to run.

function buildFixtures() {
  const now = new Date();
  const todayStart = new Date(now);
  todayStart.setUTCHours(0, 0, 0, 0);

  const users = [
    {
      id: 'u1', name: 'Arjun Sharma',
      createdAt: new Date(todayStart.getTime() + 60 * 60 * 1000), // today
      onboardingDone: true, tier: 'premium',
      guardianEmail: 'guardian1@example.com', guardianConsentAt: new Date(todayStart.getTime() + 30 * 60 * 1000),
      password: 'bcrypt-hash-should-never-leak', guardianConsentToken: 'super-secret-token-should-never-leak',
    },
    {
      id: 'u2', name: 'Priya Nair',
      createdAt: new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000), // 3 days ago — within 7-day window
      onboardingDone: true, tier: 'free',
      guardianEmail: 'guardian2@example.com', guardianConsentAt: null, // pending
      password: 'hash2', guardianConsentToken: null,
    },
    {
      id: 'u5', name: '',
      createdAt: new Date(todayStart.getTime() - 1000), // just before today (yesterday)
      onboardingDone: false, tier: 'free', guardianEmail: null, guardianConsentAt: null,
      password: 'hash5', guardianConsentToken: null,
    },
    {
      id: 'u3', name: 'Rahul Verma',
      createdAt: new Date(now.getTime() - 10 * 24 * 60 * 60 * 1000), // outside 7-day window
      onboardingDone: false, tier: 'free', guardianEmail: null, guardianConsentAt: null,
      password: 'hash3', guardianConsentToken: null,
    },
    {
      id: 'u4', name: 'Sana Iyer',
      createdAt: new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000),
      onboardingDone: false, tier: 'free', guardianEmail: null, guardianConsentAt: null,
      password: 'hash4', guardianConsentToken: null,
    },
  ];

  const onboardingSessions = [
    { userId: 'u1', status: 'COMPLETED' },
    { userId: 'u2', status: 'COMPLETED' },
    { userId: 'u3', status: 'IN_PROGRESS' },
  ];

  const messages = [
    { userId: 'u1', role: 'user', content: 'never leak this' },
    { userId: 'u1', role: 'user', content: 'never leak this either' },
    { userId: 'u2', role: 'user', content: 'nor this' },
    { userId: 'u3', role: 'assistant', content: 'assistant reply — u3 never sent a user message' },
  ];

  const prescriptions = [
    { userId: 'u1', status: 'COMPLETED', outcomeStatus: 'HELPED', cardContent: 'never leak', situation: 'never leak', outcomeLesson: 'never leak' },
    { userId: 'u1', status: 'ACTIVE', outcomeStatus: null, cardContent: 'never leak', situation: 'never leak', outcomeLesson: null },
    { userId: 'u2', status: 'ACTIVE', outcomeStatus: 'NOT_TRIED', cardContent: 'never leak', situation: 'never leak', outcomeLesson: null },
  ];

  return {
    users, onboardingSessions, messages, prescriptions,
    chatSessionCount: 4,
  };
}

function startServer(fixtures = buildFixtures()) {
  const router = createFounderPilotOverviewRouter(makeStubClient(fixtures));
  const app = express();
  app.use(express.json());
  app.use('/pilot-overview', router);
  return new Promise((resolve) => {
    const server = app.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      resolve({ server, baseUrl: `http://127.0.0.1:${port}/pilot-overview` });
    });
  });
}

function stop(server) {
  return new Promise((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));
}

async function getJson(baseUrl) {
  const res = await fetch(baseUrl, { headers: { Authorization: `Bearer ${validToken()}` } });
  const body = await res.json();
  return { res, body };
}

// ── Auth ─────────────────────────────────────────────────────────────────

test('unauthenticated request receives 401', async () => {
  const { server, baseUrl } = await startServer();
  try {
    const res = await fetch(baseUrl);
    assert.equal(res.status, 401);
  } finally { await stop(server); }
});

test('garbage token receives 401', async () => {
  const { server, baseUrl } = await startServer();
  try {
    const res = await fetch(baseUrl, { headers: { Authorization: 'Bearer garbage' } });
    assert.equal(res.status, 401);
  } finally { await stop(server); }
});

test('a valid founder session is accepted', async () => {
  const { server, baseUrl } = await startServer();
  try {
    const { res } = await getJson(baseUrl);
    assert.equal(res.status, 200);
  } finally { await stop(server); }
});

// ── Top metrics ──────────────────────────────────────────────────────────

test('totalAthletes counts every user', async () => {
  const { server, baseUrl } = await startServer();
  try {
    const { body } = await getJson(baseUrl);
    assert.equal(body.metrics.totalAthletes, 5);
  } finally { await stop(server); }
});

test('signupsToday counts only users created since UTC midnight today', async () => {
  const { server, baseUrl } = await startServer();
  try {
    const { body } = await getJson(baseUrl);
    assert.equal(body.metrics.signupsToday, 1); // u1 only
  } finally { await stop(server); }
});

test('signupsLast7Days counts users within the rolling 7-day window, excluding older ones', async () => {
  const { server, baseUrl } = await startServer();
  try {
    const { body } = await getJson(baseUrl);
    assert.equal(body.metrics.signupsLast7Days, 3); // u1, u2, u5
  } finally { await stop(server); }
});

test('onboardingStarted counts distinct users with at least one OnboardingSession', async () => {
  const { server, baseUrl } = await startServer();
  try {
    const { body } = await getJson(baseUrl);
    assert.equal(body.metrics.onboardingStarted, 3); // u1, u2, u3
  } finally { await stop(server); }
});

test('onboardingCompleted uses User.onboardingDone', async () => {
  const { server, baseUrl } = await startServer();
  try {
    const { body } = await getJson(baseUrl);
    assert.equal(body.metrics.onboardingCompleted, 2); // u1, u2
  } finally { await stop(server); }
});

test('coachUsedAthletes requires an athlete-authored message — an assistant-only ChatSession does not count', async () => {
  const { server, baseUrl } = await startServer();
  try {
    const { body } = await getJson(baseUrl);
    assert.equal(body.metrics.coachUsedAthletes, 2); // u1, u2 — not u3 (assistant message only)
  } finally { await stop(server); }
});

test('coachSessionsTotal is the raw ChatSession count, named distinctly from turns', async () => {
  const { server, baseUrl } = await startServer();
  try {
    const { body } = await getJson(baseUrl);
    assert.equal(body.metrics.coachSessionsTotal, 4);
    assert.ok(!('coachTurns' in body.metrics));
  } finally { await stop(server); }
});

test('mentalRepReceivedAthletes counts distinct athletes with a Prescription', async () => {
  const { server, baseUrl } = await startServer();
  try {
    const { body } = await getJson(baseUrl);
    assert.equal(body.metrics.mentalRepReceivedAthletes, 2); // u1, u2
  } finally { await stop(server); }
});

test('mentalRepsReceived is the total Prescription row count', async () => {
  const { server, baseUrl } = await startServer();
  try {
    const { body } = await getJson(baseUrl);
    assert.equal(body.metrics.mentalRepsReceived, 3);
  } finally { await stop(server); }
});

test('mentalRepsCompleted counts Prescription.status === COMPLETED only', async () => {
  const { server, baseUrl } = await startServer();
  try {
    const { body } = await getJson(baseUrl);
    assert.equal(body.metrics.mentalRepsCompleted, 1);
  } finally { await stop(server); }
});

test('outcomesReported excludes the NOT_TRIED placeholder', async () => {
  const { server, baseUrl } = await startServer();
  try {
    const { body } = await getJson(baseUrl);
    // u1's HELPED prescription counts; u2's NOT_TRIED prescription must not.
    assert.equal(body.metrics.outcomesReported, 1);
  } finally { await stop(server); }
});

test('tier summary reflects premium vs free counts', async () => {
  const { server, baseUrl } = await startServer();
  try {
    const { body } = await getJson(baseUrl);
    assert.deepEqual(body.metrics.tier, { premium: 1, free: 4 });
  } finally { await stop(server); }
});

test('guardian summary returns operational counts only', async () => {
  const { server, baseUrl } = await startServer();
  try {
    const { body } = await getJson(baseUrl);
    assert.deepEqual(body.metrics.guardian, { required: 2, consentCompleted: 1 });
  } finally { await stop(server); }
});

// ── Funnel ───────────────────────────────────────────────────────────────

test('funnel returns distinct-athlete counts and percent-of-total for every stage, in order', async () => {
  const { server, baseUrl } = await startServer();
  try {
    const { body } = await getJson(baseUrl);
    const byStage = Object.fromEntries(body.funnel.map((f) => [f.stage, f]));
    assert.equal(byStage.signedUp.count, 5);
    assert.equal(byStage.signedUp.percent, 100);
    assert.equal(byStage.completedOnboarding.count, 2);
    assert.equal(byStage.usedCoach.count, 2);
    assert.equal(byStage.receivedMentalRep.count, 2);
    assert.equal(byStage.completedMentalRep.count, 1); // distinct athletes, not total completed rows
    assert.equal(byStage.reportedOutcome.count, 1);
    assert.equal(byStage.reportedOutcome.percent, 20); // 1 of 5 = 20%
    assert.deepEqual(
      body.funnel.map((f) => f.stage),
      ['signedUp', 'completedOnboarding', 'usedCoach', 'receivedMentalRep', 'completedMentalRep', 'reportedOutcome']
    );
  } finally { await stop(server); }
});

test('funnel percentages are safe (0, not NaN/Infinity) when there are zero athletes', async () => {
  const empty = { users: [], onboardingSessions: [], messages: [], prescriptions: [], chatSessionCount: 0 };
  const { server, baseUrl } = await startServer(empty);
  try {
    const { res, body } = await getJson(baseUrl);
    assert.equal(res.status, 200);
    for (const stage of body.funnel) {
      assert.equal(stage.count, 0);
      assert.equal(stage.percent, 0);
      assert.ok(Number.isFinite(stage.percent));
    }
    assert.equal(body.metrics.totalAthletes, 0);
    assert.deepEqual(body.metrics.tier, { premium: 0, free: 0 });
    assert.deepEqual(body.recentAthletes, []);
  } finally { await stop(server); }
});

test('a single-athlete pilot cohort produces sane, non-fake numbers', async () => {
  const now = new Date();
  const one = {
    users: [{ id: 'solo', name: 'Solo Athlete', createdAt: now, onboardingDone: false, tier: 'free', guardianEmail: null, guardianConsentAt: null }],
    onboardingSessions: [], messages: [], prescriptions: [], chatSessionCount: 0,
  };
  const { server, baseUrl } = await startServer(one);
  try {
    const { body } = await getJson(baseUrl);
    assert.equal(body.metrics.totalAthletes, 1);
    assert.equal(body.metrics.signupsToday, 1);
    assert.equal(body.recentAthletes.length, 1);
    assert.equal(body.recentAthletes[0].id, 'solo');
  } finally { await stop(server); }
});

// ── Recent athletes ──────────────────────────────────────────────────────

test('recent athletes list is capped and ordered newest signup first', async () => {
  const { server, baseUrl } = await startServer();
  try {
    const { body } = await getJson(baseUrl);
    assert.ok(body.recentAthletes.length <= 20);
    assert.deepEqual(body.recentAthletes.map((a) => a.id), ['u1', 'u5', 'u2', 'u3', 'u4']);
  } finally { await stop(server); }
});

test('recent athletes list is capped at 20 even with a larger pilot cohort', async () => {
  const now = new Date();
  const many = {
    users: Array.from({ length: 35 }, (_, i) => ({
      id: `bulk-${i}`, name: `Athlete ${i}`,
      createdAt: new Date(now.getTime() - i * 1000),
      onboardingDone: false, tier: 'free', guardianEmail: null, guardianConsentAt: null,
    })),
    onboardingSessions: [], messages: [], prescriptions: [], chatSessionCount: 0,
  };
  const { server, baseUrl } = await startServer(many);
  try {
    const { body } = await getJson(baseUrl);
    assert.equal(body.recentAthletes.length, 20);
    assert.equal(body.recentAthletes[0].id, 'bulk-0'); // most recently created
  } finally { await stop(server); }
});

test('each recent-athlete row carries exactly the allowed operational fields', async () => {
  const { server, baseUrl } = await startServer();
  try {
    const { body } = await getJson(baseUrl);
    const allowed = [
      'id', 'firstName', 'signupDate', 'onboardingDone', 'tier',
      'guardianConsentStatus', 'coachUsed', 'mentalRepReceived', 'mentalRepCompleted', 'outcomeReported',
    ].sort();
    for (const athlete of body.recentAthletes) {
      assert.deepEqual(Object.keys(athlete).sort(), allowed);
    }
  } finally { await stop(server); }
});

test('per-athlete flags correctly reflect Coach-used, Mental-Rep, and outcome status', async () => {
  const { server, baseUrl } = await startServer();
  try {
    const { body } = await getJson(baseUrl);
    const byId = Object.fromEntries(body.recentAthletes.map((a) => [a.id, a]));

    assert.equal(byId.u1.coachUsed, true);
    assert.equal(byId.u1.mentalRepReceived, true);
    assert.equal(byId.u1.mentalRepCompleted, true);
    assert.equal(byId.u1.outcomeReported, true);
    assert.equal(byId.u1.guardianConsentStatus, 'confirmed');
    assert.equal(byId.u1.tier, 'premium');

    assert.equal(byId.u2.coachUsed, true);
    assert.equal(byId.u2.mentalRepReceived, true);
    assert.equal(byId.u2.mentalRepCompleted, false); // ACTIVE + NOT_TRIED — not completed
    assert.equal(byId.u2.outcomeReported, false); // NOT_TRIED must not count
    assert.equal(byId.u2.guardianConsentStatus, 'pending');

    assert.equal(byId.u3.coachUsed, false); // assistant message only
    assert.equal(byId.u3.mentalRepReceived, false);
    assert.equal(byId.u3.guardianConsentStatus, 'not_required');

    assert.equal(byId.u5.firstName, 'Athlete'); // empty name falls back safely
  } finally { await stop(server); }
});

// ── No sensitive/free-text data anywhere in the response ────────────────

test('no password, guardian token, or raw guardian email ever appears in the response', async () => {
  const { server, baseUrl } = await startServer();
  try {
    const { body } = await getJson(baseUrl);
    const json = JSON.stringify(body);
    assert.doesNotMatch(json, /bcrypt-hash-should-never-leak|super-secret-token-should-never-leak/);
    assert.doesNotMatch(json, /guardian1@example\.com|guardian2@example\.com/);
    assert.doesNotMatch(json, /"password"|"guardianConsentToken"|"guardianEmail"/);
  } finally { await stop(server); }
});

test('no chat/journal/prescription free-text content ever appears in the response', async () => {
  const { server, baseUrl } = await startServer();
  try {
    const { body } = await getJson(baseUrl);
    const json = JSON.stringify(body);
    assert.doesNotMatch(json, /never leak/); // every fixture free-text field uses this marker
    assert.doesNotMatch(json, /"content"|"cardContent"|"situation"|"outcomeLesson"|"summary"/);
  } finally { await stop(server); }
});

test('no dateOfBirth is ever returned', async () => {
  const { server, baseUrl } = await startServer();
  try {
    const { body } = await getJson(baseUrl);
    assert.doesNotMatch(JSON.stringify(body), /dateOfBirth/);
  } finally { await stop(server); }
});
