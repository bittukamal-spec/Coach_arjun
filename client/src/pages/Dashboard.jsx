import { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import Navbar from '../components/Navbar';
import ConsentBanner from '../components/ConsentBanner';
import { useAuth } from '../contexts/AuthContext';
import { apiFetch } from '../api';
import { translations } from '../i18n/translations';
import { ChevronRight, ChevronDown, MessageCircle, Calendar, Sparkles, CloudRain, RefreshCw, Crosshair, TrendingUp } from 'lucide-react';
import { SectionLabel } from '../components/ui';
import { CardWaves, RingMark } from '../components/visuals/CardArt';
import MindJournalArt from '../components/visuals/MindJournalArt';

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
// recovery day swap what the single card's own action is. `tone` is purely
// the recommendation badge's accent (same blue/teal/amber family Train's
// gradient cards use) — it changes no behaviour.
const PRIMARY_ACTION = {
  default: {
    title: { en: "Today's Mental Rep", hi: 'आज का मेंटल रेप' },
    desc:   { en: '4 minutes to get your mind ready.', hi: 'मन को तैयार करने के लिए 4 मिनट।' },
    cta:    { en: 'Start Rep', hi: 'रेप शुरू करो' },
    to: '/mental-rep',
    tone: '#185FA5',
  },
  match: {
    title: { en: 'Pressure Reset', hi: 'Pressure Reset' },
    desc:   { en: 'Lock in one cue before you play.', hi: 'खेलने से पहले एक cue lock करो।' },
    cta:    { en: 'Open Pressure Reset', hi: 'Pressure Reset खोलो' },
    to: '/body-reset',
    tone: '#2E7D6B',
  },
  recovery: {
    title: { en: 'Reflect Like an Athlete', hi: 'Reflect करो' },
    desc:   { en: 'Log what worked and one thing to improve.', hi: 'जो काम किया उसे log करो।' },
    cta:    { en: 'Start Reflection', hi: 'Reflection शुरू करो' },
    to: '/debrief',
    tone: '#D97F1E',
  },
};

// Problem shortcuts — all four enter Coach with a visible, unsent prefill
// instead of jumping straight to a tool. Stable internal starter values,
// independent of the button's own display label. `tintBg`/`tintText` are
// literal Tailwind classes (not composed at runtime) so the vibrant
// per-shortcut accent stays on the existing token palette.
const PROBLEM_SHORTCUTS = [
  { id: 'nervous',    icon: CloudRain,  tintBg: 'bg-brand-500/10',  tintText: 'text-brand-500',
    label: { en: "I'm nervous",            hi: 'मैं nervous हूं' },
    prefill: { en: "I'm feeling nervous.", hi: 'मुझे घबराहट हो रही है।' } },
  { id: 'mistake',    icon: RefreshCw,  tintBg: 'bg-win-500/10',    tintText: 'text-win-500',
    label: { en: 'I made a mistake',       hi: 'गलती हो गई' },
    prefill: { en: "I made a mistake and can't stop thinking about it.", hi: 'मुझसे गलती हो गई और मैं उसके बारे में सोचना बंद नहीं कर पा रहा।' } },
  { id: 'focus',      icon: Crosshair,  tintBg: 'bg-purple-500/10', tintText: 'text-purple-500',
    label: { en: 'I need focus',           hi: 'फोकस चाहिए' },
    prefill: { en: 'I need help focusing.', hi: 'मुझे फोकस करने में मदद चाहिए।' } },
  { id: 'confidence', icon: TrendingUp, tintBg: 'bg-fire-600/10',   tintText: 'text-fire-600',
    label: { en: 'I feel low confidence',  hi: 'confidence कम है' },
    prefill: { en: "I'm feeling low on confidence.", hi: 'मेरा confidence कम है।' } },
];

export default function Dashboard() {
  const navigate = useNavigate();
  const { user, token, language } = useAuth();
  const hi = language === 'hi';

  // ── state ──────────────────────────────────────────────────────────────────
  const [loaded,            setLoaded]            = useState(false);
  // Today's context (training / match / recovery / just_rep) — remembered
  // for the rest of the day so the recommended tool stays stable.
  const [dayContext,        setDayContext]        = useState(() => {
    try {
      const saved = JSON.parse(localStorage.getItem('arjun_day_context') || 'null');
      return saved?.date === new Date().toISOString().slice(0, 10) ? saved.context : null;
    } catch { return null; }
  });

  // ── data fetch ─────────────────────────────────────────────────────────────
  // Unchanged: still exactly one read-only GET /api/playbook, same endpoint
  // and same timing as before. The Home Playbook card that used to render a
  // line from this payload is gone (Playbook has its own bottom-nav
  // destination), so the response is no longer read — but the call itself is
  // deliberately preserved rather than silently dropping a Dashboard API
  // contract in a presentation-only stage. It also gates the skeleton below.
  useEffect(() => {
    apiFetch('/api/playbook', { headers: { Authorization: `Bearer ${token}` } })
      .catch(() => {})
      .finally(() => setLoaded(true));
  }, [token]);

  function pickContext(ctx) {
    setDayContext(ctx);
    localStorage.setItem('arjun_day_context', JSON.stringify({ date: new Date().toISOString().slice(0, 10), context: ctx }));
  }

  // ── derived ────────────────────────────────────────────────────────────────
  const L = translations[language] || translations.en;
  const t = L.home;
  const firstName = (user?.name || '').split(' ')[0] || t.athleteFallback;
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
            {/* Profile/avatar access lives in the Navbar above — unchanged. */}
            <div className="pt-1 mb-5">
              {/* The greeting IS Home's page title, so it carries the <h1>.
                  Classes unchanged — semantics only. */}
              <h1 className="text-2xl font-black text-ink leading-tight">
                {t.greeting(firstName)}
              </h1>
            </div>

            {/* ── 2. TALK TO ARJUN — the ONE dominant action on Home.
                 A plain <Link> to the existing Coach route: opening Home
                 never creates a session, never claims the deterministic
                 follow-up opener, and never touches any chat API. All of
                 that stays inside Coach itself, exactly as before. Visual
                 refresh only: a stronger two-tone blue gradient, a subtle
                 wave-line background, a circular icon treatment, and a
                 circular chevron CTA — the route/behaviour are untouched. */}
            <div className="mb-7">
              <Link
                to="/coaching"
                className="relative overflow-hidden block rounded-[26px] p-5 elevation-hero active:scale-[0.99] transition-transform focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2"
                style={{ background: 'linear-gradient(135deg, #1F85D0 0%, #0C4D85 100%)' }}
              >
                <CardWaves className="text-white" opacity={0.18} />
                {/* The whole card is a single "open Coach" action, so its
                    content centers. The icon and chevron columns are the
                    same width so the centered title/sub sit at the card's
                    true visual centre instead of being pulled left by the
                    chevron. */}
                <div className="relative z-10 flex items-center gap-3.5">
                  <div className="w-14 h-14 rounded-full bg-white/15 flex items-center justify-center shrink-0">
                    <MessageCircle size={26} className="text-white" aria-hidden="true" />
                  </div>
                  <div className="flex-1 min-w-0 text-center">
                    <p className="text-xl font-black text-white leading-tight">
                      {L.dashboard.openCoach}
                    </p>
                    <p className="text-caption text-white/85 leading-snug mt-0.5">
                      {t.heroSub}
                    </p>
                  </div>
                  <div className="w-11 h-11 rounded-full bg-white/20 flex items-center justify-center shrink-0" aria-hidden="true">
                    <ChevronRight size={20} className="text-white" />
                  </div>
                </div>
              </Link>
            </div>

            {/* ── 3. DAY-CONTEXT SELECTOR — a single dropdown row instead of a
                 grid of pills, merged into the same rounded container as the
                 recommendation below it. Unchanged behaviour: picking a
                 context only swaps the recommended practice below — it
                 never navigates and never writes to any API. ───────────── */}
            {/* ── 4. RECOMMENDED PRACTICE — the existing adaptive action,
                 sharing one visual container with the day-context picker so
                 the two read as one "what's today" decision instead of two
                 separate things. Its title/description/CTA still swap with
                 the athlete's context pick; nothing about the recommendation
                 logic, its routes or its route state changed. Home never
                 marks a practice complete. ─────────────────────────────── */}
            <div className="mb-7">
              <h2 className="text-lg font-extrabold text-ink mb-3">{t.contextLabel}</h2>
              <div className="rounded-2xl border border-dark-600 bg-dark-400 p-3.5 elevation-card">
                <div className="relative mb-4">
                  <div
                    className="absolute left-1.5 top-1/2 -translate-y-1/2 w-9 h-9 rounded-lg flex items-center justify-center pointer-events-none"
                    style={{ background: 'var(--brand-primary)' }}
                    aria-hidden="true"
                  >
                    <Calendar size={16} className="text-white" />
                  </div>
                  <select
                    aria-label={t.contextLabel}
                    value={dayContext || ''}
                    onChange={e => pickContext(e.target.value || null)}
                    className="w-full appearance-none rounded-xl border border-dark-600 bg-brand-50 pl-14 pr-10 py-3 text-sm font-bold text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
                  >
                    <option value="">{t.contextPlaceholder}</option>
                    {DAY_CONTEXTS.map(c => (
                      <option key={c.id} value={c.id}>{c[lang]}</option>
                    ))}
                  </select>
                  <ChevronDown size={18} className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-brand-600" aria-hidden="true" />
                </div>

                <div className="flex items-center gap-3">
                  <div
                    className="w-11 h-11 rounded-xl flex items-center justify-center shrink-0"
                    style={{ background: `${primaryAction.tone}1F` }}
                  >
                    <RingMark tone={primaryAction.tone} size={20} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="text-base font-bold text-ink leading-tight">{primaryAction.title[lang]}</h3>
                    <p className="text-caption text-slt leading-snug mt-0.5">{primaryAction.desc[lang]}</p>
                  </div>
                  <button
                    onClick={() => navigate(primaryAction.to, primaryActionState)}
                    className="btn-primary shrink-0 px-4 py-3 text-[13px] leading-tight text-center whitespace-normal"
                  >
                    {primaryAction.cta[lang]}
                  </button>
                </div>

                <div className="border-t border-dark-600 mt-4 pt-3 flex items-center justify-center gap-1.5">
                  <Sparkles size={13} className="text-brand-500 shrink-0" aria-hidden="true" />
                  <p className="text-caption font-medium text-brand-500">{t.recommendHint}</p>
                </div>
              </div>
            </div>

            {/* ── 5. CONTINUE COACHING — intentionally not rendered yet.
                 Its eligibility ("an existing conversation") has no
                 read-only source available to Home: GET /api/sessions
                 performs the 7-day cycle rollover and fire-and-forget
                 weekly-review generation, so calling it here would change
                 when cycles roll over. GET /api/playbook carries no session
                 signal. Adding one would mean new API surface, which this
                 stage excludes. Deferred rather than faked. ─────────────── */}

            {/* ── 6. NEED HELP RIGHT NOW — visually demoted to a smaller
                 secondary section, now headed "Pick what you need now" with
                 more vibrant per-shortcut icon accents. Every route, prefill
                 and behaviour is unchanged: real <Link> elements to
                 /coaching carrying a visible, unsent prefill. ───────────── */}
            <div className="mb-7">
              <h2 className="text-lg font-extrabold text-ink mb-3">{t.helpLabel}</h2>
              <div className="grid grid-cols-2 gap-2.5">
                {PROBLEM_SHORTCUTS.map(q => {
                  const Icon = q.icon;
                  return (
                    <Link
                      key={q.id}
                      to="/coaching"
                      state={{ prefillMsg: q.prefill[hi ? 'hi' : 'en'] }}
                      className="rounded-2xl border border-dark-600 bg-dark-400 elevation-row flex flex-col items-center justify-center text-center gap-2 px-3 py-4 min-h-[48px] active:scale-[0.98] transition-transform focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
                    >
                      <div className={`w-11 h-11 rounded-full flex items-center justify-center shrink-0 ${q.tintBg}`}>
                        <Icon size={20} className={q.tintText} aria-hidden="true" />
                      </div>
                      <span className="text-[12.5px] font-bold text-ink leading-snug [text-wrap:pretty]">
                        {q.label[hi ? 'hi' : 'en']}
                      </span>
                    </Link>
                  );
                })}
              </div>
            </div>

            {/* ── 7. MIND JOURNAL — the final secondary card before the
                 bottom navigation. Route and behaviour unchanged; the Mind
                 Journal screen itself is not redesigned in this stage. An
                 illustrated CTA replaces the old icon-row treatment: one
                 heading, one value statement, and an explicit CTA button. ── */}
            <div className="mb-6">
              <Link
                to="/mind-journal"
                className="relative overflow-hidden block rounded-2xl border border-dark-600 bg-brand-50 p-4 active:scale-[0.98] transition-transform focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
              >
                <div className="flex items-center gap-4">
                  <MindJournalArt className="w-20 h-20 shrink-0" accentColor="var(--accent-amber)" />
                  <div className="flex-1 min-w-0">
                    <p className="text-[11px] font-bold uppercase tracking-wider mb-1" style={{ color: 'var(--brand-primary)' }}>
                      {t.journalTitle}
                    </p>
                    <p className="text-base font-black text-ink leading-tight mb-1 [text-wrap:pretty]">{t.journalHeading}</p>
                    <p className="text-caption text-slt leading-relaxed mb-3 [text-wrap:pretty]">
                      {t.journalValue}
                    </p>
                    <span className="inline-flex items-center gap-1 rounded-full border-2 border-brand-500 text-brand-600 font-bold text-[13px] px-4 py-2 whitespace-nowrap">
                      {t.journalCta}
                      <ChevronRight size={14} aria-hidden="true" />
                    </span>
                  </div>
                </div>
              </Link>
            </div>
          </>
        )}
      </main>
    </div>
  );
}
