import { useNavigate, useLocation, Navigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { translations } from '../../i18n/translations';
import { Card, PageHeader } from '../../components/ui';

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
  const { language } = useAuth();
  const mj = translations[language].mindJournal;
  const saved = mj.savedScreen;

  const entry = location.state?.entry;
  if (!entry) return <Navigate to="/mind-journal" replace />;

  return (
    <div className="min-h-screen bg-dark-900 pb-24">
      <PageHeader backTo="/mind-journal" title={saved.title} />

      <div className="px-page pt-4 max-w-lg mx-auto">
        <Card className="p-4 mb-6">
          <p className="text-heading font-bold text-ink mb-2">{saved.heading}</p>
          <p className="text-body text-slt leading-relaxed">{saved.body}</p>
        </Card>

        {entry.takeForward && (
          <Card className="p-4 mb-6">
            <p className="text-micro font-bold text-slt uppercase mb-2">{mj.takeForwardLabel}</p>
            <p className="text-body text-ink leading-relaxed">{entry.takeForward}</p>
          </Card>
        )}

        <button
          onClick={() => navigate('/mind-journal', { replace: true })}
          className="w-full py-3.5 rounded-2xl text-white font-bold text-body active:scale-[0.98] transition-transform"
          style={{ backgroundColor: 'var(--brand-primary)' }}
        >
          {saved.doneBtn}
        </button>
      </div>
    </div>
  );
}
