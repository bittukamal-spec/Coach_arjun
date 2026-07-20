import { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import Navbar from '../components/Navbar';
import ConsentBanner from '../components/ConsentBanner';
import { useAuth } from '../contexts/AuthContext';
import { apiFetch } from '../api';
import { ChevronRight, BookOpen, Pencil, CloudRain, RotateCcw, Crosshair, TrendingUp } from 'lucide-react';
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

// Problem shortcuts — all four enter Coach with a visible, unsent prefill
// instead of jumping straight to a tool. Stable internal starter values,
// independent of the button's own display label. Each carries a small icon
// so the shortcut tiles read as actions, visually distinct from the
// quieter day-context selector above.
const PROBLEM_SHORTCUTS = [
  { id: 'nervous',    icon: CloudRain,  label: { en: "I'm nervous",            hi: 'मैं nervous हूं' },
    prefill: { en: "I'm feeling nervous.", hi: 'मुझे घबराहट हो रही है।' } },
  { id: 'mistake',    icon: RotateCcw,  label: { en: 'I made a mistake',       hi: 'गलती हो गई' },
    prefill: { en: "I made a mistake and can't stop thinking about it.", hi: 'मुझसे गलती हो गई और मैं उसके बारे में सोचना बंद नहीं कर पा रहा।' } },
  { id: 'focus',      icon: Crosshair,  label: { en: 'I need focus',           hi: 'फोकस चाहिए' },
    prefill: { en: 'I need help focusing.', hi: 'मुझे फोकस करने में मदद चाहिए।' } },
  { id: 'confidence', icon: TrendingUp, label: { en: 'I feel low confidence',  hi: 'confidence कम है' },
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

  // One contextual line for the Playbook card — sourced ONLY from data the
  // Dashboard already fetches (GET /api/playbook). Never a new API call,
  // never a fake metric: with no useful data it falls back to static copy.
  const playbookDetail = playbook && playbook.weekRepCount > 0
    ? (hi ? `इस हफ्ते ${playbook.weekRepCount} मेंटल रेप पूरे किए।` : `${playbook.weekRepCount} mental rep${playbook.weekRepCount === 1 ? '' : 's'} completed this week.`)
    : playbook && playbook.topCue
      ? (hi ? `सबसे ज्यादा use हुआ cue: "${playbook.topCue.value}"` : `Your most-used cue: "${playbook.topCue.value}"`)
      : null;

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
            <div className="pt-1 mb-6">
              <p className="text-2xl font-black text-ink leading-tight">
                {hi ? `हाय, ${firstName}` : `Hi, ${firstName}`}
              </p>
            </div>

            {/* ── 2. ONE ADAPTIVE PRIMARY ACTION CARD — never more than one.
                 Its own title/description/CTA swap with the athlete's
                 "What's today?" pick; training/just-a-rep/no pick all fall
                 back to the default Mental Rep action. The elevated surface
                 plus the single gradient CTA make it the unambiguous
                 primary action on the page. ──────────────────────────────── */}
            <div className="mb-8">
              <SectionLabel>{hi ? 'आज' : 'Today'}</SectionLabel>
              <div className="card-elevated p-5">
                <h2 className="text-xl font-black text-ink leading-tight mb-1">
                  {primaryAction.title[lang]}
                </h2>
                <p className="text-sm text-slt mb-4">
                  {primaryAction.desc[lang]}
                </p>

                {/* Day-context selector — a compact segmented control, NOT
                    action cards. Quiet unselected chips inside one grouped
                    track; a filled, clearly-selected state; ≥44px touch
                    targets; aria-pressed for assistive tech. Deliberately
                    styled apart from the "Need help right now?" tiles
                    below — picking a context changes THIS card, it never
                    navigates. */}
                <p className="text-[10px] font-bold text-muted uppercase tracking-wider mb-2">
                  {hi ? 'आज क्या है?' : "What's today?"}
                </p>
                <div
                  role="group"
                  aria-label={hi ? 'आज क्या है?' : "What's today?"}
                  className="inline-flex flex-wrap gap-1 p-1 rounded-xl bg-dark-700/70 border border-dark-600 mb-4"
                >
                  {DAY_CONTEXTS.map(c => (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => pickContext(c.id)}
                      aria-pressed={dayContext === c.id}
                      className={`text-caption px-3 rounded-lg min-h-[44px] transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 active:scale-95 ${
                        dayContext === c.id
                          ? 'bg-brand-600 text-white font-semibold shadow-sm'
                          : 'bg-transparent text-slt font-medium'
                      }`}
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
                 tool/game/skill-path route. Rendered as outlined shortcut
                 tiles with small icons — a clear action affordance, visually
                 different from the segmented day-context selector. ───────── */}
            <div className="mb-8">
              <SectionLabel>{hi ? 'अभी मदद चाहिए?' : 'Need help right now?'}</SectionLabel>
              <div className="grid grid-cols-2 gap-2">
                {PROBLEM_SHORTCUTS.map(q => {
                  const Icon = q.icon;
                  return (
                    <Link
                      key={q.id}
                      to="/coaching"
                      state={{ prefillMsg: q.prefill[hi ? 'hi' : 'en'] }}
                      className="card-surface flex items-center gap-2.5 px-3.5 py-3 min-h-[56px] active:scale-[0.98] transition-transform focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
                    >
                      <Icon size={15} className="text-brand-400 shrink-0" aria-hidden="true" />
                      <span className="text-caption font-semibold text-ink leading-snug">
                        {q.label[hi ? 'hi' : 'en']}
                      </span>
                    </Link>
                  );
                })}
              </div>
            </div>

            {/* ── 4. MENTAL PLAYBOOK — a larger informative library card, no
                 scores. Its one contextual line comes only from the playbook
                 data this page already fetched. ──────────────────────────── */}
            <div className="mb-4">
              <SectionLabel>{hi ? 'तुम्हारी लाइब्रेरी' : 'Your library'}</SectionLabel>
              <Link
                to="/playbook"
                className="block card-surface p-5 active:scale-[0.98] transition-transform focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
              >
                <div className="flex items-start gap-3.5">
                  <div className="w-11 h-11 rounded-xl bg-brand-500/15 flex items-center justify-center shrink-0">
                    <BookOpen size={20} className="text-brand-400" aria-hidden="true" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-base font-bold text-ink mb-0.5">Mental Playbook</p>
                    <p className="text-caption text-slt leading-relaxed">
                      {hi
                        ? 'तुम्हारे cues, cards, reflections और सीख — सिर्फ तुम्हारे लिए, private.'
                        : 'Your cues, cards, reflections, and lessons — private to you.'}
                    </p>
                    {playbookDetail && (
                      <p className="text-caption font-medium text-brand-400 mt-1.5">{playbookDetail}</p>
                    )}
                  </div>
                  <ChevronRight size={16} className="text-muted shrink-0 mt-1" aria-hidden="true" />
                </div>
              </Link>
            </div>

            {/* ── 5. MIND JOURNAL — a larger quiet card with an amber accent
                 so it never reads as a twin of the Playbook card. No scores,
                 no diagnosis, no pressure to write daily. ─────────────────── */}
            <div className="mb-6">
              <Link
                to="/mind-journal"
                className="block card-surface p-5 active:scale-[0.98] transition-transform focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
              >
                <div className="flex items-start gap-3.5">
                  <div
                    className="w-11 h-11 rounded-xl flex items-center justify-center shrink-0"
                    style={{ background: 'rgba(217,139,43,0.12)' }}
                  >
                    <Pencil size={20} style={{ color: '#D98B2B' }} aria-hidden="true" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-base font-bold text-ink mb-0.5">{hi ? 'माइंड जर्नल' : 'Mind Journal'}</p>
                    <p className="text-caption text-slt leading-relaxed">
                      {hi
                        ? 'तुम्हारी feelings का एक निजी नोट। कोई स्कोर नहीं।'
                        : "A private place to note how you're feeling. No scores."}
                    </p>
                    <p className="text-caption text-muted mt-1.5">
                      {hi
                        ? 'जब मन करे तब लिखो — यह सिर्फ तुम्हारे अपने शब्दों के लिए है।'
                        : "Write whenever you feel like it — it's just a space for your own words."}
                    </p>
                  </div>
                  <ChevronRight size={16} className="text-muted shrink-0 mt-1" aria-hidden="true" />
                </div>
              </Link>
            </div>
          </>
        )}
      </main>
    </div>
  );
}
