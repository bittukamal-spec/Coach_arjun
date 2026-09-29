// Ritual rebuild PR 1 — database-free HTTP tests of the routines router:
// real JWT through the real `authenticate`, an injected store and activity
// service. Covers the response/activity contract; the persistence rules
// (limit, import, mirror, deletion) are proven against a real database in
// routinesDb.test.js.

const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const jwt = require('jsonwebtoken');

const { createRoutinesRouter } = require('../src/routes/routines');
const { RoutineError } = require('../src/services/routines/routineStore');
const { createTouchActivity } = require('../src/services/activityTracking');

const SECRET = 'routines-api-test-secret';
const ORIGINAL_SECRET = process.env.JWT_SECRET;
test.before(() => { process.env.JWT_SECRET = SECRET; });
test.after(() => {
  if (ORIGINAL_SECRET === undefined) delete process.env.JWT_SECRET;
  else process.env.JWT_SECRET = ORIGINAL_SECRET;
});

const token = (userId) => jwt.sign({ userId }, SECRET, { expiresIn: '15m' });

function stubStore(overrides = {}) {
  const calls = [];
  const record = (name, result) => async (...args) => {
    calls.push([name, ...args]);
    if (result instanceof Error) throw result;
    return typeof result === 'function' ? result(...args) : result;
  };
  const routine = { id: 'r1', name: 'x', steps: [] };
  return {
    calls,
    list: record('list', { routines: [], limit: 5, legacy: { status: 'none', routineId: null } }),
    get: record('get', routine),
    create: record('create', routine),
    update: record('update', routine),
    remove: record('remove', { deleted: true, clearedLegacyRitual: false }),
    importLegacy: record('importLegacy', { status: 'imported', routine }),
    ...Object.fromEntries(Object.entries(overrides).map(([k, v]) => [k, record(k, v)])),
  };
}

async function withApp(options, fn) {
  const app = express();
  app.use(express.json());
  app.use('/api/routines', createRoutinesRouter(options));
  const server = app.listen(0, '127.0.0.1');
  await new Promise(r => server.once('listening', r));
  const base = `http://127.0.0.1:${server.address().port}/api/routines`;
  try {
    return await fn(async (method, path, body, userId = 'athlete-1') => {
      const res = await fetch(base + path, {
        method,
        headers: {
          ...(userId ? { Authorization: `Bearer ${token(userId)}` } : {}),
          ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
        },
        body: body !== undefined ? JSON.stringify(body) : undefined,
      });
      return { status: res.status, body: await res.json().catch(() => null) };
    });
  } finally {
    await new Promise(r => server.close(r));
  }
}

const validRoutine = { name: 'Between points', category: 'repeated_moment', steps: [{ kind: 'reset', instruction: 'Turn away' }] };

function spyActivity() {
  const touched = [];
  return { touched, touchActivity: async (id) => { touched.push(id); } };
}

test('unauthenticated requests are rejected before the store is touched', async () => {
  const store = stubStore();
  await withApp({ store, activity: spyActivity() }, async (call) => {
    for (const [m, p] of [['GET', '/'], ['POST', '/'], ['GET', '/r1'], ['PATCH', '/r1'], ['DELETE', '/r1'], ['POST', '/import-legacy']]) {
      assert.equal((await call(m, p, m === 'POST' || m === 'PATCH' ? {} : undefined, null)).status, 401);
    }
  });
  assert.equal(store.calls.length, 0);
});

test('the store always receives the authenticated athlete id, never a client-supplied one', async () => {
  const store = stubStore();
  await withApp({ store, activity: spyActivity() }, async (call) => {
    await call('GET', '/', undefined, 'athlete-7');
    await call('POST', '/', validRoutine, 'athlete-7');
    await call('PATCH', '/r1', { purpose: 'Reset' }, 'athlete-7');
    await call('DELETE', '/r1', undefined, 'athlete-7');
    await call('POST', '/import-legacy', undefined, 'athlete-7');
    assert.equal((await call('POST', '/', { ...validRoutine, userId: 'athlete-1' }, 'athlete-7')).status, 400);
  });
  assert.ok(store.calls.every(c => c[1] === 'athlete-7'));
});

test('store errors map to stable statuses; unexpected errors are a generic 500', async () => {
  const cases = [
    [new RoutineError('not_found'), 404, 'not_found'],
    [new RoutineError('source_not_found'), 404, 'source_not_found'],
    [new RoutineError('routine_limit_reached'), 409, 'routine_limit_reached'],
    [new Error('db exploded: secret detail'), 500, 'server_error'],
  ];
  for (const [err, status, error] of cases) {
    await withApp({ store: stubStore({ create: err }), activity: spyActivity() }, async (call) => {
      const res = await call('POST', '/', validRoutine);
      assert.equal(res.status, status);
      assert.deepEqual(res.body, { error });
    });
  }
});

test('activity is recorded only after a successful create or edit', async () => {
  const activity = spyActivity();
  await withApp({ store: stubStore(), activity }, async (call) => {
    assert.equal((await call('GET', '/')).status, 200);
    assert.equal((await call('GET', '/r1')).status, 200);
    assert.equal((await call('DELETE', '/r1')).status, 200);
    assert.equal((await call('POST', '/import-legacy')).status, 201);
    assert.equal((await call('POST', '/', { name: '' })).status, 400);
    assert.deepEqual(activity.touched, []);
    assert.equal((await call('POST', '/', validRoutine)).status, 201);
    assert.equal((await call('PATCH', '/r1', { purpose: 'Reset' })).status, 200);
  });
  assert.deepEqual(activity.touched, ['athlete-1', 'athlete-1']);

  const failing = spyActivity();
  await withApp({ store: stubStore({ create: new RoutineError('routine_limit_reached') }), activity: failing }, async (call) => {
    assert.equal((await call('POST', '/', validRoutine)).status, 409);
  });
  assert.deepEqual(failing.touched, []);
});

test('a failing activity write never turns a successful save into an error', async () => {
  const brokenClient = { user: { update: async () => { throw new Error('db down'); } } };
  const activity = { touchActivity: createTouchActivity(brokenClient) };
  const originalError = console.error;
  console.error = () => {};
  try {
    await withApp({ store: stubStore(), activity }, async (call) => {
      assert.equal((await call('POST', '/', validRoutine)).status, 201);
      assert.equal((await call('PATCH', '/r1', { purpose: 'x' })).status, 200);
    });
  } finally {
    console.error = originalError;
  }
});

test('safety-flagged text: nothing saved, structured event only, localized fixed guidance', async () => {
  const store = stubStore();
  const activity = spyActivity();
  const events = [];
  const safetyEvent = (...args) => { events.push(args); return Promise.resolve(); };
  await withApp({ store, activity, safetyEvent, loadLanguage: async () => 'hi' }, async (call) => {
    // Screened even when the rest of the payload is invalid.
    const res = await call('POST', '/', { steps: [{ kind: 'bogus', instruction: 'I want to kill myself' }] });
    assert.equal(res.status, 200);
    assert.equal(res.body.safetyFlag, 'needs_support');
    // The athlete's language (hi) selects the fixed Hinglish crisis copy,
    // which carries every helpline including KIRAN.
    assert.match(res.body.guidance, /^Jo tum describe/);
    assert.match(res.body.guidance, /KIRAN 1800-599-0019/);
    const patch = await call('PATCH', '/r1', { existingHabits: ['i want to die'] });
    assert.equal(patch.body.safetyFlag, 'needs_support');
  });
  assert.deepEqual(store.calls, []);
  assert.deepEqual(activity.touched, []);
  assert.equal(events.length, 2);
  for (const [userId, surface, category, source] of events) {
    assert.equal(userId, 'athlete-1');
    assert.equal(surface, 'ritual');
    assert.equal(category, 'crisis');
    assert.deepEqual(Object.keys(source).sort(), ['riskLevel', 'sourceType']);
    assert.equal(source.sourceType, 'routine_save');
  }
});

test('oversized bodies and malformed ids are rejected before any work', async () => {
  const store = stubStore();
  await withApp({ store, activity: spyActivity() }, async (call) => {
    assert.equal((await call('POST', '/', { ...validRoutine, moment: 'x'.repeat(17000) })).status, 413);
    assert.equal((await call('PATCH', '/bad%20id', { purpose: 'x' })).status, 404);
    assert.equal((await call('GET', '/..%2Fx')).status, 404);
  });
  assert.deepEqual(store.calls, []);
});

test('no routine route sends anything to an AI model', () => {
  const { readFileSync } = require('node:fs');
  const path = require('node:path');
  for (const f of ['routes/routines.js', 'services/routines/routineStore.js', 'services/routines/validateRoutine.js', 'services/routines/legacyRitual.js']) {
    const src = readFileSync(path.join(__dirname, '../src', f), 'utf8');
    assert.doesNotMatch(src, /require\(['"]@anthropic-ai|new Anthropic\(|messages\.(create|stream)\(/, f);
  }
});

// ── Legacy screening (follow-up) ─────────────────────────────────────────

test('import-legacy: a flagged legacy ritual returns guidance, one event, no activity, and no screen details', async () => {
  const store = stubStore({ importLegacy: { status: 'needs_support', routine: null, screen: { category: 'crisis', riskLevel: 'high' } } });
  const activity = spyActivity();
  const events = [];
  await withApp({ store, activity, safetyEvent: (...a) => { events.push(a); return Promise.resolve(); } }, async (call) => {
    const res = await call('POST', '/import-legacy');
    assert.equal(res.status, 200);
    assert.deepEqual(Object.keys(res.body).sort(), ['guidance', 'routine', 'safetyFlag', 'status']);
    assert.equal(res.body.status, 'needs_support');
    assert.equal(res.body.routine, null);
    assert.match(res.body.guidance, /iCall/);
  });
  assert.deepEqual(events, [['athlete-1', 'ritual', 'crisis', { riskLevel: 'high', sourceType: 'ritual_legacy_import' }]]);
  assert.deepEqual(activity.touched, []);
});

async function withRitualApp(store, safetyEvent, fn) {
  const { createRitualRouter } = require('../src/routes/ritual');
  const client = { user: { findUnique: async () => ({ language: 'en' }) } };
  const app = express();
  app.use(express.json());
  app.use('/api/ritual', createRitualRouter(client, store, safetyEvent));
  const server = app.listen(0, '127.0.0.1');
  await new Promise(r => server.once('listening', r));
  try {
    return await fn(async (body) => {
      const res = await fetch(`http://127.0.0.1:${server.address().port}/api/ritual/me`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token('athlete-1')}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      return { status: res.status, body: await res.json() };
    });
  } finally {
    await new Promise(r => server.close(r));
  }
}

test('legacy POST /api/ritual/me: flagged text is screened before any write, with exactly one event', async () => {
  const saves = [];
  const events = [];
  const store = { saveLegacyRitual: async (...a) => { saves.push(a); return { mirroredTo: null }; } };
  await withRitualApp(store, (...a) => { events.push(a); return Promise.resolve(); }, async (post) => {
    const res = await post({ ritualName: 'i want to die', steps: [{ type: 'cue', label: 'I want to kill myself' }] });
    assert.equal(res.status, 422);
    assert.equal(res.body.safetyFlag, 'needs_support');
    assert.equal(res.body.error, 'needs_support');
    assert.match(res.body.guidance, /KIRAN/);

    const safe = await post({ ritualName: 'Match day', steps: [{ type: 'cue', label: 'Sharp' }] });
    assert.deepEqual(safe, { status: 200, body: { ok: true } });
  });
  assert.equal(events.length, 1);
  assert.deepEqual(events[0].slice(1), ['ritual', 'crisis', { riskLevel: 'high', sourceType: 'ritual_legacy_save' }]);
  assert.deepEqual(saves, [['athlete-1', { ritualName: 'Match day', steps: [{ type: 'cue', label: 'Sharp' }] }]]);
});
