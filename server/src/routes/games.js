const express = require('express');
const { PrismaClient } = require('@prisma/client');
const authenticate = require('../middleware/authenticate');
const { awardXP } = require('../services/gamification');

const router = express.Router();
const prisma = new PrismaClient();

// POST /api/games/xp { gameType, score }
// Awards 10 XP for completing a mind booster game and records the session for Arjun
router.post('/xp', authenticate, async (req, res) => {
  try {
    const { gameType, score } = req.body;
    if (gameType && score != null && typeof score === 'number') {
      const validTypes = ['grid', 'stroop', 'reaction', 'thought', 'filter'];
      if (validTypes.includes(gameType)) {
        await prisma.gameSession.create({
          data: { userId: req.userId, gameType, score },
        });
      }
    }
    const { xp } = await awardXP(req.userId, 10);
    res.json({ xp, xpEarned: 10 });
  } catch {
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
