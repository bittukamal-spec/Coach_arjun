import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import Navbar from '../components/Navbar';
import ConsentBanner from '../components/ConsentBanner';
import { ArjunLogo } from '../components/ArjunLogo';
import { useAuth } from '../contexts/AuthContext';
import { translations } from '../i18n/translations';
import { apiFetch } from '../api';
import {
  Flame, Zap, CheckCircle2, Snowflake, ChevronRight,
  RotateCcw, Target, CircleDot, Waves, Activity, Trophy,
  Gamepad2, ClipboardList, MessageSquare, X, Sparkles, BookOpen,
} from 'lucide-react';
import { isActiveToolRoute } from '../constants/activeTools';
import { insightText } from '../utils/insightCopy';

function getSportIcon(sport) {
  const s = (sport || '').toLowerCase();
  if (['cricket','football','soccer','basketball','tennis','volleyball','baseball','hockey','badminton'].some(k => s.includes(k))) return CircleDot;
  if (['swimming','water polo'].some(k => s.includes(k))) return Waves;
  if (['running','athletics','track','cycling','marathon'].some(k => s.includes(k))) return Activity;
  return Trophy;
}

const TOOL_MAP = {
  calm:       { toolKey: 'pressureReset', to: '/body-reset',        state: null, Icon: RotateCcw     },
  focus:      { toolKey: 'focusLock',     to: '/games/focus-lock',  state: null, Icon: Gamepad2      },
  selftalk:   { toolKey: 'selftalk',      to: '/self-talk',         state: null, Icon: MessageSquare },
  bounce:     { toolKey: 'resetRally',    to: '/games/reset-rally', state: null, Icon: RotateCcw     },
  confidence: { toolKey: 'selftalk',      to: '/self-talk',         state: null, Icon: MessageSquare },
  drive:      { toolKey: 'debrief',       to: '/debrief',           state: null, Icon: ClipboardList },
};

function getRecommendedTool(entry) {
  const dims = ['calm', 'focus', 'selftalk', 'bounce', 'confidence', 'drive'];
  const sorted = dims.filter(d => entry[d] != null).sort((a, b) => entry[a] - entry[b]);
  const rec = TOOL_MAP[sorted[0]] || TOOL_MAP.calm;
  // Guardrail: never recommend a route that isn't a real, active tool.
  if (!isActiveToolRoute(rec.to)) {
    console.warn(`[Dashboard] getRecommendedTool resolved to inactive route "${rec.to}" — falling back to /body-reset`);
    return TOOL_MAP.calm;
  }
  return rec;
}

function SectionLabel({ children }) {
  return <p className="section-label">{children}</p>;
}

function QuickTool({ icon: Icon, iconBg, iconColor, title, desc, onClick }) {
  return (
    <button
      onClick={onClick}
      className="card-elevated p-3.5 text-left active:scale-95 transition-transform flex flex-col gap-2.5 hover:border-dark-500"
    >
      <div className={`w-9 h-9 rounded-xl ${iconBg} flex items-center justify-center shrink-0`}>
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

  // ── state ──────────────────────────────────────────────────────────────────
  const [mfsEntry,          setMfsEntry]          = useState(null);
  const [streak,            setStreak]            = useState(null);
  const [freezeCount,       setFreezeCount]       = useState(null);
  const [totalCheckIns,     setTotalCheckIns]     = useState(0);
  const [fitnessScore,      setFitnessScore]      = useState(null);
  const [infoPopup,         setInfoPopup]         = useState(null);
  const [showMfsReport,     setShowMfsReport]     = useState(false);
  const [showFreezeConfirm, setShowFreezeConfirm] = useState(false);
  const [freezeLoading,     setFreezeLoading]     = useState(false);
  const [loaded,            setLoaded]            = useState(false);
  const [plan,              setPlan]              = useState(null);
  const [playbook,          setPlaybook]          = useState(null);
  // Today's context (training / match / recovery / just_rep) — remembered
  // for the rest of the day so the recommended tool stays stable.
  const [dayContext,        setDayContext]        = useState(() => {
    try {
      const saved = JSON.parse(localStorage.getItem('arjun_day_context') || 'null');
      return saved?.date === new Date().toISOString().slice(0, 10) ? saved.context : null;
    } catch { return null; }
  });
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
        setLoaded(true);
      })
      .catch(() => setLoaded(true));

    apiFetch('/api/mental-fitness/today', { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.ok ? r.json() : null)
      .then(data => setMfsEntry(data?.entry || false))
      .catch(() => setMfsEntry(false));

    // Coach-led starter plan — lazily generated server-side on first call
    apiFetch('/api/plan/current', { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.ok ? r.json() : null)
      .then(data => setPlan(data?.plan || false))
      .catch(() => setPlan(false));

    // Playbook summary — today's cue, recent insight, saved cues
    apiFetch('/api/playbook', { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.ok ? r.json() : null)
      .then(data => setPlaybook(data || false))
      .catch(() => setPlaybook(false));
  }, [token]);

  function pickContext(ctx) {
    setDayContext(ctx);
    localStorage.setItem('arjun_day_context', JSON.stringify({ date: new Date().toISOString().slice(0, 10), context: ctx }));
  }

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

  // Context-aware recommended tool — existing tools only, urgent tools
  // never gated. "Just a rep" needs no extra recommendation (the rep is it).
  const CONTEXT_REC = {
    match:    { title: 'Pressure Reset', desc: hi ? 'खेलने से पहले एक cue lock करो।' : 'Lock in one cue before you play.', to: '/body-reset', Icon: RotateCcw },
    training: { title: 'Focus Lock', desc: hi ? 'प्रैक्टिस से पहले फोकस तेज़ करो।' : 'Sharpen your focus before practice.', to: '/games/focus-lock', Icon: Target },
    recovery: { title: hi ? 'Reflect' : 'Reflect Like an Athlete', desc: hi ? 'जो काम किया उसे log करो।' : 'Log what worked and one thing to improve.', to: '/debrief', Icon: ClipboardList },
  };
  const contextRec = dayContext ? CONTEXT_REC[dayContext] || null : null;
  const todayCueCard = playbook?.focusCards?.[0] || null;
  const insightLine = playbook ? insightText(playbook.insight, hi) : null;

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
            {/* ── Guardian consent pending (under-18 accounts) ──────────────── */}
            <ConsentBanner />

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


            {/* ── TODAY'S MENTAL REP — the core daily habit ──────────────────── */}
            <div className="mb-6">
              <SectionLabel>{hi ? 'आज का मेंटल रेप' : "Today's Mental Rep"}</SectionLabel>
              <div className="card-elevated p-5">
                <h2 className="text-lg font-bold text-ink leading-tight mb-1">
                  {hi ? 'आज का मेंटल रेप' : "Today's Mental Rep"}
                </h2>
                <p className="text-sm text-slt mb-4">
                  {hi ? 'मन को तैयार करने के लिए 4 मिनट।' : '4 minutes to get your mind ready.'}
                </p>

                {/* Context picker — simple, per-day, no calendar */}
                <p className="text-[10px] font-bold text-muted uppercase tracking-wider mb-2">
                  {hi ? 'आज क्या है?' : "What's today?"}
                </p>
                <div className="flex flex-wrap gap-2 mb-4">
                  {[
                    { id: 'training', en: 'Training today', hi: 'आज ट्रेनिंग' },
                    { id: 'match',    en: 'Match today',    hi: 'आज मैच' },
                    { id: 'recovery', en: 'Recovery day',   hi: 'आराम का दिन' },
                    { id: 'just_rep', en: 'Just a rep',     hi: 'बस एक रेप' },
                  ].map(c => (
                    <button
                      key={c.id}
                      onClick={() => pickContext(c.id)}
                      className={`chip ${dayContext === c.id ? '!border-brand-500 !text-brand-400' : ''}`}
                    >
                      {hi ? c.hi : c.en}
                    </button>
                  ))}
                </div>

                <button
                  onClick={() => navigate('/mental-rep', dayContext ? { state: { context: dayContext } } : undefined)}
                  className="btn-gradient w-full py-3 text-sm"
                  style={{ minHeight: '48px' }}
                >
                  {hi ? 'रेप शुरू करो' : 'Start Rep'}
                </button>
              </div>

              {/* Context-aware recommended tool */}
              {contextRec && (
                <button
                  onClick={() => navigate(contextRec.to)}
                  className="mt-3 w-full card-surface p-4 flex items-center gap-3 text-left active:scale-[0.98] transition-transform"
                >
                  <div className="w-9 h-9 rounded-xl bg-brand-500/15 flex items-center justify-center shrink-0">
                    <contextRec.Icon size={16} className="text-brand-400" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-ink">{contextRec.title}</p>
                    <p className="text-xs text-slt truncate">{contextRec.desc}</p>
                  </div>
                  <ChevronRight size={16} className="text-muted shrink-0" />
                </button>
              )}

              {/* Today's cue — the athlete's main saved Focus Card */}
              {todayCueCard && (
                <button
                  onClick={() => navigate('/focus-deck')}
                  className="mt-3 w-full card-surface p-4 flex items-center gap-3 text-left active:scale-[0.98] transition-transform"
                >
                  <div className="w-9 h-9 rounded-xl bg-brand-500/15 flex items-center justify-center shrink-0">
                    <Target size={16} className="text-brand-400" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-ink">
                      {hi ? 'आज का cue: ' : "Today's cue: "}
                      <span style={{ color: '#185FA5' }}>{todayCueCard.focusWord}</span>
                    </p>
                    <p className="text-xs text-slt">{hi ? 'Focus Card खोलो' : 'Open Focus Card'}</p>
                  </div>
                  <ChevronRight size={16} className="text-muted shrink-0" />
                </button>
              )}

              {/* Recent insight — one useful pattern, no scores */}
              {insightLine && (
                <div className="mt-3 card-surface p-4 flex items-start gap-3">
                  <div className="w-8 h-8 rounded-xl bg-brand-500/15 flex items-center justify-center shrink-0">
                    <Sparkles size={15} className="text-brand-400" />
                  </div>
                  <p className="text-sm text-slt leading-relaxed">{insightLine}</p>
                </div>
              )}

              {/* Mental Playbook entry */}
              <button
                onClick={() => navigate('/playbook')}
                className="mt-3 w-full card-surface p-4 flex items-center gap-3 text-left active:scale-[0.98] transition-transform"
              >
                <div className="w-9 h-9 rounded-xl bg-brand-500/15 flex items-center justify-center shrink-0">
                  <BookOpen size={16} className="text-brand-400" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-ink">{hi ? 'Mental Playbook' : 'Mental Playbook'}</p>
                  <p className="text-xs text-slt truncate">
                    {playbook && playbook.weekRepCount > 0
                      ? (hi ? `इस हफ्ते ${playbook.weekRepCount} मेंटल रेप पूरे किए।` : `You've completed ${playbook.weekRepCount} mental rep${playbook.weekRepCount === 1 ? '' : 's'} this week.`)
                      : (hi ? 'तुम्हारे cues, cards और reflections' : 'Your cues, cards, and reflections')}
                  </p>
                </div>
                <ChevronRight size={16} className="text-muted shrink-0" />
              </button>

              {/* Quick help — urgent tools, always one tap away */}
              <div className="mt-3 grid grid-cols-2 gap-2">
                {[
                  { label: hi ? 'मैं nervous हूं' : "I'm nervous",            to: '/body-reset' },
                  { label: hi ? 'गलती हो गई' : 'I made a mistake',            to: '/games/reset-rally' },
                  { label: hi ? 'फोकस चाहिए' : 'I need focus',                to: '/skills/focus-self-talk' },
                  { label: hi ? 'confidence कम है' : 'I feel low confidence', to: '/self-talk' },
                ].map(q => (
                  <button
                    key={q.to}
                    onClick={() => navigate(q.to)}
                    className="chip justify-center text-center py-2.5"
                  >
                    {q.label}
                  </button>
                ))}
              </div>
            </div>

            {/* ── YOUR STARTER PLAN (coach-led journey) ──────────────────────── */}
            {plan && plan.todaySession && (
              <div className="mb-6">
                <SectionLabel>{hi ? 'तुम्हारा स्टार्टर प्लान' : 'Your Starter Plan'}</SectionLabel>

                {/* Arjun coach note */}
                {plan.coachNote && (
                  <div className="mt-3 card-surface p-4 flex items-start gap-3">
                    <div className="w-8 h-8 rounded-full bg-brand-500/15 flex items-center justify-center shrink-0">
                      <ArjunLogo size={16} />
                    </div>
                    <div className="min-w-0">
                      <p className="text-[10px] font-bold text-brand-400 uppercase tracking-widest mb-1">
                        {hi ? 'Arjun का कोच नोट' : "Arjun's coach note"}
                      </p>
                      <p className="text-sm text-slt leading-relaxed">{plan.coachNote}</p>
                    </div>
                  </div>
                )}

                {/* Starter plan progress list */}
                <div className="mt-3 card-surface p-4">
                  <div className="flex items-center justify-between mb-3">
                    <p className="text-xs font-bold text-slt uppercase tracking-widest">
                      {hi ? '5 सेशन' : '5 sessions'}
                    </p>
                    <span className="text-xs font-semibold text-muted">
                      {hi ? `${plan.doneCount}/${plan.totalSessions} पूरे` : `${plan.doneCount}/${plan.totalSessions} complete`}
                    </span>
                  </div>
                  <div className="space-y-2.5">
                    {plan.sessions.map((s) => {
                      const statusLabel =
                        s.status === 'done'  ? (hi ? 'हो गया' : 'Done')
                        : s.status === 'today' ? (hi ? 'आज' : 'Today')
                        : (hi ? 'लॉक्ड' : 'Locked');
                      const statusClass =
                        s.status === 'done'  ? 'text-teal-400'
                        : s.status === 'today' ? 'text-brand-400'
                        : 'text-muted';
                      return (
                        <div key={s.id} className="flex items-center gap-2.5">
                          <span className={`w-5 text-xs font-bold shrink-0 ${statusClass}`}>{s.sessionNumber}</span>
                          <div className="flex-1 min-w-0">
                            <p className={`text-sm leading-tight truncate ${s.status === 'done' ? 'text-muted' : 'text-ink font-medium'}`}>
                              {s.title}
                            </p>
                            {s.status === 'locked' ? (
                              <p className="text-[11px] text-muted truncate">
                                {hi ? 'पहले पिछला सेशन पूरा करो' : 'Complete the previous session first'}
                              </p>
                            ) : (
                              <p className="text-[11px] text-muted truncate">{s.toolLabel} · {s.skillLabel}</p>
                            )}
                          </div>
                          <div className="shrink-0 flex items-center gap-2">
                            <span className={`text-[11px] font-semibold ${statusClass}`}>{statusLabel}</span>
                            {s.status === 'done' && (
                              <button
                                onClick={() => navigate(s.toolRoute)}
                                className="text-[11px] font-semibold text-brand-400 active:opacity-70"
                              >
                                {hi ? 'फिर से practice करो' : 'Practice again'}
                              </button>
                            )}
                            {s.status === 'today' && (
                              <button
                                onClick={() => navigate(s.toolRoute)}
                                className="text-[11px] font-semibold text-brand-400 active:opacity-70"
                              >
                                {hi ? 'शुरू करो' : 'Start'}
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}

            {/* Plan finished — small completion note */}
            {plan && !plan.todaySession && plan.status === 'completed' && (
              <div className="mb-6 card-surface p-4 flex items-center gap-3">
                <CheckCircle2 size={18} className="text-teal-400 shrink-0" />
                <p className="text-sm text-slt">
                  {hi ? 'स्टार्टर प्लान पूरा! अगला प्लान जल्द आ रहा है — तब तक Train में practice जारी रखो।' : 'Starter plan complete! Your next plan is coming soon — keep practising in Train meanwhile.'}
                </p>
              </div>
            )}

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
                            ? 'रोज़ का मानसिक चेक-इन फोकस बढ़ाता है और खेलने या ट्रेनिंग से पहले की घबराहट 31% तक कम करता है — खेल विज्ञान पर आधारित।'
                            : 'A daily mental check-in is proven to sharpen focus and reduce nerves before you play or train by 31% — backed by sport psychology.'}
                        </p>
                        {/* Start button */}
                        <button
                          onClick={() => navigate('/mind-journal')}
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

            {/* ── RECOMMENDED TOOL (from today's MFS check-in) ──────────────── */}
            {mfsEntry && (() => {
              const rec = getRecommendedTool(mfsEntry);
              const toolInfo = mf.toolRec[rec.toolKey];
              return (
                <div className="mb-6">
                  <SectionLabel>{mf.toolRec.sectionLabel}</SectionLabel>
                  <QuickTool
                    icon={rec.Icon}
                    iconBg="bg-brand-50"
                    iconColor="text-brand-400"
                    title={toolInfo.title}
                    desc={toolInfo.desc}
                    onClick={() => navigate(rec.to, rec.state ? { state: rec.state } : undefined)}
                  />
                </div>
              );
            })()}

            {/* ── CHAT ENTRY ─────────────────────────────────────────────────── */}
            <div className="mb-6">
              <button
                onClick={() => navigate('/coaching')}
                className="w-full card p-4 flex items-center gap-3 text-left hover:border-dark-500 active:scale-[0.98] transition-all"
              >
                <div className="w-10 h-10 rounded-xl bg-brand-500/15 flex items-center justify-center shrink-0">
                  <ArjunLogo size={20} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-ink">
                    {plan && plan.todaySession
                      ? (hi ? 'Arjun से इस प्लान के बारे में पूछो' : 'Ask Arjun about this plan')
                      : (hi ? 'Arjun से बात करो' : 'Talk to Arjun')}
                  </p>
                  <p className="text-xs text-slt mt-0.5">
                    {plan && plan.todaySession
                      ? (hi ? 'तुम्हारा कोच तुम्हारा प्लान जानता है' : 'Your coach knows your plan')
                      : (hi ? 'जो भी मन में है, यहाँ बोलो' : 'Whatever\'s on your mind')}
                  </p>
                </div>
                <ChevronRight size={16} className="text-muted shrink-0" />
              </button>
            </div>
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
                {infoPopup === 'fitness' && (hi ? 'माइंडसेट चेक-इन' : 'Mindset Check-in')}
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
                    ? '❄️ Restore: तरक्की वापस लौटने से आती है, perfection से नहीं। चाहें तो restore से स्ट्रीक जारी रख सकते हैं — हर 7 दिन आने पर एक restore मिलता है।'
                    : '❄️ Restores: progress comes from returning, not perfection. If you want, a restore keeps your streak connected — you earn one for every 7 days of showing up.'}
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
                    ? 'यह पिछले 7 दिनों के मूड, फोकस और आत्मविश्वास के औसत पर आधारित है।'
                    : 'This is based on your average mood, focus, and confidence over the last 7 days.'}
                </p>
                <p className="text-xs text-slt leading-relaxed">
                  {hi
                    ? 'यह आपकी मानसिक ताकत का स्कोर नहीं है। यह Arjun को यह समझने में मदद करता है कि आज आपको किस तरह के सपोर्ट की ज़रूरत है।'
                    : 'This is not a score of your mental strength. It helps Arjun understand what kind of support you need today.'}
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
                  navigate(rec.to, rec.state ? { state: rec.state } : undefined);
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
