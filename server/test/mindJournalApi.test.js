// Behavioral tests for POST/GET /api/mind-journal and PATCH
// /api/mind-journal/context. Same isolated-app + injected-client technique
// as prescriptionsRoute.test.js: a real signed JWT through the real
// `authenticate` middleware, an injected consent decision
// (createRequireGuardianConsent), and an injected Prisma-like client — no
// real database anywhere in this file.

const test = require('node:test');
const assert = require('node:assert/strict');
const jwt = require('jsonwebtoken');
const express = require('express');

const authenticate = require('../src/middleware/authenticate');
const { createRequireGuardianConsent } = require('../src/middleware/requireGuardianConsent');
const { createMindJournalRouter } = require('../src/routes/mindJournal');
const { validateAllowedKeys, isPlainObject } = require('../src/services/mindJournal/validateEntry');

// ── Pure unit tests for the strict request-shape guard ──────────────────────

test('validateAllowedKeys: accepts a plain object containing only allowed keys', () => {
  assert.deepEqual(validateAllowedKeys({ states: ['calm'], note: 'x' }, ['states', 'note']), { valid: true });
  assert.deepEqual(validateAllowedKeys({}, ['enabled']), { valid: true });
});

test('validateAllowedKeys: rejects any unexpected top-level key', () => {
  for (const bad of [{ states: ['calm'], score: 5 }, { enabled: true, rating: 1 }, { foo: 'bar' }]) {
    const result = validateAllowedKeys(bad, ['states', 'note']);
    assert.equal(result.valid, false);
  }
});

test('validateAllowedKeys / isPlainObject: rejects arrays, null, and scalar bodies', () => {
  for (const bad of [['calm'], null, 'calm', 42, true, undefined]) {
    assert.equal(isPlainObject(bad), false, `expected isPlainObject(${JSON.stringify(bad)}) to be false`);
    assert.equal(validateAllowedKeys(bad, ['states']).valid, false);
  }
});

const TEST_JWT_SECRET = 'mind-journal-api-test-secret';
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
function unconsentedMinor() {
  const now = new Date();
  return { dateOfBirth: new Date(now.getFullYear() - 15, now.getMonth(), now.getDate()), guardianConsentAt: null };
}

// ── Fake Prisma client ──────────────────────────────────────────────────────
// In-memory store keyed by userId; no real database involved.
function makeFakeClient(seed = {}) {
  const usersById = seed.usersById || {};
  const entriesById = seed.entriesById || {}; // id -> entry
  let nextId = 1;

  return {
    user: {
      findUnique: async ({ where }) => usersById[where.id] || null,
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
      findMany: async ({ where, orderBy, take }) => {
        let rows = Object.values(entriesById).filter((e) => e.userId === where.userId);
        if (orderBy?.createdAt === 'desc') rows = rows.sort((a, b) => b.createdAt - a.createdAt);
        if (take) rows = rows.slice(0, take);
        return rows;
      },
    },
    __usersById: usersById,
    __entriesById: entriesById,
  };
}

function buildApp(client) {
  const app = express();
  app.use(express.json());
  // Consent decision is injected via the route's own DI seam (same pattern
  // as createRequireGuardianConsent elsewhere) — reads dateOfBirth/
  // guardianConsentAt off the fake client's own user rows, no real database.
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

// ── Authentication + guardian consent ───────────────────────────────────────

test('POST /api/mind-journal requires authentication (401 with no token)', async () => {
  const client = makeFakeClient();
  await withApp(client, async (baseUrl) => {
    const res = await fetch(`${baseUrl}/api/mind-journal`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ states: ['calm'] }),
    });
    assert.equal(res.status, 401);
  });
});

test('POST /api/mind-journal: unconsented minor is blocked with 403 CONSENT_REQUIRED', async () => {
  const client = makeFakeClient({ usersById: { 'minor-1': unconsentedMinor() } });
  await withApp(client, async (baseUrl) => {
    const res = await fetch(`${baseUrl}/api/mind-journal`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${tokenFor('minor-1')}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ states: ['calm'] }),
    });
    assert.equal(res.status, 403);
    const body = await res.json();
    assert.equal(body.code, 'CONSENT_REQUIRED');
  });
});

// ── Valid saves ──────────────────────────────────────────────────────────────

test('POST /api/mind-journal: saves a valid 1-state entry', async () => {
  const client = makeFakeClient({ usersById: { 'u1': adult() } });
  await withApp(client, async (baseUrl) => {
    const res = await fetch(`${baseUrl}/api/mind-journal`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${tokenFor('u1')}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ states: ['focused'] }),
    });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.deepEqual(body.entry.states, ['focused']);
    assert.equal(body.entry.note, null);
    assert.ok(body.entry.id);
    assert.ok(body.entry.createdAt);
  });
});

test('POST /api/mind-journal: saves a valid 2-state entry with a trimmed note', async () => {
  const client = makeFakeClient({ usersById: { 'u2': adult() } });
  await withApp(client, async (baseUrl) => {
    const res = await fetch(`${baseUrl}/api/mind-journal`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${tokenFor('u2')}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ states: ['focused', 'nervous'], note: '  Big match tomorrow  ' }),
    });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.deepEqual(body.entry.states, ['focused', 'nervous']);
    assert.equal(body.entry.note, 'Big match tomorrow');
  });
});

test('POST /api/mind-journal: an empty (whitespace-only) note trims to null', async () => {
  const client = makeFakeClient({ usersById: { 'u3': adult() } });
  await withApp(client, async (baseUrl) => {
    const res = await fetch(`${baseUrl}/api/mind-journal`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${tokenFor('u3')}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ states: ['calm'], note: '   ' }),
    });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.entry.note, null);
  });
});

test('POST /api/mind-journal: unexpected score/rating/mood fields are rejected outright (400), not silently ignored', async () => {
  const client = makeFakeClient({ usersById: { 'u4': adult() } });
  await withApp(client, async (baseUrl) => {
    const res = await fetch(`${baseUrl}/api/mind-journal`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${tokenFor('u4')}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ states: ['calm'], score: 99, rating: 5, mood: 3 }),
    });
    assert.equal(res.status, 400);
    assert.equal(Object.keys(client.__entriesById).length, 0, 'no MindJournalEntry may be created for a rejected payload');
  });
});

// ── Rejected payloads ────────────────────────────────────────────────────────

test('POST /api/mind-journal: zero states is rejected', async () => {
  const client = makeFakeClient({ usersById: { 'u5': adult() } });
  await withApp(client, async (baseUrl) => {
    const res = await fetch(`${baseUrl}/api/mind-journal`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${tokenFor('u5')}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ states: [] }),
    });
    assert.equal(res.status, 400);
  });
});

test('POST /api/mind-journal: more than 2 states is rejected', async () => {
  const client = makeFakeClient({ usersById: { 'u6': adult() } });
  await withApp(client, async (baseUrl) => {
    const res = await fetch(`${baseUrl}/api/mind-journal`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${tokenFor('u6')}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ states: ['calm', 'focused', 'tired'] }),
    });
    assert.equal(res.status, 400);
  });
});

test('POST /api/mind-journal: duplicate states are rejected', async () => {
  const client = makeFakeClient({ usersById: { 'u7': adult() } });
  await withApp(client, async (baseUrl) => {
    const res = await fetch(`${baseUrl}/api/mind-journal`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${tokenFor('u7')}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ states: ['calm', 'calm'] }),
    });
    assert.equal(res.status, 400);
  });
});

test('POST /api/mind-journal: unknown state values are rejected', async () => {
  const client = makeFakeClient({ usersById: { 'u8': adult() } });
  await withApp(client, async (baseUrl) => {
    const res = await fetch(`${baseUrl}/api/mind-journal`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${tokenFor('u8')}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ states: ['happy'] }),
    });
    assert.equal(res.status, 400);
  });
});

test('POST /api/mind-journal: a note over 500 characters is rejected', async () => {
  const client = makeFakeClient({ usersById: { 'u9': adult() } });
  await withApp(client, async (baseUrl) => {
    const res = await fetch(`${baseUrl}/api/mind-journal`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${tokenFor('u9')}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ states: ['calm'], note: 'x'.repeat(501) }),
    });
    assert.equal(res.status, 400);
  });
});

test('POST /api/mind-journal: a malformed note (non-string) is rejected', async () => {
  const client = makeFakeClient({ usersById: { 'u10': adult() } });
  await withApp(client, async (baseUrl) => {
    const res = await fetch(`${baseUrl}/api/mind-journal`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${tokenFor('u10')}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ states: ['calm'], note: 12345 }),
    });
    assert.equal(res.status, 400);
  });
});

// ── Strict request shape: unexpected top-level fields ───────────────────────

for (const field of ['score', 'rating', 'progress', 'interpretation', 'foo']) {
  test(`POST /api/mind-journal: an unexpected top-level field ("${field}") is rejected with 400 and creates no entry`, async () => {
    const client = makeFakeClient({ usersById: { [`field-${field}`]: adult() } });
    await withApp(client, async (baseUrl) => {
      const res = await fetch(`${baseUrl}/api/mind-journal`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${tokenFor(`field-${field}`)}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ states: ['calm'], [field]: field === 'foo' ? 'bar' : 5 }),
      });
      assert.equal(res.status, 400);
      assert.equal(Object.keys(client.__entriesById).length, 0);
    });
  });
}

test('POST /api/mind-journal: an array body is rejected with 400, not treated as an object', async () => {
  const client = makeFakeClient({ usersById: { 'arr-body': adult() } });
  await withApp(client, async (baseUrl) => {
    const res = await fetch(`${baseUrl}/api/mind-journal`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${tokenFor('arr-body')}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(['calm']),
    });
    assert.equal(res.status, 400);
    assert.equal(Object.keys(client.__entriesById).length, 0);
  });
});

test('POST /api/mind-journal: a null body is rejected with 400', async () => {
  const client = makeFakeClient({ usersById: { 'null-body': adult() } });
  await withApp(client, async (baseUrl) => {
    const res = await fetch(`${baseUrl}/api/mind-journal`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${tokenFor('null-body')}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(null),
    });
    assert.equal(res.status, 400);
    assert.equal(Object.keys(client.__entriesById).length, 0);
  });
});

test('POST /api/mind-journal: a bare string or number body is rejected with 400', async () => {
  const client = makeFakeClient({ usersById: { 'scalar-body': adult() } });
  await withApp(client, async (baseUrl) => {
    const resString = await fetch(`${baseUrl}/api/mind-journal`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${tokenFor('scalar-body')}`, 'Content-Type': 'application/json' },
      body: JSON.stringify('calm'),
    });
    assert.equal(resString.status, 400);

    const resNumber = await fetch(`${baseUrl}/api/mind-journal`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${tokenFor('scalar-body')}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(42),
    });
    assert.equal(resNumber.status, 400);
    assert.equal(Object.keys(client.__entriesById).length, 0);
  });
});

// ── GET /api/mind-journal ────────────────────────────────────────────────────

test('GET /api/mind-journal: returns entries newest-first, bounded to 20, scoped to the authenticated athlete only', async () => {
  const client = makeFakeClient({ usersById: { 'a': adult(), 'b': adult() } });
  await withApp(client, async (baseUrl) => {
    // Seed 25 entries for 'a' and 1 for 'b'.
    for (let i = 0; i < 25; i++) {
      await fetch(`${baseUrl}/api/mind-journal`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${tokenFor('a')}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ states: ['calm'], note: `entry ${i}` }),
      });
    }
    await fetch(`${baseUrl}/api/mind-journal`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${tokenFor('b')}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ states: ['tired'] }),
    });

    const res = await fetch(`${baseUrl}/api/mind-journal`, { headers: { Authorization: `Bearer ${tokenFor('a')}` } });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.entries.length, 20, 'must be bounded to the latest 20');
    assert.equal(body.entries[0].note, 'entry 24', 'newest first');
    assert.ok(!body.entries.some((e) => e.note === 'entry 4'), 'oldest entries beyond 20 must not appear');
    assert.ok(!body.entries.some((e) => e.states.includes('tired')), 'must never include another athlete\'s entries');
  });
});

test('GET /api/mind-journal: contextEnabled defaults to false for a user who never toggled it', async () => {
  const client = makeFakeClient({ usersById: { 'c': adult() } });
  await withApp(client, async (baseUrl) => {
    const res = await fetch(`${baseUrl}/api/mind-journal`, { headers: { Authorization: `Bearer ${tokenFor('c')}` } });
    const body = await res.json();
    assert.equal(body.contextEnabled, false);
  });
});

// ── PATCH /api/mind-journal/context ─────────────────────────────────────────

test('PATCH /api/mind-journal/context: persists the boolean and updates only the authenticated user', async () => {
  const client = makeFakeClient({ usersById: { 'x': adult(), 'y': adult() } });
  await withApp(client, async (baseUrl) => {
    const res = await fetch(`${baseUrl}/api/mind-journal/context`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${tokenFor('x')}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ enabled: true }),
    });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.contextEnabled, true);
    assert.equal(client.__usersById['x'].mindJournalContextEnabled, true);
    assert.notEqual(client.__usersById['y'].mindJournalContextEnabled, true);
  });
});

test('PATCH /api/mind-journal/context: rejects a non-boolean value', async () => {
  const client = makeFakeClient({ usersById: { 'z': adult() } });
  await withApp(client, async (baseUrl) => {
    const res = await fetch(`${baseUrl}/api/mind-journal/context`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${tokenFor('z')}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ enabled: 'yes' }),
    });
    assert.equal(res.status, 400);
  });
});

test('PATCH /api/mind-journal/context: rejects any unexpected top-level field and updates nothing', async () => {
  const client = makeFakeClient({ usersById: { 'patch-extra': adult() } });
  await withApp(client, async (baseUrl) => {
    const res = await fetch(`${baseUrl}/api/mind-journal/context`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${tokenFor('patch-extra')}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ enabled: true, score: 5 }),
    });
    assert.equal(res.status, 400);
    assert.notEqual(client.__usersById['patch-extra'].mindJournalContextEnabled, true, 'the preference must not be updated on a rejected payload');
  });
});

test('PATCH /api/mind-journal/context: rejects an array body', async () => {
  const client = makeFakeClient({ usersById: { 'patch-arr': adult() } });
  await withApp(client, async (baseUrl) => {
    const res = await fetch(`${baseUrl}/api/mind-journal/context`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${tokenFor('patch-arr')}`, 'Content-Type': 'application/json' },
      body: JSON.stringify([true]),
    });
    assert.equal(res.status, 400);
    assert.notEqual(client.__usersById['patch-arr'].mindJournalContextEnabled, true);
  });
});

test('PATCH /api/mind-journal/context: rejects a null body', async () => {
  const client = makeFakeClient({ usersById: { 'patch-null': adult() } });
  await withApp(client, async (baseUrl) => {
    const res = await fetch(`${baseUrl}/api/mind-journal/context`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${tokenFor('patch-null')}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(null),
    });
    assert.equal(res.status, 400);
  });
});

// ── Valid payloads still succeed after the strict-shape change ─────────────

test('regression: a valid POST payload (states + note, nothing else) still succeeds after the strict-shape change', async () => {
  const client = makeFakeClient({ usersById: { 'still-valid': adult() } });
  await withApp(client, async (baseUrl) => {
    const res = await fetch(`${baseUrl}/api/mind-journal`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${tokenFor('still-valid')}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ states: ['calm', 'tired'], note: 'Good session' }),
    });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.deepEqual(body.entry.states, ['calm', 'tired']);
    assert.equal(body.entry.note, 'Good session');
  });
});

test('regression: a valid PATCH payload ({ enabled }, nothing else) still succeeds after the strict-shape change', async () => {
  const client = makeFakeClient({ usersById: { 'still-valid-patch': adult() } });
  await withApp(client, async (baseUrl) => {
    const res = await fetch(`${baseUrl}/api/mind-journal/context`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${tokenFor('still-valid-patch')}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ enabled: true }),
    });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.contextEnabled, true);
  });
});
