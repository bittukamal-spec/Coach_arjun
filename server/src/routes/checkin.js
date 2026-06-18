const express = require('express');
const { PrismaClient } = require('@prisma/client');
const authenticate = require('../middleware/authenticate');
const { awardXP, checkCheckInAchievements } = require('../services/gamification');

const router = express.Router();
const prisma = new PrismaClient();

function startOfTodayUTC() {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

// ── GET /api/checkin/today ─────────────────────────────────────────────────
// Returns today's check-in (if any). Check-ins are always unlimited.

router.get('/today', authenticate, async (req, res) => {
  try {
    const checkIn = await prisma.checkIn.findFirst({
      where: { userId: req.userId, createdAt: { gte: startOfTodayUTC() } },
      orderBy: { createdAt: 'desc' },
    });

    res.json({ checkIn: checkIn || null });
  } catch {
    res.status(500).json({ error: 'Server error' });
  }
});

// ── POST /api/checkin ──────────────────────────────────────────────────────
// Create a new check-in. Blocks if already done today or free limit hit.

router.post('/', authenticate, async (req, res) => {
  const { mood, focus, confidence, reflection } = req.body;

  // Validate ratings
  for (const [key, val] of Object.entries({ mood, focus, confidence })) {
    if (!Number.isInteger(val) || val < 1 || val > 5) {
      return res.status(400).json({ error: `"${key}" must be an integer between 1 and 5` });
    }
  }
  if (reflection !== undefined && typeof reflection !== 'string') {
    return res.status(400).json({ error: '"reflection" must be a string' });
  }
  if (reflection && reflection.length > 500) {
    return res.status(400).json({ error: 'Reflection too long (max 500 characters)' });
  }

  try {
    // Block duplicate check-in on the same UTC day
    const existing = await prisma.checkIn.findFirst({
      where: { userId: req.userId, createdAt: { gte: startOfTodayUTC() } },
    });
    if (existing) {
      return res.status(409).json({ error: 'Already checked in today', checkIn: existing });
    }

    const checkIn = await prisma.checkIn.create({
      data: {
        userId: req.userId,
        mood,
        focus,
        confidence,
        reflection: reflection?.trim() || null,
      },
    });

    // Award XP: +10 base, +5 bonus for reflection
    const xpEarned = reflection?.trim() ? 15 : 10;
    const [{ xp }, newAchievements] = await Promise.all([
      awardXP(req.userId, xpEarned),
      checkCheckInAchievements(req.userId),
    ]);

    res.status(201).json({ checkIn, xp, xpEarned, newAchievements });
  } catch {
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
