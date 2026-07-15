// loadMindJournalContext behavior + main-chat prompt wiring (section G).
// Behavioral checks use an injected fake Prisma client (createLoadMindJournalContext),
// no real database. Prompt-wiring checks are source-text assertions on
// chat.js, matching the established pattern (safetyWiring.test.js etc.).

const test = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const path = require('node:path');

const { createLoadMindJournalContext } = require('../src/services/mindJournal/loadMindJournalContext');

function makeFakeClient(usersById, entriesByUserId) {
  return {
    user: {
      findUnique: async ({ where }) => usersById[where.id] || null,
    },
    mindJournalEntry: {
      findMany: async ({ where, orderBy, take }) => {
        let rows = (entriesByUserId[where.userId] || []).slice();
        if (orderBy?.createdAt === 'desc') rows = rows.sort((a, b) => b.createdAt - a.createdAt);
        if (take) rows = rows.slice(0, take);
        return rows;
      },
    },
  };
}

test('disabled context preference returns null (no prompt section)', async () => {
  const client = makeFakeClient({ u1: { mindJournalContextEnabled: false } }, {
    u1: [{ id: '1', userId: 'u1', states: ['calm'], note: null, createdAt: new Date() }],
  });
  const loadMindJournalContext = createLoadMindJournalContext(client);
  const result = await loadMindJournalContext('u1');
  assert.equal(result, null);
});

test('enabled preference with no entries yet also returns null', async () => {
  const client = makeFakeClient({ u2: { mindJournalContextEnabled: true } }, {});
  const loadMindJournalContext = createLoadMindJournalContext(client);
  const result = await loadMindJournalContext('u2');
  assert.equal(result, null);
});

test('enabled preference loads at most the latest 5 entries, newest first', async () => {
  const now = Date.now();
  const entries = Array.from({ length: 8 }, (_, i) => ({
    id: `e${i}`, userId: 'u3', states: ['calm'], note: `note ${i}`,
    createdAt: new Date(now - i * 1000 * 60), // e0 is newest
  }));
  const client = makeFakeClient({ u3: { mindJournalContextEnabled: true } }, { u3: entries });
  const loadMindJournalContext = createLoadMindJournalContext(client);
  const result = await loadMindJournalContext('u3');
  assert.equal(result.length, 5);
  assert.equal(result[0].note, 'note 0');
  assert.equal(result[4].note, 'note 4');
});

test('another athlete\'s entries are never included', async () => {
  const client = makeFakeClient(
    { u4: { mindJournalContextEnabled: true }, u5: { mindJournalContextEnabled: true } },
    {
      u4: [{ id: 'a', userId: 'u4', states: ['calm'], note: 'mine', createdAt: new Date() }],
      u5: [{ id: 'b', userId: 'u5', states: ['tired'], note: 'not mine', createdAt: new Date() }],
    }
  );
  const loadMindJournalContext = createLoadMindJournalContext(client);
  const result = await loadMindJournalContext('u4');
  assert.equal(result.length, 1);
  assert.equal(result[0].note, 'mine');
});

test('the returned shape is limited to states, note, createdAt (no score/rating field of any kind)', async () => {
  const client = makeFakeClient({ u6: { mindJournalContextEnabled: true } }, {
    u6: [{ id: 'x', userId: 'u6', states: ['focused', 'nervous'], note: 'ok', createdAt: new Date(), score: 99 }],
  });
  const loadMindJournalContext = createLoadMindJournalContext(client);
  const result = await loadMindJournalContext('u6');
  assert.deepEqual(Object.keys(result[0]).sort(), ['createdAt', 'note', 'states']);
});

test('the service makes no query against MentalFitnessEntry', () => {
  const src = readFileSync(path.join(__dirname, '../src/services/mindJournal/loadMindJournalContext.js'), 'utf8');
  assert.doesNotMatch(src, /mentalFitnessEntry/i);
});

// ── Main-chat prompt wiring (source-text, matches safetyWiring.test.js style) ─

test('chat.js loads loadMindJournalContext only inside the main (non-quick) coaching path', () => {
  const src = readFileSync(path.join(__dirname, '../src/routes/chat.js'), 'utf8');
  assert.match(src, /require\('\.\.\/services\/mindJournal\/loadMindJournalContext'\)/);

  const mainPathIdx = src.indexOf('const coachingContext = await loadCoachingContext(req.userId);');
  const loadCallIdx = src.indexOf('const mindJournalEntries = await loadMindJournalContext(req.userId);');
  assert.ok(mainPathIdx !== -1 && loadCallIdx !== -1);
  assert.ok(loadCallIdx > mainPathIdx, 'mind journal context must load in the same main-chat block as coachingContext');

  // The dormant Quick Chat branch (its own early return above) must not
  // reference loadMindJournalContext at all.
  const quickChatBlockStart = src.indexOf('Dormant Quick Chat path');
  const quickChatBlockEnd = src.indexOf('return;', quickChatBlockStart);
  const quickChatBlock = src.slice(quickChatBlockStart, quickChatBlockEnd);
  assert.doesNotMatch(quickChatBlock, /loadMindJournalContext/);
});

test('buildSystemPrompt includes the labelled Mind Journal section only when entries are present, and omits it otherwise', () => {
  const src = readFileSync(path.join(__dirname, '../src/routes/chat.js'), 'utf8');
  assert.match(src, /## Optional Mind Journal Context — athlete opted in/);
  assert.match(src, /function buildMindJournalContextSection\(mindJournalEntries\)/);
  const fnIdx = src.indexOf('function buildMindJournalContextSection');
  const fnBlock = src.slice(fnIdx, src.indexOf('\n}\n', fnIdx));
  assert.match(fnBlock, /if \(!mindJournalEntries \|\| !mindJournalEntries\.length\) return '';/);
});

test('the Mind Journal prompt section instructs against scoring, diagnosis, barrier proof, auto-prescription, and gating, and states current chat takes priority', () => {
  const src = readFileSync(path.join(__dirname, '../src/routes/chat.js'), 'utf8');
  const fnIdx = src.indexOf('function buildMindJournalContextSection');
  const fnBlock = src.slice(fnIdx, src.indexOf('\n}\n', fnIdx));
  assert.match(fnBlock, /calculate or infer a score/i);
  assert.match(fnBlock, /diagnose or profile/i);
  assert.match(fnBlock, /proof of a barrier/i);
  assert.match(fnBlock, /automatically prescribe a Mental Rep/i);
  assert.match(fnBlock, /gate any feature/i);
  assert.match(fnBlock, /ask the athlete directly/i);
  assert.match(fnBlock, /takes priority over this context/i);
  assert.match(fnBlock, /objectively good or bad/i);
});

test('the Mind Journal section is folded into extraSections alongside the other optional coaching sections (never a standalone always-on block)', () => {
  const src = readFileSync(path.join(__dirname, '../src/routes/chat.js'), 'utf8');
  assert.match(src, /const mindJournalSection = buildMindJournalContextSection\(mindJournalEntries\);/);
  assert.match(src, /const extraSections = \[coachingStateSection, quickReplySection, patternSection, mindJournalSection\]\.filter\(Boolean\)\.join\('\\n\\n'\);/);
});

test('mindJournalEntries is never threaded into profile-intro, weekly reports, visualization, self-talk, body reset, or debrief routes', () => {
  const routesDir = path.join(__dirname, '../src/routes');
  for (const file of ['profileIntro.js', 'weeklyReports.js', 'chat.js', 'selfTalk.js', 'bodyReset.js', 'debrief.js']) {
    const src = readFileSync(path.join(routesDir, file), 'utf8');
    if (file === 'chat.js') continue; // chat.js legitimately references it in the main-chat path only, checked above
    assert.doesNotMatch(src, /loadMindJournalContext|mindJournalEntries/, `${file} must not load Mind Journal context`);
  }
});
