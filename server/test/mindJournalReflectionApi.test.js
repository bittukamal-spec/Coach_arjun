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

function buildApp(client, { review, trialActive = true, reviewTimeoutMs = 25000 } = {}) {
  const app = express();
  app.use(express.json());
  const consentMiddleware = createRequireGuardianConsent(async () => adult());
  app.use('/api/mind-journal', createMindJournalRouter(
    client, consentMiddleware, review || makeReviewSpy(), async () => trialActive, reviewTimeoutMs,
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
  const client = makeFakeClient({ users: { u2: { id: 'u2', name: 'Ravi Kumar', sport: 'cricket', language: 'hi' } } });
  const review = makeReviewSpy();
  await withApp(buildApp(client, { review }), async (baseUrl) => {
    await post(baseUrl, 'u2', REFLECTION);
    assert.equal(review.calls.length, 1);
    assert.equal(review.calls[0].user.language, 'hi');
    assert.equal(review.calls[0].entry.contextType, 'TRAINING');
  });
});

// ── Safety: joined-field screening ─────────────────────────────────────────

test('a crisis phrase in any single custom field blocks the save entirely', async () => {
  for (const field of ['customEvent', 'customThought', 'customResponse', 'customBody', 'customState']) {
    const client = makeFakeClient({ users: { u3: { id: 'u3', language: 'en' } } });
    const review = makeReviewSpy();
    // customBody and the cue question are mutually exclusive; body is fine here.
    // Otherwise complete: validation runs before screening, so an incomplete
    // payload would 400 before the safety layer was ever exercised.
    const body = { ...REFLECTION, [field]: 'I want to kill myself' };
    if (field === 'customState') body.states = [];
    await withApp(buildApp(client, { review }), async (baseUrl) => {
      const res = await post(baseUrl, 'u3', body);
      assert.equal(res.status, 200);
      const json = await res.json();
      assert.equal(json.safetyFlag, 'needs_support', `${field} must flag`);
      assert.equal(Object.keys(client.__entries).length, 0, `${field}: nothing may be persisted`);
      assert.equal(review.calls.length, 0, `${field}: flagged content must never reach the AI review`);
    });
  }
});

test('a phrase split across two custom fields is still caught — the joined-field contract', async () => {
  const client = makeFakeClient({ users: { u4: { id: 'u4', language: 'en' } } });
  const review = makeReviewSpy();
  await withApp(buildApp(client, { review }), async (baseUrl) => {
    // Neither field flags alone; screened together as one text, it does.
    const res = await post(baseUrl, 'u4', {
      ...REFLECTION, customEvent: 'i want to', customThought: 'kill myself',
    });
    const json = await res.json();
    assert.equal(json.safetyFlag, 'needs_support', 'a phrase split across fields must still be caught');
    assert.equal(Object.keys(client.__entries).length, 0);
    assert.equal(review.calls.length, 0);
  });
});

test('a flagged reflection returns the fixed guidance and never echoes the athlete text', async () => {
  const client = makeFakeClient({ users: { u5: { id: 'u5', language: 'en' } } });
  await withApp(buildApp(client), async (baseUrl) => {
    const res = await post(baseUrl, 'u5', { ...REFLECTION, customEvent: 'I want to kill myself' });
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
// contract. There are two flagged paths now (the reflection's pre-validation
// screen and the legacy post-validation one); BOTH must be content-free.
test('every flagged path records a content-free SafetyEvent and returns the fixed guidance', () => {
  const { readFileSync } = require('node:fs');
  const path = require('node:path');
  const src = readFileSync(path.join(__dirname, '../src/routes/mindJournal.js'), 'utf8');

  const recordCalls = [...src.matchAll(/recordSafetyEvent\([\s\S]*?\);/g)];
  assert.equal(recordCalls.length, 2, 'exactly the reflection and legacy flagged paths may record an event');
  const guidanceCalls = (src.match(/getSafetyGuidance\(/g) || []).length;
  assert.equal(guidanceCalls, 2, 'both flagged paths must return the same fixed guidance');
  assert.equal((src.match(/safetyFlag: 'needs_support'/g) || []).length, 2);

  for (const call of recordCalls) {
    assert.match(call[0], /'mind_journal'/, 'both paths use the fixed surface');
    assert.match(call[0], /sourceType: 'mind_journal'/);
    // No athlete text, no excerpt, no indication of which field flagged.
    for (const forbidden of [
      'note', 'customState', 'customContext', 'customEvent', 'customThought',
      'customResponse', 'customBody', 'excerpt', 'summary', 'text', 'content',
    ]) {
      assert.doesNotMatch(call[0], new RegExp(`\\b${forbidden}\\b`),
        `a SafetyEvent write must never reference ${forbidden}`);
    }
  }
});

test('a reflection is screened for safety BEFORE it is checked for completeness', () => {
  const { readFileSync } = require('node:fs');
  const path = require('node:path');
  const src = readFileSync(path.join(__dirname, '../src/routes/mindJournal.js'), 'utf8');

  const earlyScreen = src.indexOf('screenSafetyFields(...collectReflectionText(req.body))');
  const validation = src.indexOf('validateMindJournalEntry(req.body');
  const createCall = src.indexOf('client.mindJournalEntry.create(');
  assert.ok(earlyScreen !== -1, 'the reflection must be screened from the raw body');
  assert.ok(earlyScreen < validation,
    'safety screening must run before structured completeness validation');
  assert.ok(validation < createCall, 'validation still gates the write');

  // The legacy per-field screens stay where they were, after validation.
  const legacyScreen = src.indexOf('screen = screenSafetyText(customState)');
  assert.ok(legacyScreen > validation, 'legacy screening order is unchanged');
});

// ── Trial gating + review failure safety ───────────────────────────────────

test('an expired trial still saves the reflection, it just gets no AI review', async () => {
  const client = makeFakeClient({ users: { u8: { id: 'u8', language: 'en' } } });
  const review = makeReviewSpy();
  await withApp(buildApp(client, { review, trialActive: false }), async (baseUrl) => {
    const res = await post(baseUrl, 'u8', REFLECTION);
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
  const client = makeFakeClient({ users: { u9: { id: 'u9', language: 'en' } } });
  const review = makeReviewSpy(() => ({ noticed: null, takeaway: null, pattern: null }));
  await withApp(buildApp(client, { review }), async (baseUrl) => {
    const res = await post(baseUrl, 'u9', REFLECTION);
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
      id: `old-${i}`, userId: 'u10', entryType: 'REFLECTION', contextType: 'TRAINING',
      createdAt: new Date(Date.now() - (14 - i) * 86400000),
    };
  }
  // A quick note must never be counted as pattern evidence.
  entries['qn'] = { id: 'qn', userId: 'u10', entryType: 'QUICK_NOTE', states: ['calm'], createdAt: new Date() };
  const client = makeFakeClient({ users: { u10: { id: 'u10', language: 'en' } }, entries });
  const review = makeReviewSpy();
  await withApp(buildApp(client, { review }), async (baseUrl) => {
    await post(baseUrl, 'u10', REFLECTION);
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
  const client = makeFakeClient({ users: { u12: { id: 'u12', language: 'en' } } });
  await withApp(buildApp(client), async (baseUrl) => {
    const res = await post(baseUrl, 'u12', { ...REFLECTION, arjunTakeaway: 'I am definitely fine' });
    assert.equal(res.status, 400);
    assert.match((await res.json()).error, /unexpected field/);
    assert.equal(Object.keys(client.__entries).length, 0);
  });
});

// ── Required structured answers cannot be bypassed via the API ─────────────

for (const field of ['eventTags', 'states', 'thoughtTags', 'responseTags']) {
  test(`a direct API call omitting ${field} is rejected and persists nothing`, async () => {
    const client = makeFakeClient({ users: { u13: { id: 'u13', language: 'en' } } });
    const review = makeReviewSpy();
    await withApp(buildApp(client, { review }), async (baseUrl) => {
      const res = await post(baseUrl, 'u13', { ...REFLECTION, [field]: [] });
      assert.equal(res.status, 400, `${field} must be required server-side`);
      assert.match((await res.json()).error, /at least one answer/);
      assert.equal(Object.keys(client.__entries).length, 0);
      assert.equal(review.calls.length, 0, 'an invalid reflection must never reach the AI');
    });
  });
}

test('a direct API call omitting a shown Q6 is rejected', async () => {
  const client = makeFakeClient({ users: { u14: { id: 'u14', language: 'en' } } });
  await withApp(buildApp(client), async (baseUrl) => {
    const { bodyTags, ...withoutQ6 } = COMPETITION_REFLECTION;
    const res = await post(baseUrl, 'u14', withoutQ6);
    assert.equal(res.status, 400);
    assert.match((await res.json()).error, /final question/);
    assert.equal(Object.keys(client.__entries).length, 0);
  });
});

test('an active Focus Card makes the cue question required, read server-side not trusted from the client', async () => {
  const client = makeFakeClient({ users: { u15: { id: 'u15', language: 'en' } }, focusCard: 'Breathe' });
  await withApp(buildApp(client), async (baseUrl) => {
    // TOUGH_MOMENT + calm shows no Q6 without a card, but does with one.
    const toughMoment = { ...REFLECTION, contextType: 'TOUGH_MOMENT', eventTags: ['made_a_mistake'] };
    const rejected = await post(baseUrl, 'u15', toughMoment);
    assert.equal(rejected.status, 400, 'the server reads the card itself — the client cannot opt out');

    const accepted = await post(baseUrl, 'u15', { ...toughMoment, cueFeedback: 'helped', cueWordSnapshot: 'Breathe' });
    assert.equal(accepted.status, 200);
    assert.equal(Object.keys(client.__entries).length, 1);
  });
});

test('a chips-only reflection saves — no athlete is ever required to type', async () => {
  const client = makeFakeClient({ users: { u16: { id: 'u16', language: 'en' } } });
  await withApp(buildApp(client), async (baseUrl) => {
    const res = await post(baseUrl, 'u16', REFLECTION);
    assert.equal(res.status, 200);
    const { entry } = await res.json();
    for (const f of ['customEvent', 'customState', 'customThought', 'customResponse', 'customBody']) {
      assert.equal(entry[f], null, `${f} must stay null`);
    }
  });
});

test('Q3 accepts "Not sure", and the legacy shapes still reject it', async () => {
  const client = makeFakeClient({ users: { u17: { id: 'u17', language: 'en' } } });
  await withApp(buildApp(client), async (baseUrl) => {
    assert.equal((await post(baseUrl, 'u17', { ...REFLECTION, states: ['not_sure'] })).status, 200);
    assert.equal((await post(baseUrl, 'u17', { entryType: 'QUICK_NOTE', states: ['not_sure'] })).status, 400);
  });
});

// ── The reflection outlives any AI failure ────────────────────────────────

test('an Anthropic failure cannot lose a valid reflection — it is already written', async () => {
  const client = makeFakeClient({ users: { u18: { id: 'u18', language: 'en' } } });
  // Throws rather than resolving: the harshest case the generator could hit.
  const review = async () => { throw new Error('anthropic timed out'); };
  review.calls = [];
  await withApp(buildApp(client, { review }), async (baseUrl) => {
    const res = await post(baseUrl, 'u18', REFLECTION).catch(() => null);
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
  const client = makeFakeClient({ users: { u19: { id: 'u19', language: 'en' } }, updateFails: true });
  const review = makeReviewSpy(() => ({ noticed: 'Something', takeaway: 'Something else', pattern: null }));
  await withApp(buildApp(client, { review }), async (baseUrl) => {
    const res = await post(baseUrl, 'u19', REFLECTION);
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
  const client = makeFakeClient({ users: { u20: { id: 'u20', language: 'en' } } });
  const review = makeReviewSpy();
  await withApp(buildApp(client, { review }), async (baseUrl) => {
    await post(baseUrl, 'u20', REFLECTION);
    assert.equal(review.calls[0].priorEntries.length, 0, 'the first reflection has no priors — not even itself');
    await post(baseUrl, 'u20', REFLECTION);
    assert.equal(review.calls[1].priorEntries.length, 1, 'only the genuinely earlier entry counts');
  });
});

// ── Legacy shapes are unaffected by the new requirements ──────────────────

test('legacy quick notes and guided reflections still save unchanged', async () => {
  const client = makeFakeClient({ users: { u21: { id: 'u21', language: 'en' } } });
  const review = makeReviewSpy();
  await withApp(buildApp(client, { review }), async (baseUrl) => {
    assert.equal((await post(baseUrl, 'u21', { states: ['calm'], note: 'legacy row' })).status, 200);
    assert.equal((await post(baseUrl, 'u21', { entryType: 'QUICK_NOTE', states: ['tired'] })).status, 200);
    assert.equal((await post(baseUrl, 'u21', {
      entryType: 'GUIDED_REFLECTION', contextType: 'TRAINING', states: ['focused'], takeForward: 'keep the routine',
    })).status, 200);
    assert.equal(Object.keys(client.__entries).length, 3);
    assert.equal(review.calls.length, 0, 'no legacy shape triggers an AI review');
  });
});

// ── Safety runs before completeness ───────────────────────────────────────

test('an incomplete reflection carrying a crisis phrase takes the safety path, not a 400', async () => {
  for (const field of ['customEvent', 'customThought', 'customResponse', 'customBody', 'customContext']) {
    const client = makeFakeClient({ users: { u22: { id: 'u22', language: 'en' } } });
    const review = makeReviewSpy();
    await withApp(buildApp(client, { review }), async (baseUrl) => {
      // Deliberately unfinished: no Q2-Q5 answers at all. Before this change
      // that returned an ordinary validation 400 and the distress went unseen.
      const res = await post(baseUrl, 'u22', {
        entryType: 'REFLECTION',
        contextType: field === 'customContext' ? 'SOMETHING_ELSE' : 'TRAINING',
        [field]: 'I want to kill myself',
      });
      assert.equal(res.status, 200, `${field}: must not be a validation 400`);
      const json = await res.json();
      assert.equal(json.safetyFlag, 'needs_support', `${field} must reach the safety path`);
      assert.match(json.guidance || '', /iCall|KIRAN/);
      assert.doesNotMatch(JSON.stringify(json), /kill myself/i, 'the flagged text is never echoed back');
      assert.equal(Object.keys(client.__entries).length, 0, `${field}: nothing may be persisted`);
      assert.equal(review.calls.length, 0, `${field}: the AI must never be called`);
    });
  }
});

test('a phrase split across two fields is caught even when the reflection is incomplete', async () => {
  const client = makeFakeClient({ users: { u23: { id: 'u23', language: 'en' } } });
  const review = makeReviewSpy();
  await withApp(buildApp(client, { review }), async (baseUrl) => {
    const res = await post(baseUrl, 'u23', {
      entryType: 'REFLECTION', contextType: 'TRAINING',
      customEvent: 'i want to', customThought: 'kill myself',
    });
    assert.equal((await res.json()).safetyFlag, 'needs_support');
    assert.equal(Object.keys(client.__entries).length, 0);
    assert.equal(review.calls.length, 0);
  });
});

test('a safe but incomplete reflection still gets an ordinary validation 400', async () => {
  const client = makeFakeClient({ users: { u24: { id: 'u24', language: 'en' } } });
  await withApp(buildApp(client), async (baseUrl) => {
    const res = await post(baseUrl, 'u24', {
      entryType: 'REFLECTION', contextType: 'TRAINING', customEvent: 'a normal net session',
    });
    assert.equal(res.status, 400, 'safety screening must not swallow normal validation');
    assert.match((await res.json()).error, /at least one answer/);
    assert.equal(Object.keys(client.__entries).length, 0);
  });
});

test('malformed athlete-text values cannot crash the safety scanner', async () => {
  const client = makeFakeClient({ users: { u25: { id: 'u25', language: 'en' } } });
  await withApp(buildApp(client), async (baseUrl) => {
    const malformed = [
      { customEvent: 12345 },
      { customEvent: null },
      { customEvent: { nested: 'object' } },
      { customEvent: ['an', 'array'] },
      { customEvent: true },
      { customEvent: '' },
      { customEvent: 'x'.repeat(50000) },
      { customThought: 12345, customResponse: { a: 1 }, customBody: [] },
    ];
    for (const body of malformed) {
      const res = await post(baseUrl, 'u25', { entryType: 'REFLECTION', contextType: 'TRAINING', ...body });
      // A 400 is fine, a 200 safety response is fine — a 500 is not.
      assert.ok(res.status === 400 || res.status === 200,
        `${JSON.stringify(body).slice(0, 40)} produced ${res.status}`);
    }
    assert.equal(Object.keys(client.__entries).length, 0);
  });
});

test('a non-reflection body is untouched by the reflection pre-screen', async () => {
  const client = makeFakeClient({ users: { u26: { id: 'u26', language: 'en' } } });
  await withApp(buildApp(client), async (baseUrl) => {
    // Legacy shapes keep screening after validation, exactly as before.
    assert.equal((await post(baseUrl, 'u26', { entryType: 'QUICK_NOTE', states: ['calm'] })).status, 200);
    const flagged = await post(baseUrl, 'u26', {
      entryType: 'QUICK_NOTE', states: ['calm'], customState: 'I want to kill myself',
    });
    assert.equal((await flagged.json()).safetyFlag, 'needs_support');
  });
});

// ── The review attempt is bounded ─────────────────────────────────────────

test('a review that never resolves cannot hold the athlete up — the saved reflection is returned', async () => {
  const client = makeFakeClient({ users: { u27: { id: 'u27', language: 'en' } } });
  // Never settles: the harshest version of a slow provider.
  const review = async () => new Promise(() => {});
  review.calls = [];
  await withApp(buildApp(client, { review, reviewTimeoutMs: 30 }), async (baseUrl) => {
    const started = Date.now();
    const res = await post(baseUrl, 'u27', REFLECTION);
    assert.ok(Date.now() - started < 5000, 'the response must not wait on the provider');
    assert.equal(res.status, 200);
    const { entry } = await res.json();
    assert.equal(Object.keys(client.__entries).length, 1, 'exactly one reflection, no duplicate');
    assert.deepEqual(entry.eventTags, ['full_session']);
    assert.equal(entry.arjunNoticed, null);
    assert.equal(entry.arjunTakeaway, null);
    assert.equal(entry.arjunPattern, null);
    assert.equal(entry.reviewGeneratedAt, null, 'nothing was stored, so nothing may claim to have been');
  });
});

test('a review the deadline already passed on can never attach itself afterwards', async () => {
  const client = makeFakeClient({ users: { u28: { id: 'u28', language: 'en' } } });
  let resolveLate;
  const review = async () => new Promise((resolve) => { resolveLate = resolve; });
  review.calls = [];
  await withApp(buildApp(client, { review, reviewTimeoutMs: 30 }), async (baseUrl) => {
    const res = await post(baseUrl, 'u28', REFLECTION);
    assert.equal(res.status, 200);
    const stored = Object.values(client.__entries)[0];
    assert.equal(stored.arjunNoticed, null);

    // The provider answers long after the athlete was served.
    resolveLate({ noticed: 'stale analysis', takeaway: 'stale takeaway', pattern: null });
    await new Promise((r) => setTimeout(r, 60));

    const after = Object.values(client.__entries)[0];
    assert.equal(after.arjunNoticed, null, 'a late result must never write to the entry');
    assert.equal(after.arjunTakeaway, null);
    assert.equal(after.reviewGeneratedAt, null);
    assert.equal(Object.keys(client.__entries).length, 1, 'and must never create a second entry');
  });
});

test('the generator is handed an abort signal so a slow call is genuinely cancelled', async () => {
  const client = makeFakeClient({ users: { u29: { id: 'u29', language: 'en' } } });
  let seenSignal = null;
  const review = async ({ signal }) => { seenSignal = signal; return new Promise(() => {}); };
  review.calls = [];
  await withApp(buildApp(client, { review, reviewTimeoutMs: 30 }), async (baseUrl) => {
    await post(baseUrl, 'u29', REFLECTION);
    assert.ok(seenSignal, 'the generator must receive a signal');
    assert.equal(seenSignal.aborted, true, 'the deadline must abort the underlying request');
  });
});

test('a review that lands inside the deadline attaches normally', async () => {
  const client = makeFakeClient({ users: { u30: { id: 'u30', language: 'en' } } });
  const review = makeReviewSpy(() => ({ noticed: 'You reported a steady session.', takeaway: 'Keep that.', pattern: null }));
  await withApp(buildApp(client, { review, reviewTimeoutMs: 5000 }), async (baseUrl) => {
    const res = await post(baseUrl, 'u30', REFLECTION);
    const { entry } = await res.json();
    assert.equal(entry.arjunNoticed, 'You reported a steady session.');
    assert.equal(entry.arjunTakeaway, 'Keep that.');
    assert.ok(entry.reviewGeneratedAt);
    assert.equal(Object.keys(client.__entries).length, 1);
  });
});

test('the production deadline is bounded well below the SDK default, with retries off', () => {
  const { readFileSync } = require('node:fs');
  const path = require('node:path');
  const gen = readFileSync(path.join(__dirname, '../src/services/mindJournal/generateReflectionReview.js'), 'utf8');
  const { REVIEW_TIMEOUT_MS } = require('../src/services/mindJournal/generateReflectionReview');
  assert.ok(REVIEW_TIMEOUT_MS >= 20000 && REVIEW_TIMEOUT_MS <= 30000, 'the bound must sit in the approved 20-30s window');
  assert.match(gen, /timeout: REVIEW_TIMEOUT_MS/, 'the SDK call itself must carry the bound');
  assert.match(gen, /maxRetries: 0/, 'retries would multiply the bound by three');
  assert.match(gen, /\bsignal,/, 'the SDK call must be cancellable');
});
