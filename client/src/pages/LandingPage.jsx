import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { translations } from '../i18n/translations';

const FEATURES = [
  { icon: '🤖', key: 'feature1' },
  { icon: '📊', key: 'feature2' },
  { icon: '📈', key: 'feature3' },
];

function GoogleIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 48 48" fill="none">
      <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/>
      <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/>
      <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/>
      <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.18 1.48-4.97 2.36-8.16 2.36-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/>
    </svg>
  );
}

function LandingPage() {
  const { language, toggleLanguage } = useAuth();
  const t = translations[language];
  const [searchParams] = useSearchParams();
  const [authError, setAuthError] = useState('');
  const [signingIn, setSigningIn] = useState(false);

  useEffect(() => {
    if (searchParams.get('error')) {
      setAuthError(t.auth.authError);
    }
  }, [searchParams, t.auth.authError]);

  function handleGoogleLogin() {
    setSigningIn(true);
    // Navigate to the backend Google OAuth endpoint.
    // Vite proxies /api/* → localhost:5000 during development.
    window.location.href = '/api/auth/google';
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

      {/* Hero */}
      <main className="max-w-5xl mx-auto px-4">
        <section className="text-center pt-16 pb-20 animate-fade-in">
          <div className="inline-flex items-center gap-2 bg-brand-50 text-brand-700 text-xs font-semibold px-3 py-1.5 rounded-full mb-6 border border-brand-100">
            <span>✨</span>
            <span>AI-powered · Bilingual · Built for India</span>
          </div>

          <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold text-gray-900 leading-tight mb-6 max-w-3xl mx-auto">
            {t.landing.tagline}
          </h1>

          <p className="text-lg sm:text-xl text-gray-500 max-w-2xl mx-auto mb-10 leading-relaxed">
            {t.landing.subtitle}
          </p>

          {authError && (
            <div className="mb-6 inline-flex items-center gap-2 bg-red-50 text-red-700 text-sm px-4 py-2.5 rounded-xl border border-red-100">
              ⚠️ {authError}
            </div>
          )}

          <div className="flex flex-col sm:flex-row gap-3 justify-center items-center">
            <button
              onClick={handleGoogleLogin}
              disabled={signingIn}
              className="btn-primary text-base px-8 py-4 rounded-2xl shadow-md hover:shadow-lg"
            >
              <GoogleIcon />
              {signingIn ? t.auth.signingIn : t.auth.continueWithGoogle}
            </button>
          </div>

          <p className="mt-5 text-xs text-gray-400">
            Free to start · No credit card required
          </p>
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
            {/* Free */}
            <div className="card border-2 border-gray-100">
              <p className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-1">
                {t.landing.free}
              </p>
              <p className="text-3xl font-bold text-gray-900 mb-3">₹0</p>
              <p className="text-sm text-gray-500">{t.landing.freeDesc}</p>
            </div>
            {/* Premium */}
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

      {/* Footer */}
      <footer className="border-t border-gray-100 py-6 text-center text-xs text-gray-400">
        © {new Date().getFullYear()} MindGame · Made with ❤️ for Indian Athletes
      </footer>
    </div>
  );
}

export default LandingPage;
