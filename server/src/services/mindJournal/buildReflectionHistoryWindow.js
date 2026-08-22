// Compact, bounded representation of an athlete's recent Mind Journal
// reflections (PR 1).
//
// Built for two consumers: the pattern evidence handed to Arjun's Review at
// write time, and — from PR 2 — the unified Coach context projection. It is
// deliberately NOT "the last ten entries as JSON": ten raw reflections would
// dominate a prompt and would re-expose athlete-written narrative text that
// the Coach contract keeps out of coaching.
//
// What goes in: structured tag keys the app itself defined, plus Arjun's own
// previously-generated one-line takeaway.
// What stays out: every "Write my own" field the athlete typed
// (customContext / customEvent / customState / customThought /
// customResponse / customBody) and every legacy narrative field. Those are
// the athlete's own words and are never recycled into a later prompt here.

const MAX_HISTORY_ENTRIES = 10;
// Arjun-authored, already shown to the athlete — safe to echo back, but
// still bounded so one long takeaway cannot blow up the window.
const MAX_TAKEAWAY_LENGTH = 240;

// Only these keys may ever appear on a mapped history item.
const HISTORY_SELECT = {
  entryType: true,
  contextType: true,
  eventTags: true,
  states: true,
  thoughtTags: true,
  responseTags: true,
  bodyTags: true,
  cueFeedback: true,
  arjunTakeaway: true,
  createdAt: true,
};

// Any athlete-authored free text. Asserted against in tests so a future
// field addition cannot quietly leak typed text into the window.
const FORBIDDEN_HISTORY_KEYS = [
  'customContext', 'customEvent', 'customState', 'customThought',
  'customResponse', 'customBody', 'note', 'whatHappened', 'whatNoticed',
  'helpedOrGotInWay', 'takeForward', 'cueWordSnapshot',
  'id', 'userId', 'arjunNoticed', 'arjunPattern',
];

function boundedList(value) {
  return Array.isArray(value) ? value.filter((v) => typeof v === 'string').slice(0, 2) : [];
}

function mapReflectionForHistory(entry) {
  const takeaway = typeof entry.arjunTakeaway === 'string' && entry.arjunTakeaway.trim()
    ? entry.arjunTakeaway.trim().slice(0, MAX_TAKEAWAY_LENGTH)
    : null;
  return {
    contextType: entry.contextType ?? null,
    eventTags: boundedList(entry.eventTags),
    states: boundedList(entry.states),
    thoughtTags: boundedList(entry.thoughtTags),
    responseTags: boundedList(entry.responseTags),
    bodyTags: boundedList(entry.bodyTags),
    cueFeedback: entry.cueFeedback ?? null,
    takeaway,
    createdAt: entry.createdAt,
  };
}

// One compact line per reflection. Empty sections are omitted rather than
// rendered as empty headings.
function formatReflectionHistoryLine(item) {
  const when = new Date(item.createdAt).toISOString().slice(0, 10);
  const parts = [];
  if (item.contextType) parts.push(item.contextType);
  if (item.eventTags.length) parts.push(`event: ${item.eventTags.join(', ')}`);
  if (item.states.length) parts.push(`felt: ${item.states.join(', ')}`);
  if (item.thoughtTags.length) parts.push(`thought: ${item.thoughtTags.join(', ')}`);
  if (item.responseTags.length) parts.push(`did: ${item.responseTags.join(', ')}`);
  if (item.bodyTags.length) parts.push(`body: ${item.bodyTags.join(', ')}`);
  if (item.cueFeedback) parts.push(`cue: ${item.cueFeedback}`);
  if (item.takeaway) parts.push(`takeaway: "${item.takeaway}"`);
  const body = parts.join(' | ');
  return body ? `- ${when}: ${body}` : `- ${when}`;
}

// entries: newest-first REFLECTION rows already loaded by the caller.
function buildReflectionHistoryWindow(entries) {
  if (!Array.isArray(entries) || !entries.length) return [];
  return entries.slice(0, MAX_HISTORY_ENTRIES).map(mapReflectionForHistory);
}

module.exports = {
  buildReflectionHistoryWindow,
  mapReflectionForHistory,
  formatReflectionHistoryLine,
  HISTORY_SELECT,
  FORBIDDEN_HISTORY_KEYS,
  MAX_HISTORY_ENTRIES,
  MAX_TAKEAWAY_LENGTH,
};
