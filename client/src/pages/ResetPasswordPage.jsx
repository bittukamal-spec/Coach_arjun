import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { CheckCircle2, Link2Off } from 'lucide-react';
import { apiFetch } from '../api';
import { useAuth } from '../contexts/AuthContext';
import { translations } from '../i18n/translations';
import { ArjunLogo } from '../components/ArjunLogo';
import { HelpPageShell, HELP_INPUT, HELP_LABEL, HELP_MAIN_BTN, HELP_LINK, HELP_ERROR } from '../components/site/HelpPageShell';

// Reset password (Playbook redesign, Nov 2026). Same token check, same
// validation (match + 8 characters) and the same request as before.
function ResetPasswordPage() {
  const navigate = useNavigate();
  const { language } = useAuth();
  const t = translations[language]?.passwordHelp || translations.en.passwordHelp;
  const token = new URLSearchParams(window.location.search).get('token');

  const [password, setPassword]         = useState('');
  const [confirmPassword, setConfirm]   = useState('');
  const [busy, setBusy]                 = useState(false);
  const [success, setSuccess]           = useState(false);
  const [error, setError]               = useState('');

  if (!token) {
    return (
      <HelpPageShell backLabel={t.back}>
        <div className="mt-10 flex flex-col items-center gap-2.5 text-center">
          <span className="flex h-16 w-16 items-center justify-center rounded-[20px] bg-coral text-inkblock" aria-hidden="true">
            <Link2Off size={30} strokeWidth={2} />
          </span>
          <h1 className="mt-1 text-[24px] font-extrabold leading-tight tracking-[-0.02em]">{t.badLinkTitle}</h1>
          <p className="text-[15px] leading-relaxed text-slt">{t.badLinkBody}</p>
        </div>
        <button type="button" onClick={() => navigate('/forgot-password')} className={`mt-6 ${HELP_MAIN_BTN}`}>{t.newLink}</button>
        <button type="button" onClick={() => navigate('/auth?tab=signin')} className={HELP_LINK}>{t.back}</button>
      </HelpPageShell>
    );
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');

    if (password !== confirmPassword) {
      setError(t.mismatch);
      return;
    }
    if (password.length < 8) {
      setError(t.tooShort);
      return;
    }

    setBusy(true);
    try {
      const res = await apiFetch('/api/auth/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, password }),
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
          <span className="flex h-16 w-16 items-center justify-center rounded-[20px] bg-mint" aria-hidden="true">
            <CheckCircle2 size={30} strokeWidth={2.2} />
          </span>
          <h1 className="text-[24px] font-extrabold leading-tight tracking-[-0.02em]">{t.doneTitle}</h1>
          <p className="text-[15px] leading-relaxed text-[#1C3B33]">{t.doneBody}</p>
        </div>
        <button type="button" onClick={() => navigate('/auth?tab=signin')} className={HELP_MAIN_BTN}>{t.signInNow}</button>
      </HelpPageShell>
    );
  }

  return (
    <HelpPageShell backLabel={t.back}>
      <div className="mt-5 flex flex-col items-center gap-2.5 text-center">
        <ArjunLogo size={56} />
        <h1 className="mt-1 text-[24px] font-extrabold leading-tight tracking-[-0.02em]">{t.resetTitle}</h1>
        <p className="text-[15px] leading-relaxed text-slt">{t.resetSub}</p>
      </div>

      <form onSubmit={handleSubmit} className="mt-6 space-y-3">
        <div>
          <label htmlFor="reset-password" className={HELP_LABEL}>{t.newLabel}</label>
          <input id="reset-password" type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder={t.newPlaceholder} required autoComplete="new-password" className={HELP_INPUT} />
        </div>
        <div>
          <label htmlFor="reset-confirm" className={HELP_LABEL}>{t.confirmLabel}</label>
          <input id="reset-confirm" type="password" value={confirmPassword} onChange={e => setConfirm(e.target.value)} placeholder={t.confirmPlaceholder} required autoComplete="new-password" className={HELP_INPUT} />
        </div>
        {error && <p role="alert" className={HELP_ERROR}>{error}</p>}
        <div className="pt-1">
          <button type="submit" disabled={busy} className={HELP_MAIN_BTN}>{busy ? t.saving : t.save}</button>
        </div>
      </form>
      <button type="button" onClick={() => navigate('/auth?tab=signin')} className={HELP_LINK}>{t.back}</button>
    </HelpPageShell>
  );
}

export default ResetPasswordPage;
