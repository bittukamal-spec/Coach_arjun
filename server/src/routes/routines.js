// Ritual rebuild (PR 1) — saved routines API. Storage/API foundation only:
// no UI uses it yet, and nothing here calls Anthropic.
//
//   GET    /api/routines               list + legacy-ritual import state (read-only)
//   GET    /api/routines/:id           one owned routine (read-only)
//   POST   /api/routines               create (max 5 per athlete)
//   PATCH  /api/routines/:id           edit an owned routine
//   DELETE /api/routines/:id           delete an owned routine
//   POST   /api/routines/import-legacy explicit, repeat-safe legacy import
//   POST   /api/routines/suggest       deterministic starting-routine suggestion
//                                      (read-only: no write, no AI, no network)
//
// Access policy matches the legacy /api/ritual/me it grows out of:
// `authenticate` only — no guardian-consent gate and no trial/paywall gate,
// because no route here sends text to an AI model. Ownership is enforced on
// every read and write (someone else's routine is indistinguishable from a
// missing one). Athlete-written text is screened with the shared
// deterministic safety service before anything is saved — the same
// persist-nothing, structured-event, fixed-guidance behaviour as the Mind
// Journal save. Legacy ritual text is screened the same way before import
// (and before legacy saves in ritual.js), so no path skips the screen.

const express = require('express');
const authenticate = require('../middleware/authenticate');
const activityTracking = require('../services/activityTracking');
const { screenSafetyFields, recordSafetyEvent, getSafetyGuidance } = require('../services/safety');
const {
  bodyTooLarge, collectRoutineText, isValidRoutineId, validateCreateRoutine, validatePatchRoutine,
} = require('../services/routines/validateRoutine');
const { createRoutineStore, RoutineError } = require('../services/routines/routineStore');
const { suggestRoutine } = require('../services/routines/suggestRoutine');

// The only inputs the suggestion engine reads. Free-text fields (moment,
// purpose) are deliberately not accepted: the rules never infer anything from
// them, and nothing here is stored.
const SUGGEST_KEYS = ['category', 'purposeKey', 'timeWindow', 'existingHabits'];

const ERROR_STATUS = {
  not_found: 404,
  source_not_found: 404,
  routine_limit_reached: 409,
};

function createRoutinesRouter({
  store = createRoutineStore(),
  activity = activityTracking,
  safetyEvent = recordSafetyEvent,
  loadLanguage = null,
} = {}) {
  const router = express.Router();

  function sendError(res, err, label) {
    if (err instanceof RoutineError && ERROR_STATUS[err.code]) {
      return res.status(ERROR_STATUS[err.code]).json({ error: err.code });
    }
    console.error(`routines ${label} error:`, err?.message);
    return res.status(500).json({ error: 'server_error' });
  }

  // Records exactly one structured event and returns the fixed guidance body.
  async function flaggedResponse(userId, screen, sourceType) {
    safetyEvent(userId, 'ritual', screen.category, { riskLevel: screen.riskLevel, sourceType });
    let language = null;
    try {
      language = loadLanguage ? await loadLanguage(userId) : null;
    } catch { /* guidance falls back to English */ }
    return { safetyFlag: 'needs_support', guidance: getSafetyGuidance(screen.category, language) };
  }

  // Returns true (and has already responded) when the body carries text the
  // shared safety screen flags. Nothing is persisted on that path.
  async function handledBySafetyScreen(req, res) {
    const screen = screenSafetyFields(...collectRoutineText(req.body));
    if (!screen.flagged) return false;
    res.json(await flaggedResponse(req.userId, screen, 'routine_save'));
    return true;
  }

  function checkSize(req, res) {
    if (bodyTooLarge(req.body)) {
      res.status(413).json({ error: 'payload_too_large' });
      return false;
    }
    return true;
  }

  function checkId(req, res) {
    if (!isValidRoutineId(req.params.id)) {
      res.status(404).json({ error: 'not_found' });
      return false;
    }
    return true;
  }

  router.get('/', authenticate, async (req, res) => {
    try {
      return res.json(await store.list(req.userId));
    } catch (err) {
      return sendError(res, err, 'list');
    }
  });

  // Declared before /:id so it can never be read as an id.
  router.post('/import-legacy', authenticate, async (req, res) => {
    try {
      const result = await store.importLegacy(req.userId);
      if (result.status === 'needs_support') {
        // The stored legacy text failed the shared screen: nothing was
        // imported. Same event + guidance contract as a flagged save.
        return res.json({
          status: 'needs_support',
          routine: null,
          ...(await flaggedResponse(req.userId, result.screen, 'ritual_legacy_import')),
        });
      }
      // Deliberately no activity touch: importing is a one-time data move
      // the client triggers, not something the athlete did — and a retry
      // must never count either.
      return res.status(result.status === 'imported' ? 201 : 200).json(result);
    } catch (err) {
      return sendError(res, err, 'import');
    }
  });

  // Pure and read-only: validates the structured inputs and returns the
  // deterministic PR 2 suggestion. It never creates a routine, never writes
  // (no activity, no safety event), and never calls a model. Athlete text is
  // screened when a routine is actually saved (POST /).
  router.post('/suggest', authenticate, (req, res) => {
    if (!checkSize(req, res)) return;
    const body = req.body;
    if (!body || typeof body !== 'object' || Array.isArray(body)) return res.status(400).json({ error: 'invalid_body' });
    if (Object.keys(body).some(k => !SUGGEST_KEYS.includes(k))) return res.status(400).json({ error: 'unexpected_field' });
    const result = suggestRoutine(body);
    if (!result.valid) return res.status(400).json({ error: result.error });
    return res.json({ suggestion: result.suggestion });
  });

  router.get('/:id', authenticate, async (req, res) => {
    if (!checkId(req, res)) return;
    try {
      return res.json({ routine: await store.get(req.userId, req.params.id) });
    } catch (err) {
      return sendError(res, err, 'get');
    }
  });

  router.post('/', authenticate, async (req, res) => {
    if (!checkSize(req, res)) return;
    if (await handledBySafetyScreen(req, res)) return;
    const check = validateCreateRoutine(req.body);
    if (!check.valid) return res.status(400).json({ error: check.error });

    let routine;
    try {
      routine = await store.create(req.userId, check.value);
    } catch (err) {
      return sendError(res, err, 'create');
    }
    // Only after the routine is durably saved; never fails the response.
    await activity.touchActivity(req.userId);
    return res.status(201).json({ routine });
  });

  router.patch('/:id', authenticate, async (req, res) => {
    if (!checkId(req, res)) return;
    if (!checkSize(req, res)) return;
    if (await handledBySafetyScreen(req, res)) return;
    const check = validatePatchRoutine(req.body);
    if (!check.valid) return res.status(400).json({ error: check.error });

    let routine;
    try {
      routine = await store.update(req.userId, req.params.id, check.value);
    } catch (err) {
      return sendError(res, err, 'update');
    }
    await activity.touchActivity(req.userId);
    return res.json({ routine });
  });

  router.delete('/:id', authenticate, async (req, res) => {
    if (!checkId(req, res)) return;
    try {
      return res.json(await store.remove(req.userId, req.params.id));
    } catch (err) {
      return sendError(res, err, 'delete');
    }
  });

  return router;
}

// Default wiring: real store and a language lookup for localized guidance.
function defaultRouter() {
  const { PrismaClient } = require('@prisma/client');
  const prisma = new PrismaClient();
  return createRoutinesRouter({
    store: createRoutineStore(prisma),
    loadLanguage: async (userId) => {
      const user = await prisma.user.findUnique({ where: { id: userId }, select: { language: true } });
      return user?.language ?? null;
    },
  });
}

module.exports = defaultRouter();
module.exports.createRoutinesRouter = createRoutinesRouter;
