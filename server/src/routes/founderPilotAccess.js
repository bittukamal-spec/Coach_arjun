const express = require('express');
const { PrismaClient } = require('@prisma/client');
const founderAuthenticate = require('../middleware/founderAuthenticate');

// Founder-only Pilot Access grant/revoke API. Guarded exclusively by the
// short-lived founder session token (founderAuthenticate) — same convention
// as founderSafetyEvents.js and founderPilotOverview.js.
//
// This is the ONLY writer of User.pilotAccessUntil / pilotAccessGrantedAt in
// the codebase. Both actions operate on exactly one athlete, chosen
// explicitly by the founder via `:id` — there is deliberately no
// bulk/all-user grant endpoint here, and nothing in this file ever queries
// or updates more than the single row named by `:id`. Entitlement
// precedence itself (premium → trial → pilot → blocked) lives in
// routes/chat.js's isEntitled(); this file only ever writes the two pilot
// columns that feed it.
//
// `createFounderPilotAccessRouter` is injectable for tests (same pattern as
// founderSafetyEvents.js/founderPilotOverview.js); the default export always
// uses the real Prisma client.

const GRANT_DURATION_MS = 60 * 24 * 60 * 60 * 1000; // 60 days

// Minimal shape returned after a grant/revoke — enough for the founder
// dashboard to update its own view without a second round-trip, nothing
// more (no email, no free-text profile fields — same discipline as
// founderPilotOverview.js's RECENT_ATHLETE_SELECT).
const PILOT_ACCESS_SELECT = {
  id: true,
  pilotAccessUntil: true,
  pilotAccessGrantedAt: true,
};

function createFounderPilotAccessRouter(client = new PrismaClient()) {
  const router = express.Router();

  // POST /:id/grant — sets pilotAccessUntil = now + 60 days,
  // pilotAccessGrantedAt = now. Re-granting an athlete who already has an
  // active (or expired) grant simply resets the 60-day window from now —
  // there is no accumulation/stacking.
  router.post('/:id/grant', founderAuthenticate, async (req, res) => {
    try {
      const existing = await client.user.findUnique({ where: { id: req.params.id }, select: { id: true } });
      if (!existing) return res.status(404).json({ error: 'Not found' });

      const now = new Date();
      const user = await client.user.update({
        where: { id: req.params.id },
        data: {
          pilotAccessUntil: new Date(now.getTime() + GRANT_DURATION_MS),
          pilotAccessGrantedAt: now,
        },
        select: PILOT_ACCESS_SELECT,
      });
      res.json({ user });
    } catch (err) {
      console.error('[founder] pilot-access grant error:', err?.message);
      res.status(500).json({ error: 'Server error' });
    }
  });

  // POST /:id/revoke — clears pilotAccessUntil only. pilotAccessGrantedAt
  // is deliberately left as-is: it records when the (now-revoked) grant was
  // made, for the founder's own reference, and isn't read by entitlement
  // logic at all.
  router.post('/:id/revoke', founderAuthenticate, async (req, res) => {
    try {
      const existing = await client.user.findUnique({ where: { id: req.params.id }, select: { id: true } });
      if (!existing) return res.status(404).json({ error: 'Not found' });

      const user = await client.user.update({
        where: { id: req.params.id },
        data: { pilotAccessUntil: null },
        select: PILOT_ACCESS_SELECT,
      });
      res.json({ user });
    } catch (err) {
      console.error('[founder] pilot-access revoke error:', err?.message);
      res.status(500).json({ error: 'Server error' });
    }
  });

  return router;
}

module.exports = createFounderPilotAccessRouter();
module.exports.createFounderPilotAccessRouter = createFounderPilotAccessRouter;
module.exports.GRANT_DURATION_MS = GRANT_DURATION_MS;
