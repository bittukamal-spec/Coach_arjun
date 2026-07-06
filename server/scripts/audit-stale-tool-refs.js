// Read-only audit for stale/retired tool references (Before You Play,
// Bounce Back, Match Day, Ritual, "Focus Training") across the tables
// that could plausibly contain them. Prints counts only — never deletes,
// updates, or otherwise modifies any row.
//
// Run against a real database with:
//   cd server && node scripts/audit-stale-tool-refs.js
//
// This does NOT run automatically anywhere — it's a manual diagnostic
// to run before deciding on any cleanup action from the audit plan.

require('dotenv').config();
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const TEXT_PATTERNS = [
  'Before You Play', 'before-you-play', 'before_you_play',
  'Bounce Back', 'bounce-back', 'bounce_back',
  'Match Day', 'match day',
  'Focus Training', 'focus-training', 'focus_training',
  'Ritual',
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
  console.log('Stale tool reference audit — READ ONLY, no rows modified.\n');

  console.log('--- Message.content (chat history, may contain old [APP:...] tags or free text) ---');
  console.log(await countTextMatches('message', 'content'));

  console.log('\n--- UserMemory.value (AI-extracted long-term facts) ---');
  console.log(await countTextMatches('userMemory', 'value'));

  console.log('\n--- ToolReport.toolType (exact match — retired tool writers) ---');
  console.log({
    bounce_back: await prisma.toolReport.count({ where: { toolType: 'bounce_back' } }),
    cue_word:    await prisma.toolReport.count({ where: { toolType: 'cue_word' } }),
  });

  console.log('\n--- ToolReport.summary / arjunResponse (free text) ---');
  console.log('summary:', await countTextMatches('toolReport', 'summary'));
  console.log('arjunResponse:', await countTextMatches('toolReport', 'arjunResponse'));

  console.log('\n--- ChatSession.sessionType (exact match — dead session types) ---');
  console.log({
    pressure_reset: await prisma.chatSession.count({ where: { sessionType: 'pressure_reset' } }),
    setback_reset:  await prisma.chatSession.count({ where: { sessionType: 'setback_reset' } }),
  });

  console.log('\n--- WeeklyReport.content (AI-generated weekly summaries) ---');
  console.log(await countTextMatches('weeklyReport', 'content'));

  console.log('\nDone. No rows were modified by this script.');
}

main()
  .catch(err => { console.error('Audit failed:', err); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());
