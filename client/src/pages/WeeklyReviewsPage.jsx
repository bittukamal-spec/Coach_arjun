import { useState, useEffect } from 'react';
import { ChevronDown, ChevronUp, CalendarRange } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { translations } from '../i18n/translations';
import { apiFetch } from '../api';
import { Card, PageHeader } from '../components/ui';

// ─── Weekly Reviews — weekly coaching summaries OUTSIDE the live chat ────────
// Read-only over the existing GET /api/weekly-reports contract (which also
// lazily generates last week's review server-side, with its own trial,
// consent, dedup and safety guards). The server returns reviews newest
// first; this page renders them in that order — the newest expanded and
// easy to scan, older ones collapsed below. No score, rating, or
// diagnostic framing anywhere; report text renders its **bold** section
// headings and nothing else.

function renderBoldHeadings(text) {
  return text.split(/(\*\*[^*]+\*\*)/).map((part, i) =>
    part.startsWith('**') && part.endsWith('**')
      ? <strong key={i} className="font-bold text-ink block mt-3 first:mt-0 mb-0.5">{part.slice(2, -2)}</strong>
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
    <div className="min-h-screen bg-dark-900 pb-24">
      {/* Back goes to Coach — this page is reached from the Chat header. */}
      <PageHeader backTo="/coaching" title={t.title} />

      <main className="px-page pt-4 max-w-lg mx-auto">
        <p className="text-body text-slt leading-relaxed mb-6">{t.intro}</p>

        {/* Loading */}
        {reports === null && (
          <div className="flex justify-center pt-16">
            <div className="w-8 h-8 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" />
          </div>
        )}

        {/* Error */}
        {reports === false && (
          <p className="text-body text-slt text-center pt-10">{t.loadError}</p>
        )}

        {/* Empty state — no completed weekly review yet */}
        {Array.isArray(reports) && reports.length === 0 && (
          <Card className="p-5 text-center">
            <div className="w-11 h-11 rounded-xl bg-brand-500/15 flex items-center justify-center mx-auto mb-3">
              <CalendarRange size={20} className="text-brand-400" aria-hidden="true" />
            </div>
            <p className="text-body font-bold text-ink mb-1">{t.empty}</p>
            <p className="text-caption text-slt leading-relaxed">{t.emptySub}</p>
          </Card>
        )}

        {/* Reviews — newest first, exactly as the server returns them. The
            newest is always expanded; older ones expand on tap. */}
        {Array.isArray(reports) && reports.map((r, i) => {
          const isNewest = i === 0;
          const isOpen = isNewest || expandedId === r.id;
          return (
            <Card key={r.id} className={`mb-3 overflow-hidden ${isNewest ? 'border-brand-500/40' : ''}`}>
              {isNewest ? (
                <div className="px-4 pt-4">
                  <p className="text-micro font-bold text-brand-400 uppercase mb-0.5">{t.latestLabel}</p>
                  <p className="text-body font-bold text-ink">{formatWeekRange(r.weekStart, r.weekEnd, hi)}</p>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setExpandedId(isOpen ? null : r.id)}
                  aria-expanded={isOpen}
                  className="w-full min-h-[48px] px-4 py-3 flex items-center justify-between gap-2 text-left active:opacity-70"
                >
                  <span className="text-body font-semibold text-ink">{formatWeekRange(r.weekStart, r.weekEnd, hi)}</span>
                  {isOpen
                    ? <ChevronUp size={16} className="text-muted shrink-0" aria-hidden="true" />
                    : <ChevronDown size={16} className="text-muted shrink-0" aria-hidden="true" />}
                </button>
              )}
              {isOpen && (
                <div className="px-4 pb-4 pt-2">
                  <p className="text-body text-slt leading-relaxed whitespace-pre-wrap break-words">
                    {renderBoldHeadings(r.content)}
                  </p>
                </div>
              )}
            </Card>
          );
        })}
      </main>
    </div>
  );
}
