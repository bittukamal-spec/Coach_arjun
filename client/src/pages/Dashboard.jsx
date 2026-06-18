import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import Navbar from '../components/Navbar';
import { useAuth } from '../contexts/AuthContext';
import { translations } from '../i18n/translations';
import { apiFetch } from '../api';
import { MessageCircle, CheckSquare, TrendingUp, Zap } from 'lucide-react';
import { DRILLS, DRILL_TYPE_COLORS } from '../data/drills';

const SPORT_ICONS = {
  cricket: '🏏', football: '⚽', badminton: '🏸', athletics: '🏃',
  wrestling: '🤼', boxing: '🥊', kabaddi: '🤸', tennis: '🎾',
  hockey: '🏑', swimming: '🏊', other: '🏅',
};

const ALL_ACHIEVEMENTS = [
  { key: 'first_checkin', name: 'First Step',     icon: '🌱', desc: 'Complete your first check-in' },
  { key: 'streak_3',      name: 'Rookie Mind',    icon: '🏅', desc: '3-day check-in streak' },
  { key: 'streak_7',      name: 'Mental Athlete', icon: '🔥', desc: '7-day check-in streak' },
  { key: 'streak_14',     name: 'Zone Master',    icon: '⚡', desc: '14-day check-in streak' },
  { key: 'streak_30',     name: 'Elite Mindset',  icon: '🏆', desc: '30-day check-in streak' },
  { key: 'comeback',      name: 'Comeback',       icon: '💪', desc: 'Return after 3+ days away' },
  { key: 'reflector',     name: 'Deep Thinker',   icon: '🧠', desc: 'Write reflections in 5 check-ins' },
  { key: 'perfect_week',  name: 'Perfect Week',   icon: '🛡️', desc: '7 check-ins in 7 days' },
  { key: 'chat_10',       name: 'In the Zone',    icon: '💬', desc: '10 coaching sessions with Arjun' },
];

function computeFitnessScore(weeklyAvg, streak) {
  if (!weeklyAvg || weeklyAvg.mood === null) return null;
  const base = (weeklyAvg.mood * 0.3 + weeklyAvg.focus * 0.3 + weeklyAvg.confidence * 0.3) / 5 * 100;
  return Math.round(Math.min(100, base + Math.min(streak * 2, 10)));
}

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
  const [weeklyAvg, setWeeklyAvg] = useState(null);
  const [achievements, setAchievements] = useState(null); // null = loading
  const [drillState, setDrillState] = useState({ drillIndex: null, completed: false });
  const [drillExpanded, setDrillExpanded] = useState(false);
  const [drillLoading, setDrillLoading] = useState(false);

  useEffect(() => {
    apiFetch('/api/checkin/today', { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.ok ? r.json() : null)
      .then(data => setTodayCheckIn(data?.checkIn || false))
      .catch(() => setTodayCheckIn(false));

    apiFetch('/api/progress/summary?days=7', { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        setStreak(data?.streak ?? 0);
        setWeeklyAvg(data?.weeklyAvg ?? null);
      })
      .catch(() => {});

    apiFetch('/api/drills/today', { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.ok ? r.json() : null)
      .then(data => { if (data) setDrillState(data); })
      .catch(() => {});

    apiFetch('/api/achievements/me', { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.ok ? r.json() : null)
      .then(data => setAchievements(data?.achievements ?? []))
      .catch(() => setAchievements([]));
  }, [token]);

  async function completeDrill() {
    if (drillLoading) return;
    setDrillLoading(true);
    try {
      const res = await apiFetch('/api/drills/complete', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        setDrillState(prev => ({ ...prev, completed: true }));
        setDrillExpanded(false);
      }
    } finally {
      setDrillLoading(false);
    }
  }

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

  const TOOLS = [
    {
      icon: '🌬️',
      label: language === 'hi' ? 'श्वास कक्ष' : 'Breathing Room',
      desc: language === 'hi' ? 'दबाव को 2 मिनट में काबू करें' : 'Control nerves in 2 minutes',
      to: '/breathing',
      color: 'text-violet-400',
      border: 'border-violet-500/30 hover:border-violet-500/60',
    },
    {
      icon: '🏆',
      label: language === 'hi' ? 'प्री-मैच रिचुअल' : 'Pre-Match Ritual',
      desc: language === 'hi' ? 'हर बार चोटी की अवस्था में आएं' : 'Enter peak state on command',
      to: '/ritual',
      color: 'text-amber-400',
      border: 'border-amber-500/30 hover:border-amber-500/60',
    },
    {
      icon: '📋',
      label: language === 'hi' ? 'पोस्ट-मैच डीब्रीफ' : 'Post-Match Debrief',
      desc: language === 'hi' ? '3 सवाल जो असली सीख देते हैं' : '3 questions that build real learning',
      to: '/debrief',
      color: 'text-sky-400',
      border: 'border-sky-500/30 hover:border-sky-500/60',
    },
  ];

  const accentBorder = { brand: 'border-brand-600/50 hover:border-brand-500', win: 'border-win-600/40 hover:border-win-500', fire: 'border-fire-600/40 hover:border-fire-500' };
  const accentIcon = { brand: 'text-brand-400', win: 'text-win-400', fire: 'text-fire-400' };

  const fitnessScore = computeFitnessScore(weeklyAvg, streak ?? 0);
  const fitnessLevel = fitnessScore === null ? null
    : fitnessScore <= 40 ? { label: t.dashboard.fitnessNeedsWork, color: 'text-red-400',  bar: 'bg-red-500' }
    : fitnessScore <= 70 ? { label: t.dashboard.fitnessBuilding,  color: 'text-fire-400', bar: 'bg-fire-500' }
    :                      { label: t.dashboard.fitnessStrong,    color: 'text-win-400',  bar: 'bg-win-500' };

  const earnedKeys = new Set((achievements || []).map(a => a.key));
  const earnedMap  = Object.fromEntries((achievements || []).map(a => [a.key, a]));

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

        {/* Streak + XP HUD strip */}
        <div className="card mb-6 flex items-center justify-between gap-4 bg-gradient-to-r from-dark-800 to-dark-700 border-fire-600/30">
          <div className="flex items-center gap-3">
            <span className={`text-4xl ${streak > 0 ? 'animate-flame-pulse' : ''}`}>🔥</span>
            <div>
              <p className="text-2xl font-bold text-white leading-none">{streak ?? 0}</p>
              <p className="text-slate-400 text-sm">{language === 'hi' ? 'दिन की लकीर' : 'day streak'}</p>
            </div>
          </div>
          {user?.xp !== undefined && (
            <div className="relative group">
              <div className="flex items-center gap-2 bg-brand-500/10 border border-brand-500/20 px-4 py-2 rounded-xl cursor-default">
                <Zap size={16} className="text-brand-400" />
                <div className="text-right">
                  <p className="text-lg font-bold text-white leading-none">{user.xp}</p>
                  <p className="text-xs text-slate-500">MXP</p>
                </div>
              </div>
              <div className="absolute bottom-full right-0 mb-2 w-48 bg-dark-700 border border-dark-500 rounded-xl px-3 py-2 text-xs text-slate-300 hidden group-hover:block z-10 pointer-events-none shadow-lg">
                <p className="font-semibold text-white mb-0.5">Mental XP</p>
                <p>Earn points by checking in and talking to Arjun.</p>
              </div>
            </div>
          )}
        </div>

        {/* Mental Fitness Score */}
        <div className="card mb-6">
          <div className="flex items-center justify-between mb-3">
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
              {t.dashboard.fitnessTitle}
            </p>
            {fitnessLevel && (
              <span className={`text-xs font-bold uppercase tracking-wide ${fitnessLevel.color}`}>
                {fitnessLevel.label}
              </span>
            )}
          </div>
          {fitnessScore !== null ? (
            <>
              <div className="flex items-end gap-2 mb-3">
                <p className={`text-4xl font-bold leading-none ${fitnessLevel.color}`}>{fitnessScore}</p>
                <p className="text-slate-600 text-sm mb-1">/100</p>
              </div>
              <div className="h-2 bg-dark-700 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all duration-1000 ${fitnessLevel.bar}`}
                  style={{ width: `${fitnessScore}%` }}
                />
              </div>
              <p className="text-xs text-slate-600 mt-2">{t.dashboard.fitnessBasis}</p>
            </>
          ) : (
            <p className="text-sm text-slate-500">{t.dashboard.fitnessNoData}</p>
          )}
        </div>

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

        {/* Mental Tools row */}
        <div className="mb-6">
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3">
            {language === 'hi' ? 'मानसिक उपकरण' : 'Mental Tools'}
          </p>
          <div className="grid grid-cols-2 gap-3">
            {TOOLS.map(({ icon, label, desc, to, color, border }) => (
              <Link key={to} to={to}>
                <div className={`bg-dark-800 rounded-2xl border ${border} p-4 h-full transition-all active:scale-95`}>
                  <span className="text-2xl mb-2 block">{icon}</span>
                  <p className={`text-sm font-semibold ${color} mb-0.5`}>{label}</p>
                  <p className="text-xs text-slate-500 leading-snug">{desc}</p>
                </div>
              </Link>
            ))}
          </div>
        </div>

        {/* Daily Mental Drill */}
        {drillState.drillIndex !== null && (() => {
          const drill = DRILLS[drillState.drillIndex];
          const colors = DRILL_TYPE_COLORS[drill.type];
          const drillTitle = language === 'hi' ? drill.titleHi : drill.title;
          const drillInstruction = language === 'hi' ? drill.instructionHi : drill.instruction;
          const typeLabel = t.dashboard.drillTypeLabels[drill.type];
          return (
            <div className={`card mb-6 border-t-2 ${colors.border}`}>
              <div className="flex items-start justify-between gap-3 mb-3">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="text-2xl shrink-0">{drill.icon}</span>
                  <div className="min-w-0">
                    <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-0.5">
                      {t.dashboard.drillTitle}
                    </p>
                    <p className="font-bold text-white leading-tight truncate">{drillTitle}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${colors.badge}`}>
                    {typeLabel}
                  </span>
                  <span className="text-xs text-slate-500 bg-dark-700 border border-dark-600 px-2 py-0.5 rounded-full">
                    {drill.duration}
                  </span>
                </div>
              </div>

              {drillState.completed ? (
                <div className="flex items-center gap-2 text-win-400 text-sm font-semibold">
                  <span>✅</span>
                  <span>{t.dashboard.drillDone}</span>
                </div>
              ) : drillExpanded ? (
                <div className="animate-fade-in">
                  <p className="text-sm text-slate-300 leading-relaxed mb-4">{drillInstruction}</p>
                  <button
                    onClick={completeDrill}
                    disabled={drillLoading}
                    className="w-full py-3 rounded-xl bg-win-600 hover:bg-win-700 text-white font-semibold text-sm transition-all active:scale-95 disabled:opacity-60 flex items-center justify-center gap-2"
                  >
                    {drillLoading
                      ? <><div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> Saving…</>
                      : <>{t.dashboard.drillComplete} ✓</>}
                  </button>
                </div>
              ) : (
                <div>
                  <p className="text-sm text-slate-500 leading-relaxed mb-3 line-clamp-2">
                    {drillInstruction.substring(0, 100)}…
                  </p>
                  <button
                    onClick={() => setDrillExpanded(true)}
                    className={`text-sm font-semibold px-4 py-2 rounded-xl border transition-all active:scale-95 ${colors.badge} ${colors.border}`}
                  >
                    {t.dashboard.drillStart} →
                  </button>
                </div>
              )}
            </div>
          );
        })()}

        {/* Achievements */}
        <div className="mb-6">
          <div className="flex items-center justify-between mb-3">
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
              {t.dashboard.achievementsTitle}
            </p>
            {achievements !== null && (
              <p className="text-xs text-slate-600">
                {t.dashboard.achievementsEarned(earnedKeys.size, ALL_ACHIEVEMENTS.length)}
              </p>
            )}
          </div>
          <div className="grid grid-cols-3 gap-2">
            {ALL_ACHIEVEMENTS.map(({ key, name, icon, desc }) => {
              const earned = earnedMap[key];
              return (
                <div
                  key={key}
                  title={desc}
                  className={`bg-dark-800 border rounded-2xl p-3 text-center transition-all ${
                    earned ? 'border-dark-500' : 'border-dark-700 opacity-35'
                  }`}
                >
                  <div className={`text-3xl mb-1.5 ${earned ? '' : 'grayscale'}`}>{icon}</div>
                  <p className={`text-xs font-semibold leading-tight ${earned ? 'text-white' : 'text-slate-600'}`}>
                    {name}
                  </p>
                  {earned && (
                    <p className="text-xs text-slate-600 mt-0.5">
                      {new Date(earned.earnedAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
                    </p>
                  )}
                </div>
              );
            })}
          </div>
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
