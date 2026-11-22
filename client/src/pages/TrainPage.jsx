import { useEffect } from 'react';
import Navbar from '../components/Navbar';
import { useAuth } from '../contexts/AuthContext';
import { translations } from '../i18n/translations';
import ThisWeekStrip from '../components/home/ThisWeekStrip';
import MindChallengeHomeCard from '../components/home/MindChallengeHomeCard';
import PathSection from '../components/path/PathSection';
import { clearFromPath } from '../utils/practiceReturn';

// Train tab (founder, Nov 2026): the guided path — learn and train with
// guidance instead of picking tools at random. "This week" counts sit above
// the steps that move them; the Mind Challenge card shows when one is due.
// The tools themselves live on the Tools tab.
export default function TrainPage() {
  const { language } = useAuth();
  const t = (translations[language] || translations.en).trainHome || translations.en.trainHome;
  // Back on the path: the next practice opened from Tools returns to Tools.
  useEffect(() => { clearFromPath(); }, []);

  return (
    <div className="min-h-screen bg-dark-900">
      <main className="max-w-lg md:max-w-2xl mx-auto px-5 pt-[calc(1rem+env(safe-area-inset-top))] pb-[calc(7.5rem+env(safe-area-inset-bottom))] animate-fade-in">
        <div className="pt-1 mb-4 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-[32px] leading-[1.1] font-extrabold tracking-tight text-ink">{t.title}</h1>
            <p className="text-sm text-slt mt-1">{t.subtitle}</p>
          </div>
          <Navbar bare />
        </div>

        <ThisWeekStrip />
        <MindChallengeHomeCard />
        <div className="mt-4">
          <PathSection />
        </div>
      </main>
    </div>
  );
}
