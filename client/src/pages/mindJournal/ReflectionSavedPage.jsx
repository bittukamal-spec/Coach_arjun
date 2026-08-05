import { useNavigate, useLocation, Navigate, Link } from 'react-router-dom';
import { CheckCircle2 } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { translations } from '../../i18n/translations';
import { Card, PageHeader, Button } from '../../components/ui';
import { guidedPreview, stateTagsForEntry } from './constants';
import { useMindJournalBack } from './shared';

// ─── Reflection saved — a plain confirmation, deliberately quiet. No score,
// no rank, no comparison to last time, no reward animation: the reflection
// was written, and that is the whole event.
//
// The saved entry arrives through router state from the save. There is no
// single-entry read on the server, so a direct hit on this URL (a refresh, a
// shared link) has nothing to confirm and returns to the journal instead of
// asserting that something was saved. ───────────────────────────────────────

export default function ReflectionSavedPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const handleBack = useMindJournalBack();
  const { language } = useAuth();
  const mj = translations[language].mindJournal;
  const saved = mj.savedScreen;

  const entry = location.state?.entry;
  if (!entry) return <Navigate to="/mind-journal" replace />;

  const contextLabel = entry.contextType
    ? (mj.contextTypes[entry.contextType] || mj.contextTypes.SOMETHING_ELSE)
    : null;
  const stateTags = stateTagsForEntry(entry, mj);
  const preview = guidedPreview(entry) || entry.note;
  const showPreview = preview && preview !== entry.takeForward;

  const dateLabel = entry.createdAt
    ? new Date(entry.createdAt).toLocaleDateString(language === 'hi' ? 'hi-IN' : 'en-IN', {
        day: 'numeric',
        month: 'short',
      })
    : null;

  return (
    <div className="min-h-screen bg-dark-900 pb-10">
      <PageHeader onBack={handleBack} title={saved.title} />

      <div className="px-page pt-8 max-w-lg mx-auto">
        <div className="flex flex-col items-center text-center mb-7">
          <span
            className="w-16 h-16 rounded-full bg-brand-50 text-brand-500 flex items-center justify-center mb-4 elevation-row"
            aria-hidden="true"
          >
            <CheckCircle2 size={32} strokeWidth={1.75} />
          </span>
          <h2 className="text-title font-bold text-ink mb-2">{saved.heading}</h2>
          <p className="text-body text-slt leading-relaxed max-w-sm">{saved.body}</p>
        </div>

        <Card className="p-4 mb-6 elevation-card text-left" data-testid="mj-saved-summary">
          <div className="flex items-center justify-between gap-2 mb-3">
            {dateLabel && <p className="text-caption font-semibold text-slt">{dateLabel}</p>}
            {contextLabel && (
              <span className="inline-flex items-center px-2.5 py-1 rounded-full text-caption font-semibold bg-brand-50 text-brand-500">
                {contextLabel}
              </span>
            )}
          </div>

          {stateTags.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mb-3">
              {stateTags.map((label, idx) => (
                <span
                  key={`${label}-${idx}`}
                  className="inline-flex items-center px-2.5 py-1 rounded-full text-caption font-semibold bg-dark-700 text-ink border border-dark-600 max-w-full break-words"
                >
                  {label}
                </span>
              ))}
            </div>
          )}

          {showPreview && (
            <p className="text-body text-ink leading-relaxed">{preview}</p>
          )}

          {entry.takeForward && (
            <div className={`${showPreview ? 'mt-3 pt-3 border-t border-dark-600' : ''}`}>
              <p className="text-caption text-slt leading-relaxed">
                <span className="font-bold text-ink">{mj.takeForwardLabel}: </span>
                {entry.takeForward}
              </p>
            </div>
          )}
        </Card>

        <Button
          onClick={() => navigate('/mind-journal', { replace: true })}
          className="w-full mb-3"
        >
          {saved.doneBtn}
        </Button>

        <Link
          to="/mind-journal"
          replace
          className="flex items-center justify-center w-full min-h-[48px] rounded-[14px] border border-dark-600 bg-dark-800 text-body font-semibold text-ink active:scale-[0.98] transition-transform focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
          data-testid="mj-view-reflections"
        >
          {saved.viewBtn}
        </Link>

        <div
          className="mt-6 flex items-center justify-center gap-2 text-caption text-slt"
          data-testid="mj-saved-context-status"
        >
          <span
            className="w-2 h-2 rounded-full bg-dark-500"
            aria-hidden="true"
          />
          <p>
            {mj.contextStatus.label}: {mj.savedScreen.contextHint}
          </p>
        </div>
      </div>
    </div>
  );
}
