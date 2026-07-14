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
const OFFER_QUICK_REPLIES = 'offer_quick_replies';

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

// offer_quick_replies is a presentation tool, not a coaching-state
// transition — it never touches CoachingCycle/Prescription/
// ActiveCoachingSelection. Bounds below are enforced both here (structural
// validation) and via the JSON schema (Anthropic-side guidance).
const QUICK_REPLY_LIMITS = { min: 2, max: 3, maxLabelLength: 100 };

// The client always appends its own "Write my own" option — the model must
// never offer an equivalent itself. Matches at the start of the (trimmed)
// label so "Write my own answer" etc. is also caught.
const RESERVED_QUICK_REPLY_RE = /^(other|something else|write my own)\b/i;

// Reject legacy tags, HTML-ish markup, JSON/tool-call punctuation, and
// control characters in a reply label — chips are short plain text only.
const FORBIDDEN_QUICK_REPLY_RE = /\[APP:|\[SUGGEST:|<[a-zA-Z!/]|[{}]|[\x00-\x1F\x7F]/;

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
    name: OFFER_QUICK_REPLIES,
    description:
      'REQUIRED whenever your final question has exactly 2 or 3 clear, short, non-sensitive answer categories the athlete could tap instead of typing — call it in the same request rather than merely writing the options in your message text. ' +
      'Examples: identifying their immediate thought between a couple of distinct focuses, choosing between a couple of simple situations (e.g. matches, training, or both), confirming or rejecting a barrier hypothesis ("Yes, that feels right" / "Not quite"), or a later outcome question like whether a practice helped. ' +
      'Do not use this on every message — most replies need none. Do not use it when the question is open-ended with no small fixed set of likely answers, when the athlete needs to explain something in their own words, or when there are more than three meaningfully different answers. ' +
      'Do not use it for sensitive disclosures, or anywhere near a crisis, abuse, injury, or immediate-danger discussion. ' +
      'Do not use it when a detailed personal explanation or reflection is needed, or when the choices themselves would lead or diagnose the athlete, or would pressure them toward an answer. ' +
      'Do not call this in the same reply as prescribe_mental_rep — the practice card takes that reply\'s place, never chips. ' +
      'The app always adds its own "Write my own" option after your choices — never include "Other", "Something else", or "Write my own" yourself. ' +
      'Labels must be short, in the athlete\'s own words rather than clinical labels, avoid near-duplicates, and match the athlete\'s current conversation language. This does not change any coaching state — it only offers optional quick replies. Call at most once per reply.',
    input_schema: {
      type: 'object',
      properties: {
        replies: {
          type: 'array',
          items: { type: 'string', maxLength: QUICK_REPLY_LIMITS.maxLabelLength },
          minItems: QUICK_REPLY_LIMITS.min,
          maxItems: QUICK_REPLY_LIMITS.max,
          description: '2 or 3 short athlete-reply labels, in the current conversation language. Never include "Other" / "Something else" / "Write my own".',
        },
      },
      required: ['replies'],
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

// offer_quick_replies has no coaching-state precondition — it's valid in
// any state (the "no card alongside a new prescription" rule is enforced
// at emission time in chat.js, not here, since it depends on what actually
// got committed this turn, not on the state snapshot at tool-call time).
function validateOfferQuickReplies(input) {
  if (!input || typeof input !== 'object' || !Array.isArray(input.replies)) {
    return { ok: false, error: 'Malformed payload: expected { replies: [string, string, ...] }.' };
  }
  const { replies } = input;
  if (replies.length < QUICK_REPLY_LIMITS.min || replies.length > QUICK_REPLY_LIMITS.max) {
    return { ok: false, error: `replies must contain exactly ${QUICK_REPLY_LIMITS.min} or ${QUICK_REPLY_LIMITS.max} items (got ${replies.length}).` };
  }

  const trimmed = [];
  for (const raw of replies) {
    if (typeof raw !== 'string') {
      return { ok: false, error: 'Each reply must be a string.' };
    }
    const label = raw.trim();
    if (!label) {
      return { ok: false, error: 'Each reply must be non-empty after trimming.' };
    }
    if (label.length > QUICK_REPLY_LIMITS.maxLabelLength) {
      return { ok: false, error: `Each reply must be at most ${QUICK_REPLY_LIMITS.maxLabelLength} characters.` };
    }
    if (FORBIDDEN_QUICK_REPLY_RE.test(label)) {
      return { ok: false, error: 'Reply labels may not contain markup, tool syntax, or control characters.' };
    }
    if (RESERVED_QUICK_REPLY_RE.test(label)) {
      return { ok: false, error: 'Do not offer "Other" / "Something else" / "Write my own" — the app adds that option itself.' };
    }
    trimmed.push(label);
  }

  const seen = new Set();
  for (const label of trimmed) {
    const key = label.toLowerCase();
    if (seen.has(key)) {
      return { ok: false, error: 'Reply labels must be unique — no duplicates.' };
    }
    seen.add(key);
  }

  return { ok: true, replies: trimmed };
}

module.exports = {
  COACHING_TOOLS,
  PROPOSE_BARRIER,
  PRESCRIBE_MENTAL_REP,
  OFFER_QUICK_REPLIES,
  LIMITS,
  QUICK_REPLY_LIMITS,
  CONFIRMATION_VALUES,
  validateProposeBarrier,
  validatePrescribeMentalRep,
  validateOfferQuickReplies,
};
