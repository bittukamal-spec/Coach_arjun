// Server-controlled Anthropic tool definitions + validators for the
// buffered coaching loop (PR-10). The tools stage exactly one coaching-state
// transition per athlete message; nothing is written to the database until
// the loop reaches its final athlete-facing text and the transition commits
// atomically with it (commitCoachingTransition.js).
//
// buildSystemPrompt (Arjun's brain) is deliberately untouched — all
// tool-usage guidance lives in the tool descriptions themselves.

const { APPROVED_PRACTICE_KEYS, isApprovedPracticeKey } = require('./practiceRegistry');

const PROPOSE_BARRIER = 'propose_barrier';
const PRESCRIBE_MENTAL_REP = 'prescribe_mental_rep';

// Length bounds for every athlete-visible or stored field. Anything outside
// these is a malformed payload — rejected, never truncated silently.
const LIMITS = {
  problemStatement: 1000,
  barrierHypothesis: 500,
  finalBarrierHypothesis: 500,
  situation: 500,
  cardContent: 2000,
  cueWord: 60,
};

const CONFIRMATION_VALUES = ['CONFIRMED', 'CORRECTED'];

const COACHING_TOOLS = [
  {
    name: PROPOSE_BARRIER,
    description:
      "Stage Arjun's single working barrier hypothesis for the athlete's CURRENT performance problem. " +
      'Use only after asking 2-4 focused questions about a real problem the athlete brought, and only when no coaching cycle is already open. ' +
      'Call it at most once. After this tool is accepted, your reply to the athlete must name the barrier in plain, non-clinical language as a hypothesis ' +
      '("sounds like… does that fit?") and ask them to confirm or correct it. Do NOT prescribe any practice in that reply.',
    input_schema: {
      type: 'object',
      properties: {
        problemStatement: {
          type: 'string',
          description: "The athlete's real performance problem or situation, in their terms.",
          maxLength: LIMITS.problemStatement,
        },
        barrierHypothesis: {
          type: 'string',
          description: 'The single most likely mental barrier, stated plainly (one of the seven barriers, no clinical language).',
          maxLength: LIMITS.barrierHypothesis,
        },
      },
      required: ['problemStatement', 'barrierHypothesis'],
    },
  },
  {
    name: PRESCRIBE_MENTAL_REP,
    description:
      "Prescribe exactly ONE approved Mental Rep practice for the athlete's barrier, only after the athlete has just confirmed the barrier hypothesis " +
      '(or corrected it and agreed on the corrected one) in this conversation, and only while a coaching cycle is open and awaiting confirmation. ' +
      `practiceKey must be one of: ${APPROVED_PRACTICE_KEYS.join(', ')}. ` +
      'cardContent is the exact athlete-visible practice card text — write it fully and concretely. ' +
      'After this tool is accepted, write the athlete-facing reply that delivers the practice with a one-line why and the follow-up contract ' +
      '("try it in [their real situation]; when you\'re next here, tell me what happened").',
    input_schema: {
      type: 'object',
      properties: {
        barrierConfirmationStatus: {
          type: 'string',
          enum: CONFIRMATION_VALUES,
          description: 'CONFIRMED if the athlete agreed with the original hypothesis; CORRECTED if they corrected it and you re-hypothesized.',
        },
        finalBarrierHypothesis: {
          type: 'string',
          description: 'The barrier as finally agreed with the athlete.',
          maxLength: LIMITS.finalBarrierHypothesis,
        },
        practiceKey: {
          type: 'string',
          enum: APPROVED_PRACTICE_KEYS,
          description: 'The approved practice being prescribed.',
        },
        situation: {
          type: 'string',
          description: 'The real training/competition situation the athlete will apply this practice in.',
          maxLength: LIMITS.situation,
        },
        cardContent: {
          type: 'string',
          description: 'Exact athlete-visible practice card text.',
          maxLength: LIMITS.cardContent,
        },
        cueWord: {
          type: ['string', 'null'],
          description: "The athlete's cue word for this practice, or null if none applies.",
          maxLength: LIMITS.cueWord,
        },
      },
      required: ['barrierConfirmationStatus', 'finalBarrierHypothesis', 'practiceKey', 'situation', 'cardContent'],
    },
  },
];

function nonEmptyBounded(value, max) {
  return typeof value === 'string' && value.trim().length > 0 && value.length <= max;
}

// context: { hasActiveSelection, cycleStatus, barrierConfirmationStatus, hasPrescription }
// — a read-only snapshot of the athlete's current coaching state, loaded
// once per request (loadCoachingContext). The atomic commit revalidates
// against live state, so a stale snapshot can never cause a bad write.

function validateProposeBarrier(input, context) {
  if (!input || typeof input !== 'object') {
    return { ok: false, error: 'Malformed payload: expected an object with problemStatement and barrierHypothesis.' };
  }
  if (!nonEmptyBounded(input.problemStatement, LIMITS.problemStatement)) {
    return { ok: false, error: `problemStatement must be a non-empty string of at most ${LIMITS.problemStatement} characters.` };
  }
  if (!nonEmptyBounded(input.barrierHypothesis, LIMITS.barrierHypothesis)) {
    return { ok: false, error: `barrierHypothesis must be a non-empty string of at most ${LIMITS.barrierHypothesis} characters.` };
  }
  if (context.hasActiveSelection) {
    return {
      ok: false,
      error: 'The athlete already has an open coaching cycle. Do not open a new one — continue coaching within the current cycle instead.',
    };
  }
  return { ok: true };
}

function validatePrescribeMentalRep(input, context) {
  if (!input || typeof input !== 'object') {
    return { ok: false, error: 'Malformed payload: expected an object with the prescription fields.' };
  }
  if (!CONFIRMATION_VALUES.includes(input.barrierConfirmationStatus)) {
    return { ok: false, error: 'barrierConfirmationStatus must be CONFIRMED or CORRECTED.' };
  }
  if (!nonEmptyBounded(input.finalBarrierHypothesis, LIMITS.finalBarrierHypothesis)) {
    return { ok: false, error: `finalBarrierHypothesis must be a non-empty string of at most ${LIMITS.finalBarrierHypothesis} characters.` };
  }
  if (!isApprovedPracticeKey(input.practiceKey)) {
    return { ok: false, error: `practiceKey must be one of the approved practices: ${APPROVED_PRACTICE_KEYS.join(', ')}.` };
  }
  if (!nonEmptyBounded(input.situation, LIMITS.situation)) {
    return { ok: false, error: `situation must be a non-empty string of at most ${LIMITS.situation} characters.` };
  }
  if (!nonEmptyBounded(input.cardContent, LIMITS.cardContent)) {
    return { ok: false, error: `cardContent must be a non-empty string of at most ${LIMITS.cardContent} characters.` };
  }
  if (input.cueWord !== undefined && input.cueWord !== null) {
    if (typeof input.cueWord !== 'string' || input.cueWord.length > LIMITS.cueWord) {
      return { ok: false, error: `cueWord must be null or a string of at most ${LIMITS.cueWord} characters.` };
    }
  }
  if (!context.hasActiveSelection) {
    return { ok: false, error: 'No coaching cycle is open. Identify and confirm a barrier (propose_barrier) before prescribing.' };
  }
  if (context.cycleStatus !== 'ACTIVE') {
    return { ok: false, error: 'The open coaching cycle is not active, so nothing can be prescribed against it.' };
  }
  if (context.barrierConfirmationStatus !== 'PENDING') {
    return { ok: false, error: 'The barrier for the open cycle is not awaiting confirmation, so a new prescription is not valid here.' };
  }
  if (context.hasPrescription) {
    return { ok: false, error: 'The open coaching cycle already has an active prescription. Exactly one practice per cycle — do not prescribe another.' };
  }
  return { ok: true };
}

module.exports = {
  COACHING_TOOLS,
  PROPOSE_BARRIER,
  PRESCRIBE_MENTAL_REP,
  LIMITS,
  CONFIRMATION_VALUES,
  validateProposeBarrier,
  validatePrescribeMentalRep,
};
