import { useState } from 'react';
import { Navigate, useNavigate, useParams } from 'react-router-dom';
import { X } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import MascotArt from '../components/visuals/MascotArt';
import { usePath, pathText } from '../components/path/pathData';

const POSE = { calm: 'breathe', focus: 'think', confidence: 'point', routine: 'notes', bounce: 'cheer', picture: 'think' };

// A 2-minute lesson: one idea per card, then "Got it" marks the Learn step.
export default function PathLessonPage() {
  const { chapterKey } = useParams();
  const { language } = useAuth();
  const navigate = useNavigate();
  const t = pathText(language);
  const { markStep } = usePath();
  const [card, setCard] = useState(0);
  const [saving, setSaving] = useState(false);
  const ch = t.chapters[chapterKey];
  if (!ch) return <Navigate to="/train" replace />;

  const cards = ch.lesson.cards;
  const last = card === cards.length - 1;

  async function finish() {
    setSaving(true);
    try { await markStep(chapterKey, 'learn'); } catch { /* the lesson still counts as read on screen */ }
    navigate(`/path/${chapterKey}`, { replace: true });
  }

  return (
    <div className="min-h-screen bg-tonepage-sun flex flex-col">
      <header className="max-w-lg mx-auto w-full flex items-center gap-3 px-4 pt-4">
        <button type="button" onClick={() => navigate(-1)} aria-label={t.back} className="flex h-11 w-11 items-center justify-center rounded-2xl bg-dark-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500">
          <X size={18} className="text-ink" />
        </button>
        <div className="flex-1 grid gap-1.5" style={{ gridTemplateColumns: `repeat(${cards.length}, minmax(0, 1fr))` }} aria-hidden="true">
          {cards.map((_, i) => <span key={i} className={`h-1.5 rounded-full ${i <= card ? 'bg-ink' : 'bg-ink/20'}`} />)}
        </div>
      </header>
      <main className="max-w-lg mx-auto w-full flex-1 flex flex-col px-5 pb-8">
        <p className="mt-5 text-[12px] font-bold uppercase tracking-[0.12em] text-slt">{ch.title} · {t.lessonMinutes}</p>
        <h1 className="mt-1 text-[26px] leading-tight font-extrabold text-ink">{ch.lesson.title}</h1>
        <section className="mt-4 rounded-[26px] bg-dark-400 p-5" aria-live="polite">
          <MascotArt pose={POSE[chapterKey] || 'idle'} className="h-[clamp(110px,18dvh,150px)]" />
          <p className="mt-3 text-[17px] leading-relaxed text-ink">{cards[card]}</p>
          <p className="mt-3 text-[12px] text-slt">{t.lessonCardOf(card + 1, cards.length)}</p>
        </section>
        {last && <p className="mt-4 rounded-[18px] bg-inkblock px-4 py-3 text-[15px] font-bold text-white">{ch.lesson.takeaway}</p>}
        <div className="flex-1" />
        <button
          type="button"
          disabled={saving}
          onClick={last ? finish : () => setCard(c => c + 1)}
          className="mt-6 min-h-[56px] rounded-[18px] bg-brand-500 text-[16px] font-extrabold text-white disabled:opacity-60 active:scale-[0.98] transition-transform focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2"
        >
          {last ? t.lessonDone : t.lessonNext}
        </button>
      </main>
    </div>
  );
}
