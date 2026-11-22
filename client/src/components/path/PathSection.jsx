import { useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Check, Lock, ChevronRight } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import Teer from '../visuals/Teer';
import { usePath, pathText, CHAPTER_LOOK, STEP_ORDER, nextHref, nextLabel, takeNewlyFinished, planText } from './pathData';
import { SKILLS, SKILL_BAR, challengeText, daysUntil, useMindChallenge } from './mindChallengeData';
import { markFromPath } from '../../utils/practiceReturn';

// "Your path" on the Train tab: the chapters as a winding road, the current
// chapter with its 4 steps, and one Next button (docs/PATH-STRATEGY.md).
// Steps opened from here return to Train when they end (utils/practiceReturn).
export default function PathSection() {
  const { language, user } = useAuth();
  const t = pathText(language);
  const { path, error, reload } = usePath();
  const c = challengeText(language);
  const { state: mc } = useMindChallenge();
  const navigate = useNavigate();
  // The Mind Challenge card above shows when one can be played; the stats
  // mini card shows the rest of the time.
  const showStats = !!(mc?.latest && !mc.canTake);
  useEffect(() => {
    const fresh = takeNewlyFinished(path);
    if (fresh) navigate(`/path/unlocked/${fresh}`);
  }, [path, navigate]);

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
    <section aria-labelledby="path-title" data-testid="train-path">
      {showStats && <MindStatsMini mc={mc} c={c} />}
      <div className="flex items-baseline justify-between">
        <h2 id="path-title" className="text-[20px] font-extrabold text-ink">{t.title}</h2>
        {!path.finished && <span className="text-[13px] text-slt">{t.chapterOf(currentIndex + 1, total)}</span>}
      </div>
      <p className="mt-1 text-[14px] text-slt">{t.startsWith}</p>

      {path.finished ? (
        <div className="mt-3 rounded-[20px] bg-mint p-4 text-inkblock">
          <p className="text-[16px] font-extrabold">{t.finishedTitle}</p>
          <p className="mt-1 text-[14px]">{t.finishedLine}</p>
        </div>
      ) : (
        <div className="mt-3 rounded-[24px] bg-dark-400 p-4">
          {(() => {
            const cur = path.chapters.find(c => c.key === path.currentKey);
            const stepIndex = STEP_ORDER.indexOf(path.next.stepKey);
            return (
              <>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[14px] font-extrabold text-ink">{t.chapters[cur.key].title} · {t.stepOf(stepIndex + 1).toLowerCase()}</span>
                  <span className="text-[12px] text-slt">{STEP_ORDER.map(st => `${t.steps[st]}${cur.steps[st].done ? ' ✓' : ''}`).join(' · ')}</span>
                </div>
                <div className="mt-2 h-2 rounded-full bg-dark-600" aria-hidden="true">
                  <div className="h-2 rounded-full bg-brand-500" style={{ width: `${(STEP_ORDER.filter(st => cur.steps[st].done).length / 4) * 100}%` }} />
                </div>
              </>
            );
          })()}
        <Link
          to={nextHref(path.next.chapterKey, path.next.stepKey, t)}
          onClick={markFromPath}
          data-testid="path-next"
          className="mt-3 flex min-h-[56px] items-center justify-center gap-2 rounded-[18px] bg-sun px-4 text-center text-[15px] font-extrabold text-inkblock active:scale-[0.98] transition-transform focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2"
        >
          {nextLabel(path.next.chapterKey, path.next.stepKey, t)}
          <ChevronRight size={18} strokeWidth={2.6} aria-hidden="true" />
        </Link>
        </div>
      )}

      {planText(path.plan, user?.sport, t) && (
        <div className="mt-3 rounded-[20px] bg-sun px-4 py-3 text-inkblock" data-testid="train-plan">
          <p className="text-[11px] font-extrabold uppercase tracking-[0.08em]">{t.plan.playPlan}</p>
          <p className="mt-1 text-[15px] font-extrabold leading-snug">{planText(path.plan, user?.sport, t)}</p>
        </div>
      )}

      <PathRoad path={path} t={t} />
    </section>
  );
}

// The path as a winding road (founder mock-up, Nov 2026): one node per
// chapter, zig-zagging down; solid blue up to the current chapter, dotted
// after it. Done and current chapters link to their chapter page.
const ROAD_X = [50, 76, 28, 70, 30, 58];
const ROAD_GAP = 128;

function PathRoad({ path, t }) {
  const n = path.chapters.length;
  const height = 80 + (n - 1) * ROAD_GAP + 70;
  const pts = path.chapters.map((_, i) => ({ x: ROAD_X[i % ROAD_X.length], y: 80 + i * ROAD_GAP }));
  const seg = (a, b) => `C ${a.x} ${a.y + ROAD_GAP / 2}, ${b.x} ${b.y - ROAD_GAP / 2}, ${b.x} ${b.y}`;
  const curIdx = Math.max(0, path.chapters.findIndex(c => c.key === path.currentKey));
  const doneEnd = path.finished ? n - 1 : curIdx;
  const solid = pts.slice(0, doneEnd + 1).reduce((d, p, i) => (i === 0 ? `M ${p.x} ${p.y}` : `${d} ${seg(pts[i - 1], p)}`), '');
  const dotted = pts.slice(doneEnd).reduce((d, p, i, arr) => (i === 0 ? `M ${p.x} ${p.y}` : `${d} ${seg(arr[i - 1], p)}`), '');
  return (
    <div className="relative mt-3" style={{ height }} data-testid="path-road">
      <svg className="absolute inset-0 h-full w-full" viewBox={`0 0 100 ${height}`} preserveAspectRatio="none" aria-hidden="true">
        {doneEnd < n - 1 && <path d={dotted} fill="none" className="stroke-dark-600" strokeWidth="9" strokeLinecap="round" strokeDasharray="1 16" vectorEffect="non-scaling-stroke" />}
        {doneEnd > 0 && <path d={solid} fill="none" className="stroke-brand-500" strokeWidth="9" strokeLinecap="round" vectorEffect="non-scaling-stroke" />}
      </svg>
      <ol>
        {path.chapters.map((c, i) => {
          const ch = t.chapters[c.key];
          const { Icon, block } = CHAPTER_LOOK[c.key] || CHAPTER_LOOK.calm;
          const p = pts[i];
          const current = c.status === 'current';
          const done = c.status === 'done';
          const size = current ? 84 : 64;
          const node = (
            <span className="flex flex-col items-center gap-1.5">
              <span
                className={`flex items-center justify-center rounded-full ${current ? 'bg-sun ring-8 ring-sun/30 shadow-[0_6px_0_rgba(16,21,51,0.25)]' : done ? `${block} shadow-[0_5px_0_rgba(16,21,51,0.2)]` : 'bg-dark-700 shadow-[0_5px_0_rgba(16,21,51,0.1)]'} text-inkblock`}
                style={{ width: size, height: size }}
                aria-hidden="true"
              >
                {done ? <Check size={26} strokeWidth={3} /> : current ? <Icon size={34} /> : <Lock size={18} className="text-slt" />}
              </span>
              <span className={`whitespace-nowrap rounded-full bg-dark-900/90 px-2 text-[13px] font-bold ${current ? 'text-ink text-[15px] font-extrabold' : done ? 'text-ink' : 'text-slt'}`}>{ch.title}</span>
            </span>
          );
          const teerRight = p.x < 55;
          return (
            <li key={c.key} className="absolute -translate-x-1/2" style={{ left: `${p.x}%`, top: p.y - size / 2 }}>
              <span className="sr-only">{t.chapterLabel(i + 1)}: {ch.title}, {done ? t.done : current ? t.youAreHere : t.locked}</span>
              {done || current ? (
                <Link to={`/path/${c.key}`} data-testid={current ? 'path-current' : undefined} aria-label={`${ch.title}${current ? ` — ${t.youAreHere}` : ''}`} className="block rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500">{node}</Link>
              ) : node}
              {current && (
                <span className={`pointer-events-none absolute top-[-4px] flex flex-col items-center ${teerRight ? 'left-[104px]' : 'right-[104px]'}`} aria-hidden="true">
                  <span className="mb-1 whitespace-nowrap rounded-full bg-inkblock px-2.5 py-1 text-[11px] font-bold text-white">{t.youAreHere}</span>
                  <Teer pose="point" height={88} className={teerRight ? '' : '-scale-x-100'} />
                </span>
              )}
              {done && c.steps.play.outcome && (
                <span className="absolute left-1/2 top-[-8px] -translate-x-1/2 whitespace-nowrap rounded-full bg-dark-400 px-2 py-0.5 text-[10px] font-bold text-slt shadow-sm" aria-hidden="true">
                  {c.steps.play.outcome === 'helped' ? t.helpedNote : t.triedNote}
                </span>
              )}
            </li>
          );
        })}
      </ol>
    </div>
  );
}

// Mind Stats mini card (Train + Profile): the athlete's Mind Level, or an
// invitation to unlock it with the first Mind Challenge.
export function MindStatsMini({ mc, c, className = 'mb-5' }) {
  if (!mc) return null;
  return (
        <Link to="/mind-challenge" data-testid="profile-mind-stats" className={`${className} flex items-center gap-3 rounded-[22px] bg-inkblock px-4 py-3.5 text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500`}>
          {mc.latest ? (
            <>
              <span className="min-w-0 flex-1">
                <span className="block text-[11px] font-bold uppercase tracking-[0.12em] text-sun">Mind Stats</span>
                <span className="block text-[18px] font-extrabold">{c.card.mindLevel} {mc.latest.mindLevel}</span>
                <span className="mt-1.5 grid h-[30px] grid-cols-6 items-end gap-1.5" aria-hidden="true">
                  {SKILLS.map(s => <span key={s} className={`rounded-[4px] ${SKILL_BAR[s]}`} style={{ height: `${mc.latest.levels[s] * 20}%` }} />)}
                </span>
              </span>
              <span className="text-right text-[13px] font-bold">{c.card.nextIn(daysUntil(mc.nextAt))}</span>
            </>
          ) : (
            <>
              <span className="min-w-0 flex-1">
                <span className="block text-[11px] font-bold uppercase tracking-[0.12em] text-sun">{c.name}</span>
                <span className="block text-[17px] font-extrabold leading-snug">{c.profileUnlock}</span>
                <span className="block text-[13px] text-white/75">{c.profileUnlockLine}</span>
              </span>
              <Teer pose="point" height={76} className="shrink-0" />
            </>
          )}
        </Link>
  );
}

// Profile: the Mind Stats card and one row that opens the path on Train.
export function ProfilePathLink() {
  const { language } = useAuth();
  const t = pathText(language);
  const c = challengeText(language);
  const { state: mc } = useMindChallenge();
  const { path } = usePath();
  const idx = path ? path.chapters.findIndex(ch => ch.key === path.currentKey) : -1;
  return (
    <section data-testid="profile-path">
      <MindStatsMini mc={mc} c={c} className="mb-3" />
      <Link to="/train" data-testid="profile-path-link" className="flex min-h-[60px] items-center gap-3 rounded-[22px] bg-dark-400 px-4 py-3 text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500">
        <span className="min-w-0 flex-1">
          <span className="block text-[15px] font-extrabold">{t.title}</span>
          {path && (
            <span className="block text-[12.5px] text-slt">
              {path.finished ? t.finishedTitle : `${t.chapters[path.currentKey]?.title} · ${t.chapterOf(idx + 1, path.chapters.length)}`}
            </span>
          )}
        </span>
        <ChevronRight size={18} strokeWidth={2.4} aria-hidden="true" />
      </Link>
    </section>
  );
}
