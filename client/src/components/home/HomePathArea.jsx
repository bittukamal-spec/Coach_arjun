import { useState } from 'react';
import { CalendarDays, ChevronRight } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { usePath, pathText, matchPhase, weekdayOf, dayFromKey } from '../path/pathData';
import { useMindChallenge } from '../path/mindChallengeData';
import { PathNextCardView } from './PathNextCard';
import MatchPrepCard from '../match/MatchPrepCard';
import MatchReviewCard from '../match/MatchReviewCard';
import MatchDaySheet from '../match/MatchDaySheet';

// Home's path area (Hook fix 2). One thing at a time:
//   match tomorrow / today  → match prep card
//   1–3 days after a match  → "How did it go?"
//   otherwise               → "Your next step" + a small "Next match" chip
export default function HomePathArea() {
  const { language } = useAuth();
  const m = pathText(language).match;
  const { path, setMatchDay, reviewMatch } = usePath();
  const { state: mc } = useMindChallenge();
  const [sheet, setSheet] = useState(false);
  // Keeps the "How did it go?" card (and its thank-you) on screen after the
  // answer clears the match on the server.
  const [reviewing, setReviewing] = useState(null);

  if (!path) return null;
  const day = path.match?.nextDay || null;
  const phase = matchPhase(day);

  let main;
  if (!reviewing && (phase === 'tomorrow' || phase === 'today')) main = <MatchPrepCard path={path} phase={phase} />;
  else if (phase === 'review' || reviewing) {
    const shown = reviewing || path;
    main = <MatchReviewCard path={shown} reviewMatch={async (f, u) => { setReviewing(shown); return reviewMatch(f, u); }} onNextMatch={() => setSheet(true)} />;
  }
  else {
    main = (
      <>
        <PathNextCardView path={path} mc={mc} />
        <button type="button" onClick={() => setSheet(true)} data-testid="match-chip"
          className="mb-3 -mt-1 inline-flex min-h-[44px] items-center gap-2 rounded-full bg-dark-400 pl-3 pr-2.5 text-[13px] font-bold text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500">
          <CalendarDays size={16} aria-hidden="true" />
          {phase === 'ahead' ? m.chipSet(weekdayOf(day, 'short'), dayFromKey(day).getDate()) : m.chipAdd}
          <ChevronRight size={16} aria-hidden="true" />
        </button>
      </>
    );
  }

  return (
    <>
      {main}
      <MatchDaySheet
        open={sheet}
        initialDay={phase === 'ahead' || phase === 'tomorrow' || phase === 'today' ? day : null}
        onClose={() => setSheet(false)}
        onSave={async (d) => { await setMatchDay(d); setSheet(false); setReviewing(null); }}
      />
    </>
  );
}
