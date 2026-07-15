// Deterministic next-open prescription follow-up opener (PR-11).
//
// When an athlete genuinely re-enters the main coaching chat with an
// ACTIVE prescription, this claims — at most once, ever — a single
// deterministic opener message asking how the practice went. No Anthropic
// call is made here, the athlete's outcome is not captured yet, and the
// coaching cycle/prescription is never resolved, abandoned, or superseded
// by this module — it only ever claims the follow-up opener and persists
// the one assistant Message. The returned outcomePending/outcomeChoices
// (PR-13) are read-only, deterministic, never-persisted derived fields —
// they never affect the atomic claim above, which is unchanged.
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

// Deterministic prescription-outcome follow-up choices (PR-13) — never
// model-generated, never persisted. Tapping one just sends its label
// through the normal main-chat message path; the app never calls a direct
// outcome endpoint from a chip. Ids are stable strings, not DB ids.
const OUTCOME_CHOICES_EN = [
  { id: 'helped', label: 'It helped' },
  { id: 'helped_a_little', label: 'It helped a little' },
  { id: 'did_not_help', label: 'It did not help' },
  { id: 'not_tried', label: 'I did not try it' },
];
const OUTCOME_CHOICES_HI = [
  { id: 'helped', label: 'इससे मदद मिली' },
  { id: 'helped_a_little', label: 'थोड़ी मदद मिली' },
  { id: 'did_not_help', label: 'इससे मदद नहीं मिली' },
  { id: 'not_tried', label: 'मैंने कोशिश नहीं की' },
];

function buildOutcomeChoices(language) {
  return language === 'hi' ? OUTCOME_CHOICES_HI : OUTCOME_CHOICES_EN;
}

// An outcome is still pending — no FINAL result recorded yet — when
// outcomeStatus is null, NOT_TRIED, or HELPED_A_LITTLE. All three are
// explicitly replaceable by a later real outcome (record_prescription_outcome's
// OUTCOME_STILL_OPEN guard); only HELPED and DID_NOT_HELP are final.
function isOutcomePending(prescription) {
  return !prescription.outcomeStatus
    || prescription.outcomeStatus === 'NOT_TRIED'
    || prescription.outcomeStatus === 'HELPED_A_LITTLE';
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

      // 2. Current active selection + eligible prescription. Eligible means
      // status ACTIVE or COMPLETED (the genuine practice-completion flow —
      // PR-12 — sets COMPLETED before the athlete ever reports an outcome,
      // so a completed practice must still be able to receive its
      // deterministic follow-up), the selected CoachingCycle is ACTIVE, and
      // no FINAL outcome has been recorded yet. In the normal lifecycle a
      // FINAL outcome already makes this prescription unreachable here —
      // HELPED deletes the selection entirely and DID_NOT_HELP clears
      // prescriptionId — but the isOutcomePending check is kept explicit
      // rather than relying solely on that structural guarantee.
      const state = await tx.userCoachingState.findUnique({
        where: { userId },
        include: { activeSelection: { include: { cycle: true, prescription: true } } },
      });
      const selection = state?.activeSelection || null;
      const prescription = selection?.prescription || null;

      if (
        !selection ||
        !prescription ||
        selection.cycle?.status !== 'ACTIVE' ||
        !['ACTIVE', 'COMPLETED'].includes(prescription.status) ||
        !isOutcomePending(prescription)
      ) {
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
        // Already claimed earlier (this entry or a prior one). Still offer
        // the deterministic outcome choices again if the athlete never
        // answered — but never once a final outcome has been recorded.
        if (isOutcomePending(prescription)) {
          return { claimed: false, outcomePending: true, outcomeChoices: buildOutcomeChoices(language) };
        }
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

      // A brand-new opener always has its outcome pending — nothing has
      // been recorded against it yet.
      return { claimed: true, message, outcomePending: true, outcomeChoices: buildOutcomeChoices(language) };
    });
  };
}

module.exports = {
  createClaimPrescriptionFollowUp,
  claimPrescriptionFollowUp: createClaimPrescriptionFollowUp(),
  InvalidChatSessionError,
  buildFollowUpOpener,
  buildOutcomeChoices,
};
