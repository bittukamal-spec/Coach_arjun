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
  const [error, setError]       = useState('');
  const [busy, setBusy]         = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setBusy(true);

    const endpoint = tab === 'signup' ? '/api/auth/register' : '/api/auth/login';
    const body = tab === 'signup'
      ? { name: name.trim(), email: email.trim(), password }
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
          <span className="font-bold text-white text-lg tracking-tight">Arjun</span>
        </button>
      </header>

      {/* Form */}
      <div className="flex-1 flex items-center justify-center px-4 py-8">
        <div className="w-full max-w-sm">

          <div className="text-center mb-8">
            <h1 className="text-2xl font-bold text-white mb-1">
              {tab === 'signup' ? 'Create your account' : 'Welcome back'}
            </h1>
            <p className="text-sm text-slate-500">
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
                      tab === id ? 'bg-brand-500 text-white shadow-sm' : 'text-slate-500 hover:text-slate-300'
                    }`}
                  >
                    {id === 'signin' ? t.auth.tabSignIn : t.auth.tabSignUp}
                  </button>
                ))}
              </div>

              <form onSubmit={handleSubmit} className="space-y-4">
                {tab === 'signup' && (
                  <div>
                    <label className="block text-xs font-semibold text-slate-400 mb-1.5">{t.auth.nameLabel}</label>
                    <input
                      type="text" value={name} onChange={e => setName(e.target.value)}
                      placeholder={t.auth.namePlaceholder} required autoComplete="name"
                      className="input-field text-sm"
                    />
                  </div>
                )}
                <div>
                  <label className="block text-xs font-semibold text-slate-400 mb-1.5">{t.auth.emailLabel}</label>
                  <input
                    type="email" value={email} onChange={e => setEmail(e.target.value)}
                    placeholder={t.auth.emailPlaceholder} required autoComplete="email"
                    className="input-field text-sm"
                  />
                </div>
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="block text-xs font-semibold text-slate-400">{t.auth.passwordLabel}</label>
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

                <button type="submit" disabled={busy} className="btn-primary w-full justify-center py-3 text-sm">
                  {busy
                    ? (tab === 'signup' ? t.auth.signingUp : t.auth.signingIn)
                    : (tab === 'signup' ? t.auth.signUpBtn : t.auth.signInBtn)}
                </button>
              </form>

              {tab === 'signup' && (
                <p className="text-center text-xs text-slate-600 mt-4">
                  By signing up you agree to our terms
                </p>
              )}
            </div>
          </div>

          <p className="text-center text-sm text-slate-500 mt-6">
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
