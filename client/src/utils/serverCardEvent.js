// Pure, framework-free helpers for the structured server-issued Mental Rep
// card SSE event (PR-9: `{ t: "card", card: {...} }`). Kept separate from
// ChatPage.jsx (which contains JSX) so this logic is directly testable with
// Node's built-in test runner without a JSX transform — same pattern as
// chatReminders.js.
//
// This module only prepares the client to render a server-issued card; it
// does not create prescriptions, call new endpoints, or change coaching
// behavior. The legacy `[APP:...]` tag mechanism (parseArjunMessage.js) is
// untouched and keeps working alongside this.

const REQUIRED_STRING_FIELDS = ['prescriptionId', 'practiceKey', 'situation', 'cardContent'];

// A card is valid only when every required field is a non-empty string and
// cueWord (if present at all) is either null/undefined or a string. Any
// other shape is rejected outright — never partially rendered.
export function isValidServerCard(card) {
  if (!card || typeof card !== 'object') return false;
  for (const key of REQUIRED_STRING_FIELDS) {
    if (typeof card[key] !== 'string' || card[key].trim().length === 0) return false;
  }
  if (card.cueWord !== undefined && card.cueWord !== null && typeof card.cueWord !== 'string') return false;
  return true;
}

// Parses one already-JSON-parsed SSE event object. Returns a normalized
// card object on success, or null for anything malformed/incomplete —
// callers must never crash or display raw JSON when this returns null.
export function parseServerCardEvent(data) {
  if (!data || data.t !== 'card') return null;
  const card = data.card;
  if (!isValidServerCard(card)) return null;
  return {
    prescriptionId: card.prescriptionId,
    practiceKey: card.practiceKey,
    situation: card.situation,
    cardContent: card.cardContent,
    cueWord: card.cueWord ?? null,
  };
}

// Appends `card` to `existingCards` only if it's valid and its
// prescriptionId isn't already present — prescriptionId is the identity;
// a card without one is rejected rather than given an invented id.
export function mergeUniqueServerCard(existingCards, card) {
  if (!card || typeof card.prescriptionId !== 'string' || !card.prescriptionId) return existingCards;
  if (existingCards.some((c) => c.prescriptionId === card.prescriptionId)) return existingCards;
  return [...existingCards, card];
}
