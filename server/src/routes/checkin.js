const express = require('express');
const { PrismaClient } = require('@prisma/client');
const authenticate = require('../middleware/authenticate');

const router = express.Router();
const prisma = new PrismaClient();

const FREE_LIMIT = 3; // check-ins per week for free tier

function startOfTodayUTC() {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

function startOfWeekAgo() {
  return new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
}

// ── GET /api/checkin/today ─────────────────────────────────────────────────
// Returns today's check-in (if any) and weekly usage stats.

router.get('/today', authenticate, async (req, res) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.userId },
      select: { tier: true },
    });

    const [checkIn, used] = await Promise.all([
      prisma.checkIn.findFirst({
        where: { userId: req.userId, createdAt: { gte: startOfTodayUTC() } },
        orderBy: { createdAt: 'desc' },
      }),
      prisma.checkIn.count({
        where: { userId: req.userId, createdAt: { gte: startOfWeekAgo() } },
      }),
    ]);

    res.json({
      checkIn: checkIn || null,
      usage: { used, limit: FREE_LIMIT, isPremium: user?.tier === 'premium' },
    });
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

    // Block free users who hit the weekly limit
    const user = await prisma.user.findUnique({
      where: { id: req.userId },
      select: { tier: true },
    });
    if (user?.tier !== 'premium') {
      const used = await prisma.checkIn.count({
        where: { userId: req.userId, createdAt: { gte: startOfWeekAgo() } },
      });
      if (used >= FREE_LIMIT) {
        return res.status(429).json({
          error: 'Weekly check-in limit reached. Upgrade to Premium for daily check-ins.',
          code: 'LIMIT_REACHED',
          used,
          limit: FREE_LIMIT,
        });
      }
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

    res.status(201).json({ checkIn });
  } catch {
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
