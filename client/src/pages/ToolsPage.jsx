import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { ChevronRight } from 'lucide-react';
import Navbar from '../components/Navbar';
import { useAuth } from '../contexts/AuthContext';
import { translations } from '../i18n/translations';
import ToolTile from '../components/tools/ToolTile';
import { RitualArt, ResetArt, RepArt, FocusArt, PracticeLogArt } from '../components/visuals/TrainArt';
import { JournalArt } from '../components/visuals/HomeArt';
import { usePath, matchPhase } from '../components/path/pathData';
import MatchMoment from '../components/match/MatchMoment';
import { clearFromPath } from '../utils/practiceReturn';

// "Start here" (onboarding v2): the tool that fits what the athlete notices
// first under pressure — body → Pressure Reset, thoughts → Focus Cards,
// feelings → Mind Journal.
const START_HERE = { body: 'pressure', thoughts: 'focusCard', feelings: 'journal' };

// Tools tab (founder layout, Nov 2026): the practices grouped by MOMENT —
// Before you play · In the moment · After you play — each a sideways row of
// square tiles. Match moments live here too: the day before / on the match
// day the prep card sits on top; after the match "How did it go?" sits on
// top and "After you play" moves first. Home only shows a one-line chip.
const ART = 'h-full w-auto max-h-[72px]';
const SECTIONS = {
  before: [
    { key: 'pressure', to: '/body-reset', tone: 'mint', art: <ResetArt className={ART} /> },
    { key: 'ritual', to: '/ritual', tone: 'sky', art: <RitualArt className={ART} /> },
  ],
  moment: [
    { key: 'quickRep', to: '/mental-rep', tone: 'sun', art: <RepArt className={ART} /> },
    { key: 'focusCard', to: '/self-talk', tone: 'coral', art: <FocusArt className={ART} /> },
  ],
  after: [
    { key: 'journal', to: '/mind-journal', tone: 'blush', art: <JournalArt size={64} /> },
    { key: 'myPractice', to: '/my-practice', tone: 'brand', art: <PracticeLogArt /> },
    { key: 'weekly', to: '/weekly-reviews', tone: 'ink', art: <PracticeLogArt /> },
  ],
};

export default function ToolsPage() {
  const { language } = useAuth();
  const L = translations[language] || translations.en;
  const t = L.trainPage;
  const tt = L.toolsPage || translations.en.toolsPage;
  const { path, reviewMatch, setMatchDay } = usePath();
  useEffect(() => { clearFromPath(); }, []);

  const phase = matchPhase(path?.match?.nextDay);
  const review = phase === 'review';
  const order = review ? ['after', 'before', 'moment'] : ['before', 'moment', 'after'];
  const bestKey = START_HERE[path?.personal?.firstSignal];
  const bestTool = bestKey ? Object.values(SECTIONS).flat().find(x => x.key === bestKey) : null;
  const name = (key) => t.practices[key]?.name || { journal: tt.journal, myPractice: tt.myPractice, weekly: tt.weeklyShort }[key];

  return (
    <div className="min-h-screen bg-dark-900">
      <main className="max-w-lg md:max-w-2xl mx-auto pt-[calc(1rem+env(safe-area-inset-top))] pb-[calc(7.5rem+env(safe-area-inset-bottom))] animate-fade-in">
        <div className="px-5 pt-1 mb-4 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-[32px] leading-[1.1] font-extrabold tracking-tight text-ink">{tt.title}</h1>
            <p className="text-sm text-slt mt-1">{tt.subtitle}</p>
          </div>
          <Navbar bare />
        </div>

        <div className="px-5" data-testid="tools-match">
          <MatchMoment path={path} reviewMatch={reviewMatch} setMatchDay={setMatchDay} />
        </div>

        {/* "Best for you" (onboarding: what they notice first) — explained, not just a tag */}
        {bestTool && (
          <div className="px-5">
            <Link to={bestTool.to} data-testid="tools-best"
              className="mb-1 flex items-center gap-3 rounded-[22px] border-2 border-sun bg-dark-400 px-4 py-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500">
              <span className="min-w-0 flex-1">
                <span className="block text-[11px] font-extrabold uppercase tracking-[0.1em] text-slt">{tt.startHere}</span>
                <span className="block text-[16px] font-extrabold text-ink">{name(bestTool.key)}</span>
                <span className="block text-[13px] leading-snug text-slt">{tt.startHereLine[path.personal.firstSignal]}</span>
              </span>
              <ChevronRight size={18} className="shrink-0 text-ink" aria-hidden="true" />
            </Link>
          </div>
        )}

        {order.map(id => (
          <section key={id} aria-labelledby={`tools-${id}`} className="mt-4" data-testid={`tools-${id}`}>
            <h2 id={`tools-${id}`} className="px-5 text-[12px] font-extrabold uppercase tracking-[0.1em] text-slt">{tt.sections[id]}</h2>
            <div className="mt-2 flex snap-x snap-mandatory scroll-px-5 gap-2.5 overflow-x-auto px-5 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              {SECTIONS[id].map(tool => (
                <ToolTile key={tool.key} to={tool.to} tone={tool.tone} title={name(tool.key)} art={tool.art} />
              ))}
            </div>
          </section>
        ))}
      </main>
    </div>
  );
}
