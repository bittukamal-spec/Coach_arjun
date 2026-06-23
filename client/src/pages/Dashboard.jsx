import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import Navbar from '../components/Navbar';
import { useAuth } from '../contexts/AuthContext';
import { translations } from '../i18n/translations';
import { apiFetch } from '../api';
import {
  Flame, Zap, CheckCircle2, Wind, Trophy, ClipboardList, Gamepad2, Snowflake,
  ChevronRight, TrendingUp, TrendingDown, Minus,
} from 'lucide-react';
import { DRILLS, DRILL_TYPE_COLORS } from '../data/drills';
import {
  ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
} from 'recharts';

const TRIAL_DAYS = 14;

function getTrialDaysRemaining(user) {
  if (user?.tier === 'premium') return null;
  const start = user?.trialStarted || null;
  if (!start) return TRIAL_DAYS;
  const daysSince = Math.floor((Date.now() - new Date(start).getTime()) / (1000 * 60 * 60 * 24));
  return Math.max(0, TRIAL_DAYS - daysSince);
}

const ACH_LABELS = {
  first_checkin: { icon: '✅', en: 'First Step',   hi: 'पहला कदम' },
  streak_3:      { icon: '🔥', en: '3-Day Streak',  hi: '3 दिन स्ट्रीक' },
  streak_7:      { icon: '🔥', en: '7-Day Streak',  hi: '7 दिन स्ट्रीक' },
  streak_14:     { icon: '🔥', en: '2-Week Streak', hi: '2 हफ्ते स्ट्रीक' },
  streak_30:     { icon: '🔥', en: '30-Day Streak', hi: '30 दिन स्ट्रीक' },
  xp_100:        { icon: '⚡', en: '100 MXP',       hi: '100 MXP' },
  xp_500:        { icon: '⚡', en: '500 MXP',       hi: '500 MXP' },
  xp_1000:       { icon: '⚡', en: '1000 MXP',      hi: '1000 MXP' },
  early_bird:    { icon: '🌅', en: 'Early Bird',    hi: 'अर्ली बर्ड' },
};

function getMoodTrend(weeklyAvg, prevWeekAvg) {
  const cur  = weeklyAvg?.mood;
  const prev = prevWeekAvg?.mood;
  if (cur == null || prev == null) return 'flat';
  if (cur > prev + 0.2) return 'up';
  if (cur < prev - 0.2) return 'down';
  return 'flat';
}

function MoodSparkline({ values }) {
  if (!values || values.length < 2) return null;
  const W = 80, H = 28;
  const n = values.length;
  const pts = values.map((v, i) => ({
    x: (i / (n - 1)) * W,
    y: H - ((v - 1) / 4) * H,
  }));
  return (
    <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} className="overflow-visible">
      <polyline
        points={pts.map(p => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ')}
        fill="none" stroke="#818cf8" strokeWidth="2"
        strokeLinecap="round" strokeLinejoin="round"
      />
      {pts.map((p, i) => (
        <circle key={i} cx={p.x} cy={p.y} r="2.5" fill="#818cf8" />
      ))}
    </svg>
  );
}

function StageBanner({ message, onDismiss }) {
  return (
    <div className="mx-4 mb-5 bg-brand-500/10 border border-brand-500/25 rounded-xl px-4 py-3 flex items-start justify-between gap-2">
      <p className="text-xs text-brand-400 leading-relaxed flex-1">{message}</p>
      <button onClick={onDismiss} className="text-slt hover:text-ink shrink-0 text-base leading-none mt-0.5">×</button>
    </div>
  );
}

function SectionLabel({ children }) {
  return (
    <p className="text-[11px] font-bold text-slt uppercase tracking-widest mb-3 px-4">
      {children}
    </p>
  );
}

function Dashboard() {
  const { user, token, language } = useAuth();
  const t  = translations[language];
  const td = t.dashboard;
  const hi = language === 'hi';
  const isPremium = user?.tier === 'premium';
  const trialDaysRemaining = getTrialDaysRemaining(user);
  const trialEnded = !isPremium && trialDaysRemaining === 0;

  // ── core state ─────────────────────────────────────────────────────────────
  const [todayCheckIn,    setTodayCheckIn]    = useState(null);
  const [streak,          setStreak]          = useState(null);
  const [drillState,      setDrillState]      = useState({ drillIndex: null, completed: false });
  const [drillExpanded,   setDrillExpanded]   = useState(false);
  const [drillLoading,    setDrillLoading]    = useState(false);
  const [freezeCount,     setFreezeCount]     = useState(null);
  const [totalCheckIns,   setTotalCheckIns]   = useState(0);
  const [fitnessScore,    setFitnessScore]    = useState(null);
  const [infoPopup,       setInfoPopup]       = useState(null);
  const [showFreezeConfirm, setShowFreezeConfirm] = useState(false);
  const [freezeLoading,   setFreezeLoading]   = useState(false);
  const [missedDismissed, setMissedDismissed] = useState(
    () => localStorage.getItem('arjun_missed_dismissed') === new Date().toISOString().slice(0, 10)
  );

  // ── progressive disclosure state ───────────────────────────────────────────
  const [progressLoaded, setProgressLoaded] = useState(false);
  const [chartData,      setChartData]      = useState([]);
  const [weeklyAvg,      setWeeklyAvg]      = useState(null);
  const [prevWeekAvg,    setPrevWeekAvg]    = useState(null);
  const [achievements,   setAchievements]   = useState([]);
  const [stageBanner,    setStageBanner]    = useState(null);
  const [chartDays,      setChartDays]      = useState(7);
  const [chartData30,    setChartData30]    = useState(null);

  // ── data fetch ─────────────────────────────────────────────────────────────
  useEffect(() => {
    apiFetch('/api/checkin/today', { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.ok ? r.json() : null)
      .then(data => setTodayCheckIn(data?.checkIn || false))
      .catch(() => setTodayCheckIn(false));

    apiFetch('/api/progress/summary?days=7', { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        setStreak(data?.streak ?? 0);
        setFreezeCount(data?.freezeCount ?? 0);
        setTotalCheckIns(data?.totalCheckIns ?? 0);
        if (data?.fitnessScore !== undefined) setFitnessScore(data.fitnessScore);
        if (data?.chartData)   setChartData(data.chartData);
        if (data?.weeklyAvg)   setWeeklyAvg(data.weeklyAvg);
        if (data?.prevWeekAvg) setPrevWeekAvg(data.prevWeekAvg);
        if (data?.achievements) setAchievements(data.achievements);
        setProgressLoaded(true);
      })
      .catch(() => setProgressLoaded(true));

    apiFetch('/api/drills/today', { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.ok ? r.json() : null)
      .then(data => { if (data) setDrillState(data); })
      .catch(() => {});
  }, [token]);

  // ── stage banner (one-time) ────────────────────────────────────────────────
  useEffect(() => {
    if (!progressLoaded) return;
    const s = totalCheckIns === 0 ? 1 : totalCheckIns < 7 ? 2 : 3;
    if (s === 2 && !localStorage.getItem('arjun_stage2_banner_shown')) {
      setStageBanner(2);
      localStorage.setItem('arjun_stage2_banner_shown', new Date().toISOString().slice(0, 10));
    } else if (s === 3 && !localStorage.getItem('arjun_stage3_banner_shown')) {
      setStageBanner(3);
      localStorage.setItem('arjun_stage3_banner_shown', new Date().toISOString().slice(0, 10));
    }
  }, [progressLoaded, totalCheckIns]);

  // ── 30-day chart lazy fetch ────────────────────────────────────────────────
  useEffect(() => {
    if (chartDays !== 30 || chartData30 !== null) return;
    apiFetch('/api/progress/summary?days=30', { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.ok ? r.json() : null)
      .then(data => { if (data?.chartData) setChartData30(data.chartData); })
      .catch(() => setChartData30([]));
  }, [chartDays, chartData30, token]);

  // ── handlers ───────────────────────────────────────────────────────────────
  async function completeDrill() {
    if (drillLoading) return;
    setDrillLoading(true);
    try {
      const res = await apiFetch('/api/drills/complete', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) setDrillState(prev => ({ ...prev, completed: true }));
    } finally {
      setDrillLoading(false);
    }
  }

  async function useFreeze() {
    setFreezeLoading(true);
    try {
      const res = await apiFetch('/api/streaks/freeze', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setStreak(data.streak);
        setFreezeCount(data.freezeCount);
        setShowFreezeConfirm(false);
        const today = new Date().toISOString().slice(0, 10);
        localStorage.setItem('arjun_missed_dismissed', today);
        setMissedDismissed(true);
      }
    } finally {
      setFreezeLoading(false);
    }
  }

  function dismissMissed() {
    localStorage.setItem('arjun_missed_dismissed', new Date().toISOString().slice(0, 10));
    setMissedDismissed(true);
  }

  // ── derived values ─────────────────────────────────────────────────────────
  const stage = !progressLoaded ? null : totalCheckIns === 0 ? 1 : totalCheckIns < 7 ? 2 : 3;
  const hour  = new Date().getHours();
  const timeGreeting = hour < 12
    ? (hi ? 'सुप्रभात'  : 'Good morning')
    : hour < 17
    ? (hi ? 'नमस्ते'   : 'Good afternoon')
    : (hi ? 'शुभ संध्या' : 'Good evening');
  const ts              = translations[language].streak;
  const missedYesterday = streak === 0 && todayCheckIn === false && totalCheckIns > 0;
  const showDayOne      = (streak ?? 0) <= 1 && todayCheckIn !== null;
  const moodTrend       = getMoodTrend(weeklyAvg, prevWeekAvg);
  const sparkValues     = chartData.slice(-7).map(d => d.mood);
  const activeChartData = chartDays === 7 ? chartData : (chartData30 || []);

  const TOOLS = [
    { Icon: Wind,          label: hi ? 'श्वास'         : 'Breathing',      to: '/breathing', color: 'text-brand-600' },
    { Icon: Zap,           label: hi ? 'प्रेशर रीसेट' : 'Pressure reset', to: '/reset',     color: 'text-fire-600'  },
    { Icon: Trophy,        label: hi ? 'रिचुअल'       : 'Ritual',         to: '/ritual',    color: 'text-amber-600' },
    { Icon: ClipboardList, label: hi ? 'डीब्रीफ'       : 'Debrief',        to: '/debrief',   color: 'text-sky-600'   },
    { Icon: Gamepad2,      label: hi ? 'गेम्स'        : 'Games',          to: '/games',     color: 'text-violet-600'},
  ];

  // ── render helpers ─────────────────────────────────────────────────────────
  function renderCheckinCard() {
    if (todayCheckIn === null) {
      return (
        <div className="bg-dark-800 border border-dark-600 rounded-2xl p-5 space-y-3 animate-pulse">
          <div className="h-3 bg-dark-700 rounded w-20" />
          <div className="h-5 bg-dark-700 rounded w-40" />
          <div className="h-10 bg-dark-700 rounded-xl" />
        </div>
      );
    }
    if (todayCheckIn) {
      return (
        <div className="bg-dark-800 border border-dark-600 rounded-2xl p-5">
          <div className="flex items-center gap-2 mb-4">
            <CheckCircle2 size={15} className="text-win-500 shrink-0" />
            <p className="text-sm font-semibold text-win-600">
              {hi ? 'आज का चेक-इन हो गया' : "Today's check-in done"}
            </p>
          </div>
          {[
            { key: 'mood',       label: hi ? 'मूड'          : 'Mood',       color: 'bg-brand-500' },
            { key: 'focus',      label: hi ? 'फोकस'        : 'Focus',      color: 'bg-sky-500'   },
            { key: 'confidence', label: hi ? 'आत्मविश्वास' : 'Confidence', color: 'bg-win-500'   },
          ].map(({ key, label, color }) => (
            <div key={key} className="mb-3 last:mb-0">
              <div className="flex justify-between mb-1">
                <span className="text-xs text-slt">{label}</span>
                <span className="text-xs font-bold text-ink">{todayCheckIn[key]}/5</span>
              </div>
              <div className="h-1.5 bg-dark-700 rounded-full overflow-hidden">
                <div className={`h-full rounded-full ${color}`} style={{ width: `${(todayCheckIn[key] / 5) * 100}%` }} />
              </div>
            </div>
          ))}
        </div>
      );
    }
    return (
      <Link to="/checkin">
        <div className="bg-dark-800 border border-dark-600 rounded-2xl p-5 active:scale-[0.99] transition-transform">
          <p className="text-xs text-slt font-semibold uppercase tracking-wide mb-1">
            {hi ? 'दैनिक चेक-इन' : 'Daily check-in'}
          </p>
          <p className="text-xl font-bold text-ink mb-1">
            {hi ? 'आज मन कैसा है?' : "How's your mind today?"}
          </p>
          <p className="text-sm text-slt mb-5">
            {hi ? 'मूड, फोकस और आत्मविश्वास रेट करें' : 'Rate your mood, focus & confidence'}
          </p>
          <div className="bg-brand-600 rounded-xl py-3 text-center">
            <span className="text-white font-bold text-sm">{hi ? 'चेक-इन करें' : 'Check in now'}</span>
          </div>
        </div>
      </Link>
    );
  }

  function renderDrillCard(dashed = false) {
    if (drillState.drillIndex === null) return null;
    const drill  = DRILLS[drillState.drillIndex];
    const colors = DRILL_TYPE_COLORS[drill.type];
    const title  = hi ? drill.titleHi       : drill.title;
    const instr  = hi ? drill.instructionHi : drill.instruction;
    return (
      <div className="mb-7">
        <SectionLabel>{hi ? 'आज का अभ्यास' : "Today's Drill"}</SectionLabel>
        <div className="px-4">
          <div className={`border rounded-2xl overflow-hidden ${dashed ? 'bg-transparent border-dark-600 border-dashed' : 'bg-dark-800 border-dark-600'}`}>
            <button
              onClick={() => !drillState.completed && setDrillExpanded(s => !s)}
              className="w-full flex items-center gap-4 p-4 text-left"
            >
              <div className={`w-11 h-11 rounded-xl flex items-center justify-center text-xl shrink-0 ${colors.badge}`}>
                {drill.icon}
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-ink leading-tight">{title}</p>
                <p className="text-xs text-slt mt-0.5">⏱ {drill.duration}</p>
              </div>
              {drillState.completed
                ? <CheckCircle2 size={18} className="text-win-500 shrink-0" />
                : <span className="text-xs font-bold text-brand-600 shrink-0">
                    {drillExpanded ? (hi ? 'बंद करें' : 'Close') : (hi ? 'शुरू →' : 'Start →')}
                  </span>
              }
            </button>
            {drillExpanded && !drillState.completed && (
              <div className="px-4 pb-4 border-t border-dark-600 pt-4 animate-fade-in">
                <p className="text-sm text-ink leading-relaxed mb-4">{instr}</p>
                <button
                  onClick={completeDrill}
                  disabled={drillLoading}
                  className="w-full py-3 rounded-xl bg-win-600 hover:bg-win-700 text-white font-bold text-sm transition-all active:scale-95 disabled:opacity-60"
                >
                  {drillLoading ? '…' : (hi ? 'पूरा किया ✓ +15 MXP' : 'Done ✓  +15 MXP')}
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  // ── render ─────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-dark-900">
      <Navbar />

      <main className="max-w-lg mx-auto pt-20 pb-24 animate-fade-in">

        {/* ── Loading ─────────────────────────────────────────── */}
        {stage === null && (
          <div className="px-4 pt-8 space-y-4 animate-pulse">
            <div className="h-4 bg-dark-800 rounded w-28" />
            <div className="h-6 bg-dark-800 rounded w-44" />
            <div className="h-40 bg-dark-800 rounded-2xl mt-6" />
          </div>
        )}

        {/* ══ STAGE 1 ═══════════════════════════════════════════ */}
        {stage === 1 && (
          <>
            {/* Simple header */}
            <div className="px-4 pt-5 pb-6">
              <p className="text-xs text-slt">{timeGreeting}</p>
              <p className="text-2xl font-bold text-ink mt-0.5">{user?.name}</p>
              <p className="text-sm text-slt mt-2">{td.greetStart}</p>
              <p className="text-xs text-slt mt-0.5">{td.greetArjunReady}</p>
            </div>

            {/* Big brand check-in card */}
            <div className="px-4 mb-6">
              <Link to="/checkin">
                <div className="bg-brand-600 rounded-2xl p-6 active:scale-[0.99] transition-transform">
                  <p className="text-xs font-bold text-white/70 uppercase tracking-wide mb-1">
                    {td.firstCheckin}
                  </p>
                  <p className="text-xl font-bold text-white mb-1">
                    {hi ? 'आज मन कैसा है?' : "How's your mind today?"}
                  </p>
                  <p className="text-sm text-white/70 mb-5">{td.firstCheckinSub}</p>
                  <div className="bg-white/20 rounded-xl py-3 text-center">
                    <span className="text-white font-bold text-sm">
                      {hi ? 'चेक-इन करें' : 'Check in now'}
                    </span>
                  </div>
                </div>
              </Link>
            </div>

            {/* Outline drill card */}
            {renderDrillCard(true)}

            {/* Meet Arjun link */}
            <div className="flex justify-center mt-4 mb-6">
              <Link to="/coaching" className="flex items-center gap-1 text-sm text-brand-500 font-semibold">
                {td.meetArjun} <ChevronRight size={14} />
              </Link>
            </div>

            {trialEnded && (
              <div className="px-4 mt-4">
                <div className="bg-brand-600 rounded-2xl p-5">
                  <p className="font-bold text-white mb-1">🚀 {td.upgradePrompt}</p>
                  <p className="text-white/80 text-sm mb-4">
                    {hi ? 'असीमित AI कोचिंग · सभी सुविधाएं' : 'Unlimited AI coaching · All features'}
                  </p>
                  <button className="bg-white text-brand-700 font-bold text-sm py-3 rounded-xl w-full">
                    {td.upgrade}
                  </button>
                </div>
              </div>
            )}
          </>
        )}

        {/* ══ STAGE 2 ═══════════════════════════════════════════ */}
        {stage === 2 && (
          <>
            {/* Header */}
            <div className="px-4 pt-5 pb-2 flex items-center gap-3">
              <div className="w-11 h-11 rounded-full bg-brand-500 text-white font-bold text-lg flex items-center justify-center shrink-0">
                {user?.name?.charAt(0)?.toUpperCase()}
              </div>
              <div>
                <p className="text-xs text-slt">{td.greetEarly}</p>
                <p className="text-base font-bold text-ink">{user?.name}</p>
              </div>
            </div>
            <p className="text-xs text-slt px-4 mb-5 leading-relaxed">{td.arjunLearning}</p>

            {stageBanner === 2 && (
              <StageBanner message={td.stage2Banner} onDismiss={() => setStageBanner(null)} />
            )}

            {/* Primary action */}
            <div className="mb-7">
              <SectionLabel>{hi ? 'आज' : 'Today'}</SectionLabel>
              <div className="px-4">{renderCheckinCard()}</div>
            </div>

            {/* Coach card when checked in */}
            {todayCheckIn && (
              <div className="mb-7 px-4">
                <Link to="/coaching">
                  <div className="bg-dark-800 border border-dark-600 rounded-2xl p-4 flex items-center gap-4 active:scale-[0.99] transition-transform">
                    <div className="w-11 h-11 bg-brand-500 rounded-full flex items-center justify-center text-white font-bold text-lg shrink-0">
                      A
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-bold text-ink">{hi ? 'अर्जुन' : 'Arjun'}</p>
                      <p className="text-sm text-slt">{td.talkToArjunSub}</p>
                    </div>
                    <div className="bg-brand-600 text-white text-sm font-semibold px-3 py-1.5 rounded-xl shrink-0">
                      {hi ? 'चैट' : 'Chat'}
                    </div>
                  </div>
                </Link>
              </div>
            )}

            {/* Streak card (only if streak >= 1) */}
            {streak !== null && streak >= 1 && (
              <div className="mb-7">
                <SectionLabel>{hi ? 'ट्रेनिंग स्ट्रीक' : 'Training Streak'}</SectionLabel>
                <div className="px-4">
                  <div className="bg-dark-800 border border-dark-600 rounded-2xl p-5">
                    <div className="flex items-center gap-2 mb-1">
                      <Flame size={20} className="text-fire-500" />
                      <span className="text-3xl font-black text-ink leading-none">{streak}</span>
                      <span className="text-sm font-medium text-slt ml-1">
                        {hi ? 'दिन की स्ट्रीक' : 'day streak'}
                      </span>
                    </div>
                    <p className="text-xs text-slt">{ts.consecutiveDays}</p>
                  </div>
                </div>
              </div>
            )}

            {/* Mood sparkline (3+ check-ins) */}
            {totalCheckIns >= 3 && sparkValues.length >= 2 && (
              <div className="mb-7">
                <SectionLabel>{td.moodThisWeek}</SectionLabel>
                <div className="px-4">
                  <div className="bg-dark-800 border border-dark-600 rounded-2xl p-4 flex items-center gap-5">
                    <MoodSparkline values={sparkValues} />
                    <div>
                      <p className="text-lg font-black text-ink">
                        {weeklyAvg?.mood != null ? weeklyAvg.mood : '–'}
                        <span className="text-sm font-medium text-slt"> / 5</span>
                      </p>
                      <p className="text-xs text-slt">{hi ? 'इस हफ्ते का औसत' : 'this week avg'}</p>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Drill */}
            {renderDrillCard(false)}

            {trialEnded && (
              <div className="px-4 mb-4">
                <div className="bg-brand-600 rounded-2xl p-5">
                  <p className="font-bold text-white mb-1">🚀 {td.upgradePrompt}</p>
                  <p className="text-white/80 text-sm mb-4">
                    {hi ? 'असीमित AI कोचिंग · सभी सुविधाएं' : 'Unlimited AI coaching · All features'}
                  </p>
                  <button className="bg-white text-brand-700 font-bold text-sm py-3 rounded-xl w-full">
                    {td.upgrade}
                  </button>
                </div>
              </div>
            )}
            {!isPremium && !trialEnded && trialDaysRemaining != null && trialDaysRemaining <= 3 && (
              <p className="text-center text-xs text-fire-600 font-semibold pb-2">
                ⏰ {trialDaysRemaining === 1
                  ? (hi ? 'ट्रायल का आखिरी दिन' : 'Last day of trial')
                  : (hi ? `${trialDaysRemaining} दिन बचे` : `${trialDaysRemaining} days left`)}
              </p>
            )}
            {!isPremium && !trialEnded && trialDaysRemaining != null && trialDaysRemaining > 3 && (
              <p className="text-center text-xs text-slt pb-2">
                {trialDaysRemaining} {td.trialDaysLeft}
              </p>
            )}
          </>
        )}

        {/* ══ STAGE 3 ═══════════════════════════════════════════ */}
        {stage === 3 && (
          <>
            {/* Avatar + pills header */}
            <div className="px-4 pt-5 pb-4">
              <div className="flex items-center gap-3 mb-1">
                <div className="w-11 h-11 rounded-full bg-brand-500 text-white font-bold text-lg flex items-center justify-center shrink-0">
                  {user?.name?.charAt(0)?.toUpperCase()}
                </div>
                <div>
                  <p className="text-xs text-slt">{timeGreeting}</p>
                  <p className="text-base font-bold text-ink leading-tight">{user?.name}</p>
                  <p className="text-xs text-slt">{td.greetEstablished}</p>
                </div>
              </div>
              <div className="flex gap-2 mt-3">
                <button
                  onClick={() => setInfoPopup('streak')}
                  className="flex items-center gap-1.5 bg-dark-800 border border-dark-600 px-3 py-1.5 rounded-full active:scale-95 transition-transform"
                >
                  <Flame size={13} className={streak > 0 ? 'text-fire-500' : 'text-slt'} />
                  <span className="text-xs font-bold text-ink">{streak ?? 0}</span>
                  <span className="text-[10px] text-slt">{hi ? 'स्ट्रीक' : 'streak'}</span>
                </button>
                {user?.xp !== undefined && (
                  <button
                    onClick={() => setInfoPopup('xp')}
                    className="flex items-center gap-1.5 bg-dark-800 border border-dark-600 px-3 py-1.5 rounded-full active:scale-95 transition-transform"
                  >
                    <Zap size={13} className="text-brand-500" />
                    <span className="text-xs font-bold text-ink">{user.xp}</span>
                    <span className="text-[10px] text-slt">MXP</span>
                  </button>
                )}
                {fitnessScore !== null && (
                  <button
                    onClick={() => setInfoPopup('fitness')}
                    className={`flex items-center gap-1.5 border px-3 py-1.5 rounded-full active:scale-95 transition-transform ${
                      fitnessScore >= 90 ? 'bg-amber-500/10 border-amber-500/30' :
                      fitnessScore >= 75 ? 'bg-win-500/10 border-win-500/30'     :
                      fitnessScore >= 60 ? 'bg-brand-500/10 border-brand-500/30' :
                      'bg-dark-800 border-dark-600'
                    }`}
                  >
                    <span className={`text-xs font-black ${
                      fitnessScore >= 90 ? 'text-amber-400' :
                      fitnessScore >= 75 ? 'text-win-400'   :
                      fitnessScore >= 60 ? 'text-brand-400' : 'text-slt'
                    }`}>{fitnessScore}</span>
                    <span className="text-[10px] text-slt">{hi ? 'मानसिक फिटनेस' : 'Mental Fitness'}</span>
                  </button>
                )}
              </div>
            </div>

            {stageBanner === 3 && (
              <StageBanner message={td.stage3Banner} onDismiss={() => setStageBanner(null)} />
            )}

            {/* Today */}
            <div className="mb-7">
              <SectionLabel>{hi ? 'आज' : 'Today'}</SectionLabel>
              <div className="px-4">{renderCheckinCard()}</div>
            </div>

            {/* Training Streak */}
            {streak !== null && (
              <div className="mb-7">
                <SectionLabel>{hi ? 'ट्रेनिंग स्ट्रीक' : 'Training Streak'}</SectionLabel>
                <div className="px-4">
                  <div className="bg-dark-800 border border-dark-600 rounded-2xl p-5">
                    {missedYesterday && !missedDismissed && (
                      <div className="flex items-start justify-between gap-2 mb-4 bg-fire-500/10 border border-fire-500/20 rounded-xl px-3 py-2.5">
                        <p className="text-xs text-fire-600 leading-relaxed flex-1">
                          {freezeCount > 0 ? ts.missedWithFreeze : ts.missedNoFreeze}
                        </p>
                        <button onClick={dismissMissed} className="text-slt hover:text-ink shrink-0 text-base leading-none ml-1">×</button>
                      </div>
                    )}
                    <div className="flex items-center gap-2 mb-1">
                      <Flame size={20} className={streak > 0 ? 'text-fire-500' : 'text-slt'} />
                      <span className="text-3xl font-black text-ink leading-none">{streak}</span>
                      <span className="text-sm font-medium text-slt ml-1">
                        {hi ? 'दिन की ट्रेनिंग स्ट्रीक' : 'day training streak'}
                      </span>
                    </div>
                    <p className="text-xs text-slt mb-1">{ts.consecutiveDays}</p>
                    {showDayOne && (
                      <p className="text-xs text-brand-600 font-medium mb-1">{ts.dayOne}</p>
                    )}
                    {todayCheckIn === false && freezeCount !== null && (
                      <div className="flex items-center gap-2 mt-3 pt-3 border-t border-dark-600">
                        <Snowflake size={14} className={freezeCount > 0 ? 'text-sky-400' : 'text-dark-500'} />
                        {freezeCount > 0 ? (
                          <>
                            <span className="text-xs text-slt flex-1">{ts.freezeAvailable(freezeCount)}</span>
                            <button
                              onClick={() => setShowFreezeConfirm(true)}
                              className="text-xs font-semibold text-brand-600 hover:text-brand-500 transition-colors"
                            >
                              {ts.useFreezeBtn}
                            </button>
                          </>
                        ) : (
                          <span className="text-xs text-dark-500">{ts.freezeEmpty}</span>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* Trend + chart */}
            <div className="mb-7">
              <div className="flex items-center justify-between px-4 mb-3">
                <p className="text-[11px] font-bold text-slt uppercase tracking-widest">
                  {hi ? 'मानसिक फिटनेस' : 'Mental Fitness'}
                </p>
                <div className="flex items-center gap-1">
                  {moodTrend === 'up'   && <TrendingUp   size={13} className="text-win-500" />}
                  {moodTrend === 'down' && <TrendingDown  size={13} className="text-fire-500" />}
                  {moodTrend === 'flat' && <Minus         size={13} className="text-slt" />}
                  <span className="text-xs text-slt ml-0.5">
                    {moodTrend === 'up' ? td.trendUp : moodTrend === 'down' ? td.trendDown : td.trendFlat}
                  </span>
                </div>
              </div>
              <div className="px-4">
                <div className="bg-dark-800 border border-dark-600 rounded-2xl p-4">
                  <div className="flex gap-1 mb-4">
                    {[7, 30].map(d => (
                      <button
                        key={d}
                        onClick={() => setChartDays(d)}
                        className={`px-3 py-1 rounded-lg text-xs font-semibold transition-colors ${
                          chartDays === d ? 'bg-brand-600 text-white' : 'text-slt hover:text-ink'
                        }`}
                      >
                        {d}{hi ? 'दिन' : 'd'}
                      </button>
                    ))}
                  </div>
                  {activeChartData.length > 1 ? (
                    <ResponsiveContainer width="100%" height={140}>
                      <LineChart data={activeChartData} margin={{ top: 4, right: 4, bottom: 0, left: -32 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#2a2a2a" />
                        <XAxis dataKey="date" tick={{ fontSize: 9, fill: '#666' }} interval="preserveStartEnd" />
                        <YAxis domain={[1, 5]} tick={{ fontSize: 9, fill: '#666' }} />
                        <Tooltip
                          contentStyle={{ background: '#1a1a1a', border: '1px solid #333', borderRadius: 8, fontSize: 11 }}
                        />
                        <Line type="monotone" dataKey="mood"       stroke="#818cf8" strokeWidth={2} dot={false} name={hi ? 'मूड'       : 'Mood'} />
                        <Line type="monotone" dataKey="focus"      stroke="#38bdf8" strokeWidth={2} dot={false} name={hi ? 'फोकस'      : 'Focus'} />
                        <Line type="monotone" dataKey="confidence" stroke="#4ade80" strokeWidth={2} dot={false} name={hi ? 'विश्वास'   : 'Conf'} />
                      </LineChart>
                    </ResponsiveContainer>
                  ) : (
                    <p className="text-xs text-slt text-center py-6">
                      {hi ? 'डेटा के लिए और चेक-इन करें' : 'Check in more days for chart data'}
                    </p>
                  )}
                </div>
              </div>
            </div>

            {/* Weekly averages */}
            {weeklyAvg && (weeklyAvg.mood !== null || weeklyAvg.focus !== null) && (
              <div className="mb-7">
                <SectionLabel>{td.weeklyAvgTitle}</SectionLabel>
                <div className="px-4 grid grid-cols-3 gap-2">
                  {[
                    { key: 'mood',       label: hi ? 'मूड'          : 'Mood', color: 'text-brand-400' },
                    { key: 'focus',      label: hi ? 'फोकस'        : 'Focus', color: 'text-sky-400' },
                    { key: 'confidence', label: hi ? 'आत्मविश्वास' : 'Conf',  color: 'text-win-400' },
                  ].map(({ key, label, color }) => (
                    <div key={key} className="bg-dark-800 border border-dark-600 rounded-2xl p-3 text-center">
                      <p className={`text-xl font-black ${color}`}>{weeklyAvg[key] ?? '–'}</p>
                      <p className="text-[10px] text-slt mt-0.5">{label}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Coach */}
            <div className="mb-7">
              <SectionLabel>{hi ? 'आपका कोच' : 'Your Coach'}</SectionLabel>
              <div className="px-4">
                <Link to="/coaching">
                  <div className="bg-dark-800 border border-dark-600 rounded-2xl p-4 flex items-center gap-4 active:scale-[0.99] transition-transform">
                    <div className="w-12 h-12 bg-brand-500 rounded-full flex items-center justify-center text-white font-bold text-lg shrink-0">
                      A
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-bold text-ink">{hi ? 'अर्जुन' : 'Arjun'}</p>
                      <p className="text-sm text-slt">{hi ? 'मानसिक प्रदर्शन कोच' : 'Mental performance coach'}</p>
                    </div>
                    <div className="bg-brand-600 text-white text-sm font-semibold px-4 py-2 rounded-xl shrink-0">
                      {hi ? 'चैट' : 'Chat'}
                    </div>
                  </div>
                </Link>
              </div>
            </div>

            {/* Drill */}
            {renderDrillCard(false)}

            {/* Mental Tools */}
            <div className="mb-7">
              <SectionLabel>{hi ? 'मानसिक उपकरण' : 'Mental Tools'}</SectionLabel>
              <div className="px-4 grid grid-cols-5 gap-2">
                {TOOLS.map(({ Icon, label, to, color }) => (
                  <Link key={to} to={to}>
                    <div className="bg-dark-800 border border-dark-600 rounded-2xl p-2.5 flex flex-col items-center gap-2 active:scale-95 transition-transform">
                      <Icon size={20} className={color} />
                      <span className="text-[10px] font-medium text-slt text-center leading-tight">{label}</span>
                    </div>
                  </Link>
                ))}
              </div>
            </div>

            {/* Earned badges */}
            {achievements.length > 0 && (
              <div className="mb-7">
                <SectionLabel>{td.earnedBadges}</SectionLabel>
                <div className="px-4 flex gap-2 overflow-x-auto pb-1">
                  {achievements.map(key => {
                    const ach = ACH_LABELS[key];
                    if (!ach) return null;
                    return (
                      <div key={key} className="flex-shrink-0 bg-dark-800 border border-dark-600 rounded-2xl px-3 py-2.5 flex flex-col items-center gap-1 w-20">
                        <span className="text-lg">{ach.icon}</span>
                        <span className="text-[10px] text-slt text-center leading-tight">{hi ? ach.hi : ach.en}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Link to full progress */}
            <div className="px-4 mb-4">
              <Link to="/progress" className="flex items-center justify-center gap-1 text-xs text-brand-500 font-semibold py-2">
                {td.viewFullProgress} <ChevronRight size={12} />
              </Link>
            </div>

            {/* Trial banners */}
            {trialEnded && (
              <div className="px-4 mb-4">
                <div className="bg-brand-600 rounded-2xl p-5">
                  <p className="font-bold text-white mb-1">🚀 {td.upgradePrompt}</p>
                  <p className="text-white/80 text-sm mb-4">
                    {hi ? 'असीमित AI कोचिंग · सभी सुविधाएं' : 'Unlimited AI coaching · All features'}
                  </p>
                  <button className="bg-white text-brand-700 font-bold text-sm py-3 rounded-xl w-full">
                    {td.upgrade}
                  </button>
                </div>
              </div>
            )}
            {!isPremium && !trialEnded && trialDaysRemaining != null && trialDaysRemaining <= 3 && (
              <div className="px-4 mb-4">
                <Link to="/account">
                  <div className="bg-dark-800 border border-fire-500/40 rounded-2xl px-4 py-3 flex items-center justify-between">
                    <p className="text-sm font-semibold text-fire-600">
                      ⏰ {trialDaysRemaining === 1
                        ? (hi ? 'ट्रायल का आखिरी दिन' : 'Last day of trial')
                        : (hi ? `${trialDaysRemaining} दिन बचे` : `${trialDaysRemaining} days left`)}
                    </p>
                    <span className="text-xs font-bold text-brand-600">{hi ? 'अपग्रेड →' : 'Upgrade →'}</span>
                  </div>
                </Link>
              </div>
            )}
            {!isPremium && !trialEnded && trialDaysRemaining != null && trialDaysRemaining > 3 && (
              <p className="text-center text-xs text-slt pb-2">
                {trialDaysRemaining} {td.trialDaysLeft}
              </p>
            )}
          </>
        )}

        {/* ── INFO POPUP SHEET ───────────────────────────────────────────────── */}
        {infoPopup && (
          <>
            <div className="fixed inset-0 z-50 bg-black/60" onClick={() => setInfoPopup(null)} />
            <div className="fixed bottom-0 inset-x-0 z-50 bg-dark-800 border-t border-dark-600 rounded-t-2xl px-5 py-6 animate-fade-in">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-base font-bold text-ink">
                  {infoPopup === 'streak'  && (hi ? 'ट्रेनिंग स्ट्रीक'      : 'Training Streak')}
                  {infoPopup === 'xp'      && (hi ? 'मानसिक XP (MXP)'      : 'Mental XP (MXP)')}
                  {infoPopup === 'fitness' && (hi ? 'मानसिक फिटनेस स्कोर'  : 'Mental Fitness Score')}
                </h3>
                <button onClick={() => setInfoPopup(null)} className="text-slt hover:text-ink text-xl leading-none">×</button>
              </div>

              {infoPopup === 'streak' && (
                <div className="space-y-3">
                  <p className="text-sm text-ink leading-relaxed">
                    {hi
                      ? 'लगातार कितने दिनों से मानसिक ट्रेनिंग हो रही है — यही स्ट्रीक है।'
                      : 'Your streak counts consecutive days of mental training — daily check-ins keep it alive.'}
                  </p>
                  <div className="bg-dark-700 rounded-xl px-4 py-3 space-y-1.5">
                    {[
                      [hi ? '3 दिन'  : '3 days',  hi ? 'आदत बन रही है'       : 'Habit forming'],
                      [hi ? '7 दिन'  : '7 days',  hi ? 'एक हफ्ते की अनुशासन' : 'One week of discipline'],
                      [hi ? '14 दिन' : '14 days', hi ? 'दिमाग मजबूत हो रहा है' : 'Mind getting stronger'],
                      [hi ? '30 दिन' : '30 days', hi ? 'चैंपियन की ट्रेनिंग'  : "Champion's training"],
                    ].map(([days, label]) => (
                      <div key={days} className="flex items-center justify-between">
                        <span className="text-xs font-bold text-fire-500">{days}</span>
                        <span className="text-xs text-slt">{label}</span>
                      </div>
                    ))}
                  </div>
                  <p className="text-xs text-slt leading-relaxed">
                    {hi
                      ? '❄️ स्ट्रीक फ्रीज: अगर कल मिस हो गया तो फ्रीज से स्ट्रीक बचाएं। हर 7 दिन पर नया फ्रीज मिलता है।'
                      : '❄️ Streak Freeze: missed yesterday? Use a freeze to save your streak. Earn a new freeze every 7 days.'}
                  </p>
                </div>
              )}

              {infoPopup === 'xp' && (
                <div className="space-y-3">
                  <p className="text-sm text-ink leading-relaxed">
                    {hi
                      ? 'MXP (मानसिक XP) आपकी मानसिक मेहनत का माप है। जितना काम, उतने पॉइंट।'
                      : 'MXP (Mental XP) measures your mental training effort. More work = more points.'}
                  </p>
                  <div className="bg-dark-700 rounded-xl px-4 py-3 space-y-1.5">
                    {[
                      [hi ? 'दैनिक चेक-इन'   : 'Daily check-in',    '+10 MXP'],
                      [hi ? 'रिफ्लेक्शन'     : 'With reflection',    '+5 MXP'],
                      [hi ? 'अभ्यास पूरा'    : "Today's drill",      '+15 MXP'],
                      [hi ? 'अर्जुन से चैट'  : 'Chat with Arjun',   '+5 MXP'],
                    ].map(([action, pts]) => (
                      <div key={action} className="flex items-center justify-between">
                        <span className="text-xs text-slt">{action}</span>
                        <span className="text-xs font-bold text-brand-500">{pts}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {infoPopup === 'fitness' && (
                <div className="space-y-3">
                  <p className="text-sm text-ink leading-relaxed">
                    {hi
                      ? 'मानसिक फिटनेस स्कोर 0–100 के बीच होता है। यह 4 चीज़ों से बनता है:'
                      : 'Your Mental Fitness Score is 0–100, built from 4 components:'}
                  </p>
                  <div className="bg-dark-700 rounded-xl px-4 py-3 space-y-2">
                    {[
                      [hi ? 'स्ट्रीक'        : 'Streak',       '25pts', hi ? '14 दिन स्ट्रीक = 25'          : '14-day streak = 25'],
                      [hi ? 'नियमितता'       : 'Consistency',  '25pts', hi ? 'पिछले 14 दिन में चेक-इन'       : 'Check-ins in last 14 days'],
                      [hi ? 'मानसिक अवस्था'  : 'Mental State', '30pts', hi ? 'साप्ताहिक मूड/फोकस/विश्वास'    : 'Weekly mood/focus/confidence'],
                      [hi ? 'उपलब्धियां'     : 'Achievements', '20pts', hi ? '9 बैज = 20 पॉइंट'              : '9 badges = full 20 points'],
                    ].map(([name, pts, desc]) => (
                      <div key={name} className="flex items-start gap-3">
                        <span className="text-xs font-black text-brand-500 w-10 shrink-0 pt-0.5">{pts}</span>
                        <div>
                          <p className="text-xs font-semibold text-ink">{name}</p>
                          <p className="text-[11px] text-slt">{desc}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                  <div className="flex gap-2 flex-wrap">
                    {[
                      [hi ? 'चैंपियन' : 'Champion', '90+', 'text-amber-400'],
                      [hi ? 'बढ़िया'   : 'Strong',   '75+', 'text-win-400'],
                      [hi ? 'ठीक है'  : 'Building', '60+', 'text-brand-400'],
                      [hi ? 'शुरुआत'  : 'Starting', '<60', 'text-slt'],
                    ].map(([label, range, color]) => (
                      <span key={label} className="text-[11px] bg-dark-700 px-2.5 py-1 rounded-full">
                        <span className={`font-bold ${color}`}>{range}</span>
                        <span className="text-slt ml-1">{label}</span>
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </>
        )}

        {/* ── FREEZE CONFIRM SHEET ───────────────────────────────────────────── */}
        {showFreezeConfirm && (
          <>
            <div className="fixed inset-0 z-50 bg-black/60" onClick={() => setShowFreezeConfirm(false)} />
            <div className="fixed bottom-0 inset-x-0 z-50 bg-dark-800 border-t border-dark-600 rounded-t-2xl px-5 py-6 animate-fade-in">
              <p className="text-base font-semibold text-ink mb-5">{ts.freezeConfirm(freezeCount)}</p>
              <div className="flex gap-3">
                <button
                  onClick={() => setShowFreezeConfirm(false)}
                  className="flex-1 py-3 rounded-2xl border border-dark-500 text-ink text-sm font-medium hover:bg-dark-700 transition-colors"
                >
                  {hi ? 'रद्द करें' : 'Cancel'}
                </button>
                <button
                  onClick={useFreeze}
                  disabled={freezeLoading}
                  className="flex-1 py-3 rounded-2xl bg-brand-600 text-white text-sm font-semibold hover:bg-brand-700 transition-colors disabled:opacity-60"
                >
                  {freezeLoading ? '…' : ts.useFreezeBtn}
                </button>
              </div>
            </div>
          </>
        )}

      </main>
    </div>
  );
}

export default Dashboard;
