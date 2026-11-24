import { useCallback, useEffect, useState } from 'react';
import { apiFetch } from '../../api';
import { useAuth } from '../../contexts/AuthContext';
import { translations } from '../../i18n/translations';
import { sportBlock } from '../../i18n/sportExamples';
import { Wind, Target, MessageCircle, ListChecks, RotateCcw, Eye } from 'lucide-react';

// Learning path — shared bits for the Profile section, chapter and lesson
// screens (docs/PATH-STRATEGY.md). English-only copy (Hindi UI is off).
export const pathText = (language) => translations[language]?.path || translations.en.path;

export const CHAPTER_LOOK = {
  calm:       { Icon: Wind,          block: 'bg-mint' },
  focus:      { Icon: Target,        block: 'bg-sky' },
  confidence: { Icon: MessageCircle, block: 'bg-coral' },
  routine:    { Icon: ListChecks,    block: 'bg-sun' },
  bounce:     { Icon: RotateCcw,     block: 'bg-blush' },
  picture:    { Icon: Eye,           block: 'bg-mint' },
};

export const STEP_ORDER = ['learn', 'practise', 'play', 'reflect'];

// ── Levels (founder, Nov 2026) ──────────────────────────────────────────
// Lesson words follow the athlete's sport: {focusWord}, {resetWord}, {unit}.
export function fillSportWords(text, sport, t) {
  if (typeof text !== 'string') return text;
  const sb = sportBlock(sport);
  const words = { focusWord: sb.focusWord, resetWord: sb.resetWord, unit: planUnit(sport, t) };
  return text.replace(/\{(focusWord|resetWord|unit)\}/g, (_, k) => words[k]);
}

// A chapter's words at a level: level 1 = the chapter itself; levels 2–3
// swap in that level's lesson, practise and play.
export function chapterAt(t, chapterKey, level = 1, sport) {
  const base = t.chapters[chapterKey];
  if (!base) return null;
  const extra = Number(level) > 1 ? t.chapterLevels?.[chapterKey]?.[Number(level)] : null;
  const merged = extra ? { ...base, ...extra } : base;
  const f = (x) => fillSportWords(x, sport, t);
  return {
    ...merged,
    practise: f(merged.practise),
    play: f(merged.play),
    lesson: { title: f(merged.lesson.title), cards: merged.lesson.cards.map(f), takeaway: f(merged.lesson.takeaway) },
  };
}

const levelQuery = (level) => (Number(level) > 1 ? `?level=${Number(level)}` : '');

// Where the "Next" button takes the athlete for a given step.
export function nextHref(chapterKey, stepKey, t, level = 1) {
  if (stepKey === 'learn') return `/path/${chapterKey}/learn${levelQuery(level)}`;
  if (stepKey === 'practise') return t.chapters[chapterKey]?.route || `/path/${chapterKey}${levelQuery(level)}`;
  if (stepKey === 'reflect') return `/path/${chapterKey}/reflect${levelQuery(level)}`;
  return `/path/${chapterKey}${levelQuery(level)}`;
}

export function nextLabel(chapterKey, stepKey, t, level = 1, sport) {
  const ch = chapterAt(t, chapterKey, level, sport);
  if (!ch) return '';
  if (stepKey === 'learn') return t.next.learn(ch.lesson.title);
  if (stepKey === 'practise') return t.next.practise(ch.practise);
  return t.next[stepKey];
}

export function usePath() {
  const { token } = useAuth();
  const [path, setPath] = useState(null);
  const [error, setError] = useState(false);

  const load = useCallback(async () => {
    setError(false);
    try {
      const res = await apiFetch('/api/path', { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) throw new Error(String(res.status));
      setPath(await res.json());
    } catch {
      setError(true);
    }
  }, [token]);

  useEffect(() => { load(); }, [load]);

  const markStep = useCallback(async (chapterKey, stepKey, outcome, level = 1) => {
    const res = await apiFetch('/api/path/steps', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ chapterKey, stepKey, ...(outcome ? { outcome } : {}), ...(Number(level) > 1 ? { level: Number(level) } : {}) }),
    });
    if (!res.ok) throw new Error(String(res.status));
    const next = await res.json();
    setPath(next);
    return next;
  }, [token]);

  // Next match (Hook fix 2): set/clear the day, and "How did it go?".
  const send = useCallback(async (url, method, body) => {
    const res = await apiFetch(url, {
      method,
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(String(res.status));
    const next = await res.json();
    setPath(next);
    return next;
  }, [token]);
  const setMatchDay = useCallback((day, type = null) => send('/api/path/match', 'PUT', { day, type: day ? type : null }), [send]);
  const reviewMatch = useCallback((feel, used) => send('/api/path/match/review', 'POST', { feel, used }), [send]);

  return { path, error, reload: load, markStep, setMatchDay, reviewMatch };
}

// ── Next match days (calendar days "YYYY-MM-DD" on the athlete's phone) ──
export function dayKey(date = new Date()) {
  const p = (n) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${p(date.getMonth() + 1)}-${p(date.getDate())}`;
}

export function dayFromKey(key) {
  const [y, m, d] = String(key).split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function daysFromToday(key, now = new Date()) {
  const today = dayFromKey(dayKey(now));
  return Math.round((dayFromKey(key) - today) / 86400000);
}

// none | ahead | tomorrow | today | review (1–3 days after) | stale
export function matchPhase(key, now = new Date()) {
  if (!key || !/^\d{4}-\d{2}-\d{2}$/.test(key)) return 'none';
  const d = daysFromToday(key, now);
  if (d > 1) return 'ahead';
  if (d === 1) return 'tomorrow';
  if (d === 0) return 'today';
  if (d >= -3) return 'review';
  return 'stale';
}

export function weekdayOf(key, style = 'long') {
  return dayFromKey(key).toLocaleDateString('en-IN', { weekday: style });
}

// "Chapter unlocked!" moment (Hook Model reward): remembers which finished
// chapters this browser has already celebrated. The first time it ever runs
// it only records what is already done, so old progress is never celebrated.
const SEEN_KEY = 'arjun_path_seen';
export function takeNewlyFinished(path) {
  if (!path?.chapters) return null;
  const done = path.chapters.filter(c => c.status === 'done').map(c => c.key);
  let seen = null;
  try { seen = JSON.parse(localStorage.getItem(SEEN_KEY) || 'null'); } catch { seen = null; }
  const save = (list) => { try { localStorage.setItem(SEEN_KEY, JSON.stringify({ done: list })); } catch { /* optional */ } };
  if (!seen || !Array.isArray(seen.done)) { save(done); return null; }
  const fresh = done.filter(k => !seen.done.includes(k));
  if (!fresh.length) return null;
  save([...seen.done, ...fresh]);
  return fresh[fresh.length - 1];
}

// What the next step asks for, in a few words (Home's "Your next step" card).
export function nextStepText(chapterKey, stepKey, t, level = 1, sport) {
  const ch = chapterAt(t, chapterKey, level, sport);
  if (!ch) return '';
  if (stepKey === 'learn') return ch.lesson.title;
  if (stepKey === 'practise') return ch.practise;
  if (stepKey === 'play') return ch.play;
  return t.homeNextReflect;
}

// ── Play plan (Hook fix 3) ───────────────────────────────────────────────
export function planUnit(sport, t) {
  return t.plan.unit[String(sport || '').toLowerCase()] || t.plan.unitFallback;
}

export function planText(plan, sport, t) {
  const fn = plan && t.plan.text[plan.tool]?.[plan.moment];
  return fn ? fn(plan.cue || '', planUnit(sport, t)) : null;
}
