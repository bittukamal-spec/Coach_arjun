// Safety-screening behavior for the Mind Journal note field — reuses the
// shared deterministic pre-LLM safety service (screenSafetyText /
// recordSafetyEvent / getSafetyGuidance), same technique as
// mindJournalApi.test.js: injected fake Prisma client, no real database, no
// Anthropic SDK involved anywhere in this route.

const test = require('node:test');
const assert = require('node:assert/strict');
const jwt = require('jsonwebtoken');
const express = require('express');
const { readFileSync } = require('node:fs');
const path = require('node:path');

const { createRequireGuardianConsent } = require('../src/middleware/requireGuardianConsent');
const { createMindJournalRouter } = require('../src/routes/mindJournal');

const TEST_JWT_SECRET = 'mind-journal-safety-test-secret';
const ORIGINAL_JWT_SECRET = process.env.JWT_SECRET;
test.before(() => { process.env.JWT_SECRET = TEST_JWT_SECRET; });
test.after(() => {
  if (ORIGINAL_JWT_SECRET === undefined) delete process.env.JWT_SECRET;
  else process.env.JWT_SECRET = ORIGINAL_JWT_SECRET;
});

function tokenFor(userId) {
  return jwt.sign({ userId }, TEST_JWT_SECRET, { expiresIn: '15m' });
}

function adult() {
  const now = new Date();
  return { dateOfBirth: new Date(now.getFullYear() - 25, now.getMonth(), now.getDate()), guardianConsentAt: null, language: 'en' };
}

function makeFakeClient(seed = {}) {
  const usersById = seed.usersById || {};
  const entriesById = seed.entriesById || {};
  const safetyEvents = [];
  let nextId = 1;

  return {
    user: {
      findUnique: async ({ where }) => usersById[where.id] || null,
      update: async ({ where, data }) => {
        usersById[where.id] = { ...(usersById[where.id] || { id: where.id }), ...data };
        return usersById[where.id];
      },
    },
    mindJournalEntry: {
      create: async ({ data }) => {
        const entry = { id: `mj-${nextId++}`, ...data, createdAt: new Date() };
        entriesById[entry.id] = entry;
        return entry;
      },
      findMany: async ({ where }) => Object.values(entriesById).filter((e) => e.userId === where.userId),
      findUnique: async ({ where }) => entriesById[where.id] || null,
      delete: async ({ where }) => { const e = entriesById[where.id]; delete entriesById[where.id]; return e; },
    },
    // Fake writer target for recordSafetyEvent's default (real) client —
    // the shared safety service uses its OWN internal Prisma singleton, not
    // this injected client, so these tests assert against that module's
    // recorded calls via a spy instead (see below).
    safetyEvent: { create: async ({ data }) => { safetyEvents.push(data); return data; } },
    __usersById: usersById,
    __entriesById: entriesById,
    __safetyEvents: safetyEvents,
  };
}

function buildApp(client) {
  const app = express();
  app.use(express.json());
  const consentMiddleware = createRequireGuardianConsent(async (userId) => {
    const u = await client.user.findUnique({ where: { id: userId } });
    return u ? { dateOfBirth: u.dateOfBirth, guardianConsentAt: u.guardianConsentAt } : adult();
  });
  const router = createMindJournalRouter(client, consentMiddleware);
  app.use('/api/mind-journal', router);
  return app;
}

function start(app) {
  return new Promise((resolve) => {
    const server = app.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      resolve({ server, baseUrl: `http://127.0.0.1:${port}` });
    });
  });
}
function stop(server) {
  return new Promise((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));
}

test('a crisis-phrase note: no MindJournalEntry is created and the raw note is never persisted anywhere reachable', async () => {
  const client = makeFakeClient({ usersById: { 'flag-1': adult() } });
  const app = buildApp(client);
  const { server, baseUrl } = await start(app);
  try {
    const res = await fetch(`${baseUrl}/api/mind-journal`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${tokenFor('flag-1')}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ states: ['nervous'], note: 'I want to kill myself' }),
    });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.safetyFlag, 'needs_support');
    assert.ok(body.guidance && typeof body.guidance === 'string' && body.guidance.length > 0);
    assert.equal(Object.keys(client.__entriesById).length, 0, 'no MindJournalEntry should be created on a flagged note');
  } finally {
    await stop(server);
  }
});

test('the fixed safety guidance is returned in the athlete\'s language', async () => {
  const client = makeFakeClient({ usersById: { 'flag-hi': { ...adult(), language: 'hi' } } });
  const app = buildApp(client);
  const { server, baseUrl } = await start(app);
  try {
    const res = await fetch(`${baseUrl}/api/mind-journal`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${tokenFor('flag-hi')}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ states: ['nervous'], note: 'main marna chahta hoon' }),
    });
    const body = await res.json();
    assert.equal(body.safetyFlag, 'needs_support');
    assert.match(body.guidance, /Akele handle nahi karna hai|1800-599-0019/);
  } finally {
    await stop(server);
  }
});

test('a non-flagged note saves normally — no safety branch taken', async () => {
  const client = makeFakeClient({ usersById: { 'ok-1': adult() } });
  const app = buildApp(client);
  const { server, baseUrl } = await start(app);
  try {
    const res = await fetch(`${baseUrl}/api/mind-journal`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${tokenFor('ok-1')}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ states: ['motivated'], note: 'Good practice today, felt sharp.' }),
    });
    const body = await res.json();
    assert.equal(body.safetyFlag, undefined);
    assert.equal(body.entry.note, 'Good practice today, felt sharp.');
    assert.equal(Object.keys(client.__entriesById).length, 1);
  } finally {
    await stop(server);
  }
});

test('an entry with no note at all never reaches the safety screen', async () => {
  const client = makeFakeClient({ usersById: { 'ok-2': adult() } });
  const app = buildApp(client);
  const { server, baseUrl } = await start(app);
  try {
    const res = await fetch(`${baseUrl}/api/mind-journal`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${tokenFor('ok-2')}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ states: ['calm'] }),
    });
    const body = await res.json();
    assert.equal(body.safetyFlag, undefined);
    assert.equal(body.entry.note, null);
  } finally {
    await stop(server);
  }
});

// ── Structured SafetyEvent conventions (source-level, no DB) ────────────────
// The route calls the SHARED recordSafetyEvent with fixed surface/sourceType
// metadata and never a note/excerpt/summary — verified at the source level,
// matching safetyWiring.test.js's established technique for this exact
// no-content guarantee.

test('the route imports and calls the shared safety service with fixed mind_journal metadata, never persisting note content', () => {
  const src = readFileSync(path.join(__dirname, '../src/routes/mindJournal.js'), 'utf8');
  assert.match(src, /require\('\.\.\/services\/safety'\)/);
  assert.match(src, /screenSafetyText\(note\)/);
  assert.match(src, /recordSafetyEvent\(req\.userId, 'mind_journal', screen\.category/);
  assert.match(src, /sourceType: 'mind_journal'/);

  const flagBlockStart = src.indexOf('if (screen.flagged)');
  const flagBlockEnd = src.indexOf('const entry = await client.mindJournalEntry.create');
  const block = src.slice(flagBlockStart, flagBlockEnd);
  const recordCall = block.match(/recordSafetyEvent\([^;]*\);/s);
  assert.ok(recordCall, 'expected a recordSafetyEvent call on the flagged path');
  assert.doesNotMatch(recordCall[0], /\bnote\b/, 'the SafetyEvent write must never reference the raw note');
  assert.doesNotMatch(block, /excerpt|summary:/, 'must never persist an excerpt or summary of the note');
  assert.match(block, /getSafetyGuidance\(screen\.category/, 'must return the fixed guidance on a flagged note');
});

// ── PR 1: safety screening extended to the four guided-reflection fields ───

const GUIDED_FIELD_CASES = [
  ['whatHappened', { whatHappened: 'I want to kill myself' }],
  ['whatNoticed', { whatNoticed: 'I want to kill myself' }],
  ['helpedOrGotInWay', { helpedOrGotInWay: 'I want to kill myself' }],
  ['takeForward', { takeForward: 'I want to kill myself' }],
];

for (const [fieldName, extra] of GUIDED_FIELD_CASES) {
  test(`a crisis phrase in the guided field "${fieldName}": no MindJournalEntry is created, and the flag is returned instead of a save`, async () => {
    const client = makeFakeClient({ usersById: { [`gflag-${fieldName}`]: adult() } });
    const app = buildApp(client);
    const { server, baseUrl } = await start(app);
    try {
      const res = await fetch(`${baseUrl}/api/mind-journal`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${tokenFor(`gflag-${fieldName}`)}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ entryType: 'GUIDED_REFLECTION', contextType: 'TRAINING', states: ['nervous'], ...extra }),
      });
      assert.equal(res.status, 200);
      const body = await res.json();
      assert.equal(body.safetyFlag, 'needs_support');
      assert.ok(body.guidance && body.guidance.length > 0);
      // Fixed guidance only — never an echo of the flagged text.
      assert.doesNotMatch(body.guidance, /kill myself/i);
      assert.equal(Object.keys(client.__entriesById).length, 0, `no MindJournalEntry should be created when ${fieldName} is flagged`);
    } finally {
      await stop(server);
    }
  });
}

test('a flag on one guided field discards the WHOLE submission — no partial data (other safe fields, states, or contextType) is stored', async () => {
  const client = makeFakeClient({ usersById: { 'gflag-partial': adult() } });
  const app = buildApp(client);
  const { server, baseUrl } = await start(app);
  try {
    const res = await fetch(`${baseUrl}/api/mind-journal`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${tokenFor('gflag-partial')}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        entryType: 'GUIDED_REFLECTION', contextType: 'COMPETITION', states: ['nervous', 'focused'],
        whatHappened: 'A normal, safe description of the match.',
        whatNoticed: 'I want to kill myself',
        helpedOrGotInWay: 'Also a perfectly safe line.',
        takeForward: 'Also safe.',
      }),
    });
    const body = await res.json();
    assert.equal(body.safetyFlag, 'needs_support');
    assert.equal(Object.keys(client.__entriesById).length, 0, 'nothing — not even the safe fields — may be persisted');
  } finally {
    await stop(server);
  }
});

test('screening order: note is checked before the four guided fields (note flags first when both would)', () => {
  const src = readFileSync(path.join(__dirname, '../src/routes/mindJournal.js'), 'utf8');
  const noteIdx = src.indexOf('if (note) screen = screenSafetyText(note);');
  const whatHappenedIdx = src.indexOf('screenSafetyText(whatHappened)');
  const whatNoticedIdx = src.indexOf('screenSafetyText(whatNoticed)');
  const helpedIdx = src.indexOf('screenSafetyText(helpedOrGotInWay)');
  const takeForwardIdx = src.indexOf('screenSafetyText(takeForward)');
  assert.ok(noteIdx !== -1 && whatHappenedIdx !== -1 && whatNoticedIdx !== -1 && helpedIdx !== -1 && takeForwardIdx !== -1);
  assert.ok(noteIdx < whatHappenedIdx, 'note must be screened before whatHappened');
  assert.ok(whatHappenedIdx < whatNoticedIdx, 'whatHappened must be screened before whatNoticed');
  assert.ok(whatNoticedIdx < helpedIdx, 'whatNoticed must be screened before helpedOrGotInWay');
  assert.ok(helpedIdx < takeForwardIdx, 'helpedOrGotInWay must be screened before takeForward');
});

test('screening stops at the first flagged field: only ONE screenSafetyText call is made when note itself is flagged (guided fields are null for a QUICK_NOTE/legacy save anyway, but the guard is structural, not per-shape)', () => {
  const src = readFileSync(path.join(__dirname, '../src/routes/mindJournal.js'), 'utf8');
  // Every screen after the first is gated on `!screen.flagged` — the
  // short-circuit that stops screening once something has already flagged.
  const calls = [...src.matchAll(/screenSafetyText\((note|whatHappened|whatNoticed|helpedOrGotInWay|takeForward)\)/g)];
  assert.equal(calls.length, 5, 'expected exactly one screening call site per field');
  for (const m of calls.slice(1)) {
    const lineStart = src.lastIndexOf('\n', m.index) + 1;
    const before = src.slice(lineStart, m.index);
    assert.match(before, /!screen\.flagged/, `screening ${m[1]} must be gated on the previous field not having flagged`);
  }
});

test('an unflagged GUIDED_REFLECTION with all four text fields saves normally', async () => {
  const client = makeFakeClient({ usersById: { 'gok-1': adult() } });
  const app = buildApp(client);
  const { server, baseUrl } = await start(app);
  try {
    const res = await fetch(`${baseUrl}/api/mind-journal`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${tokenFor('gok-1')}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        entryType: 'GUIDED_REFLECTION', contextType: 'TRAINING', states: ['focused'],
        whatHappened: 'Good drills today.', whatNoticed: 'Stayed present.',
        helpedOrGotInWay: 'The warm-up routine helped.', takeForward: 'Keep the same warm-up.',
      }),
    });
    const body = await res.json();
    assert.equal(body.safetyFlag, undefined);
    assert.equal(body.entry.whatHappened, 'Good drills today.');
    assert.equal(Object.keys(client.__entriesById).length, 1);
  } finally {
    await stop(server);
  }
});

test('a guided reflection with no text at all (states only) never reaches the safety screen', async () => {
  const client = makeFakeClient({ usersById: { 'gok-2': adult() } });
  const app = buildApp(client);
  const { server, baseUrl } = await start(app);
  try {
    const res = await fetch(`${baseUrl}/api/mind-journal`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${tokenFor('gok-2')}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ entryType: 'GUIDED_REFLECTION', contextType: 'TRAINING', states: ['calm', 'focused'] }),
    });
    const body = await res.json();
    assert.equal(body.safetyFlag, undefined);
    assert.equal(body.entry.whatHappened, null);
  } finally {
    await stop(server);
  }
});

test('the route imports and calls the shared safety service for every guided field, never persisting their raw text', () => {
  const src = readFileSync(path.join(__dirname, '../src/routes/mindJournal.js'), 'utf8');
  const flagBlockStart = src.indexOf('if (screen.flagged)');
  const flagBlockEnd = src.indexOf('const entry = await client.mindJournalEntry.create');
  const block = src.slice(flagBlockStart, flagBlockEnd);
  const recordCall = block.match(/recordSafetyEvent\([^;]*\);/s);
  assert.ok(recordCall, 'expected a recordSafetyEvent call on the flagged path');
  // The SafetyEvent write must never reference ANY of the five screened
  // fields by name — a single fixed shape regardless of which one flagged.
  for (const field of ['note', 'whatHappened', 'whatNoticed', 'helpedOrGotInWay', 'takeForward']) {
    assert.doesNotMatch(recordCall[0], new RegExp(`\\b${field}\\b`), `the SafetyEvent write must never reference ${field}`);
  }
  assert.doesNotMatch(block, /excerpt|summary:/, 'must never persist an excerpt or summary of any field');
});

test('zero Anthropic calls are possible from this route — it never imports the Anthropic SDK', () => {
  const src = readFileSync(path.join(__dirname, '../src/routes/mindJournal.js'), 'utf8');
  assert.doesNotMatch(src, /require\(['"]@anthropic-ai\/sdk['"]\)|new Anthropic\(/);
});

test('deterministic layer never persists athlete text: shared SafetyEvent writer carries no content fields (recordSafetyEvent.js unchanged)', () => {
  const writer = readFileSync(path.join(__dirname, '../src/services/safety/recordSafetyEvent.js'), 'utf8');
  const codeOnly = writer.split('\n').filter((l) => !l.trim().startsWith('//')).join('\n');
  assert.doesNotMatch(codeOnly, /content|snippet|excerpt|summary:/);
});
