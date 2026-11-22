// Learning path API (docs/PATH-STRATEGY.md). No AI, no athlete text stored.
//   GET  /api/path         → the athlete's path (chapters, current chapter, next step)
//   POST /api/path/steps   → { chapterKey, stepKey: learn|practise|play, outcome? } marks a step done
// Only the CURRENT chapter (or an already-finished one) can be marked, so the
// path is walked in order.
const express = require('express');
const authenticate = require('../middleware/authenticate');
const { CHAPTERS, SELF_MARKED_STEPS, PLAY_OUTCOMES } = require('../services/path/pathConfig');
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

  return router;
}

module.exports = createPathRouter();
module.exports.createPathRouter = createPathRouter;
