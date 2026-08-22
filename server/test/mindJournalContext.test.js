// Restricted Coach projection for the OLDER Mind Journal shapes.
//
// This module used to own a second Coach-context path of its own (its own
// consent read, its own five-entry window, its own prompt section). The PR 2
// amendment consolidated every reflection source into one pipeline —
// loadReflectionContext.js — and what remains here is the privacy-critical
// half: exactly which fields of a Quick Note, a Guided Reflection, or a
// pre-typed legacy row Coach may ever see.
//
// Those field rules are UNCHANGED by the consolidation, and these tests are
// what pins that. Consent, window size, ordering and prompt wiring are the
// unified pipeline's contract and are covered in reflectionContext.test.js.

const test = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const path = require('node:path');

const {
  mapEntryForCoach,
  formatMindJournalContextLine,
  COACH_CONTEXT_SELECT,
  FORBIDDEN_COACH_KEYS,
} = require('../src/services/mindJournal/loadMindJournalContext');

const src = readFileSync(
  path.join(__dirname, '../src/services/mindJournal/loadMindJournalContext.js'), 'utf8');

// ── Quick Note mapping ─────────────────────────────────────────────────────

test('QUICK_NOTE Coach mapping includes only allowed fields', () => {
  const row = mapEntryForCoach({
    id: 'qn1', userId: 'uqn', entryType: 'QUICK_NOTE',
    states: ['focused', 'nervous'], customState: 'Match-day wired', note: 'held my rhythm',
    contextType: 'TRAINING', customContext: 'should-not-appear',
    whatHappened: 'SECRET_H', whatNoticed: 'SECRET_N', helpedOrGotInWay: 'SECRET_W',
    takeForward: 'SECRET_T', createdAt: new Date('2026-08-01T10:00:00.000Z'),
  });
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

test('GUIDED_REFLECTION Coach mapping includes allowed fields and excludes narratives/note', () => {
  const row = mapEntryForCoach({
    id: 'gr1', userId: 'ugr', entryType: 'GUIDED_REFLECTION',
    contextType: 'SOMETHING_ELSE', customContext: 'selection trial',
    states: ['nervous'], customState: 'match tension',
    takeForward: 'breathe first',
    note: 'MUST_NOT_APPEAR',
    whatHappened: 'lost the opener', whatNoticed: 'jaw tight', helpedOrGotInWay: 'slow breath',
    createdAt: new Date('2026-08-02T10:00:00.000Z'),
  });
  assert.deepEqual(Object.keys(row).sort(), [
    'contextType', 'createdAt', 'customContext', 'customState', 'entryType', 'states', 'takeForward',
  ]);
  assert.equal(row.contextType, 'SOMETHING_ELSE');
  assert.equal(row.customContext, 'selection trial');
  assert.equal(row.customState, 'match tension');
  assert.equal(row.takeForward, 'breathe first');
  for (const key of ['note', 'whatHappened', 'whatNoticed', 'helpedOrGotInWay', 'id']) {
    assert.equal(Object.prototype.hasOwnProperty.call(row, key), false, `${key} must be absent`);
  }
});

// ── Legacy ─────────────────────────────────────────────────────────────────

test('legacy null entryType maps conservatively to states/note/createdAt only', () => {
  const row = mapEntryForCoach({
    id: 'l1', userId: 'uleg', entryType: null, states: ['tired'], note: 'long day',
    contextType: 'TRAINING', customState: 'x', customContext: 'y', takeForward: 'z',
    createdAt: new Date('2026-08-03T10:00:00.000Z'),
  });
  assert.deepEqual(Object.keys(row).sort(), ['createdAt', 'entryType', 'note', 'states']);
  assert.equal(row.entryType, null, 'a legacy row is never relabelled as QUICK_NOTE');
  assert.deepEqual(row.states, ['tired']);
  assert.equal(row.note, 'long day');
});

test('states are bounded and non-string values are dropped', () => {
  const row = mapEntryForCoach({
    entryType: 'QUICK_NOTE', states: ['a', 'b', 'c', 4, null], note: null, createdAt: new Date(),
  });
  assert.deepEqual(row.states, ['a', 'b']);
});

test('over-long athlete text is bounded rather than passed through whole', () => {
  const row = mapEntryForCoach({
    entryType: 'QUICK_NOTE', states: [], customState: 'x'.repeat(200), note: 'y'.repeat(2000),
    createdAt: new Date(),
  });
  assert.equal(row.customState.length, 30);
  assert.equal(row.note.length, 500);
});

// ── Field-level exclusions ─────────────────────────────────────────────────

test('the Prisma select omits restricted narrative fields, so they are never fetched', () => {
  assert.deepEqual(Object.keys(COACH_CONTEXT_SELECT).sort(), [
    'contextType', 'createdAt', 'customContext', 'customState', 'entryType', 'note', 'states', 'takeForward',
  ]);
  for (const key of ['whatHappened', 'whatNoticed', 'helpedOrGotInWay']) {
    assert.equal(Object.prototype.hasOwnProperty.call(COACH_CONTEXT_SELECT, key), false, `${key} must not be selected`);
  }
});

test('mapped output never contains forbidden Coach keys', () => {
  const row = mapEntryForCoach({
    id: 'f1', userId: 'uforb', entryType: 'GUIDED_REFLECTION', contextType: 'COMPETITION',
    states: ['nervous'], customState: 'wired', customContext: null, takeForward: 'breathe',
    note: 'n', whatHappened: 'h', whatNoticed: 'n2', helpedOrGotInWay: 'w',
    createdAt: new Date(), score: 99,
  });
  for (const key of FORBIDDEN_COACH_KEYS) {
    assert.equal(Object.prototype.hasOwnProperty.call(row, key), false, `${key} must not appear`);
  }
});

test('source contract: the projection must not reference restricted narrative fields in mapping/select', () => {
  const selectBlock = src.slice(src.indexOf('const COACH_CONTEXT_SELECT'), src.indexOf('};', src.indexOf('const COACH_CONTEXT_SELECT')) + 2);
  assert.doesNotMatch(selectBlock, /whatHappened|whatNoticed|helpedOrGotInWay/);

  const mapBlock = src.slice(src.indexOf('function mapEntryForCoach'), src.indexOf('function formatMindJournalContextLine'));
  assert.doesNotMatch(mapBlock, /whatHappened|whatNoticed|helpedOrGotInWay/);
  // Guided branch must not attach note.
  const guidedReturn = mapBlock.slice(mapBlock.indexOf("entryType === 'GUIDED_REFLECTION'"), mapBlock.indexOf("entryType === 'QUICK_NOTE'"));
  assert.doesNotMatch(guidedReturn, /\bnote\b/);
});

test('the module queries nothing and logs no athlete text', () => {
  assert.doesNotMatch(src, /mentalFitnessEntry/i);
  assert.doesNotMatch(src, /console\.(log|info|debug|warn|error)\(/);
  // Consolidated away: this module no longer reads, and no longer owns a
  // consent gate, a window, or a prompt section of its own.
  assert.doesNotMatch(src, /PrismaClient|findMany|findUnique/);
  assert.doesNotMatch(src, /mindJournalContextEnabled/);
  assert.doesNotMatch(src, /buildMindJournalContextSection/);
});

// ── Prompt line formatting ─────────────────────────────────────────────────

test('Quick Note prompt line contains only allowed user-facing information', () => {
  const line = formatMindJournalContextLine({
    entryType: 'QUICK_NOTE',
    states: ['calm', 'focused'],
    customState: 'settled',
    note: 'kept my rhythm',
    createdAt: new Date('2026-08-01T10:00:00.000Z'),
  });
  assert.match(line, /^- 2026-08-01: Quick Note \| states: calm, focused \| custom state: "settled" \| note: "kept my rhythm"$/);
});

test('Guided prompt line may include context/customContext/states/customState/takeForward but not narratives', () => {
  const line = formatMindJournalContextLine({
    entryType: 'GUIDED_REFLECTION',
    contextType: 'SOMETHING_ELSE',
    customContext: 'selection trial',
    states: ['nervous'],
    customState: 'match tension',
    takeForward: 'breathe first',
    createdAt: new Date('2026-08-02T10:00:00.000Z'),
  });
  assert.match(line, /Guided Reflection/);
  assert.match(line, /context: "selection trial"/);
  assert.match(line, /take forward: "breathe first"/);
  assert.doesNotMatch(line, /lost the opener|jaw tight|slow breath/);
  // customContext wins over the enum rather than rendering both.
  assert.doesNotMatch(line, /SOMETHING_ELSE/);
});

test('athlete-written customState/customContext are preserved verbatim and not translated', () => {
  const line = formatMindJournalContextLine({
    entryType: 'GUIDED_REFLECTION',
    contextType: 'SOMETHING_ELSE',
    customContext: 'ट्रायल से पहले',
    states: [],
    customState: 'thoda tight',
    takeForward: null,
    createdAt: new Date('2026-08-04T10:00:00.000Z'),
  });
  assert.match(line, /context: "ट्रायल से पहले"/);
  assert.match(line, /custom state: "thoda tight"/);
});

test('a legacy line keeps its compact shape and omits empty fields', () => {
  assert.equal(
    formatMindJournalContextLine({ entryType: null, states: ['tired'], note: null, createdAt: new Date('2026-08-05T10:00:00.000Z') }),
    '- 2026-08-05: tired',
  );
  assert.equal(
    formatMindJournalContextLine({ entryType: null, states: [], note: null, createdAt: new Date('2026-08-05T10:00:00.000Z') }),
    '- 2026-08-05',
  );
});

// ── No second context path anywhere ────────────────────────────────────────

test('no route loads Mind Journal context on its own — the unified pipeline is the only path', () => {
  const routesDir = path.join(__dirname, '../src/routes');
  for (const file of ['profileIntro.js', 'weeklyReports.js', 'chat.js', 'selfTalk.js', 'bodyReset.js', 'debrief.js']) {
    const routeSrc = readFileSync(path.join(routesDir, file), 'utf8');
    assert.doesNotMatch(routeSrc, /loadMindJournalContext\(|mindJournalEntries/,
      `${file} must not run a Mind Journal context path of its own`);
  }
});
