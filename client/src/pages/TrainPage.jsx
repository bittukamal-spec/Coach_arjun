import { useNavigate } from 'react-router-dom';
import Navbar from '../components/Navbar';
import { useAuth } from '../contexts/AuthContext';
import SectionHeader from '../components/train/SectionHeader';
import FeatureToolCard from '../components/train/FeatureToolCard';
import SmallToolRow from '../components/train/SmallToolRow';
import {
  RotateCcw, ClipboardList, Zap, MessageSquare, Trophy,
} from 'lucide-react';

export default function TrainPage() {
  const navigate = useNavigate();
  const { language } = useAuth();
  const hi = language === 'hi';

  return (
    <div className="min-h-screen bg-dark-900">
      <Navbar />

      <main className="max-w-lg md:max-w-2xl mx-auto px-4 pt-20 pb-24 animate-fade-in">

        {/* Page header */}
        <div className="pt-4 mb-2">
          <p className="text-2xl font-black text-ink">{hi ? 'ट्रेन करो' : 'Train'}</p>
          <p className="text-sm text-slt mt-1">
            {hi ? 'अपनी मानसिक ट्रेनिंग शुरू करो।' : 'Your mental training toolkit.'}
          </p>
        </div>

        {/* ── PRE-MATCH / TRAINING ────────────────────────────────────────── */}
        <SectionHeader className="mt-8">{hi ? 'मैच / ट्रेनिंग से पहले' : 'Pre-match / Training'}</SectionHeader>
        <div className="space-y-3 md:grid md:grid-cols-2 md:gap-3 md:space-y-0">
          <div className="md:col-span-2">
            <FeatureToolCard
              hero
              variant="teal"
              icon={RotateCcw}
              title="Pressure Reset"
              tag={hi ? 'तनाव और घबराहट' : 'Tension & nerves'}
              desc={hi
                ? 'शरीर को स्थिर करो, तनाव कम करो, और ट्रेनिंग या कॉम्पिटिशन से पहले ध्यान वापस अगले एक्शन पर लाओ।'
                : 'Steady your body before the next action.'}
              meta="3 min · Nervous, tight, or overloaded"
              ctaLabel={hi ? 'शुरू करो' : 'Start'}
              onCta={() => navigate('/body-reset')}
              secondaryLabel2={hi ? 'Reset history देखो →' : 'View history →'}
              onSecondary2={() => navigate('/body-reset/history')}
            />
          </div>
          <SmallToolRow
            icon={Trophy}
            title="Ritual"
            desc={hi ? 'खेलने से पहले की अपनी रूटीन।' : 'Your routine before you play.'}
            onClick={() => navigate('/ritual')}
          />
        </div>

        {/* ── POST-MATCH / TRAINING ───────────────────────────────────────── */}
        <SectionHeader className="mt-8">{hi ? 'मैच / ट्रेनिंग के बाद' : 'Post-match / Training'}</SectionHeader>
        <div className="space-y-3">
          <FeatureToolCard
            icon={ClipboardList}
            variant="amber"
            title={hi ? 'Match & Practice Reflection' : 'Match & Practice Reflection'}
            tag={hi ? 'मैच के बाद' : 'After match'}
            desc={hi
              ? 'जो हुआ उसे log करो और अगली बार के लिए एक useful insight लो।'
              : 'Log what happened and get one useful insight for next time.'}
            meta="4 min · After match or training"
            ctaLabel={hi ? 'रिफ्लेक्ट करो' : 'Reflect'}
            onCta={() => navigate('/debrief')}
          />
        </div>

        {/* ── BUILD MENTAL SKILLS ──────────────────────────────────────────── */}
        <SectionHeader className="mt-8">{hi ? 'मानसिक स्किल बनाओ' : 'Build Mental Skills'}</SectionHeader>
        <div className="space-y-2.5 md:grid md:grid-cols-2 md:gap-2.5 md:space-y-0">
          <SmallToolRow
            icon={Zap}
            title={hi ? 'Daily Mental Rep' : 'Daily Mental Rep'}
            desc={hi ? '4 मिनट में मन तैयार करो और एक cue लेकर निकलो।' : 'A 4-minute rep that ends with one cue you take to training.'}
            onClick={() => navigate('/mental-rep')}
          />
          <SmallToolRow
            icon={MessageSquare}
            title="Focus Card Builder"
            desc={hi ? 'दबाव वाली सोच को एक cue में बदलो — ट्रेनिंग या मैच के लिए।' : 'Turn pressure thoughts into one cue you can use in training or match.'}
            onClick={() => navigate('/self-talk')}
          />
        </div>

      </main>
    </div>
  );
}
