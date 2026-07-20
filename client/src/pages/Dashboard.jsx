import { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import Navbar from '../components/Navbar';
import ConsentBanner from '../components/ConsentBanner';
import { useAuth } from '../contexts/AuthContext';
import { apiFetch } from '../api';
import { ChevronRight, BookOpen, Pencil } from 'lucide-react';
import { SectionLabel } from '../components/ui';

// Day-context picker — remembered for the rest of the day so the single
// adaptive primary action stays stable.
const DAY_CONTEXTS = [
  { id: 'training', en: 'Training today', hi: 'आज ट्रेनिंग' },
  { id: 'match',    en: 'Match today',    hi: 'आज मैच' },
  { id: 'recovery', en: 'Recovery day',   hi: 'आराम का दिन' },
  { id: 'just_rep', en: 'Just a rep',     hi: 'बस एक रेप' },
];

// The ONE adaptive primary action card — never more than one. Training,
// "just a rep", and no pick yet all fall back to the default Mental Rep
// action (the rep is the point, per product decision); only a match or a
// recovery day swap what the single card's own action is.
const PRIMARY_ACTION = {
  default: {
    title: { en: "Today's Mental Rep", hi: 'आज का मेंटल रेप' },
    desc:   { en: '4 minutes to get your mind ready.', hi: 'मन को तैयार करने के लिए 4 मिनट।' },
    cta:    { en: 'Start Rep', hi: 'रेप शुरू करो' },
    to: '/mental-rep',
  },
  match: {
    title: { en: 'Pressure Reset', hi: 'Pressure Reset' },
    desc:   { en: 'Lock in one cue before you play.', hi: 'खेलने से पहले एक cue lock करो।' },
    cta:    { en: 'Open Pressure Reset', hi: 'Pressure Reset खोलो' },
    to: '/body-reset',
  },
  recovery: {
    title: { en: 'Reflect Like an Athlete', hi: 'Reflect करो' },
    desc:   { en: 'Log what worked and one thing to improve.', hi: 'जो काम किया उसे log करो।' },
    cta:    { en: 'Start Reflection', hi: 'Reflection शुरू करो' },
    to: '/debrief',
  },
};

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
  const lang = hi ? 'hi' : 'en';

  // The single adaptive primary action — see PRIMARY_ACTION above. Only the
  // default action (Mental Rep) ever carries dayContext as route state,
  // matching its own page's existing contract; the match/recovery actions
  // navigate to their tool with no extra state, same as before.
  const primaryAction = PRIMARY_ACTION[dayContext] || PRIMARY_ACTION.default;
  const primaryActionState = primaryAction.to === '/mental-rep' && dayContext
    ? { state: { context: dayContext } }
    : undefined;

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

            {/* ── 1. GREETING ───────────────────────────────────────────────── */}
            <div className="pt-1 mb-5">
              <p className="text-2xl font-black text-ink leading-tight">
                {hi ? `हाय, ${firstName}` : `Hi, ${firstName}`}
              </p>
            </div>

            {/* ── 2. ONE ADAPTIVE PRIMARY ACTION CARD — never more than one.
                 Its own title/description/CTA swap with the athlete's
                 "What's today?" pick; training/just-a-rep/no pick all fall
                 back to the default Mental Rep action. ──────────────────── */}
            <div className="mb-6">
              <SectionLabel>{hi ? 'आज' : 'Today'}</SectionLabel>
              <div className="card-elevated p-5">
                <h2 className="text-lg font-bold text-ink leading-tight mb-1">
                  {primaryAction.title[lang]}
                </h2>
                <p className="text-sm text-slt mb-4">
                  {primaryAction.desc[lang]}
                </p>

                {/* Context picker — simple, per-day, no calendar */}
                <p className="text-[10px] font-bold text-muted uppercase tracking-wider mb-2">
                  {hi ? 'आज क्या है?' : "What's today?"}
                </p>
                <div className="flex flex-wrap gap-2 mb-4">
                  {DAY_CONTEXTS.map(c => (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => pickContext(c.id)}
                      className={`chip ${dayContext === c.id ? '!border-brand-500 !text-brand-400' : ''}`}
                    >
                      {c[lang]}
                    </button>
                  ))}
                </div>

                <button
                  onClick={() => navigate(primaryAction.to, primaryActionState)}
                  className="btn-gradient w-full py-3 text-sm"
                  style={{ minHeight: '48px' }}
                >
                  {primaryAction.cta[lang]}
                </button>
              </div>
            </div>

            {/* ── 3. NEED HELP RIGHT NOW — a fully separate section from the
                 primary action card above. Real <Link> elements, not
                 onClick+navigate — same primitive BottomNav already uses for
                 its Coach tab. Each carries its own route state and nothing
                 else; none of them touch dayContext, pickContext, or any
                 tool/game/skill-path route. ──────────────────────────────── */}
            <div className="mb-6">
              <SectionLabel>{hi ? 'अभी मदद चाहिए?' : 'Need help right now?'}</SectionLabel>
              <div className="grid grid-cols-2 gap-2">
                {PROBLEM_SHORTCUTS.map(q => (
                  <Link
                    key={q.id}
                    to="/coaching"
                    state={{ prefillMsg: q.prefill[hi ? 'hi' : 'en'] }}
                    className="chip justify-center text-center py-2.5"
                  >
                    {q.label[hi ? 'hi' : 'en']}
                  </Link>
                ))}
              </div>
            </div>

            {/* ── 4. MENTAL PLAYBOOK — quiet entry row, no scores ─────────────── */}
            <div className="mb-6">
              <SectionLabel>{hi ? 'Mental Playbook' : 'Mental Playbook'}</SectionLabel>
              <button
                onClick={() => navigate('/playbook')}
                className="w-full card-surface p-4 flex items-center gap-3 text-left active:scale-[0.98] transition-transform"
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

            {/* ── 5. MIND JOURNAL — quiet entry row, no scores ────────────────── */}
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
          </>
        )}
      </main>
    </div>
  );
}
