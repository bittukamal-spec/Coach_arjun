import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { translations } from '../i18n/translations';
import { apiFetch } from '../api';
import { ArjunWordmark } from '../components/ArjunLogo';

// Shared field recipe for this page: light surface, cool-grey outline, 48px
// tall so every control clears the 44px touch target on a phone.
const INPUT =
  'w-full min-h-[48px] rounded-xl border border-[#D9E1EC] bg-white px-3.5 text-[15px] text-[#0F172A] placeholder-[#9AA7B8] focus:border-[#185FA5] focus:outline-none focus:ring-2 focus:ring-[#185FA5]/25 transition-colors';

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
    <div className="flex min-h-screen flex-col bg-[#FAFBFD] text-[#0F172A]">

      {/* Header */}
      <header className="mx-auto flex w-full max-w-md items-center px-5 py-5">
        <button onClick={() => navigate('/')} className="flex items-center rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#185FA5] focus-visible:ring-offset-2">
          <ArjunWordmark size="hero" />
        </button>
      </header>

      {/* Form */}
      <div className="flex flex-1 items-start justify-center px-5 pb-10 sm:items-center">
        <div className="w-full max-w-md">

          <div className="mb-6">
            <h1 className="text-[28px] font-black leading-tight tracking-tight">
              {tab === 'signup' ? t.auth.signupHeading : t.auth.signinHeading}
            </h1>
            <p className="mt-1.5 text-[14.5px] text-[#5A6B80]">
              {tab === 'signup' ? t.auth.signupSub : t.auth.signinSub}
            </p>
          </div>

          <div className="relative">
            <div className="relative rounded-3xl border border-[#E4E9F2] bg-white p-5 shadow-[0_6px_24px_rgba(15,23,42,0.07)] sm:p-6">

              {/* Tabs */}
              <div className="mb-5 flex rounded-2xl bg-[#F3F6FB] p-1">
                {['signup', 'signin'].map(id => (
                  <button
                    key={id}
                    type="button"
                    onClick={() => { setTab(id); setError(''); }}
                    className={`min-h-[44px] flex-1 rounded-xl text-[14px] font-bold transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#185FA5] ${
                      tab === id ? 'bg-[#185FA5] text-white shadow-sm' : 'text-[#5A6B80] hover:text-[#0F172A]'
                    }`}
                  >
                    {id === 'signin' ? t.auth.tabSignIn : t.auth.tabSignUp}
                  </button>
                ))}
              </div>

              <form onSubmit={handleSubmit} className="space-y-4">
                {tab === 'signup' && (
                  <div>
                    <label className="mb-1.5 block text-[12.5px] font-bold text-[#5A6B80]">{t.auth.nameLabel}</label>
                    <input
                      type="text" value={name} onChange={e => setName(e.target.value)}
                      placeholder={t.auth.namePlaceholder} required autoComplete="name"
                      className={INPUT}
                    />
                  </div>
                )}
                {tab === 'signup' && (
                  <div>
                    <label className="mb-1.5 block text-[12.5px] font-bold text-[#5A6B80]">{t.auth.dobLabel}</label>
                    <input
                      type="date" value={dob} onChange={e => setDob(e.target.value)}
                      required autoComplete="bday"
                      max={new Date().toISOString().slice(0, 10)}
                      className={INPUT}
                    />
                    {isUnderage
                      ? <p className="mt-1.5 text-[12.5px] font-semibold text-[#B4443C]">{t.auth.underageError}</p>
                      : <p className="mt-1.5 text-[12.5px] text-[#7B8A9C]">{t.auth.dobHint}</p>}
                  </div>
                )}
                {tab === 'signup' && needsGuardian && (
                  <div>
                    <label className="mb-1.5 block text-[12.5px] font-bold text-[#5A6B80]">{t.auth.guardianEmailLabel}</label>
                    <input
                      type="email" value={guardianEmail} onChange={e => setGuardianEmail(e.target.value)}
                      placeholder={t.auth.guardianEmailPlaceholder} required
                      className={INPUT}
                    />
                    <p className="mt-1.5 text-[12.5px] leading-snug text-[#7B8A9C]">{t.auth.guardianEmailHint}</p>
                  </div>
                )}
                <div>
                  <label className="mb-1.5 block text-[12.5px] font-bold text-[#5A6B80]">{t.auth.emailLabel}</label>
                  <input
                    type="email" value={email} onChange={e => setEmail(e.target.value)}
                    placeholder={t.auth.emailPlaceholder} required autoComplete="email"
                    className={INPUT}
                  />
                </div>
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="block text-[12.5px] font-bold text-[#5A6B80]">{t.auth.passwordLabel}</label>
                    {tab === 'signin' && (
                      <button type="button" onClick={() => navigate('/forgot-password')}
                        className="text-[12.5px] font-semibold text-[#185FA5] hover:underline">
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
                  className="inline-flex min-h-[54px] w-full items-center justify-center rounded-2xl bg-[#185FA5] text-[16px] font-bold text-white shadow-[0_6px_18px_rgba(24,95,165,0.25)] transition-transform active:scale-[0.98] disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#185FA5] focus-visible:ring-offset-2"
                >
                  {busy
                    ? (tab === 'signup' ? t.auth.signingUp : t.auth.signingIn)
                    : (tab === 'signup' ? t.auth.signUpBtn : t.auth.signInBtn)}
                </button>
              </form>

              {tab === 'signup' && (
                <div className="mt-4 rounded-2xl border border-[#D8E6F6] bg-[#F2F7FD] px-4 py-3">
                  <p className="text-[12.5px] leading-relaxed text-[#5A6B80]">{t.auth.aiDisclosure}</p>
                  <p className="mt-2 text-[12.5px] leading-relaxed text-[#5A6B80]">{t.auth.aiDisclosureSafety}</p>
                </div>
              )}

              {tab === 'signup' && (
                <p className="mt-4 text-center text-[12px] leading-relaxed text-[#7B8A9C]">
                  By signing up you agree to our{' '}
                  <button onClick={() => navigate('/terms')} className="underline hover:text-[#0F172A]">Terms</button>
                  {' '}and{' '}
                  <button onClick={() => navigate('/privacy')} className="underline hover:text-[#0F172A]">Privacy Policy</button>
                </p>
              )}
            </div>
          </div>

          <p className="mt-6 text-center text-[14px] text-[#5A6B80]">
            {tab === 'signup' ? t.auth.haveAccount : t.auth.noAccount}{' '}
            <button
              onClick={() => { setTab(tab === 'signup' ? 'signin' : 'signup'); setError(''); }}
              className="min-h-[44px] font-bold text-[#185FA5] hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#185FA5] focus-visible:ring-offset-2 rounded-lg"
            >
              {tab === 'signup' ? t.auth.tabSignIn : t.auth.signUpBtn}
            </button>
          </p>

          {/* Secondary support link — same for both tabs, visually quiet so
              it never competes with the primary sign-in/sign-up action. */}
          <p className="mt-3 text-center text-[13px] text-[#7B8A9C]">
            {t.auth.needHelp}{' '}
            <button
              type="button"
              onClick={() => navigate('/contact')}
              className="min-h-[44px] font-semibold text-[#5A6B80] hover:text-[#0F172A] hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#185FA5] focus-visible:ring-offset-2 rounded-lg"
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
