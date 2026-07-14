// Atomic commit for the buffered coaching loop (PR-10).
//
// The loop stages at most one transition in memory; nothing touches the
// database until the final athlete-facing text exists. This module then
// runs ONE Prisma transaction that revalidates the live coaching state
// (the loop's snapshot may be stale by now), writes the coaching records,
// and persists the assistant Message whose content is byte-for-byte the
// text the athlete will see. Any revalidation failure throws
// CoachingStateConflictError and the transaction rolls back completely —
// no partial cycle/prescription/selection/message writes are possible.
//
// `createCommitCoachingTransition`/`createLoadCoachingContext` are
// injectable for tests (same pattern as recordSafetyEvent and
// requireGuardianConsent); the default exports use the real client.

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const { PROPOSE_BARRIER, PRESCRIBE_MENTAL_REP } = require('./coachingTools');

class CoachingStateConflictError extends Error {
  constructor(message) {
    super(message);
    this.name = 'CoachingStateConflictError';
  }
}

// Deterministic fallback shown when a staged transition cannot be
// committed (conflict/failure) or the tool loop hits its round cap.
// Fixed copy — never model-generated.
function getRetryMessage(language) {
  return language === 'hi'
    ? 'Abhi main woh coaching step save nahi kar paya. Kuch bhi change nahi hua — apna last message dobara bhej do.'
    : "I couldn't save that coaching step just now. Nothing was changed — please send your last message again.";
}

function createLoadCoachingContext(db = prisma) {
  return async function loadCoachingContext(userId) {
    const state = await db.userCoachingState.findUnique({
      where: { userId },
      include: { activeSelection: { include: { cycle: true } } },
    });
    const selection = state?.activeSelection || null;
    return {
      hasActiveSelection: !!selection,
      cycleStatus: selection?.cycle?.status || null,
      barrierConfirmationStatus: selection?.cycle?.barrierConfirmationStatus || null,
      hasPrescription: !!selection?.prescriptionId,
    };
  };
}

function createCommitCoachingTransition(db = prisma) {
  return function commitCoachingTransition({ userId, chatSessionId = null, sessionType = null, finalText, transition = null }) {
    return db.$transaction(async (tx) => {
      const messageData = {
        userId,
        role: 'assistant',
        content: finalText,
        sessionType: sessionType || null,
        chatSessionId: chatSessionId || null,
      };

      if (!transition) {
        const message = await tx.message.create({ data: messageData });
        return { message, card: null };
      }

      if (transition.type === PROPOSE_BARRIER) {
        let state = await tx.userCoachingState.findUnique({
          where: { userId },
          include: { activeSelection: true },
        });
        if (state?.activeSelection) {
          throw new CoachingStateConflictError('an active coaching selection already exists');
        }
        if (!state) {
          state = await tx.userCoachingState.create({ data: { userId } });
        }
        const cycle = await tx.coachingCycle.create({
          data: {
            userId,
            problemStatement: transition.problemStatement,
            barrierHypothesis: transition.barrierHypothesis,
            sourceChatSessionId: chatSessionId || null,
          },
        });
        await tx.activeCoachingSelection.create({
          data: { userCoachingStateId: state.id, userId, cycleId: cycle.id },
        });
        const message = await tx.message.create({ data: messageData });
        return { message, card: null };
      }

      if (transition.type === PRESCRIBE_MENTAL_REP) {
        const state = await tx.userCoachingState.findUnique({
          where: { userId },
          include: { activeSelection: { include: { cycle: true } } },
        });
        const selection = state?.activeSelection || null;
        if (
          !selection ||
          selection.prescriptionId ||
          selection.cycle?.status !== 'ACTIVE' ||
          selection.cycle?.barrierConfirmationStatus !== 'PENDING'
        ) {
          throw new CoachingStateConflictError('no matching active pending coaching cycle');
        }
        await tx.coachingCycle.update({
          where: { id: selection.cycleId },
          data: {
            barrierHypothesis: transition.finalBarrierHypothesis,
            barrierConfirmationStatus: transition.barrierConfirmationStatus,
          },
        });
        const prescription = await tx.prescription.create({
          data: {
            userId,
            cycleId: selection.cycleId,
            practiceKey: transition.practiceKey,
            situation: transition.situation,
            cardContent: transition.cardContent,
            cueWord: transition.cueWord ?? null,
            sourceChatSessionId: chatSessionId || null,
          },
        });
        await tx.activeCoachingSelection.update({
          where: { id: selection.id },
          data: { prescriptionId: prescription.id },
        });
        const message = await tx.message.create({ data: messageData });
        return {
          message,
          card: {
            prescriptionId: prescription.id,
            practiceKey: prescription.practiceKey,
            situation: prescription.situation,
            cardContent: prescription.cardContent,
            cueWord: prescription.cueWord ?? null,
          },
        };
      }

      throw new CoachingStateConflictError(`unknown transition type: ${transition.type}`);
    });
  };
}

module.exports = {
  createLoadCoachingContext,
  createCommitCoachingTransition,
  loadCoachingContext: createLoadCoachingContext(),
  commitCoachingTransition: createCommitCoachingTransition(),
  CoachingStateConflictError,
  getRetryMessage,
};
