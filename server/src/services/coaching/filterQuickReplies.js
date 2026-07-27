// Final server-side quick-reply filtering, applied after the assistant's text
// exists and before any chip reaches the client.
//
// validateOfferQuickReplies (coachingTools.js) runs at TOOL time, before the
// reply text is written, so it structurally cannot compare a chip against the
// assistant's own sentence or the athlete's last message. Founder testing hit
// exactly that gap: Arjun replied "Yes, that's it." and offered a chip reading
// "Yes, that's it".
//
// This pass FILTERS rather than rejecting — a bad chip should never cost the
// athlete the whole reply. Below two survivors we emit no chips at all and the
// athlete simply types, which is always available anyway. Pure: no I/O, no AI,
// no embeddings — normalised string comparison only.

const MIN_REPLIES = 2;
const MAX_REPLIES = 3;

// Comparison form only — never what is displayed. Lowercase, unify apostrophe
// and quote variants, drop punctuation, strip combining marks so "haan" and
// "हाँ"-style variants compare stably, then collapse whitespace.
function normalizeForCompare(text) {
  return String(text || '')
    .toLowerCase()
    .replace(/[‘’ʼ′`]/g, "'")
    .replace(/[“”]/g, '"')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '') // Latin diacritics only
    .normalize('NFC')
    .replace(/[.,!?;:"'()\[\]{}—–-]/g, ' ')
    .replace(/[।॥]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// Tool/control syntax or a legacy marker has no business in a chip label.
const CHIP_INTERNAL_RE = /\[APP:[^\]]*\]|\[SUGGEST:[^\]]*\]|tool_use|tool_result|<[a-zA-Z!/]|[{}]|[\x00-\x1F\x7F]/;

// Bare agreement carries no information as a chip: tapping it tells Arjun
// nothing he does not already have from the athlete's previous message.
const BARE_ACK_RE = /^(yes|yeah|yep|no|ok|okay|right|exactly|perfect|correct|true|that's it|thats it|that is it|got it|agreed|sure|haan|han|bilkul|sahi|thik|theek|हाँ|हां|बिल्कुल|सही|ठीक)$/i;

// The assistant's last sentence, in comparison form. A chip that simply
// restates the question Arjun just asked adds nothing.
function finalSentenceOf(text) {
  const parts = String(text || '')
    .split(/(?<=[.!?।])\s+/)
    .map((s) => s.trim())
    .filter(Boolean);
  return parts.length ? parts[parts.length - 1] : '';
}

// labels: string[] already validated by validateOfferQuickReplies.
// context: { finalText, athleteMessage, acknowledgedAlready }
// Returns a (possibly empty) array — callers emit nothing below MIN_REPLIES.
function filterQuickReplies(labels, context = {}) {
  if (!Array.isArray(labels) || labels.length === 0) return [];

  const assistantNorm = normalizeForCompare(context.finalText);
  const assistantFinalNorm = normalizeForCompare(finalSentenceOf(context.finalText));
  const athleteNorm = normalizeForCompare(context.athleteMessage);

  const kept = [];
  const seen = new Set();

  for (const raw of labels) {
    if (typeof raw !== 'string') continue;
    const label = raw.trim();
    if (!label) continue;                                  // empty
    if (CHIP_INTERNAL_RE.test(label)) continue;            // markers / tool syntax

    const key = normalizeForCompare(label);
    if (!key) continue;
    if (seen.has(key)) continue;                           // duplicate of another chip
    if (assistantFinalNorm && key === assistantFinalNorm) continue; // repeats Arjun's question
    if (assistantNorm && assistantNorm === key) continue;  // repeats the whole reply
    if (athleteNorm && key === athleteNorm) continue;      // repeats what the athlete just said
    if (BARE_ACK_RE.test(key)) continue;                   // agreement already expressed

    seen.add(key);
    kept.push(label);
    if (kept.length === MAX_REPLIES) break;
  }

  // Never pad back up to the minimum with invented options.
  return kept.length >= MIN_REPLIES ? kept : [];
}

module.exports = {
  filterQuickReplies,
  normalizeForCompare,
  finalSentenceOf,
  MIN_REPLIES,
  MAX_REPLIES,
};
