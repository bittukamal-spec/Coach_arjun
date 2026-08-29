// Pilot Presence Tracking — the ONLY writer of User.lastSeenAt.
//
// Deliberately separate from services/activityTracking.js's touchActivity()
// (User.lastActiveAt): this fires on mere "Arjun is open/visible" signals
// (app load, foreground return, a ~60s heartbeat while visible) and carries
// no meaning about whether the athlete did anything. Never called from
// touchActivity() or any meaningful-activity call site, and never touches
// lastActiveAt itself.
//
// Same never-fail contract as touchActivity(): any DB error here is caught,
// logged (message only), and swallowed — a presence touch must never turn
// into an athlete-facing error, and callers treat this as fire-and-forget.
//
// Same injectable-Prisma-client pattern as activityTracking.js, for
// testability without a real database.

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

function createTouchPresence(client = prisma) {
  return async function touchPresence(userId, occurredAt = new Date()) {
    if (!userId) return;
    try {
      await client.user.update({
        where: { id: userId },
        data: { lastSeenAt: occurredAt },
      });
    } catch (err) {
      console.error('[presence] touchPresence failed:', err?.message);
    }
  };
}

module.exports = {
  createTouchPresence,
  touchPresence: createTouchPresence(),
};
