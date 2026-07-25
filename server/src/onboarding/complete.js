// Onboarding completion: compatibility mirror + transactional finalisation.
// Turns the raw structured answers into the legacy denormalised User fields so
// everything already reading User (chat prompt, starter-plan generator,
// profile display) keeps working — WITHOUT generating any interpretation,
// score, label, or prescription (that is PR 3). The completed session row is
// left immutable as the historical raw record.

const C = require('./config');

// Fields returned to the client after completion (mirrors auth SAFE_SELECT).
const USER_SELECT = {
  id: true, email: true, name: true, avatar: true,
  tier: true, language: true, trialStarted: true,
  sport: true, experienceLevel: true, goals: true, onboardingDone: true,
  competitionLevel: true, primaryChallenge: true, pressureResponse: true, position: true,
  xp: true, createdAt: true, age: true, profileIntro: true,
  subscriptionPlanType: true, subscriptionStartDate: true,
  cueWord: true, cueArousalState: true,
  dateOfBirth: true, guardianEmail: true, guardianConsentAt: true,
};

function firstId(answers, qid) {
  return answers?.[qid]?.answerIds?.[0];
}
function customText(answers, qid) {
  return answers?.[qid]?.customText || '';
}

// Pure: derive the legacy User fields from the raw answers. Never stores
// interpretation — only the athlete's own selections, mapped for compatibility.
function buildUserMirror(answers) {
  const sportId = firstId(answers, 'sport');
  const sport = sportId === 'other' ? customText(answers, 'sport') : sportId || null;

  const roleId = firstId(answers, 'role_position');
  let position = '';
  if (roleId === 'different') position = customText(answers, 'role_position');
  else if (roleId) position = C.config.rolePositionToText[roleId] ?? '';

  const compId = firstId(answers, 'competition_level');
  const competitionLevel = compId === 'other' ? customText(answers, 'competition_level') : compId || null;

  const experienceLevel = firstId(answers, 'experience_level') || null;

  const goals = JSON.stringify(answers?.broad_goals?.answerIds || []);

  const priorityId = firstId(answers, 'primary_priority');
  const primaryChallenge = priorityId ? (C.config.priorityToPrimaryChallenge[priorityId] || null) : null;

  return { sport, position, competitionLevel, experienceLevel, goals, primaryChallenge, onboardingDone: true };
}

class RevisionConflict extends Error {
  constructor() {
    super('STALE_CONFLICT');
    this.code = 'STALE_CONFLICT';
  }
}

// Transactional completion. Guarded by the session revision so a concurrent
// PATCH can't slip in. Returns { user, session }. Fires the existing starter-
// plan generator AFTER commit (fire-and-forget) — a plan failure never blocks
// completion, and it can only run once because the IN_PROGRESS→COMPLETED
// transition is itself single-shot.
async function completeOnboarding(prisma, session, { ensureStarterPlan } = {}) {
  const mirror = buildUserMirror(session.answers || {});

  const result = await prisma.$transaction(async (tx) => {
    const guard = await tx.onboardingSession.updateMany({
      where: { id: session.id, status: 'IN_PROGRESS', revision: session.revision },
      data: { status: 'COMPLETED', completedAt: new Date(), revision: { increment: 1 } },
    });
    if (guard.count === 0) throw new RevisionConflict();

    const user = await tx.user.update({
      where: { id: session.userId },
      data: mirror,
      select: USER_SELECT,
    });

    await tx.activeOnboardingSession.deleteMany({
      where: { userId: session.userId, onboardingVersion: session.onboardingVersion },
    });

    const updated = await tx.onboardingSession.findUnique({ where: { id: session.id } });
    return { user, session: updated };
  });

  // Fire-and-forget starter-plan generation (unchanged behaviour) — outside the
  // transaction so a failure cannot roll back a completed onboarding.
  const gen = ensureStarterPlan || safeStarterPlan;
  Promise.resolve()
    .then(() => gen(session.userId))
    .catch((e) => console.error('[onboarding] starter plan generation failed:', e?.message));

  return result;
}

function safeStarterPlan(userId) {
  // Lazily required so tests can run without the planGenerator's Prisma client.
  const { ensureStarterPlan } = require('../services/planGenerator');
  return ensureStarterPlan(userId);
}

module.exports = { buildUserMirror, completeOnboarding, RevisionConflict, USER_SELECT };
