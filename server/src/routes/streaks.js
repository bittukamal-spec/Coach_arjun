const express    = require('express');
const { PrismaClient } = require('@prisma/client');
const authenticate = require('../middleware/authenticate');

const router = express.Router();
const prisma = new PrismaClient();

function utcDateStr(date) { return new Date(date).toISOString().slice(0, 10); }
function startOfTodayUTC()     { const d = new Date(); d.setUTCHours(0,0,0,0); return d; }
function startOfYesterdayUTC() { const d = new Date(Date.now() - 86400000); d.setUTCHours(0,0,0,0); return d; }
function calculateStreak(checkIns) {
  if (!checkIns.length) return 0;
  const uniqueDates = [...new Set(checkIns.map(c => utcDateStr(c.createdAt)))].sort((a, b) => b.localeCompare(a));
  const today     = utcDateStr(new Date());
  const yesterday = utcDateStr(new Date(Date.now() - 86400000));
  if (uniqueDates[0] !== today && uniqueDates[0] !== yesterday) return 0;
  let streak = 1;
  for (let i = 1; i < uniqueDates.length; i++) {
    const diffDays = Math.round((new Date(uniqueDates[i-1]) - new Date(uniqueDates[i])) / 86400000);
    if (diffDays === 1) streak++;
    else break;
  }
  return streak;
}

router.post('/freeze', authenticate, async (req, res) => {
  const todayStr     = utcDateStr(new Date());
  const yesterdayStr = utcDateStr(new Date(Date.now() - 86400000));

  try {
    const user = await prisma.user.findUnique({
      where: { id: req.userId },
      select: { streakFreezeCount: true, lastFreezeUsedAt: true },
    });

    if (user.streakFreezeCount <= 0)
      return res.status(400).json({ error: 'No freezes available' });

    if (user.lastFreezeUsedAt && utcDateStr(user.lastFreezeUsedAt) === yesterdayStr)
      return res.status(400).json({ error: 'Cannot use freeze two days in a row' });

    const existingYesterday = await prisma.checkIn.findFirst({
      where: {
        userId: req.userId,
        createdAt: { gte: startOfYesterdayUTC(), lt: startOfTodayUTC() },
      },
    });
    if (existingYesterday)
      return res.status(400).json({ error: 'Yesterday already has a check-in' });

    const yesterdayNoon = new Date(yesterdayStr + 'T12:00:00.000Z');
    await prisma.checkIn.create({
      data: {
        userId: req.userId,
        mood: 3, focus: 3, confidence: 3,
        type: 'freeze',
        createdAt: yesterdayNoon,
      },
    });

    const updated = await prisma.user.update({
      where: { id: req.userId },
      data: { streakFreezeCount: { decrement: 1 }, lastFreezeUsedAt: new Date() },
      select: { streakFreezeCount: true },
    });

    const allCheckIns = await prisma.checkIn.findMany({
      where: { userId: req.userId },
      orderBy: { createdAt: 'desc' },
      select: { createdAt: true },
    });
    const streak = calculateStreak(allCheckIns);

    res.json({ streak, freezeCount: updated.streakFreezeCount });
  } catch (err) {
    console.error('freeze error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
