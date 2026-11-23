import { useState } from 'react';
import { CalendarDays } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { apiFetch } from '../../api';
import HelplineList from '../HelplineList';
import MatchDaySheet from '../match/MatchDaySheet';
import { pathText, planText, planUnit } from './pathData';

const MOMENTS = {
  reset: ['before_start', 'after_mistake', 'big_moment'],
  rep: ['after_miss', 'before_each', 'tight'],
  ritual: ['next_training', 'next_match'],
};

// "Take it into play" (Hook fix 3 — investment): at the end of a practice the
// athlete picks WHEN they will use it, which becomes an if–then plan
// ("After a miss → say 'Next ball'"). It comes back before the match and in
// "How did it go?". One tap; "Not now" hides it. Nothing saves on its own.
export default function PlayPlanCard({ tool, cue = null, variant = 'dark' }) {
  const { language, token, user } = useAuth();
  const t = pathText(language);
  const p = t.plan;
  const moments = MOMENTS[tool] || [];
  const [moment, setMoment] = useState(moments[0] || null);
  const [state, setState] = useState('pick'); // pick | saving | saved | hidden | safety
  const [error, setError] = useState(false);
  const [guidance, setGuidance] = useState(null);
  const [hasMatch, setHasMatch] = useState(true);
  const [sheet, setSheet] = useState(false);
  const needsCue = tool === 'rep' || tool === 'ritual';
  if (!moments.length || state === 'hidden' || (needsCue && !String(cue || '').trim())) return null;

  const dark = variant === 'dark';
  const unit = planUnit(user?.sport, t);
  const plan = { tool, moment, cue };
  const auth = { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` };

  async function save() {
    setState('saving'); setError(false);
    try {
      const res = await apiFetch('/api/path/plan', { method: 'PUT', headers: auth, body: JSON.stringify({ tool, moment, ...(needsCue ? { cue } : {}) }) });
      if (!res.ok) throw new Error(String(res.status));
      const data = await res.json();
      if (data?.safetyFlag) { setGuidance(data.guidance || null); setState('safety'); return; }
      setHasMatch(!!data?.match?.nextDay || moment === 'next_training');
      setState('saved');
    } catch { setError(true); setState('pick'); }
  }

  async function saveMatchDay(day, type = null) {
    const res = await apiFetch('/api/path/match', { method: 'PUT', headers: auth, body: JSON.stringify({ day, type: day ? type : null }) });
    if (!res.ok) throw new Error(String(res.status));
    setHasMatch(!!day); setSheet(false);
  }

  const box = dark ? 'bg-white/10 text-white' : 'bg-dark-400 text-ink';
  const muted = dark ? 'text-white/80' : 'text-slt';
  const tag = dark ? 'text-sun' : 'text-brand-500';

  if (state === 'safety') {
    return (
      <div className={`w-full rounded-[24px] p-4 text-left ${box}`} role="alert">
        {guidance && <p className="mb-3 text-[14px] leading-relaxed">{guidance}</p>}
        <HelplineList />
      </div>
    );
  }

  if (state === 'saved') {
    return (
      <div className={`w-full rounded-[24px] p-4 text-left ${box}`} data-testid="play-plan" aria-live="polite">
        <p className={`text-[11px] font-extrabold uppercase tracking-[0.1em] ${tag}`}>{p.playPlan}</p>
        <p className="mt-1 text-[15px] font-extrabold leading-snug">{planText(plan, user?.sport, t)}</p>
        <p className={`mt-2 text-[13px] ${muted}`}>✓ {p.saved}</p>
        {!hasMatch && (
          <button type="button" onClick={() => setSheet(true)} className={`mt-3 inline-flex min-h-[44px] items-center gap-2 rounded-full px-3.5 text-[13px] font-bold ${dark ? 'bg-white/15 text-white' : 'bg-dark-700 text-ink'} focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sun`}>
            <CalendarDays size={16} aria-hidden="true" /> {p.addMatch}
          </button>
        )}
        <MatchDaySheet open={sheet} onClose={() => setSheet(false)} onSave={saveMatchDay} />
      </div>
    );
  }

  return (
    <div className={`w-full rounded-[24px] p-4 text-left ${box}`} data-testid="play-plan">
      <p className={`text-[11px] font-extrabold uppercase tracking-[0.1em] ${tag}`}>{p.tag}</p>
      <p id={`plan-q-${tool}`} className="mt-1 mb-3 text-[18px] font-extrabold leading-snug">{p.question[tool]}</p>
      <div className={`grid gap-2 ${moments.length === 2 ? 'grid-cols-2' : 'grid-cols-3'}`} role="radiogroup" aria-labelledby={`plan-q-${tool}`}>
        {moments.map(k => (
          <button key={k} type="button" role="radio" aria-checked={moment === k} onClick={() => setMoment(k)}
            className={`min-h-[48px] rounded-[14px] px-1.5 text-[13px] font-bold leading-tight focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 ${moment === k ? 'bg-sun text-inkblock' : dark ? 'bg-white/10 text-white' : 'bg-dark-700 text-ink'}`}>
            {p.moments[tool][k](unit)}
          </button>
        ))}
      </div>
      <p className={`mt-3 text-[13.5px] leading-relaxed ${muted}`}>{p.yourPlan} <b className={dark ? 'text-white' : 'text-ink'}>{planText(plan, user?.sport, t)}</b></p>
      {error && <p className="mt-2 text-[13px] text-red-400" role="alert">{p.error}</p>}
      <div className="mt-3 grid grid-cols-[1fr_auto] items-center gap-2">
        <button type="button" onClick={save} disabled={state === 'saving'} data-testid="plan-save"
          className={`min-h-[50px] rounded-[16px] text-[15px] font-extrabold disabled:opacity-60 ${dark ? 'bg-white text-inkblock' : 'bg-brand-500 text-white'} focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500`}>
          {state === 'saving' ? p.saving : p.save}
        </button>
        <button type="button" onClick={() => setState('hidden')} className={`min-h-[50px] px-3 text-[13px] font-semibold ${muted} focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500`}>{p.notNow}</button>
      </div>
    </div>
  );
}
