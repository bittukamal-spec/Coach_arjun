// Score-free Mind Journal (compatible rollout — replaces the visible Mental
// Fitness scoring experience). The legacy scored endpoint (mentalFitness.js)
// and its MentalFitnessEntry data are untouched; this is a separate,
// additive surface writing only to MindJournalEntry.
//
// PR 1 of the guided-reflection redesign: MindJournalEntry gained six
// nullable fields (entryType, contextType, whatHappened, whatNoticed,
// helpedOrGotInWay, takeForward). The currently deployed client still sends
// only { states, note } — that legacy shape keeps working unchanged. Coach
// context (loadMindJournalContext.js) is untouched in this PR — customState
// is stored and returned on the journal API but is not yet sent to Coach.

const express = require('express');
const { PrismaClient } = require('@prisma/client');
const authenticate = require('../middleware/authenticate');
const requireGuardianConsent = require('../middleware/requireGuardianConsent');
const { screenSafetyText, recordSafetyEvent, getSafetyGuidance } = require('../services/safety');
const { validateAllowedKeys, validateMindJournalEntry } = require('../services/mindJournal/validateEntry');

const prisma = new PrismaClient();

const MAX_ENTRIES = 20;
const POST_ALLOWED_KEYS = [
  'states', 'note', 'entryType', 'contextType',
  'whatHappened', 'whatNoticed', 'helpedOrGotInWay', 'takeForward',
  'customState',
];
const CONTEXT_ALLOWED_KEYS = ['enabled'];

function serializeEntry(entry) {
  return {
    id: entry.id,
    states: entry.states,
    note: entry.note,
    createdAt: entry.createdAt,
    // Legacy rows (created before this PR) have all six of these as
    // null — a deterministic, already-correct "quick note" shape.
    entryType: entry.entryType ?? null,
    contextType: entry.contextType ?? null,
    whatHappened: entry.whatHappened ?? null,
    whatNoticed: entry.whatNoticed ?? null,
    helpedOrGotInWay: entry.helpedOrGotInWay ?? null,
    takeForward: entry.takeForward ?? null,
    // Athlete-authored "Something else" label. Legacy rows serialize null.
    customState: entry.customState ?? null,
  };
}

// `client` and `consentMiddleware` are both injectable (same pattern as
// requireGuardianConsent / recordSafetyEvent elsewhere) so tests can
// exercise the route with a fixture instead of a real database and a real
// guardian-consent Prisma lookup; the default export below always uses the
// real Prisma client and the real requireGuardianConsent middleware.
function createMindJournalRouter(client = prisma, consentMiddleware = requireGuardianConsent) {
  const router = express.Router();

  router.post('/', authenticate, consentMiddleware, async (req, res) => {
    const keysCheck = validateAllowedKeys(req.body, POST_ALLOWED_KEYS);
    if (!keysCheck.valid) return res.status(400).json({ error: keysCheck.error });

    const shapeCheck = validateMindJournalEntry(req.body);
    if (!shapeCheck.valid) return res.status(400).json({ error: shapeCheck.error });
    const {
      entryType, contextType, states, customState, note,
      whatHappened, whatNoticed, helpedOrGotInWay, takeForward,
    } = shapeCheck.value;

    // Deterministic pre-LLM safety screen across every athlete-authored text
    // field, in a fixed order, stopping at the FIRST flagged field. On a
    // hit: zero Anthropic calls (none are made on this route anyway), the
    // raw text of EVERY field is never persisted — not the flagged one, and
    // not any other field from the same submission — no MindJournalEntry is
    // created, and a structured SafetyEvent (no note/excerpt/summary, and
    // never which field flagged) is recorded.
    let screen = { flagged: false };
    if (customState) screen = screenSafetyText(customState);
    if (!screen.flagged && note) screen = screenSafetyText(note);
    if (!screen.flagged && whatHappened) screen = screenSafetyText(whatHappened);
    if (!screen.flagged && whatNoticed) screen = screenSafetyText(whatNoticed);
    if (!screen.flagged && helpedOrGotInWay) screen = screenSafetyText(helpedOrGotInWay);
    if (!screen.flagged && takeForward) screen = screenSafetyText(takeForward);

    if (screen.flagged) {
      recordSafetyEvent(req.userId, 'mind_journal', screen.category, {
        riskLevel: screen.riskLevel,
        sourceType: 'mind_journal',
      });
      const user = await client.user.findUnique({ where: { id: req.userId }, select: { language: true } }).catch(() => null);
      return res.json({ safetyFlag: 'needs_support', guidance: getSafetyGuidance(screen.category, user?.language) });
    }

    const entry = await client.mindJournalEntry.create({
      data: {
        userId: req.userId,
        entryType,
        contextType,
        states,
        customState,
        note,
        whatHappened,
        whatNoticed,
        helpedOrGotInWay,
        takeForward,
      },
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
    const keysCheck = validateAllowedKeys(req.body, CONTEXT_ALLOWED_KEYS);
    if (!keysCheck.valid) return res.status(400).json({ error: keysCheck.error });
    const { enabled } = req.body;
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

  // ── DELETE /:id — delete one entry the athlete owns ─────────────────────
  // No PATCH /:id (no editing) and no GET /:id in this PR. Ownership is
  // checked by loading the row by id ALONE and comparing userId — a missing
  // id and an id owned by someone else return the identical 404, so the
  // response never reveals whether another athlete owns the id.
  router.delete('/:id', authenticate, consentMiddleware, async (req, res) => {
    const existing = await client.mindJournalEntry.findUnique({ where: { id: req.params.id } });
    if (!existing || existing.userId !== req.userId) {
      return res.status(404).json({ error: 'not_found' });
    }
    try {
      await client.mindJournalEntry.delete({ where: { id: req.params.id } });
      return res.json({ success: true });
    } catch (err) {
      console.error('mind journal delete error:', err);
      return res.status(500).json({ error: 'server_error' });
    }
  });

  return router;
}

module.exports = createMindJournalRouter();
module.exports.createMindJournalRouter = createMindJournalRouter;
