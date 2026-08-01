import { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import Navbar from '../components/Navbar';
import ConsentBanner from '../components/ConsentBanner';
import { useAuth } from '../contexts/AuthContext';
import { apiFetch } from '../api';
import { translations } from '../i18n/translations';
import { ChevronRight, MessageCircle, Pencil, CloudRain, RotateCcw, Crosshair, TrendingUp } from 'lucide-react';
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
              <p className="text-2xl font-black text-ink leading-tight">
                {t.greeting(firstName)}
              </p>
            </div>

            {/* ── 2. TALK TO ARJUN — the ONE dominant action on Home.
                 A plain <Link> to the existing Coach route: opening Home
                 never creates a session, never claims the deterministic
                 follow-up opener, and never touches any chat API. All of
                 that stays inside Coach itself, exactly as before. ───────── */}
            <div className="mb-7">
              <Link
                to="/coaching"
                className="block rounded-[22px] p-5 elevation-hero active:scale-[0.99] transition-transform focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2"
                style={{ background: 'var(--brand-primary)' }}
              >
                <div className="flex items-center gap-3.5">
                  <div className="w-12 h-12 rounded-2xl bg-white/15 flex items-center justify-center shrink-0">
                    <MessageCircle size={24} className="text-white" aria-hidden="true" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xl font-black text-white leading-tight">
                      {L.dashboard.openCoach}
                    </p>
                    <p className="text-caption text-white/85 leading-snug mt-0.5">
                      {t.heroSub}
                    </p>
                  </div>
                  <ChevronRight size={20} className="text-white/80 shrink-0" aria-hidden="true" />
                </div>
              </Link>
            </div>

            {/* ── 3. DAY-CONTEXT SELECTOR — compact and visually secondary to
                 the hero above. Unchanged behaviour: aria-pressed buttons in
                 one grouped track, ≥44px targets, and picking a context only
                 swaps the recommended practice below — it never navigates
                 and never writes to any API. ───────────────────────────── */}
            <div className="mb-6">
              <SectionLabel>{t.contextLabel}</SectionLabel>
              <div
                role="group"
                aria-label={t.contextLabel}
                className="inline-flex flex-wrap gap-1 p-1 rounded-xl bg-dark-700/70 border border-dark-600"
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
            </div>

            {/* ── 4. RECOMMENDED PRACTICE — the existing adaptive action,
                 now clearly secondary to the hero. Its title/description/CTA
                 still swap with the athlete's context pick; nothing about
                 the recommendation logic, its routes or its route state
                 changed. Home never marks a practice complete. ──────────── */}
            <div className="mb-7">
              <SectionLabel>{t.recommendedLabel}</SectionLabel>
              <div className="rounded-2xl border border-dark-600 bg-dark-400 p-4 elevation-card">
                <h2 className="text-base font-bold text-ink leading-tight mb-0.5">
                  {primaryAction.title[lang]}
                </h2>
                <p className="text-caption text-slt leading-relaxed mb-3.5">
                  {primaryAction.desc[lang]}
                </p>
                <button
                  onClick={() => navigate(primaryAction.to, primaryActionState)}
                  className="btn-primary w-full text-sm"
                >
                  {primaryAction.cta[lang]}
                </button>
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
                 secondary section. Every route, prefill and behaviour is
                 unchanged: real <Link> elements to /coaching carrying a
                 visible, unsent prefill. ───────────────────────────────── */}
            <div className="mb-7">
              <SectionLabel>{t.helpLabel}</SectionLabel>
              <div className="grid grid-cols-2 gap-2">
                {PROBLEM_SHORTCUTS.map(q => {
                  const Icon = q.icon;
                  return (
                    <Link
                      key={q.id}
                      to="/coaching"
                      state={{ prefillMsg: q.prefill[hi ? 'hi' : 'en'] }}
                      className="rounded-xl border border-dark-600 bg-dark-800 flex items-center gap-2 px-3 py-2.5 min-h-[48px] active:scale-[0.98] transition-transform focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
                    >
                      <Icon size={14} className="text-brand-400 shrink-0" aria-hidden="true" />
                      <span className="text-[12px] font-semibold text-ink leading-snug">
                        {q.label[hi ? 'hi' : 'en']}
                      </span>
                    </Link>
                  );
                })}
              </div>
            </div>

            {/* ── 7. MIND JOURNAL — the final secondary card before the
                 bottom navigation. Route and behaviour unchanged; the Mind
                 Journal screen itself is not redesigned in this stage. ──── */}
            <div className="mb-6">
              <Link
                to="/mind-journal"
                className="block rounded-2xl border border-dark-600 bg-dark-800 p-4 active:scale-[0.98] transition-transform focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
              >
                <div className="flex items-start gap-3.5">
                  <div
                    className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
                    style={{ background: 'rgba(217,139,43,0.12)' }}
                  >
                    <Pencil size={18} style={{ color: '#D98B2B' }} aria-hidden="true" />
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
