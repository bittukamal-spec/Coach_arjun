import { Link } from 'react-router-dom';
import { Check, Lock, ChevronRight } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import Teer from '../visuals/Teer';
import { usePath, pathText, CHAPTER_LOOK, STEP_ORDER, nextHref, nextLabel } from './pathData';

// "Your path" on the Profile page: the chapters as a short road, the current
// chapter with its 4 steps, and one Next button (docs/PATH-STRATEGY.md).
export default function PathSection() {
  const { language } = useAuth();
  const t = pathText(language);
  const { path, error, reload } = usePath();

  if (error) {
    return (
      <section className="rounded-[26px] bg-dark-400 p-4 text-center" aria-label={t.title}>
        <p className="text-[14px] text-slt">{t.loadError}</p>
        <button type="button" onClick={reload} className="mt-2 min-h-[44px] px-4 rounded-2xl text-[14px] font-bold text-brand-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500">{t.retry}</button>
      </section>
    );
  }
  if (!path) return <div className="h-[220px] rounded-[26px] bg-dark-400 animate-pulse" aria-hidden="true" />;

  const total = path.chapters.length;
  const currentIndex = path.chapters.findIndex(c => c.key === path.currentKey);

  return (
    <section aria-labelledby="path-title" data-testid="profile-path">
      <div className="flex items-baseline justify-between">
        <h2 id="path-title" className="text-[20px] font-extrabold text-ink">{t.title}</h2>
        {!path.finished && <span className="text-[13px] text-slt">{t.chapterOf(currentIndex + 1, total)}</span>}
      </div>
      <p className="mt-1 text-[14px] text-slt">{t.startsWith}</p>

      <ol className="mt-3 rounded-[26px] bg-dark-400 p-3 flex flex-col gap-1">
        {path.chapters.map((c, i) => {
          const ch = t.chapters[c.key];
          const { Icon, block } = CHAPTER_LOOK[c.key] || CHAPTER_LOOK.calm;
          if (c.status === 'current') {
            const stepIndex = STEP_ORDER.indexOf(path.next.stepKey);
            return (
              <li key={c.key}>
                <Link
                  to={`/path/${c.key}`}
                  data-testid="path-current"
                  className="flex items-center gap-3 rounded-[20px] border-2 border-sun bg-sun/15 p-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
                >
                  <span className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-full ${block} text-inkblock shadow-[0_4px_0_rgba(16,21,51,0.18)]`} aria-hidden="true"><Icon size={22} /></span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-[11px] font-extrabold uppercase tracking-[0.08em] text-slt">{t.youAreHere} · {t.stepOf(stepIndex + 1)}</span>
                    <span className="block text-[17px] font-extrabold text-ink">{ch.title}</span>
                    <span className="mt-1.5 grid grid-cols-4 gap-1" aria-hidden="true">
                      {STEP_ORDER.map(st => <span key={st} className={`h-1.5 rounded-full ${c.steps[st].done ? 'bg-brand-500' : 'bg-dark-600'}`} />)}
                    </span>
                  </span>
                  <Teer pose="point" height={64} className="shrink-0" />
                </Link>
              </li>
            );
          }
          const done = c.status === 'done';
          return (
            <li key={c.key} className={`flex items-center gap-3 px-1 py-1.5 ${done ? '' : 'opacity-60'}`}>
              <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${done ? block : 'bg-dark-700'} text-inkblock`} aria-hidden="true">
                {done ? <Check size={18} strokeWidth={3} /> : <Lock size={15} className="text-slt" />}
              </span>
              <span className="flex-1 text-[15px] font-bold text-ink">
                <span className="sr-only">{t.chapterLabel(i + 1)}: </span>{ch.title}
              </span>
              {done && c.steps.play.outcome && (
                <span className="text-[12px] font-bold text-slt">{c.steps.play.outcome === 'helped' ? t.helpedNote : t.triedNote}</span>
              )}
              {!done && <span className="sr-only">{t.locked}</span>}
            </li>
          );
        })}
      </ol>

      {path.finished ? (
        <div className="mt-3 rounded-[20px] bg-mint p-4 text-inkblock">
          <p className="text-[16px] font-extrabold">{t.finishedTitle}</p>
          <p className="mt-1 text-[14px]">{t.finishedLine}</p>
        </div>
      ) : (
        <Link
          to={nextHref(path.next.chapterKey, path.next.stepKey, t)}
          data-testid="path-next"
          className="mt-3 flex min-h-[56px] items-center justify-center gap-2 rounded-[18px] bg-sun px-4 text-center text-[15px] font-extrabold text-inkblock active:scale-[0.98] transition-transform focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2"
        >
          {nextLabel(path.next.chapterKey, path.next.stepKey, t)}
          <ChevronRight size={18} strokeWidth={2.6} aria-hidden="true" />
        </Link>
      )}
    </section>
  );
}
