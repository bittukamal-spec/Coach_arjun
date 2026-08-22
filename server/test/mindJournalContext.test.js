// loadMindJournalContext restricted Coach-contract + main-chat prompt wiring.
// Behavioral checks use an injected fake Prisma client
// (createLoadMindJournalContext); no real database. Prompt-wiring checks are
// source-text assertions on chat.js, matching safetyWiring.test.js style.

const test = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const path = require('node:path');

const {
  createLoadMindJournalContext,
  mapEntryForCoach,
  formatMindJournalContextLine,
  buildMindJournalContextSection,
  COACH_CONTEXT_SELECT,
  FORBIDDEN_COACH_KEYS,
  MAX_ENTRIES,
} = require('../src/services/mindJournal/loadMindJournalContext');

function makeFakeClient(usersById, entriesByUserId) {
  const store = entriesByUserId;
  let lastFindManyArgs = null;
  return {
    user: {
      findUnique: async ({ where }) => usersById[where.id] || null,
      // Used by consent-toggle tests that flip the in-memory flag.
      update: async ({ where, data }) => {
        usersById[where.id] = { ...(usersById[where.id] || {}), ...data };
        return usersById[where.id];
      },
    },
    mindJournalEntry: {
      findMany: async ({ where, orderBy, take, select }) => {
        lastFindManyArgs = { where, orderBy, take, select };
        let rows = (store[where.userId] || []).slice();
        if (orderBy?.createdAt === 'desc') rows = rows.sort((a, b) => b.createdAt - a.createdAt);
        if (take) rows = rows.slice(0, take);
        // Honour Prisma `select` so tests can prove restricted fields are not fetched.
        if (select) {
          rows = rows.map((row) => {
            const out = {};
            for (const key of Object.keys(select)) {
              if (select[key]) out[key] = row[key] ?? null;
            }
            return out;
          });
        }
        return rows;
      },
      delete: async ({ where }) => {
        for (const userId of Object.keys(store)) {
          const idx = store[userId].findIndex((e) => e.id === where.id);
          if (idx !== -1) {
            const [removed] = store[userId].splice(idx, 1);
            return removed;
          }
        }
        return null;
      },
    },
    __lastFindManyArgs: () => lastFindManyArgs,
    __store: store,
  };
}

// ── Consent ────────────────────────────────────────────────────────────────

test('consent false → loader returns no Journal context', async () => {
  const client = makeFakeClient({ u1: { mindJournalContextEnabled: false } }, {
    u1: [{ id: '1', userId: 'u1', entryType: 'QUICK_NOTE', states: ['calm'], note: null, createdAt: new Date() }],
  });
  const load = createLoadMindJournalContext(client);
  assert.equal(await load('u1'), null);
});

test('consent true → loader may return restricted entries', async () => {
  const client = makeFakeClient({ u2: { mindJournalContextEnabled: true } }, {
    u2: [{
      id: '1', userId: 'u2', entryType: 'QUICK_NOTE', states: ['calm'], customState: null,
      note: 'ok', createdAt: new Date(), whatHappened: 'SECRET',
    }],
  });
  const load = createLoadMindJournalContext(client);
  const result = await load('u2');
  assert.equal(result.length, 1);
  assert.equal(result[0].entryType, 'QUICK_NOTE');
});

test('enabled preference with no entries yet also returns null', async () => {
  const client = makeFakeClient({ uEmpty: { mindJournalContextEnabled: true } }, {});
  const load = createLoadMindJournalContext(client);
  assert.equal(await load('uEmpty'), null);
});

test('toggling consent false stops future context without deleting entries', async () => {
  const users = { uToggle: { mindJournalContextEnabled: true } };
  const store = {
    uToggle: [{
      id: 'keep-me', userId: 'uToggle', entryType: 'QUICK_NOTE', states: ['tired'],
      customState: null, note: 'stay', createdAt: new Date(),
    }],
  };
  const client = makeFakeClient(users, store);
  const load = createLoadMindJournalContext(client);
  assert.equal((await load('uToggle')).length, 1);

  users.uToggle.mindJournalContextEnabled = false;
  assert.equal(await load('uToggle'), null);
  assert.equal(store.uToggle.length, 1, 'entries must remain when consent is toggled off');
});

// ── Latest five ────────────────────────────────────────────────────────────

test('six+ entries → exactly latest five, newest-first', async () => {
  const now = Date.now();
  const entries = Array.from({ length: 8 }, (_, i) => ({
    id: `e${i}`, userId: 'u3', entryType: 'QUICK_NOTE', states: ['calm'], customState: null,
    note: `note ${i}`, createdAt: new Date(now - i * 1000 * 60),
  }));
  const client = makeFakeClient({ u3: { mindJournalContextEnabled: true } }, { u3: entries });
  const load = createLoadMindJournalContext(client);
  const result = await load('u3');
  assert.equal(result.length, 5);
  assert.equal(MAX_ENTRIES, 5);
  assert.equal(result[0].note, 'note 0');
  assert.equal(result[4].note, 'note 4');
});

test('another athlete\'s entries are never included', async () => {
  const client = makeFakeClient(
    { u4: { mindJournalContextEnabled: true }, u5: { mindJournalContextEnabled: true } },
    {
      u4: [{ id: 'a', userId: 'u4', entryType: 'QUICK_NOTE', states: ['calm'], customState: null, note: 'mine', createdAt: new Date() }],
      u5: [{ id: 'b', userId: 'u5', entryType: 'QUICK_NOTE', states: ['tired'], customState: null, note: 'not mine', createdAt: new Date() }],
    }
  );
  const load = createLoadMindJournalContext(client);
  const result = await load('u4');
  assert.equal(result.length, 1);
  assert.equal(result[0].note, 'mine');
});

// ── Quick Note mapping ─────────────────────────────────────────────────────

test('QUICK_NOTE Coach mapping includes only allowed fields', async () => {
  const client = makeFakeClient({ uqn: { mindJournalContextEnabled: true } }, {
    uqn: [{
      id: 'qn1', userId: 'uqn', entryType: 'QUICK_NOTE',
      states: ['focused', 'nervous'], customState: 'Match-day wired', note: 'held my rhythm',
      contextType: 'TRAINING', customContext: 'should-not-appear',
      whatHappened: 'SECRET_H', whatNoticed: 'SECRET_N', helpedOrGotInWay: 'SECRET_W',
      takeForward: 'SECRET_T', createdAt: new Date('2026-08-01T10:00:00.000Z'),
    }],
  });
  const load = createLoadMindJournalContext(client);
  const [row] = await load('uqn');
  assert.deepEqual(Object.keys(row).sort(), ['createdAt', 'customState', 'entryType', 'note', 'states']);
  assert.equal(row.entryType, 'QUICK_NOTE');
  assert.deepEqual(row.states, ['focused', 'nervous']);
  assert.equal(row.customState, 'Match-day wired');
  assert.equal(row.note, 'held my rhythm');
  for (const key of ['contextType', 'customContext', 'whatHappened', 'whatNoticed', 'helpedOrGotInWay', 'takeForward', 'id']) {
    assert.equal(Object.prototype.hasOwnProperty.call(row, key), false, `${key} must be absent`);
  }
});

// ── Guided Reflection mapping ──────────────────────────────────────────────

test('GUIDED_REFLECTION Coach mapping includes allowed fields and excludes narratives/note', async () => {
  const client = makeFakeClient({ ugr: { mindJournalContextEnabled: true } }, {
    ugr: [{
      id: 'gr1', userId: 'ugr', entryType: 'GUIDED_REFLECTION',
      contextType: 'SOMETHING_ELSE', customContext: 'selection trial',
      states: ['nervous'], customState: 'match tension',
      takeForward: 'breathe first',
      note: 'MUST_NOT_APPEAR',
      whatHappened: 'lost the opener', whatNoticed: 'jaw tight', helpedOrGotInWay: 'slow breath',
      createdAt: new Date('2026-08-02T10:00:00.000Z'),
    }],
  });
  const load = createLoadMindJournalContext(client);
  const [row] = await load('ugr');
  assert.deepEqual(Object.keys(row).sort(), [
    'contextType', 'createdAt', 'customContext', 'customState', 'entryType', 'states', 'takeForward',
  ]);
  assert.equal(row.entryType, 'GUIDED_REFLECTION');
  assert.equal(row.contextType, 'SOMETHING_ELSE');
  assert.equal(row.customContext, 'selection trial');
  assert.deepEqual(row.states, ['nervous']);
  assert.equal(row.customState, 'match tension');
  assert.equal(row.takeForward, 'breathe first');
  for (const key of ['note', 'whatHappened', 'whatNoticed', 'helpedOrGotInWay', 'id']) {
    assert.equal(Object.prototype.hasOwnProperty.call(row, key), false, `${key} must be absent`);
  }
});

// ── Legacy ─────────────────────────────────────────────────────────────────

test('legacy null entryType maps conservatively to states/note/createdAt only', () => {
  const mapped = mapEntryForCoach({
    entryType: null, states: ['tired'], note: 'long week', createdAt: new Date('2026-07-30'),
    customState: 'ignore-me', customContext: 'ignore-me', contextType: 'TRAINING',
    takeForward: 'ignore-me', whatHappened: 'ignore-me',
  });
  assert.deepEqual(Object.keys(mapped).sort(), ['createdAt', 'entryType', 'note', 'states']);
  assert.equal(mapped.entryType, null);
  assert.deepEqual(mapped.states, ['tired']);
  assert.equal(mapped.note, 'long week');
  assert.equal(Object.prototype.hasOwnProperty.call(mapped, 'customState'), false);
  assert.equal(Object.prototype.hasOwnProperty.call(mapped, 'customContext'), false);
  assert.equal(Object.prototype.hasOwnProperty.call(mapped, 'takeForward'), false);
  assert.equal(Object.prototype.hasOwnProperty.call(mapped, 'contextType'), false);
});

test('legacy null-entryType row loads without crashing', async () => {
  const client = makeFakeClient({ uleg: { mindJournalContextEnabled: true } }, {
    uleg: [{
      id: 'leg1', userId: 'uleg', entryType: null, states: ['calm'], note: 'old entry',
      createdAt: new Date(), whatHappened: 'SECRET',
    }],
  });
  const load = createLoadMindJournalContext(client);
  const [row] = await load('uleg');
  assert.equal(row.entryType, null);
  assert.equal(row.note, 'old entry');
  assert.equal(Object.prototype.hasOwnProperty.call(row, 'whatHappened'), false);
});

// ── Privacy / Prisma selection ─────────────────────────────────────────────

test('Prisma select omits restricted narrative fields', async () => {
  const client = makeFakeClient({ usel: { mindJournalContextEnabled: true } }, {
    usel: [{
      id: 's1', userId: 'usel', entryType: 'GUIDED_REFLECTION', contextType: 'TRAINING',
      states: ['calm'], customState: null, customContext: null, takeForward: 'keep warm-up',
      note: null, whatHappened: 'SECRET', whatNoticed: 'SECRET', helpedOrGotInWay: 'SECRET',
      createdAt: new Date(),
    }],
  });
  const load = createLoadMindJournalContext(client);
  await load('usel');
  const args = client.__lastFindManyArgs();
  assert.deepEqual(args.select, COACH_CONTEXT_SELECT);
  assert.equal(args.select.whatHappened, undefined);
  assert.equal(args.select.whatNoticed, undefined);
  assert.equal(args.select.helpedOrGotInWay, undefined);
  assert.equal(Object.prototype.hasOwnProperty.call(args.select, 'whatHappened'), false);
});

test('loader output never contains forbidden Coach keys', async () => {
  const client = makeFakeClient({ uforb: { mindJournalContextEnabled: true } }, {
    uforb: [{
      id: 'f1', userId: 'uforb', entryType: 'GUIDED_REFLECTION', contextType: 'COMPETITION',
      states: ['nervous'], customState: 'wired', customContext: null, takeForward: 'breathe',
      note: 'n', whatHappened: 'h', whatNoticed: 'n2', helpedOrGotInWay: 'w',
      createdAt: new Date(), score: 99,
    }],
  });
  const load = createLoadMindJournalContext(client);
  const [row] = await load('uforb');
  for (const key of FORBIDDEN_COACH_KEYS) {
    assert.equal(Object.prototype.hasOwnProperty.call(row, key), false, `${key} must not appear`);
  }
});

test('the service makes no query against MentalFitnessEntry and adds no console logging of athlete text', () => {
  const src = readFileSync(path.join(__dirname, '../src/services/mindJournal/loadMindJournalContext.js'), 'utf8');
  assert.doesNotMatch(src, /mentalFitnessEntry/i);
  assert.doesNotMatch(src, /console\.(log|info|debug|warn|error)\(/);
});

// ── Deletion ───────────────────────────────────────────────────────────────

test('deleted entry is absent from the next context load', async () => {
  const store = {
    udel: [{
      id: 'del-1', userId: 'udel', entryType: 'QUICK_NOTE', states: ['calm'], customState: null,
      note: 'before delete', createdAt: new Date(),
    }],
  };
  const client = makeFakeClient({ udel: { mindJournalContextEnabled: true } }, store);
  const load = createLoadMindJournalContext(client);
  assert.equal((await load('udel'))[0].note, 'before delete');

  await client.mindJournalEntry.delete({ where: { id: 'del-1' } });
  assert.equal(await load('udel'), null);
});

// ── Prompt formatting ──────────────────────────────────────────────────────

test('consent off / empty → no Mind Journal prompt section', () => {
  assert.equal(buildMindJournalContextSection(null), '');
  assert.equal(buildMindJournalContextSection([]), '');
});

test('Quick Note prompt line contains only allowed user-facing information', () => {
  const line = formatMindJournalContextLine({
    entryType: 'QUICK_NOTE',
    states: ['calm', 'focused'],
    customState: 'Match-day wired',
    note: 'held my rhythm',
    createdAt: new Date('2026-08-01T10:00:00.000Z'),
  });
  assert.match(line, /Quick Note/);
  assert.match(line, /states: calm, focused/);
  assert.match(line, /custom state: "Match-day wired"/);
  assert.match(line, /note: "held my rhythm"/);
  assert.doesNotMatch(line, /whatHappened|whatNoticed|helpedOrGotInWay|take forward|TRAINING|SOMETHING_ELSE/i);
});

test('Guided prompt line may include context/customContext/states/customState/takeForward but not narratives', () => {
  const withCustom = formatMindJournalContextLine({
    entryType: 'GUIDED_REFLECTION',
    contextType: 'SOMETHING_ELSE',
    customContext: 'selection trial',
    states: ['nervous'],
    customState: 'match tension',
    takeForward: 'breathe first',
    createdAt: new Date('2026-08-02T10:00:00.000Z'),
  });
  assert.match(withCustom, /Guided Reflection/);
  assert.match(withCustom, /context: "selection trial"/);
  assert.doesNotMatch(withCustom, /Something else|SOMETHING_ELSE/);
  assert.match(withCustom, /custom state: "match tension"/);
  assert.match(withCustom, /take forward: "breathe first"/);
  assert.doesNotMatch(withCustom, /whatHappened|whatNoticed|helpedOrGotInWay|note:/i);

  const withEnum = formatMindJournalContextLine({
    entryType: 'GUIDED_REFLECTION',
    contextType: 'TRAINING',
    customContext: null,
    states: ['calm'],
    customState: null,
    takeForward: null,
    createdAt: new Date('2026-08-02T10:00:00.000Z'),
  });
  assert.match(withEnum, /context: TRAINING/);
  assert.doesNotMatch(withEnum, /take forward|custom state|note:/);
});

test('athlete-written customState/customContext are preserved verbatim and not translated', () => {
  const line = formatMindJournalContextLine({
    entryType: 'GUIDED_REFLECTION',
    contextType: 'SOMETHING_ELSE',
    customContext: 'चयन ट्रायल',
    states: [],
    customState: 'भारी पैर',
    takeForward: null,
    createdAt: new Date('2026-08-03T00:00:00.000Z'),
  });
  assert.match(line, /चयन ट्रायल/);
  assert.match(line, /भारी पैर/);
});

test('prompt section labels Journal as background and forbids auto-prescribe / loop skip', () => {
  const section = buildMindJournalContextSection([{
    entryType: 'QUICK_NOTE', states: ['calm'], customState: null, note: null,
    createdAt: new Date('2026-08-01'),
  }]);
  assert.match(section, /background context only/i);
  assert.match(section, /not a diagnosis/i);
  assert.match(section, /not readiness/i);
  assert.match(section, /normal coaching loop/i);
  assert.match(section, /automatically prescribe a Mental Rep/i);
  assert.match(section, /Do not skip focused questions/i);
  assert.match(section, /not required to mention the journal/i);
  assert.doesNotMatch(section, /you must mention|always prescribe|proven pattern|objectively ready/i);
});

// ── Source contract: prevent accidental expansion ──────────────────────────

test('source contract: loader must not reference restricted narrative fields in mapping/select', () => {
  const src = readFileSync(path.join(__dirname, '../src/services/mindJournal/loadMindJournalContext.js'), 'utf8');
  // Allowed mentions are only in comments naming the exclusion — the select
  // object and mapEntryForCoach bodies must not include these keys as data.
  const selectBlock = src.slice(src.indexOf('const COACH_CONTEXT_SELECT'), src.indexOf('};', src.indexOf('const COACH_CONTEXT_SELECT')) + 2);
  assert.doesNotMatch(selectBlock, /whatHappened|whatNoticed|helpedOrGotInWay/);

  const mapBlock = src.slice(src.indexOf('function mapEntryForCoach'), src.indexOf('function formatMindJournalContextLine'));
  assert.doesNotMatch(mapBlock, /whatHappened|whatNoticed|helpedOrGotInWay/);
  // Guided branch must not attach note.
  const guidedReturn = mapBlock.slice(mapBlock.indexOf("entryType === 'GUIDED_REFLECTION'"), mapBlock.indexOf("entryType === 'QUICK_NOTE'"));
  assert.doesNotMatch(guidedReturn, /\bnote\b/);
});

// ── Main-chat prompt wiring (source-text) ──────────────────────────────────

test('chat.js loads loadMindJournalContext only inside the main (non-quick) coaching path', () => {
  const src = readFileSync(path.join(__dirname, '../src/routes/chat.js'), 'utf8');
  assert.match(src, /require\('\.\.\/services\/mindJournal\/loadMindJournalContext'\)/);

  const mainPathIdx = src.indexOf('const coachingContext = await loadCoachingContext(req.userId);');
  const loadCallIdx = src.indexOf('const mindJournalEntries = await loadMindJournalContext(req.userId);');
  assert.ok(mainPathIdx !== -1 && loadCallIdx !== -1);
  assert.ok(loadCallIdx > mainPathIdx, 'mind journal context must load in the same main-chat block as coachingContext');

  const quickChatBlockStart = src.indexOf('Dormant Quick Chat path');
  const quickChatBlockEnd = src.indexOf('return;', quickChatBlockStart);
  const quickChatBlock = src.slice(quickChatBlockStart, quickChatBlockEnd);
  assert.doesNotMatch(quickChatBlock, /loadMindJournalContext/);
});

test('chat.js uses the shared buildMindJournalContextSection from the loader module (no local duplicate formatter)', () => {
  const src = readFileSync(path.join(__dirname, '../src/routes/chat.js'), 'utf8');
  assert.match(src, /buildMindJournalContextSection/);
  assert.doesNotMatch(src, /function buildMindJournalContextSection/);
  assert.doesNotMatch(src, /function formatMindJournalContextLine/);
  assert.match(src, /const mindJournalSection = buildMindJournalContextSection\(mindJournalEntries\);/);
  assert.match(src, /const extraSections = \[coachingStateSection, patternSection, mindJournalSection, reflectionSection\]\.filter\(Boolean\)\.join\('\\n\\n'\);/);
});

test('the Mind Journal section is still omitted when entries are absent', () => {
  const src = readFileSync(path.join(__dirname, '../src/services/mindJournal/loadMindJournalContext.js'), 'utf8');
  assert.match(src, /function buildMindJournalContextSection\(mindJournalEntries\)/);
  assert.match(src, /if \(!mindJournalEntries \|\| !mindJournalEntries\.length\) return '';/);
});

test('mindJournalEntries is never threaded into profile-intro, weekly reports, visualization, self-talk, body reset, or debrief routes', () => {
  const routesDir = path.join(__dirname, '../src/routes');
  for (const file of ['profileIntro.js', 'weeklyReports.js', 'chat.js', 'selfTalk.js', 'bodyReset.js', 'debrief.js']) {
    const src = readFileSync(path.join(routesDir, file), 'utf8');
    if (file === 'chat.js') continue;
    assert.doesNotMatch(src, /loadMindJournalContext|mindJournalEntries/, `${file} must not load Mind Journal context`);
  }
});
