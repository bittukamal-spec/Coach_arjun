// Score-free Mind Journal (compatible rollout — replaces the visible Mental
// Fitness scoring experience). The legacy scored endpoint (mentalFitness.js)
// and its MentalFitnessEntry data are untouched; this is a separate,
// additive surface writing only to MindJournalEntry.
//
// Coach context mapping lives in loadMindJournalContext.js (restricted
// pilot contract). This route stores/returns full journal fields; Coach
// only receives the loader's minimized projection when consent is on.

const express = require('express');
const { PrismaClient } = require('@prisma/client');
const authenticate = require('../middleware/authenticate');
const requireGuardianConsent = require('../middleware/requireGuardianConsent');
const { screenSafetyText, screenSafetyFields, recordSafetyEvent, getSafetyGuidance } = require('../services/safety');
const { validateAllowedKeys, validateMindJournalEntry } = require('../services/mindJournal/validateEntry');
const activityTracking = require('../services/activityTracking');
const { aiLimiter } = require('../middleware/rateLimits');
const { isTrialActive } = require('./chat');
const defaultGenerateReflectionReview = require('../services/mindJournal/generateReflectionReview');

const prisma = new PrismaClient();

const MAX_ENTRIES = 20;
// Prior reflections loaded purely to decide whether Arjun is even allowed to
// claim a pattern, and to give him something to compare against.
const MAX_PRIOR_REFLECTIONS = 10;
const POST_ALLOWED_KEYS = [
  'states', 'note', 'entryType', 'contextType',
  'whatHappened', 'whatNoticed', 'helpedOrGotInWay', 'takeForward',
  'customState', 'customContext',
  // Unified reflection (PR 1). Arjun's review fields are deliberately absent:
  // they are generated server-side and can never be supplied by a client.
  'eventTags', 'customEvent',
  'thoughtTags', 'customThought',
  'responseTags', 'customResponse',
  'bodyTags', 'customBody',
  'cueFeedback', 'cueWordSnapshot',
];
const CONTEXT_ALLOWED_KEYS = ['enabled'];

function serializeEntry(entry) {
  return {
    id: entry.id,
    states: entry.states,
    note: entry.note,
    createdAt: entry.createdAt,
    // Legacy rows (created before guided fields existed) have these as
    // null — a deterministic, already-correct "quick note" shape.
    entryType: entry.entryType ?? null,
    contextType: entry.contextType ?? null,
    whatHappened: entry.whatHappened ?? null,
    whatNoticed: entry.whatNoticed ?? null,
    helpedOrGotInWay: entry.helpedOrGotInWay ?? null,
    takeForward: entry.takeForward ?? null,
    // Athlete-authored "Something else" state label. Legacy rows → null.
    customState: entry.customState ?? null,
    // Athlete-authored context label when contextType is SOMETHING_ELSE.
    customContext: entry.customContext ?? null,
    // ── Unified reflection (PR 1) ──────────────────────────────────────
    // Every earlier shape returns empty lists / nulls here, so a client
    // rendering a legacy row never has to special-case a missing field.
    eventTags: entry.eventTags ?? [],
    customEvent: entry.customEvent ?? null,
    thoughtTags: entry.thoughtTags ?? [],
    customThought: entry.customThought ?? null,
    responseTags: entry.responseTags ?? [],
    customResponse: entry.customResponse ?? null,
    bodyTags: entry.bodyTags ?? [],
    customBody: entry.customBody ?? null,
    cueFeedback: entry.cueFeedback ?? null,
    cueWordSnapshot: entry.cueWordSnapshot ?? null,
    arjunNoticed: entry.arjunNoticed ?? null,
    arjunTakeaway: entry.arjunTakeaway ?? null,
    arjunPattern: entry.arjunPattern ?? null,
    reviewGeneratedAt: entry.reviewGeneratedAt ?? null,
  };
}

// `client` and `consentMiddleware` are both injectable (same pattern as
// requireGuardianConsent / recordSafetyEvent elsewhere) so tests can
// exercise the route with a fixture instead of a real database and a real
// guardian-consent Prisma lookup; the default export below always uses the
// real Prisma client and the real requireGuardianConsent middleware.
function createMindJournalRouter(
  client = prisma,
  consentMiddleware = requireGuardianConsent,
  generateReflectionReview = defaultGenerateReflectionReview,
  trialCheck = isTrialActive,
) {
  const router = express.Router();

  // aiLimiter: POST can now trigger one Anthropic call (Arjun's Review), so
  // it carries the same per-athlete limiter every other AI surface uses.
  router.post('/', authenticate, aiLimiter, consentMiddleware, async (req, res) => {
    const keysCheck = validateAllowedKeys(req.body, POST_ALLOWED_KEYS);
    if (!keysCheck.valid) return res.status(400).json({ error: keysCheck.error });

    const shapeCheck = validateMindJournalEntry(req.body);
    if (!shapeCheck.valid) return res.status(400).json({ error: shapeCheck.error });
    const {
      entryType, contextType, states, customState, customContext, note,
      whatHappened, whatNoticed, helpedOrGotInWay, takeForward,
      eventTags, customEvent, thoughtTags, customThought,
      responseTags, customResponse, bodyTags, customBody,
      cueFeedback, cueWordSnapshot,
    } = shapeCheck.value;
    const isReflection = entryType === 'REFLECTION';

    // Deterministic pre-LLM safety screen across every athlete-authored text
    // field, in a fixed order, stopping at the FIRST flagged field. On a
    // hit: zero Anthropic calls (none are made on this route anyway), the
    // raw text of EVERY field is never persisted — not the flagged one, and
    // not any other field from the same submission — no MindJournalEntry is
    // created, and a structured SafetyEvent (no note/excerpt/summary, and
    // never which field flagged) is recorded.
    let screen = { flagged: false };
    if (customState) screen = screenSafetyText(customState);
    if (!screen.flagged && customContext) screen = screenSafetyText(customContext);
    if (!screen.flagged && note) screen = screenSafetyText(note);
    if (!screen.flagged && whatHappened) screen = screenSafetyText(whatHappened);
    if (!screen.flagged && whatNoticed) screen = screenSafetyText(whatNoticed);
    if (!screen.flagged && helpedOrGotInWay) screen = screenSafetyText(helpedOrGotInWay);
    if (!screen.flagged && takeForward) screen = screenSafetyText(takeForward);

    // Unified reflection (PR 1) — the approved stronger contract. Every
    // athlete-written field on a reflection, including every "Write my own",
    // is screened TOGETHER as one text so a phrase split across two fields is
    // still caught. The per-field screens above are unchanged and still cover
    // the legacy / quick-note / guided shapes exactly as before.
    if (!screen.flagged && isReflection) {
      screen = screenSafetyFields(
        customContext, customEvent, customState, customThought, customResponse, customBody,
      );
    }

    if (screen.flagged) {
      recordSafetyEvent(req.userId, 'mind_journal', screen.category, {
        riskLevel: screen.riskLevel,
        sourceType: 'mind_journal',
      });
      const user = await client.user.findUnique({ where: { id: req.userId }, select: { language: true } }).catch(() => null);
      return res.json({ safetyFlag: 'needs_support', guidance: getSafetyGuidance(screen.category, user?.language) });
    }

    // ── Arjun's Review (unified reflection only) ─────────────────────────
    // Generated BEFORE the create so the reflection and its review land in
    // one write. Flagged submissions returned above, so nothing screened
    // unsafe ever reaches the model. A failure here resolves to nulls — the
    // reflection is still saved, the review slot is simply empty.
    let review = { noticed: null, takeaway: null, pattern: null };
    let reviewGeneratedAt = null;
    if (isReflection) {
      const priorEntries = await client.mindJournalEntry.findMany({
        where: { userId: req.userId, entryType: 'REFLECTION' },
        orderBy: { createdAt: 'desc' },
        take: MAX_PRIOR_REFLECTIONS,
      }).catch(() => []);

      // Trial gate covers the AI review only — never the reflection itself,
      // matching the existing post-performance-reflection precedent.
      if (await trialCheck(req.userId)) {
        const reviewUser = await client.user.findUnique({
          where: { id: req.userId },
          select: { name: true, sport: true, language: true },
        }).catch(() => null);
        review = await generateReflectionReview({
          entry: {
            contextType, customContext, eventTags, customEvent, states, customState,
            thoughtTags, customThought, responseTags, customResponse,
            bodyTags, customBody, cueFeedback, cueWordSnapshot,
          },
          priorEntries,
          user: reviewUser || {},
        });
        if (review.noticed || review.takeaway) reviewGeneratedAt = new Date();
      }
    }

    const entry = await client.mindJournalEntry.create({
      data: {
        userId: req.userId,
        entryType,
        contextType,
        states,
        customState,
        customContext,
        note,
        whatHappened,
        whatNoticed,
        helpedOrGotInWay,
        takeForward,
        eventTags: eventTags || [],
        customEvent: customEvent ?? null,
        thoughtTags: thoughtTags || [],
        customThought: customThought ?? null,
        responseTags: responseTags || [],
        customResponse: customResponse ?? null,
        bodyTags: bodyTags || [],
        customBody: customBody ?? null,
        cueFeedback: cueFeedback ?? null,
        cueWordSnapshot: cueWordSnapshot ?? null,
        arjunNoticed: review.noticed,
        arjunTakeaway: review.takeaway,
        arjunPattern: review.pattern,
        reviewGeneratedAt,
      },
    });
    // Pilot Tracking Phase 2A — the safety-flagged branch above returns
    // before this point (no entry created), so this only ever runs for a
    // genuinely saved entry.
    await activityTracking.touchActivity(req.userId);

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

    // The athlete's current Focus Card word, used ONLY to decide whether the
    // reflection's conditional question can ask about a cue they actually
    // have. Sourced from the newer SelfTalkCard system — deliberately never
    // the legacy User.cueWord, which can disagree with it. Absent entirely
    // when there is no active card.
    const focusCard = await client.selfTalkCard?.findFirst({
      where: { userId: req.userId, isActive: true, isArchived: false },
      orderBy: [{ isMatchDayCard: 'desc' }, { createdAt: 'desc' }],
      select: { focusWord: true },
    }).catch(() => null);

    res.json({
      contextEnabled: !!user?.mindJournalContextEnabled,
      focusWord: focusCard?.focusWord || null,
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

  // ── GET /:id — one entry the athlete owns ───────────────────────────────
  // Ownership is checked by loading the row by id ALONE and comparing
  // userId — a missing id and an id owned by someone else return the
  // identical 404, so the response never reveals whether another athlete
  // owns the id.
  router.get('/:id', authenticate, consentMiddleware, async (req, res) => {
    const existing = await client.mindJournalEntry.findUnique({ where: { id: req.params.id } });
    if (!existing || existing.userId !== req.userId) {
      return res.status(404).json({ error: 'not_found' });
    }
    return res.json({ entry: serializeEntry(existing) });
  });

  // ── DELETE /:id — delete one entry the athlete owns ─────────────────────
  // No PATCH /:id (no editing). Same ownership / 404 contract as GET /:id.
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
