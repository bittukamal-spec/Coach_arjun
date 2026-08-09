// Starting-profile service (PR 3). Pure-ish orchestration over an injectable
// Prisma-like client + injectable AI/safety deps, so routes stay thin and
// tests never touch a real DB or the real Anthropic API. Raw OnboardingSession
// answers are never modified here — EXCEPT by `updateProfileAnswers` (PR:
// Performance Check-in), which is the one deliberate, additive, athlete-
// initiated exception, scoped to a narrow whitelist (see below).

const { PrismaClient } = require('@prisma/client');
const { buildRuleOutput, renderSections, groundingAnchors, priorityPhrase } = require('./ruleEngine');
const { generateWording: realGenerateWording } = require('./aiWording');
const { buildFirstMessage } = require('./firstMessage');
const { sanitizeCustomText } = require('../onboarding/sanitize');
const { buildDisplayProfile } = require('./displayProfile');
const { normaliseFocusInput, buildFocusOptions } = require('./currentFocus');
const { checkFocusScope } = require('./focusScope');
const realSafety = require('../services/safety');
const C = require('../onboarding/config');
const { validateAnswers } = require('../onboarding/validate');

const prisma = new PrismaClient();
const CORRECTION_MAX = 120;

function isP2002(e) { return e?.code === 'P2002'; }

function ageFromDob(dob) {
  const birth = new Date(dob); const now = new Date();
  let y = now.getFullYear() - birth.getFullYear();
  const m = now.getMonth() - birth.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < birth.getDate())) y -= 1;
  return y;
}
function consentState(user) {
  const pending = !!(user?.dateOfBirth && !user.guardianConsentAt && ageFromDob(user.dateOfBirth) < 18);
  return { pending, guardianEmailMasked: pending ? maskEmail(user.guardianEmail) : null };
}
function maskEmail(email) {
  if (!email || typeof email !== 'string' || !email.includes('@')) return null;
  const [local, domain] = email.split('@');
  const head = local.slice(0, 1);
  return `${head}${'•'.repeat(Math.max(3, local.length - 1))}@${domain}`;
}

async function getCompletedSession(client, userId) {
  return client.onboardingSession.findFirst({
    where: { userId, status: 'COMPLETED' },
    orderBy: { attemptNumber: 'desc' },
  });
}

// Idempotent create of the profile for the latest completed onboarding attempt.
async function getOrCreateProfile(client, userId) {
  const session = await getCompletedSession(client, userId);
  if (!session) { const e = new Error('ONBOARDING_INCOMPLETE'); e.code = 'ONBOARDING_INCOMPLETE'; throw e; }

  const existing = await client.startingPerformanceProfile.findUnique({ where: { onboardingSessionId: session.id } });
  if (existing) return { profile: existing, session };

  const ruleOutput = buildRuleOutput(session);
  try {
    const profile = await client.startingPerformanceProfile.create({
      data: {
        userId,
        onboardingSessionId: session.id,
        sourceOnboardingVersion: session.onboardingVersion,
        sourceAttemptNumber: session.attemptNumber,
        ruleOutput,
        supportedObservations: ruleOutput.observations,
        suggestedPriorityId: ruleOutput.suggestedPriorityId,
      },
    });
    return { profile, session };
  } catch (e) {
    if (isP2002(e)) {
      const profile = await client.startingPerformanceProfile.findUnique({ where: { onboardingSessionId: session.id } });
      if (profile) return { profile, session };
    }
    throw e;
  }
}

// Minimal, PII-free input for the AI wording layer. No guardian email, DOB,
// user id, account metadata, Mind Journal, chat history, or unrelated memory.
function buildWordingInput(profile, user, language) {
  const ro = profile.ruleOutput;
  return {
    firstName: String(user?.name || '').trim().split(/\s+/)[0] || '',
    sport: ro.sport || '',
    role: ro.role || '',
    observationCodes: (ro.observations || []).map((o) => o.code),
    drafts: renderSections(ro, language),
    // Specifics the rewrite must keep, so warm-but-generic AI wording can be
    // rejected in favour of the (personalised) deterministic drafts.
    anchors: groundingAnchors(ro, language),
    language,
  };
}

async function getOrCreateWording(client, profile, user, language, deps = {}) {
  const lang = language === 'hi' ? 'hi' : 'en';
  const existing = await client.startingProfileWording.findUnique({
    where: { profileId_language: { profileId: profile.id, language: lang } },
  });
  if (existing) return existing;

  const input = buildWordingInput(profile, user, lang);
  const drafts = input.drafts;

  // Safety-screen the only free-text inputs that could reach the AI (name +
  // custom sport). Flagged text is never sent to the model.
  const safety = deps.safety || realSafety;
  const freeText = `${input.firstName} ${input.sport}`.trim();
  const screen = freeText ? safety.screenSafetyText(freeText) : { flagged: false };

  let result;
  if (screen.flagged) {
    result = { sections: drafts, wordingStatus: 'FALLBACK_USED', deterministicFallbackUsed: true };
  } else {
    const generate = deps.generateWording || realGenerateWording;
    result = await generate(input, deps);
  }

  try {
    return await client.startingProfileWording.create({
      data: {
        profileId: profile.id, language: lang, sections: result.sections,
        wordingStatus: result.wordingStatus, deterministicFallbackUsed: result.deterministicFallbackUsed,
      },
    });
  } catch (e) {
    if (isP2002(e)) {
      return client.startingProfileWording.findUnique({ where: { profileId_language: { profileId: profile.id, language: lang } } });
    }
    throw e;
  }
}

// ── Performance Check-in — editable question ids (additive) ────────────────
// Goals/supports/strengths are always reachable and branch-independent.
// Pattern (reaction/effect/duration) follow-up questions are scoped to the
// athlete's OWN already-resolved branch only — `difficult_moments` and
// `primary_priority` (which choose the branch) and sport/role/competition
// level/experience (Settings-owned) are never editable here, so this can
// never reshape which branch the athlete is on or invalidate other answers.
const CHECKIN_ALWAYS_EDITABLE = ['broad_goals', 'four_week_outcome', 'supports', 'strengths'];

// Screen ids for the athlete's own branch (config-driven — no per-branch
// special-casing needed here, same source `buildRuleOutput` already reads).
function branchScreenIds(branchId) {
  return C.config.branches[branchId]?.screenIds || [];
}
function branchQuestionIds(branchId) {
  return branchScreenIds(branchId).flatMap((sid) => C.config.branchScreens[sid]?.questionIds || []);
}

function resolvedBranchId(session) {
  return session.branchId || C.resolveBranch(session.answers || {}) || 'unsure';
}

// Grouped SCREEN ids (not raw question ids) so the client can render each
// section's own titleKey/subtitleKey/question without re-deriving branch
// logic itself.
function checkinScreens(session) {
  const branchId = resolvedBranchId(session);
  return {
    goals: ['broad_goals', 'four_week_outcome'],
    helps: ['supports'],
    strengths: ['strengths'],
    pattern: branchScreenIds(branchId),
  };
}

function checkinEditableQuestionIds(session) {
  const branchId = resolvedBranchId(session);
  return new Set([...CHECKIN_ALWAYS_EDITABLE, ...branchQuestionIds(branchId)]);
}

// Raw current answers for exactly the editable question ids — never any
// other stored answer (sport, role, difficult_moments, etc. are omitted).
function checkinAnswers(session) {
  const editable = checkinEditableQuestionIds(session);
  const answers = session.answers || {};
  const out = {};
  for (const qid of editable) out[qid] = answers[qid] || { answerIds: [] };
  return out;
}

// `focusRow` is the athlete's CurrentCoachingFocus, or null when they have
// never changed focus — the display layer falls back to agreedPriorityId.
// Everything added here is derived from already-stored rows; building it
// cannot regenerate or mutate the frozen profile.
function serializeProfile(profile, wording, user, session, focusRow = null) {
  return {
    profile: {
      sections: wording.sections,
      // ── Additive server-owned presentation object. Existing consumers can
      // ignore it entirely; every field above is unchanged. ──
      displayProfile: buildDisplayProfile({
        profile, session, wording, focusRow, language: wording.language,
      }),
      // Server-authored focus options for the change-focus selector: the
      // athlete's own onboarding areas first, then the remaining approved
      // ones. Labels come from ruleConfig so nothing is duplicated client-side.
      focusOptions: buildFocusOptions({
        ownMomentIds: difficultMoments(session).filter((id) => id !== 'not_sure'),
        language: wording.language,
      }),
      // The athlete's OWN difficult moments — the only values "Not really"
      // may pick from. Ids only; the client resolves labels from the shared
      // onboarding config, so no wording is duplicated across the wire.
      priorityOptions: difficultMoments(session).filter((id) => id !== 'not_sure'),
      language: wording.language,
      wordingStatus: wording.wordingStatus,
      deterministicFallbackUsed: wording.deterministicFallbackUsed,
      suggestedPriorityId: profile.suggestedPriorityId,
      // Conversational phrase for the agreed focus, in the athlete's language.
      // The client renders this inside a sentence; it must never drop the raw
      // onboarding display label ("When the pressure increases") into prose.
      agreedPriorityPhrase: profile.agreedPriorityId
        ? priorityPhrase(profile.agreedPriorityId, wording.language, profile.ruleOutput)
        : null,
      fitResponse: profile.fitResponse,
      correctionSelectedId: profile.correctionSelectedId,
      correctionText: profile.correctionText,
      agreedPriorityId: profile.agreedPriorityId,
      confirmedAt: profile.confirmedAt,
      // Shown on the saved profile view. The profile itself stays frozen —
      // these are read from the existing row, never a reason to regenerate it.
      generatedAt: profile.generatedAt,
      updatedAt: profile.updatedAt,
      firstChatSessionId: profile.firstChatSessionId,
      // ── Performance Check-in (additive) — everything the client needs to
      // render/pre-fill the update flow without duplicating branch logic.
      // Screen ids only (not raw answer labels — those still come from the
      // shared client-side onboarding config, same as onboarding itself).
      checkin: {
        screens: checkinScreens(session),
        answers: checkinAnswers(session),
      },
    },
    consent: consentState(user),
  };
}

// The athlete's own difficult moments (for validating corrections/priorities).
function difficultMoments(session) {
  return session?.answers?.difficult_moments?.answerIds || [];
}

async function confirmProfile(client, userId, body, deps = {}) {
  const { profile, session } = await getOrCreateProfile(client, userId);
  const fit = body?.fit;
  if (!['CONFIRMED', 'PARTLY', 'NOT_REALLY'].includes(fit)) { const e = new Error('INVALID_FIT'); e.code = 'INVALID_FIT'; throw e; }

  const own = difficultMoments(session);
  const inOwn = (id) => !id || own.includes(id);

  let agreedPriorityId = body?.agreedPriorityId || null;
  let correctionSelectedId = body?.correctionSelectedId || null;
  const safety = deps.safety || realSafety;

  // Correction text: sanitize + safety-screen; flagged text is dropped and
  // support guidance is returned instead (raw answers untouched either way).
  let correctionText = null;
  let safetyResult = null;
  if (body?.correctionText) {
    const clean = sanitizeCustomText(body.correctionText, CORRECTION_MAX);
    if (clean) {
      const screen = safety.screenSafetyText(clean);
      if (screen.flagged) {
        safety.recordSafetyEvent(userId, 'profile_correction', screen.category, { riskLevel: screen.riskLevel, sourceType: 'profile_correction' });
        const user = await client.user.findUnique({ where: { id: userId }, select: { language: true } });
        safetyResult = { flagged: true, guidance: safety.getSafetyGuidance(screen.category, user?.language) };
      } else {
        correctionText = clean;
      }
    }
  }

  if (!inOwn(agreedPriorityId) || !inOwn(correctionSelectedId)) { const e = new Error('INVALID_CORRECTION'); e.code = 'INVALID_CORRECTION'; throw e; }

  if (fit === 'CONFIRMED') {
    agreedPriorityId = agreedPriorityId || profile.suggestedPriorityId;
    correctionSelectedId = null;
    correctionText = null;
  } else if (fit === 'NOT_REALLY') {
    // Need a different agreed priority OR a valid (safe) custom correction.
    if (!agreedPriorityId && !correctionText) { const e = new Error('INVALID_CORRECTION'); e.code = 'INVALID_CORRECTION'; throw e; }
    agreedPriorityId = agreedPriorityId || profile.suggestedPriorityId;
  } else {
    // PARTLY
    agreedPriorityId = agreedPriorityId || profile.suggestedPriorityId;
  }

  const updated = await client.startingPerformanceProfile.update({
    where: { id: profile.id },
    data: {
      fitResponse: fit,
      correctionSelectedId,
      correctionText,
      agreedPriorityId,
      confirmedAt: profile.confirmedAt || new Date(),
    },
  });
  return { profile: updated, session, safety: safetyResult };
}

class ChatRace extends Error { constructor() { super('CHAT_RACE'); this.code = 'CHAT_RACE'; } }

// Exactly one first ChatSession + one deterministic assistant Message, ever.
async function startFirstChat(client, userId, deps = {}) {
  const { profile } = await getOrCreateProfile(client, userId);
  if (!profile.fitResponse) { const e = new Error('NOT_CONFIRMED'); e.code = 'NOT_CONFIRMED'; throw e; }
  if (profile.firstChatSessionId) return { chatSessionId: profile.firstChatSessionId };

  const user = await client.user.findUnique({ where: { id: userId }, select: { name: true, language: true } });

  try {
    return await client.$transaction(async (tx) => {
      const p = await tx.startingPerformanceProfile.findUnique({ where: { id: profile.id } });
      if (p.firstChatSessionId) return { chatSessionId: p.firstChatSessionId };

      const chat = await tx.chatSession.create({
        data: { userId, mode: 'main', sessionType: 'general', status: 'active', title: 'First conversation' },
      });
      const content = buildFirstMessage(p, p.ruleOutput, user);
      await tx.message.create({ data: { userId, role: 'assistant', content, chatSessionId: chat.id, sessionType: 'general' } });

      const guard = await tx.startingPerformanceProfile.updateMany({
        where: { id: p.id, firstChatSessionId: null },
        data: { firstChatSessionId: chat.id },
      });
      if (guard.count === 0) throw new ChatRace(); // rolls back this chat+message

      return { chatSessionId: chat.id };
    });
  } catch (e) {
    if (e instanceof ChatRace || e.code === 'CHAT_RACE') {
      const fresh = await client.startingPerformanceProfile.findUnique({ where: { id: profile.id } });
      return { chatSessionId: fresh.firstChatSessionId };
    }
    throw e;
  }
}

// ── Current coaching focus ────────────────────────────────────────────────
// Absent for every existing athlete; read returns null and the display layer
// falls back to the confirmed agreedPriorityId. No backfill.
async function loadCurrentFocus(client, userId) {
  return client.currentCoachingFocus.findUnique({ where: { userId } });
}

// Changes the athlete's present priority. Writes ONLY the focus row: the
// starting profile's ruleOutput, suggestedPriorityId, agreedPriorityId,
// fitResponse and correction history are untouched, and no CoachingCycle,
// Prescription, ChatSession or Message is created, changed or deleted.
//
// Custom text goes through the same sanitise + safety-screen path as a
// profile correction. Flagged text is dropped (the focus is not saved) and
// support guidance is returned instead. Raw athlete text is never logged.
async function updateCurrentFocus(client, userId, body, deps = {}) {
  const safety = deps.safety || realSafety;
  const { focusId, customText } = normaliseFocusInput(body);

  if (customText) {
    // Safety FIRST and independently: crisis/self-harm/abuse text takes the
    // existing support pathway and never reaches the scope check below.
    const screen = safety.screenSafetyText(customText);
    if (screen.flagged) {
      safety.recordSafetyEvent(userId, 'profile_focus', screen.category, {
        riskLevel: screen.riskLevel, sourceType: 'profile_focus',
      });
      const u = await client.user.findUnique({ where: { id: userId }, select: { language: true } });
      return { saved: false, safety: { flagged: true, guidance: safety.getSafetyGuidance(screen.category, u?.language) } };
    }

    // Then product scope: is this a mental-performance focus at all? Nothing is
    // stored on rejection, and only a fixed reason code is available to the
    // caller — never the athlete's words.
    const scope = checkFocusScope(customText);
    if (!scope.inScope) {
      const e = new Error('OUT_OF_SCOPE_FOCUS');
      e.code = 'OUT_OF_SCOPE_FOCUS';
      e.reasonCode = scope.reasonCode;
      throw e;
    }
  }

  const row = await client.currentCoachingFocus.upsert({
    where: { userId },
    create: { userId, focusId, customText, source: 'ATHLETE_SELECTED' },
    update: { focusId, customText, source: 'ATHLETE_SELECTED' },
  });
  return { saved: true, focusRow: row };
}

// ── Performance Check-in — update structured profile answers ───────────────
// The one deliberate, additive exception to "raw answers are never modified"
// at the top of this file: an athlete-initiated refresh of a narrow, server-
// enforced whitelist of question ids (see checkinEditableQuestionIds above).
//
// Reuses the EXACT SAME onboarding validator (`validateAnswers`) onboarding's
// own PATCH /session route uses, including its branch-consistency check — a
// submitted qid that isn't reachable in the athlete's OWN resolved branch is
// rejected the same way it would be during onboarding itself.
//
// After a successful merge, `ruleOutput` is recomputed via the existing,
// pure, deterministic `buildRuleOutput` (no AI, no new StartingProfileWording
// row — the cached wording's prose sections are no longer rendered on the
// redesigned overview, so nothing needs regenerating). `fitResponse`,
// `correctionSelectedId`, `correctionText`, `agreedPriorityId`, `confirmedAt`,
// `generatedAt` and `firstChatSessionId` are all left untouched: this updates
// the SAME row, it does not create a new attempt, a new session, or a new
// profile, and `OnboardingSession.status`/`completedAt` are never touched —
// completing a Check-in cannot make the athlete "new" again.
async function updateProfileAnswers(client, userId, body, deps = {}) {
  const { profile, session } = await getOrCreateProfile(client, userId);
  const payload = body?.answers && typeof body.answers === 'object' ? body.answers : {};
  const editable = checkinEditableQuestionIds(session);

  for (const qid of Object.keys(payload)) {
    if (!editable.has(qid)) {
      const e = new Error('INVALID_QUESTION');
      e.code = 'INVALID_QUESTION';
      e.questionId = qid;
      throw e;
    }
  }

  const merged = { ...(session.answers || {}) };
  for (const [qid, ans] of Object.entries(payload)) merged[qid] = ans;

  const check = validateAnswers(payload, merged);
  if (!check.ok) {
    const e = new Error(check.code);
    e.code = check.code;
    e.questionId = check.questionId;
    throw e;
  }
  for (const [qid, cleaned] of Object.entries(check.cleaned)) merged[qid] = cleaned;

  await client.onboardingSession.update({ where: { id: session.id }, data: { answers: merged } });
  const freshSession = { ...session, answers: merged };

  const ruleOutput = buildRuleOutput(freshSession);
  const updatedProfile = await client.startingPerformanceProfile.update({
    where: { id: profile.id },
    data: {
      ruleOutput,
      supportedObservations: ruleOutput.observations,
      suggestedPriorityId: ruleOutput.suggestedPriorityId,
    },
  });

  return { profile: updatedProfile, session: freshSession };
}

module.exports = {
  prisma, getCompletedSession, getOrCreateProfile, getOrCreateWording, serializeProfile,
  confirmProfile, startFirstChat, consentState, maskEmail, buildWordingInput, difficultMoments,
  loadCurrentFocus, updateCurrentFocus, checkinEditableQuestionIds, checkinScreens, checkinAnswers,
  updateProfileAnswers,
};
