import { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { ChevronLeft, RotateCcw } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { translations } from '../../i18n/translations';
import { apiFetch } from '../../api';
import GameResult from '../../components/games/GameResult';

const SCENARIOS_PER_GAME = 6;

// quality: reset → negative(0) | neutral(+5) | strong(+15)
//          action → poor(0) | neutral(+5) | strong(+10)
const SCENARIOS = [
  {
    id: 'coach_mistake',
    text: 'You made a mistake in front of your coach.',
    resets: [
      { text: 'I always mess up. I am not good enough.', quality: 'negative', points: 0 },
      { text: 'Just ignore it and move on quickly.', quality: 'neutral', points: 5 },
      { text: 'Breathe out. That moment is gone. Next action.', quality: 'strong', points: 15 },
    ],
    actions: [
      { text: 'Wait and hope it gets better.', quality: 'poor', points: 0 },
      { text: 'Try to work harder on the next attempt.', quality: 'neutral', points: 5 },
      { text: 'Set your stance. Focus on the next moment only.', quality: 'strong', points: 10 },
    ],
  },
  {
    id: 'not_selected',
    text: 'You were not selected for the starting team.',
    resets: [
      { text: 'They never rate me. What is the point of trying?', quality: 'negative', points: 0 },
      { text: 'Whatever. I will just wait for my turn.', quality: 'neutral', points: 5 },
      { text: 'This stings. Feel it, breathe, then train with purpose.', quality: 'strong', points: 15 },
    ],
    actions: [
      { text: 'Sit out and watch quietly.', quality: 'poor', points: 0 },
      { text: 'Tell yourself to stay positive.', quality: 'neutral', points: 5 },
      { text: 'Pick one skill to sharpen this week and start today.', quality: 'strong', points: 10 },
    ],
  },
  {
    id: 'parents_watching',
    text: 'Your parents are watching and you feel pressure.',
    resets: [
      { text: 'If I play poorly today, everything is ruined.', quality: 'negative', points: 0 },
      { text: 'Pretend they are not there.', quality: 'neutral', points: 5 },
      { text: 'They came to watch me play, not to judge. Breathe. Play my game.', quality: 'strong', points: 15 },
    ],
    actions: [
      { text: 'Keep checking their reaction after every play.', quality: 'poor', points: 0 },
      { text: 'Try to play safe so nothing goes wrong.', quality: 'neutral', points: 5 },
      { text: 'Lock eyes on your next task — one play at a time.', quality: 'strong', points: 10 },
    ],
  },
  {
    id: 'teammate_laugh',
    text: 'A teammate laughed after your mistake.',
    resets: [
      { text: 'Everyone thinks I am useless.', quality: 'negative', points: 0 },
      { text: 'Forget him. Just keep quiet.', quality: 'neutral', points: 5 },
      { text: 'His reaction is his. My next rep is mine. Reset.', quality: 'strong', points: 15 },
    ],
    actions: [
      { text: 'Avoid the ball so you cannot make another mistake.', quality: 'poor', points: 0 },
      { text: 'Play on and try not to think about it.', quality: 'neutral', points: 5 },
      { text: 'Ask for the ball. Show up for the very next play.', quality: 'strong', points: 10 },
    ],
  },
  {
    id: 'focus_slip',
    text: 'You started well, then lost focus completely.',
    resets: [
      { text: 'I can never hold my concentration. Typical me.', quality: 'negative', points: 0 },
      { text: 'Shake it off and hope focus comes back.', quality: 'neutral', points: 5 },
      { text: 'Focus drifts — that is normal. One breath, come back to now.', quality: 'strong', points: 15 },
    ],
    actions: [
      { text: 'Keep playing on autopilot.', quality: 'poor', points: 0 },
      { text: 'Tell yourself to concentrate more.', quality: 'neutral', points: 5 },
      { text: 'Use your cue word and narrow in on one target.', quality: 'strong', points: 10 },
    ],
  },
  {
    id: 'comparison',
    text: 'You are comparing yourself with a better player.',
    resets: [
      { text: 'I will never reach that level. Why bother?', quality: 'negative', points: 0 },
      { text: 'Stop looking at them and just play.', quality: 'neutral', points: 5 },
      { text: 'Their journey is theirs. I compete with yesterday’s me.', quality: 'strong', points: 15 },
    ],
    actions: [
      { text: 'Copy everything they do.', quality: 'poor', points: 0 },
      { text: 'Train a bit longer than usual.', quality: 'neutral', points: 5 },
      { text: 'Pick one thing they do well and drill it into your game.', quality: 'strong', points: 10 },
    ],
  },
  {
    id: 'rumination',
    text: 'You made one mistake and cannot stop thinking about it.',
    resets: [
      { text: 'That mistake proves I am not ready for this level.', quality: 'negative', points: 0 },
      { text: 'Push the thought away and keep moving.', quality: 'neutral', points: 5 },
      { text: 'One mistake is information, not identity. Breathe. Next action.', quality: 'strong', points: 15 },
    ],
    actions: [
      { text: 'Replay the mistake again and again in your head.', quality: 'poor', points: 0 },
      { text: 'Distract yourself with something else.', quality: 'neutral', points: 5 },
      { text: 'Name one thing to do differently, then close the loop.', quality: 'strong', points: 10 },
    ],
  },
  {
    id: 'trials_blank',
    text: 'Trials are coming and your mind keeps going blank.',
    resets: [
      { text: 'If I blank out at trials, my career is over.', quality: 'negative', points: 0 },
      { text: 'Try not to think about the trials at all.', quality: 'neutral', points: 5 },
      { text: 'Nerves mean it matters. Breathe low and slow. Trust the training.', quality: 'strong', points: 15 },
    ],
    actions: [
      { text: 'Cram extra practice the night before.', quality: 'poor', points: 0 },
      { text: 'Tell yourself it will be fine on the day.', quality: 'neutral', points: 5 },
      { text: 'Build a simple pre-trial routine and rehearse it now.', quality: 'strong', points: 10 },
    ],
  },
  {
    id: 'missed_chance',
    text: 'You missed an easy chance everyone expected you to take.',
    resets: [
      { text: 'I let the whole team down. I cannot show my face.', quality: 'negative', points: 0 },
      { text: 'It happens. Move along.', quality: 'neutral', points: 5 },
      { text: 'Even pros miss those. Exhale. The next chance is what counts.', quality: 'strong', points: 15 },
    ],
    actions: [
      { text: 'Hide from the play so it cannot happen again.', quality: 'poor', points: 0 },
      { text: 'Promise yourself you will take the next one.', quality: 'neutral', points: 5 },
      { text: 'Get back in position and demand the next chance.', quality: 'strong', points: 10 },
    ],
  },
  {
    id: 'rough_start',
    text: 'You lost confidence after a bad start to the session.',
    resets: [
      { text: 'Today is ruined. I should just go home.', quality: 'negative', points: 0 },
      { text: 'Keep going and hope it improves.', quality: 'neutral', points: 5 },
      { text: 'A rough start is not the full story. Reset. Start fresh from here.', quality: 'strong', points: 15 },
    ],
    actions: [
      { text: 'Go through the motions until it ends.', quality: 'poor', points: 0 },
      { text: 'Try harder on everything at once.', quality: 'neutral', points: 5 },
      { text: 'Shrink the goal: win the next five minutes only.', quality: 'strong', points: 10 },
    ],
  },
  {
    id: 'public_criticism',
    text: 'The coach gave critical feedback in front of everyone.',
    resets: [
      { text: 'He humiliated me. He clearly does not rate me.', quality: 'negative', points: 0 },
      { text: 'Nod along and forget it quickly.', quality: 'neutral', points: 5 },
      { text: 'Sting first, lesson second. Breathe. Take the useful part.', quality: 'strong', points: 15 },
    ],
    actions: [
      { text: 'Avoid the coach for the rest of the week.', quality: 'poor', points: 0 },
      { text: 'Quietly try to fix it on your own.', quality: 'neutral', points: 5 },
      { text: 'Apply the correction on the very next rep.', quality: 'strong', points: 10 },
    ],
  },
  {
    id: 'weakest_today',
    text: 'You feel like the weakest player on the team today.',
    resets: [
      { text: 'I do not belong here. Everyone can see it.', quality: 'negative', points: 0 },
      { text: 'Just get through today without standing out.', quality: 'neutral', points: 5 },
      { text: 'Feelings are not facts. Breathe. I earned my place here.', quality: 'strong', points: 15 },
    ],
    actions: [
      { text: 'Stay at the edge of every drill.', quality: 'poor', points: 0 },
      { text: 'Keep up and stay unnoticed.', quality: 'neutral', points: 5 },
      { text: 'Choose one drill to attack with full energy.', quality: 'strong', points: 10 },
    ],
  },
];

const RESET_FEEDBACK = {
  strong:   'Locked in.',
  neutral:  'Good rep — there’s a stronger reset.',
  negative: 'Notice the harsh voice. Train the reset.',
};
const ACTION_FEEDBACK = {
  strong:  'Next action. That’s the way.',
  neutral: 'Good rep. Get specific next time.',
  poor:    'Stay ready — pick an action you control.',
};

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function buildInsight({ strongResets, negativeResets, neutralResets }, rr) {
  if (strongResets >= 4) return rr.insightStrong;
  if (negativeResets >= 3) return rr.insightHarsh;
  if (neutralResets >= 3) return rr.insightNeutral;
  return rr.insightDefault;
}

function ResetRallyGame() {
  const { token, language } = useAuth();
  const mr = translations[language].mentalReps;
  const rr = mr.resetRally;

  const [screen, setScreen] = useState('ready'); // ready | playing | result
  const [playsToday, setPlaysToday] = useState(0);
  const [dailyLimit, setDailyLimit] = useState(3);
  const [limitReached, setLimitReached] = useState(false);
  const [xpEarned, setXpEarned] = useState(0);

  const [deck, setDeck] = useState([]);
  const [idx, setIdx] = useState(0);
  const [phase, setPhase] = useState('scenario'); // scenario | reset | resetFeedback | action | actionFeedback
  const [options, setOptions] = useState([]);
  const [picked, setPicked] = useState(null);
  const [score, setScore] = useState(0);
  const [result, setResult] = useState(null);

  const scoreRef = useRef(0);
  const statsRef = useRef({ strongResets: 0, neutralResets: 0, negativeResets: 0, strongActions: 0, streak: 0, bestStreak: 0 });
  const optionsShownAtRef = useRef(0);
  const gameStartRef = useRef(0);
  const timersRef = useRef([]);
  const savedRef = useRef(false);

  const schedule = (fn, ms) => {
    const id = setTimeout(fn, ms);
    timersRef.current.push(id);
  };

  useEffect(() => {
    apiFetch('/api/games/status', { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.json())
      .then(data => {
        if (data?.resetRally) {
          setPlaysToday(data.resetRally.playsToday);
          setDailyLimit(data.resetRally.limit);
          if (data.resetRally.playsToday >= data.resetRally.limit) setLimitReached(true);
        }
      })
      .catch(() => {});
    return () => timersRef.current.forEach(clearTimeout);
  }, [token]);

  function startGame() {
    timersRef.current.forEach(clearTimeout);
    timersRef.current = [];
    scoreRef.current = 0;
    statsRef.current = { strongResets: 0, neutralResets: 0, negativeResets: 0, strongActions: 0, streak: 0, bestStreak: 0 };
    savedRef.current = false;
    setScore(0);
    setXpEarned(0);
    setDeck(shuffle(SCENARIOS).slice(0, SCENARIOS_PER_GAME));
    setIdx(0);
    setResult(null);
    setScreen('playing');
    gameStartRef.current = Date.now();
    setPhase('scenario');
    setPicked(null);
    // Read time, then show reset options
    schedule(() => {
      setPhase('reset');
      optionsShownAtRef.current = Date.now();
    }, 2000);
  }

  function endGame() {
    const { strongResets, neutralResets, negativeResets, bestStreak } = statsRef.current;
    const accuracy = strongResets / SCENARIOS_PER_GAME;
    const duration = Math.round((Date.now() - gameStartRef.current) / 1000);
    const insightText = buildInsight({ strongResets, negativeResets, neutralResets }, rr);
    const finalScore = scoreRef.current;

    setResult({ score: finalScore, accuracy, bestStreak, strongResets, insightText });
    setScreen('result');

    if (!savedRef.current) {
      savedRef.current = true;
      apiFetch('/api/games/session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          gameId: 'reset_rally',
          score: finalScore,
          accuracy,
          duration,
          correctCount: strongResets,
          wrongCount: negativeResets,
          bestStreak,
          insightText,
        }),
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
  }

  function pick(option, kind) {
    if (picked) return;
    setPicked(option);

    const answerMs = Date.now() - optionsShownAtRef.current;
    let gained = option.points;
    if (option.quality === 'strong' && answerMs < 3000) gained += 5; // fast strong answer

    scoreRef.current += gained;
    setScore(scoreRef.current);

    const stats = statsRef.current;
    if (kind === 'reset') {
      if (option.quality === 'strong') {
        stats.strongResets += 1;
        stats.streak += 1;
        if (stats.streak > stats.bestStreak) stats.bestStreak = stats.streak;
      } else {
        stats.streak = 0;
        if (option.quality === 'neutral') stats.neutralResets += 1;
        else stats.negativeResets += 1;
      }
      setPhase('resetFeedback');
      schedule(() => {
        setPicked(null);
        setPhase('action');
        optionsShownAtRef.current = Date.now();
      }, 1000);
    } else {
      if (option.quality === 'strong') stats.strongActions += 1;
      setPhase('actionFeedback');
      schedule(() => {
        if (idx + 1 >= SCENARIOS_PER_GAME) {
          endGame();
        } else {
          setIdx(i => i + 1);
          setPicked(null);
          setPhase('scenario');
          schedule(() => {
            setPhase('reset');
            optionsShownAtRef.current = Date.now();
          }, 2000);
        }
      }, 1000);
    }
  }

  // Shuffle option order once per scenario+kind
  const scenario = deck[idx];
  useEffect(() => {
    if (!scenario) return;
    if (phase === 'reset') setOptions(shuffle(scenario.resets));
    else if (phase === 'action') setOptions(shuffle(scenario.actions));
  }, [phase, scenario]);

  // ── Screens ──────────────────────────────────────────────────────────────

  if (screen === 'result' && result) {
    const stats = [
      { label: rr.statAccuracy, value: `${Math.round(result.accuracy * 100)}%` },
      { label: rr.statStrong, value: `${result.strongResets}/${SCENARIOS_PER_GAME}` },
      { label: rr.statStreak, value: result.bestStreak },
    ];
    return (
      <div className="min-h-screen bg-dark-900">
        <header className="px-4 py-4">
          <div className="max-w-lg mx-auto text-center">
            <h1 className="font-semibold text-ink">{mr.cards.resetRally.title}</h1>
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

  if (screen === 'playing' && scenario) {
    const showingResets = phase === 'reset' || phase === 'resetFeedback';
    const showingOptions = phase !== 'scenario';
    const feedbackText = picked
      ? (showingResets ? RESET_FEEDBACK[picked.quality] : ACTION_FEEDBACK[picked.quality])
      : null;

    return (
      <div className="min-h-screen bg-dark-900 flex flex-col">
        <div className="max-w-lg mx-auto w-full px-4 pt-4 flex-1 flex flex-col">
          <div className="flex items-center justify-between">
            <span className="text-sm font-semibold text-ink tabular-nums">Score {score}</span>
            <span
              className="text-[11px] font-bold px-2.5 py-1 rounded-full"
              style={{ backgroundColor: 'rgba(24,95,165,0.10)', color: '#185FA5' }}
            >
              {idx + 1} / {SCENARIOS_PER_GAME}
            </span>
          </div>

          {/* Scenario */}
          <div className="mt-8 animate-fade-in" key={`s-${idx}`}>
            <p className="text-lg font-semibold text-ink leading-relaxed text-center px-2">
              {scenario.text}
            </p>
          </div>

          {/* Options */}
          <div className="flex-1 flex flex-col justify-center gap-3 py-8">
            {showingOptions && (
              <>
                <p className="text-xs text-muted text-center font-medium uppercase tracking-wide mb-1">
                  {showingResets ? 'Choose your reset thought' : 'Choose your next action'}
                </p>
                {options.map(option => {
                  const isPicked = picked === option;
                  const ring = isPicked
                    ? option.quality === 'strong'
                      ? { boxShadow: '0 0 0 3px rgba(34,197,94,0.5)' }
                      : { boxShadow: '0 0 0 3px rgba(226,113,29,0.55)' }
                    : {};
                  return (
                    <button
                      key={option.text}
                      onClick={() => pick(option, showingResets ? 'reset' : 'action')}
                      disabled={!!picked}
                      className="animate-fade-in w-full text-left bg-dark-400 border border-dark-600 rounded-2xl px-5 py-4 text-sm text-ink leading-relaxed active:scale-[1.02] transition-transform duration-100 disabled:opacity-70"
                      style={{ minHeight: '56px', animationDuration: '150ms', ...ring, ...(isPicked ? { opacity: 1 } : {}) }}
                    >
                      {option.text}
                    </button>
                  );
                })}
                <div className="h-6 text-center">
                  {feedbackText && (
                    <p
                      className="text-sm font-semibold animate-fade-in"
                      style={{ color: picked?.quality === 'strong' ? '#16A34A' : '#E2711D', animationDuration: '150ms' }}
                    >
                      {feedbackText}
                    </p>
                  )}
                </div>
              </>
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
          <h1 className="font-semibold text-ink">{mr.cards.resetRally.title}</h1>
          <span className="w-14" />
        </div>
      </header>

      <main className="max-w-lg mx-auto px-4 py-10 text-center space-y-6">
        <div
          className="w-16 h-16 rounded-2xl mx-auto flex items-center justify-center"
          style={{ backgroundColor: 'rgba(226,113,29,0.10)' }}
        >
          <RotateCcw size={30} style={{ color: '#E2711D' }} />
        </div>

        <div>
          <h2 className="text-2xl font-bold text-ink mb-2">{rr.heading}</h2>
          <p className="text-sm text-slt leading-relaxed max-w-xs mx-auto">
            {rr.instructions}
          </p>
        </div>

        {limitReached ? (
          <p className="text-sm text-slt py-3">
            {mr.limitMessage}
          </p>
        ) : (
          <button
            onClick={startGame}
            className="w-full max-w-xs text-white font-semibold py-4 rounded-xl active:scale-[0.98] transition-transform"
            style={{ backgroundColor: '#185FA5', minHeight: '56px' }}
          >
            {rr.start}
          </button>
        )}

        <p className="text-xs text-muted">{mr.playsToday(playsToday, dailyLimit)}</p>
      </main>
    </div>
  );
}

export default ResetRallyGame;
