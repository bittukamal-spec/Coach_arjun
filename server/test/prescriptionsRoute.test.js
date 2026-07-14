// Route-wiring checks for PR-11's POST /api/prescriptions/claim-opener —
// same introspection technique as consentRouteCoverage.test.js: read
// Express's mounted router stack to prove which middleware is attached,
// without making a real request, touching a database, or calling
// Anthropic. This route makes zero Anthropic calls itself, but is still
// gated with the same athlete authentication + guardian-consent middleware
// as every other coaching endpoint.

const test = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const path = require('node:path');

const app = require('../src/index.js'); // importable without starting a listener
const requireGuardianConsent = require('../src/middleware/requireGuardianConsent');
const authenticate = require('../src/middleware/authenticate');
const { startTestServer, stopTestServer } = require('./helpers/testServer');

function findMountedRouter(mountPath) {
  const layer = app._router.stack.find(
    (l) => l.name === 'router' && l.regexp.test(`${mountPath}/`)
  );
  if (!layer) throw new Error(`No router mounted at ${mountPath}`);
  return layer.handle;
}

function findRouteLayer(router, routePath, method) {
  const layer = router.stack.find(
    (l) => l.route && l.route.path === routePath && l.route.methods[method.toLowerCase()]
  );
  if (!layer) throw new Error(`No ${method} ${routePath} route found`);
  return layer.route;
}

function middlewareNames(route) {
  return route.stack.map((s) => s.handle);
}

test('POST /api/prescriptions/claim-opener requires authenticate then requireGuardianConsent', () => {
  const router = findMountedRouter('/api/prescriptions');
  const route = findRouteLayer(router, '/claim-opener', 'POST');
  const handles = middlewareNames(route);

  assert.ok(handles.includes(authenticate), 'missing authenticate');
  assert.ok(handles.includes(requireGuardianConsent), 'missing requireGuardianConsent');
  assert.ok(
    handles.indexOf(authenticate) < handles.indexOf(requireGuardianConsent),
    'authenticate must run before requireGuardianConsent'
  );
});

test('the route file never constructs or calls an Anthropic client', () => {
  const src = readFileSync(path.join(__dirname, '../src/routes/prescriptions.js'), 'utf8');
  assert.doesNotMatch(src, /require\(['"]@anthropic-ai\/sdk['"]\)|new Anthropic\(/, 'this route must never construct or call the Anthropic SDK');
});

test('an unauthenticated claim-opener request returns 401, not 400/403/404', async () => {
  const { server, baseUrl } = await startTestServer();
  try {
    const res = await fetch(`${baseUrl}/api/prescriptions/claim-opener`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chatSessionId: 'cs-1' }),
    });
    assert.equal(res.status, 401);
  } finally {
    await stopTestServer(server);
  }
});

// ── PR-12: exact prescription completion linkage ─────────────────────────

test('POST /api/prescriptions/:prescriptionId/complete requires authenticate then requireGuardianConsent', () => {
  const router = findMountedRouter('/api/prescriptions');
  const route = findRouteLayer(router, '/:prescriptionId/complete', 'POST');
  const handles = middlewareNames(route);

  assert.ok(handles.includes(authenticate), 'missing authenticate');
  assert.ok(handles.includes(requireGuardianConsent), 'missing requireGuardianConsent');
  assert.ok(
    handles.indexOf(authenticate) < handles.indexOf(requireGuardianConsent),
    'authenticate must run before requireGuardianConsent'
  );
});

test('GET /api/prescriptions/active requires authenticate (a pure read, same pattern as GET /api/sessions)', () => {
  const router = findMountedRouter('/api/prescriptions');
  const route = findRouteLayer(router, '/active', 'GET');
  const handles = middlewareNames(route);
  assert.ok(handles.includes(authenticate), 'missing authenticate');
});

test('an unauthenticated complete request returns 401, not 400/403/404/409', async () => {
  const { server, baseUrl } = await startTestServer();
  try {
    const res = await fetch(`${baseUrl}/api/prescriptions/presc-1/complete`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ practiceKey: 'pressure_reset' }),
    });
    assert.equal(res.status, 401);
  } finally {
    await stopTestServer(server);
  }
});

test('an unauthenticated active-prescription lookup returns 401', async () => {
  const { server, baseUrl } = await startTestServer();
  try {
    const res = await fetch(`${baseUrl}/api/prescriptions/active`);
    assert.equal(res.status, 401);
  } finally {
    await stopTestServer(server);
  }
});
