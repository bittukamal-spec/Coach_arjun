// Next match + path awareness for Coach (Hook fix 2, docs/HOOK-AUDIT.md #2).
// Days are plain calendar days "YYYY-MM-DD" in India time (the app is
// India-only), so "tomorrow" means the same thing to the athlete and Coach.

const { CHAPTER_NOTES, STEP_NOTES, PLAN_NOTES } = require('./pathConfig');

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
const MAX_AHEAD_DAYS = 180;
// After the match day, the "How did it go?" moment stays open this long.
const REVIEW_WINDOW_DAYS = 3;

function indiaToday(now = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
}

// Whole days from `from` to `to` (both "YYYY-MM-DD"); positive = in the future.
function dayDiff(from, to) {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86400000);
}

function isValidDay(day) {
  if (typeof day !== 'string' || !DAY_RE.test(day)) return false;
  const t = Date.parse(`${day}T00:00:00Z`);
  return Number.isFinite(t) && new Date(t).toISOString().slice(0, 10) === day;
}

// A day the athlete may pick: today up to ~6 months ahead.
function isPickableDay(day, today = indiaToday()) {
  if (!isValidDay(day)) return false;
  const d = dayDiff(today, day);
  return d >= 0 && d <= MAX_AHEAD_DAYS;
}

// Where the athlete is relative to their next match.
// 'none' | 'ahead' | 'tomorrow' | 'today' | 'review' (1–3 days after) | 'stale'
function matchPhase(nextDay, today = indiaToday()) {
  if (!isValidDay(nextDay)) return 'none';
  const d = dayDiff(today, nextDay);
  if (d > 1) return 'ahead';
  if (d === 1) return 'tomorrow';
  if (d === 0) return 'today';
  if (-d <= REVIEW_WINDOW_DAYS) return 'review';
  return 'stale';
}

const FEEL_TEXT = { well: 'went well', mixed: 'was mixed', tough: 'was tough' };

// Internal system note for Coach (uncached, after the stable prompt).
// Empty when there is nothing useful to say.
function planText(plan) {
  const t = plan && PLAN_NOTES[plan.tool]?.[plan.moment];
  return t ? t.replace('{cue}', String(plan.cue || '').slice(0, 60)) : null;
}

function buildPathCoachSection({ path, match, plan } = {}, today = indiaToday()) {
  const lines = [];
  if (path && !path.finished && path.next) {
    const ch = CHAPTER_NOTES[path.next.chapterKey];
    if (ch) {
      lines.push(`Learning path: they are on the chapter "${ch.name}" — ${ch.skill}. Their next step is to ${STEP_NOTES[path.next.stepKey] || 'continue the chapter'}.`);
      lines.push(`Bring this up only when it fits what they say (e.g. suggest ${ch.practise} when it matches their problem). Never push it in every message, and never mention "the path" if they came with something else.`);
    }
  }
  const phase = matchPhase(match?.nextDay, today);
  if (phase === 'tomorrow' || phase === 'today') {
    lines.push(`Their next match is ${phase === 'today' ? 'TODAY' : 'TOMORROW'}. If they have not raised something else, start by asking how they feel about it (calm, nervous or excited) and offer one short match-prep step (a 2-minute Pressure Reset, their Focus Card words, or the skill from their chapter). Keep it light — no pressure, no "must win" talk.`);
  } else if (phase === 'ahead') {
    lines.push(`Their next match is in ${dayDiff(today, match.nextDay)} days (${match.nextDay}).`);
  } else if (phase === 'review') {
    lines.push(`They had a match ${-dayDiff(today, match.nextDay)} day(s) ago and have not said how it went yet. If it fits, ask how it went before anything else.`);
  }
  const pt = planText(plan || path?.plan);
  if (pt) lines.push(`Their play plan (an if–then plan they chose after a practice): ${pt}. Back it up and ask how it went after they have played; don't add new plans on top.`);
  if (match?.lastFeel && match?.lastDay && dayDiff(match.lastDay, today) <= 7) {
    lines.push(`Their last match (${match.lastDay}) ${FEEL_TEXT[match.lastFeel] || 'happened'}, in their words.`);
  }
  if (!lines.length) return '';
  return `\n\n## Path and next match (internal)\n${lines.join('\n')}`;
}

module.exports = { planText, indiaToday, dayDiff, isValidDay, isPickableDay, matchPhase, buildPathCoachSection, REVIEW_WINDOW_DAYS };
