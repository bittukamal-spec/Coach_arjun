const express = require('express');
const { contactLimiter } = require('../middleware/rateLimits');
// The service module itself is required (not destructured) so tests can
// swap `emailService.sendContactEmail` for a mock after this file has
// already loaded — a destructured reference would freeze the real
// implementation in at require time.
const emailService = require('../services/email');

const router = express.Router();

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
// Reject CR/LF/NUL in any field that ends up in an email header (name goes
// into the body only, but is checked too — belt and suspenders) so a
// visitor can't smuggle extra headers into the outgoing message.
const CONTROL_CHARS_RE = /[\r\n\0]/;

// Strict allow-list — the only reasons the server (and the email subject
// line) will ever recognise. Anything else is rejected, regardless of what
// else is in the request body.
const REASONS = {
  general: 'General',
  technical: 'Technical issue',
  billing: 'Subscription or billing',
  safety: 'Safety or privacy',
  partnership: 'Partnership',
};

// POST /api/contact — public, unauthenticated. Validates, applies the
// honeypot + rate limit, sends one email through the existing Resend
// helper, and never touches the database.
router.post('/', contactLimiter, async (req, res) => {
  const body = req.body || {};
  const { name, email, reason, message, website } = body;

  // Honeypot: real visitors never see or fill this field (hidden client-
  // side). A populated value means a bot — skip the send but still return a
  // generic success so the trap isn't detectable from the response.
  if (typeof website === 'string' && website.trim() !== '') {
    return res.json({ success: true });
  }

  const trimmedName = typeof name === 'string' ? name.trim() : '';
  const trimmedEmail = typeof email === 'string' ? email.trim() : '';
  const trimmedMessage = typeof message === 'string' ? message.trim() : '';

  if (trimmedName.length < 2 || trimmedName.length > 80 || CONTROL_CHARS_RE.test(trimmedName)) {
    return res.status(400).json({ error: 'Please enter a valid name.' });
  }
  if (
    trimmedEmail.length === 0 ||
    trimmedEmail.length > 254 ||
    !EMAIL_RE.test(trimmedEmail) ||
    CONTROL_CHARS_RE.test(trimmedEmail)
  ) {
    return res.status(400).json({ error: 'Please enter a valid email address.' });
  }
  if (typeof reason !== 'string' || !Object.prototype.hasOwnProperty.call(REASONS, reason)) {
    return res.status(400).json({ error: 'Please choose a reason.' });
  }
  if (trimmedMessage.length < 10 || trimmedMessage.length > 2000) {
    return res.status(400).json({ error: 'Please write a message between 10 and 2000 characters.' });
  }

  try {
    await emailService.sendContactEmail({
      name: trimmedName,
      email: trimmedEmail,
      reason,
      reasonLabel: REASONS[reason],
      message: trimmedMessage,
    });
    return res.json({ success: true });
  } catch (err) {
    // Diagnostic only — never the message body, and never the raw
    // provider error back to the visitor.
    console.error('[contact] email send failed:', err?.message);
    return res.status(500).json({ error: "We couldn't send your message. Please try again." });
  }
});

module.exports = router;
