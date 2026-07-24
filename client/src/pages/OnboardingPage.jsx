import { useEffect } from 'react';
import { useNavigate, Navigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { translations } from '../i18n/translations';
import { apiFetch } from '../api';
import {
  OnboardingShell,
  SelectableOption,
  OptionGrid,
  CustomAnswerField,
} from '../components/onboarding';
import { useOnboardingDraft } from '../hooks/useOnboardingDraft';
import { sanitizeCustomText, isValidCustomText, DEFAULT_CUSTOM_MAX } from '../utils/sanitizeCustomText';

// ─── Onboarding (PR 1 foundation) ───────────────────────────────────────────
// Theme-aware, mobile-first onboarding built on the shared onboarding
// component system. Five screens across three stable stages. All answers
// map onto EXISTING User fields via the unchanged
// PATCH /api/auth/me/onboarding endpoint — no schema change, no AI, no
// adaptive branching (those are PR 2 / PR 3). The starting-profile + first
// chat transition is PR 3, so the post-submit destination is deliberately
// left as /mind-journal for now.

const CUSTOM_MAX = DEFAULT_CUSTOM_MAX;

// ── Screens & stages ────────────────────────────────────────────────────────
const SCREENS = ['sport', 'role', 'context', 'starting', 'goals'];
const STAGE_OF = {
  sport: 'about',
  role: 'about',
  context: 'performance',
  starting: 'performance',
  goals: 'goals',
};

// Option data lives HERE (page logic), never inside the shared components.
// Display labels resolve through translation keys so both themes/languages
// share one structure.

const SPORTS = [
  { value: 'cricket',   icon: '🏏', labelKey: 'sportCricket' },
  { value: 'football',  icon: '⚽', labelKey: 'sportFootball' },
  { value: 'badminton', icon: '🏸', labelKey: 'sportBadminton' },
  { value: 'athletics', icon: '🏃', labelKey: 'sportAthletics' },
  { value: 'wrestling', icon: '🤼', labelKey: 'sportWrestling' },
  { value: 'boxing',    icon: '🥊', labelKey: 'sportBoxing' },
  { value: 'kabaddi',   icon: '🤸', labelKey: 'sportKabaddi' },
  { value: 'tennis',    icon: '🎾', labelKey: 'sportTennis' },
  { value: 'hockey',    icon: '🏑', labelKey: 'sportHockey' },
  { value: 'swimming',  icon: '🏊', labelKey: 'sportSwimming' },
  { value: 'other',     icon: '🏅', labelKey: 'sportOtherLabel' },
];

// Small, maintainable set of sport-relevant role examples. Sports not listed
// simply show the fixed options + custom — no large role database.
const ROLE_SETS = {
  cricket:   ['batter', 'bowler', 'allRounder', 'wicketkeeper'],
  football:  ['goalkeeper', 'defender', 'midfielder', 'forward'],
  hockey:    ['goalkeeper', 'defender', 'midfielder', 'forward'],
  badminton: ['singles', 'doubles', 'both'],
  tennis:    ['singles', 'doubles', 'both'],
};
const ROLE_LABEL_KEY = {
  batter: 'roleBatter', bowler: 'roleBowler', allRounder: 'roleAllRounder', wicketkeeper: 'roleWicketkeeper',
  goalkeeper: 'roleGoalkeeper', defender: 'roleDefender', midfielder: 'roleMidfielder', forward: 'roleForward',
  singles: 'roleSingles', doubles: 'roleDoubles', both: 'roleBoth',
  none: 'roleNone', unsure: 'roleUnsure', different: 'roleDifferent',
};
// Canonical English strings written to the free-text User.position field.
// 'unsure' stores nothing meaningful (empty) so it never pollutes coaching
// context downstream; 'different' stores the sanitised custom text.
const ROLE_STORE = {
  batter: 'Batter', bowler: 'Bowler', allRounder: 'All-rounder', wicketkeeper: 'Wicketkeeper',
  goalkeeper: 'Goalkeeper', defender: 'Defender', midfielder: 'Midfielder', forward: 'Forward',
  singles: 'Singles', doubles: 'Doubles', both: 'Singles and doubles',
  none: 'No fixed role', unsure: '',
};

const COMPETITION = [
  { value: 'recreational',  icon: '🌱', labelKey: 'compRecreational' },
  { value: 'local',         icon: '🏅', labelKey: 'compLocal' },
  { value: 'state',         icon: '🥈', labelKey: 'compState' },
  { value: 'national',      icon: '🥇', labelKey: 'compNational' },
  { value: 'international',  icon: '🌍', labelKey: 'compInternational' },
  { value: 'other',         icon: '➕', labelKey: 'compOtherLabel' },
];

// Fixed enum — must match the server's validLevels; no custom value allowed.
const LEVELS = [
  { value: 'beginner',     icon: '🌱', labelKey: 'levelBeginner',     descKey: 'levelBeginnerDesc' },
  { value: 'amateur',      icon: '🏫', labelKey: 'levelAmateur',      descKey: 'levelAmateurDesc' },
  { value: 'competitive',  icon: '🥈', labelKey: 'levelCompetitive',  descKey: 'levelCompetitiveDesc' },
  { value: 'professional', icon: '🏆', labelKey: 'levelProfessional', descKey: 'levelProfessionalDesc' },
];

// Values map to the existing primaryChallenge enum ('different' → custom text).
const CHALLENGES = [
  { value: 'nerves',          icon: '😰', labelKey: 'startNerves' },
  { value: 'failure',         icon: '😔', labelKey: 'startFailure' },
  { value: 'focus',           icon: '🎯', labelKey: 'startFocus' },
  { value: 'family_pressure', icon: '🎓', labelKey: 'startPressure' },
  { value: 'injury',          icon: '🩹', labelKey: 'startInjury' },
  { value: 'consistency',     icon: '🔁', labelKey: 'startConsistency' },
  { value: 'different',       icon: '✏️', labelKey: 'startDifferent' },
];

// Fixed enum — must match the server's validGoals; no custom goal in PR 1.
const GOALS = [
  { value: 'focus',         icon: '🎯', labelKey: 'goalFocus' },
  { value: 'pressure',      icon: '💪', labelKey: 'goalPressure' },
  { value: 'nerves',        icon: '😰', labelKey: 'goalNerves' },
  { value: 'confidence',    icon: '⭐', labelKey: 'goalConfidence' },
  { value: 'resilience',    icon: '🔄', labelKey: 'goalResilience' },
  { value: 'motivation',    icon: '🔥', labelKey: 'goalMotivation' },
  { value: 'communication', icon: '🤝', labelKey: 'goalCommunication' },
  { value: 'injury',        icon: '🏥', labelKey: 'goalInjury' },
];

const MAX_GOALS = 3;

const INITIAL_DATA = {
  screen: 0,
  sportChoice: '',      sportCustom: '',
  roleChoice: '',       roleCustom: '',
  competitionChoice: '', competitionCustom: '',
  experienceLevel: '',
  challengeChoice: '',  challengeCustom: '',
  goals: [],
  error: '',
  submitting: false,
};

// ── Per-screen Continue validation (pure) ───────────────────────────────────
function canContinue(screen, d) {
  switch (screen) {
    case 'sport':
      return d.sportChoice !== '' && (d.sportChoice !== 'other' || isValidCustomText(d.sportCustom, CUSTOM_MAX));
    case 'role':
      return d.roleChoice !== '' && (d.roleChoice !== 'different' || isValidCustomText(d.roleCustom, CUSTOM_MAX));
    case 'context':
      return (
        d.competitionChoice !== '' &&
        (d.competitionChoice !== 'other' || isValidCustomText(d.competitionCustom, CUSTOM_MAX)) &&
        d.experienceLevel !== ''
      );
    case 'starting':
      return d.challengeChoice !== '' && (d.challengeChoice !== 'different' || isValidCustomText(d.challengeCustom, CUSTOM_MAX));
    case 'goals':
      return d.goals.length >= 1;
    default:
      return false;
  }
}

// ── Derive the submit payload from the draft (pure) ─────────────────────────
function buildPayload(d, language) {
  const sport = d.sportChoice === 'other' ? sanitizeCustomText(d.sportCustom, CUSTOM_MAX) : d.sportChoice;
  const position =
    d.roleChoice === 'different'
      ? sanitizeCustomText(d.roleCustom, CUSTOM_MAX)
      : (ROLE_STORE[d.roleChoice] ?? '');
  const competitionLevel =
    d.competitionChoice === 'other' ? sanitizeCustomText(d.competitionCustom, CUSTOM_MAX) : d.competitionChoice;
  const primaryChallenge =
    d.challengeChoice === 'different' ? sanitizeCustomText(d.challengeCustom, CUSTOM_MAX) : d.challengeChoice;

  return {
    sport,
    position,
    competitionLevel,
    experienceLevel: d.experienceLevel,
    primaryChallenge,
    goals: d.goals,
    language,
  };
}

function OnboardingPage() {
  const { user, token, language, updateUser } = useAuth();
  const navigate = useNavigate();
  const t = translations[language].onboarding;

  const userId = user?.id;
  const { data, setData, clearDraft } = useOnboardingDraft(userId, INITIAL_DATA);

  // Clear any stale draft the moment onboarding is already complete (also
  // covers the completed-user guard render below).
  useEffect(() => {
    if (user?.onboardingDone) clearDraft();
  }, [user?.onboardingDone, clearDraft]);

  const update = (patch) => setData((d) => ({ ...d, ...patch }));

  const screenIndex = Math.min(data.screen ?? 0, SCREENS.length - 1);
  const screen = SCREENS[screenIndex];
  const isLast = screenIndex === SCREENS.length - 1;

  const STAGES = [
    { key: 'about',       label: t.stageAbout },
    { key: 'performance', label: t.stagePerformance },
    { key: 'goals',       label: t.stageGoals },
  ];

  function goBack() {
    if (screenIndex > 0) update({ screen: screenIndex - 1, error: '' });
  }

  function handleContinue() {
    if (!canContinue(screen, data)) return;
    if (isLast) {
      handleSubmit();
    } else {
      update({ screen: screenIndex + 1, error: '' });
    }
  }

  async function handleSubmit() {
    update({ submitting: true, error: '' });
    try {
      const res = await apiFetch('/api/auth/me/onboarding', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(buildPayload(data, language)),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || t.submitError);
      }
      const { user: updated } = await res.json();
      updateUser(updated);
      clearDraft();
      // PR 1 keeps the existing post-onboarding destination. The starting
      // profile + first personalised chat transition is PR 3.
      navigate('/mind-journal', { replace: true, state: { fromOnboarding: true } });
    } catch (err) {
      // Keep the draft so the athlete can retry without re-answering.
      update({ submitting: false, error: err.message || t.submitError });
    }
  }

  function toggleGoal(value) {
    setData((d) => {
      const has = d.goals.includes(value);
      if (has) return { ...d, goals: d.goals.filter((g) => g !== value) };
      if (d.goals.length >= MAX_GOALS) return d;
      return { ...d, goals: [...d.goals, value] };
    });
  }

  // ── Completed-user guard ──────────────────────────────────────────────────
  // A user who already finished onboarding must not be able to reopen the
  // form (directly navigating to /onboarding) and silently overwrite their
  // saved profile. Kept local to this page.
  if (user?.onboardingDone) {
    return <Navigate to="/mind-journal" replace />;
  }

  // ── Per-screen content ────────────────────────────────────────────────────
  let heading = '';
  let subcopy = '';
  let liveMessage = '';
  let content = null;

  if (screen === 'sport') {
    heading = t.sportTitle;
    subcopy = t.sportSubtitle;
    content = (
      <>
        <div className="mb-5 rounded-2xl border border-brand-500/30 bg-brand-500/10 px-4 py-3">
          <p className="text-caption text-slt leading-relaxed">{t.aiDisclosure}</p>
        </div>
        <OptionGrid layout="grid" ariaLabel={t.sportTitle}>
          {SPORTS.map((s) => (
            <SelectableOption
              key={s.value}
              icon={s.icon}
              label={t[s.labelKey]}
              oneLine
              selected={data.sportChoice === s.value}
              onSelect={() => update({ sportChoice: s.value })}
            />
          ))}
        </OptionGrid>
        {data.sportChoice === 'other' && (
          <CustomAnswerField
            id="sport-custom"
            label={t.sportCustomLabel}
            placeholder={t.sportCustomPlaceholder}
            value={data.sportCustom}
            maxLength={CUSTOM_MAX}
            onChange={(v) => update({ sportCustom: v })}
          />
        )}
      </>
    );
  } else if (screen === 'role') {
    heading = t.roleTitle;
    subcopy = t.roleSubtitle;
    const roleKeys = [...(ROLE_SETS[data.sportChoice] || []), 'none', 'unsure', 'different'];
    content = (
      <>
        <OptionGrid layout="stack" ariaLabel={t.roleTitle}>
          {roleKeys.map((key) => (
            <SelectableOption
              key={key}
              label={t[ROLE_LABEL_KEY[key]]}
              selected={data.roleChoice === key}
              onSelect={() => update({ roleChoice: key })}
            />
          ))}
        </OptionGrid>
        {data.roleChoice === 'different' && (
          <CustomAnswerField
            id="role-custom"
            label={t.roleCustomLabel}
            placeholder={t.roleCustomPlaceholder}
            value={data.roleCustom}
            maxLength={CUSTOM_MAX}
            onChange={(v) => update({ roleCustom: v })}
          />
        )}
      </>
    );
  } else if (screen === 'context') {
    heading = t.contextTitle;
    subcopy = t.contextSubtitle;
    content = (
      <>
        <h2 className="text-body font-semibold text-ink mb-3">{t.competitionGroupLabel}</h2>
        <OptionGrid layout="stack" ariaLabel={t.competitionGroupLabel}>
          {COMPETITION.map((c) => (
            <SelectableOption
              key={c.value}
              icon={c.icon}
              label={t[c.labelKey]}
              selected={data.competitionChoice === c.value}
              onSelect={() => update({ competitionChoice: c.value })}
            />
          ))}
        </OptionGrid>
        {data.competitionChoice === 'other' && (
          <CustomAnswerField
            id="competition-custom"
            label={t.compCustomLabel}
            placeholder={t.compCustomPlaceholder}
            value={data.competitionCustom}
            maxLength={CUSTOM_MAX}
            onChange={(v) => update({ competitionCustom: v })}
          />
        )}
        <h2 className="text-body font-semibold text-ink mb-3 mt-7">{t.experienceGroupLabel}</h2>
        <OptionGrid layout="stack" ariaLabel={t.experienceGroupLabel}>
          {LEVELS.map((l) => (
            <SelectableOption
              key={l.value}
              icon={l.icon}
              label={t[l.labelKey]}
              sublabel={t[l.descKey]}
              selected={data.experienceLevel === l.value}
              onSelect={() => update({ experienceLevel: l.value })}
            />
          ))}
        </OptionGrid>
      </>
    );
  } else if (screen === 'starting') {
    heading = t.startTitle;
    subcopy = t.startSubtitle;
    content = (
      <>
        <OptionGrid layout="stack" ariaLabel={t.startTitle}>
          {CHALLENGES.map((c) => (
            <SelectableOption
              key={c.value}
              icon={c.icon}
              label={t[c.labelKey]}
              selected={data.challengeChoice === c.value}
              onSelect={() => update({ challengeChoice: c.value })}
            />
          ))}
        </OptionGrid>
        {data.challengeChoice === 'different' && (
          <CustomAnswerField
            id="challenge-custom"
            label={t.startCustomLabel}
            placeholder={t.startCustomPlaceholder}
            value={data.challengeCustom}
            maxLength={CUSTOM_MAX}
            onChange={(v) => update({ challengeCustom: v })}
          />
        )}
      </>
    );
  } else if (screen === 'goals') {
    heading = t.goalsTitle;
    subcopy = t.goalsSubtitle;
    const count = data.goals.length;
    const maxed = count >= MAX_GOALS;
    liveMessage = maxed ? t.goalsMaxReached(MAX_GOALS) : t.goalsCounter(count, MAX_GOALS);
    content = (
      <>
        <p className="mb-3 text-caption font-semibold text-slt">{t.goalsCounter(count, MAX_GOALS)}</p>
        <OptionGrid layout="stack" multi ariaLabel={t.goalsTitle}>
          {GOALS.map((g) => {
            const selected = data.goals.includes(g.value);
            return (
              <SelectableOption
                key={g.value}
                icon={g.icon}
                label={t[g.labelKey]}
                multi
                selected={selected}
                disabled={maxed && !selected}
                onSelect={() => toggleGoal(g.value)}
              />
            );
          })}
        </OptionGrid>
      </>
    );
  }

  const footer = (
    <div>
      {data.error && (
        <div
          role="alert"
          className="mb-3 rounded-xl border border-dark-600 bg-dark-800 px-4 py-3 text-caption text-alert"
        >
          {data.error}
        </div>
      )}
      <button
        type="button"
        onClick={handleContinue}
        disabled={!canContinue(screen, data) || data.submitting}
        className="btn-primary w-full justify-center py-4 text-base disabled:opacity-40"
      >
        {data.submitting ? t.saving : isLast ? t.finish : t.continue}
      </button>
    </div>
  );

  return (
    <OnboardingShell
      screenKey={screen}
      stages={STAGES}
      currentStageKey={STAGE_OF[screen]}
      progressLabel={t.progressLabel}
      backLabel={t.back}
      onBack={goBack}
      canGoBack={screenIndex > 0}
      heading={heading}
      subcopy={subcopy}
      liveMessage={liveMessage}
      footer={footer}
    >
      {content}
    </OnboardingShell>
  );
}

export default OnboardingPage;
