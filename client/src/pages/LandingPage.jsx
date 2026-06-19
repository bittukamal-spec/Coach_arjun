import { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { translations } from '../i18n/translations';
import { apiFetch } from '../api';

const SPORTS = ['🏏', '⚽', '🏸', '🏃', '🤼', '🥊', '🏑', '🎾', '🏊', '🥋'];

const FEATURES = [
  { icon: '🎯', key: 'feature1', accent: 'brand',  glow: 'rgba(139,92,246,0.15)' },
  { icon: '📊', key: 'feature2', accent: 'win',    glow: 'rgba(16,185,129,0.15)' },
  { icon: '⚡', key: 'feature3', accent: 'fire',   glow: 'rgba(249,115,22,0.15)' },
];

const STEPS = [
  { num: '01', icon: '⚡', key: 'step1' },
  { num: '02', icon: '📊', key: 'step2' },
  { num: '03', icon: '💬', key: 'step3' },
];

function LandingPage() {
  const { language, toggleLanguage, loginWithUser } = useAuth();
  const t = translations[language];
  const navigate = useNavigate();
  const authRef = useRef(null);

  const [tab, setTab]           = useState('signup');
  const [name, setName]         = useState('');
  const [email, setEmail]       = useState('');
  const [password, setPassword] = useState('');
  const [error, setError]       = useState('');
  const [busy, setBusy]         = useState(false);
  const [installPrompt, setInstallPrompt] = useState(null);
  const [installed, setInstalled]         = useState(false);

  useEffect(() => {
    const handler = (e) => { e.preventDefault(); setInstallPrompt(e); };
    window.addEventListener('beforeinstallprompt', handler);
    window.addEventListener('appinstalled', () => setInstalled(true));
    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  async function handleInstall() {
    if (!installPrompt) return;
    installPrompt.prompt();
    const { outcome } = await installPrompt.userChoice;
    if (outcome === 'accepted') setInstalled(true);
    setInstallPrompt(null);
  }

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

  const taglineLines = t.landing.tagline.split('\n');

  return (
    <div className="min-h-screen bg-dark-900 text-white">

      {/* ── Nav ── */}
      <header className="max-w-6xl mx-auto px-4 sm:px-6 py-5 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-brand-500 flex items-center justify-center shadow-lg shadow-brand-500/40">
            <span className="text-white font-bold text-sm">A</span>
          </div>
          <span className="font-bold text-white text-lg tracking-tight">Arjun</span>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={toggleLanguage}
            className="text-sm font-medium text-slate-400 hover:text-brand-400 transition-colors px-3 py-1.5 rounded-lg hover:bg-dark-700 border border-dark-600"
          >
            {language === 'en' ? 'हिंदी' : 'English'}
          </button>
          {installPrompt && !installed && (
            <button
              onClick={handleInstall}
              className="flex items-center gap-1.5 text-sm font-semibold bg-brand-500/15 border border-brand-500/40 text-brand-300 hover:bg-brand-500/25 px-3 py-1.5 rounded-lg transition-all"
            >
              <span>📲</span> Install App
            </button>
          )}
          {installed && (
            <span className="text-sm text-win-400 font-medium">✓ Installed</span>
          )}
          <button
            onClick={() => { setTab('signin'); authRef.current?.scrollIntoView({ behavior: 'smooth' }); }}
            className="text-sm font-medium text-slate-300 hover:text-white transition-colors hidden sm:block"
          >
            {t.auth.tabSignIn}
          </button>
        </div>
      </header>

      {/* ── Hero ── */}
      <section className="max-w-6xl mx-auto px-4 sm:px-6 pt-8 pb-16 lg:pt-12 lg:pb-24">
        <div className="flex flex-col lg:flex-row items-center gap-12 lg:gap-16">

          {/* Left: copy */}
          <div className="flex-1 text-center lg:text-left animate-fade-in">

            {/* Badge */}
            <div className="inline-flex items-center gap-2 bg-brand-500/10 text-brand-400 text-xs font-semibold px-4 py-2 rounded-full mb-6 border border-brand-500/25 tracking-wide">
              <span className="w-1.5 h-1.5 rounded-full bg-brand-400 animate-pulse" />
              {t.landing.badge}
            </div>

            {/* Headline */}
            <h1 className="text-5xl sm:text-6xl lg:text-7xl font-extrabold leading-[1.05] mb-6">
              {taglineLines.map((line, i) => (
                <span key={i} className={`block ${
                  i === 0
                    ? 'bg-gradient-to-r from-white via-slate-100 to-slate-300 bg-clip-text text-transparent'
                    : 'bg-gradient-to-r from-brand-400 via-brand-300 to-purple-300 bg-clip-text text-transparent'
                }`}>
                  {line}
                </span>
              ))}
            </h1>

            {/* Subtitle */}
            <p className="text-lg text-slate-400 leading-relaxed mb-8 max-w-xl mx-auto lg:mx-0">
              {t.landing.subtitle}
            </p>

            {/* Sport icons */}
            <div className="flex items-center gap-2 justify-center lg:justify-start mb-8 flex-wrap">
              {SPORTS.map((s, i) => (
                <span key={i} className="text-2xl opacity-60 hover:opacity-100 transition-opacity">{s}</span>
              ))}
            </div>

            {/* Trust row */}
            <div className="flex flex-wrap gap-4 justify-center lg:justify-start">
              {[
                { val: t.landing.trust1, sub: t.landing.trust1Sub, color: 'text-brand-400' },
                { val: t.landing.trust2, sub: t.landing.trust2Sub, color: 'text-win-400' },
                { val: t.landing.trust3, sub: t.landing.trust3Sub, color: 'text-fire-400' },
              ].map(({ val, sub, color }) => (
                <div key={val} className="text-center lg:text-left">
                  <p className={`text-sm font-bold ${color}`}>{val}</p>
                  <p className="text-xs text-slate-600">{sub}</p>
                </div>
              ))}
            </div>

            {/* PWA Install button — shown when browser prompt is available */}
            {installPrompt && !installed && (
              <div className="mt-8 flex justify-center lg:justify-start">
                <button
                  onClick={handleInstall}
                  className="flex items-center gap-2 bg-dark-700 border border-dark-500 hover:border-brand-500/50 text-slate-300 hover:text-white px-5 py-3 rounded-xl transition-all group"
                >
                  <span className="text-xl">📲</span>
                  <div className="text-left">
                    <p className="text-sm font-semibold leading-none">Install Arjun App</p>
                    <p className="text-xs text-slate-500 mt-0.5">Add to home screen — works offline</p>
                  </div>
                </button>
              </div>
            )}
            {installed && (
              <div className="mt-8 flex justify-center lg:justify-start">
                <div className="flex items-center gap-2 text-win-400 text-sm font-medium bg-win-500/10 border border-win-500/20 px-4 py-2.5 rounded-xl">
                  <span>✓</span> App installed on your device
                </div>
              </div>
            )}
          </div>

          {/* Right: auth card */}
          <div ref={authRef} className="w-full max-w-sm shrink-0 animate-fade-in">
            {/* Glow effect behind card */}
            <div className="relative">
              <div className="absolute -inset-4 bg-brand-500/10 rounded-3xl blur-2xl pointer-events-none" />
              <div className="relative bg-dark-800 rounded-2xl border border-dark-600 shadow-2xl p-6">
                <p className="text-center text-sm text-slate-400 mb-5 font-medium">
                  {language === 'hi' ? 'आज ही शुरू करें — 14 दिन मुफ़्त' : 'Start free — 14 days, no card needed'}
                </p>

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
                    {language === 'hi' ? 'साइन अप करके आप हमारी शर्तों से सहमत हैं' : 'By signing up you agree to our terms'}
                  </p>
                )}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── How it works ── */}
      <section className="border-t border-dark-700 py-20">
        <div className="max-w-5xl mx-auto px-4 sm:px-6">
          <div className="text-center mb-14">
            <p className="text-xs font-bold text-brand-400 uppercase tracking-widest mb-3">Simple process</p>
            <h2 className="text-3xl sm:text-4xl font-bold text-white">{t.landing.howTitle}</h2>
          </div>

          <div className="grid sm:grid-cols-3 gap-8 relative">
            {/* connector line (desktop only) */}
            <div className="hidden sm:block absolute top-10 left-[calc(16.67%+1rem)] right-[calc(16.67%+1rem)] h-px bg-gradient-to-r from-brand-500/30 via-brand-500/60 to-brand-500/30 pointer-events-none" />

            {STEPS.map(({ num, icon, key }, i) => (
              <div key={key} className="flex flex-col items-center text-center relative">
                <div className="w-20 h-20 rounded-2xl bg-brand-500/15 border-2 border-brand-500/40 flex flex-col items-center justify-center mb-5 relative z-10">
                  <span className="text-2xl mb-0.5">{icon}</span>
                  <span className="text-xs font-bold text-brand-500/60">{num}</span>
                </div>
                <h3 className="text-base font-bold text-white mb-2">{t.landing[key]}</h3>
                <p className="text-sm text-slate-500 leading-relaxed max-w-xs">{t.landing[`${key}Desc`]}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Features ── */}
      <section className="py-20">
        <div className="max-w-5xl mx-auto px-4 sm:px-6">
          <div className="text-center mb-14">
            <p className="text-xs font-bold text-brand-400 uppercase tracking-widest mb-3">What you get</p>
            <h2 className="text-3xl sm:text-4xl font-bold text-white">
              {language === 'hi' ? 'अर्जुन आपको क्या देता है' : 'Everything you need to perform'}
            </h2>
          </div>

          <div className="grid sm:grid-cols-3 gap-6">
            {FEATURES.map(({ icon, key, glow }) => (
              <div
                key={key}
                className="card card-glow group"
                style={{ '--glow-color': glow }}
              >
                <div className="text-4xl mb-5">{icon}</div>
                <h3 className="font-bold text-white text-lg mb-3 leading-snug">
                  {t.landing[`${key}Title`]}
                </h3>
                <p className="text-sm text-slate-500 leading-relaxed">
                  {t.landing[`${key}Desc`]}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Arjun intro quote ── */}
      <section className="py-16 border-t border-dark-700">
        <div className="max-w-2xl mx-auto px-4 sm:px-6 text-center">
          <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-brand-500 to-brand-700 flex items-center justify-center text-white font-bold text-2xl mx-auto mb-6 shadow-xl shadow-brand-500/30">
            A
          </div>
          <blockquote className="text-xl sm:text-2xl font-semibold text-slate-200 leading-relaxed mb-4">
            {language === 'hi'
              ? '"मैं तुम्हारे खेल को समझता हूं। तुम्हारे दबाव को समझता हूं। हर बात गोपनीय है।"'
              : '"I understand your sport. I understand your pressure. Everything you share stays between us."'}
          </blockquote>
          <p className="text-sm font-semibold text-brand-400">
            Arjun · {language === 'hi' ? 'आपका AI मानसिक कोच' : 'Your AI Mental Performance Coach'}
          </p>
        </div>
      </section>

      {/* ── Pricing ── */}
      <section className="py-20 border-t border-dark-700">
        <div className="max-w-3xl mx-auto px-4 sm:px-6">
          <div className="text-center mb-12">
            <p className="text-xs font-bold text-brand-400 uppercase tracking-widest mb-3">Pricing</p>
            <h2 className="text-3xl sm:text-4xl font-bold text-white">{t.landing.pricingTitle}</h2>
          </div>

          <div className="grid sm:grid-cols-3 gap-4">
            {/* Free */}
            <div className="card border-dark-500 flex flex-col">
              <p className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-3">{t.landing.free}</p>
              <p className="text-4xl font-extrabold text-white mb-1">₹0</p>
              <p className="text-sm text-slate-500 mb-6 flex-1">{t.landing.freeDesc}</p>
              <button onClick={() => { setTab('signup'); authRef.current?.scrollIntoView({ behavior: 'smooth' }); }}
                className="btn-secondary text-sm py-2.5 justify-center">
                {language === 'hi' ? 'शुरू करें' : 'Get started'}
              </button>
            </div>

            {/* Monthly — highlighted */}
            <div className="rounded-2xl border-2 border-brand-500 bg-brand-500/10 p-6 relative flex flex-col">
              <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-brand-500 text-white text-xs font-bold px-3 py-1 rounded-full whitespace-nowrap">
                {language === 'hi' ? 'सबसे लोकप्रिय' : 'MOST POPULAR'}
              </div>
              <p className="text-xs font-bold text-brand-400 uppercase tracking-wide mb-3">Premium</p>
              <p className="text-4xl font-extrabold text-white mb-1">{t.landing.premium}</p>
              <p className="text-sm text-slate-400 mb-6 flex-1">{t.landing.premiumDesc}</p>
              <button onClick={() => { setTab('signup'); authRef.current?.scrollIntoView({ behavior: 'smooth' }); }}
                className="btn-primary text-sm py-2.5 justify-center">
                {language === 'hi' ? 'शुरू करें' : 'Get started'}
              </button>
            </div>

            {/* Annual */}
            <div className="card border-fire-600/40 flex flex-col">
              <p className="text-xs font-bold text-fire-400 uppercase tracking-wide mb-3">Annual</p>
              <p className="text-4xl font-extrabold text-white mb-1">{t.landing.premiumAnnual}</p>
              <p className="text-sm text-slate-500 mb-6 flex-1">{t.landing.premiumAnnualDesc}</p>
              <button onClick={() => { setTab('signup'); authRef.current?.scrollIntoView({ behavior: 'smooth' }); }}
                className="btn-secondary text-sm py-2.5 justify-center">
                {language === 'hi' ? 'शुरू करें' : 'Get started'}
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* ── Bottom CTA ── */}
      <section className="py-20 border-t border-dark-700">
        <div className="max-w-xl mx-auto px-4 sm:px-6 text-center">
          <div className="inline-block text-5xl mb-6">🏹</div>
          <h2 className="text-3xl sm:text-4xl font-bold text-white mb-4">
            {t.landing.ctaTitle}
          </h2>
          <p className="text-slate-400 mb-8">{t.landing.ctaDesc}</p>
          <button
            onClick={() => { setTab('signup'); authRef.current?.scrollIntoView({ behavior: 'smooth' }); }}
            className="btn-primary px-10 py-4 text-base"
          >
            {t.landing.ctaBtn}
          </button>
        </div>
      </section>

      {/* ── Footer ── */}
      <footer className="border-t border-dark-700 py-8">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded-md bg-brand-500 flex items-center justify-center">
              <span className="text-white font-bold text-xs">A</span>
            </div>
            <span className="text-sm font-semibold text-slate-400">Arjun</span>
          </div>
          <p className="text-xs text-slate-600 text-center">
            © {new Date().getFullYear()} Arjun · AI Mental Performance Coaching
          </p>
          <button onClick={toggleLanguage} className="text-xs text-slate-600 hover:text-slate-400 transition-colors">
            {language === 'en' ? 'हिंदी में देखें' : 'View in English'}
          </button>
        </div>
      </footer>

    </div>
  );
}

export default LandingPage;
