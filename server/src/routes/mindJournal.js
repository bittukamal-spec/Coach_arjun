// Score-free Mind Journal (compatible rollout — replaces the visible Mental
// Fitness scoring experience). The legacy scored endpoint (mentalFitness.js)
// and its MentalFitnessEntry data are untouched; this is a separate,
// additive surface writing only to MindJournalEntry.

const express = require('express');
const { PrismaClient } = require('@prisma/client');
const authenticate = require('../middleware/authenticate');
const requireGuardianConsent = require('../middleware/requireGuardianConsent');
const { screenSafetyText, recordSafetyEvent, getSafetyGuidance } = require('../services/safety');
const { validateStates, validateNote } = require('../services/mindJournal/validateEntry');

const prisma = new PrismaClient();

const MAX_ENTRIES = 20;

function serializeEntry(entry) {
  return { id: entry.id, states: entry.states, note: entry.note, createdAt: entry.createdAt };
}

// `client` and `consentMiddleware` are both injectable (same pattern as
// requireGuardianConsent / recordSafetyEvent elsewhere) so tests can
// exercise the route with a fixture instead of a real database and a real
// guardian-consent Prisma lookup; the default export below always uses the
// real Prisma client and the real requireGuardianConsent middleware.
function createMindJournalRouter(client = prisma, consentMiddleware = requireGuardianConsent) {
  const router = express.Router();

  router.post('/', authenticate, consentMiddleware, async (req, res) => {
    const body = req.body || {};

    const statesCheck = validateStates(body.states);
    if (!statesCheck.valid) return res.status(400).json({ error: statesCheck.error });

    const noteCheck = validateNote(body.note);
    if (!noteCheck.valid) return res.status(400).json({ error: noteCheck.error });

    const note = noteCheck.value;

    // Deterministic pre-LLM safety screen on the athlete-authored note.
    // On a hit: zero Anthropic calls (none are made on this route anyway),
    // the raw note is never persisted, no MindJournalEntry is created, and
    // a structured SafetyEvent (no note/excerpt/summary) is recorded.
    if (note) {
      const screen = screenSafetyText(note);
      if (screen.flagged) {
        recordSafetyEvent(req.userId, 'mind_journal', screen.category, {
          riskLevel: screen.riskLevel,
          sourceType: 'mind_journal',
        });
        const user = await client.user.findUnique({ where: { id: req.userId }, select: { language: true } }).catch(() => null);
        return res.json({ safetyFlag: 'needs_support', guidance: getSafetyGuidance(screen.category, user?.language) });
      }
    }

    const entry = await client.mindJournalEntry.create({
      data: { userId: req.userId, states: body.states, note },
    });

    res.json({ entry: serializeEntry(entry) });
  });

  router.get('/', authenticate, consentMiddleware, async (req, res) => {
    const user = await client.user.findUnique({
      where: { id: req.userId },
      select: { mindJournalContextEnabled: true },
    });
    const entries = await client.mindJournalEntry.findMany({
      where: { userId: req.userId },
      orderBy: { createdAt: 'desc' },
      take: MAX_ENTRIES,
    });

    res.json({
      contextEnabled: !!user?.mindJournalContextEnabled,
      entries: entries.map(serializeEntry),
    });
  });

  router.patch('/context', authenticate, consentMiddleware, async (req, res) => {
    const { enabled } = req.body || {};
    if (typeof enabled !== 'boolean') {
      return res.status(400).json({ error: 'enabled must be a boolean' });
    }

    const user = await client.user.update({
      where: { id: req.userId },
      data: { mindJournalContextEnabled: enabled },
      select: { mindJournalContextEnabled: true },
    });

    res.json({ contextEnabled: user.mindJournalContextEnabled });
  });

  return router;
}

module.exports = createMindJournalRouter();
module.exports.createMindJournalRouter = createMindJournalRouter;
