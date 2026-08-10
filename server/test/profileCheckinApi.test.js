// Integration tests for PATCH /api/profile/answers (Performance Check-in
// save). Same isolated-Express-app + fake-Prisma + injected-deps pattern as
// startingProfileApi.test.js. No real database, no Anthropic API — this
// endpoint never calls the AI wording layer at all.

const test = require('node:test');
const assert = require('node:assert/strict');
const jwt = require('jsonwebtoken');
const express = require('express');

const { createProfileRouter } = require('../src/routes/profile');
const { buildRuleOutput } = require('../src/profile/ruleEngine');

const TEST_JWT_SECRET = 'profile-checkin-api-test-secret';
const ORIGINAL = process.env.JWT_SECRET;
test.before(() => { process.env.JWT_SECRET = TEST_JWT_SECRET; });
test.after(() => { if (ORIGINAL === undefined) delete process.env.JWT_SECRET; else process.env.JWT_SECRET = ORIGINAL; });

const tokenFor = (userId) => jwt.sign({ userId }, TEST_JWT_SECRET, { expiresIn: '15m' });

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

function makeClient({ user = makeUser(), answers = ANSWERS } = {}) {
  const users = { [user.id]: user };
  const sessions = [{ id: 'os-1', userId: user.id, onboardingVersion: 2, attemptNumber: 1, status: 'COMPLETED', branchId: 'mistakes', primaryPriorityId: 'after_mistake', answers, revision: 3, completedAt: new Date() }];
  const profiles = [];
  const wordings = [];
  const focuses = [];
  let n = 1;

  const findProfile = (where) => profiles.find((p) =>
    (where.id === undefined || p.id === where.id) &&
    (where.onboardingSessionId === undefined || p.onboardingSessionId === where.onboardingSessionId));

  return {
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
      update: async ({ where, data }) => {
        const s = sessions.find((x) => x.id === where.id);
        Object.assign(s, data);
        return { ...s };
      },
    },
    startingPerformanceProfile: {
      findUnique: async ({ where }) => { const p = findProfile(where); return p ? { ...p } : null; },
      create: async ({ data }) => {
        const row = {
          id: `sp-${n++}`, profileVersion: 1, ruleVersion: 1, fitResponse: 'CONFIRMED', correctionSelectedId: null,
          correctionText: null, agreedPriorityId: 'after_mistake', firstChatSessionId: null, confirmedAt: new Date(),
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
    },
    startingProfileWording: {
      findUnique: async ({ where }) => {
        const k = where.profileId_language;
        const w = wordings.find((x) => x.profileId === k.profileId && x.language === k.language);
        return w ? { ...w } : null;
      },
      create: async ({ data }) => {
        const row = { id: `w-${n++}`, generatedAt: new Date(), updatedAt: new Date(), ...data };
        wordings.push(row);
        return { ...row };
      },
    },
    currentCoachingFocus: {
      findUnique: async ({ where }) => focuses.find((f) => f.userId === where.userId) || null,
    },
    __profiles: profiles, __wordings: wordings, __users: users, __sessions: sessions,
  };
}

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

test('PATCH /answers requires authentication', async () => {
  await withApp(makeClient(), makeDeps(), async (baseUrl) => {
    const r = await api(baseUrl)('PATCH', '/api/profile/answers', { answers: {} });
    assert.equal(r.status, 401);
  });
});

test('updates a whitelisted question (strengths) and the derived display recomputes, without touching fit/confirmation/onboarding status', async () => {
  const client = makeClient();
  await withApp(client, makeDeps(), async (baseUrl) => {
    const call = api(baseUrl, tokenFor('u1'));
    const before = await (await call('GET', '/api/profile/starting')).json();
    assert.deepEqual(before.profile.displayProfile.strengths.map((s) => s.id), ['hard_working']);

    const r = await call('PATCH', '/api/profile/answers', {
      answers: { strengths: { answerIds: ['brave', 'disciplined'] } },
    });
    assert.equal(r.status, 200);
    const j = await r.json();
    assert.deepEqual(j.profile.displayProfile.strengths.map((s) => s.id), ['brave', 'disciplined']);

    // Untouched by this endpoint.
    assert.equal(j.profile.fitResponse, 'CONFIRMED');
    assert.equal(j.profile.agreedPriorityId, 'after_mistake');
    assert.ok(j.profile.confirmedAt);
    assert.equal(client.__sessions[0].status, 'COMPLETED');
    assert.equal(client.__sessions[0].completedAt != null, true);

    // The raw stored answer actually changed (single source of truth).
    assert.deepEqual(client.__sessions[0].answers.strengths.answerIds, ['brave', 'disciplined']);
    // Unrelated answers untouched.
    assert.deepEqual(client.__sessions[0].answers.sport, ANSWERS.sport);
    assert.deepEqual(client.__sessions[0].answers.mistakes_first_response, ANSWERS.mistakes_first_response);
  });
});

test('updates a pattern (branch-specific) question that belongs to the athlete\'s own resolved branch', async () => {
  const client = makeClient();
  await withApp(client, makeDeps(), async (baseUrl) => {
    const call = api(baseUrl, tokenFor('u1'));
    await call('GET', '/api/profile/starting');
    const r = await call('PATCH', '/api/profile/answers', {
      answers: { mistakes_first_response: { answerIds: ['angry_self'] } },
    });
    assert.equal(r.status, 200);
    const j = await r.json();
    const ruleOutput = buildRuleOutput({ branchId: 'mistakes', answers: { ...ANSWERS, mistakes_first_response: { answerIds: ['angry_self'] } } });
    assert.deepEqual(client.__profiles[0].ruleOutput, ruleOutput);
    assert.ok(j.profile.displayProfile.startingPattern.nodes.length > 0);
  });
});

test('rejects a question outside the whitelist (sport is Settings-owned, never editable here)', async () => {
  const client = makeClient();
  await withApp(client, makeDeps(), async (baseUrl) => {
    const call = api(baseUrl, tokenFor('u1'));
    await call('GET', '/api/profile/starting');
    const r = await call('PATCH', '/api/profile/answers', { answers: { sport: { answerIds: ['football'] } } });
    assert.equal(r.status, 400);
    assert.equal((await r.json()).error, 'INVALID_QUESTION');
    assert.deepEqual(client.__sessions[0].answers.sport, ANSWERS.sport);
  });
});

test('rejects a question outside the whitelist (difficult_moments — changing it would reshape the branch)', async () => {
  const client = makeClient();
  await withApp(client, makeDeps(), async (baseUrl) => {
    const call = api(baseUrl, tokenFor('u1'));
    await call('GET', '/api/profile/starting');
    const r = await call('PATCH', '/api/profile/answers', { answers: { difficult_moments: { answerIds: ['not_sure'] } } });
    assert.equal(r.status, 400);
    assert.equal((await r.json()).error, 'INVALID_QUESTION');
  });
});

test('rejects a branch-specific question that belongs to a DIFFERENT branch than the athlete is on', async () => {
  const client = makeClient();
  await withApp(client, makeDeps(), async (baseUrl) => {
    const call = api(baseUrl, tokenFor('u1'));
    await call('GET', '/api/profile/starting');
    // pre_performance_onset belongs to the 'pre_performance' branch; this
    // athlete is on 'mistakes'.
    const r = await call('PATCH', '/api/profile/answers', { answers: { pre_performance_onset: { answerIds: ['before_event'] } } });
    assert.equal(r.status, 400);
    assert.equal((await r.json()).error, 'INVALID_QUESTION');
  });
});

test('rejects an invalid answer id for an otherwise-editable question, reusing the real onboarding validator', async () => {
  const client = makeClient();
  await withApp(client, makeDeps(), async (baseUrl) => {
    const call = api(baseUrl, tokenFor('u1'));
    await call('GET', '/api/profile/starting');
    const r = await call('PATCH', '/api/profile/answers', { answers: { strengths: { answerIds: ['not_a_real_id'] } } });
    assert.equal(r.status, 400);
    assert.equal((await r.json()).error, 'INVALID_ANSWER_ID');
  });
});

test('rejects exceeding a question\'s own selection limit', async () => {
  const client = makeClient();
  await withApp(client, makeDeps(), async (baseUrl) => {
    const call = api(baseUrl, tokenFor('u1'));
    await call('GET', '/api/profile/starting');
    // strengths.limit === 3
    const r = await call('PATCH', '/api/profile/answers', {
      answers: { strengths: { answerIds: ['hard_working', 'brave', 'disciplined', 'competitive'] } },
    });
    assert.equal(r.status, 400);
    assert.equal((await r.json()).error, 'LIMIT_EXCEEDED');
  });
});

test('with no completed onboarding there is nothing to update (422)', async () => {
  const client = makeClient();
  client.__sessions[0].status = 'IN_PROGRESS';
  await withApp(client, makeDeps(), async (baseUrl) => {
    const r = await api(baseUrl, tokenFor('u1'))('PATCH', '/api/profile/answers', { answers: { strengths: { answerIds: ['brave'] } } });
    assert.equal(r.status, 422);
    assert.equal((await r.json()).error, 'ONBOARDING_INCOMPLETE');
  });
});

test('GET /starting exposes checkin.answers (editable-only) and checkin.screens (grouped, branch-scoped)', async () => {
  const client = makeClient();
  await withApp(client, makeDeps(), async (baseUrl) => {
    const j = await (await api(baseUrl, tokenFor('u1'))('GET', '/api/profile/starting')).json();
    const { checkin } = j.profile;
    assert.deepEqual(checkin.answers.strengths.answerIds, ['hard_working']);
    assert.deepEqual(checkin.answers.mistakes_first_response.answerIds, ['keep_thinking']);
    // Never any non-editable answer (sport, difficult_moments, ...).
    assert.equal(checkin.answers.sport, undefined);
    assert.equal(checkin.answers.difficult_moments, undefined);
    assert.deepEqual(checkin.screens.goals, ['broad_goals', 'four_week_outcome']);
    assert.deepEqual(checkin.screens.helps, ['supports']);
    assert.deepEqual(checkin.screens.strengths, ['strengths']);
    assert.deepEqual(checkin.screens.pattern, ['mistakes_first_response', 'mistakes_next', 'mistakes_recovery']);
  });
});

test('custom text on an editable question gets the same input-hygiene sanitisation onboarding itself applies (markup/control chars stripped)', async () => {
  // NOTE: this endpoint intentionally matches onboarding's OWN PATCH
  // /session posture for this exact class of field — `sanitizeCustomText`
  // is input hygiene only (XSS/length), not crisis/safety screening; the
  // existing onboarding save path does not safety-screen these fields
  // either (only profile-correction text and current-focus text do, which
  // this endpoint does not touch). Adding a new bespoke safety-screening
  // path here that the analogous onboarding endpoint doesn't have would be
  // inventing new safety logic outside this PR's scope.
  const client = makeClient();
  await withApp(client, makeDeps(), async (baseUrl) => {
    const call = api(baseUrl, tokenFor('u1'));
    await call('GET', '/api/profile/starting');
    const r = await call('PATCH', '/api/profile/answers', {
      answers: { four_week_outcome: { answerIds: ['own_goal'], customText: '<b>a</b>  clear   goal  ' } },
    });
    assert.equal(r.status, 200);
    const stored = client.__sessions[0].answers.four_week_outcome.customText;
    // Tags stripped, multi-space collapsed, trimmed — same sanitizer onboarding uses.
    assert.equal(stored, 'a clear goal');
  });
});

// ── When Pressure Hits — the Situation question is editable ────────────────
// The returning "Update" flow asks Situation first, so an athlete whose
// hardest moment has changed can say so without redoing anything else.

test('checkin.screens.pressure asks the Situation first, then the athlete\'s own branch follow-ups', async () => {
  const client = makeClient();
  await withApp(client, makeDeps(), async (baseUrl) => {
    const j = await (await api(baseUrl, tokenFor('u1'))('GET', '/api/profile/starting')).json();
    assert.deepEqual(j.profile.checkin.screens.pressure, [
      'primary_priority', 'mistakes_first_response', 'mistakes_next', 'mistakes_recovery',
    ]);
    // The athlete's stored situation is sent so the flow can pre-select it.
    assert.deepEqual(j.profile.checkin.answers.primary_priority.answerIds, ['after_mistake']);
  });
});

test('changing the situation in one save moves the branch, and keeps every earlier answer stored', async () => {
  const client = makeClient();
  await withApp(client, makeDeps(), async (baseUrl) => {
    const call = api(baseUrl, tokenFor('u1'));
    await call('GET', '/api/profile/starting');
    const r = await call('PATCH', '/api/profile/answers', {
      answers: {
        primary_priority: { answerIds: ['lose_focus'] },
        focus_when: { answerIds: ['own_thoughts'] },
        focus_effect: { answerIds: ['wrong_decisions'] },
        focus_recovery: { answerIds: ['few_minutes'] },
      },
    });
    assert.equal(r.status, 200);
    const j = await r.json();

    // The stored branch follows the athlete's new situation…
    assert.equal(client.__sessions[0].branchId, 'focus');
    assert.equal(client.__sessions[0].primaryPriorityId, 'lose_focus');
    assert.equal(j.profile.displayProfile.pressure.branchId, 'focus');
    assert.deepEqual(
      j.profile.displayProfile.pressure.stages.map((s) => [s.stage, s.answerIds[0]]),
      [['situation', 'lose_focus'], ['firstResponse', 'own_thoughts'], ['impact', 'wrong_decisions'], ['reset', 'few_minutes']],
    );
    // …and NOTHING the athlete previously told us is deleted. The old
    // branch's answers are still on the session, simply not part of the
    // profile any more.
    assert.deepEqual(client.__sessions[0].answers.mistakes_first_response, ANSWERS.mistakes_first_response);
    assert.deepEqual(client.__sessions[0].answers.mistakes_recovery, ANSWERS.mistakes_recovery);
    // Unrelated sections are untouched.
    assert.deepEqual(client.__sessions[0].answers.supports, ANSWERS.supports);
    assert.deepEqual(client.__sessions[0].answers.strengths, ANSWERS.strengths);
    assert.deepEqual(client.__sessions[0].answers.broad_goals, ANSWERS.broad_goals);
    // The one-time confirmation contract is untouched by an answer edit.
    assert.equal(j.profile.fitResponse, 'CONFIRMED');
    assert.ok(j.profile.confirmedAt);
    assert.equal(client.__sessions[0].status, 'COMPLETED');
  });
});

test('a new branch\'s follow-up is still rejected unless the situation moves with it', async () => {
  const client = makeClient();
  await withApp(client, makeDeps(), async (baseUrl) => {
    const call = api(baseUrl, tokenFor('u1'));
    await call('GET', '/api/profile/starting');
    const r = await call('PATCH', '/api/profile/answers', { answers: { focus_when: { answerIds: ['own_thoughts'] } } });
    assert.equal(r.status, 400);
    assert.equal((await r.json()).error, 'INVALID_QUESTION');
    assert.equal(client.__sessions[0].branchId, 'mistakes');
  });
});

test('a goals-only save moves goal fields and nothing else', async () => {
  const client = makeClient();
  await withApp(client, makeDeps(), async (baseUrl) => {
    const call = api(baseUrl, tokenFor('u1'));
    await call('GET', '/api/profile/starting');
    const r = await call('PATCH', '/api/profile/answers', {
      answers: {
        broad_goals: { answerIds: ['focus', 'pressure'] },
        four_week_outcome: { answerIds: ['stay_focused'] },
      },
    });
    assert.equal(r.status, 200);
    const stored = client.__sessions[0].answers;
    assert.deepEqual(stored.broad_goals.answerIds, ['focus', 'pressure']);
    assert.deepEqual(stored.four_week_outcome.answerIds, ['stay_focused']);
    for (const qid of ['supports', 'strengths', 'primary_priority', 'mistakes_first_response', 'mistakes_next', 'mistakes_recovery', 'sport']) {
      assert.deepEqual(stored[qid], ANSWERS[qid], `${qid} must not move`);
    }
  });
});

// ── Existing-user compatibility ────────────────────────────────────────────

test('a historical profile with no goals/strengths still loads, and reports what is not set yet', async () => {
  const answers = { ...ANSWERS };
  delete answers.broad_goals;
  delete answers.strengths;
  const client = makeClient({ answers });
  await withApp(client, makeDeps(), async (baseUrl) => {
    const r = await api(baseUrl, tokenFor('u1'))('GET', '/api/profile/starting');
    assert.equal(r.status, 200);
    const dp = (await r.json()).profile.displayProfile;
    assert.equal(dp.selections.broadGoals.status, 'unset');
    assert.equal(dp.selections.strengths.status, 'unset');
    // Nothing was invented, and nothing was written back to the session.
    assert.equal(client.__sessions[0].answers.broad_goals, undefined);
    assert.equal(client.__sessions[0].status, 'COMPLETED');
  });
});

test('a historical multi-answer on a now-single question is reported ambiguous, never resolved for the athlete', async () => {
  const client = makeClient({
    answers: { ...ANSWERS, mistakes_first_response: { answerIds: ['keep_thinking', 'angry_self'] } },
  });
  await withApp(client, makeDeps(), async (baseUrl) => {
    const j = await (await api(baseUrl, tokenFor('u1'))('GET', '/api/profile/starting')).json();
    const stage = j.profile.displayProfile.pressure.stages.find((s) => s.stage === 'firstResponse');
    assert.equal(stage.status, 'ambiguous');
    assert.deepEqual(stage.answerIds, ['keep_thinking', 'angry_self']);
    // Both ids survive on the session — nothing is silently dropped.
    assert.deepEqual(client.__sessions[0].answers.mistakes_first_response.answerIds, ['keep_thinking', 'angry_self']);
  });
});
