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
  assert.deepEqual(p.next, { chapterKey: 'calm', stepKey: 'learn', level: 1 });
  assert.equal(p.chapters.find(c => c.key === 'focus').status, 'locked');

  const steps = ['learn', 'practise', 'play', 'reflect'].map(stepKey => ({ chapterKey: 'calm', stepKey, doneAt: at(10) }));
  const p2 = buildPath({ order: ['calm', 'focus'], steps: [...steps, { chapterKey: 'focus', stepKey: 'learn', doneAt: at(11) }] });
  assert.equal(p2.chapters[0].status, 'done');
  assert.equal(p2.currentKey, 'focus');
  assert.deepEqual(p2.next, { chapterKey: 'focus', stepKey: 'practise', level: 1 });
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
    assert.deepEqual(ok.next, { chapterKey: 'calm', stepKey: 'practise', level: 1 });
  });
});

// ── Mind Challenge ─────────────────────────────────────────────────────────
const { levelFromPoints, cleanPoints, scoreChallenge, createMindChallengeStore, REMATCH_DAYS } = require('../src/services/path/mindChallenge');
const { reorderForGoal } = require('../src/services/path/pathService');
const { createMindChallengeRouter } = require('../src/routes/mindChallenge');

test('Mind Challenge: points map to Level 1–5, and the card picks strongest + grow-first', () => {
  assert.deepEqual([0, 1, 2, 3, 4, 5, 6].map(levelFromPoints), [1, 1, 2, 3, 3, 4, 5]);
  const r = scoreChallenge({ calm: 3, focus: 6, confidence: 4, routine: 1, bounce: 3, picture: 2 });
  assert.equal(r.levels.focus, 5);
  assert.equal(r.strongest, 'focus');
  assert.equal(r.growFirst, 'routine');
  assert.equal(r.mindLevel, 3);
  assert.equal(cleanPoints({ calm: 7 }), null, 'out of range or missing skills are refused');
});

test('goal chapter moves first before any step, otherwise right after the current chapter', () => {
  const order = ['calm', 'focus', 'confidence', 'routine', 'bounce', 'picture'];
  assert.equal(reorderForGoal(order, [], 'routine')[0], 'routine');
  const started = [{ chapterKey: 'calm', stepKey: 'learn', doneAt: at(10) }];
  assert.deepEqual(reorderForGoal(order, started, 'routine').slice(0, 3), ['calm', 'routine', 'focus']);
  assert.deepEqual(reorderForGoal(order, started, 'calm'), order, 'the current chapter never moves');
});

function fakeMcPrisma() {
  const rows = [];
  return {
    rows,
    mindChallengeResult: {
      findMany: async ({ take }) => [...rows].sort((a, b) => b.createdAt - a.createdAt).slice(0, take),
      findFirst: async () => [...rows].sort((a, b) => b.createdAt - a.createdAt)[0] || null,
      create: async ({ data }) => { const r = { id: `r${rows.length}`, createdAt: new Date(), ...data }; rows.push(r); return r; },
      update: async ({ where, data }) => Object.assign(rows.find(r => r.id === where.id), data),
    },
  };
}

test('API: one challenge per 4 weeks; the goal is saved and moves that chapter up', async () => {
  const prisma = fakeMcPrisma();
  const store = createMindChallengeStore(prisma);
  const prioritised = [];
  const app = express();
  app.use(express.json());
  app.use('/api/mind-challenge', createMindChallengeRouter({ store, pathStore: { prioritise: async (u, k) => prioritised.push(k) } }));
  const server = await new Promise(r => { const s = app.listen(0, '127.0.0.1', () => r(s)); });
  const base = `http://127.0.0.1:${server.address().port}/api/mind-challenge`;
  const auth = { Authorization: `Bearer ${jwt.sign({ userId: 'u1' }, SECRET)}`, 'Content-Type': 'application/json' };
  const points = { calm: 3, focus: 6, confidence: 4, routine: 1, bounce: 3, picture: 2 };
  try {
    assert.equal((await (await fetch(base, { headers: auth })).json()).canTake, true);
    assert.equal((await fetch(base, { method: 'POST', headers: auth, body: JSON.stringify({ points: { calm: 9 } }) })).status, 400);
    const saved = await (await fetch(base, { method: 'POST', headers: auth, body: JSON.stringify({ points }) })).json();
    assert.equal(saved.latest.levels.focus, 5);
    assert.equal(saved.canTake, false);
    assert.equal(Math.round((new Date(saved.nextAt) - new Date(saved.latest.createdAt)) / 86400000), REMATCH_DAYS);
    assert.equal((await fetch(base, { method: 'POST', headers: auth, body: JSON.stringify({ points }) })).status, 409);
    const goal = await (await fetch(`${base}/latest/goal`, { method: 'PATCH', headers: auth, body: JSON.stringify({ focusSkill: 'routine', nextMatch: 'next_week' }) })).json();
    assert.equal(goal.latest.focusSkill, 'routine');
    assert.deepEqual(prioritised, ['routine']);
  } finally { await new Promise(r => server.close(r)); }
});

// ── Levels (founder, Nov 2026) ─────────────────────────────────────────────
const { levelKey: lk } = require('../src/services/path/pathConfig');
const all4 = (key) => ['learn', 'practise', 'play', 'reflect'].map(stepKey => ({ chapterKey: key, stepKey, doneAt: new Date('2026-11-01') }));

test('levels: Level 2 opens after Level 1, Level 3 after Level 2; old Level 1 data unchanged', () => {
  const order = ['calm', 'focus', 'confidence', 'routine', 'bounce', 'picture'];
  let p = buildPath({ order, steps: all4('calm') });
  const calm = p.chapters[0];
  assert.equal(calm.status, 'done');
  assert.deepEqual(calm.levels.map(l => l.status), ['done', 'current', 'locked']);
  assert.equal(calm.level, 2);
  assert.equal(p.currentKey, 'focus');
  assert.deepEqual(p.next, { chapterKey: 'focus', stepKey: 'learn', level: 1 });
  p = buildPath({ order, steps: [...all4('calm'), ...all4(lk('calm', 2))] });
  assert.deepEqual(p.chapters[0].levels.map(l => l.status), ['done', 'done', 'current']);
  assert.equal(p.chapters[1].levels[1].status, 'locked');
});

test('levels: when every Level 1 is done, Next moves to the first open level', () => {
  const order = ['calm', 'focus', 'confidence', 'routine', 'bounce', 'picture'];
  const steps = order.flatMap(all4);
  const p = buildPath({ order, steps: [...steps, { chapterKey: lk('calm', 2), stepKey: 'learn', doneAt: new Date() }] });
  assert.equal(p.finished, true);
  assert.equal(p.allMastered, false);
  assert.deepEqual(p.next, { chapterKey: 'calm', stepKey: 'practise', level: 2 });
});

test('levels: practice counts for a higher level only after its lesson was read', () => {
  const order = ['calm', 'focus', 'confidence', 'routine', 'bounce', 'picture'];
  const learnAt = new Date('2026-11-10');
  const p = buildPath({ order, steps: [...all4('calm'), { chapterKey: lk('calm', 2), stepKey: 'learn', doneAt: learnAt }] });
  const before = stepsToRecord(p, { toolTypes: [{ toolType: 'body_reset', at: new Date('2026-11-09') }], journalAt: [] });
  assert.equal(before.find(s => s.chapterKey === 'calm:2'), undefined);
  const after = stepsToRecord(p, { toolTypes: [{ toolType: 'body_reset', at: new Date('2026-11-11') }], journalAt: [] });
  assert.ok(after.find(s => s.chapterKey === 'calm:2' && s.stepKey === 'practise'));
});
