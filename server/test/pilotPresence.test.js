// Pilot Presence Tracking — services/presence.js, routes/activity.js, and
// the founderPilotOverview.js presence extension (isLive/summarizePresence
// + the lastSeenAt/isLive/liveNow fields it now returns).
//
// Deliberately its own file, separate from activityTracking.test.js and
// founderPilotOverviewApi.test.js — presence is a second, independent
// signal from lastActiveAt and must never be tested (or implemented) as
// though it were the same thing.

const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const jwt = require('jsonwebtoken');

const { createTouchPresence } = require('../src/services/presence');
const { createActivityRouter } = require('../src/routes/activity');
const {
  createFounderPilotOverviewRouter,
  isLive,
  summarizePresence,
  LIVE_THRESHOLD_MS,
} = require('../src/routes/founderPilotOverview');

// ── services/presence.js — pure write-path unit tests ────────────────────

function makeFakeUserClient(seed = {}) {
  const usersById = { ...seed };
  return {
    user: {
      update: async ({ where, data }) => {
        const existing = usersById[where.id];
        if (!existing) throw new Error('no such user');
        Object.assign(existing, data);
        return { ...existing };
      },
    },
    __usersById: usersById,
  };
}

test('touchPresence: writes lastSeenAt, never touches lastActiveAt', async () => {
  const client = makeFakeUserClient({ u1: { id: 'u1', lastActiveAt: null, lastSeenAt: null } });
  const touchPresence = createTouchPresence(client);
  const at = new Date('2026-08-01T12:00:00Z');

  await touchPresence('u1', at);

  assert.equal(client.__usersById.u1.lastSeenAt.getTime(), at.getTime());
  assert.equal(client.__usersById.u1.lastActiveAt, null);
});

test('touchPresence: repeated touches work safely and always reflect the latest timestamp', async () => {
  const client = makeFakeUserClient({ u1: { id: 'u1', lastActiveAt: null, lastSeenAt: null } });
  const touchPresence = createTouchPresence(client);

  await touchPresence('u1', new Date('2026-08-01T12:00:00Z'));
  await touchPresence('u1', new Date('2026-08-01T12:01:00Z'));
  await touchPresence('u1', new Date('2026-08-01T12:02:00Z'));

  assert.equal(client.__usersById.u1.lastSeenAt.getTime(), new Date('2026-08-01T12:02:00Z').getTime());
});

test('touchPresence: a missing userId is a silent no-op', async () => {
  const client = makeFakeUserClient({});
  const touchPresence = createTouchPresence(client);
  await touchPresence(undefined); // must not throw
  await touchPresence(null);
});

test('touchPresence: a DB error is caught and swallowed, never rethrown', async () => {
  const client = {
    user: { update: async () => { throw new Error('db exploded'); } },
  };
  const touchPresence = createTouchPresence(client);
  await assert.doesNotReject(() => touchPresence('u1'));
});

// ── routes/activity.js — POST /presence ──────────────────────────────────

const TEST_JWT_SECRET = 'pilot-presence-athlete-test-secret';
const ORIGINAL_JWT_SECRET = process.env.JWT_SECRET;
test.before(() => { process.env.JWT_SECRET = TEST_JWT_SECRET; });
test.after(() => {
  if (ORIGINAL_JWT_SECRET === undefined) delete process.env.JWT_SECRET;
  else process.env.JWT_SECRET = ORIGINAL_JWT_SECRET;
});

function athleteToken(userId) {
  return jwt.sign({ userId }, TEST_JWT_SECRET, { expiresIn: '15m' });
}

function buildActivityApp(touchPresenceFn) {
  const app = express();
  app.use(express.json());
  app.use('/api/activity', createActivityRouter(touchPresenceFn));
  return app;
}
function start(app) {
  return new Promise((resolve) => {
    const server = app.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      resolve({ server, baseUrl: `http://127.0.0.1:${port}` });
    });
  });
}
function stop(server) {
  return new Promise((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));
}

test('POST /api/activity/presence requires authentication', async () => {
  const app = buildActivityApp(async () => {});
  const { server, baseUrl } = await start(app);
  try {
    const res = await fetch(`${baseUrl}/api/activity/presence`, { method: 'POST' });
    assert.equal(res.status, 401);
  } finally { await stop(server); }
});

test('POST /api/activity/presence derives userId from the JWT — a client-supplied userId in the body is ignored', async () => {
  const calls = [];
  const app = buildActivityApp(async (userId) => { calls.push(userId); });
  const { server, baseUrl } = await start(app);
  try {
    const res = await fetch(`${baseUrl}/api/activity/presence`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${athleteToken('real-user')}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: 'someone-elses-id' }),
    });
    assert.equal(res.status, 200);
    assert.deepEqual(calls, ['real-user']);
  } finally { await stop(server); }
});

test('POST /api/activity/presence updates lastSeenAt via the real touchPresence, and never touches lastActiveAt', async () => {
  const client = makeFakeUserClient({ u1: { id: 'u1', lastActiveAt: new Date('2020-01-01T00:00:00Z'), lastSeenAt: null } });
  const touchPresence = createTouchPresence(client);
  const app = buildActivityApp(touchPresence);
  const { server, baseUrl } = await start(app);
  try {
    const res = await fetch(`${baseUrl}/api/activity/presence`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${athleteToken('u1')}` },
    });
    assert.equal(res.status, 200);
    assert.ok(client.__usersById.u1.lastSeenAt instanceof Date);
    assert.equal(client.__usersById.u1.lastActiveAt.toISOString(), '2020-01-01T00:00:00.000Z');
  } finally { await stop(server); }
});

test('POST /api/activity/presence: repeated calls all succeed and never error the athlete experience', async () => {
  const client = makeFakeUserClient({ u1: { id: 'u1', lastActiveAt: null, lastSeenAt: null } });
  const touchPresence = createTouchPresence(client);
  const app = buildActivityApp(touchPresence);
  const { server, baseUrl } = await start(app);
  try {
    for (let i = 0; i < 3; i++) {
      const res = await fetch(`${baseUrl}/api/activity/presence`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${athleteToken('u1')}` },
      });
      assert.equal(res.status, 200);
    }
  } finally { await stop(server); }
});

test('POST /api/activity/presence never returns an error even when the underlying write fails — silent for the athlete', async () => {
  const failingTouch = async () => { /* touchPresence's own contract: swallows errors, never throws */ };
  const app = buildActivityApp(failingTouch);
  const { server, baseUrl } = await start(app);
  try {
    const res = await fetch(`${baseUrl}/api/activity/presence`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${athleteToken('u1')}` },
    });
    assert.equal(res.status, 200);
  } finally { await stop(server); }
});

// ── isLive / summarizePresence — pure boundary tests ──────────────────────

test('LIVE_THRESHOLD_MS is 2 minutes', () => {
  assert.equal(LIVE_THRESHOLD_MS, 2 * 60 * 1000);
});

test('isLive: null lastSeenAt is never live ("Never seen")', () => {
  assert.equal(isLive(null, new Date()), false);
  assert.equal(isLive(undefined, new Date()), false);
});

test('isLive: 1 minute 59 seconds ago is live', () => {
  const now = new Date('2026-08-01T12:00:00Z');
  const lastSeenAt = new Date(now.getTime() - (119 * 1000)); // 1:59 ago
  assert.equal(isLive(lastSeenAt, now), true);
});

test('isLive: exactly 2 minutes ago is NOT live', () => {
  const now = new Date('2026-08-01T12:00:00Z');
  const lastSeenAt = new Date(now.getTime() - LIVE_THRESHOLD_MS); // exactly 2:00 ago
  assert.equal(isLive(lastSeenAt, now), false);
});

test('isLive: 2 minutes 1 second ago is NOT live', () => {
  const now = new Date('2026-08-01T12:00:00Z');
  const lastSeenAt = new Date(now.getTime() - (121 * 1000));
  assert.equal(isLive(lastSeenAt, now), false);
});

test('isLive: 0 seconds ago (just touched) is live', () => {
  const now = new Date('2026-08-01T12:00:00Z');
  assert.equal(isLive(now, now), true);
});

test('summarizePresence: counts only rows currently within the live window', () => {
  const now = new Date('2026-08-01T12:00:00Z');
  const rows = [
    { lastSeenAt: new Date(now.getTime() - 10 * 1000) },   // live
    { lastSeenAt: new Date(now.getTime() - 119 * 1000) },  // live (boundary)
    { lastSeenAt: new Date(now.getTime() - 120 * 1000) },  // not live (boundary)
    { lastSeenAt: new Date(now.getTime() - 3600 * 1000) }, // not live
    { lastSeenAt: null },                                   // never seen
  ];
  assert.deepEqual(summarizePresence(rows, now), { liveNow: 2 });
});

test('summarizePresence: zero live athletes returns liveNow 0, never throws on an empty list', () => {
  assert.deepEqual(summarizePresence([], new Date()), { liveNow: 0 });
});

// ── GET /api/founder/pilot-overview — presence fields on the real response ──

const TEST_FOUNDER_SECRET = 'pilot-presence-founder-test-secret';
const ORIGINAL_FOUNDER_SECRET = process.env.FOUNDER_SESSION_SECRET;
test.before(() => { process.env.FOUNDER_SESSION_SECRET = TEST_FOUNDER_SECRET; });
test.after(() => {
  if (ORIGINAL_FOUNDER_SECRET === undefined) delete process.env.FOUNDER_SESSION_SECRET;
  else process.env.FOUNDER_SESSION_SECRET = ORIGINAL_FOUNDER_SECRET;
});

function founderToken() {
  return jwt.sign({ role: 'founder' }, TEST_FOUNDER_SECRET, { expiresIn: '15m' });
}

function project(row, select) {
  if (!select) return row;
  const out = {};
  for (const k of Object.keys(select)) if (select[k]) out[k] = row[k];
  return out;
}

// Minimal stub covering every model founderPilotOverview.js's Promise.all
// touches — empty/trivial for everything except `user`, which is what this
// file's tests actually exercise.
function makeOverviewStubClient(users) {
  return {
    user: {
      count: async ({ where } = {}) => {
        if (!where) return users.length;
        if (where.tier) return users.filter((u) => u.tier === where.tier).length;
        if (where.createdAt) return users.filter((u) => u.createdAt.getTime() >= where.createdAt.gte.getTime()).length;
        if (where.guardianEmail) return users.filter((u) => u.guardianEmail != null).length;
        if (where.guardianConsentAt) return users.filter((u) => u.guardianConsentAt != null).length;
        return users.length;
      },
      findMany: async ({ orderBy, take, select } = {}) => {
        let list = [...users];
        if (orderBy?.createdAt === 'desc') list = list.sort((a, b) => b.createdAt - a.createdAt);
        if (typeof take === 'number') list = list.slice(0, take);
        return list.map((u) => project(u, select));
      },
    },
    onboardingSession: { findMany: async () => [] },
    message: { findMany: async () => [] },
    chatSession: { count: async () => 0 },
    prescription: { findMany: async () => [] },
  };
}

function buildOverviewApp(client) {
  const app = express();
  app.use('/api/founder/pilot-overview', createFounderPilotOverviewRouter(client));
  return app;
}

test('GET /api/founder/pilot-overview: includes lastSeenAt, isLive, and a correct liveNow count', async () => {
  const now = new Date();
  const users = [
    {
      id: 'u1', name: 'Live Athlete', createdAt: new Date(now.getTime() - 86400000),
      onboardingDone: true, tier: 'free', guardianEmail: null, guardianConsentAt: null,
      lastActiveAt: null,
      lastSeenAt: new Date(now.getTime() - 10 * 1000), // 10s ago — live
    },
    {
      id: 'u2', name: 'Offline Athlete', createdAt: new Date(now.getTime() - 86400000),
      onboardingDone: true, tier: 'free', guardianEmail: null, guardianConsentAt: null,
      lastActiveAt: null,
      lastSeenAt: new Date(now.getTime() - 60 * 60 * 1000), // 1h ago — not live
    },
    {
      id: 'u3', name: 'Never Seen', createdAt: new Date(now.getTime() - 86400000),
      onboardingDone: false, tier: 'free', guardianEmail: null, guardianConsentAt: null,
      lastActiveAt: null,
      lastSeenAt: null, // never seen
    },
  ];
  const client = makeOverviewStubClient(users);
  const app = buildOverviewApp(client);
  const { server, baseUrl } = await start(app);
  try {
    const res = await fetch(`${baseUrl}/api/founder/pilot-overview`, {
      headers: { Authorization: `Bearer ${founderToken()}` },
    });
    assert.equal(res.status, 200);
    const body = await res.json();

    assert.equal(body.metrics.liveNow, 1);

    const byId = Object.fromEntries(body.recentAthletes.map((a) => [a.id, a]));
    assert.equal(byId.u1.isLive, true);
    assert.ok(byId.u1.lastSeenAt);
    assert.equal(byId.u2.isLive, false);
    assert.ok(byId.u2.lastSeenAt);
    assert.equal(byId.u3.isLive, false);
    assert.equal(byId.u3.lastSeenAt, null);
  } finally { await stop(server); }
});

test('GET /api/founder/pilot-overview: lastActiveAt and isReturning are still present and independent of presence', async () => {
  const now = new Date();
  const users = [
    {
      id: 'u1', name: 'Athlete', createdAt: new Date(now.getTime() - 10 * 86400000),
      onboardingDone: true, tier: 'free', guardianEmail: null, guardianConsentAt: null,
      lastActiveAt: new Date(now.getTime() - 3600 * 1000), // active an hour ago
      lastSeenAt: null, // never had the app open since this shipped — still fine
    },
  ];
  const client = makeOverviewStubClient(users);
  const app = buildOverviewApp(client);
  const { server, baseUrl } = await start(app);
  try {
    const res = await fetch(`${baseUrl}/api/founder/pilot-overview`, {
      headers: { Authorization: `Bearer ${founderToken()}` },
    });
    const body = await res.json();
    const athlete = body.recentAthletes.find((a) => a.id === 'u1');
    assert.ok(athlete.lastActiveAt);
    assert.equal(athlete.isLive, false);
    assert.equal(athlete.lastSeenAt, null);
  } finally { await stop(server); }
});

test('GET /api/founder/pilot-overview requires the founder session token', async () => {
  const client = makeOverviewStubClient([]);
  const app = buildOverviewApp(client);
  const { server, baseUrl } = await start(app);
  try {
    const res = await fetch(`${baseUrl}/api/founder/pilot-overview`);
    assert.equal(res.status, 401);
  } finally { await stop(server); }
});
