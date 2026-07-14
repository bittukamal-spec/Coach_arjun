// Barrel for the buffered coaching tool loop (PR-10). Route usage:
//
//   const {
//     runBufferedToolLoop, sanitizeFinalText, buildQuickReplyPayload,
//     loadCoachingContext, commitCoachingTransition,
//     CoachingStateConflictError, getRetryMessage,
//   } = require('../services/coaching');

const { runBufferedToolLoop, sanitizeFinalText, buildQuickReplyPayload, MAX_ROUNDS, MAX_FINAL_TEXT_LENGTH } = require('./bufferedToolLoop');
const {
  createLoadCoachingContext,
  createCommitCoachingTransition,
  loadCoachingContext,
  commitCoachingTransition,
  CoachingStateConflictError,
  getRetryMessage,
} = require('./commitCoachingTransition');
const { COACHING_TOOLS, PROPOSE_BARRIER, PRESCRIBE_MENTAL_REP, OFFER_QUICK_REPLIES, QUICK_REPLY_LIMITS } = require('./coachingTools');
const { APPROVED_PRACTICE_KEYS, isApprovedPracticeKey } = require('./practiceRegistry');

module.exports = {
  runBufferedToolLoop,
  sanitizeFinalText,
  buildQuickReplyPayload,
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
  OFFER_QUICK_REPLIES,
  QUICK_REPLY_LIMITS,
  APPROVED_PRACTICE_KEYS,
  isApprovedPracticeKey,
};
