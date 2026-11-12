import { useNavigate, Link } from 'react-router-dom';
import { ChevronRight } from 'lucide-react';
import Navbar from '../components/Navbar';
import { useAuth } from '../contexts/AuthContext';
import { translations } from '../i18n/translations';
import PracticeBlock from '../components/train/PracticeBlock';
import { RitualArt, ResetArt, RepArt, FocusArt, PracticeLogArt } from '../components/visuals/TrainArt';

// The FOUR real practices Arjun actually ships — nothing else. There is no
// practice-count metadata anywhere in the product, so none is rendered here.
// Routes are the existing ones.
//
// Playbook redesign: one flat colour block per practice in a single 2×2 grid,
// each with its own drawing. The two group labels are gone — four tiles do
// not need sorting — and reflection stays in the Mind Journal (its entry is
// on Home), so it is deliberately NOT re-added here as a tile. Pressure
// Reset's history link lives on the Pressure Reset intro screen itself.
const PRACTICES = [
  { key: 'ritual',    to: '/ritual',     tone: 'blue',  Art: RitualArt },
  { key: 'pressure',  to: '/body-reset', tone: 'mint',  Art: ResetArt },
  { key: 'quickRep',  to: '/mental-rep', tone: 'sun',   Art: RepArt },
  { key: 'focusCard', to: '/self-talk',  tone: 'coral', Art: FocusArt },
];

export default function TrainPage() {
  const navigate = useNavigate();
  const { language } = useAuth();
  const t = (translations[language] || translations.en).trainPage;

  return (
    <div className="min-h-screen bg-dark-900">
      <Navbar />

      <main className="max-w-lg md:max-w-2xl mx-auto px-5 pt-20 pb-28 animate-fade-in">

        {/* Page header */}
        <div className="pt-2 mb-5">
          <h1 className="text-[32px] leading-[1.1] font-extrabold tracking-tight text-ink">{t.title}</h1>
          <p className="text-sm text-slt mt-1">{t.subtitle}</p>
        </div>

        <div className="grid grid-cols-2 gap-2.5 items-stretch">
          {PRACTICES.map(p => {
            const copy = t.practices[p.key];
            return (
              <PracticeBlock
                key={p.key}
                tone={p.tone}
                title={copy.name}
                desc={copy.desc}
                Art={p.Art}
                onClick={() => navigate(p.to)}
              />
            );
          })}
        </div>

        {/* Look back — one row to "My practice" (what the athlete has done
            and how it went; Weekly Reviews are reached from there). */}
        <Link
          to="/my-practice"
          className="mt-3 flex items-center gap-3.5 min-h-[68px] rounded-[22px] bg-[#1B3FD1] text-white px-4 py-2.5 active:scale-[0.99] transition-transform focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2"
        >
          <PracticeLogArt />
          <span className="flex-1 min-w-0">
            <span className="block text-[15px] font-extrabold">{t.myPractice.name}</span>
            <span className="block text-[12.5px] text-white/90">{t.myPractice.desc}</span>
          </span>
          <ChevronRight size={18} strokeWidth={2.4} aria-hidden="true" />
        </Link>

      </main>
    </div>
  );
}
