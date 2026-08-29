// Push Notifications v1 — founder-only "Send test notification" utility
// (routes/founderPushTest.js). Real HTTP requests against an isolated
// express app, a real founder session JWT through the real
// founderAuthenticate middleware, an injected in-memory Prisma-like
// client, and the 'web-push' package replaced in the require cache with
// a controllable fake (same techniques as founderPilotCommunications.test.js
// and pushScheduler.test.js respectively) — no real database, no real
// network, no real VAPID keys.

const test = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const jwt = require('jsonwebtoken');
const express = require('express');

const webPushPath = require.resolve('web-push');

let sendBehavior = {}; // endpoint -> 'success' | statusCode
let sendCalls = [];

class FakeWebPushError extends Error {
  constructor(statusCode) {
    super('push service rejected the request');
    this.statusCode = statusCode;
  }
}

require.cache[webPushPath] = {
  id: webPushPath,
  filename: webPushPath,
  loaded: true,
  exports: {
    setVapidDetails: () => {},
    sendNotification: async (subscription, payload) => {
      sendCalls.push({ endpoint: subscription.endpoint, payload });
      const behavior = sendBehavior[subscription.endpoint] ?? 'success';
      if (behavior === 'success') return { statusCode: 201 };
      throw new FakeWebPushError(behavior);
    },
  },
};

process.env.VAPID_SUBJECT = 'mailto:test@example.test';
process.env.VAPID_PUBLIC_KEY = 'test-public-key';
process.env.VAPID_PRIVATE_KEY = 'test-private-key';

const pushSendPath = require.resolve('../src/services/pushSend');
const founderPushTestPath = require.resolve('../src/routes/founderPushTest');
delete require.cache[pushSendPath];
delete require.cache[founderPushTestPath];
require(pushSendPath).__resetConfigForTests();
const { NOTIFICATION_MESSAGES, REMINDER_ROUTE } = require(pushSendPath);
const { createFounderPushTestRouter } = require(founderPushTestPath);

const TEST_SECRET = 'founder-push-test-secret';
const ORIGINAL_SECRET = process.env.FOUNDER_SESSION_SECRET;
test.before(() => { process.env.FOUNDER_SESSION_SECRET = TEST_SECRET; });
test.after(() => {
  if (ORIGINAL_SECRET === undefined) delete process.env.FOUNDER_SESSION_SECRET;
  else process.env.FOUNDER_SESSION_SECRET = ORIGINAL_SECRET;
});

function founderToken() {
  return jwt.sign({ role: 'founder' }, TEST_SECRET, { expiresIn: '15m' });
}
function authed() {
  return { Authorization: `Bearer ${founderToken()}`, 'Content-Type': 'application/json' };
}

test.beforeEach(() => {
  sendBehavior = {};
  sendCalls = [];
});

// ── In-memory fake Prisma client ─────────────────────────────────────────

function makeFakeClient({ usersById = {}, subscriptions = [], preferencesByUserId = {} } = {}) {
  const storedSubscriptions = subscriptions.map((s) => ({ ...s }));
  const storedPreferences = { ...preferencesByUserId };

  return {
    user: {
      findUnique: async ({ where }) => (usersById[where.id] ? { ...usersById[where.id] } : null),
    },
    pushSubscription: {
      findMany: async ({ where }) => storedSubscriptions
        .filter((s) => s.userId === where.userId && (where.disabledAt === null ? s.disabledAt == null : true))
        .map((s) => ({ ...s })),
      update: async ({ where, data }) => {
        const s = storedSubscriptions.find((s) => s.id === where.id);
        if (s) Object.assign(s, data);
        return s ? { ...s } : null;
      },
    },
    pushNotificationPreference: {
      findUnique: async ({ where }) => (storedPreferences[where.userId] ? { ...storedPreferences[where.userId] } : null),
    },
    __getSub: (id) => storedSubscriptions.find((s) => s.id === id),
    __getPref: (userId) => storedPreferences[userId],
  };
}

function buildApp(client) {
  const app = express();
  app.use(express.json());
  app.use('/api/founder/push-test', createFounderPushTestRouter(client));
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

function adultUser(overrides = {}) {
  return { id: 'athlete-1', language: 'en', ...overrides };
}
function sub(overrides = {}) {
  return { id: overrides.id || 'sub-1', userId: overrides.userId, endpoint: overrides.endpoint || 'https://push.example/dev', p256dh: 'p', auth: 'a', disabledAt: null, ...overrides };
}

// ── Founder auth ──────────────────────────────────────────────────────────

test('POST /api/founder/push-test requires the founder session token', async () => {
  const client = makeFakeClient({ usersById: { u1: adultUser({ id: 'u1' }) } });
  await withApp(client, async (baseUrl) => {
    const res = await fetch(`${baseUrl}/api/founder/push-test`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: 'u1' }),
    });
    assert.equal(res.status, 401);
  });
});

test('the legacy static FOUNDER_TOKEN is never accepted here', async () => {
  const client = makeFakeClient({ usersById: { u1: adultUser({ id: 'u1' }) } });
  await withApp(client, async (baseUrl) => {
    const res = await fetch(`${baseUrl}/api/founder/push-test`, {
      method: 'POST',
      headers: { Authorization: 'Bearer some-legacy-static-token', 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: 'u1' }),
    });
    assert.equal(res.status, 401);
  });
});

// ── Validation / selected athlete only ───────────────────────────────────

test('requires userId in the body', async () => {
  const client = makeFakeClient();
  await withApp(client, async (baseUrl) => {
    const res = await fetch(`${baseUrl}/api/founder/push-test`, { method: 'POST', headers: authed(), body: JSON.stringify({}) });
    assert.equal(res.status, 400);
    assert.equal(sendCalls.length, 0);
  });
});

test('404 for an athlete that does not exist', async () => {
  const client = makeFakeClient();
  await withApp(client, async (baseUrl) => {
    const res = await fetch(`${baseUrl}/api/founder/push-test`, { method: 'POST', headers: authed(), body: JSON.stringify({ userId: 'ghost' }) });
    assert.equal(res.status, 404);
  });
});

test('sends only to the one selected athlete — a second athlete\'s subscriptions are never touched', async () => {
  const client = makeFakeClient({
    usersById: { u1: adultUser({ id: 'u1' }), u2: adultUser({ id: 'u2' }) },
    subscriptions: [sub({ id: 's1', userId: 'u1', endpoint: 'https://push.example/u1' }), sub({ id: 's2', userId: 'u2', endpoint: 'https://push.example/u2' })],
  });
  await withApp(client, async (baseUrl) => {
    const res = await fetch(`${baseUrl}/api/founder/push-test`, { method: 'POST', headers: authed(), body: JSON.stringify({ userId: 'u1' }) });
    assert.equal(res.status, 200);
    assert.equal(sendCalls.length, 1);
    assert.equal(sendCalls[0].endpoint, 'https://push.example/u1');
  });
});

// ── Active subscription required ─────────────────────────────────────────

test('no active subscription: result is "no_subscription", web-push is never called', async () => {
  const client = makeFakeClient({ usersById: { u1: adultUser({ id: 'u1' }) }, subscriptions: [] });
  await withApp(client, async (baseUrl) => {
    const res = await fetch(`${baseUrl}/api/founder/push-test`, { method: 'POST', headers: authed(), body: JSON.stringify({ userId: 'u1' }) });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.result, 'no_subscription');
    assert.equal(sendCalls.length, 0);
  });
});

test('a subscription that is already disabled is not treated as active', async () => {
  const client = makeFakeClient({
    usersById: { u1: adultUser({ id: 'u1' }) },
    subscriptions: [sub({ userId: 'u1', disabledAt: new Date() })],
  });
  await withApp(client, async (baseUrl) => {
    const res = await fetch(`${baseUrl}/api/founder/push-test`, { method: 'POST', headers: authed(), body: JSON.stringify({ userId: 'u1' }) });
    const body = await res.json();
    assert.equal(body.result, 'no_subscription');
  });
});

test('multiple active subscriptions: sends to every active device', async () => {
  const client = makeFakeClient({
    usersById: { u1: adultUser({ id: 'u1' }) },
    subscriptions: [
      sub({ id: 'sA', userId: 'u1', endpoint: 'https://push.example/a' }),
      sub({ id: 'sB', userId: 'u1', endpoint: 'https://push.example/b' }),
    ],
  });
  await withApp(client, async (baseUrl) => {
    const res = await fetch(`${baseUrl}/api/founder/push-test`, { method: 'POST', headers: authed(), body: JSON.stringify({ userId: 'u1' }) });
    const body = await res.json();
    assert.equal(body.result, 'sent');
    assert.equal(sendCalls.length, 2);
  });
});

// ── Uses the approved curated library + /dashboard destination ──────────

test('the payload uses the approved curated notification library and routes to /dashboard', async () => {
  const client = makeFakeClient({
    usersById: { u1: adultUser({ id: 'u1', language: 'en' }) },
    subscriptions: [sub({ userId: 'u1' })],
  });
  await withApp(client, async (baseUrl) => {
    const res = await fetch(`${baseUrl}/api/founder/push-test`, { method: 'POST', headers: authed(), body: JSON.stringify({ userId: 'u1' }) });
    assert.equal(res.status, 200);
    assert.equal(sendCalls.length, 1);
    const payload = JSON.parse(sendCalls[0].payload);
    assert.equal(payload.route, '/dashboard');
    assert.equal(payload.route, REMINDER_ROUTE);
    const match = NOTIFICATION_MESSAGES.some((m) => m.en.title === payload.title && m.en.body === payload.body);
    assert.ok(match, 'expected the sent title/body to be one of the approved curated messages');
  });
});

test('no custom free-text content is ever accepted — an arbitrary title/body in the request body is ignored', async () => {
  const client = makeFakeClient({
    usersById: { u1: adultUser({ id: 'u1' }) },
    subscriptions: [sub({ userId: 'u1' })],
  });
  await withApp(client, async (baseUrl) => {
    await fetch(`${baseUrl}/api/founder/push-test`, {
      method: 'POST',
      headers: authed(),
      body: JSON.stringify({ userId: 'u1', title: 'INJECTED TITLE', body: 'INJECTED BODY, journal: secret' }),
    });
    const payload = JSON.parse(sendCalls[0].payload);
    assert.notEqual(payload.title, 'INJECTED TITLE');
    assert.notEqual(payload.body, 'INJECTED BODY, journal: secret');
  });
});

// ── Never touches lastSentLocalDate / scheduler state ────────────────────

test('does not change lastSentLocalDate — the normal daily reminder entitlement is untouched', async () => {
  const client = makeFakeClient({
    usersById: { u1: adultUser({ id: 'u1' }) },
    subscriptions: [sub({ userId: 'u1' })],
    preferencesByUserId: { u1: { userId: 'u1', enabled: true, reminderTime: '18:00', timezone: 'Asia/Kolkata', lastSentLocalDate: '2026-08-01' } },
  });
  await withApp(client, async (baseUrl) => {
    const res = await fetch(`${baseUrl}/api/founder/push-test`, { method: 'POST', headers: authed(), body: JSON.stringify({ userId: 'u1' }) });
    assert.equal(res.status, 200);
    assert.equal(client.__getPref('u1').lastSentLocalDate, '2026-08-01', 'lastSentLocalDate must be untouched by a founder test send');
  });
});

test('never writes to PushNotificationPreference at all — enabled/reminderTime/timezone stay exactly as stored', async () => {
  const originalPref = { userId: 'u1', enabled: false, reminderTime: '18:00', timezone: 'Asia/Kolkata', lastSentLocalDate: null };
  const client = makeFakeClient({
    usersById: { u1: adultUser({ id: 'u1' }) },
    subscriptions: [sub({ userId: 'u1' })],
    preferencesByUserId: { u1: { ...originalPref } },
  });
  await withApp(client, async (baseUrl) => {
    await fetch(`${baseUrl}/api/founder/push-test`, { method: 'POST', headers: authed(), body: JSON.stringify({ userId: 'u1' }) });
    assert.deepEqual(client.__getPref('u1'), originalPref);
  });
});

test('works even when the athlete has no PushNotificationPreference row at all (falls back to UTC, never writes one)', async () => {
  const client = makeFakeClient({
    usersById: { u1: adultUser({ id: 'u1' }) },
    subscriptions: [sub({ userId: 'u1' })],
  });
  await withApp(client, async (baseUrl) => {
    const res = await fetch(`${baseUrl}/api/founder/push-test`, { method: 'POST', headers: authed(), body: JSON.stringify({ userId: 'u1' }) });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.result, 'sent');
    assert.equal(client.__getPref('u1'), undefined);
  });
});

// ── Terminal subscription failures handled the same way the scheduler does ──

test('a 404/410 from one device disables only that subscription, never hard-deletes it', async () => {
  const client = makeFakeClient({
    usersById: { u1: adultUser({ id: 'u1' }) },
    subscriptions: [sub({ id: 'dead', userId: 'u1', endpoint: 'https://push.example/dead' })],
  });
  sendBehavior['https://push.example/dead'] = 410;
  await withApp(client, async (baseUrl) => {
    const res = await fetch(`${baseUrl}/api/founder/push-test`, { method: 'POST', headers: authed(), body: JSON.stringify({ userId: 'u1' }) });
    const body = await res.json();
    assert.equal(body.result, 'failed');
    assert.notEqual(client.__getSub('dead').disabledAt, null);
  });
});

test('a transient failure never disables the subscription, and result is "failed" when every device fails', async () => {
  const client = makeFakeClient({
    usersById: { u1: adultUser({ id: 'u1' }) },
    subscriptions: [sub({ id: 'flaky', userId: 'u1', endpoint: 'https://push.example/flaky' })],
  });
  sendBehavior['https://push.example/flaky'] = 500;
  await withApp(client, async (baseUrl) => {
    const res = await fetch(`${baseUrl}/api/founder/push-test`, { method: 'POST', headers: authed(), body: JSON.stringify({ userId: 'u1' }) });
    const body = await res.json();
    assert.equal(body.result, 'failed');
    assert.equal(client.__getSub('flaky').disabledAt, null);
  });
});

test('one succeeding device out of two is enough to report "sent"', async () => {
  const client = makeFakeClient({
    usersById: { u1: adultUser({ id: 'u1' }) },
    subscriptions: [
      sub({ id: 'ok', userId: 'u1', endpoint: 'https://push.example/ok' }),
      sub({ id: 'dead', userId: 'u1', endpoint: 'https://push.example/dead2' }),
    ],
  });
  sendBehavior['https://push.example/dead2'] = 410;
  await withApp(client, async (baseUrl) => {
    const res = await fetch(`${baseUrl}/api/founder/push-test`, { method: 'POST', headers: authed(), body: JSON.stringify({ userId: 'u1' }) });
    const body = await res.json();
    assert.equal(body.result, 'sent');
    assert.equal(body.sentCount, 1);
    assert.equal(body.failedCount, 1);
  });
});

// ── No Pilot Communication coupling ──────────────────────────────────────

test('never creates or reads a PilotCommunication row — the fake client has no such model and nothing throws', async () => {
  // The fake client above deliberately exposes NO pilotCommunication*
  // methods at all — if the route ever touched one, this test would throw
  // a "not a function" error instead of completing normally.
  const client = makeFakeClient({ usersById: { u1: adultUser({ id: 'u1' }) }, subscriptions: [sub({ userId: 'u1' })] });
  await withApp(client, async (baseUrl) => {
    const res = await fetch(`${baseUrl}/api/founder/push-test`, { method: 'POST', headers: authed(), body: JSON.stringify({ userId: 'u1' }) });
    assert.equal(res.status, 200);
  });
});

// Strips `//` line comments before the boundary check below, so an
// explanatory comment about what this file deliberately does NOT do (e.g.
// "this is not a Pilot Communication") can't itself trip the very
// assertion it explains.
function stripLineComments(source) {
  return source.split('\n').filter((l) => !l.trim().startsWith('//')).join('\n');
}

test('source: founderPushTest.js CODE never references PilotCommunication or a broadcast-to-all path', () => {
  const code = stripLineComments(readFileSync(founderPushTestPath, 'utf8'));
  assert.doesNotMatch(code, /pilotCommunication/i);
  assert.doesNotMatch(code, /audienceMode|ALL_PILOT/i);
  assert.doesNotMatch(code, /client\.user\.findMany/); // never resolves "every athlete"
});
