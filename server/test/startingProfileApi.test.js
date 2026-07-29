// Integration tests for /api/profile (Starting Performance Profile, PR 3):
// an isolated Express app, a real signed JWT through the real authenticate
// middleware, an injected fake Prisma client and injected AI/safety/consent
// deps. No real database, no Anthropic API.

const test = require('node:test');
const assert = require('node:assert/strict');
const jwt = require('jsonwebtoken');
const express = require('express');

const { createProfileRouter } = require('../src/routes/profile');
const { buildRuleOutput } = require('../src/profile/ruleEngine');

const TEST_JWT_SECRET = 'starting-profile-api-test-secret';
const ORIGINAL = process.env.JWT_SECRET;
test.before(() => { process.env.JWT_SECRET = TEST_JWT_SECRET; });
test.after(() => { if (ORIGINAL === undefined) delete process.env.JWT_SECRET; else process.env.JWT_SECRET = ORIGINAL; });

const tokenFor = (userId) => jwt.sign({ userId }, TEST_JWT_SECRET, { expiresIn: '15m' });

class P2002 extends Error {
  constructor() { super('Unique constraint'); this.code = 'P2002'; }
}

const ANSWERS = {
  sport: { answerIds: ['cricket'] },
  role_position: { answerIds: ['batter'] },
  competition_level: { answerIds: ['state'] },
  experience_level: { answerIds: ['competitive'] },
  difficult_moments: { answerIds: ['after_mistake', 'lose_focus'] },
  primary_priority: { answerIds: ['after_mistake'] },
  mistakes_first_response: { answerIds: ['keep_thinking'] },
  mistakes_next: { answerIds: ['hesitate'] },
  mistakes_recovery: { answerIds: ['most_of_session'] },
  contextual_pressures: { answerIds: ['own_expectations'] },
  supports: { answerIds: ['clear_preparation'] },
  strengths: { answerIds: ['hard_working'] },
  broad_goals: { answerIds: ['confidence'] },
  four_week_outcome: { answerIds: ['recover_faster'] },
};

const yearsAgo = (n) => { const d = new Date(); d.setFullYear(d.getFullYear() - n); return d; };

function makeUser(over = {}) {
  return { id: 'u1', name: 'Rahul Sharma', language: 'en', dateOfBirth: yearsAgo(20), guardianConsentAt: null, guardianEmail: null, ...over };
}

// ── In-memory fake Prisma client ────────────────────────────────────────────
function makeClient({ user = makeUser(), sessionStatus = 'COMPLETED' } = {}) {
  const users = { [user.id]: user };
  const sessions = sessionStatus
    ? [{ id: 'os-1', userId: user.id, onboardingVersion: 2, attemptNumber: 1, status: sessionStatus, branchId: 'mistakes', primaryPriorityId: 'after_mistake', answers: ANSWERS }]
    : [];
  const profiles = [];
  const wordings = [];
  const chatSessions = [];
  const messages = [];
  const focuses = [];
  let n = 1;

  const findProfile = (where) => profiles.find((p) =>
    (where.id === undefined || p.id === where.id) &&
    (where.onboardingSessionId === undefined || p.onboardingSessionId === where.onboardingSessionId));

  const client = {
    user: {
      findUnique: async ({ where, select }) => {
        const u = users[where.id];
        if (!u) return null;
        if (!select) return { ...u };
        const out = {};
        for (const k of Object.keys(select)) if (select[k]) out[k] = u[k];
        return out;
      },
    },
    onboardingSession: {
      findFirst: async ({ where }) => {
        const rows = sessions.filter((s) => s.userId === where.userId && (!where.status || s.status === where.status));
        return rows.sort((a, b) => b.attemptNumber - a.attemptNumber)[0] || null;
      },
    },
    startingPerformanceProfile: {
      findUnique: async ({ where }) => { const p = findProfile(where); return p ? { ...p } : null; },
      findFirst: async ({ where, include }) => {
        const p = profiles.find((x) => x.userId === where.userId && (where.fitResponse?.not === null ? x.fitResponse != null : true));
        if (!p) return null;
        const out = { ...p };
        if (include?.wordingVariants) out.wordingVariants = wordings.filter((w) => w.profileId === p.id).map((w) => ({ ...w }));
        return out;
      },
      create: async ({ data }) => {
        if (profiles.some((p) => p.onboardingSessionId === data.onboardingSessionId)) throw new P2002();
        const row = {
          id: `sp-${n++}`, profileVersion: 1, ruleVersion: 1, fitResponse: null, correctionSelectedId: null,
          correctionText: null, agreedPriorityId: null, firstChatSessionId: null, confirmedAt: null,
          generatedAt: new Date(), updatedAt: new Date(), ...data,
        };
        profiles.push(row);
        return { ...row };
      },
      update: async ({ where, data }) => {
        const p = findProfile(where);
        Object.assign(p, data, { updatedAt: new Date() });
        return { ...p };
      },
      updateMany: async ({ where, data }) => {
        const rows = profiles.filter((p) =>
          (where.id === undefined || p.id === where.id) &&
          (where.firstChatSessionId !== null || p.firstChatSessionId === null));
        rows.forEach((r) => Object.assign(r, data));
        return { count: rows.length };
      },
    },
    startingProfileWording: {
      findUnique: async ({ where }) => {
        const k = where.profileId_language;
        const w = wordings.find((x) => x.profileId === k.profileId && x.language === k.language);
        return w ? { ...w } : null;
      },
      create: async ({ data }) => {
        if (wordings.some((x) => x.profileId === data.profileId && x.language === data.language)) throw new P2002();
        const row = { id: `w-${n++}`, generatedAt: new Date(), updatedAt: new Date(), ...data };
        wordings.push(row);
        return { ...row };
      },
    },
    currentCoachingFocus: {
      findUnique: async ({ where }) => focuses.find((f) => f.userId === where.userId) || null,
      upsert: async ({ where, create, update }) => {
        const existing = focuses.find((f) => f.userId === where.userId);
        if (existing) { Object.assign(existing, update, { updatedAt: new Date() }); return { ...existing }; }
        const row = { id: `cf-${n++}`, customText: null, source: 'ATHLETE_SELECTED', createdAt: new Date(), updatedAt: new Date(), ...create };
        focuses.push(row);
        return { ...row };
      },
    },
    chatSession: {
      create: async ({ data }) => { const row = { id: `cs-${n++}`, createdAt: new Date(), ...data }; chatSessions.push(row); return { ...row }; },
    },
    message: {
      create: async ({ data }) => { const row = { id: `m-${n++}`, createdAt: new Date(), ...data }; messages.push(row); return { ...row }; },
    },
    $transaction: async (fn) => {
      const snap = {
        profiles: profiles.map((p) => ({ ...p })),
        chatSessions: chatSessions.map((c) => ({ ...c })),
        messages: messages.map((m) => ({ ...m })),
      };
      try {
        return await fn(client);
      } catch (e) {
        profiles.length = 0; snap.profiles.forEach((p) => profiles.push(p));
        chatSessions.length = 0; snap.chatSessions.forEach((c) => chatSessions.push(c));
        messages.length = 0; snap.messages.forEach((m) => messages.push(m));
        throw e;
      }
    },
    __profiles: profiles, __wordings: wordings, __chatSessions: chatSessions, __messages: messages, __users: users, __focuses: focuses,
  };
  return client;
}

// Deterministic-by-default deps: no AI, no real safety service, consent open.
function makeDeps(over = {}) {
  return {
    generateWording: async (input) => ({ sections: input.drafts, wordingStatus: 'FALLBACK_USED', deterministicFallbackUsed: true }),
    safety: { screenSafetyText: () => ({ flagged: false }), recordSafetyEvent: () => {}, getSafetyGuidance: () => 'guidance' },
    requireGuardianConsent: (_req, _res, next) => next(),
    ...over,
  };
}

function buildApp(client, deps) {
  const app = express();
  app.use(express.json());
  app.use('/api/profile', createProfileRouter(client, deps));
  return app;
}
const start = (app) => new Promise((r) => { const s = app.listen(0, '127.0.0.1', () => r({ server: s, baseUrl: `http://127.0.0.1:${s.address().port}` })); });
const stop = (server) => new Promise((res, rej) => server.close((e) => (e ? rej(e) : res())));
async function withApp(client, deps, fn) {
  const { server, baseUrl } = await start(buildApp(client, deps));
  try { await fn(baseUrl); } finally { await stop(server); }
}
const api = (baseUrl, token) => (method, path, body) => fetch(`${baseUrl}${path}`, {
  method,
  headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
  body: body ? JSON.stringify(body) : undefined,
});

// ── Auth + preconditions ────────────────────────────────────────────────────

test('every profile route requires authentication', async () => {
  await withApp(makeClient(), makeDeps(), async (baseUrl) => {
    const call = api(baseUrl);
    for (const [m, p] of [['GET', '/api/profile/starting'], ['POST', '/api/profile/confirm'], ['POST', '/api/profile/start-chat']]) {
      assert.equal((await call(m, p, m === 'GET' ? undefined : {})).status, 401, `${m} ${p}`);
    }
  });
});

test('with no completed onboarding there is no profile to show (422, nothing invented)', async () => {
  const client = makeClient({ sessionStatus: 'IN_PROGRESS' });
  await withApp(client, makeDeps(), async (baseUrl) => {
    const r = await api(baseUrl, tokenFor('u1'))('GET', '/api/profile/starting');
    assert.equal(r.status, 422);
    assert.equal((await r.json()).error, 'ONBOARDING_INCOMPLETE');
    assert.equal(client.__profiles.length, 0);
  });
});

// ── GET /starting ───────────────────────────────────────────────────────────

test('GET /starting builds the profile once and returns the four sections plus the suggested priority', async () => {
  const client = makeClient();
  await withApp(client, makeDeps(), async (baseUrl) => {
    const call = api(baseUrl, tokenFor('u1'));
    const r = await call('GET', '/api/profile/starting');
    assert.equal(r.status, 200);
    const j = await r.json();
    for (const k of ['whatMatters', 'possiblePattern', 'whatHelps', 'whereWeBegin']) {
      assert.ok(j.profile.sections[k], `missing section ${k}`);
    }
    assert.equal(j.profile.suggestedPriorityId, 'after_mistake');
    assert.equal(j.profile.fitResponse, null);
    assert.deepEqual(j.profile.priorityOptions, ['after_mistake', 'lose_focus']);

    // Idempotent: a second open reuses the same profile row and the same
    // stored wording — the athlete never sees a different profile on refresh.
    const j2 = await (await call('GET', '/api/profile/starting')).json();
    assert.deepEqual(j2.profile.sections, j.profile.sections);
    assert.equal(client.__profiles.length, 1);
    assert.equal(client.__wordings.length, 1);
  });
});

test('the stored profile keeps its supporting evidence and never mutates the raw onboarding answers', async () => {
  const client = makeClient();
  const before = JSON.stringify(client.__users.u1) + JSON.stringify(ANSWERS);
  await withApp(client, makeDeps(), async (baseUrl) => {
    await api(baseUrl, tokenFor('u1'))('GET', '/api/profile/starting');
  });
  const p = client.__profiles[0];
  assert.equal(p.ruleVersion ?? 1, 1);
  assert.deepEqual(p.supportedObservations, buildRuleOutput({ branchId: 'mistakes', primaryPriorityId: 'after_mistake', answers: ANSWERS }).observations);
  assert.equal(before, JSON.stringify(client.__users.u1) + JSON.stringify(ANSWERS));
});

test('Hindi and English wording are stored separately, both from the same rule output', async () => {
  const client = makeClient({ user: makeUser({ language: 'hi' }) });
  await withApp(client, makeDeps(), async (baseUrl) => {
    const j = await (await api(baseUrl, tokenFor('u1'))('GET', '/api/profile/starting')).json();
    assert.equal(j.profile.language, 'hi');
    assert.match(j.profile.sections.possiblePattern, /[ऀ-ॿ]/);
  });
  assert.equal(client.__wordings.length, 1);
  assert.equal(client.__wordings[0].language, 'hi');
});

test('free text that could reach the AI is safety-screened first; a flagged athlete gets the deterministic profile and no model call', async () => {
  const client = makeClient({ user: makeUser({ name: 'i want to hurt myself' }) });
  let aiCalled = false;
  const deps = makeDeps({
    generateWording: async (input) => { aiCalled = true; return { sections: input.drafts, wordingStatus: 'AI_OK', deterministicFallbackUsed: false }; },
    safety: { screenSafetyText: () => ({ flagged: true, category: 'self_harm', riskLevel: 'high' }), recordSafetyEvent: () => {}, getSafetyGuidance: () => 'guidance' },
  });
  await withApp(client, deps, async (baseUrl) => {
    const j = await (await api(baseUrl, tokenFor('u1'))('GET', '/api/profile/starting')).json();
    assert.equal(aiCalled, false, 'flagged free text must never reach the model');
    assert.equal(j.profile.wordingStatus, 'FALLBACK_USED');
    assert.ok(j.profile.sections.whatMatters);
  });
});

// ── POST /confirm ───────────────────────────────────────────────────────────

async function open(call) { return (await call('GET', '/api/profile/starting')).json(); }

test('"That fits" records the confirmation and adopts the suggested priority as the agreed one', async () => {
  const client = makeClient();
  await withApp(client, makeDeps(), async (baseUrl) => {
    const call = api(baseUrl, tokenFor('u1'));
    await open(call);
    const j = await (await call('POST', '/api/profile/confirm', { fit: 'CONFIRMED' })).json();
    assert.equal(j.profile.fitResponse, 'CONFIRMED');
    assert.equal(j.profile.agreedPriorityId, 'after_mistake');
    assert.ok(j.profile.confirmedAt);
  });
});

test('"Not really" must say what to start with instead — an empty correction is rejected', async () => {
  const client = makeClient();
  await withApp(client, makeDeps(), async (baseUrl) => {
    const call = api(baseUrl, tokenFor('u1'));
    await open(call);
    const r = await call('POST', '/api/profile/confirm', { fit: 'NOT_REALLY' });
    assert.equal(r.status, 400);
    assert.equal((await r.json()).error, 'INVALID_CORRECTION');
    assert.equal(client.__profiles[0].fitResponse, null);
  });
});

test('a correction may only pick one of the athlete\'s OWN difficult moments', async () => {
  const client = makeClient();
  await withApp(client, makeDeps(), async (baseUrl) => {
    const call = api(baseUrl, tokenFor('u1'));
    await open(call);
    const bad = await call('POST', '/api/profile/confirm', { fit: 'NOT_REALLY', agreedPriorityId: 'family_expectations' });
    assert.equal(bad.status, 400);

    const good = await call('POST', '/api/profile/confirm', { fit: 'NOT_REALLY', agreedPriorityId: 'lose_focus' });
    assert.equal(good.status, 200);
    const j = await good.json();
    assert.equal(j.profile.agreedPriorityId, 'lose_focus');
  });
});

test('"Partly" is accepted on its own and may also shift the agreed priority', async () => {
  const client = makeClient();
  await withApp(client, makeDeps(), async (baseUrl) => {
    const call = api(baseUrl, tokenFor('u1'));
    await open(call);
    const j = await (await call('POST', '/api/profile/confirm', { fit: 'PARTLY', agreedPriorityId: 'lose_focus' })).json();
    assert.equal(j.profile.fitResponse, 'PARTLY');
    assert.equal(j.profile.agreedPriorityId, 'lose_focus');
  });
});

test('an unknown fit value is rejected', async () => {
  const client = makeClient();
  await withApp(client, makeDeps(), async (baseUrl) => {
    const call = api(baseUrl, tokenFor('u1'));
    await open(call);
    const r = await call('POST', '/api/profile/confirm', { fit: 'MAYBE' });
    assert.equal(r.status, 400);
    assert.equal((await r.json()).error, 'INVALID_FIT');
  });
});

test('correction free text is safety-screened: flagged text is dropped, an event is recorded, and support guidance comes back', async () => {
  const client = makeClient();
  const events = [];
  const deps = makeDeps({
    safety: {
      screenSafetyText: (t) => (t.includes('hurt myself') ? { flagged: true, category: 'self_harm', riskLevel: 'high' } : { flagged: false }),
      recordSafetyEvent: (...args) => events.push(args),
      getSafetyGuidance: () => 'If you are struggling, talk to someone you trust.',
    },
  });
  await withApp(client, deps, async (baseUrl) => {
    const call = api(baseUrl, tokenFor('u1'));
    await open(call);
    const r = await call('POST', '/api/profile/confirm', { fit: 'NOT_REALLY', agreedPriorityId: 'lose_focus', correctionText: 'i want to hurt myself' });
    assert.equal(r.status, 200);
    const j = await r.json();
    assert.equal(j.profile.correctionText, null, 'flagged text is never stored');
    assert.equal(j.safetyFlag, 'needs_support');
    assert.ok(j.guidance);
    assert.equal(events.length, 1);
    assert.equal(events[0][1], 'profile_correction');
  });
});

test('safe correction text is sanitised and stored', async () => {
  const client = makeClient();
  await withApp(client, makeDeps(), async (baseUrl) => {
    const call = api(baseUrl, tokenFor('u1'));
    await open(call);
    const j = await (await call('POST', '/api/profile/confirm', { fit: 'NOT_REALLY', correctionText: '  selection stress mostly  ' })).json();
    assert.equal(j.profile.correctionText, 'selection stress mostly');
  });
});

// ── POST /start-chat ────────────────────────────────────────────────────────

test('the first conversation cannot start before the athlete has answered "does this fit?"', async () => {
  const client = makeClient();
  await withApp(client, makeDeps(), async (baseUrl) => {
    const call = api(baseUrl, tokenFor('u1'));
    await open(call);
    const r = await call('POST', '/api/profile/start-chat');
    assert.equal(r.status, 400);
    assert.equal((await r.json()).error, 'NOT_CONFIRMED');
    assert.equal(client.__chatSessions.length, 0);
    assert.equal(client.__messages.length, 0);
  });
});

test('start-chat is guardian-consent gated — viewing and confirming are not', async () => {
  const client = makeClient({ user: makeUser({ dateOfBirth: yearsAgo(15) }) });
  const deps = makeDeps({
    requireGuardianConsent: (_req, res) => res.status(403).json({ error: 'CONSENT_REQUIRED' }),
  });
  await withApp(client, deps, async (baseUrl) => {
    const call = api(baseUrl, tokenFor('u1'));
    assert.equal((await call('GET', '/api/profile/starting')).status, 200, 'a pending minor may still read the profile');
    assert.equal((await call('POST', '/api/profile/confirm', { fit: 'CONFIRMED' })).status, 200, 'a pending minor may still confirm it');
    const r = await call('POST', '/api/profile/start-chat');
    assert.equal(r.status, 403);
    assert.equal(client.__chatSessions.length, 0, 'no conversation may exist without consent');
    assert.equal(client.__messages.length, 0);
  });
});

test('a pending minor is told consent is outstanding, with the guardian email masked', async () => {
  const client = makeClient({ user: makeUser({ dateOfBirth: yearsAgo(15), guardianEmail: 'parent@example.com' }) });
  await withApp(client, makeDeps(), async (baseUrl) => {
    const j = await open(api(baseUrl, tokenFor('u1')));
    assert.equal(j.consent.pending, true);
    assert.match(j.consent.guardianEmailMasked, /^p•+@example\.com$/);
    assert.ok(!j.consent.guardianEmailMasked.includes('parent'), 'the full address is never returned');
  });
});

test('start-chat creates exactly one session and one deterministic opening message — and only ever one', async () => {
  const client = makeClient();
  await withApp(client, makeDeps(), async (baseUrl) => {
    const call = api(baseUrl, tokenFor('u1'));
    await open(call);
    await call('POST', '/api/profile/confirm', { fit: 'CONFIRMED' });

    const first = await (await call('POST', '/api/profile/start-chat')).json();
    assert.ok(first.chatSessionId);
    assert.equal(client.__chatSessions.length, 1);
    assert.equal(client.__messages.length, 1);

    const msg = client.__messages[0];
    assert.equal(msg.role, 'assistant');
    assert.equal(msg.chatSessionId, first.chatSessionId);
    assert.match(msg.content, /Rahul/);
    // Coach is free-text now: the opening message ends on an open question
    // with no reply-chip marker of any kind.
    assert.doesNotMatch(msg.content, /\[SUGGEST:/);
    assert.match(msg.content, /what happened\?$/i);

    // Tapping again (double tap, refresh, second device) reuses it.
    const second = await (await call('POST', '/api/profile/start-chat')).json();
    assert.equal(second.chatSessionId, first.chatSessionId);
    assert.equal(client.__chatSessions.length, 1);
    assert.equal(client.__messages.length, 1);
  });
});

test('two simultaneous start-chat calls still leave exactly one conversation, with no orphan session or message', async () => {
  const client = makeClient();
  await withApp(client, makeDeps(), async (baseUrl) => {
    const call = api(baseUrl, tokenFor('u1'));
    await open(call);
    await call('POST', '/api/profile/confirm', { fit: 'CONFIRMED' });

    const [a, b] = await Promise.all([call('POST', '/api/profile/start-chat'), call('POST', '/api/profile/start-chat')]);
    const ja = await a.json();
    const jb = await b.json();
    assert.equal(ja.chatSessionId, jb.chatSessionId);
    assert.equal(client.__chatSessions.length, 1);
    assert.equal(client.__messages.length, 1);
  });
});

test('start-chat does not create a coaching cycle — the normal coaching loop still owns that', async () => {
  const client = makeClient();
  // Any access to a coaching-cycle model would throw on this fake client.
  await withApp(client, makeDeps(), async (baseUrl) => {
    const call = api(baseUrl, tokenFor('u1'));
    await open(call);
    await call('POST', '/api/profile/confirm', { fit: 'CONFIRMED' });
    const r = await call('POST', '/api/profile/start-chat');
    assert.equal(r.status, 200);
  });
  assert.equal(client.__chatSessions[0].mode, 'main');
  assert.equal(client.__chatSessions[0].sessionType, 'general');
});

test('the opening message follows the athlete\'s correction, not the original suggestion', async () => {
  const client = makeClient();
  await withApp(client, makeDeps(), async (baseUrl) => {
    const call = api(baseUrl, tokenFor('u1'));
    await open(call);
    await call('POST', '/api/profile/confirm', { fit: 'NOT_REALLY', agreedPriorityId: 'lose_focus' });
    await call('POST', '/api/profile/start-chat');
    // Conversational phrase, not the raw onboarding label.
    assert.match(client.__messages[0].content, /what pulls your focus away/);
    assert.doesNotMatch(client.__messages[0].content, /When I lose focus/);
  });
});
