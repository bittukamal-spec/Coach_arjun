import { useState } from 'react';
import { ShieldAlert } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { translations } from '../i18n/translations';
import { apiFetch } from '../api';

// True when the signed-in user is an under-18 account still waiting on guardian consent.
export function needsGuardianConsent(user) {
  if (!user?.dateOfBirth || user.guardianConsentAt) return false;
  const birth = new Date(user.dateOfBirth);
  const now = new Date();
  let years = now.getFullYear() - birth.getFullYear();
  const m = now.getMonth() - birth.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < birth.getDate())) years -= 1;
  return years < 18;
}

function ConsentBanner() {
  const { user, token, language } = useAuth();
  const t = translations[language].consent;
  const [resent, setResent] = useState(false);
  const [busy, setBusy] = useState(false);

  if (!needsGuardianConsent(user)) return null;

  async function handleResend() {
    setBusy(true);
    try {
      const res = await apiFetch('/api/auth/resend-guardian-consent', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) setResent(true);
    } catch { /* ignore */ }
    setBusy(false);
  }

  return (
    <div className="bg-amber-950/30 border border-amber-700/40 rounded-2xl px-4 py-3 mb-4">
      <div className="flex items-start gap-2.5">
        <ShieldAlert size={18} className="text-amber-400 shrink-0 mt-0.5" />
        <div className="min-w-0">
          <p className="text-sm font-semibold text-amber-400">{t.pendingTitle}</p>
          <p className="text-xs text-slt mt-1 leading-relaxed">{t.pendingBody}</p>
          <button
            onClick={handleResend}
            disabled={busy || resent}
            className="text-xs font-semibold text-amber-400 underline mt-2 disabled:opacity-60"
          >
            {resent ? t.resent : t.resend}
          </button>
        </div>
      </div>
    </div>
  );
}

export default ConsentBanner;
