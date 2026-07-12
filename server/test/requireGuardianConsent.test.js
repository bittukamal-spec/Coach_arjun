const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const {
  createRequireGuardianConsent,
} = require('../src/middleware/requireGuardianConsent');

// These are pure decision-logic tests: the middleware is built with an
// injected `findUser` stub, so nothing here touches a real database, the
// real Prisma client, or any network call.

function unconsentedMinor() {
  const now = new Date();
  return { dateOfBirth: new Date(now.getFullYear() - 15, now.getMonth(), now.getDate()), guardianConsentAt: null };
}

function consentedMinor() {
  const now = new Date();
  return { dateOfBirth: new Date(now.getFullYear() - 15, now.getMonth(), now.getDate()), guardianConsentAt: new Date() };
}

function adult() {
  const now = new Date();
  return { dateOfBirth: new Date(now.getFullYear() - 25, now.getMonth(), now.getDate()), guardianConsentAt: null };
}

function legacyAccountNoDob() {
  return { dateOfBirth: null, guardianConsentAt: null };
}

// Minimal req/res doubles — enough to observe the middleware's decision
// without booting a server.
function makeRes() {
  const res = {
    statusCode: null,
    body: null,
    status(code) { this.statusCode = code; return this; },
    json(payload) { this.body = payload; return this; },
  };
  return res;
}

test('unconsented minor: receives 403 with CONSENT_REQUIRED and next() is not called', async () => {
  const middleware = createRequireGuardianConsent(async () => unconsentedMinor());
  const req = { userId: 'u1' };
  const res = makeRes();
  let nextCalled = false;

  await middleware(req, res, () => { nextCalled = true; });

  assert.equal(res.statusCode, 403);
  assert.equal(res.body.code, 'CONSENT_REQUIRED');
  assert.equal(nextCalled, false);
});

test('consented minor: is allowed past the middleware', async () => {
  const middleware = createRequireGuardianConsent(async () => consentedMinor());
  const req = { userId: 'u2' };
  const res = makeRes();
  let nextCalled = false;

  await middleware(req, res, () => { nextCalled = true; });

  assert.equal(nextCalled, true);
  assert.equal(res.statusCode, null);
});

test('adult: is allowed past the middleware', async () => {
  const middleware = createRequireGuardianConsent(async () => adult());
  const req = { userId: 'u3' };
  const res = makeRes();
  let nextCalled = false;

  await middleware(req, res, () => { nextCalled = true; });

  assert.equal(nextCalled, true);
  assert.equal(res.statusCode, null);
});

test('legacy account with no dateOfBirth passes through untouched (existing documented behavior)', async () => {
  const middleware = createRequireGuardianConsent(async () => legacyAccountNoDob());
  const req = { userId: 'u4' };
  const res = makeRes();
  let nextCalled = false;

  await middleware(req, res, () => { nextCalled = true; });

  assert.equal(nextCalled, true);
  assert.equal(res.statusCode, null);
});

test('no resolved user: returns 404, distinct from the 403 consent case (auth is a separate concern)', async () => {
  const middleware = createRequireGuardianConsent(async () => null);
  const req = { userId: 'does-not-exist' };
  const res = makeRes();
  let nextCalled = false;

  await middleware(req, res, () => { nextCalled = true; });

  assert.equal(res.statusCode, 404);
  assert.equal(nextCalled, false);
});

test('rejection happens before any downstream handler runs (not merely before it fails)', async () => {
  // A tiny isolated app proves the *ordering* guarantee: the consent
  // middleware must block the request from ever reaching what would be the
  // AI handler — not just return a matching status after letting it run.
  const middleware = createRequireGuardianConsent(async () => unconsentedMinor());
  let handlerReached = false;

  const app = express();
  app.get('/probe', (req, res, next) => { req.userId = 'u5'; next(); }, middleware, (req, res) => {
    handlerReached = true;
    res.json({ ok: true });
  });

  await new Promise((resolve) => {
    const server = app.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      fetch(`http://127.0.0.1:${port}/probe`)
        .then(async (r) => {
          assert.equal(r.status, 403);
          const body = await r.json();
          assert.equal(body.code, 'CONSENT_REQUIRED');
          assert.equal(handlerReached, false, 'downstream handler must not run when consent is required');
        })
        .finally(() => server.close(resolve));
    });
  });
});
