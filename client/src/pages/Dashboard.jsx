import { useNavigate, Link } from 'react-router-dom';
import Navbar from '../components/Navbar';
import ConsentBanner from '../components/ConsentBanner';
import { useAuth } from '../contexts/AuthContext';
import { translations } from '../i18n/translations';
import { ChevronRight, MessageCircle, CloudRain, RefreshCw, Crosshair, TrendingUp, NotebookPen } from 'lucide-react';
import { CardWaves } from '../components/visuals/CardArt';
import TrainGradientCard from '../components/train/TrainGradientCard';

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
  const { user, language } = useAuth();
  const hi = language === 'hi';

  // ── derived ────────────────────────────────────────────────────────────────
  const L = translations[language] || translations.en;
  const t = L.home;
  const firstName = (user?.name || '').split(' ')[0] || t.athleteFallback;

  // ── render ─────────────────────────────────────────────────────────────────
  // Home reads no API of its own. It used to hold a GET /api/playbook call
  // whose response was never read, purely to gate a loading skeleton; with the
  // Playbook page retired that call and its skeleton are gone, so Home renders
  // its four sections immediately from auth context alone. The endpoint itself
  // is untouched on the server.
  return (
    <div className="min-h-screen bg-dark-900">
      <Navbar />

      <main className="max-w-lg mx-auto px-4 pt-14 pb-24 animate-fade-in">
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

        {/* ── 2. MIND JOURNAL — elevated to the top of Home, directly
             under the greeting. Reuses the exact same premium gradient
             card (TrainGradientCard, wide layout) already approved for
             Train's own banner cards: icon circle,
             then heading, then supporting copy stacked in one column,
             violet gradient background (no separate border treatment),
             arrow affordance in the bottom-right corner. Deliberately
             the existing `purple` variant/gradient (not amber) and a
             distinct `Icon` (NotebookPen, not the shared RingMark) so
             this card reads as its own identity rather than a restyled
             copy of Train's amber Reflection card. No Illustration
             prop — this card's own approved copy runs noticeably
             longer than Train's own card descriptions,
             and at the ≥430px breakpoint where TrainGradientCard
             reveals its ghost illustration, the narrower text column
             it leaves behind wraps to a 4th line that collides with
             the corner arrow badge (confirmed by screenshot at
             430px). Skipping the illustration keeps the full-width
             text column at every size the copy is verified at,
             without touching the shared component (which Train still
             uses with its own, shorter copy). Only the destination
             changes — onClick still just navigates to the existing,
             unredesigned /mind-journal route. */}
        <div className="mb-7">
          {/* Violet heading ties the section label to the card's own
              violet identity below it — same purple-500 token already
              used elsewhere on this page (the "I need focus" shortcut
              icon) as this app's flat violet accent. */}
          <h2 className="text-lg font-extrabold text-purple-500 mb-3">{t.journalTitle}</h2>
          <TrainGradientCard
            variant="purple"
            title={t.journalHeading}
            desc={t.journalValue}
            Icon={NotebookPen}
            wide
            onClick={() => navigate('/mind-journal')}
          />
        </div>

        {/* ── 3. TALK TO ARJUN — the ONE dominant action on Home.
             A plain <Link> to the existing Coach route: opening Home
             never creates a session, never claims the deterministic
             follow-up opener, and never touches any chat API. All of
             that stays inside Coach itself, exactly as before. Visual
             refresh only: a richer three-stop blue gradient that darkens
             toward the right (was a flat two-stop diagonal), a faint
             wave-line background (was reading as dominant stripes), a
             circular icon treatment, and a circular chevron CTA — the
             route/behaviour are untouched. */}
        <div className="mb-7">
          <Link
            to="/coaching"
            className="relative overflow-hidden block rounded-[26px] p-5 elevation-hero active:scale-[0.99] transition-transform focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2"
            style={{ background: 'linear-gradient(115deg, #2489D8 0%, #1668AD 50%, #0A3D6B 100%)' }}
          >
            <CardWaves className="text-white" opacity={0.09} />
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

        {/* ── CONTINUE COACHING — intentionally not rendered. Its
             eligibility ("an existing conversation") has no read-only source
             available to Home: GET /api/sessions performs the 7-day cycle
             rollover and fire-and-forget weekly-review generation, so calling
             it here would change when cycles roll over. Adding a new
             read-only endpoint is out of scope. Deferred rather than
             faked. ─────────────────────────────────────────────────────── */}

        {/* ── 4. PICK WHAT YOU NEED NOW — the last section on Home, and
             deliberately still the smaller secondary one. Every route,
             prefill and behaviour is unchanged: real <Link> elements to
             /coaching carrying a visible, unsent prefill.

             The day-context selector and the recommended-practice card that
             used to sit between Talk to Arjun and this section are gone —
             Home no longer asks the athlete to classify their day before it
             will suggest anything, and nothing replaces them. Its own
             mb-7 is dropped so the last section's bottom spacing comes from
             the main element's pb-24 rather than stacking on top of it. */}
        <div>
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
      </main>
    </div>
  );
}
