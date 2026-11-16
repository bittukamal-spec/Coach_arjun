import { Link, useNavigate } from 'react-router-dom';
import { ArrowRight, X } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { translations } from '../../i18n/translations';
import { ArjunLogo } from '../../components/ArjunLogo';
import { CheckDot } from '../../components/site/SiteBits';
import { PLAN_PRICES, formatRupees, yearlyPerMonth } from '../../constants/plans';

// Public "Free vs Premium" page (/premium), opened from the website's
// Premium box. Plain benefits a new athlete understands — no feature names.
const ROW_TONES = ['bg-mint', 'bg-blush', 'bg-sun', 'bg-coral', 'bg-sky', 'bg-brand-500'];

export default function PremiumPage() {
  const { language } = useAuth();
  const t = translations[language]?.site || translations.en.site;
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-dark-900 text-ink">
      <div className="mx-auto flex min-h-screen max-w-md flex-col px-5 pb-6">
        <div className="flex h-14 items-center">
          <Link to="/" aria-label={t.close} className="flex h-11 w-11 items-center justify-center rounded-[14px] bg-dark-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500">
            <X size={20} aria-hidden="true" />
          </Link>
        </div>

        <div className="flex flex-col items-center gap-2.5 text-center">
          <ArjunLogo size={64} ariaLabel="Arjun logo" />
          <h1 className="text-[26px] leading-tight font-extrabold tracking-[-0.02em]">{t.premiumTitle}</h1>
          <p className="text-[14px] text-slt">{t.premiumSub}</p>
        </div>

        <table className="mt-5 w-full rounded-[24px] bg-dark-400 text-[14px]" data-testid="premium-table">
          <thead>
            <tr>
              <td className="py-2.5 pl-3.5" />
              <th scope="col" className="w-[52px] py-2.5 text-[12px] font-semibold text-slt">{t.colFree}</th>
              <th scope="col" className="w-[84px] py-2.5 pr-3.5">
                <span className="block rounded-full bg-brand-500 py-1 text-[12px] font-extrabold text-white">{t.colPremium}</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {t.premiumRows.map((r, i) => (
              <tr key={r.label} className="border-t border-dark-600">
                <th scope="row" className="py-3 pl-3.5 text-left font-bold leading-snug">
                  <span className="flex items-center gap-2.5">
                    <span className={`h-[30px] w-[30px] shrink-0 rounded-[9px] ${ROW_TONES[i % ROW_TONES.length]}`} aria-hidden="true" />
                    {r.label}
                  </span>
                </th>
                <td className="text-center">
                  {r.free
                    ? <CheckDot className="mx-auto h-[22px] w-[22px]" tone="soft" label={t.included} />
                    : <span className="text-[18px] font-bold text-slt" role="img" aria-label={t.notIncluded}>–</span>}
                </td>
                <td className="pr-3.5 text-center"><CheckDot className="mx-auto h-6 w-6" tone="blue" label={t.included} /></td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="flex-1 min-h-6" />

        <button
          type="button"
          onClick={() => navigate('/auth?tab=signup')}
          className="mt-6 flex min-h-[58px] items-center justify-center gap-2 rounded-[18px] bg-sun text-[17px] font-extrabold text-inkblock focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2"
        >
          {t.tryFree}
          <ArrowRight size={18} strokeWidth={2.6} aria-hidden="true" />
        </button>
        <p className="mt-2.5 text-center text-[13px] text-slt">
          {t.thenYearly(formatRupees(PLAN_PRICES.yearly), formatRupees(yearlyPerMonth()))}
        </p>
        <Link to="/plans" className="mx-auto mt-1.5 flex min-h-[44px] items-center px-3 text-[14px] font-extrabold uppercase tracking-[0.06em] text-brand-500 rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500">
          {t.seeAllPlans}
        </Link>
      </div>
    </div>
  );
}
