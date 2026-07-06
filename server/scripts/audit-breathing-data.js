// Read-only audit for the retired standalone Breathing / Calm Body tool.
// Prints counts only — never deletes, updates, or otherwise modifies any
// row. Run this BEFORE cleanup-breathing-data.js so you know what (if
// anything) actually exists in your real database.
//
// Context: the standalone Breathing tool (old /breathing route,
// BreathingPage.jsx) never wrote its own ToolReport or GameSession row —
// it only called POST /api/games/xp with gameType:'breathing', which
// (a) is not in games.js's validTypes list, so no GameSession row was ever
// created, and (b) bumps SkillProgress.toolCompletedAt for skillKey
// 'calm_body' — the SAME skillKey the kept Pressure Reset (body-reset)
// tool uses. That SkillProgress field is a single last-write-wins
// timestamp, not a log, so it cannot be attributed to Breathing vs.
// Pressure Reset after the fact, and it must NOT be deleted — deleting it
// would erase real Pressure Reset progress state. This script reports on
// it for visibility only; cleanup-breathing-data.js never touches it.
//
// Run against a real database with:
//   cd server && node scripts/audit-breathing-data.js

require('dotenv').config();
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const TEXT_PATTERNS = [
  'breathing', 'Breathing',
  'calm_body', 'calm-body', 'Calm Body', 'calmBody',
  'Start Breathing',
];

async function countTextMatches(model, field) {
  const results = {};
  for (const pattern of TEXT_PATTERNS) {
    results[pattern] = await prisma[model].count({
      where: { [field]: { contains: pattern, mode: 'insensitive' } },
    });
  }
  return results;
}

async function main() {
  console.log('Breathing / Calm Body data audit — READ ONLY, no rows modified.\n');

  console.log('--- ToolReport.toolType (exact match — the old tool never wrote one of these) ---');
  console.log({
    breathing: await prisma.toolReport.count({ where: { toolType: 'breathing' } }),
    calm_body: await prisma.toolReport.count({ where: { toolType: 'calm_body' } }),
  });

  console.log('\n--- ToolReport.skillKey = \'calm_body\' (SHARED with kept Pressure Reset — reported, NOT a delete target) ---');
  const calmBodySkillReports = await prisma.toolReport.count({ where: { skillKey: 'calm_body' } });
  console.log({ calm_body_skillKey_total: calmBodySkillReports, note: 'these rows are Pressure Reset completions written by bodyReset.js/games.js — do not delete' });

  console.log('\n--- ToolReport.summary / arjunResponse (free text) ---');
  console.log('summary:', await countTextMatches('toolReport', 'summary'));
  console.log('arjunResponse:', await countTextMatches('toolReport', 'arjunResponse'));

  console.log('\n--- GameSession.gameType (exact match — validTypes has always excluded \'breathing\') ---');
  console.log({ breathing: await prisma.gameSession.count({ where: { gameType: 'breathing' } }) });

  console.log('\n--- SkillProgress.skillKey = \'calm_body\' (SHARED with kept Pressure Reset — reported, NOT a delete target) ---');
  const calmBodySkillProgress = await prisma.skillProgress.count({ where: { skillKey: 'calm_body' } });
  console.log({ calm_body_skillProgress_total: calmBodySkillProgress, note: 'toolCompletedAt/lastRecommendedAt here belong to Pressure Reset now — do not delete' });

  console.log('\n--- UserMemory.value (AI-extracted long-term facts about the athlete) ---');
  console.log(await countTextMatches('userMemory', 'value'));
  console.log('Note: any matches here are likely the athlete\'s own self-reported habits (e.g. "uses breathing before big moments"), not old-tool recommendation data — review individually before deleting.');

  console.log('\n--- Message.content (chat history — may contain old [APP:breathing] tags or free text) ---');
  console.log(await countTextMatches('message', 'content'));
  console.log('Note: the client already ignores any [APP:breathing] tag (APP_TOOL_CONFIG has no entry for it) — historical messages cannot render a clickable old-tool card, so these do not need deletion.');

  console.log('\n--- WeeklyReport.content (AI-generated weekly summaries) ---');
  console.log(await countTextMatches('weeklyReport', 'content'));

  console.log('\n--- UserAchievement.key (exact match — no breathing-specific badge is defined in gamification.js) ---');
  console.log({
    breathing_badge: await prisma.userAchievement.count({ where: { key: { contains: 'breathing', mode: 'insensitive' } } }),
  });

  console.log('\n--- DrillCompletion (schema has no text field to match — drillIndex is an integer into the orphaned Daily Drill list; not applicable) ---');

  console.log('\nDone. No rows were modified by this script.');
}

main()
  .catch(err => { console.error('Audit failed:', err); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());
