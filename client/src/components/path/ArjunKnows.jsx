import { Link } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { translations } from '../../i18n/translations';
import { usePath, pathText, dayFromKey } from './pathData';

// "What Arjun knows — and what it does with it" (onboarding v2, Nov 2026).
// Investment made visible: each answer shows what it changed, with a Change
// link into the profile check-in.
export default function ArjunKnows() {
  const { language } = useAuth();
  const L = translations[language] || translations.en;
  const k = (L.knows || translations.en.knows);
  const v2 = L.onboarding?.v2 || translations.en.onboarding?.v2 || {};
  const t = pathText(language);
  const { path } = usePath();
  if (!path?.personal) return null;
  const p = path.personal;
  const word = (group, id) => {
    const key = id.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
    const text = v2[group]?.[key] || id;
    return String(text).split(' — ')[0];
  };
  const firstChapter = path.chapters?.[0]?.key;
  const matchDay = path.match?.nextDay;
  const rows = [
    { key: 'hardest', value: firstChapter ? t.chapters[firstChapter]?.title : null, effect: firstChapter ? k.effect.hardest(t.chapters[firstChapter]?.title) : null, to: '/starting-profile/check-in?section=pressure' },
    { key: 'signal', value: p.firstSignal ? word('firstSignal', p.firstSignal) : null, effect: p.firstSignal ? k.effect.signal[p.firstSignal] : null },
    { key: 'pressure', value: p.pressures.length ? p.pressures.map(id => word('contextualPressures', id)).join(' · ') : null, effect: k.effect.pressure },
    { key: 'helps', value: p.helps.length ? p.helps.map(id => word('whatHelps', id)).join(' · ') : null, effect: k.effect.helps },
    {
      key: 'week',
      value: [p.trainingTime ? word('trainingTime', p.trainingTime) : null, matchDay ? k.matchOn(dayFromKey(matchDay).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric' })) : null].filter(Boolean).join(' · ') || null,
      effect: p.trainingTime ? k.effect.week(k.reminder[p.trainingTime] || k.reminder.varies) : null,
    },
  ];

  return (
    <section className="mb-6" aria-labelledby="arjun-knows" data-testid="arjun-knows">
      <h2 id="arjun-knows" className="mb-2 text-[14px] font-extrabold text-ink">{k.title}</h2>
      <ul className="flex flex-col gap-2">
        {rows.map(r => (
          <li key={r.key} className="rounded-[18px] bg-dark-400 px-4 py-3">
            <div className="flex items-center justify-between gap-2 text-[12px] text-slt">
              <span>{k.rows[r.key]}</span>
              <Link to={r.to || '/starting-profile/check-in?section=personal'} className="min-h-[32px] px-1 font-bold text-brand-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500">{k.change}</Link>
            </div>
            <p className="text-[15px] font-extrabold text-ink">{r.value || k.notSet}</p>
            {r.value && r.effect && <p className="mt-0.5 text-[12.5px] text-slt">→ {r.effect}</p>}
          </li>
        ))}
      </ul>
    </section>
  );
}
