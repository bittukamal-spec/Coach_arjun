import { useState } from 'react';
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom';
import { Check, ArrowLeft } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import MascotArt from '../components/visuals/MascotArt';
import { usePath, pathText, STEP_ORDER, nextHref, takeNewlyFinished } from '../components/path/pathData';
import { markFromPath } from '../utils/practiceReturn';

// One chapter of the learning path: its 4 steps (Learn · Practise · Play ·
// Reflect). Learn and Practise link to the lesson and the drill; Play is
// marked here; Reflect is recognised from the Mind Journal.
export default function PathChapterPage() {
  const { chapterKey } = useParams();
  const { language } = useAuth();
  const navigate = useNavigate();
  const t = pathText(language);
  const { path, error, reload, markStep } = usePath();
  const [saving, setSaving] = useState(false);
  const ch = t.chapters[chapterKey];
  if (!ch) return <Navigate to="/train" replace />;

  const chapter = path?.chapters.find(c => c.key === chapterKey);
  const index = path ? path.chapters.findIndex(c => c.key === chapterKey) : -1;
  if (chapter?.status === 'locked') return <Navigate to="/train" replace />;

  async function markPlay(outcome) {
    setSaving(true);
    try {
      const next = await markStep(chapterKey, 'play', outcome);
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
  const nextStep = chapter ? STEP_ORDER.find(st => !chapter.steps[st].done) : null;

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
            {index >= 0 && <p className="text-[12px] font-bold uppercase tracking-[0.12em] text-slt">{t.chapterLabel(index + 1)}</p>}
            <h1 className="mt-1 text-[30px] leading-tight font-extrabold text-ink">{ch.title}</h1>
            <p className="mt-1 text-[15px] text-slt">{ch.line}</p>
          </div>
          <MascotArt pose="point" className="h-[clamp(110px,18dvh,150px)] shrink-0" />
        </section>

        {error && (
          <div className="mt-6 text-center">
            <p className="text-[14px] text-slt">{t.loadError}</p>
            <button type="button" onClick={reload} className="mt-2 min-h-[44px] px-4 rounded-2xl text-[14px] font-bold text-brand-500">{t.retry}</button>
          </div>
        )}

        {chapter && (
          <ol className="mt-6 flex flex-col gap-2.5" data-testid="chapter-steps">
            {STEP_ORDER.map((st, i) => {
              const done = chapter.steps[st].done;
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
                    <Link to={nextHref(chapterKey, 'learn', t)} onClick={markFromPath} className="mt-3 flex min-h-[48px] items-center justify-center rounded-[14px] bg-sun text-[15px] font-extrabold text-inkblock">{t.learnNow}</Link>
                  )}
                  {isNext && st === 'practise' && (
                    <Link to={nextHref(chapterKey, 'practise', t)} onClick={markFromPath} className="mt-3 flex min-h-[48px] items-center justify-center rounded-[14px] bg-sun text-[15px] font-extrabold text-inkblock">{t.practiseNow}</Link>
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
                    <Link to={nextHref(chapterKey, 'reflect', t)} onClick={markFromPath} className="mt-3 flex min-h-[48px] items-center justify-center rounded-[14px] bg-sun text-[15px] font-extrabold text-inkblock">{t.writeReflection}</Link>
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
