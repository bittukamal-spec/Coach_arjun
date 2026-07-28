// Conservative, sport-aware interpretation hints for likely spelling and
// voice-transcription errors in an athlete's message.
//
// Founder testing showed Arjun repeating obvious transcription errors back to
// the athlete as though they were real terms — "wing bowling" (swing bowling)
// and "wing shot" (wrong shot), both in unmistakable cricket context.
//
// This is NOT a spellchecker and NOT a dictionary. It is a very small set of
// narrowly-scoped rules, each requiring BOTH a near-miss phrase AND supporting
// context from the same message, so a real term can never trip one. It is pure:
// no I/O, no model call, no logging, and it never rewrites or mutates the
// athlete's message — the stored Message is always exactly what they typed.
//
// The output is internal only: it is injected into the model's system context
// (see buildLanguageHintSection) so Arjun can use or paraphrase the intended
// meaning, and it is never shown, streamed or persisted.

// Real terminology that must never be "corrected". Checked before any rule
// fires, so a message containing the correct term is left completely alone.
const PROTECTED_TERMS = [
  'swing bowling', 'swing bowler', 'swing', 'outswinger', 'inswinger',
  'out swinger', 'in swinger', 'seam bowling', 'seamer', 'pace bowling',
  'spin bowling', 'yorker', 'bouncer', 'slower ball', 'googly', 'doosra',
  'crease', 'edge', 'edged', 'leave', 'play late', 'leg side', 'off side',
  'wrong shot', 'wrong un',
];

// Comparison form only — never used to alter stored text.
function normalize(text) {
  return String(text || '')
    .toLowerCase()
    .replace(/[‘’ʼ]/g, "'")
    .replace(/[^\p{L}\p{N}\p{M}\s']/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// ── Rule A: "wing bowling" → "swing bowling" ────────────────────────────────
// Requires cricket + a bowling-facing context in the same message.
const WING_BOWLING_RE = /\bwing (bowling|bowlers|bowler|bowl)\b/;
const BOWLING_CONTEXT_RE = /\b(bowl|bowling|bowler|ball|balls|facing|face|faced|play|playing|played|bat|batting|afraid|scared|fear|struggle|struggling|trouble|nervous)\b/;

// ── Rule B: "wing shot" → "wrong shot" ──────────────────────────────────────
// Requires cricket + a rushed/mistimed/dismissal context in the same message.
const WING_SHOT_RE = /\bwing shot\b/;
const WRONG_SHOT_CONTEXT_RE = /\b(rush|rushed|rushing|hurry|hurried|badly|bad|mistime|mistimed|mistiming|got out|get out|getting out|dismissed|wicket|out\b|select|selection|choose|chose|choosing|wrong)\b/;

const RULES = [
  {
    reasonCode: 'CRICKET_SWING_BOWLING_TRANSCRIPTION',
    sports: ['cricket'],
    match: WING_BOWLING_RE,
    context: BOWLING_CONTEXT_RE,
    observed: (m) => `wing ${m[1]}`,
    intended: (m) => `swing ${m[1]}`,
  },
  {
    reasonCode: 'CRICKET_WRONG_SHOT_TRANSCRIPTION',
    sports: ['cricket'],
    match: WING_SHOT_RE,
    context: WRONG_SHOT_CONTEXT_RE,
    observed: () => 'wing shot',
    intended: () => 'wrong shot',
  },
];

// True when the message already contains the correct specialist term the rule
// would otherwise "fix" — e.g. someone writing about swing bowling correctly.
function mentionsProtectedTerm(normalized, intended) {
  if (normalized.includes(intended)) return true;
  return PROTECTED_TERMS.some((term) => term !== 'swing' && normalized.includes(term) && intended.includes(term));
}

// sport: the athlete's sport id/name. message: their latest message. context:
// optional recent conversation text, already available to the caller — used
// ONLY to widen the supporting-context check, never to invent a rule.
// Returns { highConfidence: [{ observed, intended, reasonCode }] }.
function getSportLanguageHints({ sport, message, context = '' } = {}) {
  const sportKey = String(sport || '').toLowerCase().trim();
  const normalized = normalize(message);
  if (!normalized) return { highConfidence: [] };
  const contextHaystack = `${normalized} ${normalize(context)}`.trim();

  const highConfidence = [];
  const seen = new Set();
  for (const rule of RULES) {
    if (!rule.sports.includes(sportKey)) continue;
    const m = normalized.match(rule.match);
    if (!m) continue;
    if (!rule.context.test(contextHaystack)) continue;
    const intended = rule.intended(m);
    if (mentionsProtectedTerm(normalized, intended)) continue;
    const observed = rule.observed(m);
    if (seen.has(observed)) continue;
    seen.add(observed);
    highConfidence.push({ observed, intended, reasonCode: rule.reasonCode });
  }
  return { highConfidence };
}

// Internal system-context note. Never shown to the athlete, never persisted,
// never sent as a synthetic user message — it is appended to the system prompt
// only. Carries no athlete identifiers.
function buildLanguageHintSection(hints) {
  const list = hints?.highConfidence || [];
  if (!list.length) return '';
  const lines = list
    .map((h) => `- The athlete may have meant "${h.intended}" when they wrote "${h.observed}".`)
    .join('\n');
  return `\n\n## Language interpretation note (internal)
${lines}
Use or paraphrase the intended meaning naturally. Do not mention the spelling correction, and do not quote the likely mistaken phrase back to them. If the rest of the conversation contradicts this reading, ask one short clarification instead.`;
}

// Safe to log: reason codes and a count only — never the observed or intended
// text, and never any part of the athlete's message.
function describeHints(hints) {
  const list = hints?.highConfidence || [];
  return { hintCount: list.length, reasonCodes: list.map((h) => h.reasonCode) };
}

module.exports = {
  getSportLanguageHints,
  buildLanguageHintSection,
  describeHints,
  normalize,
  PROTECTED_TERMS,
};
