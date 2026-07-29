// Loads the athlete's CURRENT coaching focus for the chat system prompt.
//
// Mirrors loadConfirmedProfile: read-only, injectable client, returns null
// when there is nothing to inject. Falls back to the confirmed starting
// priority when no CurrentCoachingFocus row exists, so an existing athlete's
// focus block reads correctly without any backfill.
//
// Returns { label, phrase, source, updatedAt } or null.

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const { resolveCurrentFocus } = require('./currentFocus');

async function loadCurrentFocusContext(userId, language, client = prisma) {
  const [focusRow, profile] = await Promise.all([
    client.currentCoachingFocus.findUnique({ where: { userId } }),
    client.startingPerformanceProfile.findFirst({
      where: { userId, fitResponse: { not: null } },
      orderBy: { updatedAt: 'desc' },
      select: { agreedPriorityId: true, ruleOutput: true, confirmedAt: true, updatedAt: true },
    }),
  ]);
  if (!focusRow && !profile?.agreedPriorityId) return null;
  return resolveCurrentFocus({
    focusRow,
    profile,
    ruleOutput: profile?.ruleOutput || null,
    language,
  });
}

module.exports = { loadCurrentFocusContext };
