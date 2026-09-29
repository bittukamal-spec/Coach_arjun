const express = require('express');
const { PrismaClient } = require('@prisma/client');
const authenticate = require('../middleware/authenticate');
const activityTracking = require('../services/activityTracking');
const { screenSafetyFields, recordSafetyEvent, getSafetyGuidance } = require('../services/safety');
const { createRoutineStore } = require('../services/routines/routineStore');
const { collectLegacyRitualText } = require('../services/routines/legacyRitual');

const STEP_TYPES = ['breathe', 'cue', 'visualize', 'physical', 'custom'];

// Legacy single-ritual API, still used by the current /ritual UI and by any
// cached client. Request/response shapes are unchanged. Since the Ritual
// rebuild (PR 1) the save goes through the routine store so that, once the
// athlete's ritual has been imported into a Routine, both copies are updated
// in one transaction (see services/routines/routineStore.js).
//
// Saves are screened with the shared rules-only safety service before
// anything is written (neither the legacy fields nor a linked Routine). A
// flagged save returns 422 with the standard guidance, so the current client
// can show it and an older cached client falls back to its generic "could
// not save" — it can never believe unscreened text was saved.
function createRitualRouter(
  client = new PrismaClient(),
  store = createRoutineStore(client),
  safetyEvent = recordSafetyEvent,
) {
  const router = express.Router();
  const prisma = client;

  // GET /api/ritual/me — fetch user's saved ritual
  router.get('/me', authenticate, async (req, res) => {
    try {
      const user = await prisma.user.findUnique({
        where: { id: req.userId },
        select: { ritualName: true, ritualSteps: true },
      });
      const steps = JSON.parse(user?.ritualSteps || '[]');
      res.json({ ritualName: user?.ritualName || null, steps });
    } catch {
      res.status(500).json({ error: 'Server error' });
    }
  });

  // POST /api/ritual/me — save / update ritual
  router.post('/me', authenticate, async (req, res) => {
    const { ritualName, steps } = req.body;

    // One screen over the name and every step label, before validation so
    // distress text in an otherwise-invalid payload still reaches the safety
    // path, and before any write. One request → at most one event.
    const screen = screenSafetyFields(...collectLegacyRitualText(ritualName, steps));
    if (screen.flagged) {
      safetyEvent(req.userId, 'ritual', screen.category, {
        riskLevel: screen.riskLevel,
        sourceType: 'ritual_legacy_save',
      });
      const user = await prisma.user.findUnique({ where: { id: req.userId }, select: { language: true } }).catch(() => null);
      return res.status(422).json({
        error: 'needs_support',
        safetyFlag: 'needs_support',
        guidance: getSafetyGuidance(screen.category, user?.language),
      });
    }

    if (!ritualName || typeof ritualName !== 'string' || ritualName.trim().length === 0) {
      return res.status(400).json({ error: 'ritualName is required' });
    }
    if (!Array.isArray(steps) || steps.length === 0 || steps.length > 5) {
      return res.status(400).json({ error: 'steps must be an array of 1-5 items' });
    }
    for (const step of steps) {
      if (!STEP_TYPES.includes(step.type)) return res.status(400).json({ error: `Invalid step type: ${step.type}` });
      if (!step.label || typeof step.label !== 'string' || step.label.trim().length === 0) {
        return res.status(400).json({ error: 'Each step must have a label' });
      }
      if (step.label.length > 120) return res.status(400).json({ error: 'Step label too long (max 120 chars)' });
    }

    try {
      await store.saveLegacyRitual(req.userId, {
        ritualName: ritualName.trim(),
        steps: steps.map(s => ({ type: s.type, label: s.label.trim() })),
      });
      // Pilot Tracking Phase 2A — the athlete saved a pre-performance ritual.
      await activityTracking.touchActivity(req.userId);
      res.json({ ok: true });
    } catch {
      res.status(500).json({ error: 'Server error' });
    }
  });

  return router;
}

module.exports = createRitualRouter();
module.exports.createRitualRouter = createRitualRouter;
