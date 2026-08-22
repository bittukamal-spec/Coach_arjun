// Unified reflection Coach context (PR 2 cutover).
//
// One consent control, one reflection block, one representation of any given
// reflection. Behavioural checks run against an injected fake Prisma client;
// prompt-wiring checks are source-text assertions on chat.js, matching the
// style of mindJournalContext.test.js.

const test = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const path = require('node:path');

const {
  createLoadReflectionContext,
  buildReflectionContextSection,
  formatLegacyReflectionLine,
  mapLegacyDebrief,
  LEGACY_DEBRIEF_SELECT,
  FORBIDDEN_LEGACY_KEYS,
  MAX_REFLECTIONS,
  MAX_LEGACY_DEBRIEFS,
} = require('../src/services/mindJournal/loadReflectionContext');
const {
  FORBIDDEN_HISTORY_KEYS,
  MAX_HISTORY_ENTRIES,
} = require('../src/services/mindJournal/buildReflectionHistoryWindow');

const chatSrc = readFileSync(path.join(__dirname, '../src/routes/chat.js'), 'utf8');

function makeFakeClient(usersById, entriesByUserId = {}, debriefsByUserId = {}) {
  const calls = { entries: null, debriefs: null };
  const findMany = (store, key) => async ({ where, orderBy, take, select }) => {
    calls[key] = { where, orderBy, take, select };
    let rows = (store[where.userId] || []).slice();
    if (where.entryType === 'REFLECTION') rows = rows.filter((r) => r.entryType === 'REFLECTION');
    if (orderBy?.createdAt === 'desc') rows = rows.sort((a, b) => b.createdAt - a.createdAt);
    if (take) rows = rows.slice(0, take);
    // Honour Prisma `select` so a test can prove a column is never fetched.
    if (select) {
      rows = rows.map((row) => {
        const out = {};
        for (const k of Object.keys(select)) if (select[k]) out[k] = row[k] ?? null;
        return out;
      });
    }
    return rows;
  };
  return {
    user: { findUnique: async ({ where }) => usersById[where.id] || null },
    mindJournalEntry: { findMany: findMany(entriesByUserId, 'entries') },
    debrief: { findMany: findMany(debriefsByUserId, 'debriefs') },
    __calls: calls,
  };
}

const day = (n) => new Date(Date.UTC(2026, 6, n));

function reflection(n, extra = {}) {
  return {
    id: `r${n}`,
    userId: 'u',
    entryType: 'REFLECTION',
    contextType: 'TRAINING',
    eventTags: ['a_full_session'],
    states: ['calm'],
    thoughtTags: ['knew_what_to_do'],
    responseTags: ['kept_going'],
    bodyTags: [],
    cueFeedback: null,
    arjunTakeaway: `takeaway ${n}`,
    createdAt: day(n),
    ...extra,
  };
}

function debriefRow(n, extra = {}) {
  return {
    id: `d${n}`,
    userId: 'u',
    wentWell: `went well ${n}`,
    doDifferently: `do differently ${n}`,
    nextFocus: `next focus ${n}`,
    arjunInsight: 'internal insight',
    eventType: 'Match',
    xpAwarded: 20,
    createdAt: day(n),
    ...extra,
  };
}

// ── Consent ────────────────────────────────────────────────────────────────

test('consent off → no reflection context at all, new OR legacy', async () => {
  const client = makeFakeClient(
    { u: { mindJournalContextEnabled: false } },
    { u: [reflection(5)] },
    { u: [debriefRow(4)] },
  );
  const load = createLoadReflectionContext(client);
  assert.equal(await load('u'), null);
  // The narrowing that matters: with consent off, the legacy Debrief rows
  // are not even read, let alone injected.
  assert.equal(client.__calls.debriefs, null, 'legacy debriefs must not be queried without consent');
  assert.equal(client.__calls.entries, null);
});

test('consent off is the default — an athlete who never touched the toggle gets nothing', async () => {
  const client = makeFakeClient({ u: {} }, { u: [reflection(5)] }, { u: [debriefRow(4)] });
  assert.equal(await createLoadReflectionContext(client)('u'), null);
});

test('consent on → compact reflection context is available', async () => {
  const client = makeFakeClient(
    { u: { mindJournalContextEnabled: true } },
    { u: [reflection(5), reflection(4)] },
    { u: [] },
  );
  const ctx = await createLoadReflectionContext(client)('u');
  assert.equal(ctx.reflections.length, 2);
  assert.equal(ctx.reflections[0].takeaway, 'takeaway 5', 'newest first');
  assert.equal(ctx.reflections[0].contextType, 'TRAINING');
  assert.deepEqual(ctx.legacy, []);
});

test('consent on with neither reflections nor legacy rows → null, so no empty section is built', async () => {
  const client = makeFakeClient({ u: { mindJournalContextEnabled: true } }, { u: [] }, { u: [] });
  assert.equal(await createLoadReflectionContext(client)('u'), null);
});

// ── Window ─────────────────────────────────────────────────────────────────

test('the approved reflection window is 10, and it is enforced at the query', async () => {
  assert.equal(MAX_REFLECTIONS, 10);
  assert.equal(MAX_HISTORY_ENTRIES, 10);
  const many = Array.from({ length: 25 }, (_, i) => reflection(i + 1));
  const client = makeFakeClient({ u: { mindJournalContextEnabled: true } }, { u: many }, { u: [] });
  const ctx = await createLoadReflectionContext(client)('u');
  assert.equal(ctx.reflections.length, 10);
  assert.equal(client.__calls.entries.take, 10, 'the cap is a query bound, not just a slice');
  assert.equal(client.__calls.entries.where.entryType, 'REFLECTION',
    'only unified reflections feed this window');
});

test('the legacy tail is not widened by moving it behind consent — still at most 2', async () => {
  assert.equal(MAX_LEGACY_DEBRIEFS, 2);
  const many = Array.from({ length: 9 }, (_, i) => debriefRow(i + 1));
  const client = makeFakeClient({ u: { mindJournalContextEnabled: true } }, { u: [] }, { u: many });
  const ctx = await createLoadReflectionContext(client)('u');
  assert.equal(ctx.legacy.length, 2);
  assert.equal(client.__calls.debriefs.take, 2);
});

// ── What may and may not be surfaced ───────────────────────────────────────

test('athlete-written "Write my own" text never reaches the reflection window', async () => {
  const noisy = reflection(6, {
    customContext: 'my own context words',
    customEvent: 'my own event words',
    customState: 'my own state words',
    customThought: 'my own thought words',
    customResponse: 'my own response words',
    customBody: 'my own body words',
    note: 'legacy note text',
    takeForward: 'legacy take forward',
  });
  const client = makeFakeClient({ u: { mindJournalContextEnabled: true } }, { u: [noisy] }, { u: [] });
  const ctx = await createLoadReflectionContext(client)('u');
  const item = ctx.reflections[0];
  for (const key of FORBIDDEN_HISTORY_KEYS) {
    assert.ok(!(key in item), `${key} must never appear on a Coach-facing reflection`);
  }
  const rendered = buildReflectionContextSection(ctx);
  for (const words of ['my own context words', 'my own event words', 'my own state words',
    'my own thought words', 'my own response words', 'my own body words',
    'legacy note text', 'legacy take forward']) {
    assert.ok(!rendered.includes(words), `"${words}" must never be rendered into the prompt`);
  }
});

test('a legacy row surfaces only the three fields the retired section already surfaced', async () => {
  const client = makeFakeClient({ u: { mindJournalContextEnabled: true } }, { u: [] }, { u: [debriefRow(3)] });
  const ctx = await createLoadReflectionContext(client)('u');
  const item = ctx.legacy[0];
  assert.deepEqual(Object.keys(item).sort(), ['createdAt', 'doDifferently', 'nextFocus', 'wentWell']);
  for (const key of FORBIDDEN_LEGACY_KEYS) {
    assert.ok(!(key in item), `${key} must never reach Coach context`);
  }
  // And they are never fetched in the first place.
  assert.deepEqual(Object.keys(LEGACY_DEBRIEF_SELECT).sort(),
    ['createdAt', 'doDifferently', 'nextFocus', 'wentWell']);
  const rendered = buildReflectionContextSection(ctx);
  assert.ok(!rendered.includes('internal insight'), 'the old AI insight is not recycled');
  assert.ok(!rendered.includes('Match'), 'nor the legacy event type');
  assert.ok(!rendered.includes('xpAwarded'), 'nor any legacy reward data');
});

test('a long legacy field is bounded rather than dumped whole', () => {
  const mapped = mapLegacyDebrief({ wentWell: 'x'.repeat(1000), doDifferently: null, nextFocus: null, createdAt: day(1) });
  assert.equal(mapped.wentWell.length, 240);
  assert.equal(mapped.doDifferently, null);
});

test('empty sections are omitted rather than rendered as empty headings', () => {
  assert.equal(buildReflectionContextSection(null), '');
  assert.equal(buildReflectionContextSection({ reflections: [], legacy: [] }), '');
  const line = formatLegacyReflectionLine({ wentWell: null, doDifferently: null, nextFocus: null, createdAt: day(2) });
  assert.equal(line, '- 2026-07-02');
});

// ── Guardrails ─────────────────────────────────────────────────────────────

test('the reflection section keeps the Mind Journal guardrails', async () => {
  const client = makeFakeClient({ u: { mindJournalContextEnabled: true } }, { u: [reflection(5)] }, { u: [debriefRow(4)] });
  const rendered = buildReflectionContextSection(await createLoadReflectionContext(client)('u'));
  assert.match(rendered, /Do not diagnose/i);
  assert.match(rendered, /Do not assume/i);
  assert.match(rendered, /Do not automatically prescribe/i);
  assert.match(rendered, /ask them about it/i);
  assert.match(rendered, /never confirm a barrier from reflections alone/i);
  assert.match(rendered, /Do not calculate or infer any score/i);
  // Both sources render, newest first within each group.
  assert.match(rendered, /Recent Mind Journal reflections/);
  assert.match(rendered, /retired reflection tool/);
});

// ── Wiring: exactly one reflection block, no duplicates ────────────────────

test('the old unconditional Recent Post-Match Debriefs section is gone from the prompt', () => {
  // The section, the variable that carried it, and the query that fed it.
  assert.doesNotMatch(chatSrc, /debriefSection/,
    'the unconditional debrief section must not be built or interpolated any more');
  assert.doesNotMatch(chatSrc, /recentDebriefs/,
    'nor the unconditional query that fed it');
  assert.doesNotMatch(chatSrc, /prisma\.debrief\.findMany/,
    'chat.js must not read Debrief rows directly at all');
});

test('chat.js builds the reflection block from the shared loader and threads it in once', () => {
  assert.match(chatSrc, /const \{ buildReflectionContextSection \} = loadReflectionContext;/);
  assert.match(chatSrc, /const reflectionContext = await loadReflectionContext\(req\.userId\);/);
  assert.match(chatSrc, /const reflectionSection = buildReflectionContextSection\(reflectionContext\);/);
  assert.doesNotMatch(chatSrc, /function buildReflectionContextSection/, 'no local duplicate formatter');
  assert.equal((chatSrc.match(/buildReflectionContextSection\(reflectionContext\)/g) || []).length, 1);
});

test('legacy debrief ToolReports are excluded from generic tool activity, so a reflection cannot appear twice', () => {
  assert.match(chatSrc, /toolType: \{ not: 'debrief' \}/);
  // The rows themselves are never deleted — only left unread for this section.
  assert.doesNotMatch(chatSrc, /toolReport\.delete/);
});

test('quick chat gets no reflection context — it is loaded on the main-chat path only', () => {
  const quickEnd = chatSrc.indexOf('// ── Main coaching chat');
  assert.ok(quickEnd !== -1);
  // The dormant quick-chat branch is the last `if (isQuickChat)` before the
  // main-chat path begins.
  const quickIdx = chatSrc.lastIndexOf('if (isQuickChat) {', quickEnd);
  assert.ok(quickIdx !== -1 && quickIdx < quickEnd);
  assert.doesNotMatch(chatSrc.slice(quickIdx, quickEnd), /reflectionContext/);
});

test('the older Mind Journal loader no longer represents unified reflections', () => {
  const loaderSrc = readFileSync(
    path.join(__dirname, '../src/services/mindJournal/loadMindJournalContext.js'), 'utf8');
  assert.match(loaderSrc, /where: \{ userId, entryType: \{ not: 'REFLECTION' \} \}/,
    'reflections are excluded there so they are represented exactly once, here');
});

// ── The reflection context never writes ────────────────────────────────────

test('loadReflectionContext is a pure read — it can never migrate, rewrite or delete history', () => {
  const src = readFileSync(
    path.join(__dirname, '../src/services/mindJournal/loadReflectionContext.js'), 'utf8');
  for (const write of ['create(', 'update(', 'updateMany(', 'delete(', 'deleteMany(', 'upsert(']) {
    assert.ok(!src.includes(write), `loadReflectionContext must never call ${write}`);
  }
});
