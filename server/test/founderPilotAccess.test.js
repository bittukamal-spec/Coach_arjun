const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const jwt = require('jsonwebtoken');
const { createFounderPilotAccessRouter, GRANT_DURATION_MS } = require('../src/routes/founderPilotAccess');

// Real HTTP requests against a Prisma stub — no database is ever touched.
// Same convention as founderSafetyEventsApi.test.js: a real jsonwebtoken
// signed with a test secret, exercising the exact founderAuthenticate
// verification path production uses.

const TEST_SECRET = 'founder-pilot-access-test-secret';
const ORIGINAL_SECRET = process.env.FOUNDER_SESSION_SECRET;

test.before(() => { process.env.FOUNDER_SESSION_SECRET = TEST_SECRET; });
test.after(() => {
  if (ORIGINAL_SECRET === undefined) delete process.env.FOUNDER_SESSION_SECRET;
  else process.env.FOUNDER_SESSION_SECRET = ORIGINAL_SECRET;
});

function validToken() {
  return jwt.sign({ role: 'founder' }, TEST_SECRET, { expiresIn: '15m' });
}

function makeStubClient(users) {
  return {
    user: {
      findUnique: async ({ where: { id }, select }) => {
        const u = users.find((x) => x.id === id);
        if (!u) return null;
        if (!select) return u;
        return Object.fromEntries(Object.keys(select).map((k) => [k, u[k] ?? null]));
      },
      update: async ({ where: { id }, data, select }) => {
        const idx = users.findIndex((x) => x.id === id);
        if (idx === -1) throw new Error('record not found');
        users[idx] = { ...users[idx], ...data };
        if (!select) return users[idx];
        return Object.fromEntries(Object.keys(select).map((k) => [k, users[idx][k] ?? null]));
      },
    },
  };
}

function sampleUsers() {
  return [
    { id: 'u1', pilotAccessUntil: null, pilotAccessGrantedAt: null },
    { id: 'u2', pilotAccessUntil: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000), pilotAccessGrantedAt: new Date() },
  ];
}

function startServer(users) {
  const router = createFounderPilotAccessRouter(makeStubClient(users));
  const app = express();
  app.use(express.json());
  app.use('/pilot-access', router);
  return new Promise((resolve) => {
    const server = app.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      resolve({ server, baseUrl: `http://127.0.0.1:${port}/pilot-access`, users });
    });
  });
}

function stop(server) {
  return new Promise((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));
}

test('founder auth required: unauthenticated grant request receives 401', async () => {
  const { server, baseUrl } = await startServer(sampleUsers());
  try {
    const res = await fetch(`${baseUrl}/u1/grant`, { method: 'POST' });
    assert.equal(res.status, 401);
  } finally { await stop(server); }
});

test('founder auth required: unauthenticated revoke request receives 401', async () => {
  const { server, baseUrl } = await startServer(sampleUsers());
  try {
    const res = await fetch(`${baseUrl}/u2/revoke`, { method: 'POST' });
    assert.equal(res.status, 401);
  } finally { await stop(server); }
});

test('grant sets pilotAccessUntil to +60 days and records pilotAccessGrantedAt', async () => {
  const { server, baseUrl } = await startServer(sampleUsers());
  try {
    const before = Date.now();
    const res = await fetch(`${baseUrl}/u1/grant`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${validToken()}` },
    });
    assert.equal(res.status, 200);
    const body = await res.json();
    const until = new Date(body.user.pilotAccessUntil).getTime();
    const grantedAt = new Date(body.user.pilotAccessGrantedAt).getTime();
    assert.ok(grantedAt >= before && grantedAt <= Date.now(), 'pilotAccessGrantedAt must be "now"');
    // Allow a small scheduling window either side of exactly +60 days.
    assert.ok(Math.abs(until - (grantedAt + GRANT_DURATION_MS)) < 2000, 'pilotAccessUntil must be ~60 days from the grant');
    assert.equal(GRANT_DURATION_MS, 60 * 24 * 60 * 60 * 1000);
  } finally { await stop(server); }
});

test('revoke clears pilotAccessUntil and leaves pilotAccessGrantedAt untouched', async () => {
  const users = sampleUsers();
  const priorGrantedAt = users[1].pilotAccessGrantedAt;
  const { server, baseUrl } = await startServer(users);
  try {
    const res = await fetch(`${baseUrl}/u2/revoke`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${validToken()}` },
    });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.user.pilotAccessUntil, null);
    assert.equal(new Date(body.user.pilotAccessGrantedAt).getTime(), priorGrantedAt.getTime());
  } finally { await stop(server); }
});

test('cannot grant or revoke a nonexistent user — 404, no write attempted', async () => {
  const { server, baseUrl } = await startServer(sampleUsers());
  try {
    const grantRes = await fetch(`${baseUrl}/does-not-exist/grant`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${validToken()}` },
    });
    assert.equal(grantRes.status, 404);

    const revokeRes = await fetch(`${baseUrl}/does-not-exist/revoke`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${validToken()}` },
    });
    assert.equal(revokeRes.status, 404);
  } finally { await stop(server); }
});

test('no blanket/all-user grant endpoint exists — only per-athlete :id/grant and :id/revoke are registered', () => {
  const router = createFounderPilotAccessRouter(makeStubClient(sampleUsers()));
  const paths = router.stack.map((layer) => layer.route?.path).filter(Boolean);
  assert.deepEqual(paths.sort(), ['/:id/grant', '/:id/revoke'].sort());
});

test('grant is scoped to exactly one athlete: an unrelated user is left untouched', async () => {
  const users = sampleUsers();
  const u2Before = users.find((u) => u.id === 'u2').pilotAccessUntil.getTime();
  const { server, baseUrl } = await startServer(users);
  try {
    const res = await fetch(`${baseUrl}/u1/grant`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${validToken()}` },
    });
    assert.equal(res.status, 200);
    const u2After = users.find((u) => u.id === 'u2').pilotAccessUntil.getTime();
    assert.equal(u2After, u2Before, 'u2 must be unaffected by a grant issued for u1');
  } finally { await stop(server); }
});
