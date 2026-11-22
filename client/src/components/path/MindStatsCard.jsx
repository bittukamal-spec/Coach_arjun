import { forwardRef } from 'react';
import { ArjunLogo } from '../ArjunLogo';
import { SKILLS, challengeText } from './mindChallengeData';

// The Mind Stats card — a player card with a level per skill. `previous`
// (optional) shows "Lv 1 → Lv 2" for skills that went up after a rematch.
const MindStatsCard = forwardRef(function MindStatsCard({ result, previous, name, sport, language = 'en' }, ref) {
  const t = challengeText(language);
  return (
    <div ref={ref} data-testid="mind-stats-card" className="w-full max-w-[300px] rounded-[28px] bg-sun p-5 text-inkblock shadow-[0_24px_50px_rgba(0,0,0,0.4),inset_0_0_0_2px_rgba(255,255,255,0.45)]">
      <div className="flex items-start justify-between">
        <div className="flex flex-col">
          <span className="text-[46px] font-extrabold leading-none">{result.mindLevel}</span>
          <span className="text-[11px] font-extrabold uppercase tracking-[0.1em]">{t.card.mindLevel}</span>
        </div>
        <ArjunLogo size={64} />
      </div>
      {name && <p className="mt-2 text-[22px] font-extrabold uppercase tracking-[-0.01em]">{name}</p>}
      {sport && <p className="text-[12px] font-semibold capitalize">{sport}</p>}
      <ul className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2.5 border-t-2 border-inkblock/20 pt-3">
        {SKILLS.map(s => {
          const lv = result.levels[s];
          const before = previous?.levels?.[s];
          const up = before && lv > before;
          return (
            <li key={s} className="flex flex-col gap-1">
              <span className="flex justify-between text-[12px] font-extrabold uppercase">
                <span>{t.skills[s]}</span>
                <span>{up ? t.card.changed(before, lv) : t.levelShort(lv)}</span>
              </span>
              <span className="h-[7px] rounded-full bg-inkblock/20" aria-hidden="true">
                <span className={`block h-[7px] rounded-full ${up ? 'bg-brand-500' : 'bg-inkblock'}`} style={{ width: `${lv * 20}%` }} />
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
});

export default MindStatsCard;
