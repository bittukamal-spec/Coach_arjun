// Backup + delete script for the retired standalone Breathing / Calm Body
// tool. Safe by default: without --confirm this ONLY backs up matching
// rows to a JSON file and prints what it found — it never deletes
// anything unless you pass --confirm explicitly.
//
// What this deletes (only if found — see audit-breathing-data.js first):
//   - ToolReport rows where toolType is exactly 'breathing' or 'calm_body'
//     (the current code never writes these toolType values — 'body_reset'
//     is what Pressure Reset uses — so any row matching this exact value
//     would be from a retired code path, not from the kept tool)
//   - GameSession rows where gameType is exactly 'breathing'
//     (games.js's validTypes has never included 'breathing' in this
//     repo's history, so this should always be zero, but is checked and
//     handled safely in case an older deploy wrote one)
//
// What this NEVER touches, on purpose:
//   - BodyResetSession (Pressure Reset's own session history)
//   - SkillProgress rows (skillKey 'calm_body' is the SHARED, KEPT
//     Pressure Reset skill identifier — deleting these would erase real
//     Pressure Reset progress state, not just old-tool data)
//   - Message / ChatSession (chat history is left alone; the client
//     already can't render a clickable card from an old [APP:breathing]
//     tag, so there is nothing unsafe left in old messages)
//   - UserMemory, WeeklyReport (free text — no structural "old tool"
//     data lives here; deleting by substring match risks deleting real,
//     unrelated athlete data)
//   - User, MentalFitnessEntry, SelfTalkCard, GameSession for any other
//     gameType, ToolReport for any other toolType
//
// Usage:
//   cd server && node scripts/cleanup-breathing-data.js            # dry run — backs up + reports only
//   cd server && node scripts/cleanup-breathing-data.js --confirm  # backs up, THEN deletes

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const CONFIRM = process.argv.includes('--confirm');

async function main() {
  console.log(`Breathing / Calm Body cleanup — ${CONFIRM ? 'LIVE (will delete after backup)' : 'DRY RUN (backup + report only)'}\n`);

  const toolReports = await prisma.toolReport.findMany({
    where: { toolType: { in: ['breathing', 'calm_body'] } },
  });
  const gameSessions = await prisma.gameSession.findMany({
    where: { gameType: 'breathing' },
  });

  console.log(`Found ${toolReports.length} ToolReport row(s) with toolType 'breathing'/'calm_body'.`);
  console.log(`Found ${gameSessions.length} GameSession row(s) with gameType 'breathing'.`);

  if (toolReports.length === 0 && gameSessions.length === 0) {
    console.log('\nNothing to back up or delete. The old Breathing tool never persisted its own rows in this database —');
    console.log('it only ever bumped the shared SkillProgress.calm_body.toolCompletedAt field, which is intentionally');
    console.log('preserved because it now belongs to the kept Pressure Reset tool. See audit-breathing-data.js for the');
    console.log('full picture (including that shared field, UserMemory, and Message — none of which need deletion).');
    return;
  }

  // ── Backup before anything else ──────────────────────────────────────────
  const backupDir = path.join(__dirname, '..', 'backups');
  fs.mkdirSync(backupDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupPath = path.join(backupDir, `breathing-data-backup-${stamp}.json`);
  fs.writeFileSync(backupPath, JSON.stringify({ toolReports, gameSessions }, null, 2));
  console.log(`\nBackup written to: ${backupPath}`);

  if (!CONFIRM) {
    console.log('\nDry run — no rows deleted. Re-run with --confirm to delete the rows backed up above.');
    return;
  }

  const deletedToolReports = await prisma.toolReport.deleteMany({
    where: { toolType: { in: ['breathing', 'calm_body'] } },
  });
  const deletedGameSessions = await prisma.gameSession.deleteMany({
    where: { gameType: 'breathing' },
  });

  console.log(`\nDeleted ${deletedToolReports.count} ToolReport row(s).`);
  console.log(`Deleted ${deletedGameSessions.count} GameSession row(s).`);
  console.log('\nDone. BodyResetSession, SkillProgress, Message, ChatSession, UserMemory, and WeeklyReport were not touched.');
}

main()
  .catch(err => { console.error('Cleanup failed:', err); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());
