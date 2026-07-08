import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import Navbar from '../components/Navbar';
import { useAuth } from '../contexts/AuthContext';
import { translations } from '../i18n/translations';
import { apiFetch } from '../api';
import GameCard from '../components/games/GameCard';
import SectionHeader from '../components/train/SectionHeader';
import FeatureToolCard from '../components/train/FeatureToolCard';
import SmallToolRow from '../components/train/SmallToolRow';
import {
  RotateCcw, Eye, ClipboardList, GraduationCap, MessageSquare, Layers, Target, RefreshCw, Zap, BookOpen,
} from 'lucide-react';

// Accent colours reused verbatim from parseArjunMessage.js's APP_TOOL_CONFIG
// so a tool looks the same on the Train card and in a chat recommendation.
const GAMES = [
  { id: 'focusLock',  icon: Target,     tileFg: '#185FA5', tileBg: '#EBF3FC', path: '/games/focus-lock'  },
  { id: 'resetRally', icon: RefreshCw,  tileFg: '#185FA5', tileBg: '#EBF3FC', path: '/games/reset-rally' },
];

const DEFAULT_GAME_STATUS = {
  focusLock:  { playsToday: 0, limit: 3 },
  resetRally: { playsToday: 0, limit: 3 },
  totalToday: 0,
  totalLimit: 5,
};

export default function TrainPage() {
  const navigate = useNavigate();
  const { token, language } = useAuth();
  const hi = language === 'hi';
  const mr = translations[language].mentalReps;

  const [gameStatus, setGameStatus] = useState(DEFAULT_GAME_STATUS);
  const [pressureResetLearned, setPressureResetLearned] = useState(true);

  useEffect(() => {
    apiFetch('/api/games/status', { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.json())
      .then(data => { if (data && data.focusLock) setGameStatus(data); })
      .catch(() => {});
  }, [token]);

  // "Learn first" only shows on the Pressure Reset card until the athlete
  // has passed its Quick Check once — soft guidance, never a hard gate.
  useEffect(() => {
    apiFetch('/api/skills/calm_body', { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.json())
      .then(data => setPressureResetLearned(!!data?.quickCheckPassedAt))
      .catch(() => setPressureResetLearned(true));
  }, [token]);

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
              secondaryLabel={!pressureResetLearned ? (hi ? 'पहले सीखो' : 'Learn first') : undefined}
              onSecondary={() => navigate('/skills/pressure-reset')}
              secondaryLabel2={hi ? 'Reset history देखो →' : 'View history →'}
              onSecondary2={() => navigate('/body-reset/history')}
            />
          </div>
          <FeatureToolCard
            icon={Eye}
            variant="purple"
            title="Visualization"
            tag={hi ? 'मानसिक रिहर्सल' : 'Mental rehearsal'}
            desc={hi
              ? 'ट्रेनिंग या कॉम्पिटिशन से पहले एक मुख्य पल को मन में रिहर्स करो।'
              : 'Rehearse one key moment before training or competition.'}
            meta="4 min · Before performance"
            ctaLabel={hi ? 'शुरू करो' : 'Start Visualizing'}
            onCta={() => navigate('/visualization')}
          />
        </div>

        {/* ── POST-MATCH / TRAINING ───────────────────────────────────────── */}
        <SectionHeader className="mt-8">{hi ? 'मैच / ट्रेनिंग के बाद' : 'Post-match / Training'}</SectionHeader>
        <div className="space-y-3">
          <FeatureToolCard
            icon={ClipboardList}
            variant="amber"
            title={hi ? 'After Match / Training' : 'After Match / Training'}
            tag={hi ? 'मैच के बाद' : 'After match'}
            desc={hi
              ? 'सेशन के बाद रिफ्लेक्ट करो और आगे सुधारने के लिए एक चीज़ चुनो।'
              : 'Reflect after a session and choose one thing to improve next.'}
            meta="4 min · After match or training"
            ctaLabel={hi ? 'रिव्यू शुरू करो' : 'Start Review'}
            onCta={() => navigate('/debrief')}
          />
        </div>

        {/* ── BUILD MENTAL SKILLS ──────────────────────────────────────────── */}
        <SectionHeader className="mt-8">{hi ? 'मानसिक स्किल बनाओ' : 'Build Mental Skills'}</SectionHeader>
        <div className="space-y-2.5 md:grid md:grid-cols-2 md:gap-2.5 md:space-y-0">
          <SmallToolRow
            icon={GraduationCap}
            title="Focus / Focus Words"
            desc={hi ? 'सीखो कि अपने मन को एक Focus Word पर कैसे वापस लाओ।' : 'Learn how to bring your mind back to one focus word.'}
            onClick={() => navigate('/skills/focus-self-talk')}
          />
          <SmallToolRow
            icon={Zap}
            title={hi ? 'Daily Mental Rep' : 'Daily Mental Rep'}
            desc={hi ? '4 मिनट में मन तैयार करो और एक cue लेकर निकलो।' : 'A 4-minute rep that ends with one cue you take to training.'}
            onClick={() => navigate('/mental-rep')}
          />
          <SmallToolRow
            icon={MessageSquare}
            title="Focus Card Builder"
            desc={hi ? 'दबाव वाली सोच को एक Focus Card में बदलो।' : 'Turn pressure thoughts into a Focus Card.'}
            onClick={() => navigate('/self-talk')}
          />
          <SmallToolRow
            icon={Layers}
            title={hi ? 'Focus Deck' : 'Focus Deck'}
            desc={hi ? 'अपने saved Focus Cards देखो और अभ्यास करो।' : 'Review and practise your saved Focus Cards.'}
            onClick={() => navigate('/focus-deck')}
          />
          <SmallToolRow
            icon={BookOpen}
            title={hi ? 'Mental Playbook' : 'Mental Playbook'}
            desc={hi ? 'तुम्हारे cues, cards और reflections — private.' : 'Your cues, cards, and reflections — private.'}
            onClick={() => navigate('/playbook')}
          />
        </div>

        {/* ── GAMES ────────────────────────────────────────────────────────── */}
        <SectionHeader className="mt-8">{hi ? 'गेम्स' : 'Games'}</SectionHeader>
        <p className="text-sm text-slt mb-3">{mr.subtitle}</p>
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="flex-1">
            <GameCard
              icon={GAMES[0].icon}
              tileFg={GAMES[0].tileFg}
              tileBg={GAMES[0].tileBg}
              moment={hi ? 'खेलने से पहले' : 'Before you play'}
              title={mr.cards.focusLock.title}
              purpose={mr.cards.focusLock.purpose}
              skillTag={mr.cards.focusLock.skillTag}
              duration="60 sec"
              playsToday={gameStatus.focusLock.playsToday}
              limit={gameStatus.focusLock.limit}
              onPlay={() => navigate(GAMES[0].path)}
            />
          </div>
          <div className="flex-1">
            <GameCard
              icon={GAMES[1].icon}
              tileFg={GAMES[1].tileFg}
              tileBg={GAMES[1].tileBg}
              title={mr.cards.resetRally.title}
              purpose={mr.cards.resetRally.purpose}
              skillTag={mr.cards.resetRally.skillTag}
              duration="60–90 sec"
              playsToday={gameStatus.resetRally.playsToday}
              limit={gameStatus.resetRally.limit}
              onPlay={() => navigate(GAMES[1].path)}
            />
          </div>
        </div>
        <p className="text-center text-xs text-muted pt-3">
          {mr.repsDone(gameStatus.totalToday, gameStatus.totalLimit)}
        </p>

      </main>
    </div>
  );
}
