import { Link, Navigate, useParams } from 'react-router-dom';
import { Check } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useStatusBarColour } from '../components/ui/TonePage';
import Teer from '../components/visuals/Teer';
import { usePath, pathText, CHAPTER_LOOK } from '../components/path/pathData';

// "Chapter unlocked!" (Hook Model variable reward): shown once when a
// chapter's last step is done; reveals which chapter opens next.
const CONFETTI = [
  ['left-[13%] top-[11%]', 'bg-sun', 'rotate-[20deg]'],
  ['left-[80%] top-[9%]', 'bg-mint', '-rotate-[30deg]'],
  ['left-[72%] top-[21%]', 'bg-blush', 'rotate-[50deg]'],
  ['left-[20%] top-[24%]', 'bg-[#9DB4FF]', '-rotate-[10deg]'],
];

export default function PathUnlockedPage() {
  const { chapterKey } = useParams();
  const { language } = useAuth();
  const t = pathText(language);
  const { path } = usePath();
  useStatusBarColour({ colour: '#101533' });
  const ch = t.chapters[chapterKey];
  if (!ch) return <Navigate to="/train" replace />;

  const index = path ? path.chapters.findIndex(c => c.key === chapterKey) : -1;
  const next = path && !path.finished ? path.chapters.find(c => c.key === path.currentKey) : null;
  const nextIndex = next ? path.chapters.indexOf(next) : -1;
  const look = CHAPTER_LOOK[chapterKey] || CHAPTER_LOOK.calm;
  const nextLook = next ? (CHAPTER_LOOK[next.key] || CHAPTER_LOOK.calm) : null;

  return (
    <div className="relative min-h-screen overflow-hidden bg-inkblock text-white">
      {CONFETTI.map(([pos, colour, rot]) => <span key={pos} aria-hidden="true" className={`absolute h-[7px] w-3 rounded-[2px] ${pos} ${colour} ${rot}`} />)}
      <main className="relative mx-auto flex min-h-screen max-w-lg flex-col items-center px-5 pb-[calc(1.5rem+env(safe-area-inset-bottom))] pt-12 text-center">
        <p className="text-[13px] font-bold uppercase tracking-[0.12em] text-sun">
          {path?.finished ? t.unlocked.allDoneTitle : index >= 0 ? t.unlocked.complete(index + 1) : ''}
        </p>
        <div className="mt-4 flex items-center gap-3">
          <span className={`flex h-14 w-14 items-center justify-center rounded-full ${look.block} text-inkblock`} aria-hidden="true"><Check size={26} strokeWidth={3} /></span>
          <h1 className="text-[24px] font-extrabold">{ch.title}</h1>
        </div>
        <p className="mt-3 text-[15px] text-white/80">{path?.finished ? t.unlocked.allDoneLine : t.unlocked.line}</p>
        <p className="mt-2 rounded-full bg-white/10 px-3 py-1.5 text-[13px] font-bold text-sun" data-testid="unlocked-level2">{t.unlocked.levelOpen}</p>
        <Teer pose="cheer" height={190} motion="hop" eager className="mt-5" />
        {next && (
          <div className="mt-5 flex w-full items-center gap-3 rounded-[24px] bg-dark-400 p-4 text-left text-ink">
            <span className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-full ${nextLook.block} text-inkblock`} aria-hidden="true"><nextLook.Icon size={22} /></span>
            <span className="flex-1">
              <span className="block text-[11px] font-bold uppercase tracking-[0.08em] text-slt">{t.unlocked.nextTag(nextIndex + 1)}</span>
              <span className="block text-[18px] font-extrabold">{t.chapters[next.key].title}</span>
              <span className="block text-[13px] text-slt">{t.chapters[next.key].line}</span>
            </span>
          </div>
        )}
        <div className="flex-1" />
        <Link
          to={next ? `/path/${next.key}` : '/train'}
          className="mt-6 flex min-h-[56px] w-full items-center justify-center rounded-[18px] bg-sun text-[16px] font-extrabold text-inkblock focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
        >
          {next ? t.unlocked.start(nextIndex + 1) : t.unlocked.backToProfile}
        </Link>
      </main>
    </div>
  );
}
