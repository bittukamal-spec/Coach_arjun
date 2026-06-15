import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { translations } from '../i18n/translations';
import { apiFetch } from '../api';

const FEATURES = [
  { icon: '🤖', key: 'feature1' },
  { icon: '📊', key: 'feature2' },
  { icon: '📈', key: 'feature3' },
];

function LandingPage() {
  const { language, toggleLanguage, loginWithUser } = useAuth();
  const t = translations[language];
  const navigate = useNavigate();

  const [tab, setTab]         = useState('signin'); // 'signin' | 'signup'
  const [name, setName]       = useState('');
  const [email, setEmail]     = useState('');
  const [password, setPassword] = useState('');
  const [error, setError]     = useState('');
  const [busy, setBusy]       = useState(false);

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
    <div className="min-h-screen bg-gradient-to-br from-brand-50 via-white to-calm-50">
      {/* Top bar */}
      <header className="max-w-5xl mx-auto px-4 py-5 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-2xl">🧠</span>
          <span className="font-bold text-gray-900 text-lg tracking-tight">MindGame</span>
        </div>
        <button
          onClick={toggleLanguage}
          className="text-sm font-medium text-gray-600 hover:text-brand-600 transition-colors px-3 py-1.5 rounded-lg hover:bg-brand-50 border border-gray-200"
        >
          {language === 'en' ? 'हिंदी' : 'English'}
        </button>
      </header>

      {/* Hero + Auth */}
      <main className="max-w-5xl mx-auto px-4">
        <section className="pt-12 pb-16 animate-fade-in flex flex-col lg:flex-row items-center gap-12">

          {/* Left: copy */}
          <div className="flex-1 text-center lg:text-left">
            <div className="inline-flex items-center gap-2 bg-brand-50 text-brand-700 text-xs font-semibold px-3 py-1.5 rounded-full mb-5 border border-brand-100">
              <span>✨</span>
              <span>AI-powered · Bilingual · Built for India</span>
            </div>
            <h1 className="text-4xl sm:text-5xl font-bold text-gray-900 leading-tight mb-5">
              {t.landing.tagline}
            </h1>
            <p className="text-lg text-gray-500 max-w-xl leading-relaxed mb-0">
              {t.landing.subtitle}
            </p>
          </div>

          {/* Right: auth card */}
          <div className="w-full max-w-sm shrink-0">
            <div className="card shadow-xl border border-gray-100">
              {/* Tabs */}
              <div className="flex mb-6 bg-gray-100 rounded-xl p-1">
                {['signin', 'signup'].map(id => (
                  <button
                    key={id}
                    type="button"
                    onClick={() => { setTab(id); setError(''); }}
                    className={`flex-1 text-sm font-semibold py-2 rounded-lg transition-all ${
                      tab === id
                        ? 'bg-white text-gray-900 shadow-sm'
                        : 'text-gray-500 hover:text-gray-700'
                    }`}
                  >
                    {id === 'signin' ? t.auth.tabSignIn : t.auth.tabSignUp}
                  </button>
                ))}
              </div>

              <form onSubmit={handleSubmit} className="space-y-4">
                {/* Name — sign up only */}
                {tab === 'signup' && (
                  <div>
                    <label className="block text-xs font-semibold text-gray-500 mb-1">
                      {t.auth.nameLabel}
                    </label>
                    <input
                      type="text"
                      value={name}
                      onChange={e => setName(e.target.value)}
                      placeholder={t.auth.namePlaceholder}
                      required
                      autoComplete="name"
                      className="w-full border border-gray-200 rounded-xl px-3.5 py-2.5 text-sm outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent transition"
                    />
                  </div>
                )}

                <div>
                  <label className="block text-xs font-semibold text-gray-500 mb-1">
                    {t.auth.emailLabel}
                  </label>
                  <input
                    type="email"
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    placeholder={t.auth.emailPlaceholder}
                    required
                    autoComplete="email"
                    className="w-full border border-gray-200 rounded-xl px-3.5 py-2.5 text-sm outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent transition"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-gray-500 mb-1">
                    {t.auth.passwordLabel}
                  </label>
                  <input
                    type="password"
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    placeholder={t.auth.passwordPlaceholder}
                    required
                    autoComplete={tab === 'signup' ? 'new-password' : 'current-password'}
                    className="w-full border border-gray-200 rounded-xl px-3.5 py-2.5 text-sm outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent transition"
                  />
                </div>

                {error && (
                  <p className="text-xs text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
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

              <p className="text-center text-xs text-gray-400 mt-4">
                Free to start · No credit card required
              </p>
            </div>
          </div>
        </section>

        {/* Features */}
        <section className="grid sm:grid-cols-3 gap-6 pb-20">
          {FEATURES.map(({ icon, key }) => (
            <div key={key} className="card hover:shadow-md transition-shadow">
              <div className="text-3xl mb-4">{icon}</div>
              <h3 className="font-semibold text-gray-900 mb-2">
                {t.landing[`${key}Title`]}
              </h3>
              <p className="text-sm text-gray-500 leading-relaxed">
                {t.landing[`${key}Desc`]}
              </p>
            </div>
          ))}
        </section>

        {/* Pricing */}
        <section className="pb-24 max-w-2xl mx-auto">
          <h2 className="text-2xl font-bold text-center text-gray-900 mb-8">Simple pricing</h2>
          <div className="grid sm:grid-cols-2 gap-4">
            <div className="card border-2 border-gray-100">
              <p className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-1">
                {t.landing.free}
              </p>
              <p className="text-3xl font-bold text-gray-900 mb-3">₹0</p>
              <p className="text-sm text-gray-500">{t.landing.freeDesc}</p>
            </div>
            <div className="card border-2 border-brand-500 relative overflow-hidden">
              <div className="absolute top-3 right-3 bg-brand-500 text-white text-xs font-bold px-2 py-0.5 rounded-full">
                POPULAR
              </div>
              <p className="text-sm font-semibold text-brand-600 uppercase tracking-wide mb-1">
                Premium
              </p>
              <p className="text-3xl font-bold text-gray-900 mb-3">{t.landing.premium}</p>
              <p className="text-sm text-gray-500">{t.landing.premiumDesc}</p>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-gray-100 py-6 text-center text-xs text-gray-400">
        © {new Date().getFullYear()} MindGame · Made with ❤️ for Indian Athletes
      </footer>
    </div>
  );
}

export default LandingPage;
