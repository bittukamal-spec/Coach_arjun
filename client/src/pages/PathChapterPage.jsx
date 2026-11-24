import { useState } from 'react';
import { Link, Navigate, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { Check, ArrowLeft, Lock } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import MascotArt from '../components/visuals/MascotArt';
import { usePath, pathText, STEP_ORDER, nextHref, takeNewlyFinished, chapterAt } from '../components/path/pathData';
import { markFromPath } from '../utils/practiceReturn';

// One chapter of the learning path. Each chapter has 3 levels (founder, Nov
// 2026: 1 Basics · 2 In the match · 3 Big pressure) of the same 4 steps
// (Learn · Practise · Play · Reflect), each a bit harder. Learn and Practise
// link to the lesson and the drill; Play is marked here; Reflect is
// recognised from the Mind Journal.
export default function PathChapterPage() {
  const { chapterKey } = useParams();
  const [params, setParams] = useSearchParams();
  const { language, user } = useAuth();
  const navigate = useNavigate();
  const t = pathText(language);
  const { path, error, reload, markStep } = usePath();
  const [saving, setSaving] = useState(false);
  if (!t.chapters[chapterKey]) return <Navigate to="/train" replace />;

  const chapter = path?.chapters.find(c => c.key === chapterKey);
  const index = path ? path.chapters.findIndex(c => c.key === chapterKey) : -1;
  if (chapter?.status === 'locked') return <Navigate to="/train" replace />;

  const levels = chapter?.levels || (chapter ? [{ level: 1, status: chapter.status, steps: chapter.steps, doneCount: chapter.doneCount }] : []);
  const asked = Number(params.get('level'));
  const askedLevel = levels.find(l => l.level === asked && l.status !== 'locked');
  // Show the level asked for, else the one the athlete is on.
  const shown = askedLevel || levels.find(l => l.level === (chapter?.level || 1)) || levels[0];
  const level = shown?.level || 1;
  const ch = chapterAt(t, chapterKey, level, user?.sport);

  async function markPlay(outcome) {
    setSaving(true);
    try {
      const next = await markStep(chapterKey, 'play', outcome, level);
      const fresh = takeNewlyFinished(next);
      if (fresh) navigate(`/path/unlocked/${fresh}`);
    } finally { setSaving(false); }
  }

  const stepTitle = {
    learn: `${ch.lesson.title} (${t.lessonMinutes})`,
    practise: ch.practise,
    play: ch.play,
    reflect: t.reflectStep,
  };
  const nextStep = shown && shown.status !== 'locked' ? STEP_ORDER.find(st => !shown.steps[st].done) : null;
  const showLevels = levels.length > 1 && chapter?.status === 'done';

  return (
    <div className="min-h-screen bg-dark-900 pb-10">
      <header className="max-w-lg mx-auto flex items-center px-4 pt-4">
        <button type="button" onClick={() => navigate(-1)} aria-label={t.back} className="flex h-11 w-11 items-center justify-center rounded-2xl bg-dark-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500">
          <ArrowLeft size={18} className="text-ink" />
        </button>
      </header>
      <main className="max-w-lg mx-auto px-5">
        <section className="flex items-end justify-between gap-3 mt-2">
          <div className="min-w-0">
            {index >= 0 && <p className="text-[12px] font-bold uppercase tracking-[0.12em] text-slt">{t.chapterLabel(index + 1)}{showLevels ? ` · ${t.levelOf(level)}` : ''}</p>}
            <h1 className="mt-1 text-[30px] leading-tight font-extrabold text-ink">{ch.title}</h1>
            <p className="mt-1 text-[15px] text-slt">{showLevels ? t.levelsLine : ch.line}</p>
          </div>
          <MascotArt pose="point" className="h-[clamp(110px,18dvh,150px)] shrink-0" />
        </section>

        {error && (
          <div className="mt-6 text-center">
            <p className="text-[14px] text-slt">{t.loadError}</p>
            <button type="button" onClick={reload} className="mt-2 min-h-[44px] px-4 rounded-2xl text-[14px] font-bold text-brand-500">{t.retry}</button>
          </div>
        )}

        {showLevels && (
          <section className="mt-5" aria-label={t.levelsTitle} data-testid="chapter-levels">
            <ol className="flex flex-col gap-2">
              {levels.map(l => {
                const selected = l.level === level;
                const locked = l.status === 'locked';
                const sub = l.status === 'done' ? t.levelDone : locked ? t.levelLocked(l.level - 1) : t.levelNow(l.doneCount);
                return (
                  <li key={l.level}>
                    <button
                      type="button"
                      disabled={locked}
                      aria-pressed={selected}
                      onClick={() => setParams(l.level > 1 ? { level: String(l.level) } : {}, { replace: true })}
                      className={`flex w-full items-center gap-3 rounded-[20px] p-3.5 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 ${selected ? 'bg-inkblock text-white' : 'bg-dark-400 text-ink'} ${locked ? 'opacity-70' : ''}`}
                    >
                      <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full font-extrabold ${l.status === 'done' ? 'bg-mint text-inkblock' : locked ? 'bg-dark-700 text-slt' : 'bg-sun text-inkblock'}`} aria-hidden="true">
                        {l.status === 'done' ? <Check size={16} strokeWidth={3} /> : locked ? <Lock size={15} /> : l.level}
                      </span>
                      <span className="min-w-0">
                        <span className="block text-[15px] font-extrabold">{t.levelLabel(l.level)} · {t.levelNames[l.level]}</span>
                        <span className={`block text-[12.5px] font-semibold ${selected && !locked && l.status !== 'done' ? 'text-sun' : selected ? 'text-white/75' : 'text-slt'}`}>{sub}</span>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ol>
            {chapter.mastered && <p className="mt-3 rounded-[18px] bg-mint px-4 py-3 text-[14px] font-bold text-inkblock">{t.levelMastered}</p>}
            <h2 className="mt-5 text-[16px] font-extrabold text-ink">{t.levelStepsTitle(level)}</h2>
          </section>
        )}

        {shown && (
          <ol className="mt-4 flex flex-col gap-2.5" data-testid="chapter-steps">
            {STEP_ORDER.map((st, i) => {
              const done = shown.steps[st].done;
              const isNext = st === nextStep;
              return (
                <li key={st} className={`rounded-[20px] p-4 ${isNext ? 'bg-inkblock text-white' : 'bg-dark-400 text-ink'} ${!done && !isNext ? 'opacity-70' : ''}`}>
                  <div className="flex items-start gap-3">
                    <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full font-extrabold ${done ? 'bg-mint text-inkblock' : isNext ? 'bg-sun text-inkblock' : 'bg-dark-700 text-slt'}`} aria-hidden="true">
                      {done ? <Check size={18} strokeWidth={3} /> : i + 1}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className={`text-[12px] font-bold ${isNext ? 'text-sun' : 'text-slt'}`}>{i + 1} · {t.steps[st]}{done ? ` · ${t.done}` : ''}</p>
                      <p className="mt-0.5 text-[15px] font-bold leading-snug">{stepTitle[st]}</p>
                    </div>
                  </div>
                  {isNext && st === 'learn' && (
                    <Link to={nextHref(chapterKey, 'learn', t, level)} onClick={markFromPath} className="mt-3 flex min-h-[48px] items-center justify-center rounded-[14px] bg-sun text-[15px] font-extrabold text-inkblock">{t.learnNow}</Link>
                  )}
                  {isNext && st === 'practise' && (
                    <Link to={nextHref(chapterKey, 'practise', t, level)} onClick={markFromPath} className="mt-3 flex min-h-[48px] items-center justify-center rounded-[14px] bg-sun text-[15px] font-extrabold text-inkblock">{t.practiseNow}</Link>
                  )}
                  {isNext && st === 'play' && (
                    <div className="mt-3" role="group" aria-label={t.playQuestion}>
                      <p className="text-[13px] text-white/80">{t.playQuestion}</p>
                      <div className="mt-2 grid grid-cols-2 gap-2">
                        <button type="button" disabled={saving} onClick={() => markPlay('helped')} className="min-h-[48px] rounded-[14px] bg-sun text-[14px] font-extrabold text-inkblock disabled:opacity-60">{t.playHelped}</button>
                        <button type="button" disabled={saving} onClick={() => markPlay('tried')} className="min-h-[48px] rounded-[14px] bg-white/15 text-[14px] font-bold text-white disabled:opacity-60">{t.playTried}</button>
                      </div>
                      <Link to="/coaching" className="mt-2 flex min-h-[44px] items-center justify-center text-[14px] font-semibold text-white/85">{t.talkToArjun}</Link>
                    </div>
                  )}
                  {isNext && st === 'reflect' && (
                    <Link to={nextHref(chapterKey, 'reflect', t, level)} onClick={markFromPath} className="mt-3 flex min-h-[48px] items-center justify-center rounded-[14px] bg-sun text-[15px] font-extrabold text-inkblock">{t.writeReflection}</Link>
                  )}
                </li>
              );
            })}
          </ol>
        )}
      </main>
    </div>
  );
}
