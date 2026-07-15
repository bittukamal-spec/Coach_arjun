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
const { PROPOSE_BARRIER, PRESCRIBE_MENTAL_REP, RECORD_PRESCRIPTION_OUTCOME } = require('./coachingTools');

// An outcome is still open (not yet FINAL) when null, NOT_TRIED, or
// HELPED_A_LITTLE — all three are provisional and may later be replaced by
// a real result. Only HELPED and DID_NOT_HELP are final and unwritable.
const OUTCOME_STILL_OPEN = { OR: [{ outcomeStatus: null }, { outcomeStatus: 'NOT_TRIED' }, { outcomeStatus: 'HELPED_A_LITTLE' }] };
const OUTCOME_REPLACEABLE_VALUES = ['NOT_TRIED', 'HELPED_A_LITTLE'];

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
      include: { activeSelection: { include: { cycle: true, prescription: true } } },
    });
    const selection = state?.activeSelection || null;
    const prescription = selection?.prescription || null;
    return {
      hasActiveSelection: !!selection,
      cycleStatus: selection?.cycle?.status || null,
      barrierConfirmationStatus: selection?.cycle?.barrierConfirmationStatus || null,
      hasPrescription: !!selection?.prescriptionId,
      // PR-13 additions — additive only, every existing field above is
      // unchanged in name and meaning.
      prescriptionStatus: prescription?.status || null,
      prescriptionOutcomeStatus: prescription?.outcomeStatus || null,
    };
  };
}

function createCommitCoachingTransition(db = prisma) {
  return function commitCoachingTransition({ userId, chatSessionId = null, sessionType = null, finalText, transition = null, userMessageId = null }) {
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
        // Normally the barrier must still be PENDING. The one other allowed
        // state (PR-13): CONFIRMED/CORRECTED with no current prescriptionId
        // — a prior Prescription's outcome was DID_NOT_HELP, which clears
        // prescriptionId but never reverts barrierConfirmationStatus. The
        // prescriptionId check right above already rules out a second
        // concurrent prescription either way.
        if (
          !selection ||
          selection.prescriptionId ||
          selection.cycle?.status !== 'ACTIVE' ||
          !['PENDING', 'CONFIRMED', 'CORRECTED'].includes(selection.cycle?.barrierConfirmationStatus)
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

      if (transition.type === RECORD_PRESCRIPTION_OUTCOME) {
        const state = await tx.userCoachingState.findUnique({
          where: { userId },
          include: { activeSelection: { include: { cycle: true, prescription: true } } },
        });
        const selection = state?.activeSelection || null;
        const prescription = selection?.prescription || null;

        if (
          !selection ||
          !prescription ||
          prescription.userId !== userId ||
          prescription.cycleId !== selection.cycleId ||
          selection.cycle?.status !== 'ACTIVE' ||
          !['ACTIVE', 'COMPLETED'].includes(prescription.status)
        ) {
          throw new CoachingStateConflictError('no matching active prescription to record an outcome against');
        }
        if (prescription.outcomeStatus && !OUTCOME_REPLACEABLE_VALUES.includes(prescription.outcomeStatus)) {
          throw new CoachingStateConflictError('a final outcome has already been recorded for this prescription');
        }
        // The exact persisted-visible-text invariant, enforced structurally:
        // the athlete-facing reply must contain the lesson verbatim.
        if (!finalText.includes(transition.lessonText)) {
          throw new CoachingStateConflictError('the final reply must include the exact lesson text verbatim');
        }

        const now = new Date();
        const baseOutcomeData = {
          outcomeStatus: transition.outcomeStatus,
          outcomeLesson: transition.lessonText,
          outcomeRecordedAt: now,
          outcomeSourceMessageId: userMessageId || null,
          outcomeSourceSessionId: chatSessionId || null,
        };

        // Outcome-specific Prescription fields — the lifecycle mapping.
        let outcomeSpecificData = {};
        if (transition.outcomeStatus === 'HELPED') {
          outcomeSpecificData = { status: 'COMPLETED', completedAt: prescription.completedAt ?? now };
        } else if (transition.outcomeStatus === 'DID_NOT_HELP') {
          outcomeSpecificData = { status: 'SUPERSEDED', supersededAt: now };
        } else if (transition.outcomeStatus === 'NOT_TRIED' || transition.outcomeStatus === 'HELPED_A_LITTLE') {
          // Both are provisional (OUTCOME_REPLACEABLE_VALUES): clear the
          // follow-up-opener claim so a later genuine entry may receive
          // another deterministic follow-up question and, eventually,
          // report a real outcome. Prescription.status is left untouched
          // for HELPED_A_LITTLE — whatever it already was (ACTIVE or
          // COMPLETED) is preserved, never downgraded or upgraded here.
          outcomeSpecificData = {
            followUpOpenerClaimedAt: null,
            followUpOpenerMessageId: null,
            followUpOpenerSessionId: null,
          };
        }
        // Cycle and selection always stay exactly as they are for
        // HELPED_A_LITTLE and NOT_TRIED — no automatic new Prescription.

        // Atomic once-only claim — the WHERE clause (still-open outcome) is
        // the whole guard. A concurrent winner flips outcomeStatus first,
        // so every other simultaneous call here matches zero rows.
        const claim = await tx.prescription.updateMany({
          where: { id: prescription.id, ...OUTCOME_STILL_OPEN },
          data: { ...baseOutcomeData, ...outcomeSpecificData },
        });
        if (claim.count === 0) {
          throw new CoachingStateConflictError('prescription outcome could not be recorded (already finalized)');
        }

        if (transition.outcomeStatus === 'HELPED') {
          await tx.coachingCycle.update({
            where: { id: selection.cycleId },
            data: { status: 'RESOLVED', resolvedAt: now },
          });
          await tx.activeCoachingSelection.delete({ where: { id: selection.id } });
        } else if (transition.outcomeStatus === 'DID_NOT_HELP') {
          await tx.activeCoachingSelection.update({
            where: { id: selection.id },
            data: { prescriptionId: null },
          });
        }

        const message = await tx.message.create({ data: messageData });
        return { message, card: null };
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
