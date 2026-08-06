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
      findUnique: async ({ where }) => entriesById[where.id] || null,
      delete: async ({ where }) => {
        const entry = entriesById[where.id];
        delete entriesById[where.id];
        return entry;
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

// ── PR 1: legacy / QUICK_NOTE shape (entryType omitted vs explicit) ────────

test('legacy shape (entryType omitted): the currently deployed { states, note } payload still succeeds unchanged, entryType is stored null', async () => {
  const client = makeFakeClient({ usersById: { 'legacy-1': adult() } });
  await withApp(client, async (baseUrl) => {
    const res = await fetch(`${baseUrl}/api/mind-journal`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${tokenFor('legacy-1')}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ states: ['calm', 'tired'], note: 'Good session' }),
    });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.deepEqual(body.entry.states, ['calm', 'tired']);
    assert.equal(body.entry.note, 'Good session');
    assert.equal(body.entry.entryType, null);
    assert.equal(body.entry.contextType, null);
    assert.equal(body.entry.whatHappened, null);
    assert.equal(body.entry.whatNoticed, null);
    assert.equal(body.entry.helpedOrGotInWay, null);
    assert.equal(body.entry.takeForward, null);
  });
});

test('a pre-existing (legacy) entry with all new columns null serializes and loads with every new field as null', async () => {
  const client = makeFakeClient({
    usersById: { 'legacy-load': adult() },
    entriesById: {
      'mj-legacy': {
        id: 'mj-legacy', userId: 'legacy-load', states: ['tired'], note: 'old entry',
        entryType: null, contextType: null, whatHappened: null, whatNoticed: null, helpedOrGotInWay: null, takeForward: null,
        createdAt: new Date(),
      },
    },
  });
  await withApp(client, async (baseUrl) => {
    const res = await fetch(`${baseUrl}/api/mind-journal`, { headers: { Authorization: `Bearer ${tokenFor('legacy-load')}` } });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.entries.length, 1);
    const e = body.entries[0];
    assert.deepEqual(e.states, ['tired']);
    assert.equal(e.note, 'old entry');
    for (const f of ['entryType', 'contextType', 'whatHappened', 'whatNoticed', 'helpedOrGotInWay', 'takeForward', 'customState']) {
      assert.equal(e[f], null, `${f} must be null for a legacy entry`);
    }
  });
});

test('QUICK_NOTE: explicit entryType with states+note succeeds and is stored/returned as QUICK_NOTE', async () => {
  const client = makeFakeClient({ usersById: { 'qn-1': adult() } });
  await withApp(client, async (baseUrl) => {
    const res = await fetch(`${baseUrl}/api/mind-journal`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${tokenFor('qn-1')}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ entryType: 'QUICK_NOTE', states: ['focused'], note: 'Sharp today' }),
    });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.entry.entryType, 'QUICK_NOTE');
    assert.deepEqual(body.entry.states, ['focused']);
    assert.equal(body.entry.note, 'Sharp today');
  });
});

test('QUICK_NOTE still requires 1-2 states (0 states rejected)', async () => {
  const client = makeFakeClient({ usersById: { 'qn-2': adult() } });
  await withApp(client, async (baseUrl) => {
    const res = await fetch(`${baseUrl}/api/mind-journal`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${tokenFor('qn-2')}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ entryType: 'QUICK_NOTE', states: [] }),
    });
    assert.equal(res.status, 400);
  });
});

test('QUICK_NOTE rejects a guided-only field (whatHappened) and contextType', async () => {
  const client = makeFakeClient({ usersById: { 'qn-3': adult() } });
  await withApp(client, async (baseUrl) => {
    const resGuidedField = await fetch(`${baseUrl}/api/mind-journal`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${tokenFor('qn-3')}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ entryType: 'QUICK_NOTE', states: ['calm'], whatHappened: 'x' }),
    });
    assert.equal(resGuidedField.status, 400);

    const resContextType = await fetch(`${baseUrl}/api/mind-journal`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${tokenFor('qn-3')}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ entryType: 'QUICK_NOTE', states: ['calm'], contextType: 'TRAINING' }),
    });
    assert.equal(resContextType.status, 400);
    assert.equal(Object.keys(client.__entriesById).length, 0);
  });
});

test('legacy shape (entryType omitted) also rejects a guided-only field and contextType', async () => {
  const client = makeFakeClient({ usersById: { 'legacy-mix': adult() } });
  await withApp(client, async (baseUrl) => {
    const res = await fetch(`${baseUrl}/api/mind-journal`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${tokenFor('legacy-mix')}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ states: ['calm'], contextType: 'TRAINING' }),
    });
    assert.equal(res.status, 400);
  });
});

test('an unknown entryType value is rejected', async () => {
  const client = makeFakeClient({ usersById: { 'bad-type': adult() } });
  await withApp(client, async (baseUrl) => {
    const res = await fetch(`${baseUrl}/api/mind-journal`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${tokenFor('bad-type')}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ entryType: 'SCORED_CHECKIN', states: ['calm'] }),
    });
    assert.equal(res.status, 400);
  });
});

// ── PR 1: GUIDED_REFLECTION shape ───────────────────────────────────────────

test('GUIDED_REFLECTION: valid entry with context, zero states, and one text field succeeds', async () => {
  const client = makeFakeClient({ usersById: { 'gr-1': adult() } });
  await withApp(client, async (baseUrl) => {
    const res = await fetch(`${baseUrl}/api/mind-journal`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${tokenFor('gr-1')}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ entryType: 'GUIDED_REFLECTION', contextType: 'TRAINING', states: [], takeForward: 'Breathe before every serve.' }),
    });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.entry.entryType, 'GUIDED_REFLECTION');
    assert.equal(body.entry.contextType, 'TRAINING');
    assert.deepEqual(body.entry.states, []);
    assert.equal(body.entry.note, null);
    assert.equal(body.entry.takeForward, 'Breathe before every serve.');
  });
});

test('GUIDED_REFLECTION: valid entry with context and states but no text succeeds', async () => {
  const client = makeFakeClient({ usersById: { 'gr-2': adult() } });
  await withApp(client, async (baseUrl) => {
    const res = await fetch(`${baseUrl}/api/mind-journal`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${tokenFor('gr-2')}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ entryType: 'GUIDED_REFLECTION', contextType: 'COMPETITION', states: ['nervous', 'focused'] }),
    });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.deepEqual(body.entry.states, ['nervous', 'focused']);
    assert.equal(body.entry.whatHappened, null);
  });
});

test('GUIDED_REFLECTION: context-only submission (no states, no text) is rejected — creates no entry', async () => {
  const client = makeFakeClient({ usersById: { 'gr-3': adult() } });
  await withApp(client, async (baseUrl) => {
    const res = await fetch(`${baseUrl}/api/mind-journal`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${tokenFor('gr-3')}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ entryType: 'GUIDED_REFLECTION', contextType: 'RECOVERY_DAY' }),
    });
    assert.equal(res.status, 400);
    assert.equal(Object.keys(client.__entriesById).length, 0);
  });
});

test('GUIDED_REFLECTION: whitespace-only text fields do not count toward "at least one field" — still rejected', async () => {
  const client = makeFakeClient({ usersById: { 'gr-3b': adult() } });
  await withApp(client, async (baseUrl) => {
    const res = await fetch(`${baseUrl}/api/mind-journal`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${tokenFor('gr-3b')}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ entryType: 'GUIDED_REFLECTION', contextType: 'RECOVERY_DAY', states: [], whatHappened: '   ' }),
    });
    assert.equal(res.status, 400);
  });
});

test('GUIDED_REFLECTION: more than 2 states rejected', async () => {
  const client = makeFakeClient({ usersById: { 'gr-4': adult() } });
  await withApp(client, async (baseUrl) => {
    const res = await fetch(`${baseUrl}/api/mind-journal`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${tokenFor('gr-4')}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ entryType: 'GUIDED_REFLECTION', contextType: 'TOUGH_MOMENT', states: ['calm', 'focused', 'tired'] }),
    });
    assert.equal(res.status, 400);
  });
});

test('GUIDED_REFLECTION: duplicate states rejected', async () => {
  const client = makeFakeClient({ usersById: { 'gr-5': adult() } });
  await withApp(client, async (baseUrl) => {
    const res = await fetch(`${baseUrl}/api/mind-journal`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${tokenFor('gr-5')}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ entryType: 'GUIDED_REFLECTION', contextType: 'TOUGH_MOMENT', states: ['calm', 'calm'] }),
    });
    assert.equal(res.status, 400);
  });
});

test('GUIDED_REFLECTION: unknown state values rejected', async () => {
  const client = makeFakeClient({ usersById: { 'gr-6': adult() } });
  await withApp(client, async (baseUrl) => {
    const res = await fetch(`${baseUrl}/api/mind-journal`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${tokenFor('gr-6')}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ entryType: 'GUIDED_REFLECTION', contextType: 'TOUGH_MOMENT', states: ['happy'] }),
    });
    assert.equal(res.status, 400);
  });
});

test('GUIDED_REFLECTION: missing contextType rejected', async () => {
  const client = makeFakeClient({ usersById: { 'gr-7': adult() } });
  await withApp(client, async (baseUrl) => {
    const res = await fetch(`${baseUrl}/api/mind-journal`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${tokenFor('gr-7')}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ entryType: 'GUIDED_REFLECTION', states: ['calm'] }),
    });
    assert.equal(res.status, 400);
  });
});

test('GUIDED_REFLECTION: unknown contextType value rejected', async () => {
  const client = makeFakeClient({ usersById: { 'gr-8': adult() } });
  await withApp(client, async (baseUrl) => {
    const res = await fetch(`${baseUrl}/api/mind-journal`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${tokenFor('gr-8')}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ entryType: 'GUIDED_REFLECTION', contextType: 'HOLIDAY', states: ['calm'] }),
    });
    assert.equal(res.status, 400);
  });
});

test('GUIDED_REFLECTION: note is rejected (guided reflections do not use note)', async () => {
  const client = makeFakeClient({ usersById: { 'gr-9': adult() } });
  await withApp(client, async (baseUrl) => {
    const res = await fetch(`${baseUrl}/api/mind-journal`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${tokenFor('gr-9')}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ entryType: 'GUIDED_REFLECTION', contextType: 'TRAINING', states: ['calm'], note: 'x' }),
    });
    assert.equal(res.status, 400);
  });
});

test('GUIDED_REFLECTION: each maximum length is enforced (1000/1000/1000/500)', async () => {
  const client = makeFakeClient({ usersById: { 'gr-len': adult() } });
  await withApp(client, async (baseUrl) => {
    const cases = [
      { whatHappened: 'x'.repeat(1001) },
      { whatNoticed: 'x'.repeat(1001) },
      { helpedOrGotInWay: 'x'.repeat(1001) },
      { takeForward: 'x'.repeat(501) },
    ];
    for (const extra of cases) {
      const res = await fetch(`${baseUrl}/api/mind-journal`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${tokenFor('gr-len')}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ entryType: 'GUIDED_REFLECTION', contextType: 'TRAINING', states: ['calm'], ...extra }),
      });
      assert.equal(res.status, 400, `expected 400 for ${JSON.stringify(Object.keys(extra))}`);
    }
    assert.equal(Object.keys(client.__entriesById).length, 0);
  });
});

test('GUIDED_REFLECTION: at-limit text lengths (1000/1000/1000/500) succeed', async () => {
  const client = makeFakeClient({ usersById: { 'gr-atlimit': adult() } });
  await withApp(client, async (baseUrl) => {
    const res = await fetch(`${baseUrl}/api/mind-journal`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${tokenFor('gr-atlimit')}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        entryType: 'GUIDED_REFLECTION', contextType: 'TRAINING', states: ['calm'],
        whatHappened: 'a'.repeat(1000), whatNoticed: 'b'.repeat(1000),
        helpedOrGotInWay: 'c'.repeat(1000), takeForward: 'd'.repeat(500),
      }),
    });
    assert.equal(res.status, 200);
  });
});

test('GUIDED_REFLECTION: empty-string text fields normalize to null, malformed (non-string) fields rejected', async () => {
  const client = makeFakeClient({ usersById: { 'gr-empty': adult() } });
  await withApp(client, async (baseUrl) => {
    const res = await fetch(`${baseUrl}/api/mind-journal`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${tokenFor('gr-empty')}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        entryType: 'GUIDED_REFLECTION', contextType: 'TRAINING', states: ['calm'],
        whatHappened: '   ', whatNoticed: 'Real note here',
      }),
    });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.entry.whatHappened, null);
    assert.equal(body.entry.whatNoticed, 'Real note here');

    const malformed = await fetch(`${baseUrl}/api/mind-journal`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${tokenFor('gr-empty')}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ entryType: 'GUIDED_REFLECTION', contextType: 'TRAINING', states: ['calm'], whatHappened: 12345 }),
    });
    assert.equal(malformed.status, 400);
  });
});

test('GUIDED_REFLECTION → full create + GET serialization round-trip', async () => {
  const client = makeFakeClient({ usersById: { 'gr-roundtrip': adult() } });
  await withApp(client, async (baseUrl) => {
    const create = await fetch(`${baseUrl}/api/mind-journal`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${tokenFor('gr-roundtrip')}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        entryType: 'GUIDED_REFLECTION', contextType: 'COMPETITION', states: ['nervous'],
        whatHappened: 'Missed an easy chance early.', whatNoticed: 'Shoulders tensed up.',
        helpedOrGotInWay: 'A slow exhale before the next play helped.', takeForward: 'One slow breath after any mistake.',
      }),
    });
    assert.equal(create.status, 200);

    const get = await fetch(`${baseUrl}/api/mind-journal`, { headers: { Authorization: `Bearer ${tokenFor('gr-roundtrip')}` } });
    const body = await get.json();
    assert.equal(body.entries.length, 1);
    const e = body.entries[0];
    assert.equal(e.entryType, 'GUIDED_REFLECTION');
    assert.equal(e.contextType, 'COMPETITION');
    assert.deepEqual(e.states, ['nervous']);
    assert.equal(e.note, null);
    assert.equal(e.whatHappened, 'Missed an easy chance early.');
    assert.equal(e.whatNoticed, 'Shoulders tensed up.');
    assert.equal(e.helpedOrGotInWay, 'A slow exhale before the next play helped.');
    assert.equal(e.takeForward, 'One slow breath after any mistake.');
    assert.equal(e.customState, null);
  });
});

// ── Custom state ("Something else") ─────────────────────────────────────────

test('QUICK_NOTE: built-in only still succeeds and serializes customState null', async () => {
  const client = makeFakeClient({ usersById: { 'cs-built': adult() } });
  await withApp(client, async (baseUrl) => {
    const res = await fetch(`${baseUrl}/api/mind-journal`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${tokenFor('cs-built')}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ entryType: 'QUICK_NOTE', states: ['calm', 'focused'] }),
    });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.deepEqual(body.entry.states, ['calm', 'focused']);
    assert.equal(body.entry.customState, null);
  });
});

test('QUICK_NOTE: custom-only succeeds', async () => {
  const client = makeFakeClient({ usersById: { 'cs-only': adult() } });
  await withApp(client, async (baseUrl) => {
    const res = await fetch(`${baseUrl}/api/mind-journal`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${tokenFor('cs-only')}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ entryType: 'QUICK_NOTE', states: [], customState: 'Match-day wired' }),
    });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.deepEqual(body.entry.states, []);
    assert.equal(body.entry.customState, 'Match-day wired');
  });
});

test('QUICK_NOTE: one built-in + custom succeeds', async () => {
  const client = makeFakeClient({ usersById: { 'cs-mix': adult() } });
  await withApp(client, async (baseUrl) => {
    const res = await fetch(`${baseUrl}/api/mind-journal`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${tokenFor('cs-mix')}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ entryType: 'QUICK_NOTE', states: ['nervous'], customState: 'wired' }),
    });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.deepEqual(body.entry.states, ['nervous']);
    assert.equal(body.entry.customState, 'wired');
  });
});

test('QUICK_NOTE: two built-ins + custom is rejected', async () => {
  const client = makeFakeClient({ usersById: { 'cs-three': adult() } });
  await withApp(client, async (baseUrl) => {
    const res = await fetch(`${baseUrl}/api/mind-journal`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${tokenFor('cs-three')}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        entryType: 'QUICK_NOTE', states: ['calm', 'tired'], customState: 'wired',
      }),
    });
    assert.equal(res.status, 400);
    assert.equal(Object.keys(client.__entriesById).length, 0);
  });
});

test('QUICK_NOTE: empty/whitespace customState normalizes to null; custom-only empty is rejected', async () => {
  const client = makeFakeClient({ usersById: { 'cs-empty': adult() } });
  await withApp(client, async (baseUrl) => {
    const withBuiltIn = await fetch(`${baseUrl}/api/mind-journal`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${tokenFor('cs-empty')}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ entryType: 'QUICK_NOTE', states: ['calm'], customState: '   ' }),
    });
    assert.equal(withBuiltIn.status, 200);
    assert.equal((await withBuiltIn.json()).entry.customState, null);

    const customOnlyEmpty = await fetch(`${baseUrl}/api/mind-journal`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${tokenFor('cs-empty')}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ entryType: 'QUICK_NOTE', states: [], customState: '   ' }),
    });
    assert.equal(customOnlyEmpty.status, 400);
  });
});

test('QUICK_NOTE: customState max 30 enforced; control characters rejected; never truncated', async () => {
  const client = makeFakeClient({ usersById: { 'cs-bounds': adult() } });
  await withApp(client, async (baseUrl) => {
    const tooLong = await fetch(`${baseUrl}/api/mind-journal`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${tokenFor('cs-bounds')}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ entryType: 'QUICK_NOTE', states: [], customState: 'x'.repeat(31) }),
    });
    assert.equal(tooLong.status, 400);

    const atLimit = await fetch(`${baseUrl}/api/mind-journal`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${tokenFor('cs-bounds')}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ entryType: 'QUICK_NOTE', states: [], customState: 'x'.repeat(30) }),
    });
    assert.equal(atLimit.status, 200);
    assert.equal((await atLimit.json()).entry.customState.length, 30);

    const control = await fetch(`${baseUrl}/api/mind-journal`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${tokenFor('cs-bounds')}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ entryType: 'QUICK_NOTE', states: [], customState: 'bad\u0001text' }),
    });
    assert.equal(control.status, 400);
  });
});

test('QUICK_NOTE: customState matching a selected built-in key or English label is rejected', async () => {
  const client = makeFakeClient({ usersById: { 'cs-dup': adult() } });
  await withApp(client, async (baseUrl) => {
    for (const customState of ['calm', 'CALM', 'Calm']) {
      const res = await fetch(`${baseUrl}/api/mind-journal`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${tokenFor('cs-dup')}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ entryType: 'QUICK_NOTE', states: ['calm'], customState }),
      });
      assert.equal(res.status, 400, `expected reject for customState=${customState}`);
    }
  });
});

test('GUIDED_REFLECTION: custom state counts toward the two-state maximum', async () => {
  const client = makeFakeClient({ usersById: { 'gcs-max': adult() } });
  await withApp(client, async (baseUrl) => {
    const ok = await fetch(`${baseUrl}/api/mind-journal`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${tokenFor('gcs-max')}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        entryType: 'GUIDED_REFLECTION', contextType: 'TRAINING',
        states: ['calm'], customState: 'wired',
      }),
    });
    assert.equal(ok.status, 200);

    const tooMany = await fetch(`${baseUrl}/api/mind-journal`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${tokenFor('gcs-max')}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        entryType: 'GUIDED_REFLECTION', contextType: 'TRAINING',
        states: ['calm', 'tired'], customState: 'wired',
      }),
    });
    assert.equal(tooMany.status, 400);
  });
});

test('GUIDED_REFLECTION: context + customState succeeds without narrative text', async () => {
  const client = makeFakeClient({ usersById: { 'gcs-ctx': adult() } });
  await withApp(client, async (baseUrl) => {
    const res = await fetch(`${baseUrl}/api/mind-journal`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${tokenFor('gcs-ctx')}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        entryType: 'GUIDED_REFLECTION', contextType: 'RECOVERY_DAY',
        states: [], customState: 'restless',
      }),
    });
    assert.equal(res.status, 200);
    assert.equal((await res.json()).entry.customState, 'restless');
  });
});

test('GUIDED_REFLECTION: context with empty custom and no other content is rejected', async () => {
  const client = makeFakeClient({ usersById: { 'gcs-empty': adult() } });
  await withApp(client, async (baseUrl) => {
    const res = await fetch(`${baseUrl}/api/mind-journal`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${tokenFor('gcs-empty')}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        entryType: 'GUIDED_REFLECTION', contextType: 'RECOVERY_DAY',
        states: [], customState: '   ',
      }),
    });
    assert.equal(res.status, 400);
    assert.equal(Object.keys(client.__entriesById).length, 0);
  });
});

test('legacy { states, note } payloads still succeed and return customState null', async () => {
  const client = makeFakeClient({ usersById: { 'cs-legacy': adult() } });
  await withApp(client, async (baseUrl) => {
    const res = await fetch(`${baseUrl}/api/mind-journal`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${tokenFor('cs-legacy')}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ states: ['focused'], note: 'legacy shape' }),
    });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.entry.note, 'legacy shape');
    assert.equal(body.entry.customState, null);
  });
});

// ── PR 1: DELETE /api/mind-journal/:id ──────────────────────────────────────

test('DELETE /api/mind-journal/:id: the owner can delete their own entry (200/204-class success)', async () => {
  const client = makeFakeClient({ usersById: { 'del-1': adult() } });
  await withApp(client, async (baseUrl) => {
    const create = await fetch(`${baseUrl}/api/mind-journal`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${tokenFor('del-1')}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ states: ['calm'] }),
    });
    const { entry } = await create.json();

    const del = await fetch(`${baseUrl}/api/mind-journal/${entry.id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${tokenFor('del-1')}` },
    });
    assert.ok(del.status === 200 || del.status === 204, `expected a success status, got ${del.status}`);
    assert.equal(Object.keys(client.__entriesById).length, 0);
  });
});

test('DELETE /api/mind-journal/:id: the deleted entry no longer appears in GET', async () => {
  const client = makeFakeClient({ usersById: { 'del-2': adult() } });
  await withApp(client, async (baseUrl) => {
    const create = await fetch(`${baseUrl}/api/mind-journal`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${tokenFor('del-2')}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ states: ['tired'] }),
    });
    const { entry } = await create.json();

    await fetch(`${baseUrl}/api/mind-journal/${entry.id}`, { method: 'DELETE', headers: { Authorization: `Bearer ${tokenFor('del-2')}` } });

    const get = await fetch(`${baseUrl}/api/mind-journal`, { headers: { Authorization: `Bearer ${tokenFor('del-2')}` } });
    const body = await get.json();
    assert.equal(body.entries.length, 0);
  });
});

test('DELETE /api/mind-journal/:id: another user cannot delete it — 404, entry survives, and the response is identical to an unknown id', async () => {
  const client = makeFakeClient({ usersById: { 'owner-1': adult(), 'attacker-1': adult() } });
  await withApp(client, async (baseUrl) => {
    const create = await fetch(`${baseUrl}/api/mind-journal`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${tokenFor('owner-1')}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ states: ['calm'] }),
    });
    const { entry } = await create.json();

    const attackerDelete = await fetch(`${baseUrl}/api/mind-journal/${entry.id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${tokenFor('attacker-1')}` },
    });
    assert.equal(attackerDelete.status, 404);
    const attackerBody = await attackerDelete.json();

    const unknownIdDelete = await fetch(`${baseUrl}/api/mind-journal/does-not-exist`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${tokenFor('attacker-1')}` },
    });
    assert.equal(unknownIdDelete.status, 404);
    const unknownBody = await unknownIdDelete.json();

    assert.deepEqual(attackerBody, unknownBody, 'a non-owned id and an unknown id must be indistinguishable');
    assert.equal(Object.keys(client.__entriesById).length, 1, 'the entry must survive an unauthorized delete attempt');
  });
});

test('DELETE /api/mind-journal/:id: requires authentication', async () => {
  const client = makeFakeClient({ usersById: { 'del-noauth': adult() } });
  await withApp(client, async (baseUrl) => {
    const res = await fetch(`${baseUrl}/api/mind-journal/some-id`, { method: 'DELETE' });
    assert.equal(res.status, 401);
  });
});

test('DELETE /api/mind-journal/:id: an unconsented minor is blocked with 403 CONSENT_REQUIRED', async () => {
  const client = makeFakeClient({ usersById: { 'del-minor': unconsentedMinor() } });
  await withApp(client, async (baseUrl) => {
    const res = await fetch(`${baseUrl}/api/mind-journal/some-id`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${tokenFor('del-minor')}` },
    });
    assert.equal(res.status, 403);
    const body = await res.json();
    assert.equal(body.code, 'CONSENT_REQUIRED');
  });
});
