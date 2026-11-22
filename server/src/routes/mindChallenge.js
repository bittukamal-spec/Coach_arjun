// Mind Challenge API (docs/PATH-STRATEGY.md). No AI, no athlete text.
//   GET   /api/mind-challenge            → { latest, previous, nextAt, canTake }
//   POST  /api/mind-challenge            → { points: {calm..picture: 0–6} } saves a result (once per 28 days)
//   PATCH /api/mind-challenge/latest/goal → { focusSkill, nextMatch } (investment) + moves that chapter up the path
const express = require('express');
const authenticate = require('../middleware/authenticate');
const { SKILLS, NEXT_MATCH, cleanPoints, createMindChallengeStore } = require('../services/path/mindChallenge');
const { createPathStore } = require('../services/path/pathService');

function createMindChallengeRouter({ store, pathStore } = {}) {
  const router = express.Router();
  let mc = store; let ps = pathStore;
  const stores = () => {
    if (!mc || !ps) {
      const { PrismaClient } = require('@prisma/client');
      const prisma = new PrismaClient();
      mc = mc || createMindChallengeStore(prisma);
      ps = ps || createPathStore(prisma);
    }
    return { mc, ps };
  };

  router.get('/', authenticate, async (req, res) => {
    try { res.json(await stores().mc.state(req.userId)); }
    catch (err) { console.error('[mind-challenge] GET error:', err?.message); res.status(500).json({ error: 'Server error' }); }
  });

  router.post('/', authenticate, async (req, res) => {
    const points = cleanPoints(req.body?.points);
    if (!points) return res.status(400).json({ error: 'Invalid points' });
    try {
      const { mc } = stores();
      const now = await mc.state(req.userId);
      if (!now.canTake) return res.status(409).json({ error: 'Not yet', nextAt: now.nextAt });
      res.json(await mc.save(req.userId, points));
    } catch (err) { console.error('[mind-challenge] POST error:', err?.message); res.status(500).json({ error: 'Server error' }); }
  });

  router.patch('/latest/goal', authenticate, async (req, res) => {
    const { focusSkill, nextMatch } = req.body || {};
    if (!SKILLS.includes(focusSkill) || (nextMatch != null && !NEXT_MATCH.has(nextMatch))) {
      return res.status(400).json({ error: 'Invalid goal' });
    }
    try {
      const { mc, ps } = stores();
      const result = await mc.setGoal(req.userId, { focusSkill, nextMatch: nextMatch || null });
      if (!result) return res.status(404).json({ error: 'No challenge yet' });
      await ps.prioritise(req.userId, focusSkill);
      res.json(result);
    } catch (err) { console.error('[mind-challenge] goal error:', err?.message); res.status(500).json({ error: 'Server error' }); }
  });

  return router;
}

module.exports = createMindChallengeRouter();
module.exports.createMindChallengeRouter = createMindChallengeRouter;
