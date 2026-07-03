import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ChevronLeft } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { apiFetch } from '../api';
import GameCard from '../components/games/GameCard';

// ── Mental Reps hub — two short mental training games ─────────────────────────

const GAMES = [
  {
    id: 'focusLock',
    icon: '🎯',
    title: 'Focus Lock',
    purpose: 'Tap only your focus word — ignore pressure distractions.',
    skillTag: 'Focus',
    path: '/games/focus-lock',
  },
  {
    id: 'resetRally',
    icon: '🔄',
    title: 'Reset Rally',
    purpose: 'After a mistake, choose the reset thought and next action.',
    skillTag: 'Bounce back',
    path: '/games/reset-rally',
  },
];

const DEFAULT_STATUS = {
  focusLock:  { playsToday: 0, limit: 3 },
  resetRally: { playsToday: 0, limit: 3 },
  totalToday: 0,
  totalLimit: 5,
};

function GamesPage() {
  const navigate = useNavigate();
  const { token } = useAuth();
  const [status, setStatus] = useState(DEFAULT_STATUS);

  useEffect(() => {
    apiFetch('/api/games/status', {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(r => r.json())
      .then(data => {
        if (data && data.focusLock) setStatus(data);
      })
      .catch(() => {});
  }, [token]);

  return (
    <div className="min-h-screen bg-dark-900 pb-24">
      <header className="bg-dark-900 border-b border-dark-600 px-4 py-4 sticky top-0 z-10">
        <div className="max-w-lg mx-auto flex items-center justify-between">
          <Link to="/train" className="flex items-center gap-1 text-slt text-sm font-medium">
            <ChevronLeft size={18} />
            Back
          </Link>
          <h1 className="font-semibold text-ink">Mental Reps</h1>
          <span className="w-14 text-right text-xs text-muted font-medium">
            {Math.min(status.totalToday, status.totalLimit)}/{status.totalLimit}
          </span>
        </div>
      </header>

      <main className="max-w-lg mx-auto px-4 py-6 space-y-4">
        <p className="text-sm text-slt">
          Short mental training sessions. 60–90 seconds each.
        </p>

        <div className="flex flex-col sm:flex-row gap-4">
          {GAMES.map(game => (
            <div key={game.id} className="flex-1">
              <GameCard
                icon={game.icon}
                title={game.title}
                purpose={game.purpose}
                skillTag={game.skillTag}
                playsToday={status[game.id].playsToday}
                limit={status[game.id].limit}
                onPlay={() => navigate(game.path)}
              />
            </div>
          ))}
        </div>

        <p className="text-center text-xs text-muted pt-2">
          {status.totalToday} of {status.totalLimit} reps done today
        </p>
      </main>
    </div>
  );
}

export default GamesPage;
