// Genuine end-to-end wiring test for Pilot Tracking Phase 2A on
// POST /api/mind-journal — real HTTP requests through the real
// createMindJournalRouter, a fake (in-memory) Prisma-like client for the
// route's own data (same technique as mindJournalApi.test.js), and
// activityTracking.touchActivity swapped for a recording mock via the
// module-reference import (mindJournal.js does `const activityTracking =
// require(...)`, not a destructure, specifically so this swap works — same
// reasoning as contact.test.js's emailService swap).

const test = require('node:test');
const assert = require('node:assert/strict');
const jwt = require('jsonwebtoken');
const express = require('express');

const authenticate = require('../src/middleware/authenticate');
const { createRequireGuardianConsent } = require('../src/middleware/requireGuardianConsent');
const { createMindJournalRouter } = require('../src/routes/mindJournal');
const activityTracking = require('../src/services/activityTracking');

const TEST_JWT_SECRET = 'activity-wiring-test-secret';
const ORIGINAL_JWT_SECRET = process.env.JWT_SECRET;
test.before(() => { process.env.JWT_SECRET = TEST_JWT_SECRET; });
test.after(() => {
  if (ORIGINAL_JWT_SECRET === undefined) delete process.env.JWT_SECRET;
  else process.env.JWT_SECRET = ORIGINAL_JWT_SECRET;
});

function tokenFor(userId) {
  return jwt.sign({ userId }, TEST_JWT_SECRET, { expiresIn: '15m' });
}

function adult() {
  const now = new Date();
  return { dateOfBirth: new Date(now.getFullYear() - 25, now.getMonth(), now.getDate()), guardianConsentAt: null };
}

function makeFakeClient() {
  const usersById = {};
  const entriesById = {};
  let nextId = 1;
  return {
    user: {
      findUnique: async ({ where }) => usersById[where.id] || { id: where.id, language: 'en' },
      update: async ({ where, data }) => {
        usersById[where.id] = { ...(usersById[where.id] || { id: where.id }), ...data };
        return usersById[where.id];
      },
    },
    mindJournalEntry: {
      create: async ({ data }) => {
        const entry = { id: `mj-${nextId++}`, ...data, createdAt: new Date() };
        entriesById[entry.id] = entry;
        return entry;
      },
    },
    __usersById: usersById,
  };
}

function buildApp(client) {
  const app = express();
  app.use(express.json());
  const consentMiddleware = createRequireGuardianConsent(async (userId) => {
    const u = await client.user.findUnique({ where: { id: userId } });
    return u ? { dateOfBirth: u.dateOfBirth, guardianConsentAt: u.guardianConsentAt } : adult();
  });
  const router = createMindJournalRouter(client, consentMiddleware);
  app.use('/api/mind-journal', router);
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

async function withApp(client, fn) {
  const app = buildApp(client);
  const { server, baseUrl } = await start(app);
  try {
    await fn(baseUrl);
  } finally {
    await stop(server);
  }
}

function mockTouchActivity() {
  const original = activityTracking.touchActivity;
  const calls = [];
  activityTracking.touchActivity = async (userId, occurredAt) => { calls.push({ userId, occurredAt }); };
  return { calls, restore: () => { activityTracking.touchActivity = original; } };
}

test('a successfully created Mind Journal entry touches activity for that athlete', async () => {
  const client = makeFakeClient();
  client.__usersById['u1'] = { id: 'u1', ...adult() };
  const mock = mockTouchActivity();
  try {
    await withApp(client, async (baseUrl) => {
      const res = await fetch(`${baseUrl}/api/mind-journal`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${tokenFor('u1')}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ states: ['calm'], note: 'felt good today' }),
      });
      assert.equal(res.status, 200);
    });
    assert.equal(mock.calls.length, 1);
    assert.equal(mock.calls[0].userId, 'u1');
  } finally {
    mock.restore();
  }
});

test('a safety-flagged submission (no entry saved) does NOT touch activity', async () => {
  const client = makeFakeClient();
  client.__usersById['u1'] = { id: 'u1', ...adult() };
  const mock = mockTouchActivity();
  try {
    await withApp(client, async (baseUrl) => {
      const res = await fetch(`${baseUrl}/api/mind-journal`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${tokenFor('u1')}`, 'Content-Type': 'application/json' },
        // A crisis-pattern note trips the deterministic safety screen —
        // exact trigger text mirrors the existing safety test fixtures'
        // convention in this repo (a phrase the screener is known to flag).
        body: JSON.stringify({ states: ['nervous'], note: 'i want to end it all' }),
      });
      const body = await res.json();
      assert.equal(body.safetyFlag, 'needs_support');
    });
    assert.equal(mock.calls.length, 0, 'a safety-blocked submission created no entry and must not touch activity');
  } finally {
    mock.restore();
  }
});

test('a validation failure (missing required fields) does NOT touch activity', async () => {
  const client = makeFakeClient();
  client.__usersById['u1'] = { id: 'u1', ...adult() };
  const mock = mockTouchActivity();
  try {
    await withApp(client, async (baseUrl) => {
      const res = await fetch(`${baseUrl}/api/mind-journal`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${tokenFor('u1')}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({}), // no states, no note — invalid shape
      });
      assert.equal(res.status, 400);
    });
    assert.equal(mock.calls.length, 0);
  } finally {
    mock.restore();
  }
});

test('an unauthenticated request never reaches touchActivity', async () => {
  const client = makeFakeClient();
  const mock = mockTouchActivity();
  try {
    await withApp(client, async (baseUrl) => {
      const res = await fetch(`${baseUrl}/api/mind-journal`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ states: ['calm'] }),
      });
      assert.equal(res.status, 401);
    });
    assert.equal(mock.calls.length, 0);
  } finally {
    mock.restore();
  }
});
