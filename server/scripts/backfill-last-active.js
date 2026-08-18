// Pilot Tracking Phase 2A — one-time backfill of User.lastActiveAt for
// athletes who were active before this feature shipped.
//
// Safe by default: without --confirm this ONLY reads and reports what it
// would write — it never writes anything unless you pass --confirm
// explicitly. NOT run automatically anywhere (not on server boot, not in
// any deploy script) — this is a manual, one-time operation.
//
// For each User where lastActiveAt IS NULL, computes the latest of a fixed
// set of trustworthy, scalar, already-existing timestamps representing a
// real meaningful athlete action (never a page view, never a system/
// background write) and writes it — but ONLY if a candidate is found, and
// ONLY if lastActiveAt is still NULL at write time (a conditional
// updateMany, safe against a race with live traffic setting it via
// touchActivity in the meantime). A user with no qualifying historical
// activity anywhere is left NULL — never fabricated.
//
// Sources included (scalar timestamps only — no message/journal/reflection
// text is ever read or logged):
//   - Message.createdAt WHERE role='user'
//   - ToolReport.createdAt (one row per completed tool use)
//   - MindJournalEntry.createdAt
//   - SelfTalkCard.createdAt and .lastUsedAt
//   - BodyResetSession.completedAt
//   - Debrief.createdAt
//   - Prescription.completedAt and .outcomeRecordedAt
//   - OnboardingSession.lastSavedAt and .completedAt
//   - SkillProgress.learnCompletedAt / quickCheckPassedAt / toolCompletedAt
//     / practiceCompletedAt
//   - GameSession.completedAt
//
// Deliberately EXCLUDED (matches touchActivity's own exclusions):
//   - Prescription.prescribedAt — being prescribed something is not the
//     athlete doing anything.
//   - OnboardingSession.startedAt — starting is not progress; lastSavedAt/
//     completedAt already cover real progress.
//   - SkillProgress.lastRecommendedAt — that's Arjun recommending
//     something TO the athlete, not an athlete action.
//   - WeeklyReport, User.updatedAt, UserAchievement.earnedAt, SafetyEvent,
//     any founder/payment/webhook/guardian/login timestamp — none of these
//     represent athlete product use, matching touchActivity's own rules.
//
// Usage:
//   cd server && node scripts/backfill-last-active.js            # dry run — report only
//   cd server && node scripts/backfill-last-active.js --confirm  # writes lastActiveAt

require('dotenv').config();
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const CONFIRM = process.argv.includes('--confirm');

// Pure, unit-testable: given rows shaped { userId, at: Date|null }, returns
// a Map<userId, Date> of the latest non-null `at` per user. Exported below.
function latestPerUser(rows) {
  const map = new Map();
  for (const { userId, at } of rows) {
    if (!at) continue;
    const current = map.get(userId);
    if (!current || at > current) map.set(userId, at);
  }
  return map;
}

// Merges any number of per-user latest-timestamp maps into one, keeping the
// overall latest per user across all of them.
function mergeLatest(...maps) {
  const out = new Map();
  for (const map of maps) {
    for (const [userId, at] of map) {
      const current = out.get(userId);
      if (!current || at > current) out.set(userId, at);
    }
  }
  return out;
}

// Injectable client for tests (same pattern as founderPilotOverview.js /
// activityTracking.js). Returns Map<userId, Date> — the latest trustworthy
// activity timestamp found for each user across every source above.
async function collectCandidates(client = prisma) {
  const [
    messages, toolReports, journalEntries, cards, bodyResets, debriefs,
    prescriptions, onboardingSessions, skillProgress, gameSessions,
  ] = await Promise.all([
    client.message.findMany({ where: { role: 'user' }, select: { userId: true, createdAt: true } }),
    client.toolReport.findMany({ select: { userId: true, createdAt: true } }),
    client.mindJournalEntry.findMany({ select: { userId: true, createdAt: true } }),
    client.selfTalkCard.findMany({ select: { userId: true, createdAt: true, lastUsedAt: true } }),
    client.bodyResetSession.findMany({ select: { userId: true, completedAt: true } }),
    client.debrief.findMany({ select: { userId: true, createdAt: true } }),
    client.prescription.findMany({ select: { userId: true, completedAt: true, outcomeRecordedAt: true } }),
    client.onboardingSession.findMany({ select: { userId: true, lastSavedAt: true, completedAt: true } }),
    client.skillProgress.findMany({
      select: {
        userId: true, learnCompletedAt: true, quickCheckPassedAt: true,
        toolCompletedAt: true, practiceCompletedAt: true,
      },
    }),
    client.gameSession.findMany({ select: { userId: true, completedAt: true } }),
  ]);

  return mergeLatest(
    latestPerUser(messages.map((m) => ({ userId: m.userId, at: m.createdAt }))),
    latestPerUser(toolReports.map((t) => ({ userId: t.userId, at: t.createdAt }))),
    latestPerUser(journalEntries.map((j) => ({ userId: j.userId, at: j.createdAt }))),
    latestPerUser(cards.map((c) => ({ userId: c.userId, at: c.createdAt }))),
    latestPerUser(cards.map((c) => ({ userId: c.userId, at: c.lastUsedAt }))),
    latestPerUser(bodyResets.map((b) => ({ userId: b.userId, at: b.completedAt }))),
    latestPerUser(debriefs.map((d) => ({ userId: d.userId, at: d.createdAt }))),
    latestPerUser(prescriptions.map((p) => ({ userId: p.userId, at: p.completedAt }))),
    latestPerUser(prescriptions.map((p) => ({ userId: p.userId, at: p.outcomeRecordedAt }))),
    latestPerUser(onboardingSessions.map((o) => ({ userId: o.userId, at: o.lastSavedAt }))),
    latestPerUser(onboardingSessions.map((o) => ({ userId: o.userId, at: o.completedAt }))),
    latestPerUser(skillProgress.map((s) => ({ userId: s.userId, at: s.learnCompletedAt }))),
    latestPerUser(skillProgress.map((s) => ({ userId: s.userId, at: s.quickCheckPassedAt }))),
    latestPerUser(skillProgress.map((s) => ({ userId: s.userId, at: s.toolCompletedAt }))),
    latestPerUser(skillProgress.map((s) => ({ userId: s.userId, at: s.practiceCompletedAt }))),
    latestPerUser(gameSessions.map((g) => ({ userId: g.userId, at: g.completedAt }))),
  );
}

async function main() {
  console.log(`Pilot Tracking Phase 2A backfill — ${CONFIRM ? 'LIVE (will write lastActiveAt)' : 'DRY RUN (report only)'}\n`);

  const targets = await prisma.user.findMany({ where: { lastActiveAt: null }, select: { id: true } });
  console.log(`${targets.length} user(s) currently have lastActiveAt = NULL.`);
  if (targets.length === 0) {
    console.log('Nothing to backfill.');
    return;
  }

  const candidates = await collectCandidates(prisma);
  const targetIds = new Set(targets.map((u) => u.id));

  let toUpdate = 0;
  let leftNull = 0;
  for (const id of targetIds) {
    if (candidates.has(id)) toUpdate += 1; else leftNull += 1;
  }
  console.log(`${toUpdate} user(s) have a trustworthy historical activity timestamp and will be backfilled.`);
  console.log(`${leftNull} user(s) have no qualifying activity and will remain NULL (never fabricated).`);

  if (!CONFIRM) {
    console.log('\nDry run — no rows written. Re-run with --confirm to write lastActiveAt for the users above.');
    return;
  }

  let written = 0;
  for (const [userId, at] of candidates) {
    if (!targetIds.has(userId)) continue;
    // Conditional on lastActiveAt still being NULL at write time — never
    // overwrites a value touchActivity (or a prior partial run) may have
    // already set since the read above.
    const result = await prisma.user.updateMany({
      where: { id: userId, lastActiveAt: null },
      data: { lastActiveAt: at },
    });
    written += result.count;
  }
  console.log(`\nDone. Wrote lastActiveAt for ${written} user(s).`);
}

module.exports = { latestPerUser, mergeLatest, collectCandidates };

if (require.main === module) {
  main()
    .catch((err) => { console.error('Backfill failed:', err); process.exitCode = 1; })
    .finally(() => prisma.$disconnect());
}
