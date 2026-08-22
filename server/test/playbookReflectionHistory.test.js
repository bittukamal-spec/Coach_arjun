// Playbook Reflections after the PR 2 cutover.
//
// The section keeps its value by merging two sources: new Mind Journal
// reflections and the athlete's historical rows from the retired reflection
// tool. Existing pilot athletes must not feel their old history disappeared,
// and no row may be rewritten to look like something it is not.

const test = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const path = require('node:path');

const playbook = require('../src/routes/playbook');
const { mergeReflectionHistory, REFLECTION_HISTORY_LIMIT } = playbook;

const src = readFileSync(path.join(__dirname, '../src/routes/playbook.js'), 'utf8');

const at = (n) => new Date(Date.UTC(2026, 6, n));

const journalRow = (n, extra = {}) => ({
  id: `mj${n}`,
  contextType: 'COMPETITION',
  customContext: null,
  arjunTakeaway: `takeaway ${n}`,
  createdAt: at(n),
  ...extra,
});

const debriefRow = (n, extra = {}) => ({
  id: `db${n}`,
  eventType: 'Match',
  resultType: 'Won',
  nextFocus: `next focus ${n}`,
  arjunInsight: `insight ${n}`,
  createdAt: at(n),
  ...extra,
});

// ── Both sources appear ────────────────────────────────────────────────────

test('new Mind Journal reflections appear in the Playbook history', () => {
  const merged = mergeReflectionHistory([journalRow(5)], []);
  assert.equal(merged.length, 1);
  assert.equal(merged[0].source, 'mind_journal');
  assert.equal(merged[0].contextType, 'COMPETITION');
  assert.equal(merged[0].takeaway, 'takeaway 5');
});

test('an athlete with only historical rows still sees their reflection history', () => {
  const merged = mergeReflectionHistory([], [debriefRow(3), debriefRow(2)]);
  assert.equal(merged.length, 2);
  assert.equal(merged[0].source, 'debrief');
  assert.equal(merged[0].nextFocus, 'next focus 3');
  assert.equal(merged[0].arjunInsight, 'insight 3');
});

test('an athlete with no reflections of either kind gets an empty history, not a fabricated one', () => {
  assert.deepEqual(mergeReflectionHistory([], []), []);
  assert.deepEqual(mergeReflectionHistory(null, undefined), []);
});

// ── Ordering ───────────────────────────────────────────────────────────────

test('the combined history is ordered most recent first, across both sources', () => {
  const merged = mergeReflectionHistory(
    [journalRow(6), journalRow(2)],
    [debriefRow(7), debriefRow(4)],
  );
  assert.deepEqual(merged.map((r) => r.id), ['db7', 'mj6', 'db4', 'mj2']);
});

test('the combined history is bounded', () => {
  const merged = mergeReflectionHistory(
    Array.from({ length: 5 }, (_, i) => journalRow(i + 10)),
    Array.from({ length: 5 }, (_, i) => debriefRow(i + 1)),
  );
  assert.equal(merged.length, REFLECTION_HISTORY_LIMIT);
  // The newest rows win, whichever source they came from.
  assert.ok(merged.every((r) => r.source === 'mind_journal'));
});

// ── No fabricated mappings ─────────────────────────────────────────────────

test('a Mind Journal reflection is never given legacy fields it does not have', () => {
  const [item] = mergeReflectionHistory([journalRow(5)], []);
  assert.deepEqual(
    Object.keys(item).sort(),
    ['contextType', 'createdAt', 'customContext', 'id', 'source', 'takeaway'],
  );
  for (const legacyOnly of ['eventType', 'resultType', 'nextFocus', 'arjunInsight']) {
    assert.ok(!(legacyOnly in item), `${legacyOnly} must not be invented for a Mind Journal reflection`);
  }
});

test('a legacy row is never dressed up as a Mind Journal reflection', () => {
  const [item] = mergeReflectionHistory([], [debriefRow(3)]);
  assert.deepEqual(
    Object.keys(item).sort(),
    ['arjunInsight', 'createdAt', 'eventType', 'id', 'nextFocus', 'resultType', 'source'],
  );
  for (const journalOnly of ['contextType', 'customContext', 'takeaway']) {
    assert.ok(!(journalOnly in item), `${journalOnly} must not be invented for a legacy row`);
  }
});

test('an athlete-written custom context is carried verbatim, never replaced by the enum', () => {
  const [item] = mergeReflectionHistory(
    [journalRow(5, { contextType: 'SOMETHING_ELSE', customContext: 'selection trial' })], []);
  assert.equal(item.contextType, 'SOMETHING_ELSE');
  assert.equal(item.customContext, 'selection trial');
});

test('missing optional values stay null rather than becoming empty strings or invented text', () => {
  const [item] = mergeReflectionHistory([journalRow(5, { arjunTakeaway: null, contextType: null })], []);
  assert.equal(item.takeaway, null);
  assert.equal(item.contextType, null);
});

// ── History stays read-only ────────────────────────────────────────────────

test('Playbook never writes: no create/update/delete on any reflection source', () => {
  for (const write of ['.create(', '.update(', '.updateMany(', '.delete(', '.deleteMany(', '.upsert(']) {
    assert.ok(!src.includes(write), `playbook.js must never call ${write}`);
  }
});

test('the legacy Debrief rows are still read, unchanged, and only for the fields already displayed', () => {
  assert.match(src, /prisma\.debrief\.findMany/);
  assert.match(src, /select: \{ id: true, eventType: true, resultType: true, nextFocus: true, arjunInsight: true, createdAt: true \}/);
  assert.match(src, /prisma\.mindJournalEntry\.findMany/);
  assert.match(src, /entryType: 'REFLECTION'/);
});
