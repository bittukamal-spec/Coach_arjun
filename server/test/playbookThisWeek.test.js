// Home's "This week" strip — counts only, from records that already exist.
const test = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const path = require('node:path');
const { buildThisWeek } = require('../src/routes/playbook');

const weekAgo = new Date('2026-11-09T00:00:00Z');
const d = (s) => new Date(s);

test('counts finished practices, journal entries and this week\'s reported results', () => {
  const out = buildThisWeek({
    weekAgo,
    weekReports: [
      { toolType: 'mental_rep', createdAt: d('2026-11-10T10:00:00Z') },
      { toolType: 'body_reset', createdAt: d('2026-11-12T10:00:00Z') },
      { toolType: 'debrief', createdAt: d('2026-11-12T11:00:00Z') },
    ],
    weekJournalDates: [{ createdAt: d('2026-11-11T09:00:00Z') }],
    outcomes: [
      { outcomeStatus: 'HELPED', outcomeRecordedAt: d('2026-11-13T09:00:00Z') },
      { outcomeStatus: 'HELPED_A_LITTLE', outcomeRecordedAt: d('2026-11-13T10:00:00Z') },
      { outcomeStatus: 'DID_NOT_HELP', outcomeRecordedAt: d('2026-11-14T10:00:00Z') },
      { outcomeStatus: 'NOT_TRIED', outcomeRecordedAt: d('2026-11-14T11:00:00Z') },
      { outcomeStatus: 'HELPED', outcomeRecordedAt: d('2026-11-01T10:00:00Z') },
    ],
  });
  assert.equal(out.practices, 2);
  assert.equal(out.reflections, 1);
  assert.equal(out.triedCount, 3);
  assert.equal(out.helpedCount, 2);
  assert.deepEqual(out.activityAt, [
    '2026-11-10T10:00:00.000Z', '2026-11-11T09:00:00.000Z', '2026-11-12T10:00:00.000Z',
  ]);
});

test('an empty week is all zeros, never an error', () => {
  assert.deepEqual(buildThisWeek({ weekAgo, weekReports: [], weekJournalDates: [], outcomes: [] }),
    { practices: 0, reflections: 0, triedCount: 0, helpedCount: 0, activityAt: [] });
});

test('the journal query reads dates only, for this athlete, from the last 7 days', () => {
  const src = readFileSync(path.join(__dirname, '../src/routes/playbook.js'), 'utf8');
  assert.match(src, /mindJournalEntry\.findMany\(\{\s*where: \{ userId: req\.userId, createdAt: \{ gte: weekAgo \} \},\s*select: \{ createdAt: true \},/);
});
