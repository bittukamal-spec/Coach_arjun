import { useState, useEffect, useRef, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, Zap } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { apiFetch } from '../api';

// ── Sport-specific personalisation ────────────────────────────────────────────

const SPORT_PROFILES = {
  cricket: {
    label: 'cricket',
    reactionAction: 'BAT!',
    reactionContext: 'A fast bowler at 140+ km/h gives you ~420ms. Batsmen train daily to cut this.',
    reactionElite: 220, reactionGood: 290,
    reactionEliteLabel: 'Elite batsman', reactionBenchmark: 'Elite batsmen: <220ms · Target: <290ms',
    negThoughts: [
      'What if I get bowled out first ball?', "I always choke against fast bowling",
      'The selectors are watching', "I can't face this bowler", 'What if I drop the catch?',
    ],
    gridTip: 'Used by BCCI academies and county coaches to sharpen scanning speed in the field.',
    stroopTip: 'Helps batsmen ignore scoreboard and crowd noise — focus only on ball trajectory.',
    thoughtTip: 'Pop those pre-innings nerves. Every ball is a fresh start.',
    filterTip: 'Trains you to hear your own cue words above crowd noise and commentary.',
  },
  football: {
    label: 'football',
    reactionAction: 'SAVE!',
    reactionContext: 'A penalty kick reaches the goal in ~300ms. Goalkeepers must react before the ball leaves the boot.',
    reactionElite: 220, reactionGood: 300,
    reactionEliteLabel: 'Elite goalkeeper', reactionBenchmark: 'Elite goalkeepers: <220ms · Target: <300ms',
    negThoughts: [
      'What if I miss the penalty?', "I always freeze under pressure",
      'The whole team is depending on me', "I haven't scored in 3 games", 'What if I get tackled?',
    ],
    gridTip: 'Used by European football academies to train midfielders\' spatial awareness and scanning.',
    stroopTip: 'Sharpens split-second decision-making — pass, shoot, or hold?',
    thoughtTip: 'Clear the mental clutter before every match. Confidence is earned by showing up.',
    filterTip: 'Helps you focus on "Process" and "Position" over "Crowd" and "Result" pressure.',
  },
  badminton: {
    label: 'badminton',
    reactionAction: 'HIT!',
    reactionContext: 'A smash at 300+ km/h leaves under 300ms to react — the fastest reaction sport.',
    reactionElite: 190, reactionGood: 260,
    reactionEliteLabel: 'Elite shuttler', reactionBenchmark: 'Elite shuttlers: <190ms · Target: <260ms',
    negThoughts: [
      'What if I net the shuttle?', "I can't return their smash",
      'I lost the last 3 rallies', 'What if I cramp up?', "My footwork isn't fast enough",
    ],
    gridTip: 'Sharpens the fast court scanning shuttlers use to read opponent position.',
    stroopTip: 'Trains shuttle tracking — brain ignores irrelevant cues, locks on the shuttle.',
    thoughtTip: 'Every rally is new. Pop the last rally\'s doubts before the next one starts.',
    filterTip: 'Helps you stay "Zone" and "Ready" rather than "Judge" and "Result" focused.',
  },
  tennis: {
    label: 'tennis',
    reactionAction: 'HIT!',
    reactionContext: 'A 200+ km/h serve gives you under 400ms. Tennis players train reaction from childhood.',
    reactionElite: 210, reactionGood: 280,
    reactionEliteLabel: 'Elite player', reactionBenchmark: 'Elite players: <210ms · Target: <280ms',
    negThoughts: [
      'What if I double fault?', 'I always tighten up on match point',
      'My second serve is weak', 'What if I choke the tiebreak?', "I'm not good enough for this level",
    ],
    gridTip: 'Used in high-performance tennis programs to train court awareness and ball-tracking.',
    stroopTip: 'Builds the attention control to watch the ball hit the racquet, not the opponent.',
    thoughtTip: 'Each point is 0-0. Pop the previous game\'s pressure before the next serve.',
    filterTip: 'Trains the mental skill of focusing on "Play" and "Now" over "Score" and "Crowd".',
  },
  hockey: {
    label: 'hockey',
    reactionAction: 'HIT!',
    reactionContext: 'A drag flick reaches the goalkeeper in under 300ms — fastest in field sports.',
    reactionElite: 210, reactionGood: 280,
    reactionEliteLabel: 'Elite player', reactionBenchmark: 'Elite players: <210ms · Target: <280ms',
    negThoughts: [
      'What if I miss the drag flick?', "I can't hold my position under pressure",
      'The defender is too fast', 'What if I get yellow-carded?', 'I made an error last match',
    ],
    gridTip: 'Used by national-level hockey programs to train visual scanning across the pitch.',
    stroopTip: 'Trains rapid decision-making — pass, dribble, or shoot in a split second.',
    thoughtTip: 'Clear match anxiety one thought at a time. Pop it, replace it, play.',
    filterTip: 'Builds the mental discipline to filter tactical cues from crowd pressure.',
  },
  boxing: {
    label: 'boxing',
    reactionAction: 'DODGE!',
    reactionContext: 'A punch travels at 40+ km/h — reaction and anticipation are everything in boxing.',
    reactionElite: 180, reactionGood: 250,
    reactionEliteLabel: 'Elite boxer', reactionBenchmark: 'Elite boxers: <180ms · Target: <250ms',
    negThoughts: [
      "What if I can't take the punch?", 'My opponent is faster',
      "I've never won at this level", 'What if I freeze?', 'My corner doubts me',
    ],
    gridTip: 'Trains the rapid visual scanning boxers use to track punches and openings.',
    stroopTip: 'Sharpens the ability to read head movement, not flinch on feints.',
    thoughtTip: 'Clear the fear between rounds. Champions fight one round at a time.',
    filterTip: 'Trains focus words ("Breathe", "Jab", "Move") over noise ("Hurt", "Lose").',
  },
  wrestling: {
    label: 'wrestling',
    reactionAction: 'MOVE!',
    reactionContext: 'First-move advantage in wrestling is decided in under 200ms — every millisecond counts.',
    reactionElite: 220, reactionGood: 300,
    reactionEliteLabel: 'Elite wrestler', reactionBenchmark: 'Elite wrestlers: <220ms · Target: <300ms',
    negThoughts: [
      "I can't take this opponent down", 'What if I get pinned?',
      'My opponent is stronger', 'I lost the last match against them', "My technique isn't clean",
    ],
    gridTip: 'Trains the spatial awareness wrestlers use to track opponent position in real time.',
    stroopTip: 'Builds decision speed — attack, defend, or wait — in fractions of a second.',
    thoughtTip: 'Clear doubt before the whistle. Each period is a chance to reset.',
    filterTip: 'Helps focus on "Now" and "Act" rather than "Result" and "Fear" under match pressure.',
  },
  kabaddi: {
    label: 'kabaddi',
    reactionAction: 'TAG!',
    reactionContext: 'A raider escapes in ~400ms. Defenders must read body language before the raider moves.',
    reactionElite: 220, reactionGood: 300,
    reactionEliteLabel: 'Elite kabaddi player', reactionBenchmark: 'Elite players: <220ms · Target: <300ms',
    negThoughts: [
      'What if I miss the tackle?', "I can't hold the raider",
      'My team is losing because of me', 'What if I run out of breath?', 'The crowd is against us',
    ],
    gridTip: 'Trains the spatial scanning kabaddi defenders use to anticipate raider movements.',
    stroopTip: 'Builds rapid body-read ability — react to movement, not to noise.',
    thoughtTip: 'One raid at a time. Pop the last one\'s pressure before the next begins.',
    filterTip: 'Builds "Zone" focus over crowd pressure — critical in pro kabaddi venues.',
  },
  athletics: {
    label: 'athletics',
    reactionAction: 'GO!',
    reactionContext: 'Elite sprinters leave the block within 130ms of the gun. A false start costs the race.',
    reactionElite: 160, reactionGood: 230,
    reactionEliteLabel: 'Elite sprinter', reactionBenchmark: 'Elite sprinters: <160ms · Target: <230ms',
    negThoughts: [
      "What if I false start?", "I'm not fast enough",
      'My competitor is in better form', 'What if I cramp up?', 'I peaked in training',
    ],
    gridTip: 'Used in sprint programs to train track scanning and split-time anticipation.',
    stroopTip: 'Trains focus on starting signal — blocks out stadium noise and crowd anxiety.',
    thoughtTip: 'Clear the blocks, clear the mind. Pop the pressure, run free.',
    filterTip: 'Trains race-day focus: "Start", "Drive", "Lean" over "Crowd" and "Result".',
  },
  swimming: {
    label: 'swimming',
    reactionAction: 'DIVE!',
    reactionContext: 'Elite swimmers leave the block within 600ms. Reaction training shortens start times.',
    reactionElite: 200, reactionGood: 280,
    reactionEliteLabel: 'Elite swimmer', reactionBenchmark: 'Elite swimmers: <200ms · Target: <280ms',
    negThoughts: [
      "What if I false start?", "My turns aren't fast enough",
      'The other lane is faster', 'What if I lose my stroke rhythm?', 'I peaked in training',
    ],
    gridTip: 'Trains the quick visual scanning used during turns and competitor tracking.',
    stroopTip: 'Builds ability to lock into stroke rhythm, ignore lane pressure and timers.',
    thoughtTip: 'Length by length. Pop the last lap\'s doubt before pushing off the wall.',
    filterTip: 'Trains "Rhythm", "Now", "Breathe" focus over "Lane" and "Time" pressure.',
  },
};

const DEFAULT_SPORT_PROFILE = {
  label: 'athlete',
  reactionAction: 'TAP!',
  reactionContext: 'Reaction speed is trainable — 3 weeks of daily practice can cut 30–50ms.',
  reactionElite: 220, reactionGood: 300,
  reactionEliteLabel: 'Elite athlete', reactionBenchmark: 'Elite athletes: <220ms · Target: <300ms',
  negThoughts: [
    'What if I fail?', "I'm not ready", "Everyone's watching",
    'I always choke', 'What if I get dropped?', "I'm not good enough",
    "They'll judge me", "I'm too nervous", 'Last time was terrible',
    "I can't handle this pressure",
  ],
  gridTip: 'Used by elite teams worldwide to train selective attention and scanning speed.',
  stroopTip: 'Trains inhibitory control — blocking distractions to stay focused under pressure.',
  thoughtTip: 'Based on Thought Stopping — a CBT technique used by sport psychologists worldwide.',
  filterTip: 'Trains selective attention and distraction resistance — crucial under competition pressure.',
};

function getSportProfile(sport) {
  return SPORT_PROFILES[sport] || DEFAULT_SPORT_PROFILE;
}

// ── Game catalogue ──────────────────────────────────────────────────────────────

const GAMES = [
  {
    id: 'concentration_grid',
    icon: '🔢',
    title: 'Concentration Grid',
    titleHi: 'एकाग्रता ग्रिड',
    type: 'focus',
    duration: '60 sec',
    description: 'Find numbers 1→25 in order as fast as you can.',
    descHi: 'जल्दी से 1→25 क्रम में संख्याएं ढूंढें।',
    getTip: (sp) => sp.gridTip,
  },
  {
    id: 'stroop_focus',
    icon: '🎨',
    title: 'Stroop Focus',
    titleHi: 'स्ट्रूप फोकस',
    type: 'focus',
    duration: '60 sec',
    description: 'Tap the ink COLOR — ignore what the word says.',
    descHi: 'स्याही का रंग टैप करें — शब्द को नज़रअंदाज़ करें।',
    getTip: (sp) => sp.stroopTip,
  },
  {
    id: 'reaction_ball',
    icon: '⚡',
    title: 'Reaction Ball',
    titleHi: 'रिएक्शन बॉल',
    type: 'pressure',
    duration: '5 rounds',
    description: 'Tap as fast as you can when the ball appears.',
    descHi: 'बॉल दिखते ही जितनी जल्दी हो सके टैप करें।',
    getTip: (sp) => `${sp.reactionContext} Reaction speed is trainable — 3 weeks of practice can cut 30–50ms.`,
  },
  {
    id: 'thought_buster',
    icon: '💥',
    title: 'Thought Buster',
    titleHi: 'थॉट बस्टर',
    type: 'confidence',
    duration: '45 sec',
    description: 'Pop negative thoughts before they take over.',
    descHi: 'नकारात्मक विचारों को उनके हावी होने से पहले पॉप करें।',
    getTip: (sp) => `${sp.thoughtTip} Based on CBT Thought Stopping — a proven sport psychology technique.`,
  },
  {
    id: 'focus_filter',
    icon: '🎯',
    title: 'Focus Filter',
    titleHi: 'फोकस फिल्टर',
    type: 'focus',
    duration: '45 sec',
    description: 'Pick FOCUS words, reject NOISE words. Fast.',
    descHi: 'फोकस शब्द चुनें, शोर के शब्द रिजेक्ट करें।',
    getTip: (sp) => sp.filterTip,
  },
];

const TYPE_STYLES = {
  focus:      { badge: 'bg-amber-500/20 text-amber-300',   topBorder: 'border-t-amber-500' },
  pressure:   { badge: 'bg-red-500/20 text-red-300',       topBorder: 'border-t-red-500'   },
  confidence: { badge: 'bg-violet-500/20 text-violet-300', topBorder: 'border-t-violet-500' },
};

// ── Utilities ──────────────────────────────────────────────────────────────────

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function useCountdown(seconds, active, onDone) {
  const [time, setTime] = useState(seconds);
  const intervalRef = useRef(null);
  const onDoneRef = useRef(onDone);
  onDoneRef.current = onDone;

  useEffect(() => {
    setTime(seconds);
  }, [seconds, active]);

  useEffect(() => {
    if (!active) { clearInterval(intervalRef.current); return; }
    intervalRef.current = setInterval(() => {
      setTime(prev => {
        if (prev <= 1) {
          clearInterval(intervalRef.current);
          onDoneRef.current();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(intervalRef.current);
  }, [active]);

  return time;
}

// ── GAME 1: Concentration Grid ─────────────────────────────────────────────────
// Classic sport psych attention tool — find 1→25 in a scrambled 5×5 grid

function ConcentrationGrid({ onDone }) {
  const [phase, setPhase] = useState('ready');
  const [grid, setGrid] = useState(() => shuffle(Array.from({ length: 25 }, (_, i) => i + 1)));
  const [nextTarget, setNextTarget] = useState(1);
  const [found, setFound] = useState(new Set());
  const [wrongFlash, setWrongFlash] = useState(null);
  const doneCalledRef = useRef(false);

  const finish = useCallback((finalScore) => {
    if (doneCalledRef.current) return;
    doneCalledRef.current = true;
    setPhase('done');
    const hi = parseInt(localStorage.getItem('hi_grid') || '0');
    if (finalScore > hi) localStorage.setItem('hi_grid', finalScore);
    onDone(finalScore);
  }, [onDone]);

  const time = useCountdown(60, phase === 'playing', () => finish(nextTarget - 1));

  function tap(num) {
    if (phase !== 'playing' || found.has(num)) return;
    if (num === nextTarget) {
      const nf = new Set(found); nf.add(num);
      setFound(nf);
      const next = nextTarget + 1;
      setNextTarget(next);
      if (next > 25) finish(25);
    } else {
      setWrongFlash(num);
      setTimeout(() => setWrongFlash(null), 350);
    }
  }

  function reset() {
    doneCalledRef.current = false;
    setPhase('ready');
    setGrid(shuffle(Array.from({ length: 25 }, (_, i) => i + 1)));
    setNextTarget(1);
    setFound(new Set());
  }

  const score = nextTarget - 1;
  const hi = parseInt(localStorage.getItem('hi_grid') || '0');

  if (phase === 'ready') return (
    <div className="text-center py-2">
      <p className="text-slate-300 text-sm mb-1">Find numbers <span className="text-white font-bold">1 → 25</span> in order.</p>
      <p className="text-slate-500 text-xs mb-5">They're scrambled. You have 60 seconds.</p>
      {hi > 0 && <p className="text-xs text-amber-400 mb-4">Your best: {hi}/25</p>}
      <button onClick={() => { doneCalledRef.current = false; setPhase('playing'); }} className="btn-primary">Start →</button>
    </div>
  );

  if (phase === 'done') {
    const newHi = parseInt(localStorage.getItem('hi_grid') || '0');
    const isNewBest = score >= newHi && hi < score;
    const rating = score >= 22 ? '🏆 Elite' : score >= 17 ? '🔥 Strong' : score >= 12 ? '💪 Good' : '📈 Keep Going';
    return (
      <div className="text-center py-2">
        <p className="text-4xl font-black text-white mb-1">{score}<span className="text-slate-400 text-xl">/25</span></p>
        <p className="text-lg text-amber-400 font-semibold mb-1">{rating}</p>
        {isNewBest && <p className="text-xs text-win-400 mb-1">🎉 New personal best!</p>}
        <p className="text-xs text-slate-500 mb-5">Elite athletes: 18–22 in 60 seconds</p>
        <button onClick={reset} className="btn-secondary text-sm">Play Again</button>
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <p className="text-sm text-slate-400">Find: <span className="text-2xl font-black text-amber-400">{nextTarget}</span></p>
        <p className={`text-sm font-bold tabular-nums ${time <= 10 ? 'text-red-400' : 'text-slate-300'}`}>{time}s</p>
        <p className="text-sm text-slate-500">{score}/25</p>
      </div>
      <div className="grid grid-cols-5 gap-1.5">
        {grid.map(num => {
          const isFnd   = found.has(num);
          const isFlash = wrongFlash === num;
          return (
            <button
              key={num}
              onClick={() => tap(num)}
              disabled={isFnd}
              className={`h-12 rounded-xl text-sm font-bold transition-all active:scale-95 select-none ${
                isFnd    ? 'bg-win-500/20 text-win-400/50 border border-win-500/20 cursor-default' :
                isFlash  ? 'bg-red-500/30 text-red-300 border border-red-500/50 scale-95' :
                           'bg-dark-700 border border-dark-500 text-slate-200 hover:border-amber-500/40 hover:bg-dark-600'
              }`}
            >
              {isFnd ? '✓' : num}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ── GAME 2: Stroop Focus ───────────────────────────────────────────────────────
// Color-word interference — tap the ink color, not the word meaning

const COLORS = [
  { name: 'RED',    tw: 'text-red-400',    btn: 'bg-red-600 hover:bg-red-500 active:bg-red-700'         },
  { name: 'BLUE',   tw: 'text-blue-400',   btn: 'bg-blue-600 hover:bg-blue-500 active:bg-blue-700'      },
  { name: 'GREEN',  tw: 'text-green-400',  btn: 'bg-green-600 hover:bg-green-500 active:bg-green-700'   },
  { name: 'YELLOW', tw: 'text-yellow-300', btn: 'bg-yellow-500 hover:bg-yellow-400 active:bg-yellow-600 text-dark-900' },
];

function makeStroopItem() {
  const wordIdx = Math.floor(Math.random() * 4);
  let inkIdx;
  do { inkIdx = Math.floor(Math.random() * 4); } while (inkIdx === wordIdx);
  return { wordIdx, inkIdx };
}

function StroopFocus({ onDone }) {
  const [phase, setPhase]     = useState('ready');
  const [item, setItem]       = useState(makeStroopItem);
  const [correct, setCorrect] = useState(0);
  const [total, setTotal]     = useState(0);
  const [feedback, setFeedback] = useState(null); // 'ok' | 'no'
  const doneRef = useRef(false);

  const finish = useCallback(() => {
    if (doneRef.current) return;
    doneRef.current = true;
    setPhase('done');
    const hi = parseInt(localStorage.getItem('hi_stroop') || '0');
    if (correct > hi) localStorage.setItem('hi_stroop', correct);
    onDone(correct);
  }, [correct, onDone]);

  const time = useCountdown(60, phase === 'playing', finish);

  function pick(colorIdx) {
    if (phase !== 'playing' || feedback) return;
    const hit = colorIdx === item.inkIdx;
    setFeedback(hit ? 'ok' : 'no');
    if (hit) setCorrect(c => c + 1);
    setTotal(t => t + 1);
    setTimeout(() => { setFeedback(null); setItem(makeStroopItem()); }, 350);
  }

  function reset() {
    doneRef.current = false;
    setPhase('ready');
    setCorrect(0);
    setTotal(0);
    setFeedback(null);
    setItem(makeStroopItem());
  }

  const hi = parseInt(localStorage.getItem('hi_stroop') || '0');

  if (phase === 'ready') return (
    <div className="text-center py-2">
      <div className="flex justify-center mb-4">
        <span className="text-4xl font-black text-red-400">BLUE</span>
      </div>
      <p className="text-slate-300 text-sm mb-1">The word says <span className="font-bold text-white">BLUE</span> but it's written in <span className="font-bold text-red-400">red ink</span>.</p>
      <p className="text-slate-300 text-sm mb-5">Always tap the <span className="font-bold text-white">ink color</span>, not the word.</p>
      {hi > 0 && <p className="text-xs text-amber-400 mb-4">Your best: {hi} correct</p>}
      <button onClick={() => { doneRef.current = false; setPhase('playing'); }} className="btn-primary">Start →</button>
    </div>
  );

  if (phase === 'done') {
    const pct = total > 0 ? Math.round((correct / total) * 100) : 0;
    const newHi = parseInt(localStorage.getItem('hi_stroop') || '0');
    const rating = pct >= 88 ? '🏆 Elite Control' : pct >= 72 ? '🔥 Strong' : pct >= 58 ? '💪 Good' : '📈 Train This';
    return (
      <div className="text-center py-2">
        <p className="text-4xl font-black text-white mb-1">{correct}<span className="text-slate-400 text-xl">/{total}</span></p>
        <p className="text-base text-slate-400 mb-1">{pct}% accuracy</p>
        <p className="text-lg text-amber-400 font-semibold mb-1">{rating}</p>
        {correct >= newHi && hi < correct && <p className="text-xs text-win-400 mb-1">🎉 New best!</p>}
        <p className="text-xs text-slate-500 mb-5">Target: 85%+ accuracy = elite inhibitory control</p>
        <button onClick={reset} className="btn-secondary text-sm">Play Again</button>
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <p className="text-sm text-slate-500">{correct}/{total} correct</p>
        <p className={`text-sm font-bold tabular-nums ${time <= 10 ? 'text-red-400' : 'text-slate-300'}`}>{time}s</p>
      </div>
      <div className={`flex items-center justify-center h-24 mb-6 rounded-2xl border-2 transition-colors duration-150 ${
        feedback === 'ok' ? 'border-win-500/60 bg-win-500/10' :
        feedback === 'no' ? 'border-red-500/60 bg-red-500/10' : 'border-dark-500 bg-dark-700'
      }`}>
        <p className={`text-5xl font-black tracking-widest select-none ${COLORS[item.inkIdx].tw}`}>
          {COLORS[item.wordIdx].name}
        </p>
      </div>
      <div className="grid grid-cols-2 gap-3">
        {COLORS.map((c, idx) => (
          <button
            key={c.name}
            onClick={() => pick(idx)}
            className={`py-4 rounded-2xl text-white font-bold text-sm transition-all active:scale-95 select-none ${c.btn}`}
          >
            {c.name}
          </button>
        ))}
      </div>
    </div>
  );
}

// ── GAME 3: Reaction Ball ──────────────────────────────────────────────────────
// Go/No-Go paradigm — tap on green, wait through the anticipation phase

function ReactionBall({ onDone, sportProfile }) {
  const sp = sportProfile;
  const [phase, setPhase]   = useState('ready'); // ready|waiting|green|result|done
  const [round, setRound]   = useState(1);
  const [times, setTimes]   = useState([]);
  const [lastMs, setLastMs] = useState(null);
  const [early, setEarly]   = useState(false);
  const waitRef  = useRef(null);
  const startRef = useRef(null);
  const doneRef  = useRef(false);

  function beginWait() {
    setPhase('waiting');
    setEarly(false);
    setLastMs(null);
    const delay = 1500 + Math.random() * 2500;
    waitRef.current = setTimeout(() => setPhase('green'), delay);
  }

  useEffect(() => {
    if (phase === 'green') startRef.current = performance.now();
  }, [phase]);

  useEffect(() => () => clearTimeout(waitRef.current), []);

  function tap() {
    if (phase === 'waiting') {
      clearTimeout(waitRef.current);
      setEarly(true);
      setPhase('result');
      setTimeout(beginWait, 1600);
      return;
    }
    if (phase !== 'green') return;
    const ms = Math.round(performance.now() - startRef.current);
    setLastMs(ms);
    const newTimes = [...times, ms];
    setTimes(newTimes);
    setPhase('result');
    if (round >= 5) {
      if (doneRef.current) return;
      doneRef.current = true;
      const avg = Math.round(newTimes.reduce((a, b) => a + b, 0) / newTimes.length);
      const hi = parseInt(localStorage.getItem('hi_reaction') || '9999');
      if (avg < hi) localStorage.setItem('hi_reaction', avg);
      setTimeout(() => { setPhase('done'); onDone(avg); }, 1200);
    } else {
      setTimeout(() => { setRound(r => r + 1); beginWait(); }, 1200);
    }
  }

  function reset() {
    doneRef.current = false;
    clearTimeout(waitRef.current);
    setPhase('ready');
    setRound(1);
    setTimes([]);
    setLastMs(null);
    setEarly(false);
  }

  const hi = parseInt(localStorage.getItem('hi_reaction') || '0');

  if (phase === 'ready') return (
    <div className="text-center py-2">
      <p className="text-slate-300 text-sm mb-1">Wait for the circle to turn <span className="text-win-400 font-bold">GREEN</span>.</p>
      <p className="text-slate-400 text-xs mb-3 leading-relaxed">{sp.reactionContext}</p>
      <p className="text-slate-500 text-xs mb-5">5 rounds · Don't tap early!</p>
      {hi > 0 && hi < 9999 && <p className="text-xs text-amber-400 mb-4">Your best: {hi}ms avg</p>}
      <button onClick={() => { doneRef.current = false; beginWait(); }} className="btn-primary">Start →</button>
    </div>
  );

  if (phase === 'done') {
    const newHi = parseInt(localStorage.getItem('hi_reaction') || '9999');
    const avg = Math.round(times.reduce((a, b) => a + b, 0) / times.length);
    const rating =
      avg < sp.reactionElite ? `🏆 ${sp.reactionEliteLabel}` :
      avg < sp.reactionGood  ? '🔥 Strong' :
      avg < sp.reactionGood + 70 ? '💪 Good' : '📈 Train Daily';
    return (
      <div className="text-center py-2">
        <p className="text-4xl font-black text-white mb-1">{avg}<span className="text-slate-400 text-xl">ms avg</span></p>
        <p className="text-lg text-red-400 font-semibold mb-1">{rating}</p>
        {avg <= newHi && hi > avg && <p className="text-xs text-win-400 mb-1">🎉 New personal best!</p>}
        <div className="flex justify-center gap-2 flex-wrap my-3">
          {times.map((t, i) => (
            <span key={i} className="text-xs bg-dark-700 px-2 py-1 rounded-lg text-slate-400">R{i+1}: {t}ms</span>
          ))}
        </div>
        <p className="text-xs text-slate-500 mb-5">{sp.reactionBenchmark}</p>
        <button onClick={reset} className="btn-secondary text-sm">Play Again</button>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center py-2">
      <p className="text-sm text-slate-500 mb-6">Round {round} of 5</p>
      <button
        onClick={tap}
        className={`w-44 h-44 rounded-full flex items-center justify-center text-xl font-black transition-all duration-100 active:scale-95 select-none ${
          phase === 'green'  ? 'bg-win-500 shadow-[0_0_50px_rgba(16,185,129,0.5)] text-white scale-110' :
          phase === 'result' ? (early ? 'bg-red-900/60 text-red-300 border-2 border-red-500/30' : 'bg-dark-700 border-2 border-win-500/40 text-win-400') :
          'bg-dark-700 border-2 border-dark-500 text-dark-600 cursor-default'
        }`}
      >
        {phase === 'waiting' && <span className="text-slate-600 text-4xl">●</span>}
        {phase === 'green'   && sp.reactionAction}
        {phase === 'result'  && (early ? '⚡ Early!' : `${lastMs}ms`)}
      </button>
      {phase === 'waiting' && <p className="text-slate-500 text-sm mt-5">Wait for green…</p>}
      {phase === 'green'   && <p className="text-win-400 text-sm mt-5 animate-pulse">Now!</p>}
    </div>
  );
}

// ── GAME 4: Thought Buster ────────────────────────────────────────────────────
// CBT thought stopping — pop negative thought bubbles, replace with focus words

const UNIVERSAL_NEG_THOUGHTS = [
  'What if I fail?', "I'm not ready", "Everyone's watching",
  'I always choke', 'What if I get dropped?', "I'm not good enough",
  "They'll judge me", "I'm too nervous", 'Last time was terrible',
  "I can't handle this", 'What if I freeze?', "I'll let them down",
];
const COUNTER_WORDS = ['Trust', 'Breathe', 'Focus', 'Now', 'Process', 'Here', 'Strong', 'Play', 'Ready'];

let _bubbleId = 0;

function ThoughtBuster({ onDone, sportProfile }) {
  const negThoughts = [
    ...(sportProfile?.negThoughts || []),
    ...UNIVERSAL_NEG_THOUGHTS,
  ].slice(0, 14); // blend sport-specific + universal, cap at 14
  const [phase, setPhase]           = useState('ready');
  const [bubbles, setBubbles]       = useState([]);
  const [score, setScore]           = useState(0);
  const [pops, setPops]             = useState([]); // [{id, word, x, y}]
  const queueRef                    = useRef(shuffle([...negThoughts, ...negThoughts]));
  const qIdxRef                     = useRef(0);
  const spawnRef                    = useRef(null);
  const doneRef                     = useRef(false);
  const scoreRef                    = useRef(0);

  const finish = useCallback(() => {
    if (doneRef.current) return;
    doneRef.current = true;
    clearInterval(spawnRef.current);
    setPhase('done');
    const hi = parseInt(localStorage.getItem('hi_thought') || '0');
    if (scoreRef.current > hi) localStorage.setItem('hi_thought', scoreRef.current);
    onDone(scoreRef.current);
  }, [onDone]);

  const time = useCountdown(45, phase === 'playing', finish);

  useEffect(() => {
    if (phase !== 'playing') return;
    spawnRef.current = setInterval(() => {
      const id = ++_bubbleId;
      const text = queueRef.current[qIdxRef.current % queueRef.current.length];
      qIdxRef.current++;
      const x = 8 + Math.random() * 68;
      const y = 10 + Math.random() * 65;
      setBubbles(prev => prev.length >= 4 ? prev : [...prev, { id, text, x, y }]);
      setTimeout(() => setBubbles(prev => prev.filter(b => b.id !== id)), 2800);
    }, 1100);
    return () => clearInterval(spawnRef.current);
  }, [phase]);

  function pop(bubble, e) {
    if (phase !== 'playing') return;
    e.stopPropagation();
    setBubbles(prev => prev.filter(b => b.id !== bubble.id));
    const word = COUNTER_WORDS[Math.floor(Math.random() * COUNTER_WORDS.length)];
    const fid = ++_bubbleId;
    setPops(prev => [...prev, { id: fid, word, x: bubble.x, y: bubble.y }]);
    setTimeout(() => setPops(prev => prev.filter(f => f.id !== fid)), 700);
    scoreRef.current += 1;
    setScore(s => s + 1);
  }

  function reset() {
    doneRef.current = false;
    scoreRef.current = 0;
    qIdxRef.current = 0;
    queueRef.current = shuffle([...negThoughts, ...negThoughts]);
    setBubbles([]);
    setPops([]);
    setScore(0);
    setPhase('ready');
  }

  const hi = parseInt(localStorage.getItem('hi_thought') || '0');

  if (phase === 'ready') return (
    <div className="text-center py-2">
      <div className="bg-red-950/60 border border-red-800/40 rounded-2xl px-4 py-2 inline-block mb-4">
        <p className="text-red-300 text-sm italic">"What if I fail?"</p>
      </div>
      <p className="text-slate-300 text-sm mb-1">Negative thoughts will float up. <span className="font-bold text-white">Tap to pop them</span> before they take over.</p>
      <p className="text-slate-500 text-xs mb-5">45 seconds · Pop as many as you can</p>
      {hi > 0 && <p className="text-xs text-amber-400 mb-4">Your best: {hi} thoughts popped</p>}
      <button onClick={() => { doneRef.current = false; setPhase('playing'); }} className="btn-primary">Start →</button>
    </div>
  );

  if (phase === 'done') {
    const newHi = parseInt(localStorage.getItem('hi_thought') || '0');
    const rating = score >= 25 ? '🏆 Elite Control' : score >= 18 ? '🔥 Strong' : score >= 12 ? '💪 Good' : '📈 Keep Going';
    return (
      <div className="text-center py-2">
        <p className="text-4xl font-black text-white mb-1">{score}</p>
        <p className="text-slate-400 text-sm mb-1">thoughts popped</p>
        <p className="text-lg text-violet-400 font-semibold mb-1">{rating}</p>
        {score >= newHi && hi < score && <p className="text-xs text-win-400 mb-1">🎉 New best!</p>}
        <p className="text-xs text-slate-500 mb-5">Each pop is a thought stopped. That's real mental training.</p>
        <button onClick={reset} className="btn-secondary text-sm">Play Again</button>
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <p className="text-sm text-slate-500">{score} popped</p>
        <p className={`text-sm font-bold tabular-nums ${time <= 10 ? 'text-red-400' : 'text-slate-300'}`}>{time}s</p>
      </div>
      <div className="relative bg-dark-900 border border-dark-600 rounded-2xl overflow-hidden" style={{ height: 240 }}>
        {bubbles.map(b => (
          <button
            key={b.id}
            onClick={e => pop(b, e)}
            style={{ left: `${b.x}%`, top: `${b.y}%`, transform: 'translate(-50%,-50%)' }}
            className="absolute bg-red-950/90 border border-red-800/60 text-red-300 text-xs font-medium px-3 py-1.5 rounded-2xl max-w-[130px] text-center leading-snug active:scale-90 transition-transform animate-fade-in select-none"
          >
            {b.text}
          </button>
        ))}
        {pops.map(f => (
          <span
            key={f.id}
            style={{ left: `${f.x}%`, top: `${f.y}%`, transform: 'translate(-50%,-50%)' }}
            className="absolute text-win-400 font-bold text-sm pointer-events-none animate-fade-in select-none"
          >
            {f.word} ✓
          </span>
        ))}
        {bubbles.length === 0 && phase === 'playing' && (
          <div className="flex items-center justify-center h-full text-slate-700 text-xs">Incoming…</div>
        )}
      </div>
    </div>
  );
}

// ── GAME 5: Focus Filter ───────────────────────────────────────────────────────
// Selective attention training — distinguish focus words from noise words

const FOCUS_WORDS = ['Breathe', 'Now', 'Trust', 'Process', 'Here', 'Play', 'Ready', 'Stay', 'Zone', 'Act'];
const NOISE_WORDS = ['Fail', 'Judge', 'Lose', 'Crowd', 'Panic', 'Miss', 'Result', 'Doubt', 'Fear', 'Quit'];

function FocusFilter({ onDone }) {
  const [phase, setPhase] = useState('ready');
  const [queue]           = useState(() => shuffle([
    ...FOCUS_WORDS.map(w => ({ text: w, isFocus: true })),
    ...NOISE_WORDS.map(w => ({ text: w, isFocus: false })),
  ]));
  const [idx, setIdx]       = useState(0);
  const [correct, setCorrect] = useState(0);
  const [answered, setAnswered] = useState(0);
  const [feedback, setFeedback] = useState(null); // 'ok' | 'no'
  const tickRef  = useRef(null);
  const doneRef  = useRef(false);

  const finish = useCallback(() => {
    if (doneRef.current) return;
    doneRef.current = true;
    clearTimeout(tickRef.current);
    setPhase('done');
    onDone(correct);
  }, [correct, onDone]);

  const time = useCountdown(45, phase === 'playing', finish);

  const advance = useCallback(() => {
    setFeedback(null);
    setIdx(i => {
      if (i + 1 >= queue.length) { finish(); return i; }
      return i + 1;
    });
  }, [queue.length, finish]);

  useEffect(() => {
    if (phase !== 'playing') return;
    clearTimeout(tickRef.current);
    tickRef.current = setTimeout(advance, 1800);
    return () => clearTimeout(tickRef.current);
  }, [idx, phase, advance]);

  function answer(isYes) {
    if (phase !== 'playing' || feedback) return;
    clearTimeout(tickRef.current);
    const word = queue[idx];
    const hit = isYes === word.isFocus;
    setFeedback(hit ? 'ok' : 'no');
    setAnswered(a => a + 1);
    if (hit) setCorrect(c => c + 1);
    setTimeout(advance, 450);
  }

  function reset() {
    doneRef.current = false;
    setPhase('ready');
    setIdx(0);
    setCorrect(0);
    setAnswered(0);
    setFeedback(null);
  }

  const hi = parseInt(localStorage.getItem('hi_filter') || '0');

  if (phase === 'ready') return (
    <div className="text-center py-2">
      <div className="flex gap-2 justify-center mb-3 flex-wrap">
        <span className="bg-win-500/20 text-win-300 text-xs px-3 py-1 rounded-full font-medium">FOCUS: Breathe · Trust · Here</span>
        <span className="bg-red-500/20 text-red-300 text-xs px-3 py-1 rounded-full font-medium">NOISE: Fail · Panic · Doubt</span>
      </div>
      <p className="text-slate-300 text-sm mb-5">Press <span className="text-win-400 font-bold">FOCUS ✓</span> or <span className="text-red-400 font-bold">NOISE ✗</span> for each word. Fast.</p>
      {hi > 0 && <p className="text-xs text-amber-400 mb-4">Your best: {hi} correct</p>}
      <button onClick={() => { doneRef.current = false; setPhase('playing'); }} className="btn-primary">Start →</button>
    </div>
  );

  if (phase === 'done') {
    const newHi = parseInt(localStorage.getItem('hi_filter') || '0');
    const pct = answered > 0 ? Math.round((correct / answered) * 100) : 0;
    const rating = pct >= 88 ? '🏆 Elite Filter' : pct >= 72 ? '🔥 Strong' : pct >= 58 ? '💪 Good' : '📈 Train This';
    if (correct > newHi) localStorage.setItem('hi_filter', correct);
    return (
      <div className="text-center py-2">
        <p className="text-4xl font-black text-white mb-1">{correct}<span className="text-slate-400 text-xl">/{answered}</span></p>
        <p className="text-slate-400 text-sm mb-1">{pct}% accuracy</p>
        <p className="text-lg text-amber-400 font-semibold mb-1">{rating}</p>
        {correct > newHi && hi < correct && <p className="text-xs text-win-400 mb-1">🎉 New best!</p>}
        <p className="text-xs text-slate-500 mb-5">85%+ = elite distraction resistance</p>
        <button onClick={reset} className="btn-secondary text-sm">Play Again</button>
      </div>
    );
  }

  const word = queue[idx];
  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <p className="text-sm text-slate-500">{idx + 1}/{queue.length}</p>
        <p className={`text-sm font-bold tabular-nums ${time <= 10 ? 'text-red-400' : 'text-slate-300'}`}>{time}s</p>
      </div>
      <div className={`flex items-center justify-center h-28 mb-5 rounded-2xl border-2 transition-colors duration-150 ${
        feedback === 'ok' ? 'border-win-500/60 bg-win-500/10' :
        feedback === 'no' ? 'border-red-500/60 bg-red-500/10' : 'border-dark-500 bg-dark-700'
      }`}>
        <p className="text-4xl font-black text-white select-none">{word?.text}</p>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <button
          onClick={() => answer(true)}
          className="py-4 rounded-2xl bg-win-600 hover:bg-win-500 text-white font-bold text-sm active:scale-95 transition-all select-none"
        >
          FOCUS ✓
        </button>
        <button
          onClick={() => answer(false)}
          className="py-4 rounded-2xl bg-red-700 hover:bg-red-600 text-white font-bold text-sm active:scale-95 transition-all select-none"
        >
          NOISE ✗
        </button>
      </div>
    </div>
  );
}

// ── Game runner wrapper ────────────────────────────────────────────────────────

const GAME_COMPONENTS = {
  concentration_grid: ConcentrationGrid,
  stroop_focus:       StroopFocus,
  reaction_ball:      ReactionBall,
  thought_buster:     ThoughtBuster,
  focus_filter:       FocusFilter,
};

function GameRunner({ gameId, onBack, onDone, xpEarned, sportProfile }) {
  const game = GAMES.find(g => g.id === gameId);
  const GameComponent = GAME_COMPONENTS[gameId];
  const style = TYPE_STYLES[game.type];
  const tip = game.getTip(sportProfile);

  return (
    <div className="animate-fade-in">
      <button onClick={onBack} className="flex items-center gap-1.5 text-slate-400 hover:text-slate-200 text-sm mb-4 transition-colors">
        <ArrowLeft size={14} /> Games
      </button>

      <div className="flex items-center gap-3 mb-4">
        <span className="text-3xl">{game.icon}</span>
        <div>
          <h2 className="font-bold text-slate-100 text-base">{game.title}</h2>
          <div className="flex items-center gap-2 mt-0.5">
            <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${style.badge}`}>{game.type}</span>
            <span className="text-[10px] text-slate-500">{game.duration}</span>
            {sportProfile.label !== 'athlete' && (
              <span className="text-[10px] text-brand-400">· for {sportProfile.label}</span>
            )}
          </div>
        </div>
      </div>

      <div className={`bg-dark-800 rounded-2xl border border-dark-600 border-t-4 ${style.topBorder} p-5 mb-4`}>
        <GameComponent onDone={onDone} sportProfile={sportProfile} />
      </div>

      {xpEarned && (
        <div className="flex items-center justify-center gap-2 text-sm text-brand-400 animate-fade-in mb-4">
          <Zap size={14} />
          <span>+{xpEarned} MXP earned!</span>
        </div>
      )}

      <div className="bg-dark-800/50 border border-dark-600 rounded-xl px-4 py-3">
        <p className="text-xs text-slate-500 leading-relaxed">
          <span className="text-slate-400 font-medium">Why this helps: </span>{tip}
        </p>
      </div>
    </div>
  );
}

// ── Main GamesPage ─────────────────────────────────────────────────────────────

function GamesPage() {
  const { token, language, user } = useAuth();
  const sportProfile = getSportProfile(user?.sport);
  const [activeGame, setActiveGame]   = useState(null);
  const [xpMap, setXpMap]             = useState({}); // gameId → xpEarned
  const [played, setPlayed]           = useState(() => {
    try { return new Set(JSON.parse(sessionStorage.getItem('gamesPlayed') || '[]')); }
    catch { return new Set(); }
  });

  async function awardXP(gameId) {
    if (played.has(gameId)) return;
    try {
      const res = await apiFetch('/api/games/xp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ gameType: gameId }),
      });
      if (res.ok) {
        const data = await res.json();
        setXpMap(prev => ({ ...prev, [gameId]: data.xpEarned }));
        setPlayed(prev => {
          const next = new Set([...prev, gameId]);
          sessionStorage.setItem('gamesPlayed', JSON.stringify([...next]));
          return next;
        });
      }
    } catch { /* offline — no XP, no crash */ }
  }

  function handleDone(gameId, score) {
    awardXP(gameId);
  }

  return (
    <div className="min-h-screen bg-dark-900 pb-20">
      <header className="bg-dark-900 border-b border-dark-600 px-4 py-4 sticky top-0 z-10">
        <div className="max-w-lg mx-auto flex items-center gap-3">
          {activeGame ? (
            <button onClick={() => setActiveGame(null)} className="text-slate-400 hover:text-slate-200 transition-colors">
              <ArrowLeft size={20} />
            </button>
          ) : (
            <Link to="/dashboard" className="text-slate-400 hover:text-slate-200 transition-colors">
              <ArrowLeft size={20} />
            </Link>
          )}
          <h1 className="font-bold text-slate-100">
            {activeGame ? GAMES.find(g => g.id === activeGame)?.title : 'Mind Booster Games'}
          </h1>
          {!activeGame && (
            <span className="ml-auto text-xs text-slate-500">+10 MXP per game</span>
          )}
        </div>
      </header>

      <main className="max-w-lg mx-auto px-4 py-6">
        {activeGame ? (
          <GameRunner
            key={activeGame}
            gameId={activeGame}
            onBack={() => setActiveGame(null)}
            onDone={(score) => handleDone(activeGame, score)}
            xpEarned={xpMap[activeGame]}
            sportProfile={sportProfile}
          />
        ) : (
          <>
            <p className="text-slate-400 text-sm mb-5 leading-relaxed">
              5 evidence-based mini-games used in sport psychology. Each trains a specific mental skill in under 90 seconds.
            </p>

            <div className="space-y-3">
              {GAMES.map(game => {
                const style = TYPE_STYLES[game.type];
                const isPlayed = played.has(game.id);
                const hi = getHighScore(game.id);
                return (
                  <div
                    key={game.id}
                    className={`bg-dark-800 rounded-2xl overflow-hidden border border-dark-600 border-t-2 ${style.topBorder}`}
                  >
                    <div className="p-4">
                      <div className="flex items-center gap-3">
                        <span className="text-3xl">{game.icon}</span>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                            <h3 className="font-bold text-slate-100 text-sm">{language === 'hi' ? game.titleHi : game.title}</h3>
                            {isPlayed && (
                              <span className="text-[10px] text-win-400 font-semibold bg-win-500/10 px-2 py-0.5 rounded-full">✓ +10 MXP</span>
                            )}
                          </div>
                          <p className="text-xs text-slate-400 mb-1.5">{language === 'hi' ? game.descHi : game.description}</p>
                          <div className="flex items-center gap-2">
                            <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${style.badge}`}>{game.type}</span>
                            <span className="text-[10px] text-slate-500">{game.duration}</span>
                            {hi !== null && <span className="text-[10px] text-slate-600">Best: {hi}{game.id === 'reaction_ball' ? 'ms' : ''}</span>}
                          </div>
                        </div>
                        <button
                          onClick={() => setActiveGame(game.id)}
                          className="shrink-0 text-xs font-bold bg-brand-600 hover:bg-brand-500 text-white px-4 py-2.5 rounded-xl transition-all active:scale-95"
                        >
                          Play
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </main>
    </div>
  );
}

function getHighScore(gameId) {
  const keys = {
    concentration_grid: 'hi_grid',
    stroop_focus:       'hi_stroop',
    reaction_ball:      'hi_reaction',
    thought_buster:     'hi_thought',
    focus_filter:       'hi_filter',
  };
  const raw = localStorage.getItem(keys[gameId]);
  if (!raw) return null;
  const v = parseInt(raw);
  if (gameId === 'reaction_ball') return v === 9999 ? null : `${v}ms avg`;
  return v;
}

export default GamesPage;
