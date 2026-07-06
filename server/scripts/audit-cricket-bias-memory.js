// Read-only audit for stale UserMemory / Message rows that could be
// feeding Arjun a false "cricket is the priority / specialty" identity
// (e.g. a memory extracted from an old conversation before a user's
// profile sport was set to something else, or before it changed).
// Prints counts + a sample of matching rows. Never deletes or updates
// anything.
//
// Run against a real database with:
//   cd server && node scripts/audit-cricket-bias-memory.js

require('dotenv').config();
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const PATTERNS = [
  'cricket priority', 'cricket first', 'specialize in cricket',
  'specialise in cricket', 'cricketer', 'cricket is where',
  'cricket is my specialty', 'deepest understanding',
];

async function main() {
  console.log('Cricket-bias memory audit — READ ONLY, no rows modified.\n');

  console.log('--- UserMemory.value matches ---');
  for (const p of PATTERNS) {
    const rows = await prisma.userMemory.findMany({
      where: { value: { contains: p, mode: 'insensitive' } },
      select: { id: true, userId: true, memKey: true, value: true, updatedAt: true },
      take: 5,
    });
    if (rows.length > 0) {
      console.log(`\n"${p}" — ${rows.length} sample row(s):`);
      rows.forEach(r => console.log(`  [${r.id}] user ${r.userId} — ${r.memKey}: "${r.value}" (updated ${r.updatedAt.toISOString()})`));
    }
  }

  console.log('\n--- Users whose profile sport is NOT cricket but have a UserMemory row mentioning cricket ---');
  const cricketMemories = await prisma.userMemory.findMany({
    where: { value: { contains: 'cricket', mode: 'insensitive' } },
    select: { id: true, userId: true, memKey: true, value: true },
  });
  for (const m of cricketMemories) {
    const user = await prisma.user.findUnique({ where: { id: m.userId }, select: { sport: true } });
    if (user && user.sport && user.sport.toLowerCase() !== 'cricket') {
      console.log(`  [${m.id}] user ${m.userId} (profile sport: ${user.sport}) — ${m.memKey}: "${m.value}"`);
    }
  }

  console.log('\nDone. No rows were modified by this script.');
  console.log('If any rows above look stale/wrong, review them individually before deciding whether to delete or edit — do not bulk-delete.');
}

main()
  .catch(err => { console.error('Audit failed:', err); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());
