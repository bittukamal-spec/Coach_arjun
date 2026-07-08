// Rule-based starter-plan generator (Prompt 1 of the coach-led redesign).
// Takes the User row (existing flat onboarding fields — no new profile
// model) and returns a 5-session plan built ONLY from tools that already
// exist and work today. No AI call — deterministic, cheap, and safe to run
// automatically after onboarding or lazily from GET /api/plan/current.
//
// Deliberately excluded from the default starter plan for now:
// - Visualization (kept in the app, slated for its own redesign)
// - Focus Lock (reached through the Focus Words skill path instead)

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

// The only tools a plan session may point at. Routes must stay in sync with
// client/src/constants/activeTools.js — never point a session at a retired
// route (no Before You Play, no Bounce Back, no /breathing).
const PLAN_TOOLS = {
  pressure_reset: {
    toolId: 'pressure_reset',
    label: 'Pressure Reset',
    route: '/body-reset',
    skillKey: 'pressure_control',
    duration: 3,
    outputType: 'reset_phrase',
  },
  focus_words: {
    toolId: 'focus_words',
    label: 'Focus Words',
    route: '/skills/focus-self-talk',
    skillKey: 'focus_clarity',
    duration: 3,
    outputType: 'focus_word',
  },
  focus_card_builder: {
    toolId: 'focus_card_builder',
    label: 'Focus Card Builder',
    route: '/self-talk',
    skillKey: 'confidence_self_talk',
    duration: 5,
    outputType: 'focus_card',
  },
  reset_rally: {
    toolId: 'reset_rally',
    label: 'Reset Rally',
    route: '/games/reset-rally',
    skillKey: 'mistake_recovery',
    duration: 4,
    outputType: 'game_report',
  },
  reflect_like_an_athlete: {
    toolId: 'reflect_like_an_athlete',
    label: 'Reflect Like an Athlete',
    route: '/debrief',
    skillKey: 'reflection',
    duration: 4,
    outputType: 'reflection',
  },
  focus_deck: {
    toolId: 'focus_deck',
    label: 'Focus Deck',
    route: '/focus-deck',
    skillKey: 'confidence_self_talk',
    duration: 3,
    outputType: 'focus_card_practice',
  },
};

const SKILL_LABELS = {
  pressure_control:     'Pressure control',
  focus_clarity:        'Focus',
  confidence_self_talk: 'Confident self-talk',
  mistake_recovery:     'Mistake recovery',
  reflection:           'Reflection',
};

// ── Challenge → plan shape ──────────────────────────────────────────────────
// Keyed by the existing User.primaryChallenge enum values
// ("nerves" | "failure" | "focus" | "family_pressure" | "injury" | "consistency"),
// with goals + pressureResponse as tie-breakers. Each shape lists tool ids
// in session order.

function pickPlanShape(user) {
  const challenge = user.primaryChallenge || '';
  const goals = safeGoals(user.goals);
  const strugglesWithPressure = user.pressureResponse === 'struggles' || user.pressureResponse === 'unaware';

  // Confidence / fear of failure → build the Focus Card first
  if (challenge === 'failure' || goals.includes('confidence')) {
    return {
      key: 'confidence',
      order: ['focus_card_builder', 'focus_words', 'pressure_reset', 'reset_rally', 'reflect_like_an_athlete'],
      primary: 'confidence_self_talk',
      secondary: 'focus_clarity',
      noteEn: (sport) => `You told me self-belief is the fight right now. We'll build your own Focus Card first, then train the focus and reset skills around it${sport ? ` for ${sport}` : ''}.`,
      reason: 'Primary challenge points at confidence and fear of failure.',
    };
  }

  // Focus / overthinking → Focus Words first
  if (challenge === 'focus' || goals.includes('focus')) {
    return {
      key: 'focus',
      order: ['focus_words', 'pressure_reset', 'focus_card_builder', 'reset_rally', 'reflect_like_an_athlete'],
      primary: 'focus_clarity',
      secondary: 'pressure_control',
      noteEn: (sport) => `You told me focus slips when it matters. We'll start by finding your Focus Word, then train keeping your body steady around it${sport ? ` in ${sport}` : ''}.`,
      reason: 'Primary challenge points at focus and overthinking.',
    };
  }

  // Mistake recovery / resilience → Reset Rally first
  if (goals.includes('resilience')) {
    return {
      key: 'mistake_recovery',
      order: ['reset_rally', 'pressure_reset', 'focus_words', 'focus_card_builder', 'reflect_like_an_athlete'],
      primary: 'mistake_recovery',
      secondary: 'pressure_control',
      noteEn: (sport) => `You told me one mistake tends to snowball. We'll train the reset first — so the next action stays clean${sport ? ` in ${sport}` : ''}.`,
      reason: 'Goals point at bouncing back after mistakes.',
    };
  }

  // Consistency / learning → bring Reflection in early
  if (challenge === 'consistency') {
    return {
      key: 'consistency',
      order: ['pressure_reset', 'reflect_like_an_athlete', 'focus_words', 'focus_card_builder', 'reset_rally'],
      primary: 'reflection',
      secondary: 'focus_clarity',
      noteEn: (sport) => `You told me consistency is the gap. We'll steady the body first, then build the habit of learning from every session${sport ? ` of ${sport}` : ''}.`,
      reason: 'Primary challenge points at consistency — reflection comes in early.',
    };
  }

  // Default: nerves / family pressure / injury / struggles with pressure
  return {
    key: 'pressure',
    order: ['pressure_reset', 'focus_words', 'focus_card_builder', 'reset_rally', 'reflect_like_an_athlete'],
    primary: 'pressure_control',
    secondary: 'focus_clarity',
    noteEn: (sport) => strugglesWithPressure
      ? `You told me pressure hits your body first. We'll train a quick reset before anything else, then build your Focus Word on top of it${sport ? ` for ${sport}` : ''}.`
      : `We'll start with steadying your body under pressure, then build your Focus Word and Focus Card on top of it${sport ? ` for ${sport}` : ''}.`,
    reason: 'Default pressure-first plan (nerves / pressure response / no clearer signal).',
  };
}

function safeGoals(goalsJson) {
  try {
    const parsed = JSON.parse(goalsJson || '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

// ── Sport/position-personalized session titles ──────────────────────────────
// Kept simple and athlete-first. Falls back to a generic title when sport is
// unknown. Titles are stored in English for MVP (see Prompt 1 report note).

function sessionTitle(toolId, user) {
  const sport = (user.sport || '').toLowerCase();
  const position = (user.position || '').trim();

  switch (toolId) {
    case 'pressure_reset':
      if (sport === 'cricket')   return 'Slow the Rush Between Balls';
      if (sport === 'football')  return 'Slow the Rush';
      if (sport === 'badminton') return 'Calm the Body Between Points';
      if (sport === 'athletics') return 'Settle Before the Start';
      return 'Steady Your Body Under Pressure';
    case 'focus_words':
      if (sport === 'cricket')   return 'Find Your Next-Ball Focus Word';
      if (sport === 'football')  return 'Find Your Match Focus Word';
      if (sport === 'badminton') return 'Find Your Next-Point Focus Word';
      if (sport === 'athletics') return 'Find Your Race Focus Word';
      return 'Find Your Focus Word';
    case 'focus_card_builder':
      if (position)              return `Build Your ${capitalize(position)} Focus Card`;
      if (sport)                 return `Build Your ${capitalize(sport)} Focus Card`;
      return 'Build Your Focus Card';
    case 'reset_rally':
      if (sport === 'cricket')   return 'Reset After a Bad Over';
      if (sport === 'football')  return 'Reset After a Mistake';
      if (sport === 'badminton') return 'Reset After the Rally';
      if (sport === 'athletics') return 'Reset After a Bad Rep';
      return 'Reset After a Mistake';
    case 'reflect_like_an_athlete':
      return 'Reflect Like an Athlete';
    case 'focus_deck':
      return 'Practise Your Focus Cards';
    default:
      return PLAN_TOOLS[toolId]?.label || 'Mental Rep';
  }
}

function sessionReason(toolId, user, shapeKey) {
  const challengeText = {
    nerves: 'you said nerves show up before you play',
    failure: 'you said fear of failure gets loud',
    focus: 'you said focus slips during play',
    family_pressure: 'you said outside pressure weighs on you',
    injury: 'you said coming back from injury is on your mind',
    consistency: 'you said consistency is the gap',
  }[user.primaryChallenge] || 'of what you told me at onboarding';

  switch (toolId) {
    case 'pressure_reset':          return `Because ${challengeText} — a steady body comes before a clear mind.`;
    case 'focus_words':             return `A short Focus Word gives your mind one place to return to when it drifts.`;
    case 'focus_card_builder':      return shapeKey === 'confidence'
      ? `Because ${challengeText} — your own words beat borrowed motivation.`
      : `Turning your pressure thoughts into your own words locks the skill in.`;
    case 'reset_rally':             return `Practising the reset in a game makes it automatic when a real mistake happens.`;
    case 'reflect_like_an_athlete': return `One honest takeaway per session is how athletes actually improve.`;
    case 'focus_deck':              return `Reviewing your saved Focus Cards keeps the words sharp for match day.`;
    default: return null;
  }
}

function coachInstruction(toolId) {
  switch (toolId) {
    case 'pressure_reset':          return 'Do one full reset. Notice where your body holds tension before and after.';
    case 'focus_words':             return 'Go through the short learn path and pick a Focus Word you would actually say mid-game.';
    case 'focus_card_builder':      return 'Use a real pressure moment from your sport — not a made-up one.';
    case 'reset_rally':             return 'Play one round. Pick the reset thought first, then the next action.';
    case 'reflect_like_an_athlete': return 'Review your most recent session or match. One takeaway is enough.';
    case 'focus_deck':              return 'Read each card out loud once. Pick one for your next session.';
    default: return null;
  }
}

function capitalize(s) {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
}

// ── Public: build the plan payload (pure — no DB writes) ───────────────────

function buildStarterPlan(user) {
  const shape = pickPlanShape(user);
  const sport = user.sport ? capitalize(user.sport) : null;

  const sessions = shape.order.map((toolId, i) => {
    const tool = PLAN_TOOLS[toolId];
    return {
      sessionNumber: i + 1,
      title: sessionTitle(toolId, user),
      toolId: tool.toolId,
      toolRoute: tool.route,
      skillKey: tool.skillKey,
      durationMinutes: tool.duration,
      status: i === 0 ? 'today' : 'locked',
      personalizedReason: sessionReason(toolId, user, shape.key),
      coachInstruction: coachInstruction(toolId),
      outputType: tool.outputType,
    };
  });

  return {
    planType: 'starter',
    title: sport ? `${sport} Starter Plan` : 'Your Starter Plan',
    primarySkillFocus: shape.primary,
    secondarySkillFocus: shape.secondary,
    coachNote: shape.noteEn(user.sport || ''),
    generatedReason: shape.reason,
    source: 'onboarding',
    profileSnapshot: {
      sport: user.sport || null,
      position: user.position || null,
      experienceLevel: user.experienceLevel || null,
      competitionLevel: user.competitionLevel || null,
      primaryChallenge: user.primaryChallenge || null,
      pressureResponse: user.pressureResponse || null,
      goals: safeGoals(user.goals),
    },
    sessions,
  };
}

// ── Public: idempotent create ───────────────────────────────────────────────
// Safe to call from both the onboarding save (fire-and-forget) and
// GET /api/plan/current (lazy backfill for existing users): it re-checks for
// an active starter plan right before creating. The check-then-create window
// is tiny; if a rare race ever produces two, /current reads the newest.

async function ensureStarterPlan(userId) {
  const existing = await prisma.plan.findFirst({
    where: { userId, planType: 'starter', status: 'active' },
    orderBy: { createdAt: 'desc' },
    include: { sessions: { orderBy: { sessionNumber: 'asc' } } },
  });
  if (existing) return existing;

  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user || !user.onboardingDone) return null;

  const payload = buildStarterPlan(user);
  const { sessions, ...planFields } = payload;

  return prisma.plan.create({
    data: {
      userId,
      ...planFields,
      sessions: { create: sessions },
    },
    include: { sessions: { orderBy: { sessionNumber: 'asc' } } },
  });
}

module.exports = { PLAN_TOOLS, SKILL_LABELS, buildStarterPlan, ensureStarterPlan };
