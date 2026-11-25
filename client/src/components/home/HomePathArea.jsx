import { useState } from 'react';
import { Link } from 'react-router-dom';
import { CalendarDays, ChevronRight } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { usePath, pathText, matchPhase, weekdayOf, dayFromKey } from '../path/pathData';
import { useMindChallenge } from '../path/mindChallengeData';
import { PathNextCardView } from './PathNextCard';
import MatchDaySheet from '../match/MatchDaySheet';

// Home's path area. Home stays light (founder, Nov 2026): the match prep
// and "How did it go?" cards live on Tools; Home shows one chip that opens
// them. Then "Your next step", and on ordinary days a small "Next match" chip.
// Home loads the path once and shares it with the area and the match tile
// (founder, Nov 2026: a calmer top — the "Next match" button now sits in the
// Your space tile row instead of under the next step).
export default function HomePathArea({ api }) {
  return api ? <PathArea api={api} /> : <OwnPathArea />;
}

function OwnPathArea() {
  return <PathArea api={usePath()} />;
}

function PathArea({ api }) {
  const { path } = api;
  const { state: mc } = useMindChallenge();
  const { language } = useAuth();
  const m = pathText(language).match;

  if (!path) return null;
  const day = path.match?.nextDay || null;
  const phase = matchPhase(day);
  const moment = phase === 'tomorrow' || phase === 'today' || phase === 'review';

  return (
    <>
      {moment && (
        <Link to="/tools" data-testid="home-match-chip"
          className="mb-3 flex min-h-[52px] items-center gap-2.5 rounded-full bg-inkblock px-4 text-[14px] font-bold text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500">
          <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-sun" aria-hidden="true" />
          <span className="min-w-0 flex-1">{phase === 'review' ? m.homeReview(weekdayOf(day)) : m.homePrep(phase === 'today' ? m.today : m.tomorrow)}</span>
          <ChevronRight size={18} aria-hidden="true" />
        </Link>
      )}
      <PathNextCardView path={path} mc={mc} />
    </>
  );
}

// "Next match" square tile for Home's Your space row: add the day (and type)
// or see the one that is set. Hidden on match moments (the dark chip at the
// top of Home covers those).
export function NextMatchTile({ api }) {
  const { language } = useAuth();
  const m = pathText(language).match;
  const { path, setMatchDay } = api;
  const [sheet, setSheet] = useState(false);
  if (!path) return null;
  const day = path.match?.nextDay || null;
  const phase = matchPhase(day);
  if (phase === 'tomorrow' || phase === 'today' || phase === 'review') return null;
  const set = phase === 'ahead';
  return (
    <>
      <button type="button" onClick={() => setSheet(true)} data-testid="match-chip"
        className="flex aspect-square w-[42vw] max-w-[168px] shrink-0 snap-start flex-col justify-between rounded-[24px] bg-mint p-3.5 text-left text-inkblock active:scale-[0.98] transition-transform focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2">
        <CalendarDays size={40} strokeWidth={2.2} aria-hidden="true" />
        <span className="block">
          <span className="block text-[16px] font-extrabold leading-tight">{set ? m.tileSet(weekdayOf(day, 'short'), dayFromKey(day).getDate()) : m.tileAdd}</span>
          {set && path.match?.type && <span className="block text-[13px] font-bold">{m.typeShort[path.match.type]}</span>}
        </span>
      </button>
      <MatchDaySheet
        open={sheet}
        initialDay={set ? day : null}
        initialType={set ? (path.match?.type || null) : null}
        onClose={() => setSheet(false)}
        onSave={async (d, ty) => { await setMatchDay(d, ty); setSheet(false); }}
      />
    </>
  );
}
