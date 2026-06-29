const express = require('express');
const { PrismaClient } = require('@prisma/client');
const authenticate = require('../middleware/authenticate');

const router = express.Router();
const prisma = new PrismaClient();

// ── Helpers ────────────────────────────────────────────────────────────────

function daysAgo(n) {
  return new Date(Date.now() - n * 24 * 60 * 60 * 1000);
}

function daysAgoStr(n) {
  return daysAgo(n).toISOString().slice(0, 10);
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

// Mental Fitness Score (0–100)
// streak (25) + consistency/14d (25) + mental state avg (30) + achievements (20)
function calcFitnessScore(streak, last14Count, weeklyAvgData, achievementsCount) {
  const streakPts      = Math.min(streak / 14, 1) * 25;
  const consistencyPts = (Math.min(last14Count, 14) / 14) * 25;
  const avgM           = weeklyAvgData.mood;
  const avgF           = weeklyAvgData.focus;
  const avgC           = weeklyAvgData.confidence;
  const mentalPts      = (avgM !== null && avgF !== null && avgC !== null)
    ? (((avgM + avgF + avgC) / 3 - 1) / 4) * 30
    : 0;
  const achievePts     = (Math.min(achievementsCount, 9) / 9) * 20;
  return Math.round(streakPts + consistencyPts + mentalPts + achievePts);
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
    const [periodCheckIns, allCheckIns, thisWeekCheckIns, prevWeekCheckIns, totalCheckIns, user, last14Count, userAchievements, thisMfsEntries, prevMfsEntries] =
      await Promise.all([
        // Chart data for selected period (exclude freeze entries)
        prisma.checkIn.findMany({
          where: { userId: req.userId, createdAt: { gte: daysAgo(days) }, type: { not: 'freeze' } },
          orderBy: { createdAt: 'asc' },
          select: { mood: true, focus: true, confidence: true, createdAt: true },
        }),
        // All check-ins for streak calculation (includes freeze entries)
        prisma.checkIn.findMany({
          where: { userId: req.userId },
          orderBy: { createdAt: 'desc' },
          select: { createdAt: true },
        }),
        // This week for averages (exclude freeze entries)
        prisma.checkIn.findMany({
          where: { userId: req.userId, createdAt: { gte: daysAgo(7) }, type: { not: 'freeze' } },
          select: { mood: true, focus: true, confidence: true },
        }),
        // Previous week for trend comparison (exclude freeze entries)
        prisma.checkIn.findMany({
          where: { userId: req.userId, createdAt: { gte: daysAgo(14), lt: daysAgo(7) }, type: { not: 'freeze' } },
          select: { mood: true, focus: true, confidence: true },
        }),
        // Total ever (exclude freeze entries)
        prisma.checkIn.count({ where: { userId: req.userId, type: { not: 'freeze' } } }),
        // User for freeze count
        prisma.user.findUnique({ where: { id: req.userId }, select: { streakFreezeCount: true } }),
        // Last 14 days real check-ins (for fitness consistency score)
        prisma.checkIn.count({ where: { userId: req.userId, createdAt: { gte: daysAgo(14) }, type: { not: 'freeze' } } }),
        // Achievements earned (for fitness score + share card)
        prisma.userAchievement.findMany({ where: { userId: req.userId }, select: { key: true } }),
        // This week MFS entries (for drive/calm/selftalk/bounce averages)
        prisma.mentalFitnessEntry.findMany({
          where: { userId: req.userId, date: { gte: daysAgoStr(7) } },
          select: { drive: true, calm: true, selftalk: true, bounce: true },
        }),
        // Prev week MFS entries for trend comparison
        prisma.mentalFitnessEntry.findMany({
          where: { userId: req.userId, date: { gte: daysAgoStr(14), lt: daysAgoStr(7) } },
          select: { drive: true, calm: true, selftalk: true, bounce: true },
        }),
      ]);

    const chartData = periodCheckIns.map(c => ({
      date:       formatChartDate(c.createdAt),
      mood:       c.mood,
      focus:      c.focus,
      confidence: c.confidence,
    }));

    const streak    = calculateStreak(allCheckIns);
    const weeklyAvg = {
      mood:       avg(thisWeekCheckIns, 'mood'),
      focus:      avg(thisWeekCheckIns, 'focus'),
      confidence: avg(thisWeekCheckIns, 'confidence'),
      drive:      avg(thisMfsEntries, 'drive'),
      calm:       avg(thisMfsEntries, 'calm'),
      selftalk:   avg(thisMfsEntries, 'selftalk'),
      bounce:     avg(thisMfsEntries, 'bounce'),
    };

    res.json({
      chartData,
      days,
      streak,
      totalCheckIns,
      freezeCount:    user?.streakFreezeCount ?? 0,
      fitnessScore:   calcFitnessScore(streak, last14Count, weeklyAvg, userAchievements.length),
      achievements:   userAchievements.map(a => a.key),
      weeklyAvg,
      prevWeekAvg: {
        mood:       avg(prevWeekCheckIns, 'mood'),
        focus:      avg(prevWeekCheckIns, 'focus'),
        confidence: avg(prevWeekCheckIns, 'confidence'),
        drive:      avg(prevMfsEntries, 'drive'),
        calm:       avg(prevMfsEntries, 'calm'),
        selftalk:   avg(prevMfsEntries, 'selftalk'),
        bounce:     avg(prevMfsEntries, 'bounce'),
      },
    });
  } catch {
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
