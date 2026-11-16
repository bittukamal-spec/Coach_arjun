import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { translations } from '../i18n/translations';
import { apiFetch } from '../api';
import { ArjunLogo } from '../components/ArjunLogo';

// Shared field recipe for this page: light surface, cool-grey outline, 48px
// tall so every control clears the 44px touch target on a phone.
const INPUT =
  'w-full min-h-[52px] rounded-2xl bg-dark-400 px-4 text-[15px] text-ink placeholder:text-slt focus:outline-none focus:ring-2 focus:ring-brand-500 transition-colors';

function AuthPage() {
  const { language, loginWithUser } = useAuth();
  const t = translations[language];
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const [tab, setTab]           = useState(searchParams.get('tab') === 'signin' ? 'signin' : 'signup');
  const [name, setName]         = useState('');
  const [email, setEmail]       = useState('');
  const [password, setPassword] = useState('');
  const [dob, setDob]           = useState('');
  const [guardianEmail, setGuardianEmail] = useState('');
  const [error, setError]       = useState('');
  const [busy, setBusy]         = useState(false);

  function ageFromDob(dobStr) {
    if (!dobStr) return null;
    const birth = new Date(dobStr);
    if (isNaN(birth.getTime())) return null;
    const now = new Date();
    let years = now.getFullYear() - birth.getFullYear();
    const m = now.getMonth() - birth.getMonth();
    if (m < 0 || (m === 0 && now.getDate() < birth.getDate())) years -= 1;
    return years;
  }

  const signupAge = tab === 'signup' ? ageFromDob(dob) : null;
  const isUnderage = signupAge !== null && signupAge < 13;
  const needsGuardian = signupAge !== null && signupAge >= 13 && signupAge < 18;

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    if (tab === 'signup' && isUnderage) {
      setError(t.auth.underageError);
      return;
    }
    setBusy(true);

    const endpoint = tab === 'signup' ? '/api/auth/register' : '/api/auth/login';
    const body = tab === 'signup'
      ? {
          name: name.trim(), email: email.trim(), password, dateOfBirth: dob,
          ...(needsGuardian && { guardianEmail: guardianEmail.trim() }),
        }
      : { email: email.trim(), password };

    try {
      const res  = await apiFetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || t.auth.authError); return; }
      loginWithUser(data.token, data.user);
      navigate(data.user.onboardingDone ? '/dashboard' : '/onboarding', { replace: true });
    } catch {
      setError(t.auth.authError);
    } finally {
      setBusy(false);
    }
  }

  // Visual layer only. Every field, validation rule, endpoint, guardian/minor
  // branch and redirect above is untouched — this page now simply wears the
  // same light system as the public homepage instead of the old dark shell,
  // so a visitor arriving from the landing page doesn't cross a theme wall.
  // Colours are hard-coded to this page (as on the homepage) so an OS dark
  // preference cannot flip a public screen.
  return (
    <div className="flex min-h-screen flex-col bg-dark-900 text-ink">

      {/* Header */}
      <header className="mx-auto flex w-full max-w-md items-center justify-center px-5 pt-7 pb-3">
        <button onClick={() => navigate('/')} aria-label="Arjun home" className="flex items-center rounded-2xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2">
          <ArjunLogo size={56} />
        </button>
      </header>

      {/* Form */}
      <div className="flex flex-1 items-start justify-center px-5 pb-10 sm:items-center">
        <div className="w-full max-w-md">

          <div className="mb-5 text-center">
            <h1 className="text-[26px] font-extrabold leading-tight tracking-[-0.02em]">
              {tab === 'signup' ? t.auth.signupHeading : t.auth.signinHeading}
            </h1>
            <p className="mt-1.5 text-[14px] text-slt">
              {tab === 'signup' ? t.auth.signupSub : t.auth.signinSub}
            </p>
          </div>

          <div className="relative">
            <div className="relative">

              {/* Tabs */}
              <div className="mb-5 flex rounded-2xl bg-dark-400 p-1">
                {['signup', 'signin'].map(id => (
                  <button
                    key={id}
                    type="button"
                    onClick={() => { setTab(id); setError(''); }}
                    className={`min-h-[44px] flex-1 rounded-xl text-[14px] font-bold transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 ${
                      tab === id ? 'bg-brand-500 text-white' : 'text-slt hover:text-ink'
                    }`}
                  >
                    {id === 'signin' ? t.auth.tabSignIn : t.auth.tabSignUp}
                  </button>
                ))}
              </div>

              <form onSubmit={handleSubmit} className="space-y-4">
                {tab === 'signup' && (
                  <div>
                    <label className="mb-1.5 block text-[12.5px] font-bold text-slt">{t.auth.nameLabel}</label>
                    <input
                      type="text" value={name} onChange={e => setName(e.target.value)}
                      placeholder={t.auth.namePlaceholder} required autoComplete="name"
                      className={INPUT}
                    />
                  </div>
                )}
                {tab === 'signup' && (
                  <div>
                    <label className="mb-1.5 block text-[12.5px] font-bold text-slt">{t.auth.dobLabel}</label>
                    <input
                      type="date" value={dob} onChange={e => setDob(e.target.value)}
                      required autoComplete="bday"
                      max={new Date().toISOString().slice(0, 10)}
                      className={INPUT}
                    />
                    {isUnderage
                      ? <p className="mt-1.5 text-[12.5px] font-semibold text-[#B4443C]">{t.auth.underageError}</p>
                      : <p className="mt-1.5 text-[12.5px] text-slt">{t.auth.dobHint}</p>}
                  </div>
                )}
                {tab === 'signup' && needsGuardian && (
                  <div>
                    <label className="mb-1.5 block text-[12.5px] font-bold text-slt">{t.auth.guardianEmailLabel}</label>
                    <input
                      type="email" value={guardianEmail} onChange={e => setGuardianEmail(e.target.value)}
                      placeholder={t.auth.guardianEmailPlaceholder} required
                      className={INPUT}
                    />
                    <p className="mt-1.5 text-[12.5px] leading-snug text-slt">{t.auth.guardianEmailHint}</p>
                  </div>
                )}
                <div>
                  <label className="mb-1.5 block text-[12.5px] font-bold text-slt">{t.auth.emailLabel}</label>
                  <input
                    type="email" value={email} onChange={e => setEmail(e.target.value)}
                    placeholder={t.auth.emailPlaceholder} required autoComplete="email"
                    className={INPUT}
                  />
                </div>
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="block text-[12.5px] font-bold text-slt">{t.auth.passwordLabel}</label>
                    {tab === 'signin' && (
                      <button type="button" onClick={() => navigate('/forgot-password')}
                        className="text-[12.5px] font-semibold text-brand-500 hover:underline">
                        {t.auth.forgotPassword}
                      </button>
                    )}
                  </div>
                  <input
                    type="password" value={password} onChange={e => setPassword(e.target.value)}
                    placeholder={t.auth.passwordPlaceholder} required
                    autoComplete={tab === 'signup' ? 'new-password' : 'current-password'}
                    className={INPUT}
                  />
                </div>

                {error && (
                  <p className="rounded-xl border border-[#F3C7C3] bg-[#FDF3F2] px-3 py-2.5 text-[13px] font-semibold text-[#B4443C]">
                    {error}
                  </p>
                )}

                <button
                  type="submit"
                  disabled={busy || (tab === 'signup' && isUnderage)}
                  className="inline-flex min-h-[56px] w-full items-center justify-center rounded-[18px] bg-sun text-[16px] font-extrabold text-inkblock transition-transform active:scale-[0.98] disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2"
                >
                  {busy
                    ? (tab === 'signup' ? t.auth.signingUp : t.auth.signingIn)
                    : (tab === 'signup' ? t.auth.signUpBtn : t.auth.signInBtn)}
                </button>
              </form>

              {tab === 'signup' && (
                <div className="mt-4 rounded-2xl bg-dark-400 px-4 py-3">
                  <p className="text-[12.5px] leading-relaxed text-slt">{t.auth.aiDisclosure}</p>
                  <p className="mt-2 text-[12.5px] leading-relaxed text-slt">{t.auth.aiDisclosureSafety}</p>
                </div>
              )}

              {tab === 'signup' && (
                <p className="mt-4 text-center text-[12px] leading-relaxed text-slt">
                  By signing up you agree to our{' '}
                  <button onClick={() => navigate('/terms')} className="underline hover:text-ink">Terms</button>
                  {' '}and{' '}
                  <button onClick={() => navigate('/privacy')} className="underline hover:text-ink">Privacy Policy</button>
                </p>
              )}
            </div>
          </div>

          <p className="mt-6 text-center text-[14px] text-slt">
            {tab === 'signup' ? t.auth.haveAccount : t.auth.noAccount}{' '}
            <button
              onClick={() => { setTab(tab === 'signup' ? 'signin' : 'signup'); setError(''); }}
              className="min-h-[44px] font-bold text-brand-500 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2 rounded-lg"
            >
              {tab === 'signup' ? t.auth.tabSignIn : t.auth.signUpBtn}
            </button>
          </p>

          {/* Secondary support link — same for both tabs, visually quiet so
              it never competes with the primary sign-in/sign-up action. */}
          <p className="mt-3 text-center text-[13px] text-slt">
            {t.auth.needHelp}{' '}
            <button
              type="button"
              onClick={() => navigate('/contact')}
              className="min-h-[44px] font-semibold text-slt hover:text-ink hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2 rounded-lg"
            >
              {t.auth.contactSupport}
            </button>
          </p>
        </div>
      </div>
    </div>
  );
}

export default AuthPage;
