import { useCallback, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { X, Share2 } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useStatusBarColour } from '../components/ui/TonePage';
import Teer from '../components/visuals/Teer';
import MindStatsCard from '../components/path/MindStatsCard';
import FocusGame from '../components/path/FocusGame';
import { SKILLS, SKILL_BAR, challengeText, levelFromPoints, daysUntil, useMindChallenge } from '../components/path/mindChallengeData';
import MatchDaySheet from '../components/match/MatchDaySheet';
import { usePath } from '../components/path/pathData';

// Mind Challenge (docs/PATH-STRATEGY.md) built on the Hook Model:
// Action (one tap, 6 short rounds) → Variable reward (a skill reveal after
// every round, the card at the end) → Investment (pick a skill + next match)
// → next trigger (rematch in 4 weeks). No rankings, no streaks.
const NIGHT = '#101533';

function buildSteps(t) {
  const steps = [];
  SKILLS.forEach((skill, round) => {
    t.questions[skill].forEach((q, i) => steps.push({ kind: 'question', skill, round, q, key: `${skill}-${i}` }));
    if (skill === 'focus') steps.push({ kind: 'game', skill, round, key: 'focus-game' });
    steps.push({ kind: 'reveal', skill, round, key: `${skill}-reveal` });
  });
  return steps;
}

async function shareCard(node, t) {
  try {
    const { toBlob } = await import('html-to-image');
    const blob = await toBlob(node, { pixelRatio: 2 });
    const file = new File([blob], 'mind-stats.png', { type: 'image/png' });
    if (navigator.canShare?.({ files: [file] })) {
      await navigator.share({ files: [file], title: t.card.shareText });
      return;
    }
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'mind-stats.png'; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  } catch { /* sharing is optional */ }
}

export default function MindChallengePage() {
  const { user, language } = useAuth();
  const navigate = useNavigate();
  const t = challengeText(language);
  const { state, error, reload, save, setGoal } = useMindChallenge();
  useStatusBarColour({ colour: NIGHT });

  const steps = useMemo(() => buildSteps(t), [t]);
  const location = useLocation();
  // First run (from /welcome): its intro was the welcome screen, so start playing.
  const firstRun = !!location.state?.firstRun;
  const [phase, setPhase] = useState(firstRun ? 'play' : null); // intro | play | saving | card | invest
  const [stepIndex, setStepIndex] = useState(0);
  const [points, setPoints] = useState(() => Object.fromEntries(SKILLS.map(s => [s, 0])));
  const [choice, setChoice] = useState(null);
  const [saveError, setSaveError] = useState(false);
  const [justTook, setJustTook] = useState(false);
  const [goalSkill, setGoalSkill] = useState(null);
  const [nextMatch, setNextMatch] = useState(null);
  const [matchSheet, setMatchSheet] = useState(false);
  const { setMatchDay } = usePath();
  const [busy, setBusy] = useState(false);
  const cardRef = useRef(null);

  const view = phase || (state ? (state.canTake ? 'intro' : 'card') : null);
  const firstName = (user?.name || '').split(' ')[0];

  const addPoints = useCallback((skill, n) => setPoints(p => ({ ...p, [skill]: p[skill] + n })), []);
  const advance = useCallback(() => { setChoice(null); setStepIndex(i => i + 1); }, []);

  async function finish() {
    setPhase('saving'); setSaveError(false);
    try {
      const next = await save(points);
      setJustTook(true);
      setGoalSkill(next.latest?.growFirst || null);
      setPhase('card');
    } catch { setSaveError(true); }
  }

  async function buildPath() {
    if (!goalSkill) return;
    setBusy(true);
    try { await setGoal(goalSkill, nextMatch); } catch { /* the card is saved; the goal can be set later */ }
    // A match this week or next: ask for the actual day (Hook fix 2), so
    // Arjun can help the day before. Skippable.
    if (!firstRun && (nextMatch === 'this_week' || nextMatch === 'next_week')) { setBusy(false); setMatchSheet(true); return; }
    navigate('/train', { replace: true });
  }

  const shell = (children, { closeTo = -1 } = {}) => (
    <div className="min-h-screen bg-inkblock text-white">
      <div className="mx-auto flex min-h-screen max-w-lg flex-col px-5 pb-[calc(1.5rem+env(safe-area-inset-bottom))] pt-4">
        <button type="button" onClick={() => navigate(closeTo)} aria-label={t.exit} className="flex h-11 w-11 items-center justify-center rounded-2xl bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sun">
          <X size={18} />
        </button>
        {children}
      </div>
    </div>
  );

  if (error) return shell(
    <div className="flex flex-1 flex-col items-center justify-center gap-3 text-center">
      <p className="text-[15px] text-white/80">{t.saveError}</p>
      <button type="button" onClick={reload} className="min-h-[48px] rounded-[16px] bg-sun px-6 font-extrabold text-inkblock">{t.retry}</button>
    </div>,
  );
  if (!view) return shell(<div className="flex-1" aria-busy="true" />);

  // ── Intro (Action: one tap) ──
  if (view === 'intro') {
    const rematch = !!state.latest;
    return shell(
      <div className="flex flex-1 flex-col items-center text-center">
        <span className="mt-4 self-start rounded-full bg-white/10 px-3 py-1.5 text-[12px] font-bold uppercase tracking-[0.1em] text-sun">{rematch ? t.homeCard.rematchTag : t.name}</span>
        <Teer pose="point" height={180} motion="float" eager className="mt-4" />
        <h1 className="mt-3 text-[30px] font-extrabold leading-tight">{rematch ? t.homeCard.rematchTitle(state.latest.mindLevel) : t.introTitle}</h1>
        <p className="mt-2 text-[15px] leading-relaxed text-white/80">{t.introLine}</p>
        {/* Plain "why" for someone new to mental training (founder, Nov 2026) */}
        <div className="mt-5 w-full rounded-[20px] bg-white/[0.07] p-4 text-left">
          <p className="text-[14px] font-extrabold text-sun">{t.introWhyTitle}</p>
          <ul className="mt-2 flex flex-col gap-1.5">
            {t.introWhy.map(w => <li key={w} className="flex gap-2 text-[14px] leading-snug text-white/90"><span className="text-sun" aria-hidden="true">✓</span>{w}</li>)}
          </ul>
        </div>
        <p className="mt-4 flex flex-wrap justify-center gap-x-4 gap-y-1 text-[13px] text-white/75">{t.introFacts.map(f => <span key={f}>{f}</span>)}</p>
        <div className="flex-1" />
        <button type="button" onClick={() => setPhase('play')} className="mt-6 min-h-[58px] w-full rounded-[18px] bg-sun text-[17px] font-extrabold text-inkblock focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white">{t.start}</button>
      </div>,
    );
  }

  // ── Rounds (Variable reward after each) ──
  if (view === 'play' || view === 'saving') {
    const step = steps[stepIndex];
    const progress = (
      <div className="mt-4 flex items-center gap-3">
        <span className="text-[13px] font-bold text-sun">{t.round((step?.round ?? 5) + 1, SKILLS.length)}</span>
        <div className="grid flex-1 grid-cols-6 gap-1.5" aria-hidden="true">
          {SKILLS.map((s, i) => <span key={s} className={`h-[7px] rounded-full ${i < (step?.round ?? 6) ? 'bg-mint' : i === step?.round ? 'bg-sun' : 'bg-white/20'}`} />)}
        </div>
      </div>
    );
    if (view === 'saving' || !step) return shell(
      <div className="flex flex-1 flex-col items-center justify-center gap-4 text-center">
        <Teer pose="cheer" height={170} motion="hop" eager />
        {saveError ? (
          <>
            <p className="text-[15px] text-white/80">{t.saveError}</p>
            <button type="button" onClick={finish} className="min-h-[52px] rounded-[16px] bg-sun px-6 font-extrabold text-inkblock">{t.retry}</button>
          </>
        ) : <p className="text-[16px] font-bold" role="status">{t.saving}</p>}
      </div>,
    );
    if (step.kind === 'game') return shell(<>{progress}<FocusGame t={t} onDone={(n) => { addPoints('focus', n); advance(); }} /></>);
    if (step.kind === 'reveal') {
      const lv = levelFromPoints(points[step.skill]);
      const last = step.round === SKILLS.length - 1;
      return shell(
        <div className="flex flex-1 flex-col items-center text-center">
          {progress}
          <p className="mt-8 text-[13px] font-bold uppercase tracking-[0.12em] text-[#9DB4FF]">{t.revealLabel}</p>
          <div data-testid="skill-reveal" className={`mt-4 w-[260px] rounded-[26px] p-5 text-inkblock ${SKILL_BAR[step.skill]} shadow-[0_0_0_6px_rgba(255,255,255,0.12),0_24px_50px_rgba(0,0,0,0.4)] motion-safe:animate-fade-in`}>
            <p className="text-[24px] font-extrabold uppercase">{t.skills[step.skill]}</p>
            <p className="text-[13px] font-semibold">{t.skillMeaning[step.skill]}</p>
            <p className="mt-2 whitespace-nowrap text-[28px] font-extrabold leading-none">{t.levelOf(lv)}</p>
            <p className="mt-2 text-[14px] font-semibold">{t.levelLines[lv]}</p>
          </div>
          <Teer pose="cheer" height={130} motion="hop" eager className="mt-5" />
          {!last && <p className="mt-2 text-[13px] text-white/70">{t.toGo(SKILLS.length - step.round - 1)}</p>}
          <div className="flex-1" />
          <button type="button" onClick={last ? finish : advance} className="mt-6 min-h-[56px] w-full rounded-[18px] bg-sun text-[16px] font-extrabold text-inkblock">{last ? t.seeCard : t.nextRound}</button>
        </div>,
      );
    }
    return shell(
      <div className="flex flex-1 flex-col">
        {progress}
        <div className="mt-6 flex items-end gap-3 rounded-[26px] bg-white/[0.07] p-4">
          <div className="flex-1">
            <p className="text-[19px] font-bold leading-snug">{step.q.q}</p>
            <p className="mt-2 text-[13px] text-white/70">{t.questionHelp}</p>
          </div>
          <Teer pose="think" height={96} />
        </div>
        <div className="mt-5 flex flex-col gap-2.5" role="radiogroup" aria-label={step.q.q}>
          {step.q.a.map(([label, pts], i) => {
            const on = choice === i;
            return (
              <button key={label} type="button" role="radio" aria-checked={on} onClick={() => setChoice(i)}
                className={`min-h-[56px] rounded-[18px] px-4 text-left text-[15px] font-semibold text-inkblock focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sun ${on ? 'bg-[#FFF6D6] ring-[3px] ring-sun' : 'bg-white'}`}>
                {label}
              </button>
            );
          })}
        </div>
        <div className="flex-1" />
        <button type="button" disabled={choice === null}
          onClick={() => { addPoints(step.skill, step.q.a[choice][1]); advance(); }}
          className="mt-6 min-h-[56px] rounded-[18px] bg-sun text-[16px] font-extrabold text-inkblock disabled:opacity-40">
          {t.lockIn}
        </button>
      </div>,
    );
  }

  // ── Card (reward) ──
  if (view === 'card') {
    const latest = state.latest;
    const prev = state.previous;
    const levelledUp = justTook && prev && SKILLS.some(s => latest.levels[s] > prev.levels[s]);
    return shell(
      <div className="flex flex-1 flex-col items-center text-center">
        <p className="mt-3 text-[13px] font-bold uppercase tracking-[0.12em] text-sun">{levelledUp ? t.card.levelUp : t.card.unlocked}</p>
        {levelledUp && <p className="mt-1 text-[14px] text-white/80">{t.card.rematchLine}</p>}
        <div className="mt-4 flex w-full justify-center">
          <MindStatsCard ref={cardRef} result={latest} previous={justTook ? prev : null} name={firstName} sport={user?.sport} language={language} />
        </div>
        <div className="mt-4 grid w-full grid-cols-2 gap-2.5 text-left">
          <div className="rounded-[18px] bg-white/10 p-3"><p className="text-[12px] text-white/70">{t.card.superpower}</p><p className="mt-1 text-[16px] font-extrabold text-[#9DB4FF]">{t.skills[latest.strongest]}</p></div>
          <div className="rounded-[18px] bg-white/10 p-3"><p className="text-[12px] text-white/70">{t.card.growFirst}</p><p className="mt-1 text-[16px] font-extrabold text-sun">{t.skills[latest.growFirst]}</p></div>
        </div>
        <p className="mt-3 text-[12px] text-white/60">{t.card.notATest}</p>
        {!justTook && <p className="mt-2 text-[14px] font-bold">{t.card.nextIn(daysUntil(state.nextAt))}</p>}
        <div className="flex-1" />
        <button type="button" onClick={() => (justTook ? setPhase('invest') : navigate(-1))} className="mt-6 min-h-[56px] w-full rounded-[18px] bg-sun text-[16px] font-extrabold text-inkblock">{t.card.continue}</button>
        <button type="button" onClick={() => cardRef.current && shareCard(cardRef.current, t)} className="mt-2 flex min-h-[44px] items-center gap-2 text-[14px] font-semibold text-white/85">
          <Share2 size={16} aria-hidden="true" /> {t.card.share}
        </button>
      </div>,
      { closeTo: '/dashboard' },
    );
  }

  // ── Investment: pick a skill + next match ──
  const latest = state.latest;
  const options = [...SKILLS].sort((a, b) => latest.levels[a] - latest.levels[b]).slice(0, 3);
  return shell(
    <div className="flex flex-1 flex-col">
      <p className="mt-3 text-[13px] font-bold uppercase tracking-[0.12em] text-sun">{t.card.unlocked}</p>
      <h1 className="mt-2 text-[26px] font-extrabold leading-tight">{t.invest.title}</h1>
      <p className="mt-1.5 text-[14px] text-white/75">{t.invest.line}</p>
      <div className="mt-4 flex flex-col gap-2.5" role="radiogroup" aria-label={t.invest.title}>
        {options.map(s => {
          const on = goalSkill === s;
          return (
            <button key={s} type="button" role="radio" aria-checked={on} onClick={() => setGoalSkill(s)}
              className={`flex min-h-[60px] items-center gap-3 rounded-[18px] px-3.5 text-left ${on ? 'bg-[#FFF6D6] text-inkblock ring-[3px] ring-sun' : 'bg-white/10 text-white'}`}>
              <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-[12px] font-extrabold text-inkblock ${SKILL_BAR[s]}`} aria-hidden="true">{t.skills[s][0]}</span>
              <span className="flex-1">
                <span className="block text-[15px] font-bold">{t.skills[s]} · {t.levelShort(latest.levels[s])}</span>
                {s === latest.growFirst && <span className={`block text-[12px] ${on ? 'text-slt' : 'text-white/70'}`}>{t.invest.arjunsPick}</span>}
              </span>
            </button>
          );
        })}
      </div>
      {/* First run already asked for the match day on /welcome. */}
      {!firstRun && (
        <>
      <p className="mt-6 text-[15px] font-bold">{t.invest.matchQ}</p>
      <div className="mt-2 grid grid-cols-3 gap-2" role="radiogroup" aria-label={t.invest.matchQ}>
        {Object.entries(t.invest.match).map(([k, label]) => (
          <button key={k} type="button" role="radio" aria-checked={nextMatch === k} onClick={() => setNextMatch(k)}
            className={`min-h-[48px] rounded-[14px] text-[14px] font-bold ${nextMatch === k ? 'bg-[#FFF6D6] text-inkblock ring-[3px] ring-sun' : 'bg-white/10 text-white'}`}>{label}</button>
        ))}
      </div>
      <p className="mt-2 text-[13px] text-white/70">{t.invest.matchNote}</p>
        </>
      )}
      <div className="flex-1" />
      <button type="button" disabled={!goalSkill || busy} onClick={buildPath} className="mt-6 min-h-[56px] rounded-[18px] bg-sun text-[16px] font-extrabold text-inkblock disabled:opacity-50">{t.invest.build}</button>
      <MatchDaySheet
        open={matchSheet}
        onClose={() => navigate('/train', { replace: true })}
        onSave={async (d) => { await setMatchDay(d); navigate('/train', { replace: true }); }}
      />
    </div>,
  );
}
