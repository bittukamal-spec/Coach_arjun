// Focused tests for the FOUNDER_DASHBOARD_URL CORS addition. Same pattern
// as corsVercelPreview.test.js: env vars are set before the app module is
// first required so index.js's origin-list parsing picks them up, then the
// real app is booted on an ephemeral port — no production connection.

process.env.CLIENT_URL = 'https://athlete-app.example,http://localhost:5173';
process.env.FOUNDER_DASHBOARD_URL = 'https://coach-arjun.vercel.app';
// Needed for the founder-login tests below (unset by default in this env —
// see founderAuth.test.js for the same setup pattern).
process.env.FOUNDER_PIN = '4242';
process.env.FOUNDER_SESSION_SECRET = 'cors-test-founder-session-secret';

const test = require('node:test');
const assert = require('node:assert/strict');

const { startTestServer, stopTestServer } = require('./helpers/testServer');

let server;
let baseUrl;

test.before(async () => {
  ({ server, baseUrl } = await startTestServer());
});

test.after(async () => {
  await stopTestServer(server);
});

async function preflight(origin, path = '/api/health', method = 'GET') {
  return fetch(`${baseUrl}${path}`, {
    method: 'OPTIONS',
    headers: {
      Origin: origin,
      'Access-Control-Request-Method': method,
    },
  });
}

// ── Existing athlete origins remain allowed (CLIENT_URL untouched) ────────

test('the existing CLIENT_URL athlete origin is still allowed', async () => {
  const res = await preflight('https://athlete-app.example');
  assert.equal(res.headers.get('access-control-allow-origin'), 'https://athlete-app.example');
});

test('a second, comma-separated CLIENT_URL origin (local dev) still works alongside FOUNDER_DASHBOARD_URL', async () => {
  const res = await preflight('http://localhost:5173');
  assert.equal(res.headers.get('access-control-allow-origin'), 'http://localhost:5173');
});

test('the hardcoded production apex domain remains allowed, unaffected by this change', async () => {
  const res = await preflight('https://coacharjun.in');
  assert.equal(res.headers.get('access-control-allow-origin'), 'https://coacharjun.in');
});

// ── New Founder Dashboard origin ──────────────────────────────────────────

test('the FOUNDER_DASHBOARD_URL origin is allowed', async () => {
  const res = await preflight('https://coach-arjun.vercel.app');
  assert.equal(res.headers.get('access-control-allow-origin'), 'https://coach-arjun.vercel.app');
  assert.equal(res.status, 204);
});

// ── Rejection / no wildcard ────────────────────────────────────────────────

test('an unrelated, unknown origin is rejected — no CORS header at all', async () => {
  const res = await preflight('https://evil.example.com');
  assert.equal(res.headers.get('access-control-allow-origin'), null);
});

test('a wildcard is never introduced: allowed origins get the exact origin echoed back, never "*"', async () => {
  const res = await preflight('https://coach-arjun.vercel.app');
  const allowOrigin = res.headers.get('access-control-allow-origin');
  assert.notEqual(allowOrigin, '*');
  assert.equal(allowOrigin, 'https://coach-arjun.vercel.app');
});

test('a rejected origin never falls back to a wildcard response either', async () => {
  const res = await preflight('https://not-allowed.example.com');
  assert.notEqual(res.headers.get('access-control-allow-origin'), '*');
  assert.equal(res.headers.get('access-control-allow-origin'), null);
});

// ── Credentials / methods / headers preserved ────────────────────────────

test('credentials behavior remains intact for an allowed origin', async () => {
  const res = await preflight('https://coach-arjun.vercel.app');
  assert.equal(res.headers.get('access-control-allow-credentials'), 'true');
});

test('credentials remain enabled for existing athlete origins too', async () => {
  const res = await preflight('https://athlete-app.example');
  assert.equal(res.headers.get('access-control-allow-credentials'), 'true');
});

// ── The actual reported production bug: founder login preflight ─────────

test('OPTIONS preflight for POST /api/founder/auth/login from the Founder Dashboard origin now returns Access-Control-Allow-Origin (the reported bug)', async () => {
  const res = await preflight('https://coach-arjun.vercel.app', '/api/founder/auth/login', 'POST');
  assert.equal(res.status, 204);
  assert.equal(res.headers.get('access-control-allow-origin'), 'https://coach-arjun.vercel.app');
});

// ── Founder PIN/session auth itself is unchanged ─────────────────────────

test('founder login with the correct PIN still succeeds from the Founder Dashboard origin, with CORS headers present on the real response', async () => {
  const res = await fetch(`${baseUrl}/api/founder/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: 'https://coach-arjun.vercel.app' },
    body: JSON.stringify({ pin: '4242' }),
  });
  assert.equal(res.status, 200);
  assert.equal(res.headers.get('access-control-allow-origin'), 'https://coach-arjun.vercel.app');
  const body = await res.json();
  assert.equal(typeof body.token, 'string');
});

test('founder login with a wrong PIN still returns 401 — auth behavior itself is untouched by this CORS change', async () => {
  const res = await fetch(`${baseUrl}/api/founder/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: 'https://coach-arjun.vercel.app' },
    body: JSON.stringify({ pin: '0000' }),
  });
  assert.equal(res.status, 401);
});

test('a request without an Origin header still behaves normally (non-browser / same-origin callers unaffected)', async () => {
  const res = await fetch(`${baseUrl}/api/health`);
  assert.equal(res.status, 200);
});
