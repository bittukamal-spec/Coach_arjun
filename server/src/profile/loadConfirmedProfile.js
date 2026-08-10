// Loads the athlete's CONFIRMED starting profile for the chat system prompt
// (PR 3). Returns null unless a profile exists AND the athlete has reviewed it
// (fitResponse set) — an unconfirmed inferred profile must never enter the
// prompt. Injectable client for tests.

const { PrismaClient } = require('@prisma/client');
const { buildStartingPattern, buildHelps } = require('./displayProfile');
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

  // Deterministic background, straight from the stored rule output: the
  // situation, what happens first, what it does to their performance, how long
  // it lasts, plus what helps and their strengths. No AI, no new inference —
  // the same pure builders the profile screen uses. It is BACKGROUND ONLY;
  // the prompt says so explicitly (see buildSystemPrompt).
  const ro = profile.ruleOutput || {};
  const pattern = buildStartingPattern(ro, lang);
  const { supports, strengths } = buildHelps(ro, lang);

  return {
    fitResponse: profile.fitResponse,
    agreedPriorityId: profile.agreedPriorityId,
    sections: w?.sections || null,
    situation: pattern.situation || null,
    patternSteps: (pattern.nodes || []).map((n) => ({ type: n.type, label: n.label, text: n.text })),
    supports: supports.map((s) => s.label),
    strengths: strengths.map((s) => s.label),
  };
}

module.exports = { loadConfirmedProfile };
