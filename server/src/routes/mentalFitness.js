const express = require('express');
const Anthropic = require('@anthropic-ai/sdk');
const { PrismaClient } = require('@prisma/client');
const authenticate = require('../middleware/authenticate');

const router = express.Router();
const prisma = new PrismaClient();

// IST date as "YYYY-MM-DD" — adds UTC+5:30 offset before slicing ISO string
function getTodayIST() {
  const now = new Date();
  const istOffset = 5.5 * 60 * 60 * 1000;
  return new Date(now.getTime() + istOffset).toISOString().slice(0, 10);
}

const DIMS = ['focus', 'confidence', 'drive', 'calm', 'selftalk', 'bounce'];

// POST /api/mental-fitness — submit today's entry + generate Arjun's response
router.post('/', authenticate, async (req, res) => {
  const raw = req.body;

  // Validate all 6 dimensions
  const scores = {};
  for (const key of DIMS) {
    const n = parseInt(raw[key], 10);
    if (!Number.isInteger(n) || n < 1 || n > 5) {
      return res.status(400).json({ error: `${key} must be an integer between 1 and 5` });
    }
    scores[key] = n;
  }

  const date = getTodayIST();

  // One per day
  const existing = await prisma.mentalFitnessEntry.findUnique({
    where: { userId_date: { userId: req.userId, date } },
  });
  if (existing) {
    return res.status(409).json({ error: 'Already checked in today', entry: existing });
  }

  // Generate Arjun's 1-line response
  let arjunResponse = null;
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.userId },
      select: { sport: true, language: true },
    });

    if (process.env.ANTHROPIC_API_KEY) {
      const sport = user?.sport || 'sport';
      const langNote = user?.language === 'hi' ? ' Respond in Hindi.' : '';
      const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

      const msg = await anthropic.messages.create({
        model: process.env.ANTHROPIC_MODEL || 'claude-haiku-4-5-20251001',
        max_tokens: 80,
        messages: [{
          role: 'user',
          content: `You are Arjun, a direct sports coach. Reply in ONE sentence (max 15 words). No generic praise. Address what the numbers actually show.

Player's mental check-in today — focus: ${scores.focus}/5, confidence: ${scores.confidence}/5, drive: ${scores.drive}/5, calm: ${scores.calm}/5, self-talk: ${scores.selftalk}/5, bounce-back: ${scores.bounce}/5. Their sport: ${sport}. Give one sharp coaching line.${langNote}`,
        }],
      });
      arjunResponse = msg.content[0]?.text?.trim() || null;
    }
  } catch {
    // Non-critical — save entry without response
  }

  try {
    const entry = await prisma.mentalFitnessEntry.create({
      data: {
        userId: req.userId,
        date,
        ...scores,
        arjunResponse,
      },
    });
    res.json({ entry });
  } catch {
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
