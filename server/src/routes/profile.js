// Starting Performance Profile routes (PR 3). Auth required. Profile view +
// confirm are NOT consent-gated (pending minors may view/confirm). start-chat
// IS consent-gated (interactive coaching stays locked until guardian consent).
// Injectable client + deps so tests never hit a real DB or the Anthropic API.

const express = require('express');
const { PrismaClient } = require('@prisma/client');
const authenticate = require('../middleware/authenticate');
const defaultConsent = require('../middleware/requireGuardianConsent');
const svc = require('../profile/profileService');

const prisma = new PrismaClient();

const USER_SELECT = { id: true, name: true, language: true, dateOfBirth: true, guardianConsentAt: true, guardianEmail: true };

function createProfileRouter(client = prisma, deps = {}) {
  const router = express.Router();
  const consentMiddleware = deps.requireGuardianConsent || defaultConsent;

  router.get('/starting', authenticate, async (req, res) => {
    try {
      const user = await client.user.findUnique({ where: { id: req.userId }, select: USER_SELECT });
      if (!user) return res.status(404).json({ error: 'User not found' });
      const { profile, session } = await svc.getOrCreateProfile(client, req.userId);
      const wording = await svc.getOrCreateWording(client, profile, user, user.language || 'en', deps);
      const focusRow = await svc.loadCurrentFocus(client, req.userId);
      return res.json(svc.serializeProfile(profile, wording, user, session, focusRow));
    } catch (e) {
      if (e.code === 'ONBOARDING_INCOMPLETE') return res.status(422).json({ error: 'ONBOARDING_INCOMPLETE' });
      console.error('[profile] GET /starting failed:', e?.message);
      return res.status(500).json({ error: 'Server error' });
    }
  });

  router.post('/confirm', authenticate, async (req, res) => {
    try {
      const { profile, session, safety } = await svc.confirmProfile(client, req.userId, req.body || {}, deps);
      const user = await client.user.findUnique({ where: { id: req.userId }, select: USER_SELECT });
      const wording = await svc.getOrCreateWording(client, profile, user, user.language || 'en', deps);
      const focusRow = await svc.loadCurrentFocus(client, req.userId);
      const payload = svc.serializeProfile(profile, wording, user, session, focusRow);
      if (safety?.flagged) { payload.safetyFlag = 'needs_support'; payload.guidance = safety.guidance; }
      return res.json(payload);
    } catch (e) {
      if (e.code === 'INVALID_FIT' || e.code === 'INVALID_CORRECTION') return res.status(400).json({ error: e.code });
      if (e.code === 'ONBOARDING_INCOMPLETE') return res.status(422).json({ error: 'ONBOARDING_INCOMPLETE' });
      console.error('[profile] POST /confirm failed:', e?.message);
      return res.status(500).json({ error: 'Server error' });
    }
  });

  // ── PATCH /current-focus — the athlete changes what they're working on ────
  // Writes only the CurrentCoachingFocus row. The starting profile stays
  // frozen, and no CoachingCycle, Prescription, ChatSession or Message is
  // created here. NOT consent-gated: it is a saved preference, not coaching.
  router.patch('/current-focus', authenticate, async (req, res) => {
    try {
      const user = await client.user.findUnique({ where: { id: req.userId }, select: USER_SELECT });
      if (!user) return res.status(404).json({ error: 'User not found' });

      const result = await svc.updateCurrentFocus(client, req.userId, req.body || {}, deps);
      if (!result.saved) {
        // Safety-flagged custom text: nothing stored, support guidance shown.
        return res.status(200).json({ saved: false, safetyFlag: 'needs_support', guidance: result.safety.guidance });
      }

      const { profile, session } = await svc.getOrCreateProfile(client, req.userId);
      const wording = await svc.getOrCreateWording(client, profile, user, user.language || 'en', deps);
      const payload = svc.serializeProfile(profile, wording, user, session, result.focusRow);
      return res.json({ saved: true, currentFocus: payload.profile.displayProfile.currentFocus });
    } catch (e) {
      if (e.code === 'INVALID_FOCUS' || e.code === 'INVALID_FOCUS_TEXT') {
        return res.status(400).json({ error: e.code });
      }
      if (e.code === 'OUT_OF_SCOPE_FOCUS') {
        // A fixed reason code only — the athlete's text is never echoed back
        // or logged. The client shows its own localised scope message.
        console.warn(`[profile] focus out of scope: ${e.reasonCode}`);
        return res.status(400).json({ error: 'OUT_OF_SCOPE_FOCUS' });
      }
      if (e.code === 'ONBOARDING_INCOMPLETE') return res.status(422).json({ error: 'ONBOARDING_INCOMPLETE' });
      // Never log the athlete's own focus text.
      console.error('[profile] PATCH /current-focus failed:', e?.message);
      return res.status(500).json({ error: 'Server error' });
    }
  });

  // ── PATCH /answers — Performance Check-in save. NOT consent-gated (a
  // saved preference/answer update, not coaching, same class as
  // /current-focus above). Whitelist-enforced server-side in
  // updateProfileAnswers; see its comment for the full safety contract.
  const CHECKIN_ERROR_STATUS = {
    INVALID_QUESTION: 400, INVALID_QUESTION_ID: 400, INVALID_ANSWER_ID: 400,
    LIMIT_EXCEEDED: 400, EXCLUSIVE_CONFLICT: 400, INVALID_CUSTOM_TEXT: 400, BRANCH_MISMATCH: 400,
  };
  router.patch('/answers', authenticate, async (req, res) => {
    try {
      const user = await client.user.findUnique({ where: { id: req.userId }, select: USER_SELECT });
      if (!user) return res.status(404).json({ error: 'User not found' });

      const { profile, session } = await svc.updateProfileAnswers(client, req.userId, req.body || {});
      const wording = await svc.getOrCreateWording(client, profile, user, user.language || 'en', deps);
      const focusRow = await svc.loadCurrentFocus(client, req.userId);
      return res.json(svc.serializeProfile(profile, wording, user, session, focusRow));
    } catch (e) {
      if (e.code === 'ONBOARDING_INCOMPLETE') return res.status(422).json({ error: 'ONBOARDING_INCOMPLETE' });
      if (CHECKIN_ERROR_STATUS[e.code]) {
        return res.status(CHECKIN_ERROR_STATUS[e.code]).json({ error: e.code, questionId: e.questionId });
      }
      console.error('[profile] PATCH /answers failed:', e?.message);
      return res.status(500).json({ error: 'Server error' });
    }
  });

  router.post('/start-chat', authenticate, consentMiddleware, async (req, res) => {
    try {
      const { chatSessionId } = await svc.startFirstChat(client, req.userId, deps);
      return res.json({ chatSessionId });
    } catch (e) {
      if (e.code === 'NOT_CONFIRMED') return res.status(400).json({ error: 'NOT_CONFIRMED' });
      if (e.code === 'ONBOARDING_INCOMPLETE') return res.status(422).json({ error: 'ONBOARDING_INCOMPLETE' });
      console.error('[profile] POST /start-chat failed:', e?.message);
      return res.status(500).json({ error: 'Server error' });
    }
  });

  return router;
}

module.exports = createProfileRouter();
module.exports.createProfileRouter = createProfileRouter;
