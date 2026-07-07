import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import Navbar from '../components/Navbar';
import { useAuth } from '../contexts/AuthContext';
import { translations } from '../i18n/translations';
import { apiFetch } from '../api';
import GameCard from '../components/games/GameCard';
import {
  RotateCcw, Eye, ClipboardList, Layers, GraduationCap, Target, RefreshCw,
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

function SectionLabel({ children }) {
  return <p className="section-label mt-8">{children}</p>;
}

function TrainCard({
  icon: Icon, tileFg, tileBg,
  title, skillTag, desc, duration, bestFor,
  ctaLabel, onCta,
  secondaryLabel, onSecondary,
  secondaryLabel2, onSecondary2,
}) {
  const tileStyle = { '--tile-fg': tileFg, '--tile-bg': tileBg };
  return (
    <div className="card-elevated p-5 flex flex-col gap-3">

      {/* Header: icon + title + skill pill */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-3">
          <div className="icon-tile" style={tileStyle}>
            <Icon size={22} />
          </div>
          <h2 className="text-base font-bold text-ink leading-tight">{title}</h2>
        </div>
        <span className="tag-pill" style={tileStyle}>{skillTag}</span>
      </div>

      {/* Description */}
      <p className="text-sm text-slt leading-relaxed">{desc}</p>

      {/* Duration + Best for */}
      <div className="flex items-center gap-1.5 text-xs text-muted">
        <span>{duration}</span>
        <span>·</span>
        <span>{bestFor}</span>
      </div>

      {/* CTA row */}
      <div className={`flex items-center mt-1 ${(secondaryLabel || secondaryLabel2) ? 'justify-between' : 'justify-end'}`}>
        {(secondaryLabel || secondaryLabel2) && (
          <div className="flex items-center gap-3">
            {secondaryLabel && (
              <button
                onClick={onSecondary}
                className="text-xs font-semibold text-brand-400 active:opacity-70 py-1"
              >
                {secondaryLabel}
              </button>
            )}
            {secondaryLabel && secondaryLabel2 && <span className="text-xs text-muted">·</span>}
            {secondaryLabel2 && (
              <button
                onClick={onSecondary2}
                className="text-xs font-semibold text-brand-400 active:opacity-70 py-1"
              >
                {secondaryLabel2}
              </button>
            )}
          </div>
        )}
        <button
          onClick={onCta}
          className="btn-gradient text-sm px-6"
          style={{ minHeight: '44px' }}
        >
          {ctaLabel}
        </button>
      </div>

    </div>
  );
}

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

      <main className="max-w-lg mx-auto px-4 pt-20 pb-24 animate-fade-in">

        {/* Page header */}
        <div className="pt-4 mb-2">
          <p className="text-2xl font-black text-ink">{hi ? 'ट्रेन करो' : 'Train'}</p>
          <p className="text-sm text-slt mt-1">
            {hi ? 'अपनी मानसिक ट्रेनिंग शुरू करो।' : 'Your mental training toolkit.'}
          </p>
        </div>

        {/* ── PRE-MATCH / TRAINING ────────────────────────────────────────── */}
        <SectionLabel>{hi ? 'मैच / ट्रेनिंग से पहले' : 'Pre-match / Training'}</SectionLabel>
        <div className="space-y-3">
          <TrainCard
            icon={RotateCcw}
            tileFg="#2E7D6B"
            tileBg="#F0FAF7"
            title="Pressure Reset"
            skillTag={hi ? 'तनाव और घबराहट' : 'Tension & nerves'}
            desc={hi
              ? 'टॉप एथलीट्स कंट्रोल्ड ब्रीदिंग का इस्तेमाल करते हैं ताकि शरीर को स्थिर रखें, तनाव कम करें, और ट्रेनिंग या कॉम्पिटिशन से पहले ध्यान वापस अगले एक्शन पर लाएं।'
              : 'Top athletes use controlled breathing to steady their body, lower tension, and bring attention back to the next action before training or competition.'}
            duration="3 min"
            bestFor={hi ? 'घबराया हुआ, तना हुआ, या ओवरलोडेड' : 'Nervous, tight, or overloaded'}
            ctaLabel={hi ? 'शुरू करो' : 'Start'}
            onCta={() => navigate('/body-reset')}
            secondaryLabel={!pressureResetLearned ? (hi ? 'पहले सीखो' : 'Learn first') : undefined}
            onSecondary={() => navigate('/skills/pressure-reset')}
            secondaryLabel2={hi ? 'Reset history देखो →' : 'View reset history →'}
            onSecondary2={() => navigate('/body-reset/history')}
          />
          <TrainCard
            icon={Eye}
            tileFg="#6366F1"
            tileBg="#EEF2FF"
            title="Visualization"
            skillTag={hi ? 'मानसिक रिहर्सल' : 'Mental rehearsal'}
            desc={hi
              ? 'ट्रेनिंग या कॉम्पिटिशन से पहले एक मुख्य पल को मन में रिहर्स करो।'
              : 'Rehearse one key moment before training or competition.'}
            duration="4 min"
            bestFor={hi ? 'प्रदर्शन से पहले' : 'Before performance'}
            ctaLabel={hi ? 'शुरू करो' : 'Start Visualizing'}
            onCta={() => navigate('/visualization')}
          />
        </div>

        {/* ── POST-MATCH / TRAINING ───────────────────────────────────────── */}
        <SectionLabel>{hi ? 'मैच / ट्रेनिंग के बाद' : 'Post-match / Training'}</SectionLabel>
        <div className="space-y-3">
          <TrainCard
            icon={ClipboardList}
            tileFg="#1E3A5F"
            tileBg="#EFF6FF"
            title={hi ? 'After Match / Training' : 'After Match / Training'}
            skillTag={hi ? 'मैच के बाद' : 'After match'}
            desc={hi
              ? 'सेशन के बाद रिफ्लेक्ट करो और आगे सुधारने के लिए एक चीज़ चुनो।'
              : 'Reflect after a session and choose one thing to improve next.'}
            duration="4 min"
            bestFor={hi ? 'मैच या ट्रेनिंग के बाद' : 'After match or training'}
            ctaLabel={hi ? 'रिव्यू शुरू करो' : 'Start Review'}
            onCta={() => navigate('/debrief')}
          />
        </div>

        {/* ── BUILD MENTAL SKILLS ──────────────────────────────────────────── */}
        <SectionLabel>{hi ? 'मानसिक स्किल बनाओ' : 'Build Mental Skills'}</SectionLabel>
        <div className="space-y-3">
          <TrainCard
            icon={GraduationCap}
            tileFg="#185FA5"
            tileBg="#EBF3FC"
            title="Focus / Focus Words"
            skillTag={hi ? 'सीखो' : 'Learn'}
            desc={hi
              ? 'सीखो कि अपने मन को एक काम के Focus Word पर कैसे वापस लाओ।'
              : 'Learn how to bring your mind back to one useful focus word.'}
            duration="5 min"
            bestFor={hi ? 'फोकस खोना' : 'Losing focus'}
            ctaLabel={hi ? 'अभी शुरू करो' : 'Start now'}
            onCta={() => navigate('/skills/focus-self-talk')}
          />
          <TrainCard
            icon={Layers}
            tileFg="#185FA5"
            tileBg="#EBF3FC"
            title="Focus Card Builder"
            skillTag={hi ? 'फोकस और दबाव' : 'Focus & pressure'}
            desc={hi
              ? 'दबाव वाली सोच को ऐसे शब्दों में बदलो जो ट्रेनिंग और कॉम्पिटिशन में काम आएं।'
              : 'Turn pressure thoughts into words you can use in training and competition.'}
            duration="5 min"
            bestFor={hi ? 'फोकस, आत्मविश्वास, दबाव' : 'Focus, confidence, pressure'}
            ctaLabel={hi ? 'Focus Card बनाओ' : 'Build Focus Card'}
            onCta={() => navigate('/self-talk')}
            secondaryLabel={hi ? 'Focus Cards देखो →' : 'View Focus Cards →'}
            onSecondary={() => navigate('/focus-deck')}
          />
        </div>

        {/* ── GAMES ────────────────────────────────────────────────────────── */}
        <SectionLabel>{hi ? 'गेम्स' : 'Games'}</SectionLabel>
        <p className="text-sm text-slt mb-3">{mr.subtitle}</p>
        <div className="flex flex-col sm:flex-row gap-3">
          {GAMES.map(game => (
            <div key={game.id} className="flex-1">
              <GameCard
                icon={game.icon}
                tileFg={game.tileFg}
                tileBg={game.tileBg}
                title={mr.cards[game.id].title}
                purpose={mr.cards[game.id].purpose}
                skillTag={mr.cards[game.id].skillTag}
                playsToday={gameStatus[game.id].playsToday}
                limit={gameStatus[game.id].limit}
                onPlay={() => navigate(game.path)}
              />
            </div>
          ))}
        </div>
        <p className="text-center text-xs text-muted pt-3">
          {mr.repsDone(gameStatus.totalToday, gameStatus.totalLimit)}
        </p>

      </main>
    </div>
  );
}
