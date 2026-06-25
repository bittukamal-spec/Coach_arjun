import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import Navbar from '../components/Navbar';
import { useAuth } from '../contexts/AuthContext';
import { translations } from '../i18n/translations';
import { apiFetch } from '../api';
import {
  Flame, Zap, CheckCircle2, Snowflake, ChevronRight,
  Target, TrendingUp, Sun, Wind, RotateCcw, Trophy, ClipboardList, Gamepad2, Crown, X, MessageCircle,
} from 'lucide-react';
import { DRILLS } from '../data/drills';

const TRIAL_DAYS = 14;

const TOOL_MAP = {
  calm:       { toolKey: 'breathing', to: '/breathing', state: null,                            Icon: Wind          },
  focus:      { toolKey: 'games',     to: '/games',     state: null,                            Icon: Gamepad2      },
  confidence: { toolKey: 'coaching',  to: '/coaching',  state: { sessionType: 'confidence' },   Icon: MessageCircle },
  drive:      { toolKey: 'coaching',  to: '/coaching',  state: { sessionType: 'general' },      Icon: MessageCircle },
  selftalk:   { toolKey: 'debrief',   to: '/debrief',   state: null,                            Icon: ClipboardList },
  bounce:     { toolKey: 'reset',     to: '/reset',     state: null,                            Icon: RotateCcw     },
  mood:       { toolKey: 'coaching',  to: '/coaching',  state: { sessionType: 'post_checkin' }, Icon: MessageCircle },
};

function getRecommendedTool(entry) {
  const dims = ['calm', 'focus', 'confidence', 'drive', 'selftalk', 'bounce', 'mood'];
  const sorted = dims.filter(d => entry[d] != null).sort((a, b) => entry[a] - entry[b]);
  return TOOL_MAP[sorted[0]] || TOOL_MAP.mood;
}

function getTrialDaysRemaining(user) {
  if (user?.tier === 'premium') return null;
  const start = user?.trialStarted || null;
  if (!start) return TRIAL_DAYS;
  const daysSince = Math.floor((Date.now() - new Date(start).getTime()) / (1000 * 60 * 60 * 24));
  return Math.max(0, TRIAL_DAYS - daysSince);
}

function SectionLabel({ children }) {
  return (
    <p className="text-[11px] font-bold text-slt uppercase tracking-widest mb-3">
      {children}
    </p>
  );
}


export default function Dashboard() {
  const navigate = useNavigate();
  const { user, token, language } = useAuth();
  const t  = translations[language];
  const td = t.dashboard;
  const ts = t.streak;
  const mf = t.mentalFitness;
  const hi = language === 'hi';

  const isPremium          = user?.tier === 'premium';
  const trialDaysRemaining = getTrialDaysRemaining(user);
  const trialEnded         = !isPremium && trialDaysRemaining === 0;

  // ── state ──────────────────────────────────────────────────────────────────
  const [mfsEntry,          setMfsEntry]          = useState(null);
  const [streak,            setStreak]            = useState(null);
  const [drillState,        setDrillState]        = useState({ drillIndex: null, completed: false });
  const [drillExpanded,     setDrillExpanded]     = useState(false);
  const [drillLoading,      setDrillLoading]      = useState(false);
  const [freezeCount,       setFreezeCount]       = useState(null);
  const [totalCheckIns,     setTotalCheckIns]     = useState(0);
  const [fitnessScore,      setFitnessScore]      = useState(null);
  const [weeklyAvg,         setWeeklyAvg]         = useState(null);
  const [infoPopup,         setInfoPopup]         = useState(null);
  const [showMfsReport,     setShowMfsReport]     = useState(false);
  const [showFreezeConfirm, setShowFreezeConfirm] = useState(false);
  const [freezeLoading,     setFreezeLoading]     = useState(false);
  const [loaded,            setLoaded]            = useState(false);
  const [missedDismissed,   setMissedDismissed]   = useState(
    () => localStorage.getItem('arjun_missed_dismissed') === new Date().toISOString().slice(0, 10)
  );

  // ── data fetch ─────────────────────────────────────────────────────────────
  useEffect(() => {
    apiFetch('/api/progress/summary?days=7', { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (!data) return;
        setStreak(data.streak ?? 0);
        setFreezeCount(data.freezeCount ?? 0);
        setTotalCheckIns(data.totalCheckIns ?? 0);
        if (data.fitnessScore !== undefined) setFitnessScore(data.fitnessScore);
        if (data.weeklyAvg) setWeeklyAvg(data.weeklyAvg);
        setLoaded(true);
      })
      .catch(() => setLoaded(true));

    apiFetch('/api/drills/today', { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.ok ? r.json() : null)
      .then(data => { if (data) setDrillState(data); })
      .catch(() => {});

    apiFetch('/api/mental-fitness/today', { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.ok ? r.json() : null)
      .then(data => setMfsEntry(data?.entry || false))
      .catch(() => setMfsEntry(false));
  }, [token]);

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

  // ── derived ────────────────────────────────────────────────────────────────
  const missedYesterday = streak === 0 && mfsEntry === false && totalCheckIns > 0;
  const drill           = drillState.drillIndex !== null ? DRILLS[drillState.drillIndex] : null;

  const TOOLS = [
    { Icon: Wind,          label: hi ? 'श्वास'         : 'Breathing',      to: '/breathing' },
    { Icon: RotateCcw,     label: hi ? 'प्रेशर रीसेट' : 'Pressure Reset', to: '/reset'     },
    { Icon: Trophy,        label: hi ? 'रिचुअल'       : 'Ritual',         to: '/ritual'    },
    { Icon: ClipboardList, label: hi ? 'डीब्रीफ'       : 'Debrief',        to: '/debrief'   },
    { Icon: Gamepad2,      label: hi ? 'गेम्स'        : 'Games',          to: '/games'     },
  ];

  // ── render ─────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-dark-900">
      <Navbar />

      <main className="max-w-lg mx-auto px-4 pt-20 pb-24 animate-fade-in">

        {/* ── Loading skeleton ──────────────────────────────────────────────── */}
        {!loaded && (
          <div className="pt-4 space-y-4 animate-pulse">
            <div className="h-5 bg-dark-800 rounded w-36" />
            <div className="h-8 bg-dark-800 rounded w-48 mt-1" />
            <div className="h-44 bg-dark-800 rounded-2xl mt-4" />
          </div>
        )}

        {loaded && (
          <>
            {/* ── HERO GREETING ──────────────────────────────────────────────── */}
            <div className="pt-4 mb-6">
              <p className="text-2xl font-black text-ink leading-tight">
                {td.homeHero(user?.name ?? '')}
              </p>
              <p className="text-sm text-slt mt-1 leading-relaxed">{td.homeSubtitle}</p>

              {/* Stat chips */}
              <div className="flex gap-2 mt-4 flex-wrap">
                <button
                  onClick={() => setInfoPopup('streak')}
                  className="flex items-center gap-1.5 bg-white border border-dark-600 shadow-sm px-3 py-1.5 rounded-full active:scale-95 transition-transform"
                >
                  <Flame size={13} className={streak > 0 ? 'text-fire-500' : 'text-slt'} />
                  <span className="text-xs font-bold text-ink">{streak ?? 0}</span>
                  <span className="text-[10px] text-slt">{hi ? 'स्ट्रीक' : 'streak'}</span>
                </button>

                {user?.xp !== undefined && (
                  <button
                    onClick={() => setInfoPopup('xp')}
                    className="flex items-center gap-1.5 bg-white border border-dark-600 shadow-sm px-3 py-1.5 rounded-full active:scale-95 transition-transform"
                  >
                    <Zap size={13} className="text-fire-400" />
                    <span className="text-xs font-bold text-ink">{user.xp}</span>
                    <span className="text-[10px] text-slt">MXP</span>
                  </button>
                )}

                {fitnessScore !== null && (
                  <button
                    onClick={() => setInfoPopup('fitness')}
                    className="flex items-center gap-1.5 bg-white border border-dark-600 shadow-sm px-3 py-1.5 rounded-full active:scale-95 transition-transform"
                  >
                    <span className={`text-xs font-black ${
                      fitnessScore >= 75 ? 'text-win-500' :
                      fitnessScore >= 60 ? 'text-brand-500' : 'text-slt'
                    }`}>{fitnessScore}</span>
                    <span className="text-[10px] text-slt">{hi ? 'फिटनेस' : 'Fitness'}</span>
                  </button>
                )}
              </div>

              {/* Missed-yesterday warning */}
              {missedYesterday && !missedDismissed && (
                <div className="mt-3 bg-fire-300/10 border border-fire-300/30 rounded-xl px-3 py-2.5 flex items-start justify-between gap-2">
                  <p className="text-xs text-fire-600 leading-relaxed flex-1">
                    {freezeCount > 0 ? ts.missedWithFreeze : ts.missedNoFreeze}
                  </p>
                  <div className="flex items-center gap-2 shrink-0">
                    {freezeCount > 0 && (
                      <button
                        onClick={() => setShowFreezeConfirm(true)}
                        className="text-xs font-semibold text-brand-600"
                      >
                        <Snowflake size={13} className="inline mr-0.5 text-sky-400" />
                        {ts.useFreezeBtn}
                      </button>
                    )}
                    <button onClick={dismissMissed} className="text-slt hover:text-ink text-base leading-none">×</button>
                  </div>
                </div>
              )}
            </div>

            {/* ── TODAY'S MENTAL DRILL (primary hero card) ───────────────────── */}
            <div className="mb-5">
              <div className="bg-gradient-to-br from-brand-500 to-brand-600 rounded-2xl overflow-hidden shadow-lg">
                {drill ? (
                  <div className="p-5">
                    <p className="text-xs font-bold text-white/70 uppercase tracking-wide mb-2">
                      {td.drillHeroLabel}
                    </p>
                    <p className="text-xl font-black text-white leading-tight mb-1">
                      {hi ? drill.titleHi : drill.title}
                    </p>
                    <p className="text-white/75 text-sm mb-4">
                      {td.drillHeroMeta(drill.duration)}
                    </p>

                    {drillState.completed ? (
                      <div className="bg-white/20 rounded-xl py-3 text-center">
                        <span className="text-white font-bold text-sm">{td.drillHeroDone}</span>
                      </div>
                    ) : !drillExpanded ? (
                      <button
                        onClick={() => setDrillExpanded(true)}
                        className="w-full bg-white text-brand-700 font-bold text-sm py-3 rounded-xl active:scale-[0.98] transition-transform"
                      >
                        {td.drillHeroStart}
                      </button>
                    ) : (
                      <>
                        <p className="text-white/90 text-sm leading-relaxed mb-4">
                          {hi ? drill.instructionHi : drill.instruction}
                        </p>
                        <button
                          onClick={completeDrill}
                          disabled={drillLoading}
                          className="w-full bg-white text-brand-700 font-bold text-sm py-3 rounded-xl active:scale-[0.98] transition-transform disabled:opacity-60"
                        >
                          {drillLoading ? '…' : td.drillHeroComplete}
                        </button>
                      </>
                    )}
                  </div>
                ) : (
                  <div className="p-5 animate-pulse">
                    <div className="h-3 bg-white/20 rounded w-28 mb-3" />
                    <div className="h-6 bg-white/20 rounded w-44 mb-2" />
                    <div className="h-10 bg-white/20 rounded-xl mt-5" />
                  </div>
                )}
              </div>
            </div>

            {/* ── TRIAL CTA BANNER ───────────────────────────────────────────── */}
            {!isPremium && trialDaysRemaining != null && (
              <div className={`mb-5 rounded-2xl p-4 flex items-center justify-between gap-3 border ${
                trialEnded
                  ? 'bg-amber-50 border-amber-400'
                  : 'bg-dark-800 border-dark-600'
              }`}>
                <div className="flex items-center gap-3 min-w-0">
                  <Crown size={18} className={trialEnded ? 'text-amber-500 shrink-0' : 'text-brand-500 shrink-0'} />
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-ink leading-tight">
                      {trialEnded ? td.trialEndedHome : td.trialDaysLeftHome(trialDaysRemaining)}
                    </p>
                    {!trialEnded && (
                      <p className="text-xs text-slt leading-tight mt-0.5 truncate">{td.unlockPremium}</p>
                    )}
                  </div>
                </div>
                <button
                  onClick={() => navigate('/pricing')}
                  className={`shrink-0 text-xs font-bold px-3 py-2 rounded-xl transition-colors ${
                    trialEnded
                      ? 'bg-amber-500 hover:bg-amber-600 text-white'
                      : 'bg-brand-600 hover:bg-brand-700 text-white'
                  }`}
                >
                  {td.upgradeNowBtn}
                </button>
              </div>
            )}

            {/* ── DAILY CHECK-IN / MENTAL FITNESS CARD ───────────────────────── */}
            <div className="mb-5">
              {mfsEntry === null ? (
                <div className="h-16 bg-dark-800 rounded-2xl animate-pulse border border-dark-600" />
              ) : mfsEntry ? (
                <div className="bg-white border border-dark-600 rounded-2xl p-4 shadow-sm">
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-sm font-semibold text-win-600">{mf.card.doneTitle}</p>
                    <CheckCircle2 size={15} className="text-win-500 shrink-0" />
                  </div>
                  <div className="flex gap-1.5 flex-wrap mb-2">
                    {['mood','focus','confidence','drive','calm','selftalk','bounce'].map(d => (
                      mfsEntry[d] != null && (
                        <span key={d} className="text-xs bg-brand-50 text-brand-700 px-2 py-0.5 rounded-full font-semibold">
                          {mf.dims[d]} {mfsEntry[d]}
                        </span>
                      )
                    ))}
                  </div>
                  {mfsEntry.arjunResponse && (
                    <button
                      onClick={() => setShowMfsReport(true)}
                      className="text-xs font-semibold mt-1"
                      style={{ color: '#E2711D' }}
                    >
                      {hi ? 'अर्जुन की रिपोर्ट देखें →' : "Arjun's report →"}
                    </button>
                  )}
                </div>
              ) : (
                <Link to="/mental-fitness">
                  <div className="bg-white border border-dark-600 rounded-2xl p-4 flex items-center justify-between active:scale-[0.99] transition-transform shadow-sm">
                    <div>
                      <p className="font-semibold text-ink text-sm">{mf.card.notDoneTitle}</p>
                      <p className="text-xs text-slt mt-0.5">{mf.card.notDoneSub}</p>
                    </div>
                    <div className="bg-brand-500 text-white text-xs font-bold px-3 py-2 rounded-xl whitespace-nowrap ml-3 shrink-0">
                      {mf.card.notDoneBtn}
                    </div>
                  </div>
                </Link>
              )}
            </div>

            {/* ── AI COACH CARD ───────────────────────────────────────────────── */}
            <div className="mb-5">
              <div className="bg-white border border-dark-600 rounded-2xl p-4 shadow-sm">
                <p className="font-semibold text-ink mb-0.5">{td.coachCardTitle}</p>
                <p className="text-xs text-slt mb-3">{td.coachCardSub}</p>
                <div className="grid grid-cols-2 gap-2">
                  {[
                    { label: td.quickBefore,   type: 'match_prep'    },
                    { label: td.quickMistake,  type: 'setback_reset' },
                    { label: td.quickConf,     type: 'confidence'    },
                    { label: td.quickOpen,     type: 'general'       },
                  ].map(({ label, type }) => (
                    <button
                      key={type}
                      onClick={() => navigate('/coaching', { state: { sessionType: type } })}
                      className="py-2.5 px-3 bg-brand-50 border border-brand-100 rounded-xl text-xs font-semibold text-brand-700 text-center hover:bg-brand-100 active:scale-95 transition-all"
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* ── TRAIN BY SITUATION ──────────────────────────────────────────── */}
            <div className="mb-5">
              <SectionLabel>{td.trainSection}</SectionLabel>
              <div className="grid grid-cols-2 gap-3">
                {[
                  { label: td.situBefore, sub: td.situBeforeSub, icon: Target,    session: 'match_prep',  color: 'text-brand-600' },
                  { label: td.situDuring, sub: td.situDuringSub, icon: Zap,       session: 'focus_reset', color: 'text-fire-600'  },
                  { label: td.situAfter,  sub: td.situAfterSub,  icon: TrendingUp, session: 'post_match', color: 'text-win-600'   },
                  { label: td.situDaily,  sub: td.situDailySub,  icon: Sun,       session: 'general',    color: 'text-amber-600' },
                ].map(({ label, sub, icon: Icon, session, color }) => (
                  <button
                    key={session}
                    onClick={() => navigate('/train')}
                    className="bg-white border border-dark-600 rounded-2xl p-3.5 text-left active:scale-95 transition-transform shadow-sm"
                  >
                    <Icon size={16} className={`${color} mb-2`} />
                    <p className="font-semibold text-ink text-sm leading-tight mb-0.5">{label}</p>
                    <p className="text-[11px] text-slt leading-tight">{sub}</p>
                  </button>
                ))}
              </div>
            </div>

            {/* ── PROGRESS PREVIEW ────────────────────────────────────────────── */}
            {weeklyAvg && (weeklyAvg.mood !== null || weeklyAvg.focus !== null) && (
              <div className="mb-5">
                <div className="flex items-center justify-between mb-3">
                  <SectionLabel>{td.thisWeek}</SectionLabel>
                  <Link to="/progress" className="text-xs font-semibold text-brand-600 -mt-3">
                    {td.viewFullProgress} <ChevronRight size={11} className="inline" />
                  </Link>
                </div>
                <div className="bg-white border border-dark-600 rounded-2xl p-4 shadow-sm">
                  <div className="grid grid-cols-3 gap-3 text-center">
                    {[
                      { key: 'mood',       label: hi ? 'मूड'          : 'Mood',       color: 'text-brand-500' },
                      { key: 'focus',      label: hi ? 'फोकस'        : 'Focus',      color: 'text-sky-500'   },
                      { key: 'confidence', label: hi ? 'आत्म.'        : 'Conf',       color: 'text-win-500'   },
                    ].map(({ key, label, color }) => (
                      <div key={key}>
                        <p className={`text-2xl font-black ${color}`}>{weeklyAvg[key] ?? '–'}</p>
                        <p className="text-[10px] text-slt mt-0.5">{label}</p>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* ── UPGRADE BANNERS ─────────────────────────────────────────────── */}
            {trialEnded && (
              <div className="mb-4 bg-brand-600 rounded-2xl p-5">
                <p className="font-bold text-white mb-1">🚀 {td.upgradePrompt}</p>
                <p className="text-white/80 text-sm mb-4">
                  {hi ? 'असीमित AI कोचिंग · सभी सुविधाएं' : 'Unlimited AI coaching · All features'}
                </p>
                <button
                  onClick={() => navigate('/pricing')}
                  className="bg-white text-brand-700 font-bold text-sm py-3 rounded-xl w-full"
                >
                  {td.upgrade}
                </button>
              </div>
            )}
            {!isPremium && !trialEnded && trialDaysRemaining != null && trialDaysRemaining <= 3 && (
              <div className="mb-4">
                <Link to="/account">
                  <div className="bg-white border border-fire-400/40 rounded-2xl px-4 py-3 flex items-center justify-between shadow-sm">
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
      </main>

      {/* ── INFO POPUP SHEET ─────────────────────────────────────────────────── */}
      {infoPopup && (
        <>
          <div className="fixed inset-0 z-50 bg-black/40" onClick={() => setInfoPopup(null)} />
          <div className="fixed bottom-0 inset-x-0 z-50 bg-white border-t border-dark-600 rounded-t-2xl px-5 py-6 animate-fade-in shadow-xl">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-base font-bold text-ink">
                {infoPopup === 'streak'  && (hi ? 'ट्रेनिंग स्ट्रीक'     : 'Training Streak')}
                {infoPopup === 'xp'      && (hi ? 'मानसिक XP (MXP)'     : 'Mental XP (MXP)')}
                {infoPopup === 'fitness' && (hi ? 'मानसिक फिटनेस स्कोर' : 'Mental Fitness Score')}
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
                <div className="bg-dark-800 rounded-xl px-4 py-3 space-y-1.5">
                  {[
                    [hi ? '3 दिन'  : '3 days',  hi ? 'आदत बन रही है'          : 'Habit forming'],
                    [hi ? '7 दिन'  : '7 days',  hi ? 'एक हफ्ते की अनुशासन'   : 'One week of discipline'],
                    [hi ? '14 दिन' : '14 days', hi ? 'दिमाग मजबूत हो रहा है' : 'Mind getting stronger'],
                    [hi ? '30 दिन' : '30 days', hi ? 'चैंपियन की ट्रेनिंग'   : "Champion's training"],
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
                    ? 'मानसिक XP (MXP) आपकी मानसिक ट्रेनिंग की मेहनत को दर्शाता है।'
                    : 'Mental XP (MXP) tracks the effort you put into your mental training.'}
                </p>
                <div className="bg-dark-800 rounded-xl px-4 py-3 space-y-1.5">
                  {[
                    [hi ? 'दैनिक चेक-इन'  : 'Daily check-in',   '+10 MXP'],
                    [hi ? 'आज का अभ्यास'  : 'Daily drill done',  '+15 MXP'],
                    [hi ? '7-दिन स्ट्रीक' : '7-day streak',      '+50 MXP'],
                    [hi ? 'कोचिंग सेशन'   : 'Coaching session',  '+20 MXP'],
                  ].map(([action, xp]) => (
                    <div key={action} className="flex items-center justify-between">
                      <span className="text-xs text-slt">{action}</span>
                      <span className="text-xs font-bold text-brand-500">{xp}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {infoPopup === 'fitness' && (
              <div className="space-y-3">
                <p className="text-sm text-ink leading-relaxed">
                  {hi
                    ? 'मानसिक फिटनेस स्कोर पिछले 7 दिनों के मूड, फोकस और आत्मविश्वास के औसत पर आधारित है।'
                    : 'Mental Fitness Score is based on your average mood, focus, and confidence over the last 7 days.'}
                </p>
                <div className="bg-dark-800 rounded-xl px-4 py-3 space-y-1.5">
                  {[
                    ['90–100', hi ? 'चैंपियन मोड'     : 'Champion mode'],
                    ['75–89',  hi ? 'मज़बूत'           : 'Strong'],
                    ['60–74',  hi ? 'बन रहा है'        : 'Building'],
                    ['< 60',   hi ? 'ध्यान चाहिए'     : 'Needs work'],
                  ].map(([range, label]) => (
                    <div key={range} className="flex items-center justify-between">
                      <span className="text-xs font-bold text-brand-500">{range}</span>
                      <span className="text-xs text-slt">{label}</span>
                    </div>
                  ))}
                </div>
                <p className="text-xs text-slt">
                  {hi ? 'ज़्यादा चेक-इन = ज़्यादा सटीक स्कोर।' : 'More check-ins = more accurate score.'}
                </p>
              </div>
            )}
          </div>
        </>
      )}

      {/* ── MFS REPORT SHEET ─────────────────────────────────────────────────── */}
      {showMfsReport && mfsEntry?.arjunResponse && (() => {
        const rec = getRecommendedTool(mfsEntry);
        const toolInfo = t.mentalFitness.toolRec[rec.toolKey];
        return (
          <>
            <div className="fixed inset-0 z-50 bg-black/40" onClick={() => setShowMfsReport(false)} />
            <div className="fixed bottom-0 inset-x-0 z-50 bg-white rounded-t-2xl px-5 pt-5 pb-8 animate-fade-in shadow-xl max-h-[85vh] overflow-y-auto">
              {/* Header */}
              <div className="flex items-center justify-between mb-5">
                <div className="flex items-center gap-2.5">
                  <div className="w-9 h-9 rounded-full flex items-center justify-center text-base" style={{ backgroundColor: '#EFF6FF' }}>🧠</div>
                  <p className="font-bold text-ink text-sm">{hi ? 'अर्जुन की रिपोर्ट' : "Arjun's report"}</p>
                </div>
                <button
                  onClick={() => setShowMfsReport(false)}
                  className="w-8 h-8 flex items-center justify-center rounded-full bg-gray-100 text-slt"
                >
                  <X size={16} />
                </button>
              </div>

              {/* Report text */}
              <div className="bg-gray-50 rounded-xl p-4 mb-5">
                <p className="text-sm text-ink leading-relaxed">{mfsEntry.arjunResponse}</p>
              </div>

              {/* Tool recommendation */}
              <p className="text-[11px] font-bold text-slt uppercase tracking-widest mb-2.5">{t.mentalFitness.toolRec.sectionLabel}</p>
              <button
                onClick={() => { setShowMfsReport(false); navigate(rec.to, rec.state ? { state: rec.state } : undefined); }}
                className="w-full flex items-center gap-3 p-3.5 rounded-xl border-2 active:scale-[0.98] transition-transform mb-3"
                style={{ borderColor: '#185FA5' }}
              >
                <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0" style={{ backgroundColor: '#EFF6FF' }}>
                  <rec.Icon size={18} style={{ color: '#185FA5' }} />
                </div>
                <div className="text-left flex-1">
                  <p className="font-semibold text-ink text-sm">{toolInfo.title}</p>
                  <p className="text-xs text-slt">{toolInfo.desc}</p>
                </div>
                <ChevronRight size={16} style={{ color: '#185FA5' }} />
              </button>

              {/* Talk to Arjun secondary */}
              <button
                onClick={() => { setShowMfsReport(false); navigate('/coaching', { state: { sessionType: 'post_checkin' } }); }}
                className="w-full py-3.5 rounded-xl font-bold text-sm border border-dark-600 text-slt active:scale-[0.98] transition-transform"
              >
                {hi ? 'अर्जुन से बात करो' : 'Talk to Arjun'}
              </button>
            </div>
          </>
        );
      })()}

      {/* ── FREEZE CONFIRM SHEET ─────────────────────────────────────────────── */}
      {showFreezeConfirm && (
        <>
          <div className="fixed inset-0 z-50 bg-black/40" onClick={() => setShowFreezeConfirm(false)} />
          <div className="fixed bottom-0 inset-x-0 z-50 bg-white border-t border-dark-600 rounded-t-2xl px-5 py-6 animate-fade-in shadow-xl">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-full bg-sky-100 flex items-center justify-center">
                <Snowflake size={20} className="text-sky-500" />
              </div>
              <h3 className="font-bold text-ink">{ts.freezeConfirmTitle}</h3>
            </div>
            <p className="text-sm text-slt mb-5 leading-relaxed">{ts.freezeConfirmBody}</p>
            <div className="flex gap-3">
              <button
                onClick={() => setShowFreezeConfirm(false)}
                disabled={freezeLoading}
                className="flex-1 py-3 rounded-xl border border-dark-600 text-slt font-semibold bg-dark-800 hover:bg-dark-700 transition-colors"
              >
                {hi ? 'रद्द करें' : 'Cancel'}
              </button>
              <button
                onClick={useFreeze}
                disabled={freezeLoading}
                className="flex-1 py-3 rounded-xl bg-sky-500 hover:bg-sky-600 text-white font-bold transition-colors disabled:opacity-50"
              >
                {freezeLoading ? '…' : ts.useFreezeBtn}
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
