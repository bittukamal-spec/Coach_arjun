// POST /api/mind-journal behaviour for the unified reflection (PR 1):
// joined-field safety screening, non-persistence of flagged content, the AI
// review never seeing flagged content, trial gating, and the review's
// failure-safety. Isolated express app + injected fake Prisma client and
// injected review generator — no real database, no Anthropic call.

const test = require('node:test');
const assert = require('node:assert/strict');
const jwt = require('jsonwebtoken');
const express = require('express');

const authenticate = require('../src/middleware/authenticate');
const { createRequireGuardianConsent } = require('../src/middleware/requireGuardianConsent');
const { createMindJournalRouter } = require('../src/routes/mindJournal');

const TEST_JWT_SECRET = 'mind-journal-reflection-api-secret';
const ORIGINAL_JWT_SECRET = process.env.JWT_SECRET;
test.before(() => { process.env.JWT_SECRET = TEST_JWT_SECRET; });
test.after(() => {
  if (ORIGINAL_JWT_SECRET === undefined) delete process.env.JWT_SECRET;
  else process.env.JWT_SECRET = ORIGINAL_JWT_SECRET;
});

const tokenFor = (userId) => jwt.sign({ userId }, TEST_JWT_SECRET, { expiresIn: '15m' });
function adult() {
  const now = new Date();
  return { dateOfBirth: new Date(now.getFullYear() - 25, now.getMonth(), now.getDate()), guardianConsentAt: null };
}

function makeFakeClient({ users = {}, entries = {}, focusCard = null, updateFails = false } = {}) {
  let nextId = 1;
  const safetyEvents = [];
  return {
    user: { findUnique: async ({ where }) => users[where.id] || null },
    mindJournalEntry: {
      create: async ({ data }) => {
        const entry = { id: `mj-${nextId++}`, ...data, createdAt: new Date() };
        entries[entry.id] = entry;
        return entry;
      },
      findMany: async ({ where, take }) => {
        let rows = Object.values(entries).filter((e) => e.userId === where.userId);
        if (where.entryType) rows = rows.filter((e) => e.entryType === where.entryType);
        rows = rows.sort((a, b) => b.createdAt - a.createdAt);
        return take ? rows.slice(0, take) : rows;
      },
      findUnique: async ({ where }) => entries[where.id] || null,
      update: async ({ where, data }) => {
        if (updateFails) throw new Error('write failed');
        entries[where.id] = { ...entries[where.id], ...data };
        return entries[where.id];
      },
      delete: async ({ where }) => { const e = entries[where.id]; delete entries[where.id]; return e; },
    },
    selfTalkCard: { findFirst: async () => (focusCard ? { id: 'card-1', focusWord: focusCard } : null) },
    safetyEvent: { create: async ({ data }) => { safetyEvents.push(data); return data; } },
    __entries: entries,
    __safetyEvents: safetyEvents,
  };
}

// Records every payload the review generator is handed, so a test can assert
// it was never called at all on a flagged submission.
function makeReviewSpy(impl) {
  const calls = [];
  const fn = async (args) => {
    calls.push(args);
    return impl ? impl(args) : { noticed: 'I noticed something.', takeaway: 'Carry this forward.', pattern: null };
  };
  fn.calls = calls;
  return fn;
}

function buildApp(client, { review, trialActive = true } = {}) {
  const app = express();
  app.use(express.json());
  const consentMiddleware = createRequireGuardianConsent(async () => adult());
  app.use('/api/mind-journal', createMindJournalRouter(
    client, consentMiddleware, review || makeReviewSpy(), async () => trialActive,
  ));
  return app;
}

async function withApp(app, fn) {
  const server = await new Promise((r) => {
    const s = app.listen(0, '127.0.0.1', () => r(s));
  });
  try {
    await fn(`http://127.0.0.1:${server.address().port}`);
  } finally {
    await new Promise((res, rej) => server.close((e) => (e ? rej(e) : res())));
  }
}

const post = (baseUrl, userId, body) => fetch(`${baseUrl}/api/mind-journal`, {
  method: 'POST',
  headers: { Authorization: `Bearer ${tokenFor(userId)}`, 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
});

const REFLECTION = {
  entryType: 'REFLECTION',
  contextType: 'TRAINING',
  eventTags: ['full_session'],
  states: ['calm'],
  thoughtTags: ['knew_what_to_do'],
  responseTags: ['stayed_focused'],
};

// A competition reflection, which the resolver gives a Q6.
const COMPETITION_REFLECTION = {
  ...REFLECTION,
  contextType: 'COMPETITION',
  eventTags: ['key_moment'],
  states: ['nervous'],
  thoughtTags: ['worried_about_result'],
  responseTags: ['went_too_fast'],
  bodyTags: ['tense'],
};

// ── Happy path ─────────────────────────────────────────────────────────────

test('a reflection saves with the structured answers and Arjun review attached', async () => {
  const client = makeFakeClient({ users: { u1: { id: 'u1', name: 'Ravi Kumar', sport: 'cricket', language: 'en' } } });
  const review = makeReviewSpy(() => ({ noticed: 'You reported a rush.', takeaway: 'Naming it early helps.', pattern: null }));
  await withApp(buildApp(client, { review }), async (baseUrl) => {
    const res = await post(baseUrl, 'u1', REFLECTION);
    assert.equal(res.status, 200);
    const { entry } = await res.json();
    assert.equal(entry.entryType, 'REFLECTION');
    assert.deepEqual(entry.eventTags, ['full_session']);
    assert.deepEqual(entry.thoughtTags, ['knew_what_to_do']);
    assert.equal(entry.arjunNoticed, 'You reported a rush.');
    assert.equal(entry.arjunTakeaway, 'Naming it early helps.');
    assert.equal(entry.arjunPattern, null);
    assert.ok(entry.reviewGeneratedAt, 'a generated review stamps its timestamp');
    assert.equal(Object.keys(client.__entries).length, 1);
  });
});

test('the review generator only ever receives the athlete this request belongs to', async () => {
  const client = makeFakeClient({ users: { u1: { id: 'u1', name: 'Ravi Kumar', sport: 'cricket', language: 'hi' } } });
  const review = makeReviewSpy();
  await withApp(buildApp(client, { review }), async (baseUrl) => {
    await post(baseUrl, 'u1', REFLECTION);
    assert.equal(review.calls.length, 1);
    assert.equal(review.calls[0].user.language, 'hi');
    assert.equal(review.calls[0].entry.contextType, 'TRAINING');
  });
});

// ── Safety: joined-field screening ─────────────────────────────────────────

test('a crisis phrase in any single custom field blocks the save entirely', async () => {
  for (const field of ['customEvent', 'customThought', 'customResponse', 'customBody', 'customState']) {
    const client = makeFakeClient({ users: { u1: { id: 'u1', language: 'en' } } });
    const review = makeReviewSpy();
    // customBody and the cue question are mutually exclusive; body is fine here.
    // Otherwise complete: validation runs before screening, so an incomplete
    // payload would 400 before the safety layer was ever exercised.
    const body = { ...REFLECTION, [field]: 'I want to kill myself' };
    if (field === 'customState') body.states = [];
    await withApp(buildApp(client, { review }), async (baseUrl) => {
      const res = await post(baseUrl, 'u1', body);
      assert.equal(res.status, 200);
      const json = await res.json();
      assert.equal(json.safetyFlag, 'needs_support', `${field} must flag`);
      assert.equal(Object.keys(client.__entries).length, 0, `${field}: nothing may be persisted`);
      assert.equal(review.calls.length, 0, `${field}: flagged content must never reach the AI review`);
    });
  }
});

test('a phrase split across two custom fields is still caught — the joined-field contract', async () => {
  const client = makeFakeClient({ users: { u1: { id: 'u1', language: 'en' } } });
  const review = makeReviewSpy();
  await withApp(buildApp(client, { review }), async (baseUrl) => {
    // Neither field flags alone; screened together as one text, it does.
    const res = await post(baseUrl, 'u1', {
      ...REFLECTION, customEvent: 'i want to', customThought: 'kill myself',
    });
    const json = await res.json();
    assert.equal(json.safetyFlag, 'needs_support', 'a phrase split across fields must still be caught');
    assert.equal(Object.keys(client.__entries).length, 0);
    assert.equal(review.calls.length, 0);
  });
});

test('a flagged reflection returns the fixed guidance and never echoes the athlete text', async () => {
  const client = makeFakeClient({ users: { u1: { id: 'u1', language: 'en' } } });
  await withApp(buildApp(client), async (baseUrl) => {
    const res = await post(baseUrl, 'u1', { ...REFLECTION, customEvent: 'I want to kill myself' });
    const json = await res.json();
    assert.equal(json.safetyFlag, 'needs_support');
    assert.doesNotMatch(JSON.stringify(json), /kill myself/i, 'the response must never echo the flagged text back');
    assert.match(json.guidance || '', /iCall|KIRAN/, 'the athlete gets the existing helpline guidance');
    assert.ok(!json.entry, 'no entry is returned for a flagged submission');
  });
});

// recordSafetyEvent holds its own Prisma client and is not injectable through
// the router, so its content-free guarantee is asserted at the source level —
// the same technique mindJournalSafety.test.js already uses for this exact
// contract. What matters here is that a reflection takes the SAME shared
// flagged block, rather than a second one that could leak differently.
test('the reflection path reuses the one shared flagged block — no second, leakier branch', () => {
  const { readFileSync } = require('node:fs');
  const path = require('node:path');
  const src = readFileSync(path.join(__dirname, '../src/routes/mindJournal.js'), 'utf8');

  assert.equal((src.match(/recordSafetyEvent\(/g) || []).length, 1,
    'exactly one SafetyEvent write may exist on this route');
  assert.equal((src.match(/safetyFlag: 'needs_support'/g) || []).length, 1,
    'exactly one flagged response shape may exist on this route');

  const joinedScreen = src.indexOf('screen = screenSafetyFields(');
  const flaggedBlock = src.indexOf('if (screen.flagged) {');
  assert.ok(joinedScreen !== -1, 'the reflection must use joined-field screening');
  assert.ok(joinedScreen < flaggedBlock,
    'the joined screen must run before the shared flagged block, so a reflection flows into it');

  const block = src.slice(flaggedBlock, src.indexOf('// ── Persist first'));
  assert.match(block, /recordSafetyEvent\(req\.userId, 'mind_journal', screen\.category/);
  assert.match(block, /getSafetyGuidance\(screen\.category/);
  for (const field of ['customEvent', 'customThought', 'customResponse', 'customBody', 'note']) {
    assert.doesNotMatch(block, new RegExp(`\\b${field}\\b`),
      `the flagged block must never reference ${field}`);
  }
});

// ── Trial gating + review failure safety ───────────────────────────────────

test('an expired trial still saves the reflection, it just gets no AI review', async () => {
  const client = makeFakeClient({ users: { u1: { id: 'u1', language: 'en' } } });
  const review = makeReviewSpy();
  await withApp(buildApp(client, { review, trialActive: false }), async (baseUrl) => {
    const res = await post(baseUrl, 'u1', REFLECTION);
    assert.equal(res.status, 200);
    const { entry } = await res.json();
    assert.equal(Object.keys(client.__entries).length, 1, 'the journal stays usable outside the trial');
    assert.equal(entry.arjunNoticed, null);
    assert.equal(entry.arjunTakeaway, null);
    assert.equal(entry.reviewGeneratedAt, null);
    assert.equal(review.calls.length, 0, 'no Anthropic call is made outside the trial');
  });
});

test('a failed review never costs the athlete their reflection', async () => {
  const client = makeFakeClient({ users: { u1: { id: 'u1', language: 'en' } } });
  const review = makeReviewSpy(() => ({ noticed: null, takeaway: null, pattern: null }));
  await withApp(buildApp(client, { review }), async (baseUrl) => {
    const res = await post(baseUrl, 'u1', REFLECTION);
    assert.equal(res.status, 200);
    const { entry } = await res.json();
    assert.equal(Object.keys(client.__entries).length, 1, 'the reflection is saved regardless');
    assert.deepEqual(entry.eventTags, ['full_session']);
    assert.equal(entry.arjunNoticed, null);
    assert.equal(entry.reviewGeneratedAt, null, 'an empty review must not claim to have been generated');
  });
});

test('prior reflections are passed to the review bounded at ten, newest first', async () => {
  const entries = {};
  for (let i = 0; i < 14; i++) {
    entries[`old-${i}`] = {
      id: `old-${i}`, userId: 'u1', entryType: 'REFLECTION', contextType: 'TRAINING',
      createdAt: new Date(Date.now() - (14 - i) * 86400000),
    };
  }
  // A quick note must never be counted as pattern evidence.
  entries['qn'] = { id: 'qn', userId: 'u1', entryType: 'QUICK_NOTE', states: ['calm'], createdAt: new Date() };
  const client = makeFakeClient({ users: { u1: { id: 'u1', language: 'en' } }, entries });
  const review = makeReviewSpy();
  await withApp(buildApp(client, { review }), async (baseUrl) => {
    await post(baseUrl, 'u1', REFLECTION);
    const prior = review.calls[0].priorEntries;
    assert.equal(prior.length, 10, 'the pattern window is capped at ten');
    assert.ok(prior.every((e) => e.entryType === 'REFLECTION'), 'only reflections count as pattern evidence');
    assert.ok(prior[0].createdAt > prior[1].createdAt, 'newest first');
  });
});

// ── Route wiring ───────────────────────────────────────────────────────────

test('the POST route is wired through the shared AI rate limiter and the trial gate', () => {
  const { readFileSync } = require('node:fs');
  const path = require('node:path');
  const src = readFileSync(path.join(__dirname, '../src/routes/mindJournal.js'), 'utf8');
  assert.match(src, /const \{ aiLimiter \} = require\('\.\.\/middleware\/rateLimits'\)/);
  assert.match(src, /router\.post\('\/', authenticate, aiLimiter, consentMiddleware/,
    'aiLimiter must sit on POST before the handler runs');
  assert.match(src, /isTrialActive/, 'the review must reuse the existing trial gate');
  // The AI call is only ever reachable after the flagged path has returned.
  const flaggedReturn = src.indexOf('return res.json({ safetyFlag:');
  const createCall = src.indexOf('client.mindJournalEntry.create(');
  const reviewCall = src.indexOf('generateReflectionReview({');
  assert.ok(flaggedReturn !== -1 && createCall !== -1 && reviewCall !== -1);
  assert.ok(flaggedReturn < createCall, 'the safety early-return must precede the write');
  assert.ok(createCall < reviewCall,
    'the reflection must be persisted BEFORE the review is generated, so an AI failure cannot lose it');
});

test('a client can never forge the Arjun review fields', async () => {
  const client = makeFakeClient({ users: { u1: { id: 'u1', language: 'en' } } });
  await withApp(buildApp(client), async (baseUrl) => {
    const res = await post(baseUrl, 'u1', { ...REFLECTION, arjunTakeaway: 'I am definitely fine' });
    assert.equal(res.status, 400);
    assert.match((await res.json()).error, /unexpected field/);
    assert.equal(Object.keys(client.__entries).length, 0);
  });
});

// ── Required structured answers cannot be bypassed via the API ─────────────

for (const field of ['eventTags', 'states', 'thoughtTags', 'responseTags']) {
  test(`a direct API call omitting ${field} is rejected and persists nothing`, async () => {
    const client = makeFakeClient({ users: { u1: { id: 'u1', language: 'en' } } });
    const review = makeReviewSpy();
    await withApp(buildApp(client, { review }), async (baseUrl) => {
      const res = await post(baseUrl, 'u1', { ...REFLECTION, [field]: [] });
      assert.equal(res.status, 400, `${field} must be required server-side`);
      assert.match((await res.json()).error, /at least one answer/);
      assert.equal(Object.keys(client.__entries).length, 0);
      assert.equal(review.calls.length, 0, 'an invalid reflection must never reach the AI');
    });
  });
}

test('a direct API call omitting a shown Q6 is rejected', async () => {
  const client = makeFakeClient({ users: { u1: { id: 'u1', language: 'en' } } });
  await withApp(buildApp(client), async (baseUrl) => {
    const { bodyTags, ...withoutQ6 } = COMPETITION_REFLECTION;
    const res = await post(baseUrl, 'u1', withoutQ6);
    assert.equal(res.status, 400);
    assert.match((await res.json()).error, /final question/);
    assert.equal(Object.keys(client.__entries).length, 0);
  });
});

test('an active Focus Card makes the cue question required, read server-side not trusted from the client', async () => {
  const client = makeFakeClient({ users: { u1: { id: 'u1', language: 'en' } }, focusCard: 'Breathe' });
  await withApp(buildApp(client), async (baseUrl) => {
    // TOUGH_MOMENT + calm shows no Q6 without a card, but does with one.
    const toughMoment = { ...REFLECTION, contextType: 'TOUGH_MOMENT', eventTags: ['made_a_mistake'] };
    const rejected = await post(baseUrl, 'u1', toughMoment);
    assert.equal(rejected.status, 400, 'the server reads the card itself — the client cannot opt out');

    const accepted = await post(baseUrl, 'u1', { ...toughMoment, cueFeedback: 'helped', cueWordSnapshot: 'Breathe' });
    assert.equal(accepted.status, 200);
    assert.equal(Object.keys(client.__entries).length, 1);
  });
});

test('a chips-only reflection saves — no athlete is ever required to type', async () => {
  const client = makeFakeClient({ users: { u1: { id: 'u1', language: 'en' } } });
  await withApp(buildApp(client), async (baseUrl) => {
    const res = await post(baseUrl, 'u1', REFLECTION);
    assert.equal(res.status, 200);
    const { entry } = await res.json();
    for (const f of ['customEvent', 'customState', 'customThought', 'customResponse', 'customBody']) {
      assert.equal(entry[f], null, `${f} must stay null`);
    }
  });
});

test('Q3 accepts "Not sure", and the legacy shapes still reject it', async () => {
  const client = makeFakeClient({ users: { u1: { id: 'u1', language: 'en' } } });
  await withApp(buildApp(client), async (baseUrl) => {
    assert.equal((await post(baseUrl, 'u1', { ...REFLECTION, states: ['not_sure'] })).status, 200);
    assert.equal((await post(baseUrl, 'u1', { entryType: 'QUICK_NOTE', states: ['not_sure'] })).status, 400);
  });
});

// ── The reflection outlives any AI failure ────────────────────────────────

test('an Anthropic failure cannot lose a valid reflection — it is already written', async () => {
  const client = makeFakeClient({ users: { u1: { id: 'u1', language: 'en' } } });
  // Throws rather than resolving: the harshest case the generator could hit.
  const review = async () => { throw new Error('anthropic timed out'); };
  review.calls = [];
  await withApp(buildApp(client, { review }), async (baseUrl) => {
    const res = await post(baseUrl, 'u1', REFLECTION).catch(() => null);
    // Even if the request itself errors, the reflection must be on disk.
    assert.equal(Object.keys(client.__entries).length, 1, 'the reflection is persisted before the review runs');
    const stored = Object.values(client.__entries)[0];
    assert.deepEqual(stored.eventTags, ['full_session']);
    assert.equal(stored.arjunNoticed, null);
    assert.equal(stored.reviewGeneratedAt, null);
    if (res) assert.equal(res.status, 200);
  });
});

test('a failed review-attach write leaves the reflection intact and shows no fabricated review', async () => {
  const client = makeFakeClient({ users: { u1: { id: 'u1', language: 'en' } }, updateFails: true });
  const review = makeReviewSpy(() => ({ noticed: 'Something', takeaway: 'Something else', pattern: null }));
  await withApp(buildApp(client, { review }), async (baseUrl) => {
    const res = await post(baseUrl, 'u1', REFLECTION);
    assert.equal(res.status, 200);
    const { entry } = await res.json();
    assert.equal(Object.keys(client.__entries).length, 1);
    // What the athlete is shown must match what is actually stored.
    assert.equal(entry.arjunNoticed, null);
    assert.equal(entry.reviewGeneratedAt, null);
    assert.equal(Object.values(client.__entries)[0].arjunNoticed, null);
  });
});

test('the entry being saved never becomes evidence for its own pattern', async () => {
  const client = makeFakeClient({ users: { u1: { id: 'u1', language: 'en' } } });
  const review = makeReviewSpy();
  await withApp(buildApp(client, { review }), async (baseUrl) => {
    await post(baseUrl, 'u1', REFLECTION);
    assert.equal(review.calls[0].priorEntries.length, 0, 'the first reflection has no priors — not even itself');
    await post(baseUrl, 'u1', REFLECTION);
    assert.equal(review.calls[1].priorEntries.length, 1, 'only the genuinely earlier entry counts');
  });
});

// ── Legacy shapes are unaffected by the new requirements ──────────────────

test('legacy quick notes and guided reflections still save unchanged', async () => {
  const client = makeFakeClient({ users: { u1: { id: 'u1', language: 'en' } } });
  const review = makeReviewSpy();
  await withApp(buildApp(client, { review }), async (baseUrl) => {
    assert.equal((await post(baseUrl, 'u1', { states: ['calm'], note: 'legacy row' })).status, 200);
    assert.equal((await post(baseUrl, 'u1', { entryType: 'QUICK_NOTE', states: ['tired'] })).status, 200);
    assert.equal((await post(baseUrl, 'u1', {
      entryType: 'GUIDED_REFLECTION', contextType: 'TRAINING', states: ['focused'], takeForward: 'keep the routine',
    })).status, 200);
    assert.equal(Object.keys(client.__entries).length, 3);
    assert.equal(review.calls.length, 0, 'no legacy shape triggers an AI review');
  });
});
