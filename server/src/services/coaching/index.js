// Barrel for the buffered coaching tool loop (PR-10). Route usage:
//
//   const {
//     runBufferedToolLoop, sanitizeFinalText,
//     loadCoachingContext, commitCoachingTransition,
//     CoachingStateConflictError, getRetryMessage,
//   } = require('../services/coaching');

const { runBufferedToolLoop, sanitizeFinalText, buildRecoverySystem, describeResponseShape, MAX_ROUNDS, MAX_FINAL_TEXT_LENGTH, FINAL_TEXT_RECOVERY_INSTRUCTION } = require('./bufferedToolLoop');
const { validateAthleteText, isApprovedSafetyText } = require('./validateAthleteText');
const { getSportLanguageHints, buildLanguageHintSection, describeHints } = require('./sportLanguageHints');
const {
  createLoadCoachingContext,
  createCommitCoachingTransition,
  loadCoachingContext,
  commitCoachingTransition,
  CoachingStateConflictError,
  getRetryMessage,
  getClarityFallbackMessage,
  getSecondaryClarityFallbackMessage,
  getSimpleClarityPrompt,
  pickClarityFallback,
} = require('./commitCoachingTransition');
const {
  COACHING_TOOLS,
  PROPOSE_BARRIER,
  PRESCRIBE_MENTAL_REP,
  RECORD_PRESCRIPTION_OUTCOME,
  OUTCOME_STATUS_VALUES,
} = require('./coachingTools');
const { APPROVED_PRACTICE_KEYS, isApprovedPracticeKey } = require('./practiceRegistry');
const {
  createClaimPrescriptionFollowUp,
  claimPrescriptionFollowUp,
  InvalidChatSessionError,
} = require('./claimPrescriptionFollowUp');
const {
  createCompleteActivePrescription,
  completeActivePrescription,
  createLoadActivePrescription,
  loadActivePrescription,
  PrescriptionNotFoundError,
  PrescriptionMismatchError,
} = require('./completeActivePrescription');

module.exports = {
  runBufferedToolLoop,
  sanitizeFinalText,
  buildRecoverySystem,
  describeResponseShape,
  FINAL_TEXT_RECOVERY_INSTRUCTION,
  validateAthleteText,
  isApprovedSafetyText,
  getSportLanguageHints,
  buildLanguageHintSection,
  describeHints,
  MAX_ROUNDS,
  MAX_FINAL_TEXT_LENGTH,
  createLoadCoachingContext,
  createCommitCoachingTransition,
  loadCoachingContext,
  commitCoachingTransition,
  CoachingStateConflictError,
  getRetryMessage,
  getClarityFallbackMessage,
  getSecondaryClarityFallbackMessage,
  getSimpleClarityPrompt,
  pickClarityFallback,
  COACHING_TOOLS,
  PROPOSE_BARRIER,
  PRESCRIBE_MENTAL_REP,
  RECORD_PRESCRIPTION_OUTCOME,
  OUTCOME_STATUS_VALUES,
  APPROVED_PRACTICE_KEYS,
  isApprovedPracticeKey,
  createClaimPrescriptionFollowUp,
  claimPrescriptionFollowUp,
  InvalidChatSessionError,
  createCompleteActivePrescription,
  completeActivePrescription,
  createLoadActivePrescription,
  loadActivePrescription,
  PrescriptionNotFoundError,
  PrescriptionMismatchError,
};
