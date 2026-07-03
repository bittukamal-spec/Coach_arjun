const express = require('express');
const Anthropic = require('@anthropic-ai/sdk');
const { PrismaClient } = require('@prisma/client');
const authenticate = require('../middleware/authenticate');
const { awardXP, checkCheckInAchievements } = require('../services/gamification');
const { isTrialActive } = require('./chat');

const router = express.Router();
const prisma = new PrismaClient();

// IST date as "YYYY-MM-DD"
function getTodayIST() {
  const istOffset = 5.5 * 60 * 60 * 1000;
  return new Date(Date.now() + istOffset).toISOString().slice(0, 10);
}

function startOfTodayUTC() {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

const MFS_DIMS = ['focus', 'confidence', 'drive', 'calm', 'selftalk', 'bounce'];

// POST /api/mental-fitness — submit combined check-in + MFS
router.post('/', authenticate, async (req, res) => {
  const raw = req.body;

  // Validate mood (1–5)
  const mood = parseInt(raw.mood, 10);
  if (!Number.isInteger(mood) || mood < 1 || mood > 5) {
    return res.status(400).json({ error: 'mood must be an integer between 1 and 5' });
  }

  // Validate MFS dimensions (1–5)
  const scores = { mood };
  for (const key of MFS_DIMS) {
    const n = parseInt(raw[key], 10);
    if (!Number.isInteger(n) || n < 1 || n > 5) {
      return res.status(400).json({ error: `${key} must be an integer between 1 and 5` });
    }
    scores[key] = n;
  }

  const date = getTodayIST();

  // One per day (IST)
  const existing = await prisma.mentalFitnessEntry.findUnique({
    where: { userId_date: { userId: req.userId, date } },
  });
  if (existing) {
    return res.status(409).json({ error: 'Already checked in today', entry: existing });
  }

  // Generate Arjun's 1-line coaching response
  let arjunResponse = null;
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.userId },
      select: { sport: true, language: true },
    });

    // Trial gate: skip the Claude call for expired-trial free users.
    // The check-in itself still saves below — check-ins are always free.
    if (process.env.ANTHROPIC_API_KEY && await isTrialActive(req.userId)) {
      const sport = user?.sport || 'sport';
      const langNote = user?.language === 'hi' ? ' Respond in Hindi (Devanagari script).' : '';
      const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

      const msg = await anthropic.messages.create({
        model: process.env.ANTHROPIC_MODEL || 'claude-haiku-4-5-20251001',
        max_tokens: 220,
        messages: [{
          role: 'user',
          content: `You are Arjun, a direct and warm sports coach for a young Indian ${sport} athlete. Write a 3–4 sentence personal report based on their mental fitness scores today. Structure it as: (1) acknowledge what the numbers show — name the one strongest and one weakest dimension specifically, (2) explain briefly what that pattern means for their game today, (3) end with a single sentence recommending ONE of these in-app tools based on their weakest area: "Try the Breathing exercise" (low calm), "Open Focus Games" (low focus), "Use Pressure Reset" (low bounce-back or drive), "Do a Match Review" (low self-talk), or "Talk to me" (low confidence or mood). Be specific to the numbers, not generic. No bullet points. No praise padding. Address them directly as "you".${langNote}

Today's scores — Mood: ${scores.mood}/5, Focus: ${scores.focus}/5, Confidence: ${scores.confidence}/5, Drive: ${scores.drive}/5, Calm: ${scores.calm}/5, Self-talk: ${scores.selftalk}/5, Bounce-back: ${scores.bounce}/5.`,
        }],
      });
      arjunResponse = msg.content[0]?.text?.trim() || null;
    }
  } catch {
    // Non-critical
  }

  try {
    // Save MentalFitnessEntry
    const entry = await prisma.mentalFitnessEntry.create({
      data: {
        userId: req.userId,
        date,
        mood: scores.mood,
        focus: scores.focus,
        confidence: scores.confidence,
        drive: scores.drive,
        calm: scores.calm,
        selftalk: scores.selftalk,
        bounce: scores.bounce,
        arjunResponse,
      },
    });

    // Dual-write to CheckIn (skip if already exists on this UTC day)
    const existingCheckIn = await prisma.checkIn.findFirst({
      where: { userId: req.userId, createdAt: { gte: startOfTodayUTC() } },
    });
    let xpEarned = 0;
    let newAchievements = [];
    let totalXp = null;
    if (!existingCheckIn) {
      await prisma.checkIn.create({
        data: {
          userId: req.userId,
          mood: scores.mood,
          focus: scores.focus,
          confidence: scores.confidence,
        },
      });
      xpEarned = 10;
      const [xpResult, achievements] = await Promise.all([
        awardXP(req.userId, xpEarned),
        checkCheckInAchievements(req.userId),
      ]);
      totalXp = xpResult.xp;
      newAchievements = achievements;
    }

    res.json({ entry, xpEarned, xp: totalXp, newAchievements });
  } catch (err) {
    console.error('[mental-fitness] save error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// GET /api/mental-fitness/today — today's entry or null
router.get('/today', authenticate, async (req, res) => {
  try {
    const date = getTodayIST();
    const entry = await prisma.mentalFitnessEntry.findUnique({
      where: { userId_date: { userId: req.userId, date } },
    });
    res.json({ entry: entry || null });
  } catch {
    res.status(500).json({ error: 'Server error' });
  }
});

// GET /api/mental-fitness/week — last 7 entries
router.get('/week', authenticate, async (req, res) => {
  try {
    const entries = await prisma.mentalFitnessEntry.findMany({
      where: { userId: req.userId },
      orderBy: { date: 'desc' },
      take: 7,
    });
    res.json({ entries });
  } catch {
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
