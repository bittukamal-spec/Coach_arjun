const rateLimit = require('express-rate-limit');
const { ipKeyGenerator } = rateLimit;

// Auth endpoints: 5 attempts per 15 minutes per IP (login, register, forgot-password).
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 5,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: 'Too many attempts. Please try again in 15 minutes.' },
});

// AI endpoints: 30 requests per minute per authenticated user.
// Mounted AFTER authenticate so req.userId exists; falls back to IP just in case.
// The IP fallback goes through ipKeyGenerator (express-rate-limit's IPv6-safe
// helper) instead of the raw `req.ip` string, which is what previously
// produced an ERR_ERL_KEY_GEN_IPV6 warning on every request.
const aiLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 30,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  keyGenerator: (req) => req.userId || ipKeyGenerator(req.ip),
  message: { error: 'Too many requests. Give it a minute, then continue.' },
});

// Founder login: 5 failed attempts per 15 minutes per IP, then a temporary
// lockout. `skipSuccessfulRequests` means a correct PIN never counts against
// the limit — only failed attempts do. Uses the default keyGenerator
// (already IPv6-safe), so no custom one is needed here.
const founderLoginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 5,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  message: { error: 'Too many attempts. Please try again later.' },
});

// Public contact form: 5 submissions per hour per IP. Unauthenticated route,
// so this always keys off IP (via the IPv6-safe helper, same as aiLimiter's
// fallback) — there is no req.userId to prefer.
const contactLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 5,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  keyGenerator: (req) => ipKeyGenerator(req.ip),
  message: { error: 'Too many messages sent. Please try again later.' },
});

module.exports = { authLimiter, aiLimiter, founderLoginLimiter, contactLimiter };
