const express = require('express');
const { PrismaClient } = require('@prisma/client');

const router = express.Router();
const prisma = new PrismaClient();

function founderAuth(req, res, next) {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token || token !== process.env.FOUNDER_TOKEN) {
    return res.status(403).json({ error: 'Forbidden' });
  }
  next();
}

router.get('/pulse', founderAuth, async (req, res) => {
  try {
    const now = new Date();
    const todayStart = new Date(now);
    todayStart.setUTCHours(0, 0, 0, 0);
    const weekStart  = new Date(now.getTime() - 7  * 24 * 60 * 60 * 1000);
    const trial14    = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);
    const trial11    = new Date(now.getTime() - 11 * 24 * 60 * 60 * 1000);

    // IST date string for MentalFitnessEntry (stored as "YYYY-MM-DD" IST)
    const todayIST = new Date(now.getTime() + 5.5 * 60 * 60 * 1000)
      .toISOString().slice(0, 10);

    const [
      totalUsers,
      paidUsers,
      activeTrialUsers,
      expiredTrialUsers,
      onboardedUsers,
      expiringSoonUsers,
      checkinsToday,
      sessionsToday,
      messagesToday,
      messagesWeek,
      debriefsWeek,
      newUsersWeek,
      flaggedCards,
    ] = await Promise.all([
      prisma.user.count(),
      prisma.user.count({ where: { tier: 'premium' } }),
      prisma.user.count({ where: { tier: 'free', trialStarted: { gte: trial14 } } }),
      prisma.user.count({ where: { tier: 'free', trialStarted: { lt: trial14 } } }),
      prisma.user.count({ where: { onboardingDone: true } }),
      prisma.user.findMany({
        where: { tier: 'free', trialStarted: { gte: trial14, lte: trial11 } },
        select: { name: true, sport: true, trialStarted: true },
        orderBy: { trialStarted: 'asc' },
      }),
      prisma.mentalFitnessEntry.count({ where: { date: todayIST } }),
      prisma.chatSession.count({ where: { createdAt: { gte: todayStart } } }),
      prisma.message.count({ where: { createdAt: { gte: todayStart } } }),
      prisma.message.count({ where: { createdAt: { gte: weekStart } } }),
      prisma.debrief.count({ where: { createdAt: { gte: weekStart } } }),
      prisma.user.count({ where: { createdAt: { gte: weekStart } } }),
      prisma.selfTalkCard.count({ where: { safetyFlag: true } }),
    ]);

    const expiringSoon = expiringSoonUsers.map(u => ({
      name: u.name || 'Unknown',
      sport: u.sport || '—',
      daysLeft: Math.max(0, Math.ceil(
        (u.trialStarted.getTime() + 14 * 24 * 60 * 60 * 1000 - now.getTime()) / (24 * 60 * 60 * 1000)
      )),
    }));

    res.json({
      users: {
        total: totalUsers,
        paid: paidUsers,
        activeTrial: activeTrialUsers,
        expiredTrial: expiredTrialUsers,
        onboarded: onboardedUsers,
      },
      expiringSoon,
      today: {
        date: todayIST,
        checkins: checkinsToday,
        sessions: sessionsToday,
        messages: messagesToday,
      },
      week: {
        messages: messagesWeek,
        debriefs: debriefsWeek,
        newUsers: newUsersWeek,
      },
      safety: { flaggedCards },
    });
  } catch (err) {
    console.error('founder pulse error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
