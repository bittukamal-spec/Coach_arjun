import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import Navbar from '../components/Navbar';
import { useAuth } from '../contexts/AuthContext';
import { translations } from '../i18n/translations';
import { apiFetch } from '../api';
import GameCard from '../components/games/GameCard';
import {
  Wind, RotateCcw, Eye, ClipboardList, Layers,
} from 'lucide-react';

const GAMES = [
  { id: 'focusLock',  icon: '🎯', path: '/games/focus-lock'  },
  { id: 'resetRally', icon: '🔄', path: '/games/reset-rally' },
];

const DEFAULT_GAME_STATUS = {
  focusLock:  { playsToday: 0, limit: 3 },
  resetRally: { playsToday: 0, limit: 3 },
  totalToday: 0,
  totalLimit: 5,
};

function SectionLabel({ children }) {
  return (
    <p className="text-[11px] font-bold text-slt uppercase tracking-widest mb-4 mt-8">
      {children}
    </p>
  );
}

function TrainCard({
  icon: Icon, iconBg, iconColor,
  title, skillTag, desc, duration, bestFor,
  ctaLabel, onCta,
  secondaryLabel, onSecondary,
}) {
  return (
    <div className="bg-dark-400 border border-dark-600 rounded-2xl p-5 flex flex-col gap-3">

      {/* Header: icon + title + skill pill */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-3">
          <div className={`w-11 h-11 rounded-xl flex items-center justify-center shrink-0 ${iconBg}`}>
            <Icon size={22} className={iconColor} />
          </div>
          <h2 className="text-base font-bold text-ink leading-tight">{title}</h2>
        </div>
        <span
          className="text-[11px] font-semibold px-2.5 py-1 rounded-full whitespace-nowrap shrink-0"
          style={{ backgroundColor: 'rgba(24,95,165,0.10)', color: '#185FA5' }}
        >
          {skillTag}
        </span>
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
      <div className={`flex items-center mt-1 ${secondaryLabel ? 'justify-between' : 'justify-end'}`}>
        {secondaryLabel && (
          <button
            onClick={onSecondary}
            className="text-xs font-semibold text-brand-400 active:opacity-70 py-1"
          >
            {secondaryLabel}
          </button>
        )}
        <button
          onClick={onCta}
          className="text-white text-sm font-semibold px-6 rounded-xl active:scale-[0.98] transition-transform"
          style={{ backgroundColor: '#185FA5', minHeight: '44px' }}
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

  useEffect(() => {
    apiFetch('/api/games/status', { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.json())
      .then(data => { if (data && data.focusLock) setGameStatus(data); })
      .catch(() => {});
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
            icon={Wind}
            iconBg="bg-teal-500/15"
            iconColor="text-teal-400"
            title={hi ? 'सांस लो' : 'Breathing / Calm Body'}
            skillTag={hi ? 'शांति' : 'Calm'}
            desc={hi
              ? 'ट्रेनिंग, ट्रायल, या कॉम्पिटिशन से पहले अपने शरीर को शांत करो।'
              : 'Settle your body before training, trials, or competition.'}
            duration="2 min"
            bestFor={hi ? 'घबराहट, तनाव' : 'Nerves, tension'}
            ctaLabel={hi ? 'शुरू करो' : 'Start Breathing'}
            onCta={() => navigate('/breathing')}
          />
          <TrainCard
            icon={RotateCcw}
            iconBg="bg-teal-500/15"
            iconColor="text-teal-400"
            title="Body Reset"
            skillTag={hi ? 'तनाव और घबराहट' : 'Tension & nerves'}
            desc={hi
              ? 'तनाव छोड़ो, सांस को धीमा करो, और शरीर को वापस कंट्रोल में लाओ।'
              : 'Release tension, slow your breathing, and bring your body back under control.'}
            duration="3 min"
            bestFor={hi ? 'घबराया हुआ, तना हुआ, या ओवरलोडेड' : 'Nervous, tight, or overloaded'}
            ctaLabel={hi ? 'Body Reset करो' : 'Reset Body'}
            onCta={() => navigate('/body-reset')}
            secondaryLabel={hi ? 'Reset history देखो →' : 'View reset history →'}
            onSecondary={() => navigate('/body-reset/history')}
          />
          <TrainCard
            icon={Eye}
            iconBg="bg-brand-500/15"
            iconColor="text-brand-400"
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
            iconBg="bg-saffron-500/15"
            iconColor="text-saffron-400"
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
            icon={Layers}
            iconBg="bg-brand-500/15"
            iconColor="text-brand-400"
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
