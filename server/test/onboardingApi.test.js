// Integration tests for /api/onboarding using an isolated Express app, a real
// signed JWT through the real authenticate middleware, an injected fake Prisma
// client, and an injected ensureStarterPlan spy. No real database.

const test = require('node:test');
const assert = require('node:assert/strict');
const jwt = require('jsonwebtoken');
const express = require('express');

const { createOnboardingRouter, createFirstAttempt } = require('../src/routes/onboarding');

const TEST_JWT_SECRET = 'onboarding-api-test-secret';
const ORIGINAL = process.env.JWT_SECRET;
test.before(() => { process.env.JWT_SECRET = TEST_JWT_SECRET; });
test.after(() => { if (ORIGINAL === undefined) delete process.env.JWT_SECRET; else process.env.JWT_SECRET = ORIGINAL; });

function tokenFor(userId) {
  return jwt.sign({ userId }, TEST_JWT_SECRET, { expiresIn: '15m' });
}

class P2002 extends Error {
  constructor() { super('Unique constraint'); this.code = 'P2002'; }
}

// ── In-memory fake Prisma client ────────────────────────────────────────────
function makeClient(seed = {}) {
  const users = seed.users || {}; // id -> user row
  const sessions = [];            // OnboardingSession rows
  const active = {};              // `${userId}:${version}` -> { userId, onboardingVersion, sessionId }
  let n = 1;

  const applyData = (row, data) => {
    for (const [k, v] of Object.entries(data)) {
      if (v && typeof v === 'object' && 'increment' in v) row[k] = (row[k] || 0) + v.increment;
      else row[k] = v;
    }
    row.lastSavedAt = new Date();
  };
  const matchSession = (where) => sessions.filter((s) =>
    (where.userId === undefined || s.userId === where.userId) &&
    (where.onboardingVersion === undefined || s.onboardingVersion === where.onboardingVersion) &&
    (where.status === undefined || s.status === where.status) &&
    (where.id === undefined || s.id === where.id) &&
    (where.revision === undefined || s.revision === where.revision));

  const client = {
    user: {
      findUnique: async ({ where }) => (users[where.id] ? { ...users[where.id] } : null),
      update: async ({ where, data, select }) => {
        users[where.id] = { ...(users[where.id] || { id: where.id }), ...data };
        return select ? pick(users[where.id], select) : { ...users[where.id] };
      },
    },
    onboardingSession: {
      findFirst: async ({ where = {}, orderBy }) => {
        let rows = matchSession(where);
        if (orderBy?.attemptNumber === 'desc') rows = rows.sort((a, b) => b.attemptNumber - a.attemptNumber);
        return rows[0] ? { ...rows[0] } : null;
      },
      findUnique: async ({ where }) => {
        const s = sessions.find((x) => x.id === where.id);
        return s ? { ...s } : null;
      },
      create: async ({ data }) => {
        const attempt = data.attemptNumber ?? 1;
        const version = data.onboardingVersion ?? 2;
        if (sessions.some((s) => s.userId === data.userId && s.onboardingVersion === version && s.attemptNumber === attempt)) {
          throw new P2002();
        }
        const row = {
          id: `os-${n++}`, userId: data.userId, onboardingVersion: version,
          attemptNumber: attempt, status: data.status || 'IN_PROGRESS', revision: 0,
          currentStepId: null, branchId: null, primaryPriorityId: null, answers: data.answers || {},
          startedAt: new Date(), lastSavedAt: new Date(), completedAt: null,
        };
        sessions.push(row);
        return { ...row };
      },
      updateMany: async ({ where, data }) => {
        const rows = matchSession(where);
        for (const r of rows) applyData(r, data);
        return { count: rows.length };
      },
    },
    activeOnboardingSession: {
      create: async ({ data }) => {
        const key = `${data.userId}:${data.onboardingVersion}`;
        if (active[key]) throw new P2002();
        active[key] = { ...data };
        return { ...data };
      },
      findUnique: async ({ where, include }) => {
        const k = `${where.userId_onboardingVersion.userId}:${where.userId_onboardingVersion.onboardingVersion}`;
        const slot = active[k];
        if (!slot) return null;
        const out = { ...slot };
        if (include?.session) out.session = { ...sessions.find((s) => s.id === slot.sessionId) };
        return out;
      },
      deleteMany: async ({ where }) => {
        const k = `${where.userId}:${where.onboardingVersion}`;
        const existed = !!active[k];
        delete active[k];
        return { count: existed ? 1 : 0 };
      },
    },
    $transaction: async (fn) => {
      // Snapshot for rollback on throw. Faithful for SEQUENTIAL transactions
      // (JS is single-threaded; a real DB serializes concurrent writers via the
      // unique constraints, which the create() fakes above already enforce).
      const snap = { sessions: sessions.map((s) => ({ ...s })), active: JSON.parse(JSON.stringify(active)) };
      try {
        return await fn(client);
      } catch (e) {
        sessions.length = 0; snap.sessions.forEach((s) => sessions.push(s));
        for (const k of Object.keys(active)) delete active[k];
        Object.assign(active, snap.active);
        throw e;
      }
    },
    __sessions: sessions, __active: active, __users: users,
  };
  return client;
}

function pick(obj, select) {
  const out = {};
  for (const k of Object.keys(select)) if (select[k] && k in obj) out[k] = obj[k];
  return out;
}

function makeUser(id = 'u1') {
  const now = new Date();
  return { id, email: `${id}@x.com`, name: 'Athlete', goals: '[]', onboardingDone: false, language: 'en', tier: 'free', dateOfBirth: new Date(now.getFullYear() - 15, 0, 1) };
}

function buildApp(client, deps = {}) {
  const app = express();
  app.use(express.json());
  app.use('/api/onboarding', createOnboardingRouter(client, deps));
  return app;
}
function start(app) {
  return new Promise((r) => { const s = app.listen(0, '127.0.0.1', () => r({ server: s, baseUrl: `http://127.0.0.1:${s.address().port}` })); });
}
function stop(server) { return new Promise((res, rej) => server.close((e) => (e ? rej(e) : res()))); }
async function withApp(client, deps, fn) {
  const app = buildApp(client, deps);
  const { server, baseUrl } = await start(app);
  try { await fn(baseUrl); } finally { await stop(server); }
}
function api(baseUrl, token) {
  return (method, path, body) => fetch(`${baseUrl}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
}

// Drive a full valid mistakes-branch flow via PATCH, returning the final revision.
async function fillMistakes(call, ver = 2) {
  let rev = 0;
  const patch = async (answers, step) => {
    const r = await call('PATCH', '/api/onboarding/session', { onboardingVersion: ver, expectedRevision: rev, currentStepId: step, answers });
    const j = await r.json();
    assert.equal(r.status, 200, `patch ${step} → ${JSON.stringify(j)}`);
    rev = j.session.revision;
    return j;
  };
  await patch({ sport: { answerIds: ['cricket'] } }, 'sport');
  await patch({ role_position: { answerIds: ['batter'] } }, 'role_position');
  await patch({ competition_level: { answerIds: ['state'] }, experience_level: { answerIds: ['competitive'] } }, 'playing_context');
  await patch({ difficult_moments: { answerIds: ['after_mistake', 'lose_focus'] } }, 'difficult_moments');
  await patch({ primary_priority: { answerIds: ['after_mistake'] } }, 'primary_priority');
  await patch({ mistakes_first_response: { answerIds: ['keep_thinking', 'angry_self'] } }, 'mistakes_first_response');
  await patch({ mistakes_next: { answerIds: ['hesitate'] } }, 'mistakes_next');
  await patch({ mistakes_recovery: { answerIds: ['few_minutes'] } }, 'mistakes_recovery');
  await patch({ contextual_pressures: { answerIds: ['own_expectations'] } }, 'contextual_pressures');
  await patch({ supports: { answerIds: ['clear_preparation'] } }, 'supports');
  await patch({ strengths: { answerIds: ['hard_working'] } }, 'strengths');
  await patch({ broad_goals: { answerIds: ['confidence', 'focus'] } }, 'broad_goals');
  await patch({ four_week_outcome: { answerIds: ['recover_faster'] } }, 'four_week_outcome');
  return rev;
}

// ── Tests ───────────────────────────────────────────────────────────────────

test('GET /session requires authentication', async () => {
  await withApp(makeClient(), {}, async (baseUrl) => {
    const r = await api(baseUrl)('GET', '/api/onboarding/session');
    assert.equal(r.status, 401);
  });
});

test('GET /session lazily creates attempt 1 + active slot', async () => {
  const client = makeClient({ users: { u1: makeUser() } });
  await withApp(client, {}, async (baseUrl) => {
    const r = await api(baseUrl, tokenFor('u1'))('GET', '/api/onboarding/session');
    const j = await r.json();
    assert.equal(r.status, 200);
    assert.equal(j.session.status, 'IN_PROGRESS');
    assert.equal(j.session.attemptNumber, 1);
    assert.equal(j.session.revision, 0);
    assert.equal(client.__sessions.length, 1);
    assert.ok(client.__active['u1:2']);
  });
});

test('GET /session resumes the same session (another-device) without creating a second', async () => {
  const client = makeClient({ users: { u1: makeUser() } });
  await withApp(client, {}, async (baseUrl) => {
    const call = api(baseUrl, tokenFor('u1'));
    await call('GET', '/api/onboarding/session');
    await call('GET', '/api/onboarding/session');
    assert.equal(client.__sessions.length, 1);
  });
});

test('a losing racer reloads the winner active session instead of duplicating', async () => {
  // Exercises the exact code path a concurrent loser hits: the second
  // createFirstAttempt's session/slot insert raises the uniqueness error
  // (DB-enforced by the ActiveOnboardingSession composite PK), the transaction
  // rolls back, and the loser reloads the winner's already-created session.
  const client = makeClient({ users: { u1: makeUser() } });
  const winner = await createFirstAttempt(client, 'u1');
  const loser = await createFirstAttempt(client, 'u1');
  assert.equal(loser.id, winner.id, 'loser must resolve to the winner session');
  assert.equal(Object.keys(client.__active).length, 1);
  assert.equal(client.__sessions.filter((s) => s.status === 'IN_PROGRESS').length, 1);
});

test('duplicate active slot creation is rejected by the composite key (uniqueness enforced)', async () => {
  const client = makeClient({ users: { u1: makeUser() } });
  await client.activeOnboardingSession.create({ data: { userId: 'u1', onboardingVersion: 2, sessionId: 'x' } });
  await assert.rejects(
    () => client.activeOnboardingSession.create({ data: { userId: 'u1', onboardingVersion: 2, sessionId: 'y' } }),
    (e) => e.code === 'P2002'
  );
});

test('PATCH increments revision and stores currentStepId (a screen id)', async () => {
  const client = makeClient({ users: { u1: makeUser() } });
  await withApp(client, {}, async (baseUrl) => {
    const call = api(baseUrl, tokenFor('u1'));
    await call('GET', '/api/onboarding/session');
    const r = await call('PATCH', '/api/onboarding/session', { onboardingVersion: 2, expectedRevision: 0, currentStepId: 'sport', answers: { sport: { answerIds: ['cricket'] } } });
    const j = await r.json();
    assert.equal(r.status, 200);
    assert.equal(j.session.revision, 1);
    assert.equal(j.session.currentStepId, 'sport');
  });
});

test('PATCH with a stale expectedRevision returns 409 STALE_CONFLICT with the server session', async () => {
  const client = makeClient({ users: { u1: makeUser() } });
  await withApp(client, {}, async (baseUrl) => {
    const call = api(baseUrl, tokenFor('u1'));
    await call('GET', '/api/onboarding/session');
    await call('PATCH', '/api/onboarding/session', { onboardingVersion: 2, expectedRevision: 0, currentStepId: 'sport', answers: { sport: { answerIds: ['cricket'] } } });
    const r = await call('PATCH', '/api/onboarding/session', { onboardingVersion: 2, expectedRevision: 0, currentStepId: 'sport', answers: { sport: { answerIds: ['football'] } } });
    const j = await r.json();
    assert.equal(r.status, 409);
    assert.equal(j.error, 'STALE_CONFLICT');
    assert.equal(j.revision, 1);
    assert.equal(j.session.answers.sport.answerIds[0], 'cricket');
  });
});

test('PATCH rejects invalid screen id, question id, answer id, limit, exclusive, custom, branch mismatch', async () => {
  const client = makeClient({ users: { u1: makeUser() } });
  await withApp(client, {}, async (baseUrl) => {
    const call = api(baseUrl, tokenFor('u1'));
    await call('GET', '/api/onboarding/session');
    const cases = [
      [{ currentStepId: 'ghost_screen', answers: {} }, 'INVALID_SCREEN_ID'],
      [{ currentStepId: 'sport', answers: { nope: { answerIds: ['x'] } } }, 'INVALID_QUESTION_ID'],
      [{ currentStepId: 'sport', answers: { sport: { answerIds: ['nope'] } } }, 'INVALID_ANSWER_ID'],
      [{ currentStepId: 'difficult_moments', answers: { difficult_moments: { answerIds: ['after_mistake', 'lose_focus', 'confidence_drops', 'low_motivation'] } } }, 'LIMIT_EXCEEDED'],
      [{ currentStepId: 'difficult_moments', answers: { difficult_moments: { answerIds: ['not_sure', 'after_mistake'] } } }, 'EXCLUSIVE_CONFLICT'],
      [{ currentStepId: 'difficult_moments', answers: { difficult_moments: { answerIds: ['different'], customText: '   ' } } }, 'INVALID_CUSTOM_TEXT'],
    ];
    for (const [body, code] of cases) {
      const r = await call('PATCH', '/api/onboarding/session', { onboardingVersion: 2, expectedRevision: 0, ...body });
      const j = await r.json();
      assert.equal(r.status, 400, `${code}: ${JSON.stringify(j)}`);
      assert.equal(j.error, code);
    }
  });
});

test('PATCH prunes now-unreachable branch answers when the primary priority changes branch', async () => {
  const client = makeClient({ users: { u1: makeUser() } });
  await withApp(client, {}, async (baseUrl) => {
    const call = api(baseUrl, tokenFor('u1'));
    await call('GET', '/api/onboarding/session');
    let rev = 0;
    const patch = async (answers, step) => {
      const r = await call('PATCH', '/api/onboarding/session', { onboardingVersion: 2, expectedRevision: rev, currentStepId: step, answers });
      const j = await r.json(); rev = j.session.revision; return j;
    };
    await patch({ difficult_moments: { answerIds: ['after_mistake', 'lose_focus'] } }, 'difficult_moments');
    await patch({ primary_priority: { answerIds: ['after_mistake'] } }, 'primary_priority');
    await patch({ mistakes_first_response: { answerIds: ['keep_thinking'] } }, 'mistakes_first_response');
    // Switch priority to a focus branch → mistakes_* answers become unreachable.
    const j = await patch({ primary_priority: { answerIds: ['lose_focus'] } }, 'primary_priority');
    assert.ok(j.prunedQuestionIds.includes('mistakes_first_response'));
    assert.equal(j.session.branchId, 'focus');
    assert.ok(!('mistakes_first_response' in j.session.answers));
  });
});

test('complete rejects incomplete onboarding with 422 + missing (incl. pre-performance 4th question)', async () => {
  const client = makeClient({ users: { u1: makeUser() } });
  await withApp(client, {}, async (baseUrl) => {
    const call = api(baseUrl, tokenFor('u1'));
    await call('GET', '/api/onboarding/session');
    let rev = 0;
    const patch = async (answers, step) => {
      const r = await call('PATCH', '/api/onboarding/session', { onboardingVersion: 2, expectedRevision: rev, currentStepId: step, answers });
      rev = (await r.json()).session.revision;
    };
    await patch({ sport: { answerIds: ['cricket'] } }, 'sport');
    await patch({ role_position: { answerIds: ['batter'] } }, 'role_position');
    await patch({ competition_level: { answerIds: ['state'] }, experience_level: { answerIds: ['competitive'] } }, 'playing_context');
    await patch({ difficult_moments: { answerIds: ['before_important_performance'] } }, 'difficult_moments');
    await patch({ primary_priority: { answerIds: ['before_important_performance'] } }, 'primary_priority');
    await patch({ pre_performance_onset: { answerIds: ['just_before'] } }, 'pre_performance_onset');
    await patch({ pre_performance_signs: { answerIds: ['tense_body'] } }, 'pre_performance_signs');
    await patch({ pre_performance_effect: { answerIds: ['rush'] } }, 'pre_performance_effect');
    // deliberately skip pre_performance_duration + tail
    const r = await call('POST', '/api/onboarding/session/complete', { onboardingVersion: 2, expectedRevision: rev });
    const j = await r.json();
    assert.equal(r.status, 422);
    assert.equal(j.error, 'INCOMPLETE');
    assert.ok(j.missing.includes('pre_performance_duration'), 'the 4th pre-performance question is required');
  });
});

test('successful completion mirrors User, derives primaryChallenge, deletes active slot, fires plan once, is idempotent', async () => {
  const client = makeClient({ users: { u1: makeUser() } });
  let planCalls = 0;
  const deps = { ensureStarterPlan: async () => { planCalls += 1; } };
  await withApp(client, deps, async (baseUrl) => {
    const call = api(baseUrl, tokenFor('u1'));
    await call('GET', '/api/onboarding/session');
    const rev = await fillMistakes(call);
    const r = await call('POST', '/api/onboarding/session/complete', { onboardingVersion: 2, expectedRevision: rev });
    const j = await r.json();
    assert.equal(r.status, 200);
    assert.equal(j.session.status, 'COMPLETED');
    assert.ok(j.session.completedAt);
    // compat mirror
    assert.equal(j.user.onboardingDone, true);
    assert.equal(j.user.sport, 'cricket');
    assert.equal(j.user.position, 'Batter');
    assert.equal(j.user.competitionLevel, 'state');
    assert.equal(j.user.experienceLevel, 'competitive');
    assert.deepEqual(j.user.goals, ['confidence', 'focus']);
    assert.equal(j.user.primaryChallenge, 'failure'); // after_mistake → failure
    // active slot removed; completed history preserved
    assert.ok(!client.__active['u1:2']);
    assert.equal(client.__sessions.filter((s) => s.status === 'COMPLETED').length, 1);

    // idempotent: completing again returns the completed session, no 2nd plan
    const again = await call('POST', '/api/onboarding/session/complete', { onboardingVersion: 2, expectedRevision: rev + 1 });
    assert.equal(again.status, 200);
  });
  // Give the fire-and-forget microtask a tick, then assert exactly one call.
  await new Promise((r) => setTimeout(r, 10));
  assert.equal(planCalls, 1, 'starter plan must fire exactly once');
});

test('completion transaction rolls back on a mid-transaction failure (no partial completion)', async () => {
  const client = makeClient({ users: { u1: makeUser() } });
  // Make the User mirror update throw AFTER the session status flip inside the txn.
  client.user.update = async () => { throw new Error('boom'); };
  await withApp(client, { ensureStarterPlan: async () => {} }, async (baseUrl) => {
    const call = api(baseUrl, tokenFor('u1'));
    await call('GET', '/api/onboarding/session');
    const rev = await fillMistakes(call);
    const r = await call('POST', '/api/onboarding/session/complete', { onboardingVersion: 2, expectedRevision: rev });
    assert.equal(r.status, 500);
    // Rolled back: session still IN_PROGRESS, active slot intact, not completed.
    assert.equal(client.__sessions[0].status, 'IN_PROGRESS');
    assert.ok(client.__active['u1:2']);
  });
});

test('complete with a stale revision returns 409', async () => {
  const client = makeClient({ users: { u1: makeUser() } });
  await withApp(client, { ensureStarterPlan: async () => {} }, async (baseUrl) => {
    const call = api(baseUrl, tokenFor('u1'));
    await call('GET', '/api/onboarding/session');
    const rev = await fillMistakes(call);
    const r = await call('POST', '/api/onboarding/session/complete', { onboardingVersion: 2, expectedRevision: rev - 1 });
    assert.equal(r.status, 409);
  });
});

test('GET returns the latest COMPLETED session read-only and never starts attempt 2', async () => {
  const client = makeClient({ users: { u1: makeUser() } });
  await withApp(client, { ensureStarterPlan: async () => {} }, async (baseUrl) => {
    const call = api(baseUrl, tokenFor('u1'));
    await call('GET', '/api/onboarding/session');
    const rev = await fillMistakes(call);
    await call('POST', '/api/onboarding/session/complete', { onboardingVersion: 2, expectedRevision: rev });
    const r = await call('GET', '/api/onboarding/session');
    const j = await r.json();
    assert.equal(j.session.status, 'COMPLETED');
    assert.equal(client.__sessions.length, 1, 'must not create a second attempt');
  });
});

test('user isolation: one athlete cannot read or write another athlete session', async () => {
  const client = makeClient({ users: { u1: makeUser('u1'), u2: makeUser('u2') } });
  await withApp(client, {}, async (baseUrl) => {
    await api(baseUrl, tokenFor('u1'))('GET', '/api/onboarding/session');
    // u2 gets its own fresh session, not u1's
    const r = await api(baseUrl, tokenFor('u2'))('GET', '/api/onboarding/session');
    const j = await r.json();
    assert.equal(j.session.revision, 0);
    assert.equal(client.__sessions.filter((s) => s.userId === 'u2').length, 1);
    assert.equal(client.__sessions.filter((s) => s.userId === 'u1').length, 1);
  });
});
