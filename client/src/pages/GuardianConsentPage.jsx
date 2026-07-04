import { useState } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { translations } from '../i18n/translations';
import { apiFetch } from '../api';

// Public page — a parent/guardian lands here from the consent email link.
function GuardianConsentPage() {
  const { language } = useAuth();
  const t = translations[language].consent;
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token') || '';

  const [status, setStatus] = useState('ready'); // ready | busy | success | error
  const [athleteName, setAthleteName] = useState('');
  const [error, setError] = useState('');

  async function handleConfirm() {
    setStatus('busy');
    setError('');
    try {
      const res = await apiFetch('/api/auth/guardian-consent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || t.invalidLink);
        setStatus('error');
        return;
      }
      setAthleteName(data.athleteName || '');
      setStatus('success');
    } catch {
      setError(t.invalidLink);
      setStatus('error');
    }
  }

  return (
    <div className="min-h-screen bg-dark-900 flex flex-col">
      <header className="px-4 py-5 flex items-center gap-2.5">
        <div className="w-8 h-8 rounded-lg bg-brand-500 flex items-center justify-center shadow-lg shadow-brand-500/40">
          <span className="text-white font-bold text-sm">A</span>
        </div>
        <span className="font-bold text-ink text-lg tracking-tight">Arjun</span>
      </header>

      <div className="flex-1 flex items-center justify-center px-4 py-8">
        <div className="w-full max-w-sm bg-dark-800 rounded-2xl border border-dark-600 shadow-2xl p-6 text-center">
          {status === 'success' ? (
            <>
              <div className="text-4xl mb-3">✓</div>
              <h1 className="text-xl font-bold text-ink mb-2">{t.successTitle}</h1>
              <p className="text-sm text-slt leading-relaxed">{t.successBody(athleteName || '—')}</p>
            </>
          ) : (
            <>
              <h1 className="text-xl font-bold text-ink mb-2">{t.confirmTitle}</h1>
              <p className="text-sm text-slt leading-relaxed mb-6">{t.confirmBody}</p>
              {(status === 'error' || !token) && (
                <p className="text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2 mb-4">
                  {error || t.invalidLink}
                </p>
              )}
              <button
                onClick={handleConfirm}
                disabled={status === 'busy' || !token}
                className="btn-primary w-full justify-center py-3 text-sm disabled:opacity-50"
              >
                {status === 'busy' ? t.confirming : t.confirmBtn}
              </button>
              <p className="text-xs text-muted mt-4">
                <Link to="/privacy" className="underline">Privacy Policy</Link>
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export default GuardianConsentPage;
