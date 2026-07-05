import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Zap } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { translations } from '../../i18n/translations';

// Shared end-of-game result screen.
// stats: [{ label, value }] — pre-formatted values.
function GameResult({ score, stats = [], insight, limitReached, onPlayAgain, xpEarned }) {
  const { language } = useAuth();
  const mr = translations[language].mentalReps;
  const [displayScore, setDisplayScore] = useState(0);

  // Count the score up over 600ms
  useEffect(() => {
    let raf;
    const start = performance.now();
    const tick = (now) => {
      const p = Math.min(1, (now - start) / 600);
      setDisplayScore(Math.round(score * p));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [score]);

  return (
    <div className="animate-slide-up" style={{ animationDuration: '400ms' }}>
      <div className="max-w-lg mx-auto px-4 py-8 space-y-6">
        {/* Score */}
        <div className="text-center">
          <p className="text-sm text-slt font-medium mb-1">{mr.sessionScore}</p>
          <p className="text-5xl font-bold text-ink tabular-nums">{displayScore}</p>
          {xpEarned > 0 && (
            <p className="mt-2 inline-flex items-center gap-1 text-sm font-semibold" style={{ color: '#E2711D' }}>
              <Zap size={15} fill="#E2711D" /> {mr.xpEarned(xpEarned)}
            </p>
          )}
        </div>

        {/* Stats */}
        <div className="bg-dark-400 border border-dark-600 rounded-2xl divide-y divide-dark-600">
          {stats.map(({ label, value }) => (
            <div key={label} className="flex items-center justify-between px-4 py-3">
              <span className="text-sm text-slt">{label}</span>
              <span className="text-sm font-semibold text-ink">{value}</span>
            </div>
          ))}
        </div>

        {/* Coaching insight */}
        {insight && (
          <div
            className="bg-dark-300 rounded-xl px-4 py-3.5"
            style={{ borderLeft: '3px solid #185FA5' }}
          >
            <p className="text-xs font-semibold mb-1" style={{ color: '#185FA5' }}>Arjun</p>
            <p className="text-sm text-ink leading-relaxed">{insight}</p>
          </div>
        )}

        {/* Actions */}
        <div className="space-y-3">
          {limitReached ? (
            <p className="text-center text-sm text-slt py-2">
              {mr.limitMessage}
            </p>
          ) : (
            <button
              onClick={onPlayAgain}
              className="w-full text-white font-semibold py-4 rounded-xl active:scale-[0.98] transition-transform"
              style={{ backgroundColor: '#185FA5', minHeight: '56px' }}
            >
              {mr.playAgain}
            </button>
          )}
          <Link
            to="/train"
            className="block w-full text-center font-semibold py-4 rounded-xl bg-dark-700 text-ink active:scale-[0.98] transition-transform"
            style={{ minHeight: '56px' }}
          >
            {mr.backToGames}
          </Link>
        </div>
      </div>
    </div>
  );
}

export default GameResult;
