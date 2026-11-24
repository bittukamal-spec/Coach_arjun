import { useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ChevronRight } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { usePath, pathText, CHAPTER_LOOK, STEP_ORDER, nextHref, nextStepText, takeNewlyFinished } from '../path/pathData';
import { useMindChallenge } from '../path/mindChallengeData';
import { markFromPath } from '../../utils/practiceReturn';

// Home "Your next step" (Hook Model trigger + one-tap action): the one thing
// to do next on the athlete's path. Hidden while the Mind Challenge card is
// showing (one ask at a time) and when the path is finished.
// `path` / `mc` can be passed in by a parent that already loaded them
// (Home's HomePathArea); otherwise the card loads its own.
export default function PathNextCard(props) {
  const own = usePath();
  const ownMc = useMindChallenge();
  const path = props.path !== undefined ? props.path : own.path;
  const mc = props.mc !== undefined ? props.mc : ownMc.state;
  return <PathNextCardView path={path} mc={mc} />;
}

export function PathNextCardView({ path, mc }) {
  const { language, user } = useAuth();
  const t = pathText(language);
  const navigate = useNavigate();

  useEffect(() => {
    const fresh = takeNewlyFinished(path);
    if (fresh) navigate(`/path/unlocked/${fresh}`);
  }, [path, navigate]);

  if (!path || !path.next || !mc || mc.canTake) return null;
  const { chapterKey, stepKey, level = 1 } = path.next;
  const ch = t.chapters[chapterKey];
  const { Icon, block } = CHAPTER_LOOK[chapterKey] || CHAPTER_LOOK.calm;
  return (
    <Link
      to={nextHref(chapterKey, stepKey, t, level)}
      onClick={markFromPath}
      data-testid="home-path-next"
      className="mb-3 flex items-center gap-3 rounded-[22px] border-2 border-sun bg-dark-400 px-3.5 py-3 active:scale-[0.99] transition-transform focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
    >
      <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full ${block} text-inkblock`} aria-hidden="true"><Icon size={20} /></span>
      <span className="min-w-0 flex-1">
        <span className="block text-[11px] font-medium uppercase tracking-[0.1em] text-slt">{t.homeNextTag(level > 1 ? `${ch.title} · ${t.levelLabel(level)}` : ch.title, STEP_ORDER.indexOf(stepKey) + 1)}</span>
        <span className="mt-0.5 block text-[15px] font-extrabold leading-snug text-ink">{nextStepText(chapterKey, stepKey, t, level, user?.sport)}</span>
      </span>
      <ChevronRight size={20} strokeWidth={2.6} className="shrink-0 text-ink" aria-hidden="true" />
    </Link>
  );
}
