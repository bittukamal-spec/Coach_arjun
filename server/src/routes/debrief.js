const express = require('express');
const Anthropic = require('@anthropic-ai/sdk');
const { PrismaClient } = require('@prisma/client');
const authenticate = require('../middleware/authenticate');

const router = express.Router();
const prisma = new PrismaClient();
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const DEBRIEF_XP = 10;

// POST /api/debrief — save debrief + generate Arjun's insight
router.post('/', authenticate, async (req, res) => {
  const { wentWell, doDifferently, nextFocus } = req.body;

  if (!wentWell?.trim() || !doDifferently?.trim() || !nextFocus?.trim()) {
    return res.status(400).json({ error: 'All three fields are required' });
  }
  if (wentWell.length > 500 || doDifferently.length > 500 || nextFocus.length > 300) {
    return res.status(400).json({ error: 'Response too long' });
  }

  let arjunInsight = null;
  try {
    const msg = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 200,
      messages: [{
        role: 'user',
        content: `You are Arjun, an AI mental performance coach for Indian athletes. Generate a 2-3 sentence coaching insight based on this post-match debrief:

What went well: "${wentWell.trim()}"
What they'd do differently: "${doDifferently.trim()}"
Focus for next time: "${nextFocus.trim()}"

Write directly to the athlete (use "you"). Validate their self-awareness, pull out one specific pattern or lesson, and end with ONE concrete action. Under 3 sentences. Be direct, not generic.`,
      }],
    });
    arjunInsight = msg.content[0]?.text?.trim() || null;
  } catch {
    // insight is optional — save debrief even if AI fails
  }

  try {
    const [debrief] = await prisma.$transaction([
      prisma.debrief.create({
        data: {
          userId: req.userId,
          wentWell: wentWell.trim(),
          doDifferently: doDifferently.trim(),
          nextFocus: nextFocus.trim(),
          arjunInsight,
        },
      }),
      prisma.user.update({
        where: { id: req.userId },
        data: { xp: { increment: DEBRIEF_XP } },
      }),
    ]);

    const user = await prisma.user.findUnique({
      where: { id: req.userId },
      select: { xp: true },
    });

    res.json({ debrief, xp: user.xp, xpEarned: DEBRIEF_XP });
  } catch {
    res.status(500).json({ error: 'Server error' });
  }
});

// GET /api/debrief — last 5 debriefs
router.get('/', authenticate, async (req, res) => {
  try {
    const debriefs = await prisma.debrief.findMany({
      where: { userId: req.userId },
      orderBy: { createdAt: 'desc' },
      take: 5,
    });
    res.json({ debriefs });
  } catch {
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
