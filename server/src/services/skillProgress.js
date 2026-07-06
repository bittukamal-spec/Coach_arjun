const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

// Upserts one timestamp field on a user's SkillProgress row for a skill.
// Used both when a skill gets recommended (lastRecommendedAt) and when a
// matching tool/game is completed (toolCompletedAt / practiceCompletedAt).
// Fire-and-forget from callers — never blocks the response on failure.
async function markSkillProgress(userId, skillKey, field) {
  if (!userId || !skillKey || !field) return;
  try {
    await prisma.skillProgress.upsert({
      where: { userId_skillKey: { userId, skillKey } },
      update: { [field]: new Date() },
      create: { userId, skillKey, [field]: new Date() },
    });
  } catch (err) {
    console.error('[skillProgress] upsert failed:', err?.message);
  }
}

// How recently a skill was recommended, or null if never / not found.
async function getLastRecommendedAt(userId, skillKey) {
  if (!userId || !skillKey) return null;
  try {
    const row = await prisma.skillProgress.findUnique({
      where: { userId_skillKey: { userId, skillKey } },
      select: { lastRecommendedAt: true },
    });
    return row?.lastRecommendedAt || null;
  } catch (err) {
    console.error('[skillProgress] lookup failed:', err?.message);
    return null;
  }
}

module.exports = { markSkillProgress, getLastRecommendedAt };
