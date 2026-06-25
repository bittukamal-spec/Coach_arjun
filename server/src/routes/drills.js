const express = require('express');
const { PrismaClient } = require('@prisma/client');
const authenticate = require('../middleware/authenticate');
const { awardXP } = require('../services/gamification');

const router = express.Router();
const prisma = new PrismaClient();

const DRILLS_COUNT = 20; // must match client/src/data/drills.js DRILLS.length

// Drill types in index order — must stay in sync with client/src/data/drills.js
const DRILL_TYPES = [
  'breathing',     // 0  Box Breathing
  'visualization', // 1  Perfect Performance
  'self-talk',     // 2  Cue Words
  'focus',         // 3  Single-Point Focus
  'pressure',      // 4  Pressure + Picture It
  'breathing',     // 5  4-7-8 Calm Down
  'visualization', // 6  Victory Replay
  'self-talk',     // 7  Flip the Negative
  'focus',         // 8  Body Scan
  'self-talk',     // 9  Process Goal Set
  'pressure',      // 10 Controlled Simulation
  'visualization', // 11 Better sleep tonight
  'focus',         // 12 Mindful Warm-Up
  'breathing',     // 13 Performance Breath
  'self-talk',     // 14 Confidence Anchor
  'visualization', // 15 Think like a winner
  'focus',         // 16 Distraction Deletion
  'pressure',      // 17 Remember your strength
  'breathing',     // 18 Pre-Game Reset
  'self-talk',     // 19 Gratitude Recall
];

// Lowest MFS dimension → drill type that addresses it
const DIM_TYPE_MAP = {
  calm:       'breathing',
  focus:      'focus',
  confidence: 'visualization',
  drive:      'pressure',
  selftalk:   'self-talk',
  bounce:     'pressure',
  mood:       'self-talk',
};

function startOfTodayUTC() {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

function getDayOfYear() {
  const now = new Date();
  const start = new Date(Date.UTC(now.getUTCFullYear(), 0, 0));
  return Math.floor((now - start) / (1000 * 60 * 60 * 24));
}

// GET /api/drills/today
router.get('/today', authenticate, async (req, res) => {
  try {
    const dayOfYear = getDayOfYear();
    let drillIndex = dayOfYear % DRILLS_COUNT;
    let recommended = false;

    // Personalise based on today's MFS check-in (IST date)
    try {
      const istOffset = 5.5 * 60 * 60 * 1000;
      const todayIST = new Date(Date.now() + istOffset).toISOString().slice(0, 10);
      const mfs = await prisma.mentalFitnessEntry.findUnique({
        where: { userId_date: { userId: req.userId, date: todayIST } },
        select: { mood: true, focus: true, confidence: true, drive: true, calm: true, selftalk: true, bounce: true },
      });
      if (mfs) {
        const dims = ['calm', 'focus', 'confidence', 'drive', 'selftalk', 'bounce', 'mood'];
        const sorted = dims.filter(d => mfs[d] != null).sort((a, b) => mfs[a] - mfs[b]);
        const lowest = sorted[0];
        if (lowest && mfs[lowest] <= 3) {
          const targetType = DIM_TYPE_MAP[lowest];
          const matches = DRILL_TYPES.map((t, i) => t === targetType ? i : -1).filter(i => i >= 0);
          if (matches.length > 0) {
            drillIndex = matches[dayOfYear % matches.length];
            recommended = true;
          }
        }
      }
    } catch { /* non-critical — fall back to rotation */ }

    const completion = await prisma.drillCompletion.findFirst({
      where: { userId: req.userId, completedAt: { gte: startOfTodayUTC() } },
    });
    res.json({ drillIndex, completed: !!completion, recommended });
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

    const drillIndex = getDayOfYear() % DRILLS_COUNT;
    await prisma.drillCompletion.create({ data: { userId: req.userId, drillIndex } });
    const { xp } = await awardXP(req.userId, 15);
    res.json({ xp, xpEarned: 15, alreadyDone: false });
  } catch {
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
