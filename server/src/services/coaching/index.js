// Barrel for the buffered coaching tool loop (PR-10). Route usage:
//
//   const {
//     runBufferedToolLoop, sanitizeFinalText,
//     loadCoachingContext, commitCoachingTransition,
//     CoachingStateConflictError, getRetryMessage,
//   } = require('../services/coaching');

const { runBufferedToolLoop, sanitizeFinalText, MAX_ROUNDS, MAX_FINAL_TEXT_LENGTH } = require('./bufferedToolLoop');
const {
  createLoadCoachingContext,
  createCommitCoachingTransition,
  loadCoachingContext,
  commitCoachingTransition,
  CoachingStateConflictError,
  getRetryMessage,
} = require('./commitCoachingTransition');
const { COACHING_TOOLS, PROPOSE_BARRIER, PRESCRIBE_MENTAL_REP } = require('./coachingTools');
const { APPROVED_PRACTICE_KEYS, isApprovedPracticeKey } = require('./practiceRegistry');

module.exports = {
  runBufferedToolLoop,
  sanitizeFinalText,
  MAX_ROUNDS,
  MAX_FINAL_TEXT_LENGTH,
  createLoadCoachingContext,
  createCommitCoachingTransition,
  loadCoachingContext,
  commitCoachingTransition,
  CoachingStateConflictError,
  getRetryMessage,
  COACHING_TOOLS,
  PROPOSE_BARRIER,
  PRESCRIBE_MENTAL_REP,
  APPROVED_PRACTICE_KEYS,
  isApprovedPracticeKey,
};
