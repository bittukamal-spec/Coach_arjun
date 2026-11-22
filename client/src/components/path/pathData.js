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
