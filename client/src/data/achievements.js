// Achievement metadata — mirrors server/src/services/gamification.js
// Keys must stay in sync with the server-side ACHIEVEMENTS object.

export const ACHIEVEMENTS = {
  first_checkin: { name: 'First Step',       icon: '🌱', xp: 50,  desc: 'Completed your first check-in with Arjun' },
  streak_3:      { name: 'Rookie Mind',       icon: '🏅', xp: 75,  desc: 'Built a 3-day check-in streak' },
  streak_7:      { name: 'Mental Athlete',    icon: '🔥', xp: 150, desc: 'Built a 7-day check-in streak' },
  streak_14:     { name: 'Zone Master',       icon: '⚡', xp: 300, desc: 'Built a 14-day check-in streak' },
  streak_30:     { name: 'Elite Mindset',     icon: '🏆', xp: 500, desc: 'Built a 30-day check-in streak' },
  comeback:      { name: 'Comeback',          icon: '💪', xp: 100, desc: 'Returned after 3+ days away' },
  reflector:     { name: 'Deep Thinker',      icon: '🧠', xp: 100, desc: 'Added a reflection in 5 check-ins' },
  perfect_week:  { name: 'Perfect Week',      icon: '🛡️', xp: 250, desc: '7 check-ins across 7 consecutive days' },
  chat_10:       { name: 'In the Zone',       icon: '💬', xp: 200, desc: '10 coaching sessions with Arjun' },
};

export const ALL_ACHIEVEMENT_KEYS = Object.keys(ACHIEVEMENTS);
