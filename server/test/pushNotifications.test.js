// Push Notifications v1 — routes/pushNotifications.js. Real HTTP requests
// against an isolated express app, a real signed JWT through the real
// `authenticate` middleware, and an injected in-memory Prisma-like client
// — no real database anywhere in this file. Same technique as
// mindJournalApi.test.js / pilotCommunications.test.js.

const test = require('node:test');
const assert = require('node:assert/strict');
const jwt = require('jsonwebtoken');
const express = require('express');

const { createPushNotificationsRouter } = require('../src/routes/pushNotifications');

const TEST_JWT_SECRET = 'push-notifications-api-test-secret';
const ORIGINAL_JWT_SECRET = process.env.JWT_SECRET;
test.before(() => { process.env.JWT_SECRET = TEST_JWT_SECRET; });
test.after(() => {
  if (ORIGINAL_JWT_SECRET === undefined) delete process.env.JWT_SECRET;
  else process.env.JWT_SECRET = ORIGINAL_JWT_SECRET;
});

function tokenFor(userId) {
  return jwt.sign({ userId }, TEST_JWT_SECRET, { expiresIn: '15m' });
}

function adultUser(overrides = {}) {
  return { dateOfBirth: null, guardianConsentAt: null, ...overrides };
}
function unconsentedMinor() {
  const now = new Date();
  return { dateOfBirth: new Date(now.getFullYear() - 15, now.getMonth(), now.getDate()), guardianConsentAt: null };
}
function consentedMinor() {
  const now = new Date();
  return { dateOfBirth: new Date(now.getFullYear() - 15, now.getMonth(), now.getDate()), guardianConsentAt: new Date() };
}

function validSubscription(endpoint = 'https://push.example/dev-1') {
  return { endpoint, keys: { p256dh: 'p256dh-value', auth: 'auth-value' } };
}

// ── In-memory fake Prisma client ─────────────────────────────────────────

function makeFakeClient(seed = {}) {
  const usersById = seed.usersById || {};
  const preferencesByUserId = seed.preferencesByUserId || {}; // userId -> row
  const subscriptionsByEndpoint = seed.subscriptionsByEndpoint || {}; // endpoint -> row
  let nextId = 1;

  return {
    user: {
      findUnique: async ({ where }) => (usersById[where.id] ? { ...usersById[where.id] } : null),
    },
    pushNotificationPreference: {
      findUnique: async ({ where }) => preferencesByUserId[where.userId] || null,
      upsert: async ({ where, create, update }) => {
        const existing = preferencesByUserId[where.userId];
        if (existing) {
          Object.assign(existing, update);
          return existing;
        }
        const row = { id: `pref-${nextId++}`, createdAt: new Date(), updatedAt: new Date(), ...create };
        preferencesByUserId[where.userId] = row;
        return row;
      },
    },
    pushSubscription: {
      findUnique: async ({ where }) => subscriptionsByEndpoint[where.endpoint] || null,
      upsert: async ({ where, create, update }) => {
        const existing = subscriptionsByEndpoint[where.endpoint];
        if (existing) {
          Object.assign(existing, update);
          return existing;
        }
        const row = { id: `sub-${nextId++}`, createdAt: new Date(), updatedAt: new Date(), disabledAt: null, ...create };
        subscriptionsByEndpoint[where.endpoint] = row;
        return row;
      },
      update: async ({ where, data }) => {
        const row = subscriptionsByEndpoint[where.endpoint];
        if (row) Object.assign(row, data);
        return row;
      },
    },
    __usersById: usersById,
    __preferencesByUserId: preferencesByUserId,
    __subscriptionsByEndpoint: subscriptionsByEndpoint,
  };
}

function buildApp(client) {
  const app = express();
  app.use(express.json());
  app.use('/api/push-notifications', createPushNotificationsRouter(client));
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

// ── Auth required ─────────────────────────────────────────────────────────

for (const [method, path] of [
  ['GET', '/api/push-notifications/preferences'],
  ['POST', '/api/push-notifications/subscribe'],
  ['PATCH', '/api/push-notifications/preferences'],
  ['POST', '/api/push-notifications/unsubscribe'],
]) {
  test(`${method} ${path} requires authentication (401 with no token)`, async () => {
    const client = makeFakeClient();
    await withApp(client, async (baseUrl) => {
      const res = await fetch(`${baseUrl}${path}`, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: method === 'GET' ? undefined : JSON.stringify({}),
      });
      assert.equal(res.status, 401);
    });
  });
}

// ── userId cannot be spoofed ────────────────────────────────────────────

test('subscribe: a client-supplied userId in the body is ignored — the row belongs to the authenticated user', async () => {
  const client = makeFakeClient({ usersById: { u1: adultUser() } });
  await withApp(client, async (baseUrl) => {
    const res = await fetch(`${baseUrl}/api/push-notifications/subscribe`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${tokenFor('u1')}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        userId: 'someone-elses-id',
        subscription: validSubscription(),
        reminderTime: '18:00',
        timezone: 'Asia/Kolkata',
      }),
    });
    assert.equal(res.status, 200);
    assert.equal(client.__subscriptionsByEndpoint['https://push.example/dev-1'].userId, 'u1');
    assert.equal(client.__preferencesByUserId['u1'].enabled, true);
  });
});

// ── Under-18 without guardian consent cannot enable ─────────────────────

test('subscribe: an unconsented minor is blocked with 403 CONSENT_REQUIRED, no rows created', async () => {
  const client = makeFakeClient({ usersById: { minor1: unconsentedMinor() } });
  await withApp(client, async (baseUrl) => {
    const res = await fetch(`${baseUrl}/api/push-notifications/subscribe`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${tokenFor('minor1')}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ subscription: validSubscription(), reminderTime: '18:00', timezone: 'Asia/Kolkata' }),
    });
    assert.equal(res.status, 403);
    const body = await res.json();
    assert.equal(body.code, 'CONSENT_REQUIRED');
    assert.equal(client.__preferencesByUserId['minor1'], undefined);
    assert.equal(Object.keys(client.__subscriptionsByEndpoint).length, 0);
  });
});

test('subscribe: a consented minor can enable notifications', async () => {
  const client = makeFakeClient({ usersById: { minor2: consentedMinor() } });
  await withApp(client, async (baseUrl) => {
    const res = await fetch(`${baseUrl}/api/push-notifications/subscribe`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${tokenFor('minor2')}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ subscription: validSubscription('https://push.example/minor2'), reminderTime: '18:00', timezone: 'Asia/Kolkata' }),
    });
    assert.equal(res.status, 200);
  });
});

test('PATCH preferences: an unconsented minor CANNOT turn notifications on directly, bypassing subscribe', async () => {
  const client = makeFakeClient({ usersById: { minor3: unconsentedMinor() } });
  await withApp(client, async (baseUrl) => {
    const res = await fetch(`${baseUrl}/api/push-notifications/preferences`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${tokenFor('minor3')}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ enabled: true }),
    });
    assert.equal(res.status, 403);
  });
});

test('PATCH preferences: turning notifications OFF always succeeds, even for an unconsented minor', async () => {
  const client = makeFakeClient({
    usersById: { minor4: unconsentedMinor() },
    preferencesByUserId: { minor4: { id: 'p1', userId: 'minor4', enabled: true, reminderTime: '18:00', timezone: 'Asia/Kolkata' } },
  });
  await withApp(client, async (baseUrl) => {
    const res = await fetch(`${baseUrl}/api/push-notifications/preferences`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${tokenFor('minor4')}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ enabled: false }),
    });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.preference.enabled, false);
  });
});

// ── Subscribe validation ─────────────────────────────────────────────────

test('subscribe: rejects a missing/malformed subscription payload', async () => {
  const client = makeFakeClient({ usersById: { u2: adultUser() } });
  await withApp(client, async (baseUrl) => {
    for (const badSubscription of [undefined, {}, { endpoint: 'not-https' }, { endpoint: 'https://x', keys: {} }]) {
      const res = await fetch(`${baseUrl}/api/push-notifications/subscribe`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${tokenFor('u2')}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ subscription: badSubscription, reminderTime: '18:00', timezone: 'Asia/Kolkata' }),
      });
      assert.equal(res.status, 400, `expected 400 for ${JSON.stringify(badSubscription)}`);
    }
  });
});

test('subscribe: rejects invalid reminderTime and timezone', async () => {
  const client = makeFakeClient({ usersById: { u3: adultUser() } });
  await withApp(client, async (baseUrl) => {
    const badTime = await fetch(`${baseUrl}/api/push-notifications/subscribe`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${tokenFor('u3')}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ subscription: validSubscription('https://push.example/u3'), reminderTime: '6pm', timezone: 'Asia/Kolkata' }),
    });
    assert.equal(badTime.status, 400);

    const badTz = await fetch(`${baseUrl}/api/push-notifications/subscribe`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${tokenFor('u3')}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ subscription: validSubscription('https://push.example/u3b'), reminderTime: '18:00', timezone: 'Not/AZone' }),
    });
    assert.equal(badTz.status, 400);
  });
});

// ── Unique endpoint / reassignment behaviour ─────────────────────────────

test('subscribe: an endpoint already owned by a different user is reassigned, never shared', async () => {
  const client = makeFakeClient({
    usersById: { userA: adultUser(), userB: adultUser() },
    subscriptionsByEndpoint: {
      'https://push.example/shared-device': { id: 'sub-1', userId: 'userA', endpoint: 'https://push.example/shared-device', p256dh: 'old', auth: 'old', disabledAt: new Date() },
    },
  });
  await withApp(client, async (baseUrl) => {
    const res = await fetch(`${baseUrl}/api/push-notifications/subscribe`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${tokenFor('userB')}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ subscription: validSubscription('https://push.example/shared-device'), reminderTime: '18:00', timezone: 'Asia/Kolkata' }),
    });
    assert.equal(res.status, 200);
    const row = client.__subscriptionsByEndpoint['https://push.example/shared-device'];
    assert.equal(row.userId, 'userB');
    assert.equal(row.disabledAt, null, 'reassigning must re-activate the subscription');
  });
});

// ── Multiple devices ──────────────────────────────────────────────────────

test('subscribe: the same athlete can register a second device without disturbing the first', async () => {
  const client = makeFakeClient({ usersById: { u4: adultUser() } });
  await withApp(client, async (baseUrl) => {
    await fetch(`${baseUrl}/api/push-notifications/subscribe`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${tokenFor('u4')}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ subscription: validSubscription('https://push.example/phone'), reminderTime: '18:00', timezone: 'Asia/Kolkata' }),
    });
    await fetch(`${baseUrl}/api/push-notifications/subscribe`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${tokenFor('u4')}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ subscription: validSubscription('https://push.example/laptop'), reminderTime: '18:00', timezone: 'Asia/Kolkata' }),
    });
    assert.equal(client.__subscriptionsByEndpoint['https://push.example/phone'].userId, 'u4');
    assert.equal(client.__subscriptionsByEndpoint['https://push.example/laptop'].userId, 'u4');
  });
});

// ── Preference enable/disable + time/timezone update ─────────────────────

test('PATCH preferences: updates reminderTime and timezone on an already-enabled preference', async () => {
  const client = makeFakeClient({
    usersById: { u5: adultUser() },
    preferencesByUserId: { u5: { id: 'p5', userId: 'u5', enabled: true, reminderTime: '18:00', timezone: 'Asia/Kolkata' } },
  });
  await withApp(client, async (baseUrl) => {
    const res = await fetch(`${baseUrl}/api/push-notifications/preferences`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${tokenFor('u5')}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ reminderTime: '07:30' }),
    });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.preference.reminderTime, '07:30');
    assert.equal(body.preference.enabled, true);
  });
});

test('PATCH preferences: rejects malformed reminderTime/timezone/enabled', async () => {
  const client = makeFakeClient({
    usersById: { u6: adultUser() },
    preferencesByUserId: { u6: { id: 'p6', userId: 'u6', enabled: true, reminderTime: '18:00', timezone: 'Asia/Kolkata' } },
  });
  await withApp(client, async (baseUrl) => {
    for (const badBody of [{ reminderTime: '25:00' }, { timezone: 'Nowhere/Real' }, { enabled: 'yes' }]) {
      const res = await fetch(`${baseUrl}/api/push-notifications/preferences`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${tokenFor('u6')}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(badBody),
      });
      assert.equal(res.status, 400, `expected 400 for ${JSON.stringify(badBody)}`);
    }
  });
});

test('PATCH preferences: an empty body is rejected', async () => {
  const client = makeFakeClient({ usersById: { u7: adultUser() } });
  await withApp(client, async (baseUrl) => {
    const res = await fetch(`${baseUrl}/api/push-notifications/preferences`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${tokenFor('u7')}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    assert.equal(res.status, 400);
  });
});

// ── GET preferences ────────────────────────────────────────────────────

test('GET preferences: returns disabled defaults before any subscribe has happened', async () => {
  const client = makeFakeClient({ usersById: { u8: adultUser() } });
  await withApp(client, async (baseUrl) => {
    const res = await fetch(`${baseUrl}/api/push-notifications/preferences`, {
      headers: { Authorization: `Bearer ${tokenFor('u8')}` },
    });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.deepEqual(body.preference, { enabled: false, reminderTime: null, timezone: null });
  });
});

// ── Unsubscribe / current-device disable ─────────────────────────────────

test('unsubscribe: disables the caller\'s own subscription for the given endpoint', async () => {
  const client = makeFakeClient({
    usersById: { u9: adultUser() },
    subscriptionsByEndpoint: {
      'https://push.example/u9-device': { id: 'sub-9', userId: 'u9', endpoint: 'https://push.example/u9-device', p256dh: 'p', auth: 'a', disabledAt: null },
    },
  });
  await withApp(client, async (baseUrl) => {
    const res = await fetch(`${baseUrl}/api/push-notifications/unsubscribe`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${tokenFor('u9')}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ endpoint: 'https://push.example/u9-device' }),
    });
    assert.equal(res.status, 200);
    assert.notEqual(client.__subscriptionsByEndpoint['https://push.example/u9-device'].disabledAt, null);
  });
});

test('unsubscribe: cannot disable another user\'s subscription — silently no-ops, never leaks ownership', async () => {
  const client = makeFakeClient({
    usersById: { attacker: adultUser() },
    subscriptionsByEndpoint: {
      'https://push.example/victim-device': { id: 'sub-v', userId: 'victim', endpoint: 'https://push.example/victim-device', p256dh: 'p', auth: 'a', disabledAt: null },
    },
  });
  await withApp(client, async (baseUrl) => {
    const res = await fetch(`${baseUrl}/api/push-notifications/unsubscribe`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${tokenFor('attacker')}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ endpoint: 'https://push.example/victim-device' }),
    });
    assert.equal(res.status, 200); // no information leak about ownership
    assert.equal(client.__subscriptionsByEndpoint['https://push.example/victim-device'].disabledAt, null);
  });
});

test('unsubscribe: requires an endpoint', async () => {
  const client = makeFakeClient({ usersById: { u10: adultUser() } });
  await withApp(client, async (baseUrl) => {
    const res = await fetch(`${baseUrl}/api/push-notifications/unsubscribe`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${tokenFor('u10')}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    assert.equal(res.status, 400);
  });
});

// ── Disabled preference prevents send (route-level contract) ─────────────
// The scheduler is what actually enforces this (see pushScheduler.test.js);
// here we only prove the route surfaces the disabled state correctly so
// the scheduler's own `enabled: true` filter is fed accurate data.

test('after "Turn off notifications" (PATCH enabled:false), GET preferences reflects disabled', async () => {
  const client = makeFakeClient({
    usersById: { u11: adultUser() },
    preferencesByUserId: { u11: { id: 'p11', userId: 'u11', enabled: true, reminderTime: '18:00', timezone: 'Asia/Kolkata' } },
  });
  await withApp(client, async (baseUrl) => {
    await fetch(`${baseUrl}/api/push-notifications/preferences`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${tokenFor('u11')}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ enabled: false }),
    });
    const res = await fetch(`${baseUrl}/api/push-notifications/preferences`, {
      headers: { Authorization: `Bearer ${tokenFor('u11')}` },
    });
    const body = await res.json();
    assert.equal(body.preference.enabled, false);
  });
});
