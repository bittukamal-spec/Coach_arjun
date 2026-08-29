const express = require('express');
const authenticate = require('../middleware/authenticate');
const { touchPresence: defaultTouchPresence } = require('../services/presence');

// Pilot Presence Tracking — athlete-facing surface.
//
// POST /presence is the ONLY route that writes User.lastSeenAt (via
// services/presence.js's touchPresence — never called inline here so the
// write path stays the same single well-tested function whether it's this
// endpoint or a future call site). userId always comes from the verified
// JWT (`authenticate` sets req.userId) — never from the request body, so
// an athlete can never touch another athlete's presence.
//
// Deliberately does nothing else: no XP, no ToolReport, no
// touchActivity()/lastActiveAt write, no Coach/Mind Journal side effect.
// touchPresence() already swallows its own DB errors (never throws), so
// this always responds 200 — a presence touch must never surface as an
// athlete-facing error.
//
// `createActivityRouter` is injectable (the touchPresence function itself,
// same seam activityTracking.js's callers use in their own tests) for
// testability without a real database; the default export always uses the
// real one.

function createActivityRouter(touchPresenceFn = defaultTouchPresence) {
  const router = express.Router();

  router.post('/presence', authenticate, async (req, res) => {
    await touchPresenceFn(req.userId);
    res.json({ ok: true });
  });

  return router;
}

module.exports = createActivityRouter();
module.exports.createActivityRouter = createActivityRouter;
