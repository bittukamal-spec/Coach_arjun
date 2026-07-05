import { useState, useEffect, useRef, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { ChevronLeft, Target } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { translations } from '../../i18n/translations';
import { apiFetch } from '../../api';
import GameTimer from '../../components/games/GameTimer';
import GameResult from '../../components/games/GameResult';

const GAME_DURATION = 60; // seconds
const DEFAULT_WORDS = ['Calm', 'Ready', 'Focus', 'Strong', 'Next'];
const DISTRACTORS = [
  'Pressure', 'Mistake', 'Rush', 'Fear', 'Noise', 'Coach', 'Trial',
  'Selection', 'Doubt', 'Tired', 'Angry', 'Crowd', 'Compare', 'Panic',
  'Tension', 'Worry', 'Late', 'Wrong', 'Judge', 'Drop',
];

// Word display time per level (ms)
function wordDuration(elapsedSec) {
  if (elapsedSec < 20) return 1500;
  if (elapsedSec < 40) return 1000;
  return 700;
}
function levelOf(elapsedSec) {
  if (elapsedSec < 20) return 1;
  if (elapsedSec < 40) return 2;
  return 3;
}

function buildInsight({ accuracy, wrongCount, missedCount }, fl) {
  if (accuracy >= 0.8) return fl.insightLocked;
  if (wrongCount > missedCount) return fl.insightRushed;
  if (missedCount > wrongCount) return fl.insightDropped;
  return fl.insightDefault;
}

function FocusLockGame() {
  const { token, language } = useAuth();
  const mr = translations[language].mentalReps;
  const fl = mr.focusLock;

  const [screen, setScreen] = useState('ready'); // ready | playing | result
  const [focusWord, setFocusWord] = useState(null);
  const [playsToday, setPlaysToday] = useState(0);
  const [dailyLimit, setDailyLimit] = useState(3);
  const [limitReached, setLimitReached] = useState(false);
  const [xpEarned, setXpEarned] = useState(0);

  // Live play state (mirrored in refs for the timer callbacks)
  const [elapsed, setElapsed] = useState(0);
  const [level, setLevel] = useState(1);
  const [score, setScore] = useState(0);
  const [currentWord, setCurrentWord] = useState(null); // { text, isFocus, key }
  const [feedback, setFeedback] = useState(null);       // 'correct' | 'wrong' | null
  const [result, setResult] = useState(null);

  const startRef = useRef(0);
  const scoreRef = useRef(0);
  const statsRef = useRef({ correctCount: 0, wrongCount: 0, missedCount: 0, streak: 0, bestStreak: 0 });
  const distractorRunRef = useRef(0);
  const lastDistractorRef = useRef(null);
  const wordResolvedRef = useRef(true);
  const wordTimeoutRef = useRef(null);
  const timersRef = useRef([]);
  const savedRef = useRef(false);

  const schedule = useCallback((fn, ms) => {
    const id = setTimeout(fn, ms);
    timersRef.current.push(id);
    return id;
  }, []);

  // Fetch focus word (Self-Talk cards, match-day card first) + today's plays
  useEffect(() => {
    apiFetch('/api/self-talk/cards?filter=active', {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(r => r.json())
      .then(cards => {
        const word = Array.isArray(cards) && cards[0]?.focusWord;
        setFocusWord(word || DEFAULT_WORDS[Math.floor(Math.random() * DEFAULT_WORDS.length)]);
      })
      .catch(() => {
        setFocusWord(DEFAULT_WORDS[Math.floor(Math.random() * DEFAULT_WORDS.length)]);
      });

    apiFetch('/api/games/status', { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.json())
      .then(data => {
        if (data?.focusLock) {
          setPlaysToday(data.focusLock.playsToday);
          setDailyLimit(data.focusLock.limit);
          if (data.focusLock.playsToday >= data.focusLock.limit) setLimitReached(true);
        }
      })
      .catch(() => {});

    return () => timersRef.current.forEach(clearTimeout);
  }, [token]);

  const endGame = useCallback(() => {
    timersRef.current.forEach(clearTimeout);
    const { correctCount, wrongCount, missedCount, bestStreak } = statsRef.current;
    const focusAppearances = correctCount + missedCount;
    const accuracy = focusAppearances > 0 ? correctCount / focusAppearances : 0;
    const finalScore = Math.max(0, scoreRef.current);
    const insightText = buildInsight({ accuracy, wrongCount, missedCount }, fl);

    const gameResult = {
      score: finalScore, level: 3, accuracy,
      correctCount, wrongCount, missedCount, bestStreak, insightText,
    };
    setResult(gameResult);
    setScreen('result');

    if (!savedRef.current) {
      savedRef.current = true;
      apiFetch('/api/games/session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ gameId: 'focus_lock', duration: GAME_DURATION, ...gameResult }),
      })
        .then(r => r.json())
        .then(data => {
          if (data?.success) {
            setXpEarned(data.xpEarned);
            setPlaysToday(data.playsToday);
            if (data.playsToday >= data.dailyLimit) setLimitReached(true);
          } else if (data?.error === 'DAILY_LIMIT') {
            setLimitReached(true);
          }
        })
        .catch(() => {});
    }
  }, [token, fl]);

  const showNextWord = useCallback(() => {
    const elapsedSec = (Date.now() - startRef.current) / 1000;
    if (elapsedSec >= GAME_DURATION) {
      endGame();
      return;
    }

    // ~1 in 3 words is the focus word; forced after 3 distractors in a row
    const isFocus = distractorRunRef.current >= 3 || Math.random() < 1 / 3;
    let text;
    if (isFocus) {
      text = focusWord;
      distractorRunRef.current = 0;
    } else {
      do {
        text = DISTRACTORS[Math.floor(Math.random() * DISTRACTORS.length)];
      } while (text === lastDistractorRef.current);
      lastDistractorRef.current = text;
      distractorRunRef.current += 1;
    }

    wordResolvedRef.current = false;
    setFeedback(null);
    setCurrentWord({ text, isFocus, key: Date.now() });

    const duration = wordDuration(elapsedSec);
    wordTimeoutRef.current = schedule(() => {
      if (wordResolvedRef.current) return;
      wordResolvedRef.current = true;
      if (isFocus) {
        // Missed the focus word
        scoreRef.current -= 3;
        statsRef.current.missedCount += 1;
        statsRef.current.streak = 0;
        setScore(Math.max(0, scoreRef.current));
      }
      setCurrentWord(null);
      schedule(showNextWord, 150); // fade gap
    }, duration);
  }, [focusWord, schedule, endGame]);

  function handleTap() {
    if (wordResolvedRef.current || !currentWord) return;
    wordResolvedRef.current = true;
    clearTimeout(wordTimeoutRef.current); // only the word-expiry timeout — keep the elapsed ticker

    const stats = statsRef.current;
    if (currentWord.isFocus) {
      scoreRef.current += 10;
      stats.correctCount += 1;
      stats.streak += 1;
      if (stats.streak > stats.bestStreak) stats.bestStreak = stats.streak;
      if (stats.streak > 0 && stats.streak % 3 === 0) scoreRef.current += 5; // streak bonus
      setFeedback('correct');
    } else {
      scoreRef.current -= 5;
      stats.wrongCount += 1;
      stats.streak = 0;
      setFeedback('wrong');
    }
    setScore(Math.max(0, scoreRef.current));

    schedule(() => {
      setCurrentWord(null);
      setFeedback(null);
      schedule(showNextWord, 150);
    }, 200);
  }

  function startGame() {
    timersRef.current.forEach(clearTimeout);
    timersRef.current = [];
    scoreRef.current = 0;
    statsRef.current = { correctCount: 0, wrongCount: 0, missedCount: 0, streak: 0, bestStreak: 0 };
    distractorRunRef.current = 0;
    lastDistractorRef.current = null;
    savedRef.current = false;
    setScore(0);
    setXpEarned(0);
    setElapsed(0);
    setLevel(1);
    setScreen('playing');
    startRef.current = Date.now();

    // Elapsed ticker for the timer bar + level pill
    const interval = setInterval(() => {
      const sec = (Date.now() - startRef.current) / 1000;
      setElapsed(Math.min(sec, GAME_DURATION));
      setLevel(levelOf(sec));
      if (sec >= GAME_DURATION) clearInterval(interval);
    }, 100);
    timersRef.current.push(interval); // clearTimeout also clears intervals

    schedule(showNextWord, 600);
  }

  // ── Screens ──────────────────────────────────────────────────────────────

  if (screen === 'result' && result) {
    const stats = [
      { label: fl.statLevel, value: `${fl.level} ${result.level}` },
      { label: fl.statAccuracy, value: `${Math.round(result.accuracy * 100)}%` },
      { label: fl.statStreak, value: result.bestStreak },
      { label: fl.statCaught, value: result.correctCount },
    ];
    return (
      <div className="min-h-screen bg-dark-900">
        <header className="px-4 py-4">
          <div className="max-w-lg mx-auto text-center">
            <h1 className="font-semibold text-ink">{mr.cards.focusLock.title}</h1>
          </div>
        </header>
        <GameResult
          score={result.score}
          stats={stats}
          insight={result.insightText}
          limitReached={limitReached}
          onPlayAgain={startGame}
          xpEarned={xpEarned}
        />
      </div>
    );
  }

  if (screen === 'playing') {
    const ringStyle = feedback === 'correct'
      ? { boxShadow: '0 0 0 4px rgba(34,197,94,0.5)', transition: 'box-shadow 200ms' }
      : feedback === 'wrong'
        ? { boxShadow: '0 0 0 4px rgba(226,113,29,0.6)', transition: 'box-shadow 200ms' }
        : {};

    return (
      <div className="min-h-screen bg-dark-900 flex flex-col">
        <div className="max-w-lg mx-auto w-full px-4 pt-4 flex-1 flex flex-col">
          <GameTimer duration={GAME_DURATION} elapsed={elapsed} />

          <div className="flex items-center justify-between mt-3">
            <span className="text-sm font-semibold text-ink tabular-nums">{fl.score} {score}</span>
            <span
              className="text-[11px] font-bold px-2.5 py-1 rounded-full"
              style={{ backgroundColor: 'rgba(24,95,165,0.10)', color: '#185FA5' }}
            >
              {fl.level} {level}
            </span>
          </div>

          <p className="text-center text-xs text-muted mt-6">
            {fl.tapOnly} <span className="font-bold" style={{ color: '#185FA5' }}>{focusWord}</span>
          </p>

          {/* Word area — bottom two-thirds, large tap target */}
          <div className="flex-1 flex items-center justify-center pb-16">
            {currentWord ? (
              <button
                key={currentWord.key}
                onClick={handleTap}
                className="animate-fade-in font-bold text-3xl text-ink bg-dark-400 border border-dark-600 rounded-2xl px-10 active:scale-[1.08] transition-transform duration-100"
                style={{ minHeight: '72px', minWidth: '200px', animationDuration: '150ms', ...ringStyle }}
              >
                {currentWord.text}
              </button>
            ) : (
              <div style={{ minHeight: '72px' }} />
            )}
          </div>
        </div>
      </div>
    );
  }

  // ready screen
  return (
    <div className="min-h-screen bg-dark-900">
      <header className="bg-dark-900 border-b border-dark-600 px-4 py-4 sticky top-0 z-10">
        <div className="max-w-lg mx-auto flex items-center justify-between">
          <Link to="/train" className="flex items-center gap-1 text-slt text-sm font-medium">
            <ChevronLeft size={18} />
            {mr.gamesLink}
          </Link>
          <h1 className="font-semibold text-ink">{mr.cards.focusLock.title}</h1>
          <span className="w-14" />
        </div>
      </header>

      <main className="max-w-lg mx-auto px-4 py-10 text-center space-y-6">
        <div
          className="w-16 h-16 rounded-2xl mx-auto flex items-center justify-center"
          style={{ backgroundColor: 'rgba(24,95,165,0.10)' }}
        >
          <Target size={30} style={{ color: '#185FA5' }} />
        </div>

        <div>
          <p className="text-sm text-slt mb-2">{fl.yourWord}</p>
          <p className="text-4xl font-bold" style={{ color: '#185FA5' }}>
            {focusWord || '…'}
          </p>
        </div>

        <p className="text-sm text-slt leading-relaxed max-w-xs mx-auto">
          {fl.instructions}
        </p>

        {limitReached ? (
          <p className="text-sm text-slt py-3">
            {mr.limitMessage}
          </p>
        ) : (
          <button
            onClick={startGame}
            disabled={!focusWord}
            className="w-full max-w-xs text-white font-semibold py-4 rounded-xl active:scale-[0.98] transition-transform disabled:opacity-50"
            style={{ backgroundColor: '#185FA5', minHeight: '56px' }}
          >
            {fl.start}
          </button>
        )}

        <p className="text-xs text-muted">{mr.playsToday(playsToday, dailyLimit)}</p>
      </main>
    </div>
  );
}

export default FocusLockGame;
