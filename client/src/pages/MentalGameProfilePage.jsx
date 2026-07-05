import { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { translations } from '../i18n/translations';
import { apiFetch } from '../api';
import { ArjunLogo } from '../components/ArjunLogo';
import { Target, Loader2 } from 'lucide-react';

function MentalGameProfilePage() {
  const { user, token, language, updateUser } = useAuth();
  const t = translations[language].profile;
  const navigate = useNavigate();

  const [intro, setIntro] = useState(user?.profileIntro || '');
  const [fetching, setFetching] = useState(!user?.profileIntro);
  const [fetchError, setFetchError] = useState(false);

  useEffect(() => {
    if (user?.profileIntro) return;
    apiFetch('/api/profile-intro', {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (data?.intro) {
          setIntro(data.intro);
          updateUser({ profileIntro: data.intro });
        }
      })
      .catch(() => setFetchError(true))
      .finally(() => setFetching(false));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const challenge     = user?.primaryChallenge || 'focus';
  const focusLabel    = t.focusLabels[challenge] || challenge;

  function handleStart() {
    navigate('/coaching');
  }

  return (
    <div className="min-h-screen bg-dark-900 flex flex-col">

      {/* Header */}
      <header className="max-w-lg mx-auto px-4 py-5 flex items-center gap-2 w-full">
        <ArjunLogo size={28} />
        <span className="font-bold text-ink text-lg tracking-tight">Arjun</span>
      </header>

      <main className="flex-1 flex flex-col items-center justify-center px-4 pb-12">
        <div className="w-full max-w-sm">

          {/* Greeting */}
          <div className="text-center mb-8">
            <p className="text-xs font-semibold text-brand-400 uppercase tracking-widest mb-2">
              {language === 'hi' ? 'आपका मानसिक खेल प्रोफाइल' : 'Your Mental Game Profile'}
            </p>
            <h1 className="text-3xl font-bold text-ink leading-tight">
              {language === 'hi' ? `नमस्ते, ${user?.name?.split(' ')[0]}` : `Welcome, ${user?.name?.split(' ')[0]}`}
            </h1>
          </div>

          {/* Focus area card */}
          <div className="bg-brand-500/10 border border-brand-500/30 rounded-2xl px-5 py-4 mb-6 flex items-center gap-4">
            <div className="w-10 h-10 rounded-full bg-brand-500/20 border border-brand-500/40 flex items-center justify-center shrink-0">
              <Target size={20} className="text-brand-400" />
            </div>
            <div>
              <p className="text-xs font-semibold text-brand-400 uppercase tracking-wide mb-0.5">{t.yourFocus}</p>
              <p className="text-sm font-semibold text-ink">{focusLabel}</p>
            </div>
          </div>

          {/* AI-generated intro paragraph */}
          <div className="bg-dark-800 border border-dark-600 rounded-2xl px-5 py-5 mb-8 min-h-[120px] flex items-center">
            {fetching ? (
              <div className="flex items-center gap-3 w-full justify-center text-slt">
                <Loader2 size={18} className="animate-spin" />
                <span className="text-sm">{t.loading}</span>
              </div>
            ) : fetchError && !intro ? (
              <p className="text-sm text-slt leading-relaxed">
                {language === 'hi'
                  ? 'प्रोफ़ाइल लोड नहीं हो सकी। नीचे बटन से शुरू करो।'
                  : "Couldn't load your profile intro. Hit Start to begin."}
              </p>
            ) : (
              <p className="text-sm text-ink leading-relaxed">{intro}</p>
            )}
          </div>

          {/* CTAs */}
          <div className="flex flex-col gap-3">
            <button
              onClick={handleStart}
              className="btn-primary w-full justify-center py-4 text-base"
            >
              {t.startCta}
            </button>
            <Link
              to="/dashboard"
              replace
              className="block text-center text-sm text-slt hover:text-ink transition-colors py-2"
            >
              {t.dashLink}
            </Link>
          </div>

        </div>
      </main>
    </div>
  );
}

export default MentalGameProfilePage;
