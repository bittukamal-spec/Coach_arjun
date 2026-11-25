import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronRight } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { apiFetch } from '../../api';
import { translations } from '../../i18n/translations';

// Hook fix 6 — "your words come back" (variable reward from past
// investment). One small card on Home with ONE thing the athlete made
// themselves: a Focus Card word, a saved cue, a "take this forward" line
// from their journal, or something they learned from a practice. Which one
// changes by day, so it is a little different each time. Read-only; hidden
// when they have saved nothing yet.
export function pickWords(data, now = new Date()) {
  if (!data) return null;
  const items = [];
  for (const c of data.focusCards || []) if (c?.focusWord) items.push({ kind: 'card', text: c.focusWord, to: '/focus-deck' });
  for (const c of data.savedCues || []) if (c?.cue) items.push({ kind: 'cue', text: c.cue, to: '/mental-rep' });
  for (const j of data.takeForwards || []) if (j?.text) items.push({ kind: 'journal', text: j.text, at: j.createdAt, to: `/mind-journal/${j.id}` });
  for (const o of data.practiceOutcomes || []) if (o?.lesson) items.push({ kind: 'lesson', text: o.lesson, to: '/my-practice' });
  if (!items.length) return null;
  const day = Math.floor((now.getTime() - now.getTimezoneOffset() * 60000) / 86400000);
  return items[day % items.length];
}

const TONE = { card: 'bg-coral', cue: 'bg-sun', journal: 'bg-blush', lesson: 'bg-mint' };

function usePlaybookWords(token) {
  const [data, setData] = useState(null);
  useEffect(() => {
    let live = true;
    apiFetch('/api/playbook', { headers: { Authorization: `Bearer ${token}` } })
      .then(r => (r.ok ? r.json() : null))
      .then(d => { if (live) setData(d); })
      .catch(() => {});
    return () => { live = false; };
  }, [token]);
  return pickWords(data);
}

// Home tile row (founder, Nov 2026: a calmer Home): the same "your words"
// as one square tile beside Mind Journal, My practice and Weekly reviews.
export function YourWordsTile() {
  const { token, language } = useAuth();
  const t = ((translations[language] || translations.en).yourWords) || translations.en.yourWords;
  const item = usePlaybookWords(token);
  if (!item) return null;
  const when = item.at ? new Date(item.at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }) : null;
  return (
    <Link to={item.to} data-testid="your-words"
      className={`flex aspect-square w-[42vw] max-w-[168px] shrink-0 snap-start flex-col justify-between rounded-[24px] p-3.5 text-inkblock active:scale-[0.98] transition-transform focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2 ${TONE[item.kind]}`}>
      <span className="text-[11px] font-extrabold uppercase tracking-[0.08em] opacity-80">{t.tag[item.kind](when)}</span>
      <span className="text-[19px] font-extrabold leading-tight [overflow-wrap:anywhere] line-clamp-4">“{item.text}”</span>
    </Link>
  );
}

export default function YourWordsCard() {
  const { token, language } = useAuth();
  const t = ((translations[language] || translations.en).yourWords) || translations.en.yourWords;
  const item = usePlaybookWords(token);
  if (!item) return null;
  const when = item.at ? new Date(item.at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }) : null;
  return (
    <Link to={item.to} data-testid="your-words"
      className="mb-3 flex items-center gap-3 rounded-[22px] bg-dark-400 px-3.5 py-3 active:scale-[0.99] transition-transform focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500">
      <span className={`h-11 w-1.5 shrink-0 rounded-full ${TONE[item.kind]}`} aria-hidden="true" />
      <span className="min-w-0 flex-1">
        <span className="block text-[11px] font-medium uppercase tracking-[0.1em] text-slt">{t.tag[item.kind](when)}</span>
        <span className="mt-0.5 block text-[15px] font-extrabold leading-snug text-ink [overflow-wrap:anywhere]">“{item.text}”</span>
        <span className="block text-[12.5px] text-slt">{t.line[item.kind]}</span>
      </span>
      <ChevronRight size={18} className="shrink-0 text-ink" aria-hidden="true" />
    </Link>
  );
}
