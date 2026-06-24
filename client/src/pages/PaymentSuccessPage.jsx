import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { translations } from '../i18n/translations';
import { apiFetch } from '../api';
import { CheckCircle2 } from 'lucide-react';

const MAX_POLLS    = 5;
const POLL_DELAY   = 2000; // ms between polls
const INITIAL_WAIT = 3000; // ms before first poll

export default function PaymentSuccessPage() {
  const { token, fetchUser, language } = useAuth();
  const navigate     = useNavigate();
  const t            = translations[language].pricing;

  const [timedOut, setTimedOut]   = useState(false);
  const pollCount                  = useRef(0);
  const timerRef                   = useRef(null);

  useEffect(() => {
    let cancelled = false;

    async function poll() {
      if (cancelled) return;
      pollCount.current += 1;

      try {
        const res = await apiFetch('/api/payments/status', {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) throw new Error('status error');
        const data = await res.json();

        if (data.tier === 'premium') {
          await fetchUser(token); // refresh user in AuthContext / localStorage
          if (!cancelled) navigate('/dashboard', { replace: true });
          return;
        }
      } catch {
        // network error — keep polling
      }

      if (pollCount.current >= MAX_POLLS) {
        if (!cancelled) setTimedOut(true);
        return;
      }

      timerRef.current = setTimeout(poll, POLL_DELAY);
    }

    // Start polling after initial delay
    timerRef.current = setTimeout(poll, INITIAL_WAIT);

    return () => {
      cancelled = true;
      clearTimeout(timerRef.current);
    };
  }, [token, fetchUser, navigate]);

  return (
    <div className="min-h-screen bg-dark-900 flex flex-col items-center justify-center px-6 text-center animate-fade-in">

      <div className="w-20 h-20 bg-win-500/10 border border-win-500/30 rounded-full flex items-center justify-center mb-6">
        <CheckCircle2 size={40} className="text-win-500" />
      </div>

      <h1 className="text-2xl font-black text-ink mb-3 leading-snug">
        {t.nowPremium}
      </h1>

      {!timedOut ? (
        <>
          <p className="text-sm text-slt mb-8 leading-relaxed max-w-xs">
            {t.activatingSoon}
          </p>
          {/* Spinner */}
          <div className="w-6 h-6 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" />
        </>
      ) : (
        <p className="text-sm text-slt max-w-xs leading-relaxed">
          {t.activatingTimeout}
        </p>
      )}

    </div>
  );
}
