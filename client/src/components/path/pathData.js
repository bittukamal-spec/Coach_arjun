import { useCallback, useEffect, useState } from 'react';
import { apiFetch } from '../../api';
import { useAuth } from '../../contexts/AuthContext';
import { translations } from '../../i18n/translations';
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

// Where the "Next" button takes the athlete for a given step.
export function nextHref(chapterKey, stepKey, t) {
  if (stepKey === 'learn') return `/path/${chapterKey}/learn`;
  if (stepKey === 'practise') return t.chapters[chapterKey]?.route || `/path/${chapterKey}`;
  if (stepKey === 'reflect') return '/mind-journal/new';
  return `/path/${chapterKey}`;
}

export function nextLabel(chapterKey, stepKey, t) {
  const ch = t.chapters[chapterKey];
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

  const markStep = useCallback(async (chapterKey, stepKey, outcome) => {
    const res = await apiFetch('/api/path/steps', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ chapterKey, stepKey, ...(outcome ? { outcome } : {}) }),
    });
    if (!res.ok) throw new Error(String(res.status));
    const next = await res.json();
    setPath(next);
    return next;
  }, [token]);

  return { path, error, reload: load, markStep };
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
export function nextStepText(chapterKey, stepKey, t) {
  const ch = t.chapters[chapterKey];
  if (!ch) return '';
  if (stepKey === 'learn') return ch.lesson.title;
  if (stepKey === 'practise') return ch.practise;
  if (stepKey === 'play') return ch.play;
  return t.homeNextReflect;
}
