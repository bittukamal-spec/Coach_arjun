const express = require('express');
const { PrismaClient } = require('@prisma/client');
const authenticate = require('../middleware/authenticate');
const { awardXP } = require('../services/gamification');

const router = express.Router();
const prisma = new PrismaClient();

const DRILLS_COUNT = 20; // must match client/src/data/drills.js DRILLS.length

function startOfTodayUTC() {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

function getDrillIndexForToday() {
  const now = new Date();
  const start = new Date(Date.UTC(now.getUTCFullYear(), 0, 0));
  const dayOfYear = Math.floor((now - start) / (1000 * 60 * 60 * 24));
  return dayOfYear % DRILLS_COUNT;
}

// GET /api/drills/today
router.get('/today', authenticate, async (req, res) => {
  try {
    const drillIndex = getDrillIndexForToday();
    const completion = await prisma.drillCompletion.findFirst({
      where: { userId: req.userId, completedAt: { gte: startOfTodayUTC() } },
    });
    res.json({ drillIndex, completed: !!completion });
  } catch {
    res.status(500).json({ error: 'Server error' });
  }
});

// POST /api/drills/complete
router.post('/complete', authenticate, async (req, res) => {
  try {
    const existing = await prisma.drillCompletion.findFirst({
      where: { userId: req.userId, completedAt: { gte: startOfTodayUTC() } },
    });
    if (existing) {
      const user = await prisma.user.findUnique({ where: { id: req.userId }, select: { xp: true } });
      return res.json({ xp: user.xp, xpEarned: 0, alreadyDone: true });
    }

    const drillIndex = getDrillIndexForToday();
    await prisma.drillCompletion.create({ data: { userId: req.userId, drillIndex } });
    const { xp } = await awardXP(req.userId, 15);
    res.json({ xp, xpEarned: 15, alreadyDone: false });
  } catch {
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
