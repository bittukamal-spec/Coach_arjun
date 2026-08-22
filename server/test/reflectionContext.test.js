// The single reflection-context pipeline (PR 2 cutover + amendment).
//
// One consent gate, one chronology across every source, one total cap of ten
// records, one prompt section, and no reflection described twice.
// Behavioural checks run against an injected fake Prisma client; prompt
// wiring is asserted as source text on chat.js.

const test = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const path = require('node:path');

const {
  createLoadReflectionContext,
  buildReflectionContextSection,
  mergeReflectionContext,
  formatLegacyReflectionLine,
  mapLegacyDebrief,
  LEGACY_DEBRIEF_SELECT,
  FORBIDDEN_LEGACY_KEYS,
  MAX_TOTAL_ENTRIES,
  SOURCE_REFLECTION,
  SOURCE_JOURNAL,
  SOURCE_LEGACY_DEBRIEF,
} = require('../src/services/mindJournal/loadReflectionContext');
const {
  FORBIDDEN_HISTORY_KEYS,
  HISTORY_SELECT,
} = require('../src/services/mindJournal/buildReflectionHistoryWindow');
const { COACH_CONTEXT_SELECT, FORBIDDEN_COACH_KEYS } =
  require('../src/services/mindJournal/loadMindJournalContext');

const chatSrc = readFileSync(path.join(__dirname, '../src/routes/chat.js'), 'utf8');

// ── Fake client ────────────────────────────────────────────────────────────

function makeFakeClient(usersById, journalRows = {}, debriefRows = {}) {
  const calls = { reflection: null, journal: null, debrief: null };
  return {
    user: {
      findUnique: async ({ where }) => usersById[where.id] || null,
      // Used by the consent-toggle test, which flips the flag in place.
      update: async ({ where, data }) => {
        usersById[where.id] = { ...(usersById[where.id] || {}), ...data };
        return usersById[where.id];
      },
    },
    mindJournalEntry: {
      findMany: async ({ where, orderBy, take, select }) => {
        const isReflection = where.entryType === 'REFLECTION';
        calls[isReflection ? 'reflection' : 'journal'] = { where, orderBy, take, select };
        let rows = (journalRows[where.userId] || []).filter((r) =>
          (isReflection ? r.entryType === 'REFLECTION' : r.entryType !== 'REFLECTION'));
        if (orderBy?.createdAt === 'desc') rows = rows.slice().sort((a, b) => b.createdAt - a.createdAt);
        if (take) rows = rows.slice(0, take);
        return rows.map((row) => project(row, select));
      },
    },
    debrief: {
      findMany: async ({ where, orderBy, take, select }) => {
        calls.debrief = { where, orderBy, take, select };
        let rows = (debriefRows[where.userId] || []).slice();
        if (orderBy?.createdAt === 'desc') rows = rows.sort((a, b) => b.createdAt - a.createdAt);
        if (take) rows = rows.slice(0, take);
        return rows.map((row) => project(row, select));
      },
    },
    __calls: calls,
    // Mirrors an athlete deleting one journal entry.
    __removeJournalEntry: (userId, id) => {
      journalRows[userId] = (journalRows[userId] || []).filter((r) => r.id !== id);
    },
  };
}

// Honour Prisma `select` so a test can prove a column is never fetched.
function project(row, select) {
  if (!select) return row;
  const out = {};
  for (const k of Object.keys(select)) if (select[k]) out[k] = row[k] ?? null;
  return out;
}

const day = (n) => new Date(Date.UTC(2026, 6, n));

const reflection = (n, extra = {}) => ({
  id: `r${n}`, userId: 'u', entryType: 'REFLECTION', contextType: 'TRAINING',
  eventTags: ['a_full_session'], states: ['calm'], thoughtTags: ['knew_what_to_do'],
  responseTags: ['kept_going'], bodyTags: [], cueFeedback: null,
  arjunTakeaway: `takeaway ${n}`, createdAt: day(n), ...extra,
});

const quickNote = (n, extra = {}) => ({
  id: `q${n}`, userId: 'u', entryType: 'QUICK_NOTE', states: ['tired'],
  customState: null, note: `note ${n}`, contextType: null, customContext: null,
  takeForward: null, whatHappened: 'SECRET_H', whatNoticed: 'SECRET_N',
  helpedOrGotInWay: 'SECRET_W', createdAt: day(n), ...extra,
});

const guided = (n, extra = {}) => ({
  id: `g${n}`, userId: 'u', entryType: 'GUIDED_REFLECTION', contextType: 'COMPETITION',
  customContext: null, states: ['nervous'], customState: null, note: 'MUST_NOT_APPEAR',
  takeForward: `take forward ${n}`, whatHappened: 'SECRET_H', whatNoticed: 'SECRET_N',
  helpedOrGotInWay: 'SECRET_W', createdAt: day(n), ...extra,
});

const debriefRow = (n, extra = {}) => ({
  id: `d${n}`, userId: 'u', wentWell: `went well ${n}`, doDifferently: `do differently ${n}`,
  nextFocus: `next focus ${n}`, arjunInsight: 'internal insight', eventType: 'Trial',
  xpAwarded: 20, createdAt: day(n), ...extra,
});

const enabled = { u: { mindJournalContextEnabled: true } };

// ── Consent: one gate for every source ─────────────────────────────────────

test('consent off → no source contributes, and nothing is even queried', async () => {
  const client = makeFakeClient(
    { u: { mindJournalContextEnabled: false } },
    { u: [reflection(5), quickNote(4), guided(3)] },
    { u: [debriefRow(2)] },
  );
  assert.equal(await createLoadReflectionContext(client)('u'), null);
  assert.deepEqual(client.__calls, { reflection: null, journal: null, debrief: null });
});

test('consent off is the default — an athlete who never touched the toggle gets nothing', async () => {
  const client = makeFakeClient({ u: {} }, { u: [reflection(5)] }, { u: [debriefRow(4)] });
  assert.equal(await createLoadReflectionContext(client)('u'), null);
});

test('consent on with no eligible records anywhere → null, so no empty section is built', async () => {
  const client = makeFakeClient(enabled, { u: [] }, { u: [] });
  assert.equal(await createLoadReflectionContext(client)('u'), null);
});

test('turning consent off again stops future context without deleting anything', async () => {
  const users = { u: { mindJournalContextEnabled: true } };
  const client = makeFakeClient(users, { u: [reflection(5), quickNote(4)] }, { u: [debriefRow(3)] });
  const load = createLoadReflectionContext(client);
  assert.equal((await load('u')).length, 3);

  await client.user.update({ where: { id: 'u' }, data: { mindJournalContextEnabled: false } });
  assert.equal(await load('u'), null, 'context stops immediately');

  await client.user.update({ where: { id: 'u' }, data: { mindJournalContextEnabled: true } });
  assert.equal((await load('u')).length, 3, 'and the records were still there all along');
});

test("another athlete's records are never included, from any source", async () => {
  const client = makeFakeClient(
    { me: { mindJournalContextEnabled: true }, them: { mindJournalContextEnabled: true } },
    { me: [reflection(5, { userId: 'me' })], them: [reflection(9, { id: 'rX', userId: 'them' })] },
    { me: [debriefRow(4, { userId: 'me' })], them: [debriefRow(8, { id: 'dX', userId: 'them' })] },
  );
  const items = await createLoadReflectionContext(client)('me');
  assert.equal(items.length, 2);
  assert.ok(items.every((i) => new Date(i.createdAt) <= day(5)), "nothing from the other athlete's newer rows");
  for (const key of ['reflection', 'journal', 'debrief']) {
    assert.equal(client.__calls[key].where.userId, 'me', `${key} query must be scoped to the caller`);
  }
});

test('a deleted entry is absent from the next context load', async () => {
  const client = makeFakeClient(enabled, { u: [reflection(5), quickNote(4)] }, { u: [] });
  const load = createLoadReflectionContext(client);
  assert.equal((await load('u')).length, 2);
  client.__removeJournalEntry('u', 'q4');
  const items = await load('u');
  assert.equal(items.length, 1);
  assert.equal(items[0].source, SOURCE_REFLECTION);
});

// ── Every source participates, in one chronology ───────────────────────────

test('consent on → new reflections, older Mind Journal entries and legacy Debriefs all participate', async () => {
  const client = makeFakeClient(enabled, { u: [reflection(5), quickNote(4), guided(3)] }, { u: [debriefRow(2)] });
  const items = await createLoadReflectionContext(client)('u');
  assert.deepEqual(items.map((i) => i.source), [
    SOURCE_REFLECTION, SOURCE_JOURNAL, SOURCE_JOURNAL, SOURCE_LEGACY_DEBRIEF,
  ]);
});

test('the combined history is ordered by actual entry date across source types', async () => {
  const client = makeFakeClient(
    enabled,
    { u: [reflection(2), quickNote(8), guided(5)] },
    { u: [debriefRow(9), debriefRow(6)] },
  );
  const items = await createLoadReflectionContext(client)('u');
  assert.deepEqual(
    items.map((i) => new Date(i.createdAt).toISOString().slice(0, 10)),
    ['2026-07-09', '2026-07-08', '2026-07-06', '2026-07-05', '2026-07-02'],
  );
  assert.deepEqual(items.map((i) => i.source), [
    SOURCE_LEGACY_DEBRIEF, SOURCE_JOURNAL, SOURCE_LEGACY_DEBRIEF, SOURCE_JOURNAL, SOURCE_REFLECTION,
  ]);
});

// ── One total cap ──────────────────────────────────────────────────────────

test('the cap is exactly 10 records IN TOTAL, not per source', async () => {
  assert.equal(MAX_TOTAL_ENTRIES, 10);
  const client = makeFakeClient(
    enabled,
    { u: [...Array.from({ length: 8 }, (_, i) => reflection(i + 20)),
      ...Array.from({ length: 8 }, (_, i) => quickNote(i + 10))] },
    { u: Array.from({ length: 8 }, (_, i) => debriefRow(i + 1)) },
  );
  const items = await createLoadReflectionContext(client)('u');
  assert.equal(items.length, 10, '10 total, never 10 + 10 + 10 and never 10 + 5');
});

test('an older record from one source is displaced by newer records from another', async () => {
  const client = makeFakeClient(
    enabled,
    { u: Array.from({ length: 10 }, (_, i) => reflection(i + 15)) },   // Jul 15–24
    { u: [debriefRow(1)] },                                            // Jul 1
  );
  const items = await createLoadReflectionContext(client)('u');
  assert.equal(items.length, 10);
  assert.ok(items.every((i) => i.source === SOURCE_REFLECTION),
    'the single old Debrief is pushed out of the window by ten newer reflections');

  // The reverse holds too: an old reflection loses its place to newer legacy rows.
  const flipped = makeFakeClient(
    enabled,
    { u: [reflection(1)] },
    { u: Array.from({ length: 10 }, (_, i) => debriefRow(i + 15)) },
  );
  const flippedItems = await createLoadReflectionContext(flipped)('u');
  assert.equal(flippedItems.length, 10);
  assert.ok(flippedItems.every((i) => i.source === SOURCE_LEGACY_DEBRIEF));
});

test('a record on the boundary is kept or dropped purely by date', () => {
  const items = mergeReflectionContext(
    [reflection(20)],
    Array.from({ length: 9 }, (_, i) => quickNote(i + 21)),   // 9 newer notes
    [debriefRow(30)],                                          // newest of all
  );
  assert.equal(items.length, 10);
  assert.equal(items[0].source, SOURCE_LEGACY_DEBRIEF);
  assert.ok(!items.some((i) => i.source === SOURCE_REFLECTION),
    'the oldest record, whatever its source, is the one displaced');
});

// ── Bounded queries ────────────────────────────────────────────────────────

test('each source is read with a small bounded query, not unbounded then merged', async () => {
  const client = makeFakeClient(enabled, { u: [reflection(5), quickNote(4)] }, { u: [debriefRow(3)] });
  await createLoadReflectionContext(client)('u');
  for (const key of ['reflection', 'journal', 'debrief']) {
    assert.equal(client.__calls[key].take, MAX_TOTAL_ENTRIES, `${key} query must be bounded`);
    assert.deepEqual(client.__calls[key].orderBy, { createdAt: 'desc' });
  }
  assert.equal(client.__calls.reflection.where.entryType, 'REFLECTION');
  assert.deepEqual(client.__calls.journal.where.entryType, { not: 'REFLECTION' });
});

// ── Per-source privacy is unchanged by the unification ─────────────────────

test('new REFLECTION rows keep the compact structured projection — no "Write my own" text', async () => {
  const noisy = reflection(6, {
    customContext: 'my own context words', customEvent: 'my own event words',
    customState: 'my own state words', customThought: 'my own thought words',
    customResponse: 'my own response words', customBody: 'my own body words',
    note: 'legacy note text', takeForward: 'legacy take forward',
  });
  const client = makeFakeClient(enabled, { u: [noisy] }, { u: [] });
  const items = await createLoadReflectionContext(client)('u');
  for (const key of FORBIDDEN_HISTORY_KEYS) {
    assert.ok(!(key in items[0]), `${key} must never appear on a Coach-facing reflection`);
  }
  const rendered = buildReflectionContextSection(items);
  for (const words of ['my own context words', 'my own event words', 'my own state words',
    'my own thought words', 'my own response words', 'my own body words',
    'legacy note text', 'legacy take forward']) {
    assert.ok(!rendered.includes(words), `"${words}" must never be rendered into the prompt`);
  }
  assert.deepEqual(client.__calls.reflection.select, HISTORY_SELECT);
});

test('older Mind Journal rows keep their existing restricted projection exactly', async () => {
  const client = makeFakeClient(enabled, { u: [quickNote(5), guided(4)] }, { u: [] });
  const items = await createLoadReflectionContext(client)('u');
  const [note, guide] = items;

  assert.deepEqual(Object.keys(note).sort(), ['createdAt', 'customState', 'entryType', 'note', 'source', 'states']);
  assert.deepEqual(Object.keys(guide).sort(), [
    'contextType', 'createdAt', 'customContext', 'customState', 'entryType', 'source', 'states', 'takeForward',
  ]);
  assert.ok(!('note' in guide), 'a guided row still never exposes note');
  for (const item of items) {
    for (const key of FORBIDDEN_COACH_KEYS) {
      assert.ok(!(key in item), `${key} must not appear on an older Mind Journal record`);
    }
  }
  // The restricted narratives are not even fetched.
  assert.deepEqual(client.__calls.journal.select, COACH_CONTEXT_SELECT);
  const rendered = buildReflectionContextSection(items);
  for (const secret of ['SECRET_H', 'SECRET_N', 'SECRET_W', 'MUST_NOT_APPEAR']) {
    assert.ok(!rendered.includes(secret), `${secret} must never reach the prompt`);
  }
});

test('a legacy Debrief surfaces only the three approved fields', async () => {
  const client = makeFakeClient(enabled, { u: [] }, { u: [debriefRow(3)] });
  const items = await createLoadReflectionContext(client)('u');
  assert.deepEqual(Object.keys(items[0]).sort(),
    ['createdAt', 'doDifferently', 'nextFocus', 'source', 'wentWell']);
  for (const key of FORBIDDEN_LEGACY_KEYS) {
    assert.ok(!(key in items[0]), `${key} must never reach Coach context`);
  }
  assert.deepEqual(Object.keys(LEGACY_DEBRIEF_SELECT).sort(),
    ['createdAt', 'doDifferently', 'nextFocus', 'wentWell']);
  const rendered = buildReflectionContextSection(items);
  assert.ok(!rendered.includes('internal insight'), 'the old AI insight is not recycled');
  assert.ok(!rendered.includes('Trial'), 'nor the legacy event type');
  assert.ok(!rendered.includes('xpAwarded'), 'nor any legacy reward data');
});

test('a long legacy field is bounded rather than dumped whole', () => {
  const mapped = mapLegacyDebrief({ wentWell: 'x'.repeat(1000), doDifferently: null, nextFocus: null, createdAt: day(1) });
  assert.equal(mapped.wentWell.length, 240);
  assert.equal(mapped.doDifferently, null);
});

test('each source renders through its own formatter — nothing is normalized into a wider shape', async () => {
  const client = makeFakeClient(enabled, { u: [reflection(5), quickNote(4), guided(3)] }, { u: [debriefRow(2)] });
  const rendered = buildReflectionContextSection(await createLoadReflectionContext(client)('u'));
  assert.match(rendered, /takeaway: "takeaway 5"/);
  assert.match(rendered, /Quick Note \| states: tired \| note: "note 4"/);
  assert.match(rendered, /Guided Reflection \| context: COMPETITION/);
  assert.match(rendered, /went well: "went well 2"/);
});

// ── One section, no empty headings, guardrails intact ──────────────────────

test('empty input renders no section at all', () => {
  assert.equal(buildReflectionContextSection(null), '');
  assert.equal(buildReflectionContextSection([]), '');
  const line = formatLegacyReflectionLine({ wentWell: null, doDifferently: null, nextFocus: null, createdAt: day(2) });
  assert.equal(line, '- 2026-07-02');
});

test('exactly one reflection heading is produced, whatever the mix of sources', async () => {
  const client = makeFakeClient(enabled, { u: [reflection(5), quickNote(4), guided(3)] }, { u: [debriefRow(2)] });
  const rendered = buildReflectionContextSection(await createLoadReflectionContext(client)('u'));
  assert.equal((rendered.match(/^## /gm) || []).length, 1, 'one heading, not one per source');
  assert.match(rendered, /^## Recent Reflections/);
  assert.ok(!rendered.includes('Optional Mind Journal Context'), 'the second journal section is gone');
  assert.ok(!rendered.includes('Recent Post-Match Debriefs'), 'and so is the old debrief section');
});

test('no record is described twice in the section', async () => {
  const client = makeFakeClient(enabled, { u: [reflection(5), quickNote(4)] }, { u: [debriefRow(3)] });
  const items = await createLoadReflectionContext(client)('u');
  const rendered = buildReflectionContextSection(items);
  const lines = rendered.split('\n').filter((l) => l.startsWith('- 2026-'));
  assert.equal(lines.length, items.length);
  assert.equal(new Set(lines).size, lines.length, 'every rendered line is distinct');
});

test('the reflection section keeps the Mind Journal guardrails', async () => {
  const client = makeFakeClient(enabled, { u: [reflection(5)] }, { u: [debriefRow(4)] });
  const rendered = buildReflectionContextSection(await createLoadReflectionContext(client)('u'));
  assert.match(rendered, /Do not diagnose/i);
  assert.match(rendered, /Do not assume one thing here caused another/i);
  assert.match(rendered, /ask them about it/i);
  assert.match(rendered, /Do not automatically prescribe/i);
  assert.match(rendered, /never confirm a barrier from reflections alone/i);
  assert.match(rendered, /Do not calculate or infer any score/i);
  assert.match(rendered, /only where it is genuinely relevant/i);
  assert.doesNotMatch(rendered, /you must mention|always prescribe|proven pattern|objectively ready/i);
});

// ── Wiring ─────────────────────────────────────────────────────────────────

test('the old unconditional Recent Post-Match Debriefs section is gone from the prompt', () => {
  assert.doesNotMatch(chatSrc, /debriefSection/);
  assert.doesNotMatch(chatSrc, /recentDebriefs/);
  assert.doesNotMatch(chatSrc, /prisma\.debrief\.findMany/,
    'chat.js must not read Debrief rows directly at all');
});

test('chat.js builds ONE reflection block, from the one pipeline', () => {
  assert.match(chatSrc, /const \{ buildReflectionContextSection \} = loadReflectionContext;/);
  assert.match(chatSrc, /const reflectionContext = await loadReflectionContext\(req\.userId\);/);
  assert.match(chatSrc, /const reflectionSection = buildReflectionContextSection\(reflectionContext\);/);
  assert.match(chatSrc, /const extraSections = \[coachingStateSection, patternSection, reflectionSection\]\.filter\(Boolean\)\.join\('\\n\\n'\);/);
  assert.equal((chatSrc.match(/buildReflectionContextSection\(reflectionContext\)/g) || []).length, 1);
  // The second journal path is gone from the route entirely.
  assert.doesNotMatch(chatSrc, /buildMindJournalContextSection|mindJournalSection|mindJournalEntries/);
  assert.doesNotMatch(chatSrc, /function buildReflectionContextSection/, 'no local duplicate formatter');
});

test('legacy debrief ToolReports stay excluded from generic tool activity, so a reflection cannot appear twice', () => {
  assert.match(chatSrc, /toolType: \{ not: 'debrief' \}/);
  assert.doesNotMatch(chatSrc, /toolReport\.delete/);
});

test('quick chat gets no reflection context — it is loaded on the main-chat path only', () => {
  const quickEnd = chatSrc.indexOf('// ── Main coaching chat');
  assert.ok(quickEnd !== -1);
  const quickIdx = chatSrc.lastIndexOf('if (isQuickChat) {', quickEnd);
  assert.ok(quickIdx !== -1 && quickIdx < quickEnd);
  assert.doesNotMatch(chatSrc.slice(quickIdx, quickEnd), /reflectionContext/);
});

// ── The pipeline never writes ──────────────────────────────────────────────

test('loadReflectionContext is a pure read — it can never migrate, rewrite or delete history', () => {
  const pipelineSrc = readFileSync(
    path.join(__dirname, '../src/services/mindJournal/loadReflectionContext.js'), 'utf8');
  for (const write of ['create(', 'update(', 'updateMany(', 'delete(', 'deleteMany(', 'upsert(']) {
    assert.ok(!pipelineSrc.includes(write), `loadReflectionContext must never call ${write}`);
  }
});
