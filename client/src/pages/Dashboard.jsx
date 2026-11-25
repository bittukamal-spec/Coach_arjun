import { Link } from 'react-router-dom';
import HomePathArea, { NextMatchTile } from '../components/home/HomePathArea';
import { usePath } from '../components/path/pathData';
import { YourWordsTile } from '../components/home/YourWordsCard';
import ToolTile from '../components/tools/ToolTile';
import { PracticeLogArt } from '../components/visuals/TrainArt';
import MindChallengeHomeCard from '../components/home/MindChallengeHomeCard';
import Navbar from '../components/Navbar';
import ConsentBanner from '../components/ConsentBanner';
import { useAuth } from '../contexts/AuthContext';
import { translations } from '../i18n/translations';
import { ArrowRight } from 'lucide-react';
import { JournalArt } from '../components/visuals/HomeArt';
import Teer from '../components/visuals/Teer';
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

export default function Dashboard() {
  const { user, language } = useAuth();
  const hi = language === 'hi';
  const pathApi = usePath();

  // ── derived ────────────────────────────────────────────────────────────────
  const L = translations[language] || translations.en;
  const t = L.home;
  const tt = L.toolsPage || translations.en.toolsPage;
  const firstName = (user?.name || '').split(' ')[0] || t.athleteFallback;

  // ── render ─────────────────────────────────────────────────────────────────
  // Playbook redesign. Home reads no API of its own: it renders immediately
  // from auth context, and the practice block below fetches for itself.
  // One colour block per job — blue = the practice Arjun gave, sun = talk to
  // Arjun, blush = Mind Journal — then the four plain shortcuts.
  return (
    <div className="min-h-screen bg-dark-900">
      {/* Pilot Communications v1 — at most one popup per app load, fetched
          and gated entirely by the component itself. Renders nothing when
          there is no eligible communication. */}
      <PilotCommunicationPopup />

      <main className="max-w-lg mx-auto px-5 pt-[calc(1rem+env(safe-area-inset-top))] pb-[calc(7.5rem+env(safe-area-inset-bottom))] animate-fade-in">
        {/* ── Guardian consent pending (under-18 accounts) ──────────────── */}
        <ConsentBanner />

        {/* ── 1. GREETING ───────────────────────────────────────────────── */}
        {/* No logo bar on Home: the greeting leads, with the account
            button beside it. The greeting IS Home's page title (<h1>). */}
        <div className="pt-2 mb-4 flex items-center justify-between gap-3">
          <div className="min-w-0">
          <h1 className="text-[30px] leading-[1.1] font-extrabold tracking-tight text-ink">
            {t.greeting(firstName)}
          </h1>
          </div>
          <Navbar bare />
        </div>

        {/* ── MIND CHALLENGE — Hook Model trigger; only when one can be played */}
        <MindChallengeHomeCard />

        {/* ── YOUR NEXT STEP on the path, or the match prep / "How did it go?" card */}
        <HomePathArea api={pathApi} />

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
          data-testid="home-talk"
          className="mb-3 flex items-center gap-3 min-h-[104px] rounded-[28px] bg-sun text-inkblock pl-4 pr-5 py-3 active:scale-[0.99] transition-transform focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2"
        >
          <Teer pose="wave" height={84} motion="twice" eager className="shrink-0 drop-shadow-[0_8px_12px_rgba(16,21,51,0.18)]" />
          {/* Founder (Nov 2026): title only, one line, centred in the block */}
          <span className="flex-1 min-w-0 whitespace-nowrap text-[24px] leading-tight font-extrabold">{L.dashboard.openCoach}</span>
          <ArrowRight size={24} strokeWidth={2.6} aria-hidden="true" />
        </Link>

        {/* ── CONTINUE COACHING — intentionally not rendered. Its
             eligibility ("an existing conversation") has no read-only source
             available to Home: GET /api/sessions performs the 7-day cycle
             rollover and fire-and-forget weekly-review generation, so calling
             it here would change when cycles roll over. Deferred rather than
             faked. ─────────────────────────────────────────────────────── */}

        {/* ── 3. YOUR SPACE — founder (Nov 2026): Home was too busy, so the
             journal, look-backs and the athlete's own saved word sit in one
             sideways row of square tiles, like Tools. */}
        <section aria-labelledby="home-space" className="mb-4" data-testid="home-tiles">
          <h2 id="home-space" className="text-[12px] font-extrabold uppercase tracking-[0.1em] text-slt">{t.spaceTitle}</h2>
          <div className="-mx-5 mt-2 flex snap-x snap-mandatory scroll-px-5 gap-2.5 overflow-x-auto px-5 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            <ToolTile to="/mind-journal" tone="blush" title={tt.journal} art={<JournalArt size={56} />} />
            <YourWordsTile />
            <NextMatchTile api={pathApi} />
            <ToolTile to="/my-practice" tone="brand" title={tt.myPractice} art={<PracticeLogArt />} />
            <ToolTile to="/weekly-reviews" tone="ink" title={tt.weeklyShort} art={<PracticeLogArt />} />
          </div>
        </section>

        {/* ── 4. QUICK STARTS — one slim sideways row. Each opens Coach with
             the message sent straight away (founder decision, Nov 2026). */}
        <section aria-labelledby="home-help">
          <h2 id="home-help" className="text-[12px] font-extrabold uppercase tracking-[0.1em] text-slt">{t.helpLabel}</h2>
          <div className="-mx-5 mt-2 flex gap-2 overflow-x-auto px-5 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {PROBLEM_SHORTCUTS.map(q => (
              <Link
                key={q.id}
                to="/coaching"
                state={{ prefillMsg: q.prefill[hi ? 'hi' : 'en'], autoSend: true }}
                className="shrink-0 rounded-full bg-dark-400 flex items-center gap-2 px-4 min-h-[44px] active:scale-[0.98] transition-transform focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
              >
                <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${q.dot}`} aria-hidden="true" />
                <span className="whitespace-nowrap text-[13px] font-bold text-ink">
                  {q.label[hi ? 'hi' : 'en']}
                </span>
              </Link>
            ))}
          </div>
        </section>
      </main>
    </div>
  );
}
