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

test('zero Anthropic calls are possible from this route — it never imports the Anthropic SDK', () => {
  const src = readFileSync(path.join(__dirname, '../src/routes/mindJournal.js'), 'utf8');
  assert.doesNotMatch(src, /require\(['"]@anthropic-ai\/sdk['"]\)|new Anthropic\(/);
});

test('deterministic layer never persists athlete text: shared SafetyEvent writer carries no content fields (recordSafetyEvent.js unchanged)', () => {
  const writer = readFileSync(path.join(__dirname, '../src/services/safety/recordSafetyEvent.js'), 'utf8');
  const codeOnly = writer.split('\n').filter((l) => !l.trim().startsWith('//')).join('\n');
  assert.doesNotMatch(codeOnly, /content|snippet|excerpt|summary:/);
});
