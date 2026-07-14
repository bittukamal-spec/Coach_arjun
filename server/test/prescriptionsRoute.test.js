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
const jwt = require('jsonwebtoken');
const express = require('express');

const app = require('../src/index.js'); // importable without starting a listener
const requireGuardianConsent = require('../src/middleware/requireGuardianConsent');
const { createRequireGuardianConsent } = require('../src/middleware/requireGuardianConsent');
const authenticate = require('../src/middleware/authenticate');
const { createLoadActivePrescription } = require('../src/services/coaching/completeActivePrescription');
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

test('GET /api/prescriptions/active requires authenticate then requireGuardianConsent', () => {
  const router = findMountedRouter('/api/prescriptions');
  const route = findRouteLayer(router, '/active', 'GET');
  const handles = middlewareNames(route);

  assert.ok(handles.includes(authenticate), 'missing authenticate');
  assert.ok(handles.includes(requireGuardianConsent), 'missing requireGuardianConsent');
  assert.ok(
    handles.indexOf(authenticate) < handles.indexOf(requireGuardianConsent),
    'authenticate must run before requireGuardianConsent'
  );
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

// ── GET /active consent gating + per-athlete scoping (PR-12 amendment) ────
// Full behavioral proof, not just wiring: a small isolated app mirrors the
// real route's exact middleware order (authenticate -> requireGuardianConsent
// -> handler) with a real signed JWT through the real `authenticate`
// middleware, an injected consent decision (createRequireGuardianConsent,
// same pattern as requireGuardianConsent.test.js), and an injected
// loadActivePrescription (no real Prisma client or database involved).

const TEST_JWT_SECRET = 'prescriptions-active-consent-test-secret';
const ORIGINAL_JWT_SECRET = process.env.JWT_SECRET;
test.before(() => { process.env.JWT_SECRET = TEST_JWT_SECRET; });
test.after(() => {
  if (ORIGINAL_JWT_SECRET === undefined) delete process.env.JWT_SECRET;
  else process.env.JWT_SECRET = ORIGINAL_JWT_SECRET;
});

function tokenFor(userId) {
  return jwt.sign({ userId }, TEST_JWT_SECRET, { expiresIn: '15m' });
}

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

function buildActiveApp({ findUser, rowsByUserId }) {
  const isolatedApp = express();
  const loadActivePrescription = createLoadActivePrescription({
    userCoachingState: { findUnique: async ({ where }) => rowsByUserId[where.userId] ?? null },
  });
  isolatedApp.get(
    '/api/prescriptions/active',
    authenticate,
    createRequireGuardianConsent(findUser),
    async (req, res) => {
      const prescription = await loadActivePrescription(req.userId);
      res.json({ prescription });
    }
  );
  return isolatedApp;
}

function startIsolated(isolatedApp) {
  return new Promise((resolve) => {
    const server = isolatedApp.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      resolve({ server, baseUrl: `http://127.0.0.1:${port}` });
    });
  });
}
function stopIsolated(server) {
  return new Promise((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));
}

test('GET /active: an unconsented minor receives 403 CONSENT_REQUIRED and the handler never runs', async () => {
  const isolatedApp = buildActiveApp({ findUser: async () => unconsentedMinor(), rowsByUserId: {} });
  const { server, baseUrl } = await startIsolated(isolatedApp);
  try {
    const res = await fetch(`${baseUrl}/api/prescriptions/active`, {
      headers: { Authorization: `Bearer ${tokenFor('minor-1')}` },
    });
    assert.equal(res.status, 403);
    const body = await res.json();
    assert.equal(body.code, 'CONSENT_REQUIRED');
  } finally {
    await stopIsolated(server);
  }
});

test('GET /active: a consented minor passes the middleware and receives their own prescription', async () => {
  const rowsByUserId = {
    'minor-2': {
      userId: 'minor-2',
      activeSelection: {
        prescription: { id: 'presc-minor', practiceKey: 'pressure_reset', situation: 's', cardContent: 'c', cueWord: null, status: 'ACTIVE', completedAt: null },
      },
    },
  };
  const isolatedApp = buildActiveApp({ findUser: async () => consentedMinor(), rowsByUserId });
  const { server, baseUrl } = await startIsolated(isolatedApp);
  try {
    const res = await fetch(`${baseUrl}/api/prescriptions/active`, {
      headers: { Authorization: `Bearer ${tokenFor('minor-2')}` },
    });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.prescription.prescriptionId, 'presc-minor');
  } finally {
    await stopIsolated(server);
  }
});

test('GET /active: an adult athlete passes the middleware', async () => {
  const isolatedApp = buildActiveApp({ findUser: async () => adult(), rowsByUserId: { 'adult-1': null } });
  const { server, baseUrl } = await startIsolated(isolatedApp);
  try {
    const res = await fetch(`${baseUrl}/api/prescriptions/active`, {
      headers: { Authorization: `Bearer ${tokenFor('adult-1')}` },
    });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.prescription, null);
  } finally {
    await stopIsolated(server);
  }
});

test('GET /active: never returns another athlete\'s prescription — each authenticated user is scoped strictly to their own row', async () => {
  const rowsByUserId = {
    'athlete-a': {
      userId: 'athlete-a',
      activeSelection: { prescription: { id: 'presc-a', practiceKey: 'pressure_reset', situation: 's-a', cardContent: 'c-a', cueWord: null, status: 'ACTIVE', completedAt: null } },
    },
    'athlete-b': {
      userId: 'athlete-b',
      activeSelection: { prescription: { id: 'presc-b', practiceKey: 'post_performance_reflection', situation: 's-b', cardContent: 'c-b', cueWord: null, status: 'ACTIVE', completedAt: null } },
    },
  };
  const isolatedApp = buildActiveApp({ findUser: async () => adult(), rowsByUserId });
  const { server, baseUrl } = await startIsolated(isolatedApp);
  try {
    const resA = await fetch(`${baseUrl}/api/prescriptions/active`, { headers: { Authorization: `Bearer ${tokenFor('athlete-a')}` } });
    const bodyA = await resA.json();
    const resB = await fetch(`${baseUrl}/api/prescriptions/active`, { headers: { Authorization: `Bearer ${tokenFor('athlete-b')}` } });
    const bodyB = await resB.json();

    assert.equal(bodyA.prescription.prescriptionId, 'presc-a');
    assert.equal(bodyB.prescription.prescriptionId, 'presc-b');
    assert.notEqual(bodyA.prescription.prescriptionId, bodyB.prescription.prescriptionId);
  } finally {
    await stopIsolated(server);
  }
});
