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
export default function HomePathArea() {
  const { language } = useAuth();
  const m = pathText(language).match;
  const { path, setMatchDay } = usePath();
  const { state: mc } = useMindChallenge();
  const [sheet, setSheet] = useState(false);

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
      {!moment && (
        <button type="button" onClick={() => setSheet(true)} data-testid="match-chip"
          className="mb-3 -mt-1 inline-flex min-h-[44px] items-center gap-2 rounded-full bg-dark-400 pl-3 pr-2.5 text-[13px] font-bold text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500">
          <CalendarDays size={16} aria-hidden="true" />
          {phase === 'ahead' ? m.chipSet(weekdayOf(day, 'short'), dayFromKey(day).getDate()) : m.chipAdd}
          <ChevronRight size={16} aria-hidden="true" />
        </button>
      )}
      <MatchDaySheet
        open={sheet}
        initialDay={phase === 'ahead' ? day : null}
        onClose={() => setSheet(false)}
        onSave={async (d) => { await setMatchDay(d); setSheet(false); }}
      />
    </>
  );
}
