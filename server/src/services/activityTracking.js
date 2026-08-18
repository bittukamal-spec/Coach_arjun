// Pilot Tracking Phase 2A — meaningful-activity timestamp.
//
// touchActivity(userId) is the ONLY writer of User.lastActiveAt. It is
// called from route handlers, always AFTER the athlete's actual product
// write has already succeeded — never before, and never as part of the
// same transaction as the athlete-critical write (with the one deliberate
// exception documented at the Prescription-completion call site, which
// already runs inside its own transaction for unrelated reasons).
//
// This function must NEVER cause a successful athlete action to fail. Any
// Prisma/database error here is caught, logged (message only — no userId,
// no stack containing request data), and swallowed. Callers should
// `await` it (so tests can assert on it deterministically and so a slow
// write doesn't race the response), but its failure is invisible to the
// caller's own success/error path.
//
// Same injectable-Prisma-client pattern as founderSafetyEvents.js /
// founderPilotOverview.js, for testability without a real database.

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

function createTouchActivity(client = prisma) {
  return async function touchActivity(userId, occurredAt = new Date()) {
    if (!userId) return;
    try {
      await client.user.update({
        where: { id: userId },
        data: { lastActiveAt: occurredAt },
      });
    } catch (err) {
      // Never rethrown — a failed activity touch must never turn a
      // successful athlete action into an error response. No userId, no
      // request data, message only.
      console.error('[activity] touchActivity failed:', err?.message);
    }
  };
}

module.exports = {
  createTouchActivity,
  touchActivity: createTouchActivity(),
};
