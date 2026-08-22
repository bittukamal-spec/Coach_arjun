import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Shield } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { translations } from '../../i18n/translations';
import { apiFetch } from '../../api';
import { Card, PageHeader, Button } from '../../components/ui';
import { useMindJournalBack } from './shared';

// ─── Arjun context — the one control over whether journal entries reach
// coaching at all. It is off unless the athlete turns it on, the value shown
// is the server's, not a local guess, and a failed write reverts the switch
// rather than leaving the UI claiming something the server did not accept.
// ───────────────────────────────────────────────────────────────────────────

export default function ArjunContextPage() {
  const navigate = useNavigate();
  const handleBack = useMindJournalBack();
  const { token, language } = useAuth();
  const mj = translations[language].mindJournal;
  const cx = mj.contextScreen;

  const [contextEnabled, setContextEnabled] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [contextSaving, setContextSaving] = useState(false);
  const [contextError, setContextError] = useState(false);

  const authHeaders = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };

  const loadSetting = useCallback(() => {
    setLoaded(false);
    setLoadError(false);
    apiFetch('/api/mind-journal', { headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' } })
      .then(r => (r.ok ? r.json() : null))
      .then(data => {
        if (!data) { setLoadError(true); return; }
        setContextEnabled(!!data.contextEnabled);
      })
      .catch(() => setLoadError(true))
      .finally(() => setLoaded(true));
  }, [token]);

  useEffect(() => { loadSetting(); }, [loadSetting]);

  async function handleContextToggle() {
    const next = !contextEnabled;
    const previous = contextEnabled;
    setContextEnabled(next);
    setContextError(false);
    setContextSaving(true);
    try {
      const res = await apiFetch('/api/mind-journal/context', {
        method: 'PATCH',
        headers: authHeaders,
        body: JSON.stringify({ enabled: next }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || typeof data?.contextEnabled !== 'boolean') {
        setContextEnabled(previous);
        setContextError(true);
      } else {
        setContextEnabled(data.contextEnabled);
      }
    } catch {
      setContextEnabled(previous);
      setContextError(true);
    }
    setContextSaving(false);
  }

  return (
    <div className="min-h-screen bg-dark-900 pb-[calc(2.5rem+env(safe-area-inset-bottom))]">
      <PageHeader onBack={handleBack} title={cx.title} />

      <div className="px-page pt-5 max-w-lg mx-auto">
        <div className="flex items-start gap-3.5 mb-6">
          <span
            className="w-12 h-12 rounded-2xl bg-brand-50 text-brand-500 flex items-center justify-center shrink-0"
            aria-hidden="true"
          >
            <Shield size={22} />
          </span>
          <div>
            <p className="text-title font-bold text-ink mb-1.5">{cx.heading}</p>
            <p className="text-body text-slt leading-relaxed">{cx.body}</p>
          </div>
        </div>

        {!loaded && <div className="h-28 bg-dark-800 rounded-2xl animate-pulse border border-dark-600" />}

        {loaded && loadError && (
          <Card className="p-4 text-center elevation-card">
            <p className="text-body text-slt mb-3">{cx.loadError}</p>
            <button
              onClick={loadSetting}
              className="text-body font-bold text-brand-500 min-h-[44px] px-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 rounded"
            >
              {mj.retryBtn}
            </button>
          </Card>
        )}

        {loaded && !loadError && (
          <>
            <Card className="p-4 elevation-card mb-4">
              {/* min-h keeps the whole row a comfortable target — the box
                  itself is 16px, but the label is what the athlete taps. */}
              <label className="flex items-center justify-between gap-4 cursor-pointer min-h-[44px] py-1">
                <span className="text-body text-ink font-semibold leading-snug flex-1 pr-2">
                  {mj.contextLabel}
                </span>
                <span className="relative inline-flex items-center shrink-0">
                  <input
                    type="checkbox"
                    checked={contextEnabled}
                    disabled={contextSaving}
                    onChange={handleContextToggle}
                    className="absolute inset-0 w-full h-full opacity-0 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2 focus-visible:ring-offset-dark-900 disabled:opacity-60 z-10"
                    style={{ accentColor: 'var(--brand-primary)' }}
                  />
                  <span
                    className={`w-12 h-7 rounded-full transition-colors pointer-events-none ${
                      contextEnabled ? 'bg-brand-500' : 'bg-dark-600'
                    }`}
                    aria-hidden="true"
                  />
                  <span
                    className={`absolute top-0.5 left-0.5 w-6 h-6 rounded-full bg-dark-900 shadow-sm border border-dark-600 transition-transform pointer-events-none ${
                      contextEnabled ? 'translate-x-5' : 'translate-x-0'
                    }`}
                    aria-hidden="true"
                  />
                </span>
              </label>
              <p className="text-caption font-bold mt-3 text-brand-500">
                {contextEnabled ? mj.contextStatus.on : mj.contextStatus.off}
              </p>
              {contextError && <p className="text-caption text-red-500 mt-2">{mj.contextError}</p>}
            </Card>

            <Card className="p-4 elevation-row mb-4" data-testid="mj-context-disclosure">
              <p className="text-body text-slt leading-relaxed mb-3">{mj.contextDisclosure}</p>
              <ul className="space-y-2 text-caption text-slt leading-relaxed">
                <li className="flex gap-2">
                  <span className="text-brand-500 font-bold shrink-0" aria-hidden="true">·</span>
                  <span>{cx.historyWindow}</span>
                </li>
                <li className="flex gap-2">
                  <span className="text-brand-500 font-bold shrink-0" aria-hidden="true">·</span>
                  <span>{cx.notUsed}</span>
                </li>
                <li className="flex gap-2">
                  <span className="text-brand-500 font-bold shrink-0" aria-hidden="true">·</span>
                  <span>{cx.offKeepsEntries}</span>
                </li>
              </ul>
            </Card>

            <Button
              onClick={() => navigate('/mind-journal')}
              className="w-full"
              disabled={contextSaving}
            >
              {cx.doneBtn}
            </Button>
          </>
        )}
      </div>
    </div>
  );
}
