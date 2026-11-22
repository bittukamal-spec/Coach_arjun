import { useCallback, useEffect, useState } from 'react';
import { apiFetch } from '../../api';
import { useAuth } from '../../contexts/AuthContext';
import { translations } from '../../i18n/translations';

// Mind Challenge — shared data + helpers (docs/PATH-STRATEGY.md, Hook Model).
export const SKILLS = ['calm', 'focus', 'confidence', 'routine', 'bounce', 'picture'];
export const SKILL_BAR = {
  calm: 'bg-mint', focus: 'bg-[#9DB4FF]', confidence: 'bg-blush',
  routine: 'bg-sky', bounce: 'bg-coral', picture: 'bg-sun',
};
export const challengeText = (language) => translations[language]?.challenge || translations.en.challenge;

// Same rule as the server (services/path/mindChallenge.js): 0–6 points → Level 1–5.
export function levelFromPoints(p) {
  const n = Math.max(0, Math.min(6, Math.round(Number(p) || 0)));
  if (n <= 1) return 1;
  if (n === 2) return 2;
  if (n <= 4) return 3;
  if (n === 5) return 4;
  return 5;
}

export function daysUntil(date, now = new Date()) {
  if (!date) return 0;
  return Math.max(0, Math.ceil((new Date(date) - now) / 86400000));
}

export function useMindChallenge() {
  const { token } = useAuth();
  const [state, setState] = useState(null);
  const [error, setError] = useState(false);
  const headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` };

  const load = useCallback(async () => {
    setError(false);
    try {
      const res = await apiFetch('/api/mind-challenge', { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) throw new Error(String(res.status));
      setState(await res.json());
    } catch { setError(true); }
  }, [token]);

  useEffect(() => { load(); }, [load]);

  const save = useCallback(async (points) => {
    const res = await apiFetch('/api/mind-challenge', { method: 'POST', headers, body: JSON.stringify({ points }) });
    if (!res.ok) throw new Error(String(res.status));
    const next = await res.json();
    setState(next);
    return next;
  }, [token]); // eslint-disable-line react-hooks/exhaustive-deps

  const setGoal = useCallback(async (focusSkill, nextMatch) => {
    const res = await apiFetch('/api/mind-challenge/latest/goal', { method: 'PATCH', headers, body: JSON.stringify({ focusSkill, nextMatch }) });
    if (!res.ok) throw new Error(String(res.status));
    const next = await res.json();
    setState(next);
    return next;
  }, [token]); // eslint-disable-line react-hooks/exhaustive-deps

  return { state, error, reload: load, save, setGoal };
}
