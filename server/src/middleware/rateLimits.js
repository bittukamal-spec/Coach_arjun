const rateLimit = require('express-rate-limit');

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
const aiLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 30,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  keyGenerator: (req) => req.userId || req.ip,
  message: { error: 'Too many requests. Give it a minute, then continue.' },
});

module.exports = { authLimiter, aiLimiter };
