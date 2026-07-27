// Defensive, secondary-only filter for assistant text that is unmistakably
// internal server orchestration rather than coaching.
//
// The server is the primary protection: validateAthleteText.js rejects this
// content before it is ever persisted or streamed. This exists for messages
// already stored in history before that protection shipped, so an athlete
// scrolling back never sees one.
//
// Deliberately NARROWER than the server validator: only the high-confidence
// verbatim signatures, no paraphrase heuristic. A client false positive
// silently hides real coaching from an athlete with no way to recover it, so
// this errs firmly toward showing the message.

const INTERNAL_SIGNATURES = [
  'tool action has already been accepted',
  'produce the final athlete-facing response',
  'produce the final athlete facing response',
  'write your final athlete-facing reply',
  'do not call another tool',
  'produce the final response text now',
  'reply choices are already staged',
];

// Fixed, content-free code for logging. Never log message or athlete text.
export const INTERNAL_CONTENT_FILTERED = 'internal_content_filtered';

function normalize(text) {
  return String(text || '')
    .toLowerCase()
    .replace(/[‘’ʼ]/g, "'")
    .replace(/[,.!?;"“”()]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// True only for text that could not plausibly be a coaching reply.
export function isInternalContent(text) {
  if (typeof text !== 'string' || !text.trim()) return false;
  const n = normalize(text);
  return INTERNAL_SIGNATURES.some((sig) => n.includes(sig));
}

// Drops assistant messages that are internal content. User messages are never
// filtered — the athlete's own words always belong to them.
export function filterInternalMessages(messages, onFiltered) {
  if (!Array.isArray(messages)) return [];
  const kept = [];
  for (const m of messages) {
    if (m && m.role === 'assistant' && isInternalContent(m.content)) {
      if (typeof onFiltered === 'function') onFiltered(INTERNAL_CONTENT_FILTERED);
      continue;
    }
    kept.push(m);
  }
  return kept;
}

export { INTERNAL_SIGNATURES };
