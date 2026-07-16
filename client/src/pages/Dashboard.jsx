import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import Navbar from '../components/Navbar';
import ConsentBanner from '../components/ConsentBanner';
import { ArjunLogo } from '../components/ArjunLogo';
import { useAuth } from '../contexts/AuthContext';
import { apiFetch } from '../api';
import {
  ChevronRight, RotateCcw, Target, ClipboardList, Sparkles, BookOpen, Pencil,
} from 'lucide-react';
import { insightText } from '../utils/insightCopy';

function SectionLabel({ children }) {
  return <p className="section-label">{children}</p>;
}

// Problem shortcuts — all four now enter Coach with a visible, unsent
// prefill instead of jumping straight to a tool. Stable internal starter
// values, independent of the button's own display label.
const PROBLEM_SHORTCUTS = [
  { id: 'nervous',    label: { en: "I'm nervous",            hi: 'मैं nervous हूं' },
    prefill: { en: "I'm feeling nervous.", hi: 'मुझे घबराहट हो रही है।' } },
  { id: 'mistake',    label: { en: 'I made a mistake',       hi: 'गलती हो गई' },
    prefill: { en: "I made a mistake and can't stop thinking about it.", hi: 'मुझसे गलती हो गई और मैं उसके बारे में सोचना बंद नहीं कर पा रहा।' } },
  { id: 'focus',      label: { en: 'I need focus',           hi: 'फोकस चाहिए' },
    prefill: { en: 'I need help focusing.', hi: 'मुझे फोकस करने में मदद चाहिए।' } },
  { id: 'confidence', label: { en: 'I feel low confidence',  hi: 'confidence कम है' },
    prefill: { en: "I'm feeling low on confidence.", hi: 'मेरा confidence कम है।' } },
];

export default function Dashboard() {
  const navigate = useNavigate();
  const { user, token, language } = useAuth();
  const hi = language === 'hi';

  // ── state ──────────────────────────────────────────────────────────────────
  const [loaded,            setLoaded]            = useState(false);
  const [playbook,          setPlaybook]          = useState(null);
  // Today's context (training / match / recovery / just_rep) — remembered
  // for the rest of the day so the recommended tool stays stable.
  const [dayContext,        setDayContext]        = useState(() => {
    try {
      const saved = JSON.parse(localStorage.getItem('arjun_day_context') || 'null');
      return saved?.date === new Date().toISOString().slice(0, 10) ? saved.context : null;
    } catch { return null; }
  });

  // ── data fetch ─────────────────────────────────────────────────────────────
  useEffect(() => {
    // Playbook summary — today's cue, recent insight, saved cues
    apiFetch('/api/playbook', { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.ok ? r.json() : null)
      .then(data => setPlaybook(data || false))
      .catch(() => setPlaybook(false))
      .finally(() => setLoaded(true));
  }, [token]);

  function pickContext(ctx) {
    setDayContext(ctx);
    localStorage.setItem('arjun_day_context', JSON.stringify({ date: new Date().toISOString().slice(0, 10), context: ctx }));
  }

  // ── derived ────────────────────────────────────────────────────────────────
  const firstName = (user?.name || '').split(' ')[0] || (hi ? 'एथलीट' : 'Athlete');

  // Context-aware recommended tool — existing tools only, urgent tools
  // never gated. "Just a rep" needs no extra recommendation (the rep is it).
  // "training" has no entry here for now — its tool was a hidden game.
  const CONTEXT_REC = {
    match:    { title: 'Pressure Reset', desc: hi ? 'खेलने से पहले एक cue lock करो।' : 'Lock in one cue before you play.', to: '/body-reset', Icon: RotateCcw },
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
                      type="button"
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
            </div>

            {/* ── NEED HELP RIGHT NOW — a fully separate section from the
                 Today's Mental Rep context picker above. Each of these four
                 buttons only ever calls navigate('/coaching', ...); it never
                 touches dayContext or pickContext. */}
            <div className="mb-6">
              <SectionLabel>{hi ? 'अभी मदद चाहिए?' : 'Need help right now?'}</SectionLabel>
              <div className="grid grid-cols-2 gap-2">
                {PROBLEM_SHORTCUTS.map(q => (
                  <button
                    key={q.id}
                    type="button"
                    onClick={() => navigate('/coaching', { state: { prefillMsg: q.prefill[hi ? 'hi' : 'en'] } })}
                    className="chip justify-center text-center py-2.5"
                  >
                    {q.label[hi ? 'hi' : 'en']}
                  </button>
                ))}
              </div>
            </div>

            {/* ── MIND JOURNAL — quiet entry row, no scores ────────────────────── */}
            <div className="mb-6">
              <SectionLabel>{hi ? 'माइंड जर्नल' : 'Mind Journal'}</SectionLabel>
              <button
                onClick={() => navigate('/mind-journal')}
                className="w-full card-surface p-4 flex items-center gap-3 text-left active:scale-[0.98] transition-transform"
              >
                <div className="w-9 h-9 rounded-xl bg-brand-500/15 flex items-center justify-center shrink-0">
                  <Pencil size={16} className="text-brand-400" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-ink">{hi ? 'माइंड जर्नल' : 'Mind Journal'}</p>
                  <p className="text-xs text-slt truncate">
                    {hi ? 'तुम्हारी feelings का एक निजी नोट। कोई स्कोर नहीं।' : "A private note of how you're feeling. No scores."}
                  </p>
                </div>
                <ChevronRight size={16} className="text-muted shrink-0" />
              </button>
            </div>

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
                    {hi ? 'Arjun से बात करो' : 'Talk to Arjun'}
                  </p>
                  <p className="text-xs text-slt mt-0.5">
                    {hi ? 'जो भी मन में है, यहाँ बोलो' : 'Whatever\'s on your mind'}
                  </p>
                </div>
                <ChevronRight size={16} className="text-muted shrink-0" />
              </button>
            </div>
          </>
        )}
      </main>
    </div>
  );
}
