import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ChevronLeft } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { translations } from '../../i18n/translations';
import { CheckDot } from '../../components/site/SiteBits';
import { PLAN_PRICES, formatRupees, yearlyPerMonth, yearlySavingPct } from '../../constants/plans';

// Public plans page (/plans). Yearly is chosen by default and highlighted;
// monthly is priced higher on purpose (founder, Nov 2026). The choice is
// shown only — the real checkout happens inside the app after sign-up.
export default function PlansPage() {
  const { language } = useAuth();
  const t = translations[language]?.site || translations.en.site;
  const navigate = useNavigate();
  const [plan, setPlan] = useState('yearly');

  const card = (selected) =>
    `relative w-full rounded-[24px] p-[18px] text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2 ${
      selected ? 'bg-brand-500 text-white ring-[3px] ring-sun' : 'bg-dark-400 text-ink'
    }`;

  return (
    <div className="min-h-screen bg-dark-900 text-ink">
      <div className="mx-auto flex min-h-screen max-w-md flex-col px-5 pb-6">
        <div className="flex h-14 items-center">
          <Link to="/premium" aria-label={t.back} className="flex h-11 w-11 items-center justify-center rounded-[14px] bg-dark-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500">
            <ChevronLeft size={20} aria-hidden="true" />
          </Link>
        </div>

        <h1 className="text-[30px] leading-[1.1] font-extrabold tracking-[-0.02em]">{t.plansTitle}</h1>
        <ul className="mt-3.5 space-y-2.5">
          {t.plansPoints.map(p => (
            <li key={p} className="flex items-center gap-2.5 text-[14.5px] font-semibold">
              <CheckDot className="h-5 w-5 shrink-0" tone="blue" />
              {p}
            </li>
          ))}
        </ul>

        <div role="radiogroup" aria-label={t.plansTitle} className="mt-7 space-y-3">
          <button type="button" role="radio" aria-checked={plan === 'yearly'} onClick={() => setPlan('yearly')} className={card(plan === 'yearly')}>
            <span className="absolute -top-3 left-[18px] rounded-full bg-sun px-2.5 py-1 text-[11px] font-extrabold uppercase tracking-[0.08em] text-inkblock">
              {t.yearlyBadge(yearlySavingPct())}
            </span>
            <span className="flex items-start justify-between gap-3">
              <span className="flex flex-col gap-0.5">
                <span className="text-[18px] font-extrabold">{t.yearly}</span>
                <span className={`text-[12.5px] ${plan === 'yearly' ? 'text-white/90' : 'text-slt'}`}>{t.yearlyBilled(formatRupees(PLAN_PRICES.yearly))}</span>
              </span>
              <span className="flex flex-col items-end">
                <span className="text-[24px] font-extrabold">{formatRupees(yearlyPerMonth())}</span>
                <span className={`text-[12px] ${plan === 'yearly' ? 'text-white/90' : 'text-slt'}`}>{t.perMonth}</span>
              </span>
            </span>
            <span className={`mt-2.5 block text-[12.5px] ${plan === 'yearly' ? 'text-white/90' : 'text-slt'}`}>{t.yearlyLine}</span>
          </button>

          <button type="button" role="radio" aria-checked={plan === 'monthly'} onClick={() => setPlan('monthly')} className={card(plan === 'monthly')}>
            <span className="flex items-center justify-between gap-3">
              <span className="flex flex-col gap-0.5">
                <span className="text-[18px] font-extrabold">{t.monthly}</span>
                <span className={`text-[12.5px] ${plan === 'monthly' ? 'text-white/90' : 'text-slt'}`}>{t.monthlyBilled}</span>
              </span>
              <span className="flex flex-col items-end">
                <span className="text-[24px] font-extrabold">{formatRupees(PLAN_PRICES.monthly)}</span>
                <span className={`text-[12px] ${plan === 'monthly' ? 'text-white/90' : 'text-slt'}`}>{t.perMonth}</span>
              </span>
            </span>
          </button>
        </div>

        <div className="flex-1 min-h-6" />
        <button
          type="button"
          onClick={() => navigate(`/auth?tab=signup&plan=${plan}`)}
          className="mt-6 flex min-h-[58px] items-center justify-center rounded-[18px] bg-sun text-[17px] font-extrabold text-inkblock focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2"
        >
          {t.startTrial}
        </button>
        <p className="mt-2.5 text-center text-[12.5px] text-slt">{t.trialNote}</p>
      </div>
    </div>
  );
}
