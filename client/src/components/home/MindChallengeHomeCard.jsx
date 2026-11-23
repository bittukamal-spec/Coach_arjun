import { Link } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import Teer from '../visuals/Teer';
import { challengeText, useMindChallenge } from '../path/mindChallengeData';

// Home trigger (Hook Model): shows only when a Mind Challenge can be played —
// the first one ("New") or the 4-weekly rematch. Hidden otherwise.
export default function MindChallengeHomeCard() {
  const { language } = useAuth();
  const t = challengeText(language);
  const { state } = useMindChallenge();
  if (!state?.canTake) return null;
  const rematch = !!state.latest;
  return (
    <Link
      to="/mind-challenge"
      data-testid="home-mind-challenge"
      className={`relative mb-3 flex items-center gap-3 overflow-hidden rounded-[28px] p-5 active:scale-[0.99] transition-transform focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2 ${rematch ? 'bg-sun text-inkblock' : 'bg-inkblock text-white'}`}
    >
      <span className="min-w-0 flex-1">
        {(rematch ? t.homeCard.rematchTag : t.homeCard.newTag) && (
          <span className={`mb-1.5 block text-[11px] font-medium uppercase tracking-[0.12em] ${rematch ? 'text-inkblock/70' : 'text-sun'}`}>
            {rematch ? t.homeCard.rematchTag : t.homeCard.newTag}
          </span>
        )}
        <span className="block text-[21px] font-extrabold leading-tight">{rematch ? t.homeCard.rematchTitle(state.latest.mindLevel) : t.homeCard.newTitle}</span>
        <span className={`mt-1 block text-[14px] ${rematch ? 'text-inkblock/80' : 'text-white/80'}`}>
          {rematch ? t.homeCard.rematchLine(t.skills[state.latest.focusSkill || state.latest.growFirst]) : t.homeCard.newLine}
        </span>
        <span className={`mt-3 inline-flex min-h-[44px] items-center rounded-[14px] px-4 text-[15px] font-extrabold ${rematch ? 'bg-inkblock text-white' : 'bg-sun text-inkblock'}`}>
          {rematch ? t.homeCard.playRematch : t.homeCard.play}
        </span>
      </span>
      <Teer pose="point" height={120} className="shrink-0" />
    </Link>
  );
}
