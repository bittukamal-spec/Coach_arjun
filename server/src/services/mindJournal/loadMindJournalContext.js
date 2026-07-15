// Optional Arjun context load for the score-free Mind Journal (main
// coaching chat ONLY — never Quick Chat, profile-intro, weekly reports,
// visualization, self-talk generation, body reset, debrief, or any founder
// view). Makes no Anthropic call itself; purely a data read.

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const MAX_ENTRIES = 5;
const MAX_NOTE_LENGTH = 500;

// `prisma` is injectable (same pattern used throughout this codebase) so
// tests can supply a fixture instead of a real database; the default
// export below always uses the real Prisma client.
function createLoadMindJournalContext(client = prisma) {
  return async function loadMindJournalContext(userId) {
    const user = await client.user.findUnique({
      where: { id: userId },
      select: { mindJournalContextEnabled: true },
    });
    if (!user?.mindJournalContextEnabled) return null;

    const entries = await client.mindJournalEntry.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: MAX_ENTRIES,
    });
    if (!entries.length) return null;

    return entries.map((e) => ({
      states: Array.isArray(e.states) ? e.states.slice(0, 2) : [],
      note: typeof e.note === 'string' ? e.note.slice(0, MAX_NOTE_LENGTH) : null,
      createdAt: e.createdAt,
    }));
  };
}

module.exports = createLoadMindJournalContext();
module.exports.createLoadMindJournalContext = createLoadMindJournalContext;
