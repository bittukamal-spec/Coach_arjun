const express = require('express');
const { PrismaClient } = require('@prisma/client');
const authenticate = require('../middleware/authenticate');
const { ACHIEVEMENTS } = require('../services/gamification');

const router = express.Router();
const prisma = new PrismaClient();

// GET /api/achievements/me
// Returns earned achievements + full metadata for the profile page

router.get('/me', authenticate, async (req, res) => {
  try {
    const earned = await prisma.userAchievement.findMany({
      where: { userId: req.userId },
      orderBy: { earnedAt: 'asc' },
      select: { key: true, earnedAt: true },
    });

    const result = earned.map(({ key, earnedAt }) => ({
      key,
      earnedAt,
      ...(ACHIEVEMENTS[key] || { name: key, icon: '🏅', xp: 0, desc: '' }),
    }));

    res.json({ achievements: result, allKeys: Object.keys(ACHIEVEMENTS) });
  } catch {
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
