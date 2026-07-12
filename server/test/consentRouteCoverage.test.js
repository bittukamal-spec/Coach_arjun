const test = require('node:test');
const assert = require('node:assert/strict');

const app = require('../src/index.js'); // importable without starting a listener (PR-1)
const requireGuardianConsent = require('../src/middleware/requireGuardianConsent');
const authenticate = require('../src/middleware/authenticate');
const { startTestServer, stopTestServer } = require('./helpers/testServer');

// ── Route stack introspection helpers ──────────────────────────────────────
// These read Express's internal router structure to prove *wiring*
// (which middleware is attached, and in what order) without making any
// real request, touching a database, or calling Anthropic.

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

// ── Coverage manifest ───────────────────────────────────────────────────────
// Every route in the app that can call the Anthropic SDK, whether it was
// already gated before this PR or is gated by this PR. Routes that do NOT
// call Anthropic are listed separately below and asserted as NOT gated.

const AI_ROUTES = [
  // Already covered before this PR (unchanged — asserted to still hold).
  { mount: '/api/chat', path: '/message', method: 'POST', note: 'main coaching chat' },
  { mount: '/api/chat', path: '/wizard', method: 'POST', note: 'bounce-back / visualization / cue wizard' },
  { mount: '/api/debrief', path: '/', method: 'POST', note: 'debrief AI insight' },
  { mount: '/api/self-talk', path: '/generate', method: 'POST', note: 'focus card generation' },
  { mount: '/api/body-reset', path: '/arjun-note', method: 'POST', note: 'pressure reset AI note' },

  // Newly covered by this PR.
  { mount: '/api/profile-intro', path: '/', method: 'GET', note: 'personalized profile intro' },
  { mount: '/api/mental-fitness', path: '/', method: 'POST', note: 'legacy MFS AI coaching line (scheduled for later retirement, gated not redesigned)' },
  { mount: '/api/weekly-reports', path: '/', method: 'GET', note: 'lazy weekly report generation (sends raw athlete messages to Claude)' },
  { mount: '/api/sessions', path: '/end-stale', method: 'POST', note: 'auto-end stale sessions + AI summary' },
  { mount: '/api/sessions', path: '/:id/end', method: 'POST', note: 'end session + AI summary' },
];

// Non-AI routes in the same files that must NOT be gated — proves the PR
// did not over-broadly gate unrelated session/CRUD routes.
const NON_AI_ROUTES_MUST_NOT_BE_GATED = [
  { mount: '/api/sessions', path: '/', method: 'GET', note: 'list sessions' },
  { mount: '/api/sessions', path: '/', method: 'POST', note: 'create session' },
  { mount: '/api/sessions', path: '/:id/messages', method: 'GET', note: 'fetch messages' },
  { mount: '/api/sessions', path: '/:id', method: 'PATCH', note: 'update session status' },
  { mount: '/api/sessions', path: '/:id', method: 'DELETE', note: 'delete session' },
  { mount: '/api/mental-fitness', path: '/today', method: 'GET', note: "today's entry (no AI call)" },
  { mount: '/api/mental-fitness', path: '/week', method: 'GET', note: 'last 7 entries (no AI call)' },
  { mount: '/api/debrief', path: '/', method: 'GET', note: 'read debriefs (no AI call)' },
  { mount: '/api/self-talk', path: '/save', method: 'POST', note: 'save card (no AI call)' },
  { mount: '/api/body-reset', path: '/save', method: 'POST', note: 'save session (no AI call)' },
];

// Founder-only route: a different, non-athlete auth mechanism (static
// bearer token, `founderAuth`) — explicitly documented here as out of scope
// for guardian consent rather than silently untested.
const FOUNDER_ONLY_ROUTE = { mount: '/api/founder', path: '/pulse', method: 'GET', note: 'founder dashboard aggregate stats — founder-token auth, not athlete-facing' };

test('every known Anthropic-calling route has requireGuardianConsent wired after authenticate', () => {
  for (const r of AI_ROUTES) {
    const router = findMountedRouter(r.mount);
    const route = findRouteLayer(router, r.path, r.method);
    const handles = middlewareNames(route);

    assert.ok(
      handles.includes(requireGuardianConsent),
      `${r.method} ${r.mount}${r.path} (${r.note}) is missing requireGuardianConsent`
    );
    assert.ok(
      handles.includes(authenticate),
      `${r.method} ${r.mount}${r.path} (${r.note}) is missing authenticate`
    );
    assert.ok(
      handles.indexOf(authenticate) < handles.indexOf(requireGuardianConsent),
      `${r.method} ${r.mount}${r.path}: authenticate must run before requireGuardianConsent`
    );
  }
});

test('unrelated non-AI routes in the same files were NOT gated', () => {
  for (const r of NON_AI_ROUTES_MUST_NOT_BE_GATED) {
    const router = findMountedRouter(r.mount);
    const route = findRouteLayer(router, r.path, r.method);
    const handles = middlewareNames(route);

    assert.ok(
      !handles.includes(requireGuardianConsent),
      `${r.method} ${r.mount}${r.path} (${r.note}) should not require guardian consent`
    );
  }
});

test('founder-only route uses its own auth and is not athlete-consent-gated', () => {
  const router = findMountedRouter(FOUNDER_ONLY_ROUTE.mount);
  const route = findRouteLayer(router, FOUNDER_ONLY_ROUTE.path, FOUNDER_ONLY_ROUTE.method);
  const handles = middlewareNames(route);

  assert.ok(!handles.includes(authenticate), 'founder route should not use athlete JWT authenticate');
  assert.ok(!handles.includes(requireGuardianConsent), 'founder route is not athlete-facing and must not be consent-gated');
});

// ── One end-to-end check: authentication still runs first ──────────────────
// Proves via a real HTTP request (no DB, no Anthropic call reached) that
// adding guardian-consent coverage did not disturb the existing
// authentication behavior on a newly-gated route.

test('a newly-gated route still returns 401 (not 403) with no auth token', async () => {
  const { server, baseUrl } = await startTestServer();
  try {
    const res = await fetch(`${baseUrl}/api/profile-intro`);
    assert.equal(res.status, 401);
  } finally {
    await stopTestServer(server);
  }
});
