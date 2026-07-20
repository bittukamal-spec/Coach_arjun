// Shared seven-day chat-cycle boundary — the ONE deterministic definition
// of when a coaching chat cycle completes, used by both the chat-cycle
// rollover (routes/sessions.js) and weekly-review generation
// (routes/weeklyReports.js).
//
// A cycle is anchored to its OWN active main ChatSession's createdAt and
// lasts exactly seven days from that moment. It never resets merely
// because the calendar reached a Monday: a session created on a Sunday is
// still only one day old the next morning and stays active until the
// following Sunday. Historical WeeklyReport rows written under the old
// Monday-UTC keying are left exactly as stored — nothing here rereads or
// rewrites them.

const CYCLE_LENGTH_MS = 7 * 24 * 60 * 60 * 1000;

// True once the session has existed for a full seven days (boundary
// inclusive: exactly seven days old ⇒ completed).
function cycleCompleted(createdAt, now) {
  return now.getTime() - new Date(createdAt).getTime() >= CYCLE_LENGTH_MS;
}

// Latest createdAt (inclusive) that counts as a completed cycle at `now` —
// used directly in a `createdAt: { lte: … }` filter.
function cycleRolloverBoundary(now) {
  return new Date(now.getTime() - CYCLE_LENGTH_MS);
}

module.exports = { CYCLE_LENGTH_MS, cycleCompleted, cycleRolloverBoundary };
