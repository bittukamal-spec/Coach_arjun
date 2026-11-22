// Moment reminders (Hook fix 4, docs/HOOK-AUDIT.md #4). The scheduler still
// sends AT MOST ONE reminder per athlete per local day (around 18:00). On a
// day that matters, that one reminder is specific instead of generic:
//
//   match_tomorrow → the day before their match
//   match_review   → 1–3 days after it, until they answer "How did it go?"
//   rematch        → the first 3 days after a Mind Challenge rematch opens
//   weekly         → Mondays, if they talked to Arjun in the last 7 days
//
// Copy is fixed and hand-written (no AI, no athlete text, no names), with
// no streak, guilt or urgency language. Each kind has its own switch on the
// athlete's preference; the master switch still turns everything off.

const REMATCH_DAYS = 28;
const REMATCH_NUDGE_DAYS = 3;
const REVIEW_WINDOW_DAYS = 3;

const MOMENT_MESSAGES = {
  match_tomorrow: { title: 'Match tomorrow', body: 'Your 3-minute prep is ready. Open Arjun when you have a moment.', route: '/dashboard' },
  match_review: { title: 'How did your match go?', body: 'Two taps — and Arjun will remember it.', route: '/dashboard' },
  rematch: { title: 'Your Mind Challenge rematch is ready', body: 'Four weeks of practice — see what levelled up.', route: '/mind-challenge' },
  weekly: { title: 'Your week with Arjun is ready', body: 'A short look back at what helped this week.', route: '/weekly-reviews' },
};

const dayNum = (key) => Math.floor(Date.parse(`${key}T00:00:00Z`) / 86400000);
const isDayKey = (k) => typeof k === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(k) && Number.isFinite(Date.parse(`${k}T00:00:00Z`));

// Pure: picks the moment for this athlete today, or null for the generic
// reminder. `localDate` is "YYYY-MM-DD" and `localWeekday` 0–6 (Sun–Sat),
// both in the athlete's own timezone.
function pickMoment({ localDate, localWeekday, nowMs, nextMatchDay = null, lastChallengeAt = null, chattedLastWeek = false, pref = {} }) {
  if (pref.matchReminders !== false && isDayKey(nextMatchDay) && isDayKey(localDate)) {
    const d = dayNum(nextMatchDay) - dayNum(localDate);
    if (d === 1) return 'match_tomorrow';
    if (d < 0 && -d <= REVIEW_WINDOW_DAYS) return 'match_review';
  }
  if (pref.rematchReminders !== false && lastChallengeAt) {
    const readyAt = new Date(lastChallengeAt).getTime() + REMATCH_DAYS * 86400000;
    const since = (nowMs - readyAt) / 86400000;
    if (since >= 0 && since < REMATCH_NUDGE_DAYS) return 'rematch';
  }
  if (pref.weeklyReminders !== false && localWeekday === 1 && chattedLastWeek) return 'weekly';
  return null;
}

// Reads only what pickMoment needs. Never throws — any failure falls back
// to the generic reminder.
async function loadMomentContext(client, userId, nowDate) {
  try {
    const [progress, challenge, chats] = await Promise.all([
      client.pathProgress?.findUnique ? client.pathProgress.findUnique({ where: { userId }, select: { nextMatchDay: true } }) : null,
      client.mindChallengeResult?.findFirst ? client.mindChallengeResult.findFirst({ where: { userId }, orderBy: { createdAt: 'desc' }, select: { createdAt: true } }) : null,
      client.message?.count ? client.message.count({ where: { userId, role: 'user', createdAt: { gte: new Date(nowDate.getTime() - 7 * 86400000) } } }) : 0,
    ]);
    return { nextMatchDay: progress?.nextMatchDay || null, lastChallengeAt: challenge?.createdAt || null, chattedLastWeek: (chats || 0) > 0 };
  } catch (err) {
    console.error('[push-moments] context error:', err?.message);
    return {};
  }
}

function buildMomentPayload(moment) {
  const m = MOMENT_MESSAGES[moment];
  return m ? JSON.stringify({ title: m.title, body: m.body, route: m.route }) : null;
}

module.exports = { MOMENT_MESSAGES, pickMoment, loadMomentContext, buildMomentPayload };
