// Pure, framework-free helpers for the structured coaching reply-chip SSE
// event (`{ t: "quick_replies", replies: [{ id, label }, ...] }`). Kept
// separate from ChatPage.jsx (which contains JSX) so this logic is directly
// testable with Node's built-in test runner — same pattern as
// serverCardEvent.js and chatReminders.js.
//
// This module only prepares the client to render server-offered reply
// chips; it never creates a coaching transition, calls a new endpoint, or
// changes coaching behavior. The legacy `[SUGGEST:...]` tag mechanism
// (extractSuggestions in ChatPage.jsx) is untouched and keeps working for
// historical stored messages alongside this.

const MIN_REPLIES = 2;
const MAX_REPLIES = 3;
const MAX_LABEL_LENGTH = 100;

function isValidReply(reply) {
  return (
    !!reply &&
    typeof reply === 'object' &&
    typeof reply.id === 'string' &&
    reply.id.length > 0 &&
    typeof reply.label === 'string' &&
    reply.label.trim().length > 0 &&
    reply.label.length <= MAX_LABEL_LENGTH
  );
}

// Parses one already-JSON-parsed SSE event object. Returns a normalized
// array of { id, label } on success, or null for anything malformed,
// incomplete, or out of bounds — callers must never crash or display raw
// JSON when this returns null, and the SSE stream must keep processing
// later events regardless.
export function parseQuickRepliesEvent(data) {
  if (!data || data.t !== 'quick_replies') return null;
  const replies = data.replies;
  if (!Array.isArray(replies)) return null;
  if (replies.length < MIN_REPLIES || replies.length > MAX_REPLIES) return null;

  const ids = new Set();
  const normalized = [];
  for (const reply of replies) {
    if (!isValidReply(reply)) return null;
    if (ids.has(reply.id)) return null; // duplicate ids are rejected, not deduped silently
    ids.add(reply.id);
    normalized.push({ id: reply.id, label: reply.label });
  }
  return normalized;
}

export { MIN_REPLIES, MAX_REPLIES, MAX_LABEL_LENGTH };
