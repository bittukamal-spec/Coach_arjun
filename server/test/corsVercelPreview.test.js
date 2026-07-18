const test = require('node:test');
const assert = require('node:assert/strict');

// Set before requiring the app so the comma-separated CLIENT_URL parsing
// (server/src/index.js) picks up multiple extra origins, same as production.
process.env.CLIENT_URL = 'https://founder-dashboard.example,http://localhost:5173';

const { startTestServer, stopTestServer } = require('./helpers/testServer');

let server;
let baseUrl;

test.before(async () => {
  ({ server, baseUrl } = await startTestServer());
});

test.after(async () => {
  await stopTestServer(server);
});

async function preflight(origin) {
  return fetch(`${baseUrl}/api/health`, {
    method: 'OPTIONS',
    headers: {
      Origin: origin,
      'Access-Control-Request-Method': 'GET',
    },
  });
}

test('allows the production apex domain', async () => {
  const res = await preflight('https://coacharjun.in');
  assert.equal(res.headers.get('access-control-allow-origin'), 'https://coacharjun.in');
});

test('allows the production www subdomain', async () => {
  const res = await preflight('https://www.coacharjun.in');
  assert.equal(res.headers.get('access-control-allow-origin'), 'https://www.coacharjun.in');
});

test('allows a valid hash-form Arjun Vercel preview origin', async () => {
  const origin = 'https://ai-mental-coach-wvcw-hc8y8516e-bittukamal-specs-projects.vercel.app';
  const res = await preflight(origin);
  assert.equal(res.headers.get('access-control-allow-origin'), origin);
});

test('allows a valid git/branch-form Arjun Vercel preview origin matching the pinned pattern', async () => {
  const origin = 'https://ai-mental-coach-wvcw-git-feature-cors-fix-bittukamal-specs-projects.vercel.app';
  const res = await preflight(origin);
  assert.equal(res.headers.get('access-control-allow-origin'), origin);
});

test('rejects an unrelated Vercel origin', async () => {
  const res = await preflight('https://some-other-app.vercel.app');
  assert.equal(res.headers.get('access-control-allow-origin'), null);
});

test('rejects a similarly named Arjun project under another Vercel team', async () => {
  const origin = 'https://ai-mental-coach-wvcw-hc8y8516e-some-other-teams-projects.vercel.app';
  const res = await preflight(origin);
  assert.equal(res.headers.get('access-control-allow-origin'), null);
});

test('rejects an arbitrary external origin', async () => {
  const res = await preflight('https://evil.example.com');
  assert.equal(res.headers.get('access-control-allow-origin'), null);
});

test('a request without an Origin header still behaves normally', async () => {
  const res = await fetch(`${baseUrl}/api/health`);
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.status, 'ok');
});

test('existing comma-separated CLIENT_URL support remains valid — first extra origin', async () => {
  const res = await preflight('https://founder-dashboard.example');
  assert.equal(res.headers.get('access-control-allow-origin'), 'https://founder-dashboard.example');
});

test('existing comma-separated CLIENT_URL support remains valid — second extra origin', async () => {
  const res = await preflight('http://localhost:5173');
  assert.equal(res.headers.get('access-control-allow-origin'), 'http://localhost:5173');
});
