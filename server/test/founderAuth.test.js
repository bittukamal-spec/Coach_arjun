const test = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const path = require('node:path');
const jwt = require('jsonwebtoken');

const {
  verifyFounderPin,
  verifyFounderSessionToken,
  SESSION_TTL_SECONDS,
} = require('../src/services/founderAuth');
const founderAuthenticate = require('../src/middleware/founderAuthenticate');

const ORIGINAL_PIN = process.env.FOUNDER_PIN;
const ORIGINAL_SECRET = process.env.FOUNDER_SESSION_SECRET;

function setEnv(pin, secret) {
  if (pin === undefined) delete process.env.FOUNDER_PIN; else process.env.FOUNDER_PIN = pin;
  if (secret === undefined) delete process.env.FOUNDER_SESSION_SECRET; else process.env.FOUNDER_SESSION_SECRET = secret;
}

test.after(() => {
  setEnv(ORIGINAL_PIN, ORIGINAL_SECRET);
});

// ── PIN verification ────────────────────────────────────────────────────────

test('correct PIN returns a short-lived signed token', () => {
  setEnv('4242', 'a-test-signing-secret');
  const token = verifyFounderPin('4242');
  assert.equal(typeof token, 'string');

  const decoded = jwt.verify(token, 'a-test-signing-secret');
  assert.equal(decoded.role, 'founder');
  assert.equal(decoded.exp - decoded.iat, SESSION_TTL_SECONDS);
});

test('incorrect PIN is rejected', () => {
  setEnv('4242', 'a-test-signing-secret');
  assert.equal(verifyFounderPin('0000'), null);
});

test('non-4-digit input is rejected without a database or comparison attempt', () => {
  setEnv('4242', 'a-test-signing-secret');
  assert.equal(verifyFounderPin('42'), null);
  assert.equal(verifyFounderPin('abcd'), null);
  assert.equal(verifyFounderPin(''), null);
  assert.equal(verifyFounderPin(undefined), null);
});

test('missing FOUNDER_PIN configuration fails closed', () => {
  setEnv(undefined, 'a-test-signing-secret');
  assert.equal(verifyFounderPin('4242'), null);
});

test('missing FOUNDER_SESSION_SECRET configuration fails closed', () => {
  setEnv('4242', undefined);
  assert.equal(verifyFounderPin('4242'), null);
});

test('missing configuration and a wrong PIN are literally indistinguishable to the caller', () => {
  setEnv(undefined, undefined);
  const missingConfigResult = verifyFounderPin('4242');
  setEnv('4242', 'a-test-signing-secret');
  const wrongPinResult = verifyFounderPin('0000');

  assert.equal(missingConfigResult, null);
  assert.equal(wrongPinResult, null);
  assert.equal(missingConfigResult, wrongPinResult);
});

test('the submitted PIN is never included in any logged output', () => {
  const originalError = console.error;
  const logs = [];
  console.error = (...args) => logs.push(args.map(String).join(' '));
  try {
    setEnv(undefined, undefined); // forces the missing-config log line
    verifyFounderPin('7391');
  } finally {
    console.error = originalError;
  }
  const joined = logs.join('\n');
  assert.ok(!joined.includes('7391'), 'submitted PIN must never appear in logs');
});

test('PIN comparison uses crypto.timingSafeEqual (constant-time), not plain equality', () => {
  const src = readFileSync(path.join(__dirname, '../src/services/founderAuth.js'), 'utf8');
  assert.match(src, /crypto\.timingSafeEqual\(/);
  // Guard against a regression that keeps the import but reverts the actual comparison.
  const codeOnly = src.split('\n').filter((l) => !l.trim().startsWith('//')).join('\n');
  assert.doesNotMatch(codeOnly, /submitted\s*===\s*configured/);
});

// ── Session token verification ──────────────────────────────────────────────

test('a valid token passes verification and carries the founder role', () => {
  setEnv('4242', 'a-test-signing-secret');
  const token = verifyFounderPin('4242');
  const session = verifyFounderSessionToken(token);
  assert.equal(session.role, 'founder');
});

test('a malformed token fails verification', () => {
  setEnv('4242', 'a-test-signing-secret');
  assert.equal(verifyFounderSessionToken('not-a-real-token'), null);
  assert.equal(verifyFounderSessionToken(''), null);
  assert.equal(verifyFounderSessionToken(undefined), null);
});

test('a tampered token (payload altered after signing) fails verification', () => {
  setEnv('4242', 'a-test-signing-secret');
  const token = verifyFounderPin('4242');
  const [header, , signature] = token.split('.');
  const forgedPayload = Buffer.from(JSON.stringify({ role: 'founder', iat: 0, exp: 9999999999 })).toString('base64url');
  const tampered = `${header}.${forgedPayload}.${signature}`;
  assert.equal(verifyFounderSessionToken(tampered), null);
});

test('an expired token fails verification', () => {
  setEnv('4242', 'a-test-signing-secret');
  const expiredToken = jwt.sign({ role: 'founder' }, 'a-test-signing-secret', { expiresIn: -10 });
  assert.equal(verifyFounderSessionToken(expiredToken), null);
});

test('a token signed with a different secret fails verification', () => {
  setEnv('4242', 'a-test-signing-secret');
  const wrongSecretToken = jwt.sign({ role: 'founder' }, 'a-totally-different-secret', { expiresIn: '15m' });
  assert.equal(verifyFounderSessionToken(wrongSecretToken), null);
});

test('a well-formed token that is not a founder session is rejected', () => {
  setEnv('4242', 'a-test-signing-secret');
  const nonFounderToken = jwt.sign({ role: 'athlete' }, 'a-test-signing-secret', { expiresIn: '15m' });
  assert.equal(verifyFounderSessionToken(nonFounderToken), null);
});

test('verification fails closed when FOUNDER_SESSION_SECRET is missing at verify time', () => {
  setEnv('4242', 'a-test-signing-secret');
  const token = verifyFounderPin('4242');
  setEnv('4242', undefined);
  assert.equal(verifyFounderSessionToken(token), null);
});

// ── Middleware ───────────────────────────────────────────────────────────────

function makeRes() {
  return {
    statusCode: null,
    body: null,
    status(code) { this.statusCode = code; return this; },
    json(payload) { this.body = payload; return this; },
  };
}

test('middleware: missing Authorization header returns 401 and does not call next()', () => {
  setEnv('4242', 'a-test-signing-secret');
  const req = { headers: {} };
  const res = makeRes();
  let nextCalled = false;
  founderAuthenticate(req, res, () => { nextCalled = true; });
  assert.equal(res.statusCode, 401);
  assert.equal(nextCalled, false);
});

test('middleware: valid session token passes and attaches req.founderSession', () => {
  setEnv('4242', 'a-test-signing-secret');
  const token = verifyFounderPin('4242');
  const req = { headers: { authorization: `Bearer ${token}` } };
  const res = makeRes();
  let nextCalled = false;
  founderAuthenticate(req, res, () => { nextCalled = true; });
  assert.equal(nextCalled, true);
  assert.equal(res.statusCode, null);
  assert.equal(req.founderSession.role, 'founder');
});

test('middleware: expired token returns 401', () => {
  setEnv('4242', 'a-test-signing-secret');
  const expiredToken = jwt.sign({ role: 'founder' }, 'a-test-signing-secret', { expiresIn: -10 });
  const req = { headers: { authorization: `Bearer ${expiredToken}` } };
  const res = makeRes();
  let nextCalled = false;
  founderAuthenticate(req, res, () => { nextCalled = true; });
  assert.equal(res.statusCode, 401);
  assert.equal(nextCalled, false);
});

test('middleware: tampered token returns 401', () => {
  setEnv('4242', 'a-test-signing-secret');
  const token = verifyFounderPin('4242');
  const tampered = token.slice(0, -1) + (token.endsWith('a') ? 'b' : 'a');
  const req = { headers: { authorization: `Bearer ${tampered}` } };
  const res = makeRes();
  let nextCalled = false;
  founderAuthenticate(req, res, () => { nextCalled = true; });
  assert.equal(res.statusCode, 401);
  assert.equal(nextCalled, false);
});

// ── Login route + rate limiting (real HTTP, isolated limiter state) ────────
// Each test that depends on rate-limit state gets its own fresh module
// instance (cache cleared) so tests don't share one limiter's in-memory
// counters — otherwise an earlier test's failed attempts would leak into a
// later test's expectations.

function freshFounderAuthRouter() {
  const rateLimitsPath = require.resolve('../src/middleware/rateLimits');
  const routePath = require.resolve('../src/routes/founderAuth');
  delete require.cache[rateLimitsPath];
  delete require.cache[routePath];
  return require('../src/routes/founderAuth');
}

function startApp(router) {
  const express = require('express');
  const app = express();
  app.use(express.json());
  app.use('/auth', router);
  return new Promise((resolve) => {
    const server = app.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      resolve({ server, baseUrl: `http://127.0.0.1:${port}/auth` });
    });
  });
}

function stopApp(server) {
  return new Promise((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));
}

test('POST /auth/login: correct PIN returns a token, and the response never includes the PIN', async () => {
  setEnv('4242', 'a-test-signing-secret');
  const { server, baseUrl } = await startApp(freshFounderAuthRouter());
  try {
    const res = await fetch(`${baseUrl}/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pin: '4242' }),
    });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(typeof body.token, 'string');
    assert.ok(!JSON.stringify(body).includes('4242'));
  } finally {
    await stopApp(server);
  }
});

test('POST /auth/login: wrong PIN returns a generic 401 with no token', async () => {
  setEnv('4242', 'a-test-signing-secret');
  const { server, baseUrl } = await startApp(freshFounderAuthRouter());
  try {
    const res = await fetch(`${baseUrl}/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pin: '0000' }),
    });
    assert.equal(res.status, 401);
    const body = await res.json();
    assert.equal(body.token, undefined);
  } finally {
    await stopApp(server);
  }
});

test('GET /auth/session: valid token is accepted, missing/invalid token is rejected', async () => {
  setEnv('4242', 'a-test-signing-secret');
  const { server, baseUrl } = await startApp(freshFounderAuthRouter());
  try {
    const loginRes = await fetch(`${baseUrl}/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pin: '4242' }),
    });
    const { token } = await loginRes.json();

    const okRes = await fetch(`${baseUrl}/session`, { headers: { Authorization: `Bearer ${token}` } });
    assert.equal(okRes.status, 200);

    const noAuthRes = await fetch(`${baseUrl}/session`);
    assert.equal(noAuthRes.status, 401);

    const badAuthRes = await fetch(`${baseUrl}/session`, { headers: { Authorization: 'Bearer garbage' } });
    assert.equal(badAuthRes.status, 401);
  } finally {
    await stopApp(server);
  }
});

test('repeated failed logins are blocked after 5 attempts within the window', async () => {
  setEnv('4242', 'a-test-signing-secret');
  const { server, baseUrl } = await startApp(freshFounderAuthRouter());
  try {
    const statuses = [];
    for (let i = 0; i < 6; i++) {
      const res = await fetch(`${baseUrl}/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pin: '0000' }),
      });
      statuses.push(res.status);
    }
    assert.deepEqual(statuses.slice(0, 5), [401, 401, 401, 401, 401]);
    assert.equal(statuses[5], 429);
  } finally {
    await stopApp(server);
  }
});

test('successful authentication is not treated as a failed attempt — repeated correct logins are never blocked', async () => {
  setEnv('4242', 'a-test-signing-secret');
  const { server, baseUrl } = await startApp(freshFounderAuthRouter());
  try {
    for (let i = 0; i < 8; i++) {
      const res = await fetch(`${baseUrl}/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pin: '4242' }),
      });
      assert.equal(res.status, 200, `attempt ${i + 1} should succeed, not be rate-limited`);
    }
  } finally {
    await stopApp(server);
  }
});
