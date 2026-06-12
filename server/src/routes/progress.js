const express = require('express');
const { PrismaClient } = require('@prisma/client');
const authenticate = require('../middleware/authenticate');

const router = express.Router();
const prisma = new PrismaClient();

// ── Helpers ────────────────────────────────────────────────────────────────

function daysAgo(n) {
  return new Date(Date.now() - n * 24 * 60 * 60 * 1000);
}

function utcDateStr(date) {
  return new Date(date).toISOString().slice(0, 10); // "2024-01-15"
}

function avg(items, key) {
  if (!items.length) return null;
  return +( items.reduce((s, c) => s + c[key], 0) / items.length ).toFixed(1);
}

function formatChartDate(date) {
  return new Date(date).toLocaleDateString('en-IN', { month: 'short', day: 'numeric' });
}

// Streak = consecutive days (today or yesterday counts as day-1 so evening
// check-in users don't lose their streak during the day).
function calculateStreak(checkIns) {
  if (!checkIns.length) return 0;

  const uniqueDates = [...new Set(checkIns.map(c => utcDateStr(c.createdAt)))]
    .sort((a, b) => b.localeCompare(a)); // descending

  const today     = utcDateStr(new Date());
  const yesterday = utcDateStr(daysAgo(1));

  // Streak must include today or yesterday
  if (uniqueDates[0] !== today && uniqueDates[0] !== yesterday) return 0;

  let streak = 1;
  for (let i = 1; i < uniqueDates.length; i++) {
    const prev = new Date(uniqueDates[i - 1]);
    const curr = new Date(uniqueDates[i]);
    const diffDays = Math.round((prev - curr) / 86400000);
    if (diffDays === 1) {
      streak++;
    } else {
      break;
    }
  }
  return streak;
}

// ── GET /api/progress/summary ──────────────────────────────────────────────
// Query param: ?days=7 (default) or ?days=30

router.get('/summary', authenticate, async (req, res) => {
  const days = [7, 30].includes(parseInt(req.query.days)) ? parseInt(req.query.days) : 7;

  try {
    const [periodCheckIns, allCheckIns, thisWeekCheckIns, prevWeekCheckIns, totalCheckIns] =
      await Promise.all([
        // Chart data for selected period
        prisma.checkIn.findMany({
          where: { userId: req.userId, createdAt: { gte: daysAgo(days) } },
          orderBy: { createdAt: 'asc' },
          select: { mood: true, focus: true, confidence: true, createdAt: true },
        }),
        // All check-ins for streak calculation
        prisma.checkIn.findMany({
          where: { userId: req.userId },
          orderBy: { createdAt: 'desc' },
          select: { createdAt: true },
        }),
        // This week for averages
        prisma.checkIn.findMany({
          where: { userId: req.userId, createdAt: { gte: daysAgo(7) } },
          select: { mood: true, focus: true, confidence: true },
        }),
        // Previous week for trend comparison
        prisma.checkIn.findMany({
          where: { userId: req.userId, createdAt: { gte: daysAgo(14), lt: daysAgo(7) } },
          select: { mood: true, focus: true, confidence: true },
        }),
        // Total ever
        prisma.checkIn.count({ where: { userId: req.userId } }),
      ]);

    const chartData = periodCheckIns.map(c => ({
      date:       formatChartDate(c.createdAt),
      mood:       c.mood,
      focus:      c.focus,
      confidence: c.confidence,
    }));

    res.json({
      chartData,
      days,
      streak:         calculateStreak(allCheckIns),
      totalCheckIns,
      weeklyAvg: {
        mood:       avg(thisWeekCheckIns, 'mood'),
        focus:      avg(thisWeekCheckIns, 'focus'),
        confidence: avg(thisWeekCheckIns, 'confidence'),
      },
      prevWeekAvg: {
        mood:       avg(prevWeekCheckIns, 'mood'),
        focus:      avg(prevWeekCheckIns, 'focus'),
        confidence: avg(prevWeekCheckIns, 'confidence'),
      },
    });
  } catch {
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
