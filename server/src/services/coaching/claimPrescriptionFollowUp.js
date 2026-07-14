// Deterministic next-open prescription follow-up opener (PR-11).
//
// When an athlete genuinely re-enters the main coaching chat with an
// ACTIVE prescription, this claims — at most once, ever — a single
// deterministic opener message asking how the practice went. No Anthropic
// call is made here, the athlete's outcome is not captured yet, and the
// coaching cycle/prescription is never resolved, abandoned, or superseded
// by this module — it only ever claims the follow-up opener and persists
// the one assistant Message.
//
// Atomicity: the claim is a conditional updateMany (WHERE
// followUpOpenerClaimedAt IS NULL) run inside a single transaction, so
// concurrent tabs/requests race at the database row-lock level — exactly
// one updateMany call sees count 1 (the winner); every other concurrent
// call sees count 0 and returns { claimed: false } without writing
// anything. If the message create fails afterward, the whole transaction
// (including the claim) rolls back; if the final id-linking update fails,
// the whole transaction (including the message) rolls back.

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const { APPROVED_PRACTICES } = require('./practiceRegistry');

class InvalidChatSessionError extends Error {
  constructor(message) {
    super(message);
    this.name = 'InvalidChatSessionError';
  }
}

// Deterministic copy only — never model-generated. Situation text is
// interpolated exactly as persisted, trimmed and length-bounded so a
// malformed/oversized historical value can never blow up the message.
const MAX_SITUATION_DISPLAY_LENGTH = 200;
const FALLBACK_PRACTICE_LABEL_EN = 'your Mental Rep';
const FALLBACK_PRACTICE_LABEL_HI = 'आपका Mental Rep';

function boundedSituation(situation) {
  const trimmed = typeof situation === 'string' ? situation.trim() : '';
  if (trimmed.length <= MAX_SITUATION_DISPLAY_LENGTH) return trimmed;
  return `${trimmed.slice(0, MAX_SITUATION_DISPLAY_LENGTH).trim()}…`;
}

// Unknown/legacy practice keys (registry additions/renames over time) fall
// back to a neutral deterministic phrase — never fail, never invent a label.
function practiceLabelFor(practiceKey, language) {
  const entry = APPROVED_PRACTICES[practiceKey];
  if (entry) return entry.label;
  return language === 'hi' ? FALLBACK_PRACTICE_LABEL_HI : FALLBACK_PRACTICE_LABEL_EN;
}

function buildFollowUpOpener({ practiceKey, situation, language }) {
  const practice = practiceLabelFor(practiceKey, language);
  const situationText = boundedSituation(situation);
  return language === 'hi'
    ? `पिछली बार तुमने ${situationText} में ${practice} करने का प्लान बनाया था। कैसा रहा?`
    : `Last time you planned to try ${practice} in ${situationText}. How did it go?`;
}

function createClaimPrescriptionFollowUp(db = prisma) {
  return async function claimPrescriptionFollowUp({ userId, chatSessionId, language }) {
    if (!chatSessionId || typeof chatSessionId !== 'string') {
      throw new InvalidChatSessionError('chatSessionId is required');
    }

    return db.$transaction(async (tx) => {
      // 1. Session ownership + main-chat mode.
      const session = await tx.chatSession.findUnique({
        where: { id: chatSessionId },
        select: { userId: true, mode: true },
      });
      if (!session || session.userId !== userId || session.mode !== 'main') {
        throw new InvalidChatSessionError('chat session not found for this athlete');
      }

      // 2. Current active selection + active prescription.
      const state = await tx.userCoachingState.findUnique({
        where: { userId },
        include: { activeSelection: { include: { prescription: true } } },
      });
      const selection = state?.activeSelection || null;
      const prescription = selection?.prescription || null;

      if (!selection || !prescription || prescription.status !== 'ACTIVE') {
        return { claimed: false };
      }

      // 3. Atomic once-only claim — the WHERE clause is the whole guard;
      // a concurrent winner flips followUpOpenerClaimedAt first, so every
      // other simultaneous call here matches zero rows.
      const claim = await tx.prescription.updateMany({
        where: { id: prescription.id, followUpOpenerClaimedAt: null },
        data: { followUpOpenerClaimedAt: new Date(), followUpOpenerSessionId: chatSessionId },
      });
      if (claim.count === 0) {
        return { claimed: false };
      }

      // 4. Build the opener from the persisted prescription.
      const content = buildFollowUpOpener({
        practiceKey: prescription.practiceKey,
        situation: prescription.situation,
        language,
      });

      // 5. Persist the one assistant Message — byte-for-byte the text returned.
      const message = await tx.message.create({
        data: { userId, role: 'assistant', content, chatSessionId, sessionType: null },
      });

      // 6. Store the real created Message id on the Prescription.
      await tx.prescription.update({
        where: { id: prescription.id },
        data: { followUpOpenerMessageId: message.id },
      });

      return { claimed: true, message };
    });
  };
}

module.exports = {
  createClaimPrescriptionFollowUp,
  claimPrescriptionFollowUp: createClaimPrescriptionFollowUp(),
  InvalidChatSessionError,
  buildFollowUpOpener,
};
