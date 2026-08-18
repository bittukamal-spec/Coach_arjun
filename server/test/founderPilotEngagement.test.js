// Deterministic unit tests for the Phase 2B engagement pure helpers
// (istDateString, isReturningAthlete, summarizeActivity) exported from
// founderPilotOverview.js. Every timestamp here is a fixed literal Date —
// never `new Date()` / the real clock — so exact boundary and IST-midnight
// behavior is proven precisely, with zero chance of flakiness depending on
// when this suite happens to run. Integration-level (HTTP + stub client)
// coverage of the same fields lives in founderPilotOverviewApi.test.js.

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  istDateString,
  isReturningAthlete,
  summarizeActivity,
} = require('../src/routes/founderPilotOverview');

const d = (s) => new Date(s);

// ── istDateString ────────────────────────────────────────────────────────

test('istDateString shifts by +5:30 before taking the calendar date — matches the repo-wide IST-day convention', () => {
  // 18:29 UTC is still 23:59 IST the same UTC calendar date.
  assert.equal(istDateString(d('2026-03-10T18:29:00.000Z')), '2026-03-10');
  // 18:30 UTC is exactly 00:00 IST the NEXT UTC calendar date.
  assert.equal(istDateString(d('2026-03-10T18:30:00.000Z')), '2026-03-11');
});

// ── isReturningAthlete — IST midnight boundary ──────────────────────────

test('[Zero/Small cohorts] same-IST-day activity is NOT returning, even late in the UTC day', () => {
  const createdAt = d('2026-03-10T18:29:00.000Z'); // IST date 2026-03-10
  const lastActiveAt = d('2026-03-10T18:29:59.999Z'); // still IST date 2026-03-10, 1s later
  assert.equal(isReturningAthlete(createdAt, lastActiveAt), false);
});

test('[Zero/Small cohorts] the IST midnight boundary flips returning to true just 1ms later', () => {
  const createdAt = d('2026-03-10T18:29:00.000Z'); // IST date 2026-03-10
  const lastActiveAt = d('2026-03-10T18:30:00.000Z'); // IST date 2026-03-11 — 1ms after the previous test's value
  assert.equal(isReturningAthlete(createdAt, lastActiveAt), true);
});

test('activity on the exact same instant as signup is not returning', () => {
  const at = d('2026-05-01T09:00:00.000Z');
  assert.equal(isReturningAthlete(at, at), false);
});

test('activity on the calendar day immediately after signup (IST) is returning', () => {
  const createdAt = d('2026-05-01T03:00:00.000Z'); // IST date 2026-05-01
  const lastActiveAt = d('2026-05-02T01:00:00.000Z'); // IST date 2026-05-02
  assert.equal(isReturningAthlete(createdAt, lastActiveAt), true);
});

test('a null lastActiveAt is never returning, regardless of createdAt', () => {
  assert.equal(isReturningAthlete(d('2020-01-01T00:00:00.000Z'), null), false);
});

test('isReturningAthlete never uses a raw lastActiveAt > createdAt comparison — later the same IST day must still be false', () => {
  // If the implementation regressed to `lastActiveAt > createdAt`, this
  // would incorrectly return true (lastActiveAt IS chronologically later).
  const createdAt = d('2026-06-15T04:00:00.000Z'); // IST date 2026-06-15
  const lastActiveAt = d('2026-06-15T16:00:00.000Z'); // same IST date, 12h later
  assert.ok(lastActiveAt.getTime() > createdAt.getTime(), 'sanity: lastActiveAt is chronologically after createdAt');
  assert.equal(isReturningAthlete(createdAt, lastActiveAt), false);
});

// ── summarizeActivity — exact 24h / 7d boundaries ───────────────────────

test('[Zero/Small cohorts] activeLast24Hours/activeLast7Days exact boundaries, and returning independent of the active windows', () => {
  const now = d('2026-03-10T12:00:00.000Z');
  const cutoff24h = now.getTime() - 24 * 60 * 60 * 1000;
  const cutoff7d = now.getTime() - 7 * 24 * 60 * 60 * 1000;

  // All createdAt values are far in the past so every non-null
  // lastActiveAt below is unambiguously on a later IST calendar day
  // (returning), isolating the active-window boundary logic from the
  // returning logic.
  const longAgo = d('2020-01-01T00:00:00.000Z');

  const rows = [
    { createdAt: longAgo, lastActiveAt: new Date(cutoff24h) },          // exactly at the 24h cutoff — included (>=)
    { createdAt: longAgo, lastActiveAt: new Date(cutoff24h - 1) },      // 1ms before — excluded from 24h, still within 7d
    { createdAt: longAgo, lastActiveAt: new Date(cutoff7d) },           // exactly at the 7d cutoff — included (>=)
    { createdAt: longAgo, lastActiveAt: new Date(cutoff7d - 1) },       // 1ms before — excluded from both active windows
    { createdAt: longAgo, lastActiveAt: null },                        // never active — excluded from everything
  ];

  const result = summarizeActivity(rows, now);
  assert.equal(result.activeLast24Hours, 1, 'only the exact-24h-cutoff row qualifies');
  assert.equal(result.activeLast7Days, 3, 'the 24h row, the 1ms-before-24h row, and the exact-7d-cutoff row all qualify');
  // [Zero/Small cohorts] "activity older than 7d" still counts as
  // returning — active-window membership and the returning definition are
  // independent concepts.
  assert.equal(result.returningAthletes, 4, 'every row with a non-null lastActiveAt is returning, including the one outside both active windows');
});

test('[Zero/Small cohorts] zero users produces zero counts, never NaN', () => {
  const result = summarizeActivity([], d('2026-01-01T00:00:00.000Z'));
  assert.deepEqual(result, { activeLast24Hours: 0, activeLast7Days: 0, returningAthletes: 0 });
});

test('[Zero/Small cohorts] a newly signed-up user with no activity yet contributes nothing', () => {
  const now = d('2026-01-01T00:00:00.000Z');
  const result = summarizeActivity([{ createdAt: now, lastActiveAt: null }], now);
  assert.deepEqual(result, { activeLast24Hours: 0, activeLast7Days: 0, returningAthletes: 0 });
});

test('[Zero/Small cohorts] activity within 24h counts in both windows; activity outside 24h but within 7d counts only in the 7d window', () => {
  const now = d('2026-01-10T00:00:00.000Z');
  const rows = [
    { createdAt: d('2020-01-01T00:00:00.000Z'), lastActiveAt: new Date(now.getTime() - 2 * 60 * 60 * 1000) }, // 2h ago
    { createdAt: d('2020-01-01T00:00:00.000Z'), lastActiveAt: new Date(now.getTime() - 4 * 24 * 60 * 60 * 1000) }, // 4 days ago
  ];
  const result = summarizeActivity(rows, now);
  assert.equal(result.activeLast24Hours, 1);
  assert.equal(result.activeLast7Days, 2);
});
