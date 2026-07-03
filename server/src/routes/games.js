const express = require('express');
const { PrismaClient } = require('@prisma/client');
const authenticate = require('../middleware/authenticate');
const { awardXP } = require('../services/gamification');

const router = express.Router();
const prisma = new PrismaClient();

// POST /api/games/xp { gameType, score }
// Awards 10 XP for completing a mind booster game and records the session for Arjun
router.post('/xp', authenticate, async (req, res) => {
  try {
    const { gameType, score } = req.body;
    if (gameType && score != null && typeof score === 'number') {
      const validTypes = ['grid', 'stroop', 'reaction', 'thought', 'filter'];
      if (validTypes.includes(gameType)) {
        await prisma.gameSession.create({
          data: { userId: req.userId, gameType, score },
        });
      }
    }
    const { xp } = await awardXP(req.userId, 10);
    res.json({ xp, xpEarned: 10 });
  } catch {
    res.status(500).json({ error: 'Server error' });
  }
});

// ── Mental Reps games (Focus Lock, Reset Rally) ────────────────────────────

const REPS_GAMES = ['focus_lock', 'reset_rally'];
const DAILY_LIMIT = 3;
const TOTAL_LIMIT = 5;

// Games are counted per IST calendar day (same convention as MentalFitnessEntry)
function istDayStart() {
  const istDate = new Date(Date.now() + 5.5 * 60 * 60 * 1000).toISOString().slice(0, 10);
  return new Date(`${istDate}T00:00:00+05:30`);
}

// POST /api/games/session — save a completed Mental Reps session
// Body: { gameId, score, level?, accuracy, duration, correctCount, wrongCount,
//         missedCount?, bestStreak, insightText }
router.post('/session', authenticate, async (req, res) => {
  try {
    const {
      gameId, score, level, accuracy, duration,
      correctCount, wrongCount, missedCount, bestStreak, insightText,
    } = req.body;

    if (!REPS_GAMES.includes(gameId) || typeof score !== 'number') {
      return res.status(400).json({ error: 'Invalid game session' });
    }

    const playsToday = await prisma.gameSession.count({
      where: { userId: req.userId, gameType: gameId, completedAt: { gte: istDayStart() } },
    });
    if (playsToday >= DAILY_LIMIT) {
      return res.status(429).json({ error: 'DAILY_LIMIT', playsToday, dailyLimit: DAILY_LIMIT });
    }

    await prisma.gameSession.create({
      data: { userId: req.userId, gameType: gameId, score },
    });

    // Rich stats live in a ToolReport so they reach Arjun's coaching context
    const gameLabel = gameId === 'focus_lock' ? 'Focus Lock' : 'Reset Rally';
    const accuracyPct = Math.round((accuracy || 0) * 100);
    const summary = gameId === 'focus_lock'
      ? `${gameLabel}: score ${score}, ${accuracyPct}% accuracy, best streak ${bestStreak || 0}, reached level ${level || 1}`
      : `${gameLabel}: score ${score}, ${correctCount || 0}/6 strong resets, ${accuracyPct}% reset accuracy`;
    await prisma.toolReport.create({
      data: {
        userId: req.userId,
        toolType: gameId,
        summary,
        arjunResponse: insightText || null,
        details: JSON.stringify({
          level, accuracy, duration, correctCount, wrongCount, missedCount, bestStreak,
        }),
      },
    });

    const { xp } = await awardXP(req.userId, 15);

    res.json({
      success: true,
      xp,
      xpEarned: 15,
      playsToday: playsToday + 1,
      dailyLimit: DAILY_LIMIT,
    });
  } catch (err) {
    console.error('game session error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// GET /api/games/status — today's play counts for the Mental Reps hub
router.get('/status', authenticate, async (req, res) => {
  try {
    const dayStart = istDayStart();
    const [focusLockPlays, resetRallyPlays] = await Promise.all([
      prisma.gameSession.count({
        where: { userId: req.userId, gameType: 'focus_lock', completedAt: { gte: dayStart } },
      }),
      prisma.gameSession.count({
        where: { userId: req.userId, gameType: 'reset_rally', completedAt: { gte: dayStart } },
      }),
    ]);

    res.json({
      focusLock:  { playsToday: focusLockPlays,  limit: DAILY_LIMIT },
      resetRally: { playsToday: resetRallyPlays, limit: DAILY_LIMIT },
      totalToday: focusLockPlays + resetRallyPlays,
      totalLimit: TOTAL_LIMIT,
    });
  } catch (err) {
    console.error('game status error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
