import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { translations } from '../i18n/translations';

const SPORTS = ['🏏', '⚽', '🏸', '🏃', '🤼', '🥊', '🏑', '🎾', '🏊', '🥋'];

const FEATURES = [
  { icon: '🎯', key: 'feature1', glow: 'rgba(139,92,246,0.15)' },
  { icon: '📊', key: 'feature2', glow: 'rgba(16,185,129,0.15)' },
  { icon: '⚡', key: 'feature3', glow: 'rgba(249,115,22,0.15)' },
];

const STEPS = [
  { num: '01', icon: '⚡', key: 'step1' },
  { num: '02', icon: '📊', key: 'step2' },
  { num: '03', icon: '💬', key: 'step3' },
];

function LandingPage() {
  const { language, toggleLanguage } = useAuth();
  const t = translations[language];
  const navigate = useNavigate();

  const [installPrompt, setInstallPrompt] = useState(null);
  const [installed, setInstalled]         = useState(false);
  const [showHint, setShowHint]           = useState(false);

  // Detect platform
  const isIOS        = /iphone|ipad|ipod/i.test(navigator.userAgent) && !window.MSStream;
  const isAndroid    = /android/i.test(navigator.userAgent);
  const isStandalone = window.navigator.standalone ||
                       window.matchMedia('(display-mode: standalone)').matches;

  useEffect(() => {
    if (isStandalone) setInstalled(true);
    const handler = (e) => { e.preventDefault(); setInstallPrompt(e); };
    window.addEventListener('beforeinstallprompt', handler);
    window.addEventListener('appinstalled', () => { setInstalled(true); setInstallPrompt(null); });
    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function handleInstall() {
    if (installPrompt) {
      installPrompt.prompt();
      const { outcome } = await installPrompt.userChoice;
      if (outcome === 'accepted') setInstalled(true);
      setInstallPrompt(null);
    } else {
      setShowHint(true);
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
          <button
            onClick={() => navigate('/auth?tab=signin')}
            className="text-sm font-medium text-slate-300 hover:text-white transition-colors hidden sm:block"
          >
            {t.auth.tabSignIn}
          </button>
        </div>
      </header>

      {/* ── Hero ── */}
      <section className="max-w-3xl mx-auto px-4 sm:px-6 pt-12 pb-20 text-center animate-fade-in">

        {/* Badge */}
        <div className="inline-flex items-center gap-2 bg-brand-500/10 text-brand-400 text-xs font-semibold px-4 py-2 rounded-full mb-8 border border-brand-500/25 tracking-wide">
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
        <p className="text-lg text-slate-400 leading-relaxed mb-10 max-w-xl mx-auto">
          {t.landing.subtitle}
        </p>

        {/* Sport icons */}
        <div className="flex items-center gap-2 justify-center mb-10 flex-wrap">
          {SPORTS.map((s, i) => (
            <span key={i} className="text-2xl opacity-60 hover:opacity-100 transition-opacity">{s}</span>
          ))}
        </div>

        {/* ── CTAs ── */}
        {installed ? (
          <div className="flex flex-col items-center gap-3">
            <div className="flex items-center gap-2 text-win-400 text-sm font-semibold bg-win-500/10 border border-win-500/20 px-6 py-3 rounded-2xl">
              <span>✓</span> App installed — open it from your home screen
            </div>
            <button onClick={() => navigate('/auth')} className="text-sm text-slate-500 hover:text-slate-300 transition-colors">
              Sign in →
            </button>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-4">
            {/* Primary: Install button — always shown */}
            <button
              onClick={handleInstall}
              className="flex items-center gap-3 bg-brand-500 hover:bg-brand-600 text-white font-bold px-8 py-4 rounded-2xl shadow-xl shadow-brand-500/30 transition-all active:scale-95 text-base w-full max-w-xs justify-center"
            >
              <span className="text-xl">📲</span>
              <div className="text-left">
                <p className="leading-none">Install Arjun App</p>
                <p className="text-xs font-normal text-brand-200 mt-0.5">Add to home screen — free</p>
              </div>
            </button>

            {/* Install hint popup */}
            {showHint && (
              <div className="bg-dark-800 border border-dark-500 rounded-2xl px-5 py-4 text-sm text-left max-w-xs w-full">
                <p className="font-semibold text-white mb-3">How to install:</p>
                {isIOS ? (
                  <ol className="space-y-1.5 list-decimal list-inside text-slate-400">
                    <li>Open this page in <strong className="text-white">Safari</strong></li>
                    <li>Tap <strong className="text-white">Share</strong> (box with ↑ arrow)</li>
                    <li>Tap <strong className="text-white">"Add to Home Screen"</strong></li>
                    <li>Tap <strong className="text-white">Add</strong></li>
                  </ol>
                ) : isAndroid ? (
                  <ol className="space-y-1.5 list-decimal list-inside text-slate-400">
                    <li>Tap the <strong className="text-white">⋮ menu</strong> in Chrome</li>
                    <li>Tap <strong className="text-white">"Add to Home screen"</strong></li>
                    <li>Tap <strong className="text-white">Add</strong></li>
                  </ol>
                ) : (
                  <ol className="space-y-1.5 list-decimal list-inside text-slate-400">
                    <li>Look for the <strong className="text-white">install icon</strong> in your browser address bar (↓ with a circle)</li>
                    <li>Click it and select <strong className="text-white">Install</strong></li>
                    <li>Or tap <strong className="text-white">⋮ → Install Arjun</strong></li>
                  </ol>
                )}
                <button onClick={() => setShowHint(false)} className="mt-3 text-xs text-slate-600 hover:text-slate-400">
                  Close
                </button>
              </div>
            )}

            {/* Secondary: sign up in browser */}
            <button
              onClick={() => navigate('/auth')}
              className="text-sm text-slate-500 hover:text-slate-300 transition-colors"
            >
              Or sign up / sign in without installing →
            </button>
          </div>
        )}

        {/* Trust row */}
        <div className="flex flex-wrap gap-6 justify-center mt-10">
          {[
            { val: t.landing.trust1, sub: t.landing.trust1Sub, color: 'text-brand-400' },
            { val: t.landing.trust2, sub: t.landing.trust2Sub, color: 'text-win-400' },
            { val: t.landing.trust3, sub: t.landing.trust3Sub, color: 'text-fire-400' },
          ].map(({ val, sub, color }) => (
            <div key={val} className="text-center">
              <p className={`text-sm font-bold ${color}`}>{val}</p>
              <p className="text-xs text-slate-600">{sub}</p>
            </div>
          ))}
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
            <div className="hidden sm:block absolute top-10 left-[calc(16.67%+1rem)] right-[calc(16.67%+1rem)] h-px bg-gradient-to-r from-brand-500/30 via-brand-500/60 to-brand-500/30 pointer-events-none" />

            {STEPS.map(({ num, icon, key }) => (
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
              <div key={key} className="card card-glow" style={{ '--glow-color': glow }}>
                <div className="text-4xl mb-5">{icon}</div>
                <h3 className="font-bold text-white text-lg mb-3 leading-snug">{t.landing[`${key}Title`]}</h3>
                <p className="text-sm text-slate-500 leading-relaxed">{t.landing[`${key}Desc`]}</p>
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
            <div className="card border-dark-500 flex flex-col">
              <p className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-3">{t.landing.free}</p>
              <p className="text-4xl font-extrabold text-white mb-1">₹0</p>
              <p className="text-sm text-slate-500 mb-6 flex-1">{t.landing.freeDesc}</p>
              <button onClick={() => navigate('/auth')} className="btn-secondary text-sm py-2.5 justify-center">
                {language === 'hi' ? 'शुरू करें' : 'Get started'}
              </button>
            </div>

            <div className="rounded-2xl border-2 border-brand-500 bg-brand-500/10 p-6 relative flex flex-col">
              <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-brand-500 text-white text-xs font-bold px-3 py-1 rounded-full whitespace-nowrap">
                {language === 'hi' ? 'सबसे लोकप्रिय' : 'MOST POPULAR'}
              </div>
              <p className="text-xs font-bold text-brand-400 uppercase tracking-wide mb-3">Premium</p>
              <p className="text-4xl font-extrabold text-white mb-1">{t.landing.premium}</p>
              <p className="text-sm text-slate-400 mb-6 flex-1">{t.landing.premiumDesc}</p>
              <button onClick={() => navigate('/auth')} className="btn-primary text-sm py-2.5 justify-center">
                {language === 'hi' ? 'शुरू करें' : 'Get started'}
              </button>
            </div>

            <div className="card border-fire-600/40 flex flex-col">
              <p className="text-xs font-bold text-fire-400 uppercase tracking-wide mb-3">Annual</p>
              <p className="text-4xl font-extrabold text-white mb-1">{t.landing.premiumAnnual}</p>
              <p className="text-sm text-slate-500 mb-6 flex-1">{t.landing.premiumAnnualDesc}</p>
              <button onClick={() => navigate('/auth')} className="btn-secondary text-sm py-2.5 justify-center">
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
          <h2 className="text-3xl sm:text-4xl font-bold text-white mb-4">{t.landing.ctaTitle}</h2>
          <p className="text-slate-400 mb-8">{t.landing.ctaDesc}</p>
          <button
            onClick={installed ? () => navigate('/auth') : handleInstall}
            className="btn-primary px-10 py-4 text-base"
          >
            {installed ? t.landing.ctaBtn : '📲 Install Arjun App'}
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
          <div className="flex items-center gap-4">
            <button onClick={() => navigate('/privacy')} className="text-xs text-slate-600 hover:text-slate-400 transition-colors">Privacy</button>
            <button onClick={() => navigate('/terms')} className="text-xs text-slate-600 hover:text-slate-400 transition-colors">Terms</button>
            <button onClick={toggleLanguage} className="text-xs text-slate-600 hover:text-slate-400 transition-colors">
              {language === 'en' ? 'हिंदी' : 'English'}
            </button>
          </div>
        </div>
      </footer>

    </div>
  );
}

export default LandingPage;
