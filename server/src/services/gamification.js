const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

// ── Achievement definitions ────────────────────────────────────────────────
// Key is stored in UserAchievement.key. All metadata lives here (not in DB).

const ACHIEVEMENTS = {
  first_checkin:   { name: 'First Step',        icon: '🌱', xp: 50,  desc: 'Completed your first check-in with Arjun' },
  streak_3:        { name: 'Rookie Mind',        icon: '🏅', xp: 75,  desc: 'Built a 3-day check-in streak' },
  streak_7:        { name: 'Mental Athlete',     icon: '🔥', xp: 150, desc: 'Built a 7-day check-in streak' },
  streak_14:       { name: 'Zone Master',        icon: '⚡', xp: 300, desc: 'Built a 14-day check-in streak' },
  streak_30:       { name: 'Elite Mindset',      icon: '🏆', xp: 500, desc: 'Built a 30-day check-in streak' },
  comeback:        { name: 'Comeback',           icon: '💪', xp: 100, desc: 'Returned after 3+ days away' },
  reflector:       { name: 'Deep Thinker',       icon: '🧠', xp: 100, desc: 'Added a reflection in 5 check-ins' },
  perfect_week:    { name: 'Perfect Week',       icon: '🛡️', xp: 250, desc: '7 check-ins across 7 consecutive days' },
  chat_10:         { name: 'In the Zone',        icon: '💬', xp: 200, desc: '10 coaching sessions with Arjun' },
};

// ── XP helpers ─────────────────────────────────────────────────────────────

async function awardXP(userId, amount) {
  return prisma.user.update({
    where: { id: userId },
    data: { xp: { increment: amount } },
    select: { xp: true },
  });
}

// ── Achievement check — called after every check-in ───────────────────────
// Returns array of newly earned achievement keys (with their metadata).

async function checkCheckInAchievements(userId) {
  const newlyEarned = [];

  // Fetch all user's check-ins + existing achievements in parallel
  const [checkIns, existing] = await Promise.all([
    prisma.checkIn.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      select: { createdAt: true, reflection: true },
    }),
    prisma.userAchievement.findMany({
      where: { userId },
      select: { key: true },
    }),
  ]);

  const earned = new Set(existing.map(a => a.key));
  const toAward = [];

  // ── first_checkin ──────────────────────────────────────────────────────
  if (!earned.has('first_checkin') && checkIns.length === 1) {
    toAward.push('first_checkin');
  }

  // ── streak achievements ────────────────────────────────────────────────
  const streak = calculateStreak(checkIns);
  for (const [key, required] of [['streak_3', 3], ['streak_7', 7], ['streak_14', 14], ['streak_30', 30]]) {
    if (!earned.has(key) && streak >= required) {
      toAward.push(key);
    }
  }

  // ── comeback (check-in after 3+ day gap) ─────────────────────────────
  if (!earned.has('comeback') && checkIns.length >= 2) {
    const latest = new Date(checkIns[0].createdAt);
    const previous = new Date(checkIns[1].createdAt);
    const gapDays = (latest - previous) / (1000 * 60 * 60 * 24);
    if (gapDays >= 3) {
      toAward.push('comeback');
    }
  }

  // ── reflector (reflection in 5 check-ins) ─────────────────────────────
  if (!earned.has('reflector')) {
    const reflectionCount = checkIns.filter(c => c.reflection).length;
    if (reflectionCount >= 5) {
      toAward.push('reflector');
    }
  }

  // ── perfect_week (7 check-ins in 7 consecutive days) ─────────────────
  if (!earned.has('perfect_week') && checkIns.length >= 7) {
    const last7Days = getLast7DaysDates();
    const checkInDates = new Set(checkIns.map(c => utcDateStr(c.createdAt)));
    if (last7Days.every(d => checkInDates.has(d))) {
      toAward.push('perfect_week');
    }
  }

  if (!toAward.length) return [];

  // Award all new achievements + XP in parallel
  await Promise.all([
    prisma.userAchievement.createMany({
      data: toAward.map(key => ({ userId, key })),
      skipDuplicates: true,
    }),
    ...toAward.map(key => awardXP(userId, ACHIEVEMENTS[key].xp)),
  ]);

  // Return metadata for the frontend to display
  newlyEarned.push(...toAward.map(key => ({ key, ...ACHIEVEMENTS[key] })));
  return newlyEarned;
}

// ── Chat achievement check ──────────────────────────────────────────────────

async function checkChatAchievements(userId) {
  const newlyEarned = [];

  const [msgCount, existing] = await Promise.all([
    prisma.message.count({ where: { userId, role: 'user' } }),
    prisma.userAchievement.findMany({ where: { userId }, select: { key: true } }),
  ]);

  const earned = new Set(existing.map(a => a.key));

  if (!earned.has('chat_10') && msgCount >= 10) {
    await Promise.all([
      prisma.userAchievement.create({ data: { userId, key: 'chat_10' } }),
      awardXP(userId, ACHIEVEMENTS.chat_10.xp),
    ]);
    newlyEarned.push({ key: 'chat_10', ...ACHIEVEMENTS.chat_10 });
  }

  return newlyEarned;
}

// ── Utility ────────────────────────────────────────────────────────────────

function utcDateStr(date) {
  return new Date(date).toISOString().slice(0, 10);
}

function calculateStreak(checkIns) {
  if (!checkIns.length) return 0;
  const uniqueDates = [...new Set(checkIns.map(c => utcDateStr(c.createdAt)))].sort((a, b) => b.localeCompare(a));
  const today     = utcDateStr(new Date());
  const yesterday = utcDateStr(new Date(Date.now() - 86400000));
  if (uniqueDates[0] !== today && uniqueDates[0] !== yesterday) return 0;
  let streak = 1;
  for (let i = 1; i < uniqueDates.length; i++) {
    const diffDays = Math.round((new Date(uniqueDates[i - 1]) - new Date(uniqueDates[i])) / 86400000);
    if (diffDays === 1) streak++;
    else break;
  }
  return streak;
}

function getLast7DaysDates() {
  return Array.from({ length: 7 }, (_, i) => utcDateStr(new Date(Date.now() - i * 86400000)));
}

module.exports = { ACHIEVEMENTS, awardXP, checkCheckInAchievements, checkChatAchievements };
