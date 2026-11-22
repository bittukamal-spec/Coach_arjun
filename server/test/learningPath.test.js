// Learning path (docs/PATH-STRATEGY.md): chapter order, statuses, earned
// steps, the API's guard rails, and the store against a fake Prisma.
const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const jwt = require('jsonwebtoken');

const { chapterOrderFor, CHAPTERS } = require('../src/services/path/pathConfig');
const { buildPath, stepsToRecord, createPathStore } = require('../src/services/path/pathService');
const { createPathRouter } = require('../src/routes/path');

const at = (s) => new Date(`2026-11-${s}T10:00:00Z`);

test('the first chapter comes from the starting-profile priority', () => {
  assert.deepEqual(chapterOrderFor('after_mistake').slice(0, 2), ['bounce', 'calm']);
  assert.equal(chapterOrderFor('lose_focus')[0], 'focus');
  assert.equal(chapterOrderFor(null)[0], 'calm');
  assert.equal(chapterOrderFor('anything_else').length, CHAPTERS.length);
});

test('one current chapter at a time; the next step is the first unfinished one', () => {
  const p = buildPath({ order: ['calm', 'focus'], steps: [] });
  assert.equal(p.currentKey, 'calm');
  assert.deepEqual(p.next, { chapterKey: 'calm', stepKey: 'learn' });
  assert.equal(p.chapters.find(c => c.key === 'focus').status, 'locked');

  const steps = ['learn', 'practise', 'play', 'reflect'].map(stepKey => ({ chapterKey: 'calm', stepKey, doneAt: at(10) }));
  const p2 = buildPath({ order: ['calm', 'focus'], steps: [...steps, { chapterKey: 'focus', stepKey: 'learn', doneAt: at(11) }] });
  assert.equal(p2.chapters[0].status, 'done');
  assert.equal(p2.currentKey, 'focus');
  assert.deepEqual(p2.next, { chapterKey: 'focus', stepKey: 'practise' });
});

test('an old saved order still gets every chapter', () => {
  const p = buildPath({ order: ['focus', 'nonsense'], steps: [] });
  assert.equal(p.chapters[0].key, 'focus');
  assert.equal(p.chapters.length, CHAPTERS.length);
});

test('practise is earned from a matching tool; reflect from a journal entry after play', () => {
  const path = buildPath({ order: ['calm'], steps: [{ chapterKey: 'calm', stepKey: 'play', outcome: 'helped', doneAt: at(12) }] });
  const earned = stepsToRecord(path, {
    toolTypes: [{ toolType: 'self_talk_builder', at: at(11) }, { toolType: 'body_reset', at: at(11) }],
    routineChangedAt: null,
    journalAt: [at(10), at(13)],
  });
  assert.deepEqual(earned.map(s => s.stepKey).sort(), ['practise', 'reflect']);
  assert.equal(String(earned.find(s => s.stepKey === 'reflect').doneAt), String(at(13)), 'only an entry written after play counts');
});

test('the routine chapter counts a saved routine as practice; other chapters ignore unrelated tools', () => {
  const routine = buildPath({ order: ['routine'], steps: [] });
  assert.equal(stepsToRecord(routine, { toolTypes: [], routineChangedAt: at(12), journalAt: [] })[0].stepKey, 'practise');
  const focus = buildPath({ order: ['focus'], steps: [] });
  assert.equal(stepsToRecord(focus, { toolTypes: [{ toolType: 'body_reset', at: at(12) }], routineChangedAt: null, journalAt: [] }).length, 0);
});

// ── store against a fake Prisma ────────────────────────────────────────────
function fakePrisma({ priority = 'lose_focus', reports = [], journal = [] } = {}) {
  const db = { progress: null, steps: [] };
  return {
    db,
    startingPerformanceProfile: { findFirst: async () => ({ agreedPriorityId: priority, suggestedPriorityId: null }) },
    pathProgress: {
      findUnique: async () => db.progress,
      create: async ({ data }) => (db.progress = { ...data, startedAt: at(1) }),
    },
    pathStep: {
      findMany: async () => db.steps.map(s => ({ ...s })),
      upsert: async ({ where, create, update }) => {
        const k = where.userId_chapterKey_stepKey;
        const found = db.steps.find(s => s.chapterKey === k.chapterKey && s.stepKey === k.stepKey);
        if (found) Object.assign(found, update);
        else db.steps.push({ chapterKey: create.chapterKey, stepKey: create.stepKey, outcome: create.outcome, doneAt: create.doneAt || new Date() });
      },
    },
    toolReport: { findMany: async () => reports },
    routine: { findFirst: async () => null },
    mindJournalEntry: { findMany: async () => journal },
  };
}

test('store: creates the path once with the personal order and records earned practice', async () => {
  const prisma = fakePrisma({ reports: [{ toolType: 'mental_rep', createdAt: at(5) }] });
  const store = createPathStore(prisma);
  const path = await store.getPath('u1');
  assert.equal(path.chapters[0].key, 'focus');
  assert.equal(path.chapters[0].steps.practise.done, true);
  await store.getPath('u1');
  assert.equal(prisma.db.steps.length, 1, 'no duplicate rows');
});

// ── API ───────────────────────────────────────────────────────────────────
const SECRET = 'learning-path-test-secret';
const ORIGINAL = process.env.JWT_SECRET;
test.before(() => { process.env.JWT_SECRET = SECRET; });
test.after(() => { if (ORIGINAL === undefined) delete process.env.JWT_SECRET; else process.env.JWT_SECRET = ORIGINAL; });

async function withApp(store, fn) {
  const app = express();
  app.use(express.json());
  app.use('/api/path', createPathRouter({ store }));
  const server = await new Promise(r => { const s = app.listen(0, '127.0.0.1', () => r(s)); });
  const base = `http://127.0.0.1:${server.address().port}/api/path`;
  const auth = { Authorization: `Bearer ${jwt.sign({ userId: 'u1' }, SECRET)}`, 'Content-Type': 'application/json' };
  try { await fn(base, auth); } finally { await new Promise(r => server.close(r)); }
}

test('API: needs sign-in, validates steps and only opens the current chapter', async () => {
  const store = createPathStore(fakePrisma({ priority: 'pressure_increases' }));
  await withApp(store, async (base, auth) => {
    assert.equal((await fetch(base)).status, 401);
    const first = await (await fetch(base, { headers: auth })).json();
    assert.equal(first.currentKey, 'calm');

    const bad = await fetch(`${base}/steps`, { method: 'POST', headers: auth, body: JSON.stringify({ chapterKey: 'calm', stepKey: 'reflect' }) });
    assert.equal(bad.status, 400, 'reflect is recognised from the journal, not self-marked');
    const noOutcome = await fetch(`${base}/steps`, { method: 'POST', headers: auth, body: JSON.stringify({ chapterKey: 'calm', stepKey: 'play' }) });
    assert.equal(noOutcome.status, 400);
    const locked = await fetch(`${base}/steps`, { method: 'POST', headers: auth, body: JSON.stringify({ chapterKey: 'picture', stepKey: 'learn' }) });
    assert.equal(locked.status, 409);

    const ok = await (await fetch(`${base}/steps`, { method: 'POST', headers: auth, body: JSON.stringify({ chapterKey: 'calm', stepKey: 'learn' }) })).json();
    assert.equal(ok.chapters[0].steps.learn.done, true);
    assert.deepEqual(ok.next, { chapterKey: 'calm', stepKey: 'practise' });
  });
});
