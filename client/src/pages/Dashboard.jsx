import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import Navbar from '../components/Navbar';
import { useAuth } from '../contexts/AuthContext';
import { translations } from '../i18n/translations';
import { apiFetch } from '../api';
import { MessageCircle, CheckSquare, TrendingUp, Zap } from 'lucide-react';

const SPORT_ICONS = {
  cricket: '🏏', football: '⚽', badminton: '🏸', athletics: '🏃',
  wrestling: '🤼', boxing: '🥊', kabaddi: '🤸', tennis: '🎾',
  hockey: '🏑', swimming: '🏊', other: '🏅',
};

const TRIAL_DAYS = 14;

function getTrialDaysRemaining(user) {
  if (user?.tier === 'premium') return null;
  const start = user?.trialStarted || null;
  if (!start) return TRIAL_DAYS;
  const daysSince = Math.floor((Date.now() - new Date(start).getTime()) / (1000 * 60 * 60 * 24));
  return Math.max(0, TRIAL_DAYS - daysSince);
}

function Dashboard() {
  const { user, token, language } = useAuth();
  const t = translations[language];
  const isPremium = user?.tier === 'premium';
  const trialDaysRemaining = getTrialDaysRemaining(user);
  const trialEnded = !isPremium && trialDaysRemaining === 0;

  const [todayCheckIn, setTodayCheckIn] = useState(null);
  const [streak, setStreak] = useState(null);

  useEffect(() => {
    apiFetch('/api/checkin/today', { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.ok ? r.json() : null)
      .then(data => setTodayCheckIn(data?.checkIn || false))
      .catch(() => setTodayCheckIn(false));

    apiFetch('/api/progress/summary?days=7', { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.ok ? r.json() : null)
      .then(data => setStreak(data?.streak ?? 0))
      .catch(() => {});
  }, [token]);

  const FEATURES = [
    {
      icon: MessageCircle,
      labelKey: 'openCoach',
      description: language === 'hi'
        ? 'अर्जुन से बात करें — फोकस, दबाव, आत्मविश्वास'
        : 'Talk to Arjun about focus, pressure, confidence',
      to: '/coaching',
      accent: 'brand',
    },
    {
      icon: CheckSquare,
      labelKey: 'startCheckin',
      description: language === 'hi'
        ? 'मूड, फोकस और आत्मविश्वास रेट करें'
        : 'Rate your mood, focus, and confidence today',
      to: '/checkin',
      badge: todayCheckIn
        ? { label: language === 'hi' ? 'आज हो गया ✓' : 'Done today ✓', color: 'bg-win-500/20 text-win-400 border-win-500/30' }
        : null,
      accent: 'win',
    },
    {
      icon: TrendingUp,
      labelKey: 'viewProgress',
      description: language === 'hi'
        ? 'समय के साथ अपना मानसिक प्रदर्शन देखें'
        : 'See your mental performance over time',
      to: '/progress',
      badge: streak !== null && streak > 0
        ? { label: `🔥 ${streak} ${language === 'hi' ? 'दिन' : streak === 1 ? 'day' : 'days'}`, color: 'bg-fire-500/20 text-fire-400 border-fire-500/30' }
        : null,
      accent: 'fire',
    },
  ];

  const accentBorder = { brand: 'border-brand-600/50 hover:border-brand-500', win: 'border-win-600/40 hover:border-win-500', fire: 'border-fire-600/40 hover:border-fire-500' };
  const accentIcon = { brand: 'text-brand-400', win: 'text-win-400', fire: 'text-fire-400' };

  return (
    <div className="min-h-screen bg-dark-900">
      <Navbar />

      <main className="max-w-5xl mx-auto px-4 pt-24 pb-24 animate-fade-in">

        {/* Welcome header */}
        <div className="mb-8">
          <div className="flex items-center gap-4 mb-3">
            <div className="w-14 h-14 rounded-full bg-gradient-to-br from-brand-500 to-brand-700 text-white text-2xl font-bold flex items-center justify-center shadow-lg ring-2 ring-brand-600/40">
              {user?.name?.charAt(0)?.toUpperCase()}
            </div>
            <div>
              <p className="text-slate-500 text-sm">{t.dashboard.welcomeBack}</p>
              <h1 className="text-2xl font-bold text-white">{user?.name}</h1>
            </div>
          </div>

          {/* Badges row */}
          <div className="flex flex-wrap gap-2">
            <span className={`inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1 rounded-full border ${
              isPremium
                ? 'bg-fire-500/20 text-fire-400 border-fire-500/30'
                : 'bg-brand-500/15 text-brand-400 border-brand-500/25'
            }`}>
              {isPremium ? '⭐ ' + t.dashboard.premiumTier : '🆓 ' + t.dashboard.freeTier}
            </span>
            {user?.sport && (
              <span className="inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1 rounded-full bg-dark-700 text-slate-300 border border-dark-500">
                {SPORT_ICONS[user.sport] || '🏅'} {user.sport.charAt(0).toUpperCase() + user.sport.slice(1)}
              </span>
            )}
            {user?.experienceLevel && (
              <span className="inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1 rounded-full bg-dark-700 text-slate-300 border border-dark-500">
                {user.experienceLevel.charAt(0).toUpperCase() + user.experienceLevel.slice(1)}
              </span>
            )}
          </div>
        </div>

        {/* Streak HUD strip */}
        {streak !== null && streak > 0 && (
          <div className="card mb-6 flex items-center justify-between gap-4 bg-gradient-to-r from-dark-800 to-dark-700 border-fire-600/30">
            <div className="flex items-center gap-3">
              <span className="text-4xl animate-flame-pulse">🔥</span>
              <div>
                <p className="text-2xl font-bold text-white leading-none">{streak}</p>
                <p className="text-slate-400 text-sm">{language === 'hi' ? 'दिन की लकीर' : 'day streak'}</p>
              </div>
            </div>
            <div className="text-right">
              <Zap size={20} className="text-fire-400 ml-auto mb-1" />
              <p className="text-xs text-slate-500">{language === 'hi' ? 'जारी रखें!' : 'Keep it up!'}</p>
            </div>
          </div>
        )}

        <p className="text-slate-400 text-base mb-6">{t.dashboard.subtitle}</p>

        {/* Feature mission cards */}
        <div className="grid sm:grid-cols-3 gap-4 mb-8">
          {FEATURES.map(({ icon: Icon, labelKey, description, to, badge, accent }) => {
            const card = (
              <div className={`card card-glow group transition-all h-full border ${accentBorder[accent]} cursor-pointer`}>
                <Icon size={28} className={`mb-3 ${accentIcon[accent]}`} strokeWidth={1.8} />
                <h3 className="font-semibold text-white mb-1">{t.dashboard[labelKey]}</h3>
                <p className="text-sm text-slate-500 leading-relaxed mb-4">{description}</p>
                {badge ? (
                  <span className={`inline-block text-xs font-semibold border px-2.5 py-1 rounded-full ${badge.color}`}>
                    {badge.label}
                  </span>
                ) : (
                  <span className={`inline-block text-xs font-semibold px-2.5 py-1 rounded-full bg-dark-700 ${accentIcon[accent]} border border-dark-500 group-hover:border-current transition-colors`}>
                    Open →
                  </span>
                )}
              </div>
            );
            return <Link key={labelKey} to={to}>{card}</Link>;
          })}
        </div>

        {/* Trial ended — upgrade banner */}
        {trialEnded && (
          <div className="rounded-2xl bg-gradient-to-r from-brand-600 to-brand-800 border border-brand-500/50 p-6">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <div>
                <p className="font-bold text-white mb-1">🚀 {t.dashboard.upgradePrompt}</p>
                <p className="text-brand-200 text-sm">
                  {language === 'hi'
                    ? 'असीमित AI कोचिंग · सभी सुविधाएं · कभी भी रद्द करें'
                    : 'Unlimited AI coaching · All features · Cancel anytime'}
                </p>
              </div>
              <button className="bg-white text-brand-700 font-bold text-sm px-6 py-2.5 rounded-xl hover:bg-brand-50 transition-colors whitespace-nowrap shrink-0 shadow-lg">
                {t.dashboard.upgrade}
              </button>
            </div>
          </div>
        )}

        {/* Trial last 3 days — urgent */}
        {!isPremium && !trialEnded && trialDaysRemaining <= 3 && (
          <div className="card border-fire-500/40 bg-fire-500/10">
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="font-semibold text-fire-300 mb-0.5">
                  ⏰ {trialDaysRemaining === 1
                    ? (language === 'hi' ? 'ट्रायल का आखिरी दिन' : 'Last day of your free trial')
                    : (language === 'hi' ? `${trialDaysRemaining} दिन बचे हैं` : `${trialDaysRemaining} days left in trial`)}
                </p>
                <p className="text-slate-400 text-sm">
                  {language === 'hi' ? 'अर्जुन से बात करना जारी रखें' : 'Keep coaching with Arjun'}
                </p>
              </div>
              <Link to="/account" className="bg-fire-500 text-white font-semibold text-sm px-4 py-2 rounded-xl hover:bg-fire-600 transition-colors whitespace-nowrap shrink-0">
                {language === 'hi' ? 'अपग्रेड करें' : 'Upgrade'}
              </Link>
            </div>
          </div>
        )}

        {/* Trial soft nudge (days 4-14) */}
        {!isPremium && !trialEnded && trialDaysRemaining > 3 && (
          <div className="text-center py-2">
            <span className="text-xs text-slate-600">
              {language === 'hi'
                ? `🆓 ${trialDaysRemaining} दिन का फ्री ट्रायल चल रहा है`
                : `🆓 Free trial · ${trialDaysRemaining} days remaining`}
            </span>
          </div>
        )}
      </main>
    </div>
  );
}

export default Dashboard;
