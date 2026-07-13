const crypto = require('node:crypto');
const jwt = require('jsonwebtoken');

// Server-side founder PIN authentication (PR-6). Replaces the old
// browser-embedded PIN check (founder-dashboard's VITE_FOUNDER_PIN) with a
// real server verification step. The PIN and signing secret live only in
// server env config — never sent to, or readable by, the browser.
//
// Session tokens are signed JWTs (same library already used for athlete
// auth in middleware/authenticate.js) so verification reuses a proven,
// already-audited path rather than a bespoke crypto format.

const SESSION_TTL = '15m';
const SESSION_TTL_SECONDS = 15 * 60;
const FOUNDER_ROLE = 'founder';

// Constant-time PIN comparison — a plain `===` leaks timing information
// proportional to how many leading characters match, which is enough for an
// attacker to recover a 4-digit PIN via repeated timing measurements.
function pinsMatch(submitted, configured) {
  const a = Buffer.from(String(submitted));
  const b = Buffer.from(String(configured));
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

// Returns a signed session token on success, or null on ANY failure —
// wrong PIN, malformed PIN, or missing server configuration all return the
// identical `null`, so a caller cannot distinguish "PIN wrong" from
// "server misconfigured" from the return value alone. Missing configuration
// is logged (operationally necessary) but the submitted PIN itself is never
// logged or included in any response.
function verifyFounderPin(submittedPin) {
  const configuredPin = process.env.FOUNDER_PIN;
  const secret = process.env.FOUNDER_SESSION_SECRET;

  if (!configuredPin || !secret) {
    console.error('[founder-auth] FOUNDER_PIN or FOUNDER_SESSION_SECRET is not configured');
    return null; // fail closed
  }
  if (typeof submittedPin !== 'string' || !/^\d{4}$/.test(submittedPin)) {
    return null;
  }
  if (!pinsMatch(submittedPin, configuredPin)) {
    return null;
  }
  return jwt.sign({ role: FOUNDER_ROLE }, secret, { expiresIn: SESSION_TTL });
}

// Verifies signature and expiration. Returns the decoded payload on success,
// null on any failure (missing secret, malformed token, bad signature,
// expired token, or a token that isn't a founder session).
function verifyFounderSessionToken(token) {
  const secret = process.env.FOUNDER_SESSION_SECRET;
  if (!secret || !token) return null;
  try {
    const decoded = jwt.verify(token, secret);
    return decoded && decoded.role === FOUNDER_ROLE ? decoded : null;
  } catch {
    return null;
  }
}

module.exports = {
  verifyFounderPin,
  verifyFounderSessionToken,
  SESSION_TTL_SECONDS,
};
