import { Link } from 'react-router-dom';
import Navbar from '../components/Navbar';
import ConsentBanner from '../components/ConsentBanner';
import { useAuth } from '../contexts/AuthContext';
import { translations } from '../i18n/translations';
import { ArrowRight, ChevronRight } from 'lucide-react';
import { TalkArt, JournalArt } from '../components/visuals/HomeArt';
import PilotCommunicationPopup from '../components/pilotCommunications/PilotCommunicationPopup';
import CurrentPracticeCard from '../components/home/CurrentPracticeCard';

// Problem shortcuts — all four enter Coach with a visible, unsent prefill
// instead of jumping straight to a tool. Stable internal starter values,
// independent of the button's own display label. `dot` is a literal Tailwind
// class (not composed at runtime) from the fixed colour-block palette.
const PROBLEM_SHORTCUTS = [
  { id: 'nervous',    dot: 'bg-brand-400',
    label: { en: "I'm nervous",            hi: 'मैं nervous हूं' },
    prefill: { en: "I'm feeling nervous.", hi: 'मुझे घबराहट हो रही है।' } },
  { id: 'mistake',    dot: 'bg-coral',
    label: { en: 'I made a mistake',       hi: 'गलती हो गई' },
    prefill: { en: "I made a mistake and can't stop thinking about it.", hi: 'मुझसे गलती हो गई और मैं उसके बारे में सोचना बंद नहीं कर पा रहा।' } },
  { id: 'focus',      dot: 'bg-sun',
    label: { en: 'I need focus',           hi: 'फोकस चाहिए' },
    prefill: { en: 'I need help focusing.', hi: 'मुझे फोकस करने में मदद चाहिए।' } },
  { id: 'confidence', dot: 'bg-mint',
    label: { en: 'I feel low confidence',  hi: 'confidence कम है' },
    prefill: { en: "I'm feeling low on confidence.", hi: 'मेरा confidence कम है।' } },
];

// "Wednesday evening" — a plain, local line above the greeting.
function partOfDay(hour) {
  if (hour < 12) return 'morning';
  if (hour < 17) return 'afternoon';
  return 'evening';
}

export default function Dashboard() {
  const { user, language } = useAuth();
  const hi = language === 'hi';

  // ── derived ────────────────────────────────────────────────────────────────
  const L = translations[language] || translations.en;
  const t = L.home;
  const firstName = (user?.name || '').split(' ')[0] || t.athleteFallback;
  const now = new Date();
  const weekday = now.toLocaleDateString(hi ? 'hi-IN' : 'en-IN', { weekday: 'long' });

  // ── render ─────────────────────────────────────────────────────────────────
  // Playbook redesign. Home reads no API of its own: it renders immediately
  // from auth context, and the practice block below fetches for itself.
  // One colour block per job — blue = the practice Arjun gave, sun = talk to
  // Arjun, blush = Mind Journal — then the four plain shortcuts.
  return (
    <div className="min-h-screen bg-dark-900">
      <Navbar />

      {/* Pilot Communications v1 — at most one popup per app load, fetched
          and gated entirely by the component itself. Renders nothing when
          there is no eligible communication. */}
      <PilotCommunicationPopup />

      <main className="max-w-lg mx-auto px-5 pt-14 pb-28 animate-fade-in">
        {/* ── Guardian consent pending (under-18 accounts) ──────────────── */}
        <ConsentBanner />

        {/* ── 1. GREETING ───────────────────────────────────────────────── */}
        {/* Profile/avatar access lives in the Navbar above — unchanged. The
            greeting IS Home's page title, so it carries the <h1>. */}
        <div className="pt-2 mb-4">
          <p className="text-[13px] font-semibold text-slt">
            {t.dayLine(weekday, t.partOfDay[partOfDay(now.getHours())])}
          </p>
          <h1 className="text-[30px] leading-[1.1] font-extrabold tracking-tight text-ink">
            {t.greeting(firstName)}
          </h1>
        </div>

        {/* ── YOUR PRACTICE FROM ARJUN — the blue block, only when Coach has
             already given a practice and no final result is reported yet.
             Self-contained: the component reads the existing read-only
             active-practice endpoint and renders nothing otherwise, so the
             sections below never wait on it. */}
        <CurrentPracticeCard />

        {/* ── 2. TALK TO ARJUN — the sun block. A plain <Link> to the
             existing Coach route: opening Home never creates a session,
             never claims the deterministic follow-up opener, and never
             touches any chat API. All of that stays inside Coach itself. */}
        <Link
          to="/coaching"
          className="mb-3 flex items-center gap-3.5 min-h-[92px] rounded-3xl bg-sun text-inkblock px-5 active:scale-[0.99] transition-transform focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2"
        >
          <TalkArt />
          <span className="flex-1 min-w-0">
            <span className="block text-[19px] leading-tight font-extrabold">{L.dashboard.openCoach}</span>
            <span className="block text-[13px] leading-snug text-[#3A3206]">{t.heroSub}</span>
          </span>
          <ArrowRight size={22} strokeWidth={2.6} aria-hidden="true" />
        </Link>

        {/* ── CONTINUE COACHING — intentionally not rendered. Its
             eligibility ("an existing conversation") has no read-only source
             available to Home: GET /api/sessions performs the 7-day cycle
             rollover and fire-and-forget weekly-review generation, so calling
             it here would change when cycles roll over. Deferred rather than
             faked. ─────────────────────────────────────────────────────── */}

        {/* ── 3. MIND JOURNAL — the blush block, a compact row. Only the
             destination matters here: it navigates to the existing
             /mind-journal route and nothing else. */}
        <Link
          to="/mind-journal"
          className="mb-3 flex items-center gap-3.5 min-h-[72px] rounded-[22px] bg-blush text-inkblock px-4 py-3 active:scale-[0.99] transition-transform focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2"
        >
          <JournalArt />
          <span className="flex-1 min-w-0">
            <span className="block text-[15px] font-extrabold">{t.journalTitle}</span>
            <span className="block text-[12.5px] text-[#4A1238]">{t.journalShort}</span>
          </span>
          <ChevronRight size={18} strokeWidth={2.4} aria-hidden="true" />
        </Link>

        {/* ── 4. PICK WHAT YOU NEED NOW — the last, quietest section. Every
             route, prefill and behaviour is unchanged: real <Link> elements
             to /coaching carrying a visible, unsent prefill. */}
        <div>
          <h2 className="sr-only">{t.helpLabel}</h2>
          <div className="grid grid-cols-2 gap-2">
            {PROBLEM_SHORTCUTS.map(q => (
              <Link
                key={q.id}
                to="/coaching"
                state={{ prefillMsg: q.prefill[hi ? 'hi' : 'en'] }}
                className="rounded-2xl bg-dark-400 flex items-center gap-2 px-3 min-h-[48px] active:scale-[0.98] transition-transform focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
              >
                <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${q.dot}`} aria-hidden="true" />
                <span className="text-[13px] font-bold text-ink leading-snug [text-wrap:pretty]">
                  {q.label[hi ? 'hi' : 'en']}
                </span>
              </Link>
            ))}
          </div>
        </div>
      </main>
    </div>
  );
}
