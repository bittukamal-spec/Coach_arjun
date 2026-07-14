// Exact prescription completion linkage (PR-12).
//
// Completes ONLY the exact Prescription referenced by the athlete's current
// ActiveCoachingSelection — never the latest Prescription, never by
// practiceKey/userId alone, never a generic practice/session completion
// event. No CoachingCycle resolution, no outcome capture, no new
// Prescription: this module only ever flips one Prescription from ACTIVE to
// COMPLETED and stamps completedAt once.
//
// Atomicity: like claimPrescriptionFollowUp, the actual completion is a
// conditional updateMany (WHERE id = prescriptionId AND status = 'ACTIVE')
// inside a single transaction — concurrent requests race at the database
// row-lock level. Exactly one sees count 1 (the winner, alreadyCompleted:
// false); every other simultaneous or later request re-reads the same
// settled row and returns alreadyCompleted:true with the SAME completedAt —
// one timestamp, no duplicate side effects.

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

class PrescriptionNotFoundError extends Error {
  constructor(message) {
    super(message);
    this.name = 'PrescriptionNotFoundError';
  }
}

// Prescription exists and belongs to the caller, but is not currently
// completable: not the one referenced by their ActiveCoachingSelection, its
// CoachingCycle is not ACTIVE, the submitted practiceKey doesn't match, or
// its status is SUPERSEDED. Deliberately one error type for all of these —
// the caller never learns which specific internal check failed.
class PrescriptionMismatchError extends Error {
  constructor(message) {
    super(message);
    this.name = 'PrescriptionMismatchError';
  }
}

function createCompleteActivePrescription(db = prisma) {
  return async function completeActivePrescription({ userId, prescriptionId, practiceKey }) {
    if (!prescriptionId || typeof prescriptionId !== 'string') {
      throw new PrescriptionNotFoundError('prescriptionId is required');
    }
    if (!practiceKey || typeof practiceKey !== 'string') {
      throw new PrescriptionMismatchError('practiceKey is required');
    }

    return db.$transaction(async (tx) => {
      // 1. Existence + ownership — never distinguish "missing" from
      // "belongs to someone else" in the error thrown here.
      const prescription = await tx.prescription.findUnique({ where: { id: prescriptionId } });
      if (!prescription || prescription.userId !== userId) {
        throw new PrescriptionNotFoundError('prescription not found for this athlete');
      }

      // 2. It must be the exact Prescription the athlete's current
      // ActiveCoachingSelection points to — never merely "some prescription
      // this athlete owns". Covers "no active selection", "selection with
      // no prescription yet", and "a different (e.g. older) prescription".
      const state = await tx.userCoachingState.findUnique({
        where: { userId },
        include: { activeSelection: { include: { cycle: true } } },
      });
      const selection = state?.activeSelection || null;
      if (!selection || selection.prescriptionId !== prescriptionId) {
        throw new PrescriptionMismatchError('this prescription is not the athlete\'s current active selection');
      }

      // 3. The selected cycle must still be ACTIVE.
      if (selection.cycle?.status !== 'ACTIVE') {
        throw new PrescriptionMismatchError('the selected coaching cycle is not active');
      }

      // 4. The submitted practiceKey must exactly match — never inferred.
      if (prescription.practiceKey !== practiceKey) {
        throw new PrescriptionMismatchError('practiceKey does not match this prescription');
      }

      // 5. Already completed — idempotent success, no write.
      if (prescription.status === 'COMPLETED') {
        return { completed: true, alreadyCompleted: true, prescription };
      }

      // 6. Anything other than ACTIVE (i.e. SUPERSEDED) cannot be completed.
      if (prescription.status !== 'ACTIVE') {
        throw new PrescriptionMismatchError(`prescription status ${prescription.status} cannot be completed`);
      }

      // 7. Atomic once-only completion claim.
      const claim = await tx.prescription.updateMany({
        where: { id: prescriptionId, status: 'ACTIVE' },
        data: { status: 'COMPLETED', completedAt: new Date() },
      });

      const settled = await tx.prescription.findUnique({ where: { id: prescriptionId } });
      return { completed: true, alreadyCompleted: claim.count === 0, prescription: settled };
    });
  };
}

// The athlete's current selected Prescription, in the shape the client
// needs — never full CoachingCycle internals, never another user's data
// (scoped entirely by the userId argument). Returns null when there is no
// active selection or no selected Prescription yet.
function createLoadActivePrescription(db = prisma) {
  return async function loadActivePrescription(userId) {
    const state = await db.userCoachingState.findUnique({
      where: { userId },
      include: { activeSelection: { include: { prescription: true } } },
    });
    const prescription = state?.activeSelection?.prescription || null;
    if (!prescription) return null;
    return {
      prescriptionId: prescription.id,
      practiceKey: prescription.practiceKey,
      situation: prescription.situation,
      cardContent: prescription.cardContent,
      cueWord: prescription.cueWord ?? null,
      status: prescription.status,
      completedAt: prescription.completedAt,
    };
  };
}

module.exports = {
  createCompleteActivePrescription,
  completeActivePrescription: createCompleteActivePrescription(),
  createLoadActivePrescription,
  loadActivePrescription: createLoadActivePrescription(),
  PrescriptionNotFoundError,
  PrescriptionMismatchError,
};
