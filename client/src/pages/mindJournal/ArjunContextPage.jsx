import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { translations } from '../../i18n/translations';
import { apiFetch } from '../../api';
import { Card, PageHeader } from '../../components/ui';

// ─── Arjun context — the one control over whether journal entries reach
// coaching at all. It is off unless the athlete turns it on, the value shown
// is the server's, not a local guess, and a failed write reverts the switch
// rather than leaving the UI claiming something the server did not accept.
// ───────────────────────────────────────────────────────────────────────────

export default function ArjunContextPage() {
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
    <div className="min-h-screen bg-dark-900 pb-24">
      <PageHeader backTo="/mind-journal" title={cx.title} />

      <div className="px-page pt-4 max-w-lg mx-auto">
        <p className="text-body font-semibold text-ink mb-2">{cx.heading}</p>
        <p className="text-body text-slt mb-6 leading-relaxed">{cx.body}</p>

        {!loaded && <div className="h-20 bg-dark-800 rounded-2xl animate-pulse border border-dark-600" />}

        {loaded && loadError && (
          <Card className="p-4 text-center">
            <p className="text-body text-slt mb-3">{cx.loadError}</p>
            <button onClick={loadSetting} className="text-body font-bold" style={{ color: 'var(--brand-primary)' }}>
              {mj.retryBtn}
            </button>
          </Card>
        )}

        {loaded && !loadError && (
          <Card className="p-4">
            {/* min-h keeps the whole row a comfortable target — the box
                itself is 16px, but the label is what the athlete taps. */}
            <label className="flex items-start gap-3 cursor-pointer min-h-[44px] py-1">
              <input
                type="checkbox"
                checked={contextEnabled}
                disabled={contextSaving}
                onChange={handleContextToggle}
                className="mt-1 w-4 h-4 shrink-0 rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2 focus-visible:ring-offset-dark-900 disabled:opacity-60"
                style={{ accentColor: 'var(--brand-primary)' }}
              />
              <span className="text-body text-ink font-medium leading-snug">{mj.contextLabel}</span>
            </label>
            <p className="text-caption text-slt mt-2 leading-relaxed">{mj.contextDisclosure}</p>
            {contextError && <p className="text-caption text-red-500 mt-2">{mj.contextError}</p>}
          </Card>
        )}

        <p className="text-caption text-slt mt-6 leading-relaxed">{cx.notUsed}</p>
      </div>
    </div>
  );
}
