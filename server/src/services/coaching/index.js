// Barrel for the buffered coaching tool loop (PR-10). Route usage:
//
//   const {
//     runBufferedToolLoop, sanitizeFinalText, buildQuickReplyPayload,
//     loadCoachingContext, commitCoachingTransition,
//     CoachingStateConflictError, getRetryMessage,
//   } = require('../services/coaching');

const { runBufferedToolLoop, sanitizeFinalText, buildQuickReplyPayload, buildRecoverySystem, describeResponseShape, MAX_ROUNDS, MAX_FINAL_TEXT_LENGTH, FINAL_TEXT_RECOVERY_INSTRUCTION } = require('./bufferedToolLoop');
const { validateAthleteText, isApprovedSafetyText } = require('./validateAthleteText');
const { filterQuickReplies } = require('./filterQuickReplies');
const {
  createLoadCoachingContext,
  createCommitCoachingTransition,
  loadCoachingContext,
  commitCoachingTransition,
  CoachingStateConflictError,
  getRetryMessage,
  getClarityFallbackMessage,
} = require('./commitCoachingTransition');
const {
  COACHING_TOOLS,
  PROPOSE_BARRIER,
  PRESCRIBE_MENTAL_REP,
  OFFER_QUICK_REPLIES,
  RECORD_PRESCRIPTION_OUTCOME,
  QUICK_REPLY_LIMITS,
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
  buildQuickReplyPayload,
  buildRecoverySystem,
  describeResponseShape,
  FINAL_TEXT_RECOVERY_INSTRUCTION,
  validateAthleteText,
  isApprovedSafetyText,
  filterQuickReplies,
  MAX_ROUNDS,
  MAX_FINAL_TEXT_LENGTH,
  createLoadCoachingContext,
  createCommitCoachingTransition,
  loadCoachingContext,
  commitCoachingTransition,
  CoachingStateConflictError,
  getRetryMessage,
  getClarityFallbackMessage,
  COACHING_TOOLS,
  PROPOSE_BARRIER,
  PRESCRIBE_MENTAL_REP,
  OFFER_QUICK_REPLIES,
  RECORD_PRESCRIPTION_OUTCOME,
  QUICK_REPLY_LIMITS,
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
