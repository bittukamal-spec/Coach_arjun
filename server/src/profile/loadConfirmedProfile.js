// Loads the athlete's CONFIRMED starting profile for the chat system prompt
// (PR 3). Returns null unless a profile exists AND the athlete has reviewed it
// (fitResponse set) — an unconfirmed inferred profile must never enter the
// prompt. Injectable client for tests.

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function loadConfirmedProfile(userId, language, client = prisma) {
  const profile = await client.startingPerformanceProfile.findFirst({
    where: { userId, fitResponse: { not: null } },
    orderBy: { updatedAt: 'desc' },
    include: { wordingVariants: true },
  });
  if (!profile) return null;
  const lang = language === 'hi' ? 'hi' : 'en';
  const variants = profile.wordingVariants || [];
  const w = variants.find((v) => v.language === lang) || variants[0] || null;
  return {
    fitResponse: profile.fitResponse,
    agreedPriorityId: profile.agreedPriorityId,
    sections: w?.sections || null,
  };
}

module.exports = { loadConfirmedProfile };
