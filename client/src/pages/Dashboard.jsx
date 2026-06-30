import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import Navbar from '../components/Navbar';
import { useAuth } from '../contexts/AuthContext';
import { translations } from '../i18n/translations';
import { apiFetch } from '../api';
import {
  Flame, Zap, CheckCircle2, Snowflake, ChevronRight,
  Wind, RotateCcw, Trophy, ClipboardList, Gamepad2, Crown, X, MessageCircle,
  Eye, Target, Shield, CircleDot, Waves, Activity,
} from 'lucide-react';

function getSportIcon(sport) {
  const s = (sport || '').toLowerCase();
  if (['cricket','football','soccer','basketball','tennis','volleyball','baseball','hockey','badminton'].some(k => s.includes(k))) return CircleDot;
  if (['swimming','water polo'].some(k => s.includes(k))) return Waves;
  if (['running','athletics','track','cycling','marathon'].some(k => s.includes(k))) return Activity;
  return Trophy;
}

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

function QuickTool({ icon: Icon, iconBg, iconColor, title, desc, onClick }) {
  return (
    <button
      onClick={onClick}
      className="card p-3.5 text-left active:scale-95 transition-transform flex flex-col gap-2.5 hover:border-dark-500"
    >
      <div className={`w-9 h-9 rounded-full ${iconBg} flex items-center justify-center shrink-0`}>
        <Icon size={16} className={iconColor} />
      </div>
      <div className="flex-1">
        <p className="text-sm font-semibold text-ink leading-tight">{title}</p>
        <p className="text-[11px] text-slt leading-snug mt-0.5">{desc}</p>
      </div>
      <ChevronRight size={14} className="text-muted self-end" />
    </button>
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

  const savedCueWord = localStorage.getItem(`arjun_cue_word_${user?.id}`) || '';

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

    apiFetch('/api/mental-fitness/today', { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.ok ? r.json() : null)
      .then(data => setMfsEntry(data?.entry || false))
      .catch(() => setMfsEntry(false));
  }, [token]);

  // ── handlers ───────────────────────────────────────────────────────────────
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
  const sport = user?.sport ? user.sport.charAt(0).toUpperCase() + user.sport.slice(1) : 'Sport';
  const firstName = (user?.name || '').split(' ')[0] || (hi ? 'एथलीट' : 'Athlete');

  // ── render ─────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-dark-900">
      <Navbar />

      <main className="max-w-lg mx-auto px-4 pt-14 pb-24 animate-fade-in">

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
            <div className="pt-1 mb-5">
              <p className="text-2xl font-black text-ink leading-tight">
                {hi ? `हाय, ${firstName}` : `Hi, ${firstName}`}
              </p>

              {/* Stat chips — icon + number only */}
              <div className="flex gap-2 mt-3 flex-wrap">
                <button
                  onClick={() => setInfoPopup('streak')}
                  className="stat-pill active:scale-95 transition-transform"
                >
                  <Flame size={13} className={streak > 0 ? 'text-fire-500' : 'text-slt'} />
                  <span className="text-xs font-bold text-ink">{streak ?? 0}</span>
                </button>

                {user?.xp !== undefined && (
                  <button
                    onClick={() => setInfoPopup('xp')}
                    className="stat-pill active:scale-95 transition-transform"
                  >
                    <Zap size={13} className="text-fire-400" />
                    <span className="text-xs font-bold text-ink">{user.xp}</span>
                  </button>
                )}

                {fitnessScore !== null && (
                  <button
                    onClick={() => setInfoPopup('fitness')}
                    className="stat-pill active:scale-95 transition-transform"
                  >
                    <Target size={13} className={
                      fitnessScore >= 75 ? 'text-win-400' :
                      fitnessScore >= 60 ? 'text-brand-400' : 'text-slt'
                    } />
                    <span className={`text-xs font-black ${
                      fitnessScore >= 75 ? 'text-win-400' :
                      fitnessScore >= 60 ? 'text-brand-400' : 'text-slt'
                    }`}>{fitnessScore}</span>
                  </button>
                )}
              </div>

              {/* Missed-yesterday warning */}
              {missedYesterday && !missedDismissed && (
                <div className="mt-3 bg-fire-300/10 border border-fire-300/30 rounded-xl px-3 py-2.5 flex items-start justify-between gap-2">
                  <p className="text-xs text-fire-400 leading-relaxed flex-1">
                    {freezeCount > 0 ? ts.missedWithFreeze : ts.missedNoFreeze}
                  </p>
                  <div className="flex items-center gap-2 shrink-0">
                    {freezeCount > 0 && (
                      <button
                        onClick={() => setShowFreezeConfirm(true)}
                        className="text-xs font-semibold text-brand-400"
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


            {/* ── MIND JOURNAL HERO CARD ─────────────────────────────────────── */}
            <div className="mb-6">
              <SectionLabel>{hi ? 'माइंड जर्नल' : 'Mind Journal'}</SectionLabel>

              {/* Loading check-in state */}
              {mfsEntry === null ? (
                <div className="h-44 bg-dark-800 rounded-2xl animate-pulse border border-dark-600" />
              ) : mfsEntry ? (
                /* ── CHECK-IN DONE ── show report + top tools */
                <div className="card overflow-hidden">
                  {/* Done header */}
                  <div className="px-4 pt-4 pb-3 flex items-center justify-between border-b border-dark-600">
                    <div className="flex items-center gap-2">
                      <CheckCircle2 size={16} className="text-win-400 shrink-0" />
                      <p className="text-sm font-semibold text-win-400">{mf.card.doneTitle}</p>
                    </div>
                    {mfsEntry.arjunResponse && (
                      <button
                        onClick={() => setShowMfsReport(true)}
                        className="text-xs font-bold text-saffron-400"
                      >
                        {hi ? 'रिपोर्ट →' : 'Report →'}
                      </button>
                    )}
                  </div>
                  {/* Scores row */}
                  <div className="px-4 py-3 flex gap-1.5 flex-wrap">
                    {['mood','focus','confidence','drive','calm','selftalk','bounce'].map(d => (
                      mfsEntry[d] != null && (
                        <span key={d} className="text-xs bg-brand-50 text-brand-300 px-2 py-0.5 rounded-full font-semibold">
                          {mf.dims[d]} {mfsEntry[d]}
                        </span>
                      )
                    ))}
                  </div>
                  {/* Next action */}
                  <div className="px-4 pb-4">
                    <p className="text-[11px] text-slt mb-2">{hi ? 'अगला कदम:' : 'Next up:'}</p>
                    <button
                      onClick={() => navigate('/coaching')}
                      className="w-full py-2.5 bg-brand-500 hover:bg-brand-600 text-white rounded-xl text-sm font-bold active:scale-[0.98] transition-all"
                    >
                      {hi ? 'अर्जुन से बात करो' : 'Talk to Arjun'}
                    </button>
                  </div>
                </div>
              ) : (
                /* ── CHECK-IN NOT DONE ── hero workout card */
                (() => {
                  const SportIcon = getSportIcon(sport);
                  return (
                    <div className="relative rounded-2xl overflow-hidden border border-dark-600 bg-dark-800">
                      {/* Decorative arc */}
                      <div className="absolute top-0 right-0 w-40 h-40 opacity-10 pointer-events-none">
                        <svg viewBox="0 0 160 160" fill="none" xmlns="http://www.w3.org/2000/svg">
                          <circle cx="160" cy="0" r="120" stroke="#19A7FF" strokeWidth="1.5" />
                          <circle cx="160" cy="0" r="80" stroke="#1769AA" strokeWidth="1" />
                        </svg>
                      </div>
                      {/* Content */}
                      <div className="px-4 pt-6 pb-5 flex flex-col items-center text-center">
                        {/* Sport icon */}
                        <div className="w-12 h-12 rounded-2xl bg-brand-500/20 border border-brand-500/30 flex items-center justify-center mb-3">
                          <SportIcon size={22} className="text-brand-400" />
                        </div>
                        {/* Title */}
                        <p className="text-lg font-black text-ink leading-tight mb-2">
                          {hi ? 'दैनिक मानसिक वर्कआउट' : 'Daily Mental Workout'}
                        </p>
                        {/* Science subtitle */}
                        <p className="text-xs text-slt leading-relaxed mb-5 max-w-xs">
                          {hi
                            ? 'रोज़ का मानसिक चेक-इन फोकस बढ़ाता है और मैच से पहले की घबराहट 31% तक कम करता है — खेल विज्ञान पर आधारित।'
                            : 'A daily mental check-in is proven to sharpen focus and reduce pre-match nerves by 31% — backed by sport psychology.'}
                        </p>
                        {/* Start button */}
                        <button
                          onClick={() => navigate('/mental-fitness')}
                          className="w-full py-3 bg-brand-500 hover:bg-brand-600 text-white rounded-xl text-sm font-bold active:scale-[0.98] transition-all"
                        >
                          {hi ? 'शुरू करें' : 'Start'}
                        </button>
                      </div>
                    </div>
                  );
                })()
              )}
            </div>

            {/* ── QUICK TOOLS 2×2 ────────────────────────────────────────────── */}
            <div className="mb-6">
              <SectionLabel>{hi ? 'त्वरित टूल' : 'Quick Tools'}</SectionLabel>
              <div className="grid grid-cols-2 gap-3">
                <QuickTool
                  icon={RotateCcw}
                  iconBg="bg-brand-50"
                  iconColor="text-brand-400"
                  title={hi ? 'मैच से पहले'    : 'Before You Play'}
                  desc={hi  ? 'फोकस और तैयारी' : 'Get focused and mentally ready.'}
                  onClick={() => navigate('/before-you-play')}
                />
                <QuickTool
                  icon={Shield}
                  iconBg="bg-teal-500/15"
                  iconColor="text-teal-400"
                  title={hi ? 'वापसी करो'    : 'Bounce Back'}
                  desc={hi  ? 'रीसेट और आगे बढ़ो' : 'Reset, refocus and stay in control.'}
                  onClick={() => navigate('/bounce-back')}
                />
                <QuickTool
                  icon={ClipboardList}
                  iconBg="bg-saffron-500/15"
                  iconColor="text-saffron-400"
                  title={hi ? 'मैच/ट्रेनिंग के बाद' : 'After Match / Training'}
                  desc={hi  ? 'सोचो, सीखो'           : 'Reflect, learn and improve.'}
                  onClick={() => navigate('/debrief')}
                />
                <QuickTool
                  icon={Eye}
                  iconBg="bg-purple-500/15"
                  iconColor="text-purple-400"
                  title={hi ? 'विज़ुअलाइज़ेशन' : 'Visualization'}
                  desc={hi  ? 'मन में खेलते देखो' : 'Picture yourself playing your best.'}
                  onClick={() => navigate('/visualization')}
                />
              </div>
            </div>

            {/* ── MATCH DAY ──────────────────────────────────────────────────── */}
            {(savedCueWord || totalCheckIns > 0) && (
              <div className="mb-6">
                <SectionLabel>{hi ? 'मैच डे' : 'Match Day'}</SectionLabel>
                <div className="card p-4">
                  <p className="text-[10px] text-muted uppercase tracking-widest mb-1">
                    {hi ? 'तुम्हारा क्यू वर्ड' : 'Your cue word'}
                  </p>
                  <p className="text-2xl font-black text-navy-bright tracking-wider mb-3">
                    {savedCueWord || (hi ? 'अभी बनाओ' : 'SET IT UP')}
                  </p>
                  <button
                    onClick={() => navigate('/ritual')}
                    className="w-full py-2.5 bg-dark-700 border border-dark-600 hover:bg-dark-600 text-ink rounded-xl text-sm font-semibold active:scale-[0.98] transition-all"
                  >
                    {hi ? 'मेरा रूटीन खोलें' : 'Open My Routine'}
                  </button>
                </div>
              </div>
            )}

            {/* ── PROGRESS PREVIEW ────────────────────────────────────────────── */}
            {weeklyAvg && (weeklyAvg.mood !== null || weeklyAvg.focus !== null) && (
              <div className="mb-6">
                <div className="flex items-center justify-between mb-3">
                  <SectionLabel>{td.thisWeek}</SectionLabel>
                  <Link to="/progress" className="text-xs font-semibold text-brand-400 -mt-3">
                    {td.viewFullProgress} <ChevronRight size={11} className="inline" />
                  </Link>
                </div>
                <div className="card p-4">
                  <div className="grid grid-cols-3 gap-3 text-center">
                    {[
                      { key: 'mood',       label: hi ? 'मूड'   : 'Mood',  color: 'text-brand-400' },
                      { key: 'focus',      label: hi ? 'फोकस'  : 'Focus', color: 'text-sky-400'   },
                      { key: 'confidence', label: hi ? 'आत्म.' : 'Conf',  color: 'text-win-400'   },
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

            {/* ── TRIAL / UPGRADE CARD ─────────────────────────────────────────── */}
            {!isPremium && trialDaysRemaining != null && (
              <div className="mb-6 rounded-2xl overflow-hidden border border-brand-500/30" style={{ background: 'linear-gradient(135deg, rgba(23,105,170,0.18) 0%, rgba(11,27,42,0.9) 100%)' }}>
                <div className="p-5">
                  <div className="flex items-center gap-2 mb-2">
                    <Crown size={15} className={trialEnded ? 'text-saffron-400' : 'text-brand-400'} />
                    <p className="text-[11px] font-bold uppercase tracking-wider text-saffron-400">
                      {trialEnded
                        ? (hi ? 'ट्रायल खत्म हो गया' : 'Free trial ended')
                        : (hi ? `${trialDaysRemaining} दिन बचे हैं` : `${trialDaysRemaining} days left in your trial`)}
                    </p>
                  </div>
                  <p className="text-base font-black text-ink mb-1">
                    {hi ? 'पूरी पहुंच अनलॉक करो' : 'Unlock full access'}
                  </p>
                  <p className="text-xs text-slt mb-4 leading-relaxed">
                    {hi
                      ? 'असीमित AI कोचिंग · सभी मानसिक टूल · मैच के लिए तैयार रहो'
                      : 'Unlimited AI coaching · All mental tools · Stay match-ready year-round'}
                  </p>
                  <button
                    onClick={() => navigate('/pricing')}
                    className="w-full py-3 bg-brand-500 hover:bg-brand-600 text-white rounded-xl text-sm font-bold active:scale-[0.98] transition-all"
                  >
                    {hi ? 'प्रीमियम अपग्रेड करें — ₹299/माह' : 'Upgrade to Premium — ₹299/mo'}
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </main>

      {/* ── INFO POPUP SHEET ─────────────────────────────────────────────────── */}
      {infoPopup && (
        <>
          <div className="fixed inset-0 z-[60] bg-black/40" onClick={() => setInfoPopup(null)} />
          <div className="fixed bottom-0 inset-x-0 z-[60] bg-dark-800 border-t border-dark-600 rounded-t-2xl px-5 pt-6 pb-12 animate-fade-in shadow-xl">
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
                <div className="bg-dark-700 rounded-xl px-4 py-3 space-y-1.5">
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
                <div className="bg-dark-700 rounded-xl px-4 py-3 space-y-1.5">
                  {[
                    [hi ? 'दैनिक चेक-इन'  : 'Daily check-in',   '+10 MXP'],
                    [hi ? 'आज का अभ्यास'  : 'Daily drill done',  '+15 MXP'],
                    [hi ? '7-दिन स्ट्रीक' : '7-day streak',      '+50 MXP'],
                    [hi ? 'कोचिंग सेशन'   : 'Coaching session',  '+20 MXP'],
                  ].map(([action, xp]) => (
                    <div key={action} className="flex items-center justify-between">
                      <span className="text-xs text-slt">{action}</span>
                      <span className="text-xs font-bold text-brand-400">{xp}</span>
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
                <div className="bg-dark-700 rounded-xl px-4 py-3 space-y-1.5">
                  {[
                    ['90–100', hi ? 'चैंपियन मोड'  : 'Champion mode'],
                    ['75–89',  hi ? 'मज़बूत'        : 'Strong'],
                    ['60–74',  hi ? 'बन रहा है'     : 'Building'],
                    ['< 60',   hi ? 'ध्यान चाहिए'  : 'Needs work'],
                  ].map(([range, label]) => (
                    <div key={range} className="flex items-center justify-between">
                      <span className="text-xs font-bold text-brand-400">{range}</span>
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
            <div className="fixed inset-0 z-[60] bg-black/40" onClick={() => setShowMfsReport(false)} />
            <div className="fixed bottom-0 inset-x-0 z-[60] bg-dark-800 border-t border-dark-600 rounded-t-2xl px-5 pt-5 pb-12 animate-fade-in shadow-xl max-h-[85vh] overflow-y-auto">
              {/* Header */}
              <div className="flex items-center justify-between mb-5">
                <div className="flex items-center gap-2.5">
                  <div className="w-9 h-9 rounded-full flex items-center justify-center text-base bg-brand-50">🧠</div>
                  <p className="font-bold text-ink text-sm">{hi ? 'अर्जुन की रिपोर्ट' : "Arjun's report"}</p>
                </div>
                <button
                  onClick={() => setShowMfsReport(false)}
                  className="w-8 h-8 flex items-center justify-center rounded-full bg-dark-700 text-slt"
                >
                  <X size={16} />
                </button>
              </div>

              {/* Report text */}
              <div className="bg-dark-700 rounded-xl p-4 mb-5">
                <p className="text-sm text-ink leading-relaxed">{mfsEntry.arjunResponse}</p>
              </div>

              {/* Tool recommendation */}
              <p className="text-[11px] font-bold text-slt uppercase tracking-widest mb-2.5">{t.mentalFitness.toolRec.sectionLabel}</p>
              <button
                onClick={() => {
                  setShowMfsReport(false);
                  const navState = rec.toolKey === 'coaching'
                    ? { state: rec.state || {} }
                    : rec.state ? { state: rec.state } : undefined;
                  navigate(rec.to, navState);
                }}
                className="w-full flex items-center gap-3 p-3.5 rounded-xl border-2 border-brand-500 active:scale-[0.98] transition-transform mb-3 bg-dark-700"
              >
                <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0 bg-brand-50">
                  <rec.Icon size={18} className="text-brand-400" />
                </div>
                <div className="text-left flex-1">
                  <p className="font-semibold text-ink text-sm">{toolInfo.title}</p>
                  <p className="text-xs text-slt">{toolInfo.desc}</p>
                </div>
                <ChevronRight size={16} className="text-brand-400" />
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
          <div className="fixed inset-0 z-[60] bg-black/40" onClick={() => setShowFreezeConfirm(false)} />
          <div className="fixed bottom-0 inset-x-0 z-[60] bg-dark-800 border-t border-dark-600 rounded-t-2xl px-5 pt-6 pb-12 animate-fade-in shadow-xl">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-full bg-sky-900/30 flex items-center justify-center">
                <Snowflake size={20} className="text-sky-400" />
              </div>
              <h3 className="font-bold text-ink">{ts.freezeConfirmTitle}</h3>
            </div>
            <p className="text-sm text-slt mb-5 leading-relaxed">{ts.freezeConfirmBody}</p>
            <div className="flex gap-3">
              <button
                onClick={() => setShowFreezeConfirm(false)}
                disabled={freezeLoading}
                className="flex-1 py-3 rounded-xl border border-dark-600 text-slt font-semibold bg-dark-700 hover:bg-dark-600 transition-colors"
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
