// Starting-profile service (PR 3). Pure-ish orchestration over an injectable
// Prisma-like client + injectable AI/safety deps, so routes stay thin and
// tests never touch a real DB or the real Anthropic API. Raw OnboardingSession
// answers are never modified here.

const { PrismaClient } = require('@prisma/client');
const { buildRuleOutput, renderSections, groundingAnchors } = require('./ruleEngine');
const { generateWording: realGenerateWording } = require('./aiWording');
const { buildFirstMessage } = require('./firstMessage');
const { sanitizeCustomText } = require('../onboarding/sanitize');
const realSafety = require('../services/safety');

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

function serializeProfile(profile, wording, user, session) {
  return {
    profile: {
      sections: wording.sections,
      // The athlete's OWN difficult moments — the only values "Not really"
      // may pick from. Ids only; the client resolves labels from the shared
      // onboarding config, so no wording is duplicated across the wire.
      priorityOptions: difficultMoments(session).filter((id) => id !== 'not_sure'),
      language: wording.language,
      wordingStatus: wording.wordingStatus,
      deterministicFallbackUsed: wording.deterministicFallbackUsed,
      suggestedPriorityId: profile.suggestedPriorityId,
      fitResponse: profile.fitResponse,
      correctionSelectedId: profile.correctionSelectedId,
      correctionText: profile.correctionText,
      agreedPriorityId: profile.agreedPriorityId,
      confirmedAt: profile.confirmedAt,
      firstChatSessionId: profile.firstChatSessionId,
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

module.exports = {
  prisma, getCompletedSession, getOrCreateProfile, getOrCreateWording, serializeProfile,
  confirmProfile, startFirstChat, consentState, maskEmail, buildWordingInput, difficultMoments,
};
