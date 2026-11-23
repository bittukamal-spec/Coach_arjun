import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronRight } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { apiFetch } from '../../api';
import Teer from '../visuals/Teer';
import { pathText, weekdayOf, planText } from '../path/pathData';

// "Match tomorrow / Match day" on Home (Hook fix 2 — trigger + variable
// reward). The prep is built from the athlete's own things: a Pressure
// Reset, their own Focus Card words, and their chapter's skill.
export default function MatchPrepCard({ path, phase }) {
  const { language, token, user } = useAuth();
  const t = pathText(language);
  const m = t.match;
  const [word, setWord] = useState(null);

  useEffect(() => {
    let live = true;
    apiFetch('/api/self-talk/cards', { headers: { Authorization: `Bearer ${token}` } })
      .then(r => (r.ok ? r.json() : []))
      .then(cards => { if (live && Array.isArray(cards)) setWord(cards.find(c => c?.focusWord)?.focusWord || null); })
      .catch(() => {});
    return () => { live = false; };
  }, [token]);

  const when = phase === 'today' ? m.today : m.tomorrow;
  const chapterKey = path && !path.finished ? path.currentKey : null;
  const items = [
    { key: 'reset', to: '/body-reset', dot: 'bg-mint', label: m.prepReset },
    word && { key: 'card', to: '/focus-deck', dot: 'bg-coral', label: m.prepCard(word) },
    !path.plan && chapterKey && m.skill[chapterKey] && { key: 'plan', to: `/path/${chapterKey}`, dot: 'bg-sky', label: m.prepPlan(m.skill[chapterKey]) },
  ].filter(Boolean);

  return (
    <section className="mb-3 rounded-[28px] bg-inkblock p-[18px] text-white" data-testid="match-prep" aria-labelledby="match-prep-title">
      <div className="flex items-start justify-between gap-2">
        <span className="min-w-0">
          <span className="block text-[11px] font-extrabold uppercase tracking-[0.1em] text-sun">{m.prepTag(when, weekdayOf(path.match.nextDay, 'short'), m.types[path.match?.type])}</span>
          <span id="match-prep-title" className="mt-1 block text-[22px] font-extrabold leading-tight">{phase === 'today' ? m.prepTitleToday : m.prepTitleTomorrow}</span>
        </span>
        <Teer pose="wave" height={72} className="-mt-2 shrink-0" />
      </div>
      {planText(path.plan, user?.sport, t) && (
        <div className="mt-3 rounded-[18px] bg-sun px-3.5 py-3 text-inkblock" data-testid="prep-plan">
          <p className="text-[11px] font-extrabold uppercase tracking-[0.08em]">{t.plan.playPlan}</p>
          <p className="mt-1 text-[15px] font-extrabold leading-snug">{planText(path.plan, user?.sport, t)}</p>
        </div>
      )}
      <p className="mt-2 text-[13px] text-white/75">{m.prepLine}</p>
      <ul className="mt-2.5 flex flex-col gap-2">
        {items.map(it => (
          <li key={it.key}>
            <Link to={it.to} className="flex min-h-[52px] items-center gap-2.5 rounded-[16px] bg-white/10 px-3 text-[14px] font-bold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sun">
              <span className={`h-8 w-8 shrink-0 rounded-full ${it.dot}`} aria-hidden="true" />
              <span className="min-w-0 flex-1">{it.label}</span>
              <ChevronRight size={18} aria-hidden="true" />
            </Link>
          </li>
        ))}
      </ul>
      <Link to="/coaching" state={{ prefillMsg: m.prepTalkMsg(when), autoSend: true }}
        className="mt-3 flex min-h-[52px] items-center justify-center rounded-[16px] bg-sun text-[15px] font-extrabold text-inkblock focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white">
        {m.prepTalk}
      </Link>
    </section>
  );
}
