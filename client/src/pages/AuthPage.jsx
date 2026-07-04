import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { translations } from '../i18n/translations';
import { apiFetch } from '../api';

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

  return (
    <div className="min-h-screen bg-dark-900 flex flex-col">

      {/* Header */}
      <header className="px-4 py-5 flex items-center gap-2.5">
        <button onClick={() => navigate('/')} className="flex items-center gap-2.5 group">
          <div className="w-8 h-8 rounded-lg bg-brand-500 flex items-center justify-center shadow-lg shadow-brand-500/40">
            <span className="text-white font-bold text-sm">A</span>
          </div>
          <span className="font-bold text-ink text-lg tracking-tight">Arjun</span>
        </button>
      </header>

      {/* Form */}
      <div className="flex-1 flex items-center justify-center px-4 py-8">
        <div className="w-full max-w-sm">

          <div className="text-center mb-8">
            <h1 className="text-2xl font-bold text-ink mb-1">
              {tab === 'signup' ? 'Create your account' : 'Welcome back'}
            </h1>
            <p className="text-sm text-slt">
              {tab === 'signup' ? '14 days free — no card needed' : 'Sign in to continue with Arjun'}
            </p>
          </div>

          {/* Glow */}
          <div className="relative">
            <div className="absolute -inset-4 bg-brand-500/10 rounded-3xl blur-2xl pointer-events-none" />
            <div className="relative bg-dark-800 rounded-2xl border border-dark-600 shadow-2xl p-6">

              {/* Tabs */}
              <div className="flex mb-5 bg-dark-700 rounded-xl p-1">
                {['signup', 'signin'].map(id => (
                  <button
                    key={id}
                    type="button"
                    onClick={() => { setTab(id); setError(''); }}
                    className={`flex-1 text-sm font-semibold py-2 rounded-lg transition-all ${
                      tab === id ? 'bg-brand-500 text-white shadow-sm' : 'text-slt hover:text-ink'
                    }`}
                  >
                    {id === 'signin' ? t.auth.tabSignIn : t.auth.tabSignUp}
                  </button>
                ))}
              </div>

              <form onSubmit={handleSubmit} className="space-y-4">
                {tab === 'signup' && (
                  <div>
                    <label className="block text-xs font-semibold text-slt mb-1.5">{t.auth.nameLabel}</label>
                    <input
                      type="text" value={name} onChange={e => setName(e.target.value)}
                      placeholder={t.auth.namePlaceholder} required autoComplete="name"
                      className="input-field text-sm"
                    />
                  </div>
                )}
                {tab === 'signup' && (
                  <div>
                    <label className="block text-xs font-semibold text-slt mb-1.5">{t.auth.dobLabel}</label>
                    <input
                      type="date" value={dob} onChange={e => setDob(e.target.value)}
                      required autoComplete="bday"
                      max={new Date().toISOString().slice(0, 10)}
                      className="input-field text-sm"
                    />
                    {isUnderage
                      ? <p className="text-xs text-red-400 mt-1.5">{t.auth.underageError}</p>
                      : <p className="text-xs text-muted mt-1.5">{t.auth.dobHint}</p>}
                  </div>
                )}
                {tab === 'signup' && needsGuardian && (
                  <div>
                    <label className="block text-xs font-semibold text-slt mb-1.5">{t.auth.guardianEmailLabel}</label>
                    <input
                      type="email" value={guardianEmail} onChange={e => setGuardianEmail(e.target.value)}
                      placeholder={t.auth.guardianEmailPlaceholder} required
                      className="input-field text-sm"
                    />
                    <p className="text-xs text-muted mt-1.5">{t.auth.guardianEmailHint}</p>
                  </div>
                )}
                <div>
                  <label className="block text-xs font-semibold text-slt mb-1.5">{t.auth.emailLabel}</label>
                  <input
                    type="email" value={email} onChange={e => setEmail(e.target.value)}
                    placeholder={t.auth.emailPlaceholder} required autoComplete="email"
                    className="input-field text-sm"
                  />
                </div>
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="block text-xs font-semibold text-slt">{t.auth.passwordLabel}</label>
                    {tab === 'signin' && (
                      <button type="button" onClick={() => navigate('/forgot-password')}
                        className="text-xs text-brand-400 hover:text-brand-300 font-medium">
                        Forgot password?
                      </button>
                    )}
                  </div>
                  <input
                    type="password" value={password} onChange={e => setPassword(e.target.value)}
                    placeholder={t.auth.passwordPlaceholder} required
                    autoComplete={tab === 'signup' ? 'new-password' : 'current-password'}
                    className="input-field text-sm"
                  />
                </div>

                {error && (
                  <p className="text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">
                    {error}
                  </p>
                )}

                <button type="submit" disabled={busy || (tab === 'signup' && isUnderage)} className="btn-primary w-full justify-center py-3 text-sm disabled:opacity-50">
                  {busy
                    ? (tab === 'signup' ? t.auth.signingUp : t.auth.signingIn)
                    : (tab === 'signup' ? t.auth.signUpBtn : t.auth.signInBtn)}
                </button>
              </form>

              {tab === 'signup' && (
                <p className="text-center text-xs text-slt mt-4">
                  By signing up you agree to our{' '}
                  <button onClick={() => navigate('/terms')} className="underline hover:text-slt transition-colors">Terms</button>
                  {' '}and{' '}
                  <button onClick={() => navigate('/privacy')} className="underline hover:text-slt transition-colors">Privacy Policy</button>
                </p>
              )}
            </div>
          </div>

          <p className="text-center text-sm text-slt mt-6">
            {tab === 'signup' ? 'Already have an account? ' : "Don't have an account? "}
            <button
              onClick={() => { setTab(tab === 'signup' ? 'signin' : 'signup'); setError(''); }}
              className="text-brand-400 font-semibold hover:text-brand-300"
            >
              {tab === 'signup' ? 'Sign in' : 'Create one free'}
            </button>
          </p>
        </div>
      </div>
    </div>
  );
}

export default AuthPage;
