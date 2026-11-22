// Hook fix 2 (docs/HOOK-AUDIT.md #2): next match day, "How did it go?",
// and the internal note that lets Coach know the path + the match.
const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const jwt = require('jsonwebtoken');

const { indiaToday, dayDiff, isPickableDay, matchPhase, buildPathCoachSection } = require('../src/services/path/matchDay');
const { createPathStore } = require('../src/services/path/pathService');
const { createPathRouter } = require('../src/routes/path');

const addDays = (day, n) => new Date(Date.parse(`${day}T00:00:00Z`) + n * 86400000).toISOString().slice(0, 10);

test('days are India calendar days', () => {
  assert.equal(indiaToday(new Date('2026-11-22T20:00:00Z')), '2026-11-23', '8 pm UTC is already the next day in India');
  assert.equal(dayDiff('2026-11-22', '2026-11-29'), 7);
  assert.equal(isPickableDay('2026-02-30', '2026-01-01'), false);
  assert.equal(isPickableDay('2026-11-21', '2026-11-22'), false, 'no past days');
  assert.equal(isPickableDay('2026-11-22', '2026-11-22'), true);
});

test('match phase: ahead → tomorrow → today → review (3 days) → stale', () => {
  const today = '2026-11-22';
  assert.equal(matchPhase(null, today), 'none');
  assert.equal(matchPhase('2026-11-25', today), 'ahead');
  assert.equal(matchPhase('2026-11-23', today), 'tomorrow');
  assert.equal(matchPhase('2026-11-22', today), 'today');
  assert.equal(matchPhase('2026-11-19', today), 'review');
  assert.equal(matchPhase('2026-11-18', today), 'stale');
});

test('Coach note: chapter + next step, the match tomorrow, and nothing when there is nothing', () => {
  const today = '2026-11-22';
  const path = { finished: false, next: { chapterKey: 'bounce', stepKey: 'practise' } };
  const note = buildPathCoachSection({ path, match: { nextDay: '2026-11-23' } }, today);
  assert.match(note, /Path and next match \(internal\)/);
  assert.match(note, /Bounce back/);
  assert.match(note, /practise it once in the app/);
  assert.match(note, /only when it fits/);
  assert.match(note, /TOMORROW/);
  assert.match(note, /no "must win" talk/);
  assert.match(buildPathCoachSection({ path: null, match: { nextDay: '2026-11-20' } }, today), /ago and have not said how it went/);
  assert.equal(buildPathCoachSection({}, today), '');
  assert.equal(buildPathCoachSection({ path: { finished: true }, match: { nextDay: null } }, today), '');
});

function fakePrisma() {
  const db = { progress: null, steps: [] };
  return {
    db,
    startingPerformanceProfile: { findFirst: async () => ({ agreedPriorityId: 'after_mistake' }) },
    pathProgress: {
      findUnique: async () => db.progress && { ...db.progress },
      create: async ({ data }) => (db.progress = { ...data, startedAt: new Date('2026-11-01T00:00:00Z') }),
      update: async ({ data }) => Object.assign(db.progress, data),
    },
    pathStep: {
      findMany: async () => db.steps.map(s => ({ ...s })),
      upsert: async ({ where, create, update }) => {
        const k = where.userId_chapterKey_stepKey;
        const found = db.steps.find(s => s.chapterKey === k.chapterKey && s.stepKey === k.stepKey);
        if (found) Object.assign(found, update);
        else db.steps.push({ chapterKey: create.chapterKey, stepKey: create.stepKey, outcome: create.outcome, doneAt: new Date() });
      },
    },
    toolReport: { findMany: async () => [] },
    routine: { findFirst: async () => null },
    mindJournalEntry: { findMany: async () => [] },
  };
}

const SECRET = 'match-day-test-secret';
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

test('API: set, clear and review the match; "it helped" ticks the Play step', async () => {
  const prisma = fakePrisma();
  await withApp(createPathStore(prisma), async (base, auth) => {
    const put = (day) => fetch(`${base}/match`, { method: 'PUT', headers: auth, body: JSON.stringify({ day }) });
    const review = (b) => fetch(`${base}/match/review`, { method: 'POST', headers: auth, body: JSON.stringify(b) });

    assert.equal((await fetch(`${base}/match`, { method: 'PUT', body: '{}' })).status, 401);
    assert.equal((await put('soon')).status, 400);
    assert.equal((await put(addDays(indiaToday(), -2))).status, 400, 'a past day cannot be picked');

    const tomorrow = addDays(indiaToday(), 1);
    const set = await (await put(tomorrow)).json();
    assert.equal(set.match.nextDay, tomorrow);
    assert.equal((await review({ feel: 'well' })).status, 409, 'nothing to review before the match');

    const cleared = await (await put(null)).json();
    assert.equal(cleared.match.nextDay, null);

    // The match was yesterday (set directly — the API only takes future days).
    prisma.db.progress.nextMatchDay = addDays(indiaToday(), -1);
    assert.equal((await review({ feel: 'great' })).status, 400);
    const done = await (await review({ feel: 'mixed', used: 'helped' })).json();
    assert.equal(done.match.nextDay, null);
    assert.equal(done.match.lastFeel, 'mixed');
    const bounce = done.chapters.find(c => c.key === 'bounce');
    assert.equal(bounce.steps.play.done, true);
    assert.equal(bounce.steps.play.outcome, 'helped');
  });
});

test('API: "Forgot" or skipping clears the match without ticking anything', async () => {
  const prisma = fakePrisma();
  await withApp(createPathStore(prisma), async (base, auth) => {
    await fetch(base, { headers: auth });
    prisma.db.progress.nextMatchDay = addDays(indiaToday(), -1);
    const done = await (await fetch(`${base}/match/review`, { method: 'POST', headers: auth, body: JSON.stringify({ feel: null, used: 'forgot' }) })).json();
    assert.equal(done.match.nextDay, null);
    assert.equal(prisma.db.steps.some(s => s.stepKey === 'play'), false);
  });
});

test('chat wires the path note in, best-effort, after the other internal notes', () => {
  const src = require('fs').readFileSync(require('path').join(__dirname, '../src/routes/chat.js'), 'utf8');
  assert.match(src, /buildRoutineFocusSection\(focusRoutine\) \+ buildPathCoachSection\(pathContext \? \{ path: pathContext, match: pathContext\.match, plan: pathContext\.plan \} : \{\}\)/);
  assert.match(src, /createPathStore\(prisma\)\.getPath\(req\.userId\)\.catch\(/);
});

// ── Hook fix 3: play plan ─────────────────────────────────────────────────
const { planText } = require('../src/services/path/matchDay');

test('play plan text for Coach; the note includes the plan and the chapter', () => {
  assert.match(planText({ tool: 'rep', moment: 'after_miss', cue: 'Next ball' }), /after a miss: say their cue word "Next ball"/);
  assert.equal(planText({ tool: 'rep', moment: 'nope' }), null);
  const path = { finished: false, next: { chapterKey: 'focus', stepKey: 'play' }, plan: { tool: 'reset', moment: 'before_start' } };
  const note = buildPathCoachSection({ path, match: { nextDay: null } }, '2026-11-22');
  assert.match(note, /Focus/);
  assert.match(note, /play plan.*before they start/);
});

test('API: play plan is validated, screened, saved, and cleared by the match review', async () => {
  const prisma = fakePrisma();
  await withApp(createPathStore(prisma), async (base, auth) => {
    const put = (b) => fetch(`${base}/plan`, { method: 'PUT', headers: auth, body: JSON.stringify(b) });
    assert.equal((await put({ tool: 'rep', moment: 'whenever' })).status, 400);
    assert.equal((await put({ tool: 'rep', moment: 'after_miss' })).status, 400, 'a cue plan needs the cue');
    assert.equal((await put({ tool: 'rep', moment: 'after_miss', cue: 'x'.repeat(61) })).status, 400);
    const saved = await (await put({ tool: 'rep', moment: 'after_miss', cue: '  Next   ball ' })).json();
    assert.deepEqual({ tool: saved.plan.tool, moment: saved.plan.moment, cue: saved.plan.cue }, { tool: 'rep', moment: 'after_miss', cue: 'Next ball' });
    const reset = await (await put({ tool: 'reset', moment: 'before_start' })).json();
    assert.equal(reset.plan.tool, 'reset');

    prisma.db.progress.nextMatchDay = addDays(indiaToday(), -1);
    const done = await (await fetch(`${base}/match/review`, { method: 'POST', headers: auth, body: JSON.stringify({ feel: 'well', used: 'tried' }) })).json();
    assert.equal(done.plan, null, 'the plan was for that match');

    const cleared = await (await put({ plan: null })).json();
    assert.equal(cleared.plan, null);
  });
});
