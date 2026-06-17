import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { translations } from '../i18n/translations';
import { apiFetch } from '../api';

const FEATURES = [
  { icon: '🤖', key: 'feature1', accent: 'brand' },
  { icon: '📊', key: 'feature2', accent: 'win'   },
  { icon: '📈', key: 'feature3', accent: 'fire'  },
];

const SPORTS = ['🏏', '⚽', '🏸', '🏃', '🤼', '🥊', '🏑', '🎾', '🏊'];

function LandingPage() {
  const { language, toggleLanguage, loginWithUser } = useAuth();
  const t = translations[language];
  const navigate = useNavigate();

  const [tab, setTab]           = useState('signin');
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

      if (!res.ok) {
        setError(data.error || t.auth.authError);
        return;
      }

      loginWithUser(data.token, data.user);
      navigate(data.user.onboardingDone ? '/dashboard' : '/onboarding', { replace: true });
    } catch {
      setError(t.auth.authError);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-screen bg-dark-900">
      {/* Top bar */}
      <header className="max-w-5xl mx-auto px-4 py-5 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-brand-500 flex items-center justify-center shadow-lg">
            <span className="text-white font-bold text-sm">A</span>
          </div>
          <span className="font-bold text-white text-lg tracking-tight">Arjun</span>
        </div>
        <button
          onClick={toggleLanguage}
          className="text-sm font-medium text-slate-400 hover:text-brand-400 transition-colors px-3 py-1.5 rounded-lg hover:bg-dark-700 border border-dark-600"
        >
          {language === 'en' ? 'हिंदी' : 'English'}
        </button>
      </header>

      {/* Hero + Auth */}
      <main className="max-w-5xl mx-auto px-4">
        <section className="pt-10 pb-16 animate-fade-in flex flex-col lg:flex-row items-center gap-12">

          {/* Left: copy */}
          <div className="flex-1 text-center lg:text-left">
            {/* Sport icons strip */}
            <div className="flex items-center gap-1.5 justify-center lg:justify-start mb-5 flex-wrap">
              {SPORTS.map((s, i) => (
                <span key={i} className="text-xl opacity-70">{s}</span>
              ))}
            </div>

            <div className="inline-flex items-center gap-2 bg-brand-500/15 text-brand-400 text-xs font-semibold px-3 py-1.5 rounded-full mb-5 border border-brand-500/25">
              <span>✨</span>
              <span>AI-powered · Bilingual · Built for India</span>
            </div>

            <h1 className="text-4xl sm:text-5xl font-bold leading-tight mb-5">
              <span className="bg-gradient-to-r from-brand-400 to-brand-200 bg-clip-text text-transparent">
                {t.landing.tagline}
              </span>
            </h1>

            <p className="text-lg text-slate-400 max-w-xl leading-relaxed mb-6">
              {t.landing.subtitle}
            </p>

            {/* Arjun intro */}
            <div className="inline-flex items-center gap-3 bg-dark-800 border border-dark-600 rounded-2xl px-4 py-3">
              <div className="w-10 h-10 rounded-full bg-gradient-to-br from-brand-500 to-brand-700 flex items-center justify-center text-white font-bold text-sm flex-shrink-0">
                A
              </div>
              <div className="text-left">
                <p className="text-white text-sm font-semibold">Arjun</p>
                <p className="text-slate-500 text-xs">
                  {language === 'hi' ? 'आपका AI मानसिक प्रदर्शन कोच' : 'Your AI mental performance coach'}
                </p>
              </div>
            </div>
          </div>

          {/* Right: auth card */}
          <div className="w-full max-w-sm shrink-0">
            <div className="bg-dark-800 rounded-2xl border border-dark-600 shadow-2xl p-6">
              {/* Tabs */}
              <div className="flex mb-6 bg-dark-700 rounded-xl p-1">
                {['signin', 'signup'].map(id => (
                  <button
                    key={id}
                    type="button"
                    onClick={() => { setTab(id); setError(''); }}
                    className={`flex-1 text-sm font-semibold py-2 rounded-lg transition-all ${
                      tab === id
                        ? 'bg-brand-500 text-white shadow-sm'
                        : 'text-slate-500 hover:text-slate-300'
                    }`}
                  >
                    {id === 'signin' ? t.auth.tabSignIn : t.auth.tabSignUp}
                  </button>
                ))}
              </div>

              <form onSubmit={handleSubmit} className="space-y-4">
                {tab === 'signup' && (
                  <div>
                    <label className="block text-xs font-semibold text-slate-400 mb-1.5">
                      {t.auth.nameLabel}
                    </label>
                    <input
                      type="text"
                      value={name}
                      onChange={e => setName(e.target.value)}
                      placeholder={t.auth.namePlaceholder}
                      required
                      autoComplete="name"
                      className="input-field text-sm"
                    />
                  </div>
                )}

                <div>
                  <label className="block text-xs font-semibold text-slate-400 mb-1.5">
                    {t.auth.emailLabel}
                  </label>
                  <input
                    type="email"
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    placeholder={t.auth.emailPlaceholder}
                    required
                    autoComplete="email"
                    className="input-field text-sm"
                  />
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="block text-xs font-semibold text-slate-400">
                      {t.auth.passwordLabel}
                    </label>
                    {tab === 'signin' && (
                      <button
                        type="button"
                        onClick={() => navigate('/forgot-password')}
                        className="text-xs text-brand-400 hover:text-brand-300 font-medium transition-colors"
                      >
                        Forgot password?
                      </button>
                    )}
                  </div>
                  <input
                    type="password"
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    placeholder={t.auth.passwordPlaceholder}
                    required
                    autoComplete={tab === 'signup' ? 'new-password' : 'current-password'}
                    className="input-field text-sm"
                  />
                </div>

                {error && (
                  <p className="text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">
                    {error}
                  </p>
                )}

                <button
                  type="submit"
                  disabled={busy}
                  className="btn-primary w-full justify-center py-3 text-sm"
                >
                  {busy
                    ? (tab === 'signup' ? t.auth.signingUp : t.auth.signingIn)
                    : (tab === 'signup' ? t.auth.signUpBtn : t.auth.signInBtn)}
                </button>
              </form>

              <p className="text-center text-xs text-slate-600 mt-4">
                {language === 'hi' ? '14 दिन मुफ्त · क्रेडिट कार्ड जरूरी नहीं' : 'Free 14-day trial · No credit card needed'}
              </p>
            </div>
          </div>
        </section>

        {/* Features */}
        <section className="grid sm:grid-cols-3 gap-5 pb-20">
          {FEATURES.map(({ icon, key, accent }) => {
            const accentClasses = {
              brand: 'border-brand-600/40',
              win:   'border-win-600/40',
              fire:  'border-fire-600/40',
            };
            return (
              <div key={key} className={`card card-glow border ${accentClasses[accent]}`}>
                <div className="text-3xl mb-4">{icon}</div>
                <h3 className="font-semibold text-white mb-2">
                  {t.landing[`${key}Title`]}
                </h3>
                <p className="text-sm text-slate-500 leading-relaxed">
                  {t.landing[`${key}Desc`]}
                </p>
              </div>
            );
          })}
        </section>

        {/* Pricing */}
        <section className="pb-24 max-w-2xl mx-auto">
          <h2 className="text-2xl font-bold text-center text-white mb-8">Simple pricing</h2>
          <div className="grid sm:grid-cols-3 gap-4">
            <div className="card border-dark-500">
              <p className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-2">
                {t.landing.free}
              </p>
              <p className="text-3xl font-bold text-white mb-1">₹0</p>
              <p className="text-sm text-slate-500">{t.landing.freeDesc}</p>
            </div>
            <div className="card border-brand-500/60 relative overflow-hidden">
              <div className="absolute top-3 right-3 bg-brand-500 text-white text-xs font-bold px-2 py-0.5 rounded-full">
                POPULAR
              </div>
              <p className="text-xs font-bold text-brand-400 uppercase tracking-wide mb-2">Premium</p>
              <p className="text-3xl font-bold text-white mb-1">{t.landing.premium}</p>
              <p className="text-sm text-slate-500">{t.landing.premiumDesc}</p>
            </div>
            <div className="card border-fire-600/40">
              <p className="text-xs font-bold text-fire-400 uppercase tracking-wide mb-2">Annual</p>
              <p className="text-3xl font-bold text-white mb-1">{t.landing.premiumAnnual}</p>
              <p className="text-sm text-slate-500">{t.landing.premiumAnnualDesc}</p>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-dark-700 py-6 text-center text-xs text-slate-600">
        © {new Date().getFullYear()} Arjun · Made with ❤️ for Indian Athletes
      </footer>
    </div>
  );
}

export default LandingPage;
