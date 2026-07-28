// Athlete-facing text validation for the main coaching chat.
//
// A production incident showed the buffered tool loop's own internal
// continuation instruction reaching an athlete as a coaching reply, being
// persisted as an assistant Message, and rendering in chat history. The text
// the model produced was a PARAPHRASE of the internal constant, not a
// byte-for-byte copy, so exact-string matching alone is not sufficient — see
// layer D.
//
// This module is pure: no I/O, no Prisma, no Anthropic, no logging. Callers
// decide what to do with a rejection and log only the returned reasonCode —
// never the rejected text, which may quote the athlete.
//
// It is deliberately conservative in one direction: a false NEGATIVE shows the
// athlete a slightly odd reply, while a false POSITIVE suppresses real
// coaching. Every layer therefore matches multi-token structures, never single
// common words like "tool" or "JSON" on their own.

// ── Normalisation (comparison only — never what gets emitted) ───────────────
// Lowercase, unify apostrophe variants, strip punctuation that does not change
// meaning, collapse whitespace. Deliberately keeps [ ] { } < > : _ so the
// structural and marker layers can still see tool/markup syntax.
function normalize(text) {
  return String(text || '')
    .toLowerCase()
    .replace(/[‘’ʼ′]/g, "'")
    .replace(/[“”]/g, '"')
    // Devanagari danda counts as sentence punctuation too.
    .replace(/[,.!?;"“”()।॥]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// ── Layer A: high-confidence signatures ─────────────────────────────────────
// Verbatim fragments of the server's own orchestration copy (the recovery
// instruction and the tool_result notes). Any one of these in an athlete-facing
// reply is unambiguous — no coaching sentence contains them.
const INTERNAL_SIGNATURES = [
  'tool action has already been accepted',
  'produce the final athlete-facing response',
  'produce the final athlete facing response',
  'write your final athlete-facing reply',
  'write your final athlete facing reply',
  'do not call another tool',
  'produce the final response text now',
  'reply choices are already staged',
  'reply choices are staged',
  'do not call offer_quick_replies again',
  'barrier hypothesis staged',
  'prescription staged',
  'outcome staged',
  'only one coaching-state transition is allowed',
];

// ── Layer B: structural internal content ────────────────────────────────────
// Tool-protocol identifiers and markup that can only come from orchestration.
const STRUCTURAL_TOKENS = [
  'tool_use_id',
  'tool_use',
  'tool_result',
  'function_calls',
  '<invoke',
  'antml:',
  'internal instruction',
  'system prompt',
];
// Coaching tool names are only ever orchestration output when they appear as
// bare identifiers — an athlete-facing reply never names them.
const TOOL_NAMES = [
  'propose_barrier',
  'prescribe_mental_rep',
  'offer_quick_replies',
  'record_prescription_outcome',
];
// A JSON-shaped tool payload: brace/bracket opening plus a protocol field.
const JSON_PAYLOAD_FIELD_RE = /"(?:name|input|type|tool_use_id|is_error)"\s*:/;

// ── Layer C: legacy markers ─────────────────────────────────────────────────
// Zero-or-more inside the tag, so an EMPTY marker is caught too: the leaked
// instruction contained a literal "[SUGGEST:]" and "[APP:]", which the old
// one-or-more patterns in bufferedToolLoop.js did not match.
const APP_TAG_RE = /\[APP:[^\]]*\]/gi;
const SUGGEST_TAG_RE = /\[SUGGEST:[^\]]*\]/gi;

// ── Layer D: paraphrased orchestration ──────────────────────────────────────
// The founder's actual leaked text dropped "[APP:]" from the constant, so it
// matched no exact signature. Two co-occurring imperative families — a
// prohibition plus a machine-output noun — is the structure that survives
// paraphrase.
const PROHIBITION_RE = /\bdo not (output|call|write|use|include|produce|emit)\b/;
const MACHINE_NOUN_RE = /\b(json|tool syntax|tool call|tool|markers?|marker syntax)\b/;
const FINAL_OUTPUT_DEMAND_RE = /\b(produce|write|generate|output)\b[^.]{0,40}\b(final|athlete-facing|athlete facing|response text|reply text)\b/;

// ── Layer E: acknowledgement-only replies ───────────────────────────────────
// Deliberately narrow: only a very short reply that is pure agreement, asks
// nothing, and is not a natural sign-off. "That helps narrow it down. What
// changes first?" is longer and asks a question, so it passes untouched.
const ACK_MAX_WORDS = 6;
const ACK_ONLY_RE = new RegExp(
  '^(' +
    // English
    "yes|yeah|yep|no|ok|okay|right|exactly|perfect|great|good|correct|true|" +
    "that's it|thats it|that is it|got it|understood|makes sense|fair enough|" +
    "sounds right|sounds good|agreed|noted|" +
    // Hindi (Devanagari)
    'हाँ|हां|बिल्कुल|सही|ठीक|ठीक है|यही है|समझ गया|समझ गयी|सही है|बिल्कुल सही|' +
    // Hinglish (Latin)
    'haan|han|bilkul|sahi|thik|theek|theek hai|thik hai|wahi hai|sahi hai|samajh gaya|bilkul sahi' +
  // Not \b: JavaScript word boundaries are ASCII-only, so they never fire
  // after a Devanagari character. Anchoring on whitespace-or-end works for
  // both scripts.
  ')(\\s|$)',
  'i'
);
// A reply that is genuinely wrapping the conversation up may be short.
const CLOSING_RE = /\b(good luck|all the best|see you|talk (later|tomorrow|soon)|catch you|take care|bye|शुभकामनाएँ|शुभकामनाएं|फिर मिलते|अच्छा खेलो|शुभ रात्रि|milte hain|phir milte)\b/i;
// A real question needs a question mark plus something to ask about.
function hasMeaningfulQuestion(normalized, raw) {
  if (!/[?？]/.test(raw)) return false;
  return normalized.split(' ').filter(Boolean).length >= 3;
}

// ── Safety bypass ───────────────────────────────────────────────────────────
// A validator must never be able to swallow an approved safety response. The
// primary signal is the caller's own prior safety state (opts.safetyBypass);
// the fixed approved copy is recognised here as a second, narrow guard so a
// caller that forgets the flag still cannot suppress a helpline.
const APPROVED_SAFETY_FRAGMENTS = [
  'stop playing immediately',
  'abhi khelna band karo',
  'you deserve real support',
  'icall',
  'kiran',
];
const HELPLINE_RE = /\b(9152987821|1800-599-0019|112)\b/;

function isApprovedSafetyText(text) {
  const n = normalize(text);
  if (HELPLINE_RE.test(text)) return true;
  return APPROVED_SAFETY_FRAGMENTS.some((f) => n.includes(f));
}

// ── Public API ──────────────────────────────────────────────────────────────
// Returns { ok: true } or { ok: false, reasonCode, layer }.
//
// reasonCode values (stable — safe to log, never contains athlete content):
//   INTERNAL_ORCHESTRATION_TEXT | INTERNAL_STRUCTURAL_CONTENT |
//   INTERNAL_MARKER_TEXT | PARAPHRASED_ORCHESTRATION | ACKNOWLEDGEMENT_ONLY |
//   LIKELY_TYPO_ECHO | EMPTY_TEXT
//
// opts:
//   safetyBypass          — caller knows a safety response is being delivered
//   checkAcknowledgement  — set false where a bare acknowledgement is fine
//   languageHints         — { highConfidence: [{ observed, intended }] } from
//                           sportLanguageHints; enables layer F below
function validateAthleteText(text, opts = {}) {
  const raw = typeof text === 'string' ? text.trim() : '';
  if (!raw) return { ok: false, reasonCode: 'EMPTY_TEXT', layer: 'empty' };

  // Safety always wins, before any rejection layer can run.
  if (opts.safetyBypass || isApprovedSafetyText(raw)) return { ok: true };

  const n = normalize(raw);

  // A — verbatim orchestration copy
  for (const sig of INTERNAL_SIGNATURES) {
    if (n.includes(sig)) return { ok: false, reasonCode: 'INTERNAL_ORCHESTRATION_TEXT', layer: 'A' };
  }

  // B — tool protocol / control payloads
  const lower = raw.toLowerCase();
  for (const tok of STRUCTURAL_TOKENS) {
    if (lower.includes(tok)) return { ok: false, reasonCode: 'INTERNAL_STRUCTURAL_CONTENT', layer: 'B' };
  }
  for (const name of TOOL_NAMES) {
    if (lower.includes(name)) return { ok: false, reasonCode: 'INTERNAL_STRUCTURAL_CONTENT', layer: 'B' };
  }
  if (/^[[{]/.test(raw) && JSON_PAYLOAD_FIELD_RE.test(raw)) {
    return { ok: false, reasonCode: 'INTERNAL_STRUCTURAL_CONTENT', layer: 'B' };
  }

  // C — the reply is ABOUT the internal markers (as opposed to merely ending
  // with a cosmetic tag, which sanitizeFinalText strips before we get here).
  if (APP_TAG_RE.test(raw) || SUGGEST_TAG_RE.test(raw)) {
    APP_TAG_RE.lastIndex = 0; SUGGEST_TAG_RE.lastIndex = 0;
    return { ok: false, reasonCode: 'INTERNAL_MARKER_TEXT', layer: 'C' };
  }
  APP_TAG_RE.lastIndex = 0; SUGGEST_TAG_RE.lastIndex = 0;

  // D — paraphrased orchestration
  const prohibition = PROHIBITION_RE.test(n);
  const machineNoun = MACHINE_NOUN_RE.test(n);
  const finalDemand = FINAL_OUTPUT_DEMAND_RE.test(n);
  const families = [prohibition && machineNoun, finalDemand, /\banother tool\b/.test(n)].filter(Boolean).length;
  if (families >= 2 || (prohibition && machineNoun && /\bmarkers?\b/.test(n))) {
    return { ok: false, reasonCode: 'PARAPHRASED_ORCHESTRATION', layer: 'D' };
  }

  // F — echoing a likely transcription error back as though it were real.
  // Only fires when a high-confidence sport-language hint exists for THIS
  // message. The intended phrase is always allowed, and so is a paraphrase
  // that avoids both — a reply is only rejected for repeating the mistake
  // while never using the intended meaning. A clarification question that
  // quotes the phrase ("Did you mean swing bowling?") is allowed, because it
  // is asking rather than asserting.
  const hints = opts.languageHints?.highConfidence || [];
  for (const hint of hints) {
    const observed = String(hint.observed || '').toLowerCase();
    const intended = String(hint.intended || '').toLowerCase();
    if (!observed || !n.includes(observed)) continue;
    if (n.includes(intended)) continue;          // used the intended phrase too
    if (/[?？]/.test(raw)) continue;              // asking, not asserting
    return { ok: false, reasonCode: 'LIKELY_TYPO_ECHO', layer: 'F' };
  }

  // E — acknowledgement-only
  if (opts.checkAcknowledgement !== false) {
    const words = n.split(' ').filter(Boolean);
    if (
      words.length <= ACK_MAX_WORDS &&
      ACK_ONLY_RE.test(n) &&
      !hasMeaningfulQuestion(n, raw) &&
      !CLOSING_RE.test(raw)
    ) {
      return { ok: false, reasonCode: 'ACKNOWLEDGEMENT_ONLY', layer: 'E' };
    }
  }

  return { ok: true };
}

module.exports = {
  validateAthleteText,
  isApprovedSafetyText,
  normalize,
  APP_TAG_RE,
  SUGGEST_TAG_RE,
  INTERNAL_SIGNATURES,
  ACK_MAX_WORDS,
};
