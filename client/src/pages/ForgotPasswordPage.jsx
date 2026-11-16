import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { KeyRound } from 'lucide-react';
import { apiFetch } from '../api';
import { useAuth } from '../contexts/AuthContext';
import { translations } from '../i18n/translations';
import { HelpPageShell, HELP_INPUT, HELP_LABEL, HELP_MAIN_BTN, HELP_LINK, HELP_ERROR } from '../components/site/HelpPageShell';

// Forgot password (Playbook redesign, Nov 2026): one email box, then a calm
// mint "check your email" screen. The request itself is unchanged.
function ForgotPasswordPage() {
  const navigate = useNavigate();
  const { language } = useAuth();
  const t = translations[language]?.passwordHelp || translations.en.passwordHelp;
  const [email, setEmail]     = useState('');
  const [busy, setBusy]       = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError]     = useState('');

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setBusy(true);

    try {
      const res = await apiFetch('/api/auth/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim() }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || t.generic);
        return;
      }

      setSuccess(true);
    } catch {
      setError(t.generic);
    } finally {
      setBusy(false);
    }
  }

  if (success) {
    return (
      <HelpPageShell tone="mint" backTo={null}>
        <div className="flex flex-1 flex-col items-center justify-center gap-3 text-center" role="status">
          <svg aria-hidden="true" width="120" height="100" viewBox="0 0 120 100">
            <circle cx="60" cy="54" r="44" fill="#7FE3C4" />
            <rect x="26" y="30" width="68" height="46" rx="8" fill="#FFFFFF" />
            <path d="M28 34l32 22 32-22" fill="none" stroke="#1B4DFF" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
            <circle cx="92" cy="28" r="12" fill="#FFC629" />
            <path d="M87 28l3.5 3.5L97 25" fill="none" stroke="#101533" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <h1 className="text-[24px] font-extrabold leading-tight tracking-[-0.02em]">{t.sentTitle}</h1>
          <p className="text-[15px] leading-relaxed text-[#1C3B33]">{t.sentBody(email.trim())}</p>
        </div>
        <button type="button" onClick={() => navigate('/auth?tab=signin')} className={HELP_MAIN_BTN}>{t.back}</button>
        <button type="button" onClick={() => setSuccess(false)} className={`${HELP_LINK} text-inkblock`}>{t.sendAgain}</button>
      </HelpPageShell>
    );
  }

  return (
    <HelpPageShell backLabel={t.back}>
      <div className="mt-5 flex flex-col items-center gap-2.5 text-center">
        <span className="flex h-16 w-16 items-center justify-center rounded-[20px] bg-sky text-inkblock" aria-hidden="true">
          <KeyRound size={30} strokeWidth={2} />
        </span>
        <h1 className="mt-1 text-[24px] font-extrabold leading-tight tracking-[-0.02em]">{t.forgotTitle}</h1>
        <p className="text-[15px] leading-relaxed text-slt">{t.forgotSub}</p>
      </div>

      <form onSubmit={handleSubmit} className="mt-6 space-y-4">
        <div>
          <label htmlFor="forgot-email" className={HELP_LABEL}>{t.emailLabel}</label>
          <input
            id="forgot-email"
            type="email"
            value={email}
            onChange={e => setEmail(e.target.value)}
            placeholder={t.emailPlaceholder}
            required
            autoComplete="email"
            className={HELP_INPUT}
          />
        </div>
        {error && <p role="alert" className={HELP_ERROR}>{error}</p>}
        <button type="submit" disabled={busy} className={HELP_MAIN_BTN}>{busy ? t.sending : t.sendLink}</button>
      </form>
      <button type="button" onClick={() => navigate('/auth?tab=signin')} className={HELP_LINK}>{t.back}</button>
    </HelpPageShell>
  );
}

export default ForgotPasswordPage;
