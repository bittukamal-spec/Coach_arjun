// Ritual rebuild PR 1 — end-to-end tests of the routines API, the legacy
// /api/ritual/me compatibility path, selective deletion and full account
// deletion, through the REAL Express app and REAL Prisma against a REAL
// PostgreSQL database (needed to prove the row lock, the unique constraint
// and the cascades — an in-memory fake cannot).
//
// SAFETY: this file never touches a database unless ROUTINES_TEST_DATABASE_URL
// is set, and then only if it points at a local host (localhost/127.0.0.1)
// and a database whose name contains "test". DATABASE_URL is overwritten for
// this test process only (node --test runs each file in its own process), so
// no other configured database can be reached. Without the variable every
// test is skipped, which keeps the default `npm test` database-free, as this
// suite has always been.
//
// To run locally against a throwaway database:
//   ROUTINES_TEST_DATABASE_URL=postgresql://postgres@127.0.0.1:55432/arjun_routines_test \
//     npx prisma db push --skip-generate   # (with DATABASE_URL set to the same URL)
//   ROUTINES_TEST_DATABASE_URL=… node --test test/routinesDb.test.js

const test = require('node:test');
const assert = require('node:assert/strict');

const TEST_DB_URL = process.env.ROUTINES_TEST_DATABASE_URL || '';

function isolatedTestDb(url) {
  try {
    const u = new URL(url);
    const dbName = u.pathname.replace(/^\//, '');
    return ['localhost', '127.0.0.1', '[::1]'].includes(u.hostname) && /test/i.test(dbName);
  } catch {
    return false;
  }
}

const SKIP = !TEST_DB_URL
  ? 'ROUTINES_TEST_DATABASE_URL not set — database-backed routine tests skipped'
  : (!isolatedTestDb(TEST_DB_URL) ? 'ROUTINES_TEST_DATABASE_URL must be a local *test* database — refusing to run' : false);

if (!SKIP) {
  process.env.DATABASE_URL = TEST_DB_URL;
  process.env.JWT_SECRET = 'routines-db-test-secret';
  delete process.env.RESEND_API_KEY; // deletion email must never be sent
}

const RUN_ID = `rt${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
let prisma; let server; let baseUrl; let jwt;
const createdUserIds = [];

test.before(async () => {
  if (SKIP) return;
  jwt = require('jsonwebtoken');
  const { PrismaClient } = require('@prisma/client');
  prisma = new PrismaClient();
  const { startTestServer } = require('./helpers/testServer');
  ({ server, baseUrl } = await startTestServer());
});

test.after(async () => {
  if (SKIP) return;
  await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
  await prisma.$disconnect();
  await require('./helpers/testServer').stopTestServer(server);
});

let userSeq = 0;
async function makeUser(data = {}) {
  const id = `${RUN_ID}-u${++userSeq}`;
  createdUserIds.push(id);
  await prisma.user.create({ data: { id, email: `${id}@routines.test`, name: 'Test Athlete', sport: 'tennis', ...data } });
  return { id, token: jwt.sign({ userId: id }, process.env.JWT_SECRET, { expiresIn: '15m' }) };
}

async function api(token, method, path, body) {
  const res = await fetch(`${baseUrl}${path}`, {
    method,
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  let json = null;
  try { json = await res.json(); } catch { /* empty */ }
  return { status: res.status, body: json };
}

function routineBody(n = 1, overrides = {}) {
  return {
    name: `Routine ${n}`,
    category: 'repeated_moment',
    moment: 'Between points',
    steps: [{ kind: 'reset', instruction: 'Turn to the back fence' }, { kind: 'cue', instruction: 'Say the word', cue: 'Next' }],
    ...overrides,
  };
}

const LEGACY_STEPS = [
  { type: 'breathe', label: 'Box breathing × 3 rounds' },
  { type: 'cue', label: "Say: 'Sharp and ready'" },
  { type: 'physical', label: 'Jump 3 times and roll shoulders' },
];
const legacyUser = () => makeUser({ ritualName: 'My Match Ritual', ritualSteps: JSON.stringify(LEGACY_STEPS) });

// ── Authentication and ownership ────────────────────────────────────────

test('every routines endpoint requires authentication', { skip: SKIP }, async () => {
  for (const [method, path] of [
    ['GET', '/api/routines'], ['GET', '/api/routines/abc'], ['POST', '/api/routines'],
    ['PATCH', '/api/routines/abc'], ['DELETE', '/api/routines/abc'], ['POST', '/api/routines/import-legacy'],
  ]) {
    const res = await api(null, method, path, method === 'GET' || method === 'DELETE' ? undefined : {});
    assert.equal(res.status, 401, `${method} ${path}`);
  }
});

test('another athlete cannot read, edit, delete or adapt my routine', { skip: SKIP }, async () => {
  const owner = await makeUser();
  const intruder = await makeUser();
  const { body: { routine } } = await api(owner.token, 'POST', '/api/routines', routineBody());

  assert.equal((await api(intruder.token, 'GET', `/api/routines/${routine.id}`)).status, 404);
  assert.equal((await api(intruder.token, 'PATCH', `/api/routines/${routine.id}`, { name: 'Mine now' })).status, 404);
  assert.equal((await api(intruder.token, 'DELETE', `/api/routines/${routine.id}`)).status, 404);
  const adapt = await api(intruder.token, 'POST', '/api/routines', routineBody(2, { sourceRoutineId: routine.id }));
  assert.equal(adapt.status, 404);
  assert.equal(adapt.body.error, 'source_not_found');
  assert.equal((await api(intruder.token, 'GET', '/api/routines')).body.routines.length, 0);

  const after = await prisma.routine.findUnique({ where: { id: routine.id } });
  assert.equal(after.name, 'Routine 1');
  assert.equal(await prisma.routine.count({ where: { userId: intruder.id } }), 0);
});

// ── CRUD, validation, adaptation ────────────────────────────────────────

test('create stores every captured field, snapshots profile sport, and returns stable step ids', { skip: SKIP }, async () => {
  const u = await makeUser();
  const res = await api(u.token, 'POST', '/api/routines', routineBody(1, {
    role: 'Singles', startTrigger: 'Ball is dead', existingHabits: ['Fix strings'], purpose: 'Let go',
    templateKey: 'between_points', templateVersion: 1,
    steps: [{ id: 'keep', kind: 'reset', instruction: 'Fix strings', origin: 'existing' }],
  }));
  assert.equal(res.status, 201);
  const r = res.body.routine;
  assert.equal(r.sport, 'tennis');
  assert.equal(r.role, 'Singles');
  assert.deepEqual(r.existingHabits, ['Fix strings']);
  assert.deepEqual(r.steps, [{ id: 'keep', kind: 'reset', instruction: 'Fix strings', cue: null, origin: 'existing' }]);
  assert.equal(r.templateKey, 'between_points');
  assert.equal(r.isLegacyImport, false);

  const patched = await api(u.token, 'PATCH', `/api/routines/${r.id}`, { purpose: 'Reset fast' });
  assert.equal(patched.status, 200);
  assert.equal(patched.body.routine.purpose, 'Reset fast');
  assert.deepEqual(patched.body.routine.steps, r.steps);
});

test('invalid nested payloads are rejected with 400 and nothing is written', { skip: SKIP }, async () => {
  const u = await makeUser();
  const bad = [
    routineBody(1, { steps: [{ kind: 'cue', instruction: 'x', extra: 1 }] }),
    routineBody(1, { steps: [{ kind: 'nope', instruction: 'x' }] }),
    routineBody(1, { steps: Array(6).fill({ kind: 'cue', instruction: 'x' }) }),
    routineBody(1, { steps: [{ kind: 'cue', instruction: 'x'.repeat(121) }] }),
    routineBody(1, { category: 'match_day' }),
    routineBody(1, { userId: 'someone-else' }),
  ];
  for (const body of bad) assert.equal((await api(u.token, 'POST', '/api/routines', body)).status, 400);
  const tooBig = await api(u.token, 'POST', '/api/routines', routineBody(1, { moment: 'x'.repeat(20000) }));
  assert.equal(tooBig.status, 413);
  assert.equal(await prisma.routine.count({ where: { userId: u.id } }), 0);
});

test('an adaptation is an independent copy: editing or deleting the source never changes it', { skip: SKIP }, async () => {
  const u = await makeUser();
  const source = (await api(u.token, 'POST', '/api/routines', routineBody(1))).body.routine;
  const adapted = (await api(u.token, 'POST', '/api/routines', routineBody(2, {
    category: 'pressure_moment', sourceRoutineId: source.id, steps: source.steps,
  }))).body.routine;
  assert.equal(adapted.sourceRoutineId, source.id);

  await api(u.token, 'PATCH', `/api/routines/${source.id}`, { steps: [{ kind: 'custom', instruction: 'Totally different' }] });
  const afterEdit = (await api(u.token, 'GET', `/api/routines/${adapted.id}`)).body.routine;
  assert.deepEqual(afterEdit.steps, source.steps);

  await api(u.token, 'DELETE', `/api/routines/${source.id}`);
  const afterDelete = (await api(u.token, 'GET', `/api/routines/${adapted.id}`)).body.routine;
  assert.equal(afterDelete.sourceRoutineId, null);
  assert.deepEqual(afterDelete.steps, source.steps);
});

// ── Five-routine limit, including concurrency ───────────────────────────

test('the 5-routine limit holds under 12 concurrent creates', { skip: SKIP }, async () => {
  const u = await makeUser();
  const results = await Promise.all(Array.from({ length: 12 }, (_, i) => api(u.token, 'POST', '/api/routines', routineBody(i))));
  assert.equal(results.filter(r => r.status === 201).length, 5);
  assert.equal(results.filter(r => r.status === 409 && r.body.error === 'routine_limit_reached').length, 7);
  assert.equal(await prisma.routine.count({ where: { userId: u.id } }), 5);

  // Deleting one frees exactly one slot.
  const one = results.find(r => r.status === 201).body.routine;
  await api(u.token, 'DELETE', `/api/routines/${one.id}`);
  assert.equal((await api(u.token, 'POST', '/api/routines', routineBody(99))).status, 201);
  assert.equal((await api(u.token, 'POST', '/api/routines', routineBody(100))).status, 409);
});

// ── Legacy import ───────────────────────────────────────────────────────

test('GET requests are read-only: listing never imports the legacy ritual', { skip: SKIP }, async () => {
  const u = await legacyUser();
  const list = await api(u.token, 'GET', '/api/routines');
  assert.equal(list.status, 200);
  assert.deepEqual(list.body.routines, []);
  assert.deepEqual(list.body.legacy, { status: 'available', routineId: null });
  assert.equal(await prisma.routine.count({ where: { userId: u.id } }), 0);
  assert.equal(await prisma.ritualLegacyImport.count({ where: { userId: u.id } }), 0);
  const user = await prisma.user.findUnique({ where: { id: u.id } });
  assert.equal(user.lastActiveAt, null);
});

test('import preserves wording and order; retries and concurrent imports never duplicate', { skip: SKIP }, async () => {
  const u = await legacyUser();
  const results = await Promise.all(Array.from({ length: 6 }, () => api(u.token, 'POST', '/api/routines/import-legacy')));
  const imported = results.filter(r => r.status === 201);
  assert.equal(imported.length, 1);
  assert.ok(results.filter(r => r.status === 200).every(r => r.body.status === 'already_imported'));

  const routine = imported[0].body.routine;
  assert.equal(routine.name, 'My Match Ritual');
  assert.equal(routine.category, 'session_preparation');
  assert.equal(routine.isLegacyImport, true);
  assert.deepEqual(routine.steps.map(s => [s.kind, s.instruction]), LEGACY_STEPS.map(s => [s.type, s.label]));
  assert.equal(await prisma.routine.count({ where: { userId: u.id } }), 1);

  // Import is not athlete activity, first time or retried.
  assert.equal((await prisma.user.findUnique({ where: { id: u.id } })).lastActiveAt, null);
  // The legacy fields are left exactly as they were.
  const user = await prisma.user.findUnique({ where: { id: u.id } });
  assert.deepEqual(JSON.parse(user.ritualSteps), LEGACY_STEPS);

  const list = await api(u.token, 'GET', '/api/routines');
  assert.deepEqual(list.body.legacy, { status: 'linked', routineId: routine.id });
});

test('re-import never overwrites an edited imported routine; the edit is mirrored to the legacy fields', { skip: SKIP }, async () => {
  const u = await legacyUser();
  const routine = (await api(u.token, 'POST', '/api/routines/import-legacy')).body.routine;
  const edited = (await api(u.token, 'PATCH', `/api/routines/${routine.id}`, {
    name: 'Serve routine',
    steps: [{ id: routine.steps[1].id, kind: 'cue', instruction: 'Say: ready', cue: 'Ready' }, { kind: 'reset', instruction: 'Towel off' }],
  })).body.routine;

  const again = await api(u.token, 'POST', '/api/routines/import-legacy');
  assert.equal(again.status, 200);
  assert.equal(again.body.status, 'already_imported');
  assert.deepEqual(again.body.routine.steps, edited.steps);
  assert.equal(again.body.routine.name, 'Serve routine');

  // The current /ritual UI (and Coach, which reads the same fields) sees the edit.
  const legacy = await api(u.token, 'GET', '/api/ritual/me');
  assert.deepEqual(legacy.body, {
    ritualName: 'Serve routine',
    steps: [{ type: 'cue', label: 'Say: ready' }, { type: 'custom', label: 'Towel off' }],
  });
});

test('a cached legacy client saving after import updates the routine too (no silent divergence, cues kept)', { skip: SKIP }, async () => {
  const u = await legacyUser();
  const routine = (await api(u.token, 'POST', '/api/routines/import-legacy')).body.routine;
  await api(u.token, 'PATCH', `/api/routines/${routine.id}`, {
    steps: routine.steps.map((s, i) => (i === 1 ? { ...s, cue: 'Sharp' } : s)),
  });

  // Old UI edits step 3's text and re-sends steps 1–2 unchanged.
  const res = await api(u.token, 'POST', '/api/ritual/me', {
    ritualName: 'Match day',
    steps: [LEGACY_STEPS[0], LEGACY_STEPS[1], { type: 'physical', label: 'Five skips' }],
  });
  assert.deepEqual(res, { status: 200, body: { ok: true } });

  const after = (await api(u.token, 'GET', `/api/routines/${routine.id}`)).body.routine;
  assert.equal(after.name, 'Match day');
  assert.deepEqual(after.steps[0], routine.steps[0]);
  assert.equal(after.steps[1].cue, 'Sharp', 'unchanged legacy step keeps the cue the old UI cannot see');
  assert.equal(after.steps[2].id, routine.steps[2].id);
  assert.equal(after.steps[2].instruction, 'Five skips');
  assert.equal(await prisma.routine.count({ where: { userId: u.id } }), 1);
  assert.deepEqual((await api(u.token, 'GET', '/api/ritual/me')).body.ritualName, 'Match day');
});

test('deleting the imported routine clears legacy content (Coach input), and import never resurrects it', { skip: SKIP }, async () => {
  const u = await legacyUser();
  const other = (await api(u.token, 'POST', '/api/routines', routineBody(1))).body.routine;
  const routine = (await api(u.token, 'POST', '/api/routines/import-legacy')).body.routine;

  const del = await api(u.token, 'DELETE', `/api/routines/${routine.id}`);
  assert.deepEqual(del.body, { deleted: true, clearedLegacyRitual: true });

  // Exactly the fields buildSystemPrompt reads for ritual context are cleared.
  const user = await prisma.user.findUnique({ where: { id: u.id }, select: { ritualName: true, ritualSteps: true } });
  assert.deepEqual(user, { ritualName: null, ritualSteps: '[]' });
  assert.deepEqual((await api(u.token, 'GET', '/api/ritual/me')).body, { ritualName: null, steps: [] });

  for (let i = 0; i < 3; i++) {
    const again = await api(u.token, 'POST', '/api/routines/import-legacy');
    assert.equal(again.body.status, 'deleted');
  }
  const list = await api(u.token, 'GET', '/api/routines');
  assert.deepEqual(list.body.routines.map(r => r.id), [other.id], 'unrelated routine preserved');
  assert.equal(list.body.legacy.status, 'deleted');
});

test('a new legacy save after deletion is new content: stored as before and importable, old content stays gone', { skip: SKIP }, async () => {
  const u = await legacyUser();
  const routine = (await api(u.token, 'POST', '/api/routines/import-legacy')).body.routine;
  await api(u.token, 'DELETE', `/api/routines/${routine.id}`);

  await api(u.token, 'POST', '/api/ritual/me', { ritualName: 'Fresh', steps: [{ type: 'custom', label: 'Walk to the line' }] });
  assert.deepEqual((await api(u.token, 'GET', '/api/routines')).body.legacy, { status: 'available', routineId: null });
  const imported = await api(u.token, 'POST', '/api/routines/import-legacy');
  assert.equal(imported.status, 201);
  assert.deepEqual(imported.body.routine.steps.map(s => s.instruction), ['Walk to the line']);
  assert.equal(imported.body.routine.name, 'Fresh');
});

test('existing /api/ritual/me behaviour is unchanged for athletes who never import', { skip: SKIP }, async () => {
  const u = await makeUser();
  assert.deepEqual((await api(u.token, 'GET', '/api/ritual/me')).body, { ritualName: null, steps: [] });
  assert.equal((await api(u.token, 'POST', '/api/ritual/me', { ritualName: '', steps: [] })).status, 400);
  const save = await api(u.token, 'POST', '/api/ritual/me', { ritualName: ' Pre-match ', steps: [{ type: 'breathe', label: ' Slow breath ' }] });
  assert.deepEqual(save, { status: 200, body: { ok: true } });
  assert.deepEqual((await api(u.token, 'GET', '/api/ritual/me')).body, { ritualName: 'Pre-match', steps: [{ type: 'breathe', label: 'Slow breath' }] });
  assert.equal(await prisma.routine.count({ where: { userId: u.id } }), 0);
  assert.ok((await prisma.user.findUnique({ where: { id: u.id } })).lastActiveAt, 'legacy save still records activity');
});

// ── Activity ────────────────────────────────────────────────────────────

test('activity: create/edit count; reads, deletes, failed writes and safety-flagged saves do not', { skip: SKIP }, async () => {
  const u = await makeUser();
  const lastActive = async () => (await prisma.user.findUnique({ where: { id: u.id } })).lastActiveAt;

  await api(u.token, 'POST', '/api/routines', routineBody(1, { category: 'nope' }));
  await api(u.token, 'GET', '/api/routines');
  assert.equal(await lastActive(), null);

  const flagged = await api(u.token, 'POST', '/api/routines', routineBody(1, { purpose: 'I want to kill myself' }));
  assert.equal(flagged.status, 200);
  assert.equal(flagged.body.safetyFlag, 'needs_support');
  assert.ok(flagged.body.guidance);
  assert.equal(await prisma.routine.count({ where: { userId: u.id } }), 0);
  // recordSafetyEvent is fire-and-forget by design (never delays the
  // athlete's safety response), so wait for the structured event to land.
  let events = [];
  for (let i = 0; i < 40 && events.length === 0; i++) {
    events = await prisma.safetyEvent.findMany({ where: { userId: u.id } });
    if (events.length === 0) await new Promise(r => setTimeout(r, 50));
  }
  assert.equal(events.length, 1);
  assert.equal(events[0].surface, 'ritual');
  assert.equal(events[0].sourceType, 'routine_save');
  assert.equal(await lastActive(), null);

  const created = (await api(u.token, 'POST', '/api/routines', routineBody(1))).body.routine;
  const t1 = await lastActive();
  assert.ok(t1);
  await prisma.user.update({ where: { id: u.id }, data: { lastActiveAt: null } });
  await api(u.token, 'DELETE', `/api/routines/${created.id}`);
  assert.equal(await lastActive(), null);
});

// ── Selective and full account deletion ─────────────────────────────────

test('selective deletion "routines" removes every routine and the legacy ritual, and nothing comes back', { skip: SKIP }, async () => {
  const u = await legacyUser();
  const bystander = await legacyUser();
  await api(u.token, 'POST', '/api/routines/import-legacy');
  await api(u.token, 'POST', '/api/routines', routineBody(1));
  await api(bystander.token, 'POST', '/api/routines/import-legacy');
  await prisma.mindJournalEntry.create({ data: { userId: u.id, states: ['calm'] } });

  const res = await api(u.token, 'DELETE', '/api/user/data/routines');
  assert.deepEqual(res, { status: 200, body: { success: true, type: 'routines' } });

  assert.equal(await prisma.routine.count({ where: { userId: u.id } }), 0);
  const user = await prisma.user.findUnique({ where: { id: u.id } });
  assert.equal(user.ritualName, null);
  assert.equal(user.ritualSteps, '[]');
  assert.equal((await api(u.token, 'POST', '/api/routines/import-legacy')).body.status, 'deleted');
  // Unrelated data and other athletes untouched.
  assert.equal(await prisma.mindJournalEntry.count({ where: { userId: u.id } }), 1);
  assert.equal(await prisma.routine.count({ where: { userId: bystander.id } }), 1);
  assert.equal((await prisma.user.findUnique({ where: { id: bystander.id } })).ritualName, 'My Match Ritual');
});

test('full account deletion removes every routine and import record', { skip: SKIP }, async () => {
  const u = await legacyUser();
  await api(u.token, 'POST', '/api/routines/import-legacy');
  const src = (await api(u.token, 'POST', '/api/routines', routineBody(1))).body.routine;
  await api(u.token, 'POST', '/api/routines', routineBody(2, { sourceRoutineId: src.id }));

  const res = await api(u.token, 'DELETE', '/api/auth/account');
  assert.equal(res.status, 200);
  assert.equal(await prisma.routine.count({ where: { userId: u.id } }), 0);
  assert.equal(await prisma.ritualLegacyImport.count({ where: { userId: u.id } }), 0);
  assert.equal(await prisma.user.count({ where: { id: u.id } }), 0);
});

// ── Safety screening on legacy saves and legacy import (follow-up) ───────

const FLAGGED_TEXT = 'I want to kill myself';

async function waitForEvents(userId, expected) {
  // recordSafetyEvent is fire-and-forget by design; wait for the write, then
  // allow a moment more so an unexpected extra event would also land.
  let events = [];
  for (let i = 0; i < 40 && events.length < expected; i++) {
    events = await prisma.safetyEvent.findMany({ where: { userId } });
    if (events.length < expected) await new Promise(r => setTimeout(r, 50));
  }
  await new Promise(r => setTimeout(r, 150));
  return prisma.safetyEvent.findMany({ where: { userId } });
}

async function snapshot(userId) {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { ritualName: true, ritualSteps: true, lastActiveAt: true } });
  const routines = await prisma.routine.findMany({ where: { userId }, orderBy: { createdAt: 'asc' } });
  const link = await prisma.ritualLegacyImport.findUnique({ where: { userId } });
  return { user, routines: routines.map(r => ({ id: r.id, name: r.name, steps: r.steps, updatedAt: r.updatedAt.toISOString() })), link };
}

test('safe legacy saves keep the {ok:true} contract before and after import, with no safety event', { skip: SKIP }, async () => {
  const u = await legacyUser();
  const before = await api(u.token, 'POST', '/api/ritual/me', { ritualName: 'Pre-match', steps: [{ type: 'breathe', label: 'Slow breath' }] });
  assert.deepEqual(before, { status: 200, body: { ok: true } });

  const routine = (await api(u.token, 'POST', '/api/routines/import-legacy')).body.routine;
  const after = await api(u.token, 'POST', '/api/ritual/me', { ritualName: 'Pre-match 2', steps: [{ type: 'cue', label: 'Say: go' }] });
  assert.deepEqual(after, { status: 200, body: { ok: true } });
  const linked = (await api(u.token, 'GET', `/api/routines/${routine.id}`)).body.routine;
  assert.equal(linked.name, 'Pre-match 2');
  assert.deepEqual(linked.steps.map(s => s.instruction), ['Say: go']);
  assert.equal((await waitForEvents(u.id, 0)).length, 0);
});

test('a flagged legacy save before import changes nothing and returns the standard guidance once', { skip: SKIP }, async () => {
  const u = await legacyUser();
  const before = await snapshot(u.id);
  const res = await api(u.token, 'POST', '/api/ritual/me', {
    ritualName: 'Match day',
    steps: [{ type: 'custom', label: 'Fine' }, { type: 'cue', label: FLAGGED_TEXT }, { type: 'cue', label: 'i want to die' }],
  });
  assert.equal(res.status, 422);
  assert.equal(res.body.safetyFlag, 'needs_support');
  assert.match(res.body.guidance, /KIRAN (on )?1800-599-0019/);
  assert.deepEqual(await snapshot(u.id), before);

  const events = await waitForEvents(u.id, 1);
  assert.equal(events.length, 1, 'several flagged fields in one request → one event');
  assert.equal(events[0].surface, 'ritual');
  assert.equal(events[0].sourceType, 'ritual_legacy_save');
});

test('a flagged legacy save after import changes neither the legacy fields nor the linked routine', { skip: SKIP }, async () => {
  const u = await legacyUser();
  await api(u.token, 'POST', '/api/routines/import-legacy');
  const before = await snapshot(u.id);
  assert.equal(before.routines.length, 1);

  const res = await api(u.token, 'POST', '/api/ritual/me', { ritualName: FLAGGED_TEXT, steps: [{ type: 'custom', label: 'Walk to the line' }] });
  assert.equal(res.status, 422);
  assert.deepEqual(await snapshot(u.id), before);
  assert.equal((await waitForEvents(u.id, 1)).length, 1);
});

test('flagged text in an otherwise invalid legacy payload still reaches the safety path, not a 400', { skip: SKIP }, async () => {
  const u = await makeUser();
  const res = await api(u.token, 'POST', '/api/ritual/me', { ritualName: FLAGGED_TEXT, steps: [] });
  assert.equal(res.status, 422);
  assert.equal(res.body.safetyFlag, 'needs_support');
  assert.equal((await waitForEvents(u.id, 1)).length, 1);
});

test('a flagged legacy ritual is not imported: legacy data preserved, no Routine, import not marked done', { skip: SKIP }, async () => {
  const flaggedSteps = [{ type: 'custom', label: 'Tie laces' }, { type: 'cue', label: FLAGGED_TEXT }];
  const u = await makeUser({ ritualName: 'Old ritual', ritualSteps: JSON.stringify(flaggedSteps), language: 'hi' });

  const res = await api(u.token, 'POST', '/api/routines/import-legacy');
  assert.equal(res.status, 200);
  assert.equal(res.body.status, 'needs_support');
  assert.equal(res.body.routine, null);
  assert.equal(res.body.safetyFlag, 'needs_support');
  assert.match(res.body.guidance, /^Jo tum describe/, 'guidance follows the athlete language');
  assert.equal(res.body.screen, undefined, 'screen details are not sent to the client');

  assert.equal(await prisma.routine.count({ where: { userId: u.id } }), 0);
  assert.equal(await prisma.ritualLegacyImport.count({ where: { userId: u.id } }), 0);
  const user = await prisma.user.findUnique({ where: { id: u.id } });
  assert.equal(user.ritualName, 'Old ritual');
  assert.deepEqual(JSON.parse(user.ritualSteps), flaggedSteps);
  assert.deepEqual((await api(u.token, 'GET', '/api/routines')).body.legacy, { status: 'available', routineId: null });

  const events = await waitForEvents(u.id, 1);
  assert.equal(events.length, 1);
  assert.equal(events[0].sourceType, 'ritual_legacy_import');
  assert.equal(user.lastActiveAt, null);

  // Once the athlete saves safe text, the ritual imports normally.
  await api(u.token, 'POST', '/api/ritual/me', { ritualName: 'Old ritual', steps: [{ type: 'custom', label: 'Tie laces' }] });
  assert.equal((await api(u.token, 'POST', '/api/routines/import-legacy')).status, 201);
});
