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
      return res.json(svc.serializeProfile(profile, wording, user, session));
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
      const payload = svc.serializeProfile(profile, wording, user, session);
      if (safety?.flagged) { payload.safetyFlag = 'needs_support'; payload.guidance = safety.guidance; }
      return res.json(payload);
    } catch (e) {
      if (e.code === 'INVALID_FIT' || e.code === 'INVALID_CORRECTION') return res.status(400).json({ error: e.code });
      if (e.code === 'ONBOARDING_INCOMPLETE') return res.status(422).json({ error: 'ONBOARDING_INCOMPLETE' });
      console.error('[profile] POST /confirm failed:', e?.message);
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
