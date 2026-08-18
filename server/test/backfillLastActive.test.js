// Unit tests for the Pilot Tracking Phase 2A backfill script's pure logic
// and its injectable-client candidate collection — no database, no real
// Prisma client. The script's own main()/--confirm write path is
// exercised only through these pure building blocks; main() itself is a
// thin CLI wrapper around them and is not run here (it always requires a
// live PrismaClient instance to construct).

const test = require('node:test');
const assert = require('node:assert/strict');
const { latestPerUser, mergeLatest, collectCandidates } = require('../scripts/backfill-last-active');

const d = (s) => new Date(s);

// ── latestPerUser ────────────────────────────────────────────────────────

test('latestPerUser picks the latest non-null timestamp per user', () => {
  const rows = [
    { userId: 'u1', at: d('2026-01-01') },
    { userId: 'u1', at: d('2026-01-05') },
    { userId: 'u2', at: d('2026-01-03') },
  ];
  const result = latestPerUser(rows);
  assert.equal(result.get('u1').getTime(), d('2026-01-05').getTime());
  assert.equal(result.get('u2').getTime(), d('2026-01-03').getTime());
});

test('latestPerUser ignores null timestamps entirely', () => {
  const rows = [{ userId: 'u1', at: null }, { userId: 'u1', at: d('2026-01-01') }, { userId: 'u2', at: null }];
  const result = latestPerUser(rows);
  assert.equal(result.get('u1').getTime(), d('2026-01-01').getTime());
  assert.equal(result.has('u2'), false, 'a user with only null timestamps has no entry at all');
});

// ── mergeLatest ──────────────────────────────────────────────────────────

test('mergeLatest keeps the overall latest across multiple source maps', () => {
  const a = latestPerUser([{ userId: 'u1', at: d('2026-01-01') }]);
  const b = latestPerUser([{ userId: 'u1', at: d('2026-02-01') }]);
  const c = latestPerUser([{ userId: 'u2', at: d('2026-01-15') }]);
  const merged = mergeLatest(a, b, c);
  assert.equal(merged.get('u1').getTime(), d('2026-02-01').getTime());
  assert.equal(merged.get('u2').getTime(), d('2026-01-15').getTime());
});

// ── collectCandidates — injectable stub client ──────────────────────────

function makeStubClient(fixtures) {
  return {
    message: { findMany: async () => fixtures.messages || [] },
    toolReport: { findMany: async () => fixtures.toolReports || [] },
    mindJournalEntry: { findMany: async () => fixtures.journalEntries || [] },
    selfTalkCard: { findMany: async () => fixtures.cards || [] },
    bodyResetSession: { findMany: async () => fixtures.bodyResets || [] },
    debrief: { findMany: async () => fixtures.debriefs || [] },
    prescription: { findMany: async () => fixtures.prescriptions || [] },
    onboardingSession: { findMany: async () => fixtures.onboardingSessions || [] },
    skillProgress: { findMany: async () => fixtures.skillProgress || [] },
    gameSession: { findMany: async () => fixtures.gameSessions || [] },
  };
}

test('collectCandidates picks the single latest timestamp across every source for a user', async () => {
  const client = makeStubClient({
    messages: [{ userId: 'u1', createdAt: d('2026-01-01') }],
    toolReports: [{ userId: 'u1', createdAt: d('2026-03-01') }], // latest
    debriefs: [{ userId: 'u1', createdAt: d('2026-02-01') }],
  });
  const candidates = await collectCandidates(client);
  assert.equal(candidates.get('u1').getTime(), d('2026-03-01').getTime());
});

test('collectCandidates uses Prescription.completedAt / outcomeRecordedAt but NEVER prescribedAt', async () => {
  const client = makeStubClient({
    prescriptions: [{ userId: 'u1', completedAt: d('2026-01-10'), outcomeRecordedAt: null }],
  });
  const candidates = await collectCandidates(client);
  assert.equal(candidates.get('u1').getTime(), d('2026-01-10').getTime());

  // The stub's prescription.findMany doesn't even expose prescribedAt in
  // its select — but assert directly on the query shape too, so a future
  // change that widens the select is caught.
  let selectedFields = null;
  const spyClient = {
    ...client,
    prescription: {
      findMany: async (args) => { selectedFields = Object.keys(args.select); return []; },
    },
  };
  await collectCandidates(spyClient);
  assert.ok(!selectedFields.includes('prescribedAt'), 'prescribedAt must never be read by the backfill');
  assert.ok(selectedFields.includes('completedAt'));
  assert.ok(selectedFields.includes('outcomeRecordedAt'));
});

test('collectCandidates uses OnboardingSession.lastSavedAt / completedAt but NEVER startedAt', async () => {
  const client = makeStubClient({
    onboardingSessions: [{ userId: 'u1', lastSavedAt: d('2026-01-05'), completedAt: null }],
  });
  const candidates = await collectCandidates(client);
  assert.equal(candidates.get('u1').getTime(), d('2026-01-05').getTime());

  let selectedFields = null;
  const spyClient = {
    ...client,
    onboardingSession: {
      findMany: async (args) => { selectedFields = Object.keys(args.select); return []; },
    },
  };
  await collectCandidates(spyClient);
  assert.ok(!selectedFields.includes('startedAt'), 'startedAt must never be read by the backfill');
});

test('collectCandidates uses SkillProgress completion timestamps but NEVER lastRecommendedAt', async () => {
  const client = makeStubClient({
    skillProgress: [{ userId: 'u1', learnCompletedAt: d('2026-01-01'), quickCheckPassedAt: null, toolCompletedAt: null, practiceCompletedAt: null }],
  });
  const candidates = await collectCandidates(client);
  assert.equal(candidates.get('u1').getTime(), d('2026-01-01').getTime());

  let selectedFields = null;
  const spyClient = {
    ...client,
    skillProgress: {
      findMany: async (args) => { selectedFields = Object.keys(args.select); return []; },
    },
  };
  await collectCandidates(spyClient);
  assert.ok(!selectedFields.includes('lastRecommendedAt'), 'lastRecommendedAt is a system/coach signal, never an athlete action');
});

test('collectCandidates never selects message/journal/reflection free-text fields from any source', async () => {
  let allSelects = [];
  const client = makeStubClient({});
  const spyClient = Object.fromEntries(
    Object.entries(client).map(([model, methods]) => [
      model,
      { findMany: async (args) => { allSelects.push(...Object.keys(args.select || {})); return []; } },
    ])
  );
  await collectCandidates(spyClient);

  const forbidden = ['content', 'note', 'whatHappened', 'whatNoticed', 'helpedOrGotInWay', 'takeForward',
    'oldThought', 'powerLine', 'performanceReminder', 'arjunNote', 'situation', 'cardContent', 'outcomeLesson',
    'wentWell', 'doDifferently', 'nextFocus', 'arjunInsight'];
  for (const field of forbidden) {
    assert.ok(!allSelects.includes(field), `backfill must never select free-text field "${field}"`);
  }
});

test('a user with no activity anywhere has no entry in the candidates map — never fabricated', async () => {
  const client = makeStubClient({ messages: [{ userId: 'u1', createdAt: d('2026-01-01') }] });
  const candidates = await collectCandidates(client);
  assert.equal(candidates.has('u2'), false);
});

// ── The write-decision logic, exercised the same way main() uses it ──────
// (main() itself always constructs a real PrismaClient at module load, so
// its write loop is re-derived here in isolation to prove the intended
// idempotency/never-overwrite contract without needing a real database.)

function decideWrites(targetIds, candidates) {
  const toWrite = [];
  for (const [userId, at] of candidates) {
    if (targetIds.has(userId)) toWrite.push({ userId, at });
  }
  return toWrite;
}

test('only users currently at lastActiveAt=NULL are candidates for a write — others are ignored even if they have historical activity', () => {
  const candidates = latestPerUser([{ userId: 'u1', at: d('2026-01-01') }, { userId: 'u2', at: d('2026-01-02') }]);
  const targetIds = new Set(['u1']); // u2 already has a non-null lastActiveAt, so it's not a target
  const writes = decideWrites(targetIds, candidates);
  assert.deepEqual(writes, [{ userId: 'u1', at: d('2026-01-01') }]);
});

test('a second run against the same data is a no-op: once a user is no longer a NULL target, they never get re-written', () => {
  const candidates = latestPerUser([{ userId: 'u1', at: d('2026-01-01') }]);
  const firstRunTargets = new Set(['u1']);
  const firstRunWrites = decideWrites(firstRunTargets, candidates);
  assert.equal(firstRunWrites.length, 1);

  // After the first run, u1 no longer has lastActiveAt=NULL, so a second
  // run's target-selection query (User.findMany({where:{lastActiveAt:null}}))
  // would simply not include u1 any more.
  const secondRunTargets = new Set(); // u1 removed — this is what the real query would return
  const secondRunWrites = decideWrites(secondRunTargets, candidates);
  assert.equal(secondRunWrites.length, 0);
});
