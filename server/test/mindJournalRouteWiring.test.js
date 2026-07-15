// Route-wiring + compatibility-guarantee checks for the Mind Journal
// rollout. Same introspection technique as consentRouteCoverage.test.js /
// prescriptionsRoute.test.js: read Express's mounted router stack to prove
// which middleware is attached, without a real request, database, or
// Anthropic call.

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

const MIND_JOURNAL_ROUTES = [
  { path: '/', method: 'POST' },
  { path: '/', method: 'GET' },
  { path: '/context', method: 'PATCH' },
];

test('/api/mind-journal is mounted', () => {
  assert.doesNotThrow(() => findMountedRouter('/api/mind-journal'));
});

test('every Mind Journal route requires authenticate then requireGuardianConsent (default export, not injected)', () => {
  const router = findMountedRouter('/api/mind-journal');
  for (const r of MIND_JOURNAL_ROUTES) {
    const route = findRouteLayer(router, r.path, r.method);
    const handles = middlewareNames(route);
    assert.ok(handles.includes(authenticate), `${r.method} ${r.path} missing authenticate`);
    assert.ok(handles.includes(requireGuardianConsent), `${r.method} ${r.path} missing requireGuardianConsent`);
    assert.ok(
      handles.indexOf(authenticate) < handles.indexOf(requireGuardianConsent),
      `${r.method} ${r.path}: authenticate must run before requireGuardianConsent`
    );
  }
});

test('unauthenticated requests to every Mind Journal route return 401', async () => {
  const { server, baseUrl } = await startTestServer();
  try {
    const post = await fetch(`${baseUrl}/api/mind-journal`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ states: ['calm'] }),
    });
    assert.equal(post.status, 401);

    const get = await fetch(`${baseUrl}/api/mind-journal`);
    assert.equal(get.status, 401);

    const patch = await fetch(`${baseUrl}/api/mind-journal/context`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ enabled: true }),
    });
    assert.equal(patch.status, 401);
  } finally {
    await stopTestServer(server);
  }
});

// ── Compatibility guarantees (section I) ────────────────────────────────────

test('the legacy Mental Fitness route file still exists and is still mounted at /api/mental-fitness', () => {
  assert.doesNotThrow(() => findMountedRouter('/api/mental-fitness'));
  const legacySrc = readFileSync(path.join(__dirname, '../src/routes/mentalFitness.js'), 'utf8');
  assert.match(legacySrc, /prisma\.mentalFitnessEntry\.create/);
  assert.match(legacySrc, /router\.post\('\/'/);
});

test('server/src/index.js still registers /api/mental-fitness alongside the new /api/mind-journal', () => {
  const src = readFileSync(path.join(__dirname, '../src/index.js'), 'utf8');
  assert.match(src, /app\.use\('\/api\/mental-fitness',\s*require\('\.\/routes\/mentalFitness'\)\)/);
  assert.match(src, /app\.use\('\/api\/mind-journal',\s*require\('\.\/routes\/mindJournal'\)\)/);
});

test('the Mind Journal route file never queries/writes prisma.mentalFitnessEntry, and the legacy route file never queries/writes prisma.mindJournalEntry', () => {
  const mindJournalSrc = readFileSync(path.join(__dirname, '../src/routes/mindJournal.js'), 'utf8');
  const legacySrc = readFileSync(path.join(__dirname, '../src/routes/mentalFitness.js'), 'utf8');
  assert.doesNotMatch(mindJournalSrc, /\.mentalFitnessEntry\./);
  assert.doesNotMatch(legacySrc, /\.mindJournalEntry\./);
});

test('the Mind Journal route only ever writes states/note fields — no score is converted from anything', () => {
  const src = readFileSync(path.join(__dirname, '../src/routes/mindJournal.js'), 'utf8');
  const createCallIdx = src.indexOf('client.mindJournalEntry.create(');
  const createBlock = src.slice(createCallIdx, src.indexOf(');', createCallIdx) + 2);
  assert.match(createBlock, /data: \{ userId: req\.userId, states: body\.states, note \}/);
});
