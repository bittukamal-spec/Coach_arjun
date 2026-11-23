import { useState } from 'react';
import { matchPhase } from '../path/pathData';
import MatchPrepCard from './MatchPrepCard';
import MatchReviewCard from './MatchReviewCard';
import MatchDaySheet from './MatchDaySheet';

// The match moment card on Tools (Hook fix 2, moved off Home Nov 2026):
// the day before / match day → prep; 1–3 days after → "How did it go?".
// Keeps the review card (and its thank-you) on screen after the answer
// clears the match. Returns null on other days.
export default function MatchMoment({ path, reviewMatch, setMatchDay }) {
  const [reviewing, setReviewing] = useState(null);
  const [sheet, setSheet] = useState(false);
  if (!path) return null;
  const phase = matchPhase(path.match?.nextDay);
  let card = null;
  if (!reviewing && (phase === 'tomorrow' || phase === 'today')) card = <MatchPrepCard path={path} phase={phase} />;
  else if (phase === 'review' || reviewing) {
    const shown = reviewing || path;
    card = <MatchReviewCard path={shown} reviewMatch={async (f, u) => { setReviewing(shown); return reviewMatch(f, u); }} onNextMatch={() => setSheet(true)} />;
  }
  if (!card) return null;
  return (
    <>
      {card}
      <MatchDaySheet open={sheet} onClose={() => setSheet(false)} onSave={async (d, ty) => { await setMatchDay(d, ty); setSheet(false); setReviewing(null); }} />
    </>
  );
}
