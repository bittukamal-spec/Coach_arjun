// Learning path API (docs/PATH-STRATEGY.md). No AI, no athlete text stored.
//   GET  /api/path         → the athlete's path (chapters, current chapter, next step)
//   POST /api/path/steps   → { chapterKey, stepKey: learn|practise|play, outcome? } marks a step done
//   PUT  /api/path/match   → { day: "YYYY-MM-DD" | null, type? } sets or clears the next match (India time); type = practice|league|tournament|selection|final
//   POST /api/path/match/review → { feel: well|mixed|tough|null, used: helped|tried|forgot|null }
//        clears the match + play plan; helped/tried also ticks the current chapter's Play step
//   PUT  /api/path/plan    → { tool, moment, cue? } | { plan: null } the if–then play plan (Hook fix 3)
// Only the CURRENT chapter (or an already-finished one) can be marked, so the
// path is walked in order.
const express = require('express');
const authenticate = require('../middleware/authenticate');
const { CHAPTERS, SELF_MARKED_STEPS, PLAY_OUTCOMES, MATCH_FEELS, MATCH_USED, PLAN_MOMENTS, MATCH_TYPES } = require('../services/path/pathConfig');
const { screenSafetyText, recordSafetyEvent, getSafetyGuidance } = require('../services/safety');
const { isPickableDay, matchPhase } = require('../services/path/matchDay');
const { createPathStore } = require('../services/path/pathService');

function createPathRouter({ store } = {}) {
  const router = express.Router();
  let pathStore = store;
  const getStore = () => {
    if (!pathStore) {
      const { PrismaClient } = require('@prisma/client');
      pathStore = createPathStore(new PrismaClient());
    }
    return pathStore;
  };

  router.get('/', authenticate, async (req, res) => {
    try {
      res.json(await getStore().getPath(req.userId));
    } catch (err) {
      console.error('[path] GET error:', err?.message);
      res.status(500).json({ error: 'Server error' });
    }
  });

  router.post('/steps', authenticate, async (req, res) => {
    const { chapterKey, stepKey, outcome } = req.body || {};
    if (!CHAPTERS.includes(chapterKey) || !SELF_MARKED_STEPS.has(stepKey)) {
      return res.status(400).json({ error: 'Invalid step' });
    }
    if (stepKey === 'play' && !PLAY_OUTCOMES.has(outcome)) {
      return res.status(400).json({ error: 'Invalid outcome' });
    }
    try {
      const s = getStore();
      const path = await s.getPath(req.userId);
      const chapter = path.chapters.find(c => c.key === chapterKey);
      if (!chapter || chapter.status === 'locked') {
        return res.status(409).json({ error: 'Chapter not open yet' });
      }
      await s.record(req.userId, { chapterKey, stepKey, outcome: stepKey === 'play' ? outcome : null });
      res.json(await s.getPath(req.userId));
    } catch (err) {
      console.error('[path] POST error:', err?.message);
      res.status(500).json({ error: 'Server error' });
    }
  });

  router.put('/plan', authenticate, async (req, res) => {
    const body = req.body || {};
    let plan = null;
    if (!(Object.prototype.hasOwnProperty.call(body, 'plan') && body.plan === null)) {
      const { tool, moment } = body;
      if (!PLAN_MOMENTS[tool] || !PLAN_MOMENTS[tool].includes(moment)) return res.status(400).json({ error: 'Invalid plan' });
      let cue = body.cue == null ? null : String(body.cue).replace(/\s+/g, ' ').trim();
      if (cue && cue.length > 60) return res.status(400).json({ error: 'Cue too long' });
      if ((tool === 'rep' || tool === 'ritual') && !cue) return res.status(400).json({ error: 'Cue required' });
      if (cue) {
        const screen = screenSafetyText(cue);
        if (screen.flagged) {
          try { await recordSafetyEvent(req.userId, 'path_plan', screen.category, { riskLevel: screen.riskLevel, sourceType: 'path_play_plan' }); } catch { /* best effort */ }
          return res.json({ safetyFlag: 'needs_support', guidance: getSafetyGuidance(screen.category) });
        }
      }
      plan = { tool, moment, ...(cue ? { cue } : {}) };
    }
    try {
      const s = getStore();
      await s.setPlan(req.userId, plan);
      res.json(await s.getPath(req.userId));
    } catch (err) {
      console.error('[path] plan error:', err?.message);
      res.status(500).json({ error: 'Server error' });
    }
  });

  router.put('/match', authenticate, async (req, res) => {
    const day = req.body?.day ?? null;
    const type = req.body?.type ?? null;
    if (day !== null && !isPickableDay(day)) return res.status(400).json({ error: 'Invalid day' });
    if (type !== null && !MATCH_TYPES.has(type)) return res.status(400).json({ error: 'Invalid match type' });
    try {
      const s = getStore();
      await s.setMatch(req.userId, day, type);
      res.json(await s.getPath(req.userId));
    } catch (err) {
      console.error('[path] match error:', err?.message);
      res.status(500).json({ error: 'Server error' });
    }
  });

  router.post('/match/review', authenticate, async (req, res) => {
    const feel = req.body?.feel ?? null;
    const used = req.body?.used ?? null;
    if ((feel !== null && !MATCH_FEELS.has(feel)) || (used !== null && !MATCH_USED.has(used))) {
      return res.status(400).json({ error: 'Invalid answer' });
    }
    try {
      const s = getStore();
      const path = await s.getPath(req.userId);
      const phase = matchPhase(path.match?.nextDay);
      if (phase !== 'review' && phase !== 'today' && phase !== 'stale') {
        return res.status(409).json({ error: 'No match to review' });
      }
      const chapterKey = path.finished ? null : path.currentKey;
      await s.reviewMatch(req.userId, { feel, used, chapterKey });
      res.json(await s.getPath(req.userId));
    } catch (err) {
      console.error('[path] review error:', err?.message);
      res.status(500).json({ error: 'Server error' });
    }
  });

  return router;
}

module.exports = createPathRouter();
module.exports.createPathRouter = createPathRouter;
