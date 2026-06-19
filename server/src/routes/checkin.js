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
  const { mood, focus, confidence, energy, sleep, reflection, gratitude } = req.body;

  // Validate required 1-5 sliders
  for (const [key, val] of Object.entries({ mood, focus, confidence })) {
    if (!Number.isInteger(val) || val < 1 || val > 5) {
      return res.status(400).json({ error: `"${key}" must be an integer between 1 and 5` });
    }
  }
  // Validate optional energy
  if (energy !== undefined && energy !== null && (!Number.isInteger(energy) || energy < 1 || energy > 5)) {
    return res.status(400).json({ error: '"energy" must be an integer between 1 and 5' });
  }
  // Validate optional sleep
  if (sleep !== undefined && sleep !== null && !['poor', 'ok', 'great'].includes(sleep)) {
    return res.status(400).json({ error: '"sleep" must be "poor", "ok", or "great"' });
  }
  if (reflection !== undefined && typeof reflection !== 'string') {
    return res.status(400).json({ error: '"reflection" must be a string' });
  }
  if (reflection && reflection.length > 500) {
    return res.status(400).json({ error: 'Reflection too long (max 500 characters)' });
  }
  if (gratitude !== undefined && typeof gratitude !== 'string') {
    return res.status(400).json({ error: '"gratitude" must be a string' });
  }
  if (gratitude && gratitude.length > 300) {
    return res.status(400).json({ error: 'Gratitude too long (max 300 characters)' });
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
        energy:     energy     ?? null,
        sleep:      sleep      ?? null,
        reflection: reflection?.trim() || null,
        gratitude:  gratitude?.trim()  || null,
      },
    });

    // Award XP: +10 base, +5 for reflection, +3 for gratitude, +2 for energy+sleep
    const xpEarned = 10
      + (reflection?.trim() ? 5 : 0)
      + (gratitude?.trim()  ? 3 : 0)
      + ((energy || sleep)  ? 2 : 0);
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
