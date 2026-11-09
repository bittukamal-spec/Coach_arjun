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
const RECORD_PRESCRIPTION_OUTCOME = 'record_prescription_outcome';
// Not a coaching-state transition (Nov 2026): offers the athlete a routine
// card they can save to Ritual. Nothing is written by the tool — the athlete
// taps Save on the card, which goes through the normal routines API.
const PROPOSE_ROUTINE = 'propose_routine';
// Mirrors server/src/services/routines/validateRoutine.js.
const ROUTINE_CATEGORIES = ['session_preparation', 'repeated_moment', 'pressure_moment', 'own_situation'];
const ROUTINE_LIMITS = { maxSteps: 5, step: 120, name: 60 };

// Length bounds for every athlete-visible or stored field. Anything outside
// these is a malformed payload — rejected, never truncated silently.
const LIMITS = {
  problemStatement: 1000,
  barrierHypothesis: 500,
  finalBarrierHypothesis: 500,
  situation: 500,
  cardContent: 2000,
  cueWord: 60,
  lessonText: 400,
};

const CONFIRMATION_VALUES = ['CONFIRMED', 'CORRECTED'];

// Must match the PrescriptionOutcomeStatus Prisma enum exactly (PR-13).
const OUTCOME_STATUS_VALUES = ['HELPED', 'HELPED_A_LITTLE', 'DID_NOT_HELP', 'NOT_TRIED'];

// A lesson is short athlete-visible prose — reject markup, tool syntax and
// control characters outright.
const FORBIDDEN_LESSON_RE = /\[APP:|\[SUGGEST:|<[a-zA-Z!/]|[{}]|[\x00-\x1F\x7F]/;

// Every tool here is a genuine coaching-state transition. The AI-generated
// reply-chip tool (offer_quick_replies) was removed: Coach is a free-text
// conversation, and staging chips cost an extra model round that regularly
// ended in an empty athlete-facing reply. Deterministic selection controls
// elsewhere (onboarding, Starting Profile, Mental Rep, prescription-outcome
// choices) are unaffected — they were never this tool.
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
  {
    name: RECORD_PRESCRIPTION_OUTCOME,
    description:
      "Record the athlete's reported result for their current active Mental Rep prescription — call this as soon as they tell you how it went (helped, helped a little, did not help, or that they haven't tried it), whether replying to the app's own automatic follow-up question or bringing it up on their own. " +
      'outcomeStatus must exactly match what they reported — never infer a more positive or negative result than they actually said. ' +
      'lessonText is a short (max 400 characters), athlete-visible, grounded statement based only on what they reported — it must never diagnose, score, or profile the athlete, and must never claim the practice is clinically effective. ' +
      'Your visible reply after this tool is accepted must include that exact lessonText, and must NOT prescribe a new practice in the same reply — acknowledging the result is enough for now; a new prescription (if any) comes only in a later reply, through prescribe_mental_rep, after asking 1-2 focused questions. ' +
      'Call this at most once per athlete message, and never in the same message as propose_barrier or prescribe_mental_rep.',
    input_schema: {
      type: 'object',
      properties: {
        outcomeStatus: {
          type: 'string',
          enum: OUTCOME_STATUS_VALUES,
          description: 'Exactly what the athlete reported: HELPED, HELPED_A_LITTLE, DID_NOT_HELP, or NOT_TRIED (they have not tried it yet).',
        },
        lessonText: {
          type: 'string',
          description: 'A short, concrete, athlete-visible lesson grounded only in what the athlete reported. Never a diagnosis, score, or profile.',
          maxLength: LIMITS.lessonText,
        },
      },
      required: ['outcomeStatus', 'lessonText'],
    },
  },
  {
    name: PROPOSE_ROUTINE,
    description:
      'Offer the athlete a routine card they can save to their Ritual routines with one tap. ' +
      'Use it when you and the athlete have agreed on a concrete routine — an improved version of the routine being discussed, or a new one they asked for — ' +
      'or when they ask to save it. Give the COMPLETE routine in order (2-5 short steps they can do in that moment, in the words you used in your reply). ' +
      'This saves nothing by itself: the athlete decides on the card. It is not a coaching-state transition and does not affect barriers or prescriptions. ' +
      'Call it at most once per reply, and still write your normal reply to the athlete, listing the same steps.',
    input_schema: {
      type: 'object',
      properties: {
        steps: {
          type: 'array',
          minItems: 1,
          maxItems: ROUTINE_LIMITS.maxSteps,
          items: { type: 'string', maxLength: ROUTINE_LIMITS.step },
          description: 'The full routine, one short instruction per step, in order.',
        },
        name: {
          type: 'string',
          maxLength: ROUTINE_LIMITS.name,
          description: 'A short name for a NEW routine (e.g. "Before I bat"). Leave out when improving the routine being discussed.',
        },
        category: {
          type: 'string',
          enum: ROUTINE_CATEGORIES,
          description: 'For a NEW routine: when it is used. Leave out when improving the routine being discussed.',
        },
      },
      required: ['steps'],
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
  // Normally the barrier must still be PENDING confirmation. The one other
  // allowed state (PR-13): the barrier was already CONFIRMED/CORRECTED for
  // this cycle AND there is currently no prescription — meaning a prior
  // Prescription's outcome was DID_NOT_HELP (which clears prescriptionId
  // but never reverts barrierConfirmationStatus). hasPrescription is
  // checked separately right below either way, so this never permits a
  // second concurrent prescription.
  if (!['PENDING', 'CONFIRMED', 'CORRECTED'].includes(context.barrierConfirmationStatus)) {
    return { ok: false, error: 'The barrier for the open cycle is not awaiting confirmation, so a new prescription is not valid here.' };
  }
  if (context.hasPrescription) {
    return { ok: false, error: 'The open coaching cycle already has an active prescription. Exactly one practice per cycle — do not prescribe another.' };
  }
  return { ok: true };
}

// context here additionally carries: hasPrescription, prescriptionStatus
// (the active selection's Prescription.status, or null), and
// prescriptionOutcomeStatus (its outcomeStatus, or null) — see
// loadCoachingContext in commitCoachingTransition.js. The live re-check at
// commit time (commitCoachingTransition.js) is the true source of truth;
// this is the same staged pre-check pattern as the other tools.
function validateRecordPrescriptionOutcome(input, context) {
  if (!input || typeof input !== 'object') {
    return { ok: false, error: 'Malformed payload: expected an object with outcomeStatus and lessonText.' };
  }
  if (!OUTCOME_STATUS_VALUES.includes(input.outcomeStatus)) {
    return { ok: false, error: `outcomeStatus must be one of: ${OUTCOME_STATUS_VALUES.join(', ')}.` };
  }
  if (!nonEmptyBounded(input.lessonText, LIMITS.lessonText)) {
    return { ok: false, error: `lessonText must be a non-empty string of at most ${LIMITS.lessonText} characters.` };
  }
  if (FORBIDDEN_LESSON_RE.test(input.lessonText.trim())) {
    return { ok: false, error: 'lessonText may not contain markup, tool syntax, or control characters.' };
  }
  if (!context.hasActiveSelection) {
    return { ok: false, error: 'No active coaching cycle — there is no prescription to record an outcome against.' };
  }
  if (context.cycleStatus !== 'ACTIVE') {
    return { ok: false, error: 'The coaching cycle is not active.' };
  }
  if (!context.hasPrescription) {
    return { ok: false, error: 'The active selection has no prescription to record an outcome against.' };
  }
  if (!['ACTIVE', 'COMPLETED'].includes(context.prescriptionStatus)) {
    return { ok: false, error: 'This prescription is not in a state that can receive an outcome.' };
  }
  // NOT_TRIED and HELPED_A_LITTLE are both provisional and replaceable by a
  // later real outcome — only HELPED and DID_NOT_HELP are final.
  if (context.prescriptionOutcomeStatus && !['NOT_TRIED', 'HELPED_A_LITTLE'].includes(context.prescriptionOutcomeStatus)) {
    return { ok: false, error: 'A final outcome has already been recorded for this prescription.' };
  }
  return { ok: true };
}

// Shape check only; the card's Save goes through the routines API, which
// validates and safety-screens again before anything is stored.
function validateProposeRoutine(input) {
  if (!input || typeof input !== 'object') return { ok: false, error: 'Invalid routine.' };
  const { steps, name, category } = input;
  if (!Array.isArray(steps) || steps.length < 1 || steps.length > ROUTINE_LIMITS.maxSteps) {
    return { ok: false, error: `Give 1-${ROUTINE_LIMITS.maxSteps} steps.` };
  }
  const clean = [];
  for (const step of steps) {
    if (typeof step !== 'string' || !step.trim()) return { ok: false, error: 'Every step must be non-empty text.' };
    const text = step.replace(/\s+/g, ' ').trim();
    if (text.length > ROUTINE_LIMITS.step) return { ok: false, error: `Each step must be at most ${ROUTINE_LIMITS.step} characters.` };
    clean.push(text);
  }
  if (name !== undefined && name !== null && (typeof name !== 'string' || name.trim().length > ROUTINE_LIMITS.name)) {
    return { ok: false, error: `The name must be at most ${ROUTINE_LIMITS.name} characters.` };
  }
  if (category !== undefined && category !== null && !ROUTINE_CATEGORIES.includes(category)) {
    return { ok: false, error: 'Unknown category.' };
  }
  return {
    ok: true,
    proposal: {
      steps: clean,
      name: typeof name === 'string' && name.trim() ? name.trim() : null,
      category: ROUTINE_CATEGORIES.includes(category) ? category : null,
    },
  };
}

module.exports = {
  COACHING_TOOLS,
  PROPOSE_ROUTINE,
  ROUTINE_CATEGORIES,
  ROUTINE_LIMITS,
  validateProposeRoutine,
  PROPOSE_BARRIER,
  PRESCRIBE_MENTAL_REP,
  RECORD_PRESCRIPTION_OUTCOME,
  LIMITS,
  CONFIRMATION_VALUES,
  OUTCOME_STATUS_VALUES,
  validateProposeBarrier,
  validatePrescribeMentalRep,
  validateRecordPrescriptionOutcome,
};
