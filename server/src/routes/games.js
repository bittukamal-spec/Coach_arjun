const express = require('express');
const authenticate = require('../middleware/authenticate');
const { awardXP } = require('../services/gamification');

const router = express.Router();

// POST /api/games/xp { gameType }
// Awards 10 XP for playing a mind booster game (once per session per game type)
router.post('/xp', authenticate, async (req, res) => {
  try {
    const { xp } = await awardXP(req.userId, 10);
    res.json({ xp, xpEarned: 10 });
  } catch {
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
