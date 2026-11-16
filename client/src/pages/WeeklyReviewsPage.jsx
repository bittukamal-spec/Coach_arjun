import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { translations } from '../i18n/translations';
import { apiFetch } from '../api';
import { PageHeader, SectionLabel } from '../components/ui';

// ─── Weekly Reviews — weekly coaching summaries OUTSIDE the live chat ────────
// Read-only over the existing GET /api/weekly-reports contract (which also
// lazily generates last week's review server-side, with its own trial,
// consent, dedup and safety guards). The server returns reviews newest
// first; this page renders them in that order — the newest expanded and
// easy to scan, older ones collapsed below. No score, rating, or
// diagnostic framing anywhere; report text renders its **bold** section
// headings and nothing else.

function renderBoldHeadings(text, headingClass = 'font-bold text-ink') {
  return String(text || '').split(/(\*\*[^*]+\*\*)/).map((part, i) =>
    part.startsWith('**') && part.endsWith('**')
      ? <strong key={i} className={`${headingClass} block mt-3 first:mt-0 mb-0.5`}>{part.slice(2, -2)}</strong>
      : <span key={i}>{part}</span>
  );
}

function formatWeekRange(start, end, hi) {
  const opts = { day: 'numeric', month: 'short' };
  const locale = hi ? 'hi-IN' : 'en-IN';
  const s = new Date(start).toLocaleDateString(locale, opts);
  const e = new Date(end).toLocaleDateString(locale, opts);
  return `${s} – ${e}`;
}

export default function WeeklyReviewsPage() {
  const { token, language } = useAuth();
  const t = translations[language].weeklyReviews;
  const hi = language === 'hi';

  const [reports, setReports]   = useState(null); // null = loading, false = error
  const [expandedId, setExpandedId] = useState(null);

  useEffect(() => {
    apiFetch('/api/weekly-reports', { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.ok ? r.json() : Promise.reject())
      .then(d => setReports(Array.isArray(d) ? d : []))
      .catch(() => setReports(false));
  }, [token]);

  return (
    <div className="min-h-screen bg-dark-900 pb-[calc(7.5rem+env(safe-area-inset-bottom))]">
      {/* Back goes to Coach — this page is reached from the Chat header. */}
      <PageHeader backTo="/coaching" barClass="bg-dark-900" />

      <main className="px-page pt-1 max-w-lg mx-auto animate-fade-in">
        <h1 className="text-[30px] leading-[1.1] font-extrabold tracking-tight text-ink">{t.title}</h1>
        <p className="text-[14px] text-slt leading-relaxed mt-1 mb-5">{t.intro}</p>

        {/* Loading */}
        {reports === null && (
          <div className="flex justify-center pt-16" role="status" aria-label={t.loading}>
            <div className="w-8 h-8 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" />
          </div>
        )}

        {/* Error */}
        {reports === false && (
          <p className="text-body text-slt text-center pt-10">{t.loadError}</p>
        )}

        {/* Empty state — no completed weekly review yet */}
        {Array.isArray(reports) && reports.length === 0 && (
          <section className="text-center pt-6">
            <WeekArt className="mx-auto mb-4" />
            <p className="text-[18px] font-extrabold text-ink mb-1">{t.empty}</p>
            <p className="text-caption text-slt leading-relaxed">{t.emptySub}</p>
          </section>
        )}

        {/* Newest review — the blue block, always open. */}
        {Array.isArray(reports) && reports[0] && (
          <section data-testid="wr-latest" className="relative mb-6 rounded-[28px] bg-brand-500 text-white p-5 overflow-hidden">
            <WeekArt className="absolute -right-2 -top-1" />
            <p className="relative self-start inline-block rounded-full bg-white text-brand-700 text-[11px] font-bold tracking-[0.1em] uppercase px-3 py-1">
              {t.latestLabel}
            </p>
            <h2 className="relative mt-3 text-[22px] leading-tight font-extrabold max-w-[14rem]">
              {formatWeekRange(reports[0].weekStart, reports[0].weekEnd, hi)}
            </h2>
            <p className="relative mt-3 text-[14px] leading-relaxed whitespace-pre-wrap break-words text-white">
              {renderBoldHeadings(reports[0].content, 'text-[12px] font-extrabold uppercase tracking-wide text-sun')}
            </p>
            <Link
              to="/coaching"
              state={{ prefillMsg: t.talkPrefill }}
              className="relative mt-4 flex items-center justify-center min-h-[52px] rounded-[18px] bg-sun text-inkblock text-[15px] font-extrabold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
            >
              {t.talkCta}
            </Link>
          </section>
        )}

        {/* Earlier weeks — rows that open on tap. */}
        {Array.isArray(reports) && reports.length > 1 && (
          <section>
            <SectionLabel>{t.earlierLabel}</SectionLabel>
            <ul className="space-y-2.5">
              {reports.slice(1).map(r => {
                const isOpen = expandedId === r.id;
                return (
                  <li key={r.id} className="rounded-[18px] bg-dark-400 overflow-hidden">
                    <button
                      type="button"
                      onClick={() => setExpandedId(isOpen ? null : r.id)}
                      aria-expanded={isOpen}
                      className="w-full min-h-[56px] px-4 py-3 flex items-center justify-between gap-2 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 rounded-[18px]"
                    >
                      <span className="text-[15px] font-bold text-ink">{formatWeekRange(r.weekStart, r.weekEnd, hi)}</span>
                      {isOpen
                        ? <ChevronUp size={18} className="text-slt shrink-0" aria-hidden="true" />
                        : <ChevronDown size={18} className="text-slt shrink-0" aria-hidden="true" />}
                    </button>
                    {isOpen && (
                      <p className="px-4 pb-4 text-[14px] text-slt leading-relaxed whitespace-pre-wrap break-words">
                        {renderBoldHeadings(r.content)}
                      </p>
                    )}
                  </li>
                );
              })}
            </ul>
          </section>
        )}
      </main>
    </div>
  );
}

// Calendar drawing for the latest-week block and the empty state.
function WeekArt({ className = '' }) {
  return (
    <svg aria-hidden="true" width="104" height="104" viewBox="0 0 110 110" className={className}>
      <circle cx="62" cy="48" r="44" className="fill-brand-300" />
      <rect x="40" y="26" width="44" height="50" rx="8" fill="#FFFFFF" />
      <rect x="40" y="26" width="44" height="12" rx="6" fill="#FFC629" />
      <circle cx="52" cy="52" r="4" fill="#1B4DFF" />
      <circle cx="64" cy="52" r="4" fill="#1B4DFF" />
      <circle cx="76" cy="52" r="4" fill="#9DB4FF" />
      <circle cx="52" cy="64" r="4" fill="#9DB4FF" />
    </svg>
  );
}
