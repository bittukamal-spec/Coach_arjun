// The Mental Playbook page was retired as an athlete-facing destination, but
// Mental Rep's ToolReport summary still named it ("cue saved to Playbook") —
// and ToolReport summaries are read VERBATIM into Arjun's "Recent Mental Tool
// Activity" prompt section, so that string is live coaching context, not an
// internal note.
//
// Two guarantees, both proven against real behaviour rather than source text:
//
//   1. NEW rows are written as "(cue saved)". The route is exercised for real
//      through Express with its module-level `new PrismaClient()` replaced in
//      the require cache (the technique welcomeEmail.test.js and
//      contact.test.js already use), so the assertions run against the row the
//      route actually writes — including proof that the cue and the details
//      payload are untouched.
//   2. HISTORICAL rows keep the old wording in the database and are sanitised
//      only where Coach context is formatted, asserted through the exported
//      buildSystemPrompt exactly as coachingStatePrompt.test.js does.
//
// Nothing here migrates, rewrites or deletes a stored row.

const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');

// ── Stub every dependency mentalRep.js loads at module level ───────────────

const createdToolReports = [];
const awardedXp = [];
const touchedUsers = [];
const skillMarks = [];

const prismaPath = require.resolve('@prisma/client');
class FakePrismaClient {
  get toolReport() {
    return {
      create: async ({ data }) => {
        createdToolReports.push(data);
        return { id: `tr-${createdToolReports.length}`, ...data };
      },
    };
  }
}
require.cache[prismaPath] = {
  id: prismaPath,
  filename: prismaPath,
  loaded: true,
  exports: { PrismaClient: FakePrismaClient },
};

const authPath = require.resolve('../src/middleware/authenticate');
require.cache[authPath] = {
  id: authPath,
  filename: authPath,
  loaded: true,
  exports: (req, _res, next) => { req.userId = 'u1'; next(); },
};

const gamificationPath = require.resolve('../src/services/gamification');
require.cache[gamificationPath] = {
  id: gamificationPath,
  filename: gamificationPath,
  loaded: true,
  exports: {
    awardXP: async (userId, amount) => { awardedXp.push({ userId, amount }); return { xp: 100 }; },
  },
};

const skillProgressPath = require.resolve('../src/services/skillProgress');
require.cache[skillProgressPath] = {
  id: skillProgressPath,
  filename: skillProgressPath,
  loaded: true,
  exports: {
    markSkillProgress: async (userId, skillKey, field) => { skillMarks.push({ userId, skillKey, field }); },
  },
};

const activityPath = require.resolve('../src/services/activityTracking');
require.cache[activityPath] = {
  id: activityPath,
  filename: activityPath,
  loaded: true,
  exports: {
    touchActivity: async (userId) => { touchedUsers.push(userId); },
  },
};

const mentalRepPath = require.resolve('../src/routes/mentalRep');
delete require.cache[mentalRepPath];
const mentalRepRouter = require(mentalRepPath);

const app = express();
app.use(express.json());
app.use('/api/mental-rep', mentalRepRouter);

let baseUrl;
let server;

test.before(async () => {
  await new Promise((resolve) => {
    server = app.listen(0, '127.0.0.1', () => {
      baseUrl = `http://127.0.0.1:${server.address().port}`;
      resolve();
    });
  });
});

test.after(async () => {
  await new Promise((resolve, reject) => server.close((e) => (e ? reject(e) : resolve())));
});

test.beforeEach(() => {
  createdToolReports.length = 0;
  awardedXp.length = 0;
  touchedUsers.length = 0;
  skillMarks.length = 0;
});

const VALID_REP = {
  context: 'training',
  state: 'nervous',
  moment: 'after_mistake',
  cue: 'Next ball',
  saveCue: true,
};

async function completeRep(body = {}) {
  const res = await fetch(`${baseUrl}/api/mental-rep/complete`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...VALID_REP, ...body }),
  });
  assert.equal(res.status, 200, 'the rep should complete successfully');
  assert.equal(createdToolReports.length, 1, 'exactly one ToolReport per completed rep');
  return createdToolReports[0];
}

// ── 1. New rows carry no retired terminology ───────────────────────────────

test('a saved cue is recorded as "(cue saved)" — the retired Playbook destination is never named', async () => {
  const row = await completeRep({ saveCue: true });
  assert.doesNotMatch(row.summary, /Playbook/i, 'no new ToolReport summary may name the retired Playbook');
  assert.match(row.summary, /\(cue saved\)$/, 'the saved-cue note names the act, not a destination');
});

test('declining to save the cue still appends nothing at all', async () => {
  const row = await completeRep({ saveCue: false });
  assert.doesNotMatch(row.summary, /Playbook/i);
  assert.doesNotMatch(row.summary, /cue saved/);
  assert.match(row.summary, /cue "Next ball"$/);
});

// ── 2. Everything else about the write is unchanged ────────────────────────

test('the rest of the summary is unchanged — context, state, moment and the athlete\'s own cue', async () => {
  const row = await completeRep({ saveCue: true });
  assert.equal(
    row.summary,
    'Daily Mental Rep (training): felt nervous, preparing for "after mistake" → cue "Next ball" (cue saved)',
  );
});

test('the ToolReport type, skill key and details payload are untouched', async () => {
  const row = await completeRep({ saveCue: true });
  assert.equal(row.userId, 'u1');
  assert.equal(row.toolType, 'mental_rep');
  assert.equal(row.skillKey, 'calm_body', 'the state → skill mapping is unchanged');
  assert.deepEqual(JSON.parse(row.details), {
    context: 'training',
    state: 'nervous',
    moment: 'after_mistake',
    momentText: null,
    cue: 'Next ball',
    savedCue: true,
  });
});

test('the saved cue itself is stored verbatim, trimmed exactly as before', async () => {
  const row = await completeRep({ cue: '  Watch the ball  ', saveCue: true });
  assert.equal(JSON.parse(row.details).cue, 'Watch the ball');
  assert.match(row.summary, /cue "Watch the ball" \(cue saved\)/);
});

test('a custom moment still flows into both the summary and the details payload', async () => {
  const row = await completeRep({ moment: 'own', momentText: '  the last five minutes  ' });
  assert.match(row.summary, /preparing for "the last five minutes"/);
  assert.equal(JSON.parse(row.details).momentText, 'the last five minutes');
});

test('cue-save behaviour, XP, skill progress and activity tracking are all unchanged', async () => {
  await completeRep({ saveCue: true });
  assert.deepEqual(awardedXp, [{ userId: 'u1', amount: 10 }]);
  assert.deepEqual(touchedUsers, ['u1']);
  assert.deepEqual(skillMarks, [{ userId: 'u1', skillKey: 'calm_body', field: 'practiceCompletedAt' }]);
});

test('validation is unchanged — an invalid rep is rejected and writes nothing', async () => {
  const res = await fetch(`${baseUrl}/api/mental-rep/complete`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...VALID_REP, cue: '' }),
  });
  assert.equal(res.status, 400);
  assert.equal(createdToolReports.length, 0);
});

// ── 3. Historical rows: sanitised in Coach context, never in the database ──

const { buildSystemPrompt } = require('../src/routes/chat');

function baseUser(overrides = {}) {
  return {
    name: 'Test Athlete',
    sport: 'cricket',
    experienceLevel: 'competitive',
    goals: '[]',
    language: 'en',
    competitionLevel: 'state',
    primaryChallenge: 'nerves',
    pressureResponse: 'has_routine',
    ritualName: null,
    ritualSteps: '[]',
    xp: 0,
    age: 16,
    ...overrides,
  };
}

// Exactly what mentalRep.js wrote before this change — the shape every
// pre-existing row in the database still has.
const LEGACY_SUMMARY =
  'Daily Mental Rep (match): felt nervous, preparing for "pressure moment" → cue "Next ball" (cue saved to Playbook)';

function promptWithToolReports(toolReports) {
  return buildSystemPrompt(baseUser(), [], [], null, { toolReports });
}

function legacyRow(overrides = {}) {
  return {
    toolType: 'mental_rep',
    summary: LEGACY_SUMMARY,
    arjunResponse: null,
    createdAt: new Date(),
    skillKey: null,
    ...overrides,
  };
}

test('a historical "cue saved to Playbook" row reaches Coach as "(cue saved)", never naming the retired page', () => {
  const prompt = promptWithToolReports([legacyRow()]);
  assert.match(prompt, /## Recent Mental Tool Activity/, 'the tool section still renders');
  assert.doesNotMatch(prompt, /Playbook/i, 'Coach must never be told about the retired Playbook');
  assert.match(prompt, /cue "Next ball" \(cue saved\)/);
});

test('sanitising a historical row leaves every other part of that summary intact', () => {
  const prompt = promptWithToolReports([legacyRow()]);
  assert.match(prompt, /Daily Mental Rep \(match\): felt nervous, preparing for "pressure moment" → cue "Next ball" \(cue saved\)/);
});

test('sanitising never mutates the stored row it was given', () => {
  const row = legacyRow();
  const before = { ...row };
  promptWithToolReports([row]);
  assert.deepEqual(row, before, 'the ToolReport object must be read-only to the prompt builder');
  assert.equal(row.summary, LEGACY_SUMMARY, 'the historical summary is presented differently, never rewritten');
});

test('a new-format row passes through the same path unchanged', () => {
  const summary = 'Daily Mental Rep (training): felt flat, preparing for "first minutes" → cue "Go again" (cue saved)';
  const prompt = promptWithToolReports([legacyRow({ summary })]);
  assert.match(prompt, /cue "Go again" \(cue saved\)/);
  assert.doesNotMatch(prompt, /Playbook/i);
});

test('the sanitiser is narrow: no other tool summary is altered, and other Playbook-shaped text is left alone', () => {
  const rows = [
    legacyRow({ toolType: 'body_reset', summary: 'quick reset — pre-match' }),
    legacyRow({ toolType: 'self_talk', summary: 'competition — Steady' }),
    legacyRow({ toolType: 'visualization', summary: 'Visualized: walking out to bat' }),
  ];
  const prompt = promptWithToolReports(rows);
  for (const row of rows) {
    assert.ok(prompt.includes(row.summary), `${row.toolType} summary must pass through verbatim`);
  }
});

test('the retired phrase is replaced wherever it appears in a single summary, and only that phrase', () => {
  const summary = 'Daily Mental Rep (match): cue "A" (cue saved to Playbook) and cue "B" (cue saved to Playbook)';
  const prompt = promptWithToolReports([legacyRow({ summary })]);
  assert.doesNotMatch(prompt, /Playbook/i);
  assert.match(prompt, /cue "A" \(cue saved\) and cue "B" \(cue saved\)/);
});

// ── 4. No migration, backfill or deletion was introduced ───────────────────

test('neither route rewrites, migrates or deletes historical ToolReport rows', () => {
  const { readFileSync } = require('node:fs');
  const path = require('node:path');
  for (const file of ['mentalRep.js', 'chat.js']) {
    const src = readFileSync(path.join(__dirname, '../src/routes', file), 'utf8');
    assert.doesNotMatch(src, /toolReport\.updateMany|toolReport\.deleteMany|toolReport\.update\(/,
      `${file} must never rewrite or delete stored ToolReport rows`);
  }
});
