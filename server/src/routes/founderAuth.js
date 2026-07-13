const express = require('express');
const { verifyFounderPin, SESSION_TTL_SECONDS } = require('../services/founderAuth');
const founderAuthenticate = require('../middleware/founderAuthenticate');
const { founderLoginLimiter } = require('../middleware/rateLimits');

const router = express.Router();

// POST /api/founder/auth/login — exchanges the 4-digit founder PIN for a
// short-lived session token. Never distinguishes "wrong PIN" from "server
// misconfigured" in the response — verifyFounderPin already collapses both
// to the same `null`, so this handler has no way to leak the difference
// even if asked to.
router.post('/login', founderLoginLimiter, (req, res) => {
  const { pin } = req.body || {};
  const token = verifyFounderPin(pin);
  if (!token) {
    return res.status(401).json({ error: 'Authentication failed' });
  }
  res.json({ token, expiresIn: SESSION_TTL_SECONDS });
});

// GET /api/founder/auth/session — lets the client check whether its stored
// token is still valid without hitting a data endpoint.
router.get('/session', founderAuthenticate, (req, res) => {
  res.json({ valid: true, expiresAt: req.founderSession.exp });
});

module.exports = router;
