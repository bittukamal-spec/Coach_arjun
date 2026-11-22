import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import Teer from '../visuals/Teer';
import { pathText, weekdayOf } from '../path/pathData';

// "How did Saturday go?" (Hook fix 2 — reward + investment). Two taps, no
// typing. "It helped / I tried it" ticks the chapter's Play step on the
// server; then the athlete can tell Arjun more or set the next match.
export default function MatchReviewCard({ path, reviewMatch, onNextMatch }) {
  const { language } = useAuth();
  const t = pathText(language);
  const m = t.match;
  const [feel, setFeel] = useState(null);
  const [done, setDone] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);

  const weekday = weekdayOf(path.match.nextDay);
  const chapterKey = path.finished ? null : path.currentKey;
  const skill = (chapterKey && m.skill[chapterKey]) || null;

  async function submit(f, used) {
    setBusy(true); setError(false);
    try {
      await reviewMatch(f, used);
      setDone({ feel: f, used, chapterKey });
    } catch { setError(true); } finally { setBusy(false); }
  }

  const chip = (on) => `min-h-[48px] rounded-[14px] text-[13.5px] font-bold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 ${on ? 'bg-brand-500 text-white' : 'bg-dark-700 text-ink'}`;

  if (done) {
    const ticked = done.chapterKey && (done.used === 'helped' || done.used === 'tried');
    return (
      <section className="mb-3 rounded-[28px] border-2 border-sun bg-dark-400 p-[18px]" data-testid="match-review" aria-live="polite">
        <p className="rounded-[16px] bg-mint/30 px-3 py-2.5 text-[14px] font-semibold text-ink">
          {ticked ? m.reviewDone(t.chapters[done.chapterKey].title) : m.reviewThanks}
        </p>
        <div className="mt-3 grid grid-cols-2 gap-2">
          {done.feel ? (
            <Link to="/coaching" state={{ prefillMsg: m.tellMoreMsg(weekday, m.feelText[done.feel]), autoSend: true }}
              className="flex min-h-[50px] items-center justify-center rounded-[16px] bg-sun text-[14px] font-extrabold text-inkblock focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500">{m.tellMore}</Link>
          ) : <span />}
          <button type="button" onClick={onNextMatch} className="min-h-[50px] rounded-[16px] bg-dark-700 text-[14px] font-extrabold text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500">{m.nextMatch}</button>
        </div>
      </section>
    );
  }

  return (
    <section className="mb-3 rounded-[28px] border-2 border-sun bg-dark-400 p-[18px]" data-testid="match-review" aria-labelledby="match-review-title">
      <div className="flex items-center gap-3">
        <Teer pose="think" height={60} className="shrink-0" />
        <span className="min-w-0">
          <span className="block text-[11px] font-medium uppercase tracking-[0.1em] text-slt">{m.reviewTag}</span>
          <span id="match-review-title" className="block text-[20px] font-extrabold leading-tight text-ink">{m.reviewTitle(weekday)}</span>
        </span>
      </div>
      <div className="mt-3 grid grid-cols-3 gap-2" role="radiogroup" aria-labelledby="match-review-title">
        {Object.entries(m.feel).map(([k, label]) => (
          <button key={k} type="button" role="radio" aria-checked={feel === k} disabled={busy} onClick={() => (skill ? setFeel(k) : submit(k, null))} className={chip(feel === k)}>{label}</button>
        ))}
      </div>
      {feel && skill && (
        <>
          <p id="match-used-q" className="mt-4 mb-2 text-[15px] font-extrabold text-ink">{m.usedQ(skill)}</p>
          <div className="grid grid-cols-3 gap-2" role="group" aria-labelledby="match-used-q">
            {Object.entries(m.used).map(([k, label]) => (
              <button key={k} type="button" disabled={busy} onClick={() => submit(feel, k)} className={chip(false)}>{label}</button>
            ))}
          </div>
        </>
      )}
      {error && <p className="mt-3 text-[13px] text-red-400" role="alert">{m.reviewError}</p>}
      <button type="button" disabled={busy} onClick={() => submit(null, null)} className="mt-2 min-h-[44px] w-full text-[13px] font-semibold text-slt focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500">{m.skip}</button>
    </section>
  );
}
