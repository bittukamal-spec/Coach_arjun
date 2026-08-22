// Restricted Coach projection for the OLDER Mind Journal shapes — Quick
// Note, the two-page Guided Reflection, and pre-typed legacy rows.
//
// This module no longer loads anything and no longer builds a prompt
// section of its own. Since the PR 2 amendment there is exactly ONE
// reflection-context pipeline (loadReflectionContext.js): one consent gate,
// one chronology across every source, one total cap, one prompt section.
// What lives here is the part that must not change — the field mapping that
// decides what Coach may see of these historical shapes:
//
//   - QUICK_NOTE: entryType, states, customState, note, createdAt
//   - GUIDED_REFLECTION: entryType, contextType, customContext, states,
//     customState, takeForward, createdAt
//   - legacy (entryType null): entryType null, states, note, createdAt
//   - never: whatHappened, whatNoticed, helpedOrGotInWay (and never note
//     on guided). Restricted narratives are not selected from Prisma.
//
// The unified pipeline reuses this projection verbatim, so consolidating the
// paths widened nothing about these rows.

const MAX_NOTE_LENGTH = 500;
const MAX_TAKE_FORWARD_LENGTH = 500;
const MAX_CUSTOM_STATE_LENGTH = 30;
const MAX_CUSTOM_CONTEXT_LENGTH = 80;

// Fields the Coach contract may surface. Restricted guided narratives are
// intentionally omitted so they are never even fetched for Coach.
const COACH_CONTEXT_SELECT = {
  entryType: true,
  contextType: true,
  customContext: true,
  states: true,
  customState: true,
  note: true,
  takeForward: true,
  createdAt: true,
};

// Keys that must never appear on a Coach-facing mapped object.
const FORBIDDEN_COACH_KEYS = ['whatHappened', 'whatNoticed', 'helpedOrGotInWay', 'id', 'userId', 'score', 'rating'];

function asBoundedString(value, maxLength) {
  if (typeof value !== 'string') return null;
  // Defensive cap matching validation maxima — never rewrites labels.
  return value.length > maxLength ? value.slice(0, maxLength) : value;
}

function normalizeStates(states) {
  return Array.isArray(states) ? states.filter((s) => typeof s === 'string').slice(0, 2) : [];
}

// Deterministic per-entry mapping. Exported for focused contract tests.
function mapEntryForCoach(entry) {
  const createdAt = entry.createdAt;
  const states = normalizeStates(entry.states);

  if (entry.entryType === 'GUIDED_REFLECTION') {
    return {
      entryType: 'GUIDED_REFLECTION',
      contextType: entry.contextType ?? null,
      customContext: asBoundedString(entry.customContext, MAX_CUSTOM_CONTEXT_LENGTH),
      states,
      customState: asBoundedString(entry.customState, MAX_CUSTOM_STATE_LENGTH),
      takeForward: asBoundedString(entry.takeForward, MAX_TAKE_FORWARD_LENGTH),
      createdAt,
    };
  }

  if (entry.entryType === 'QUICK_NOTE') {
    return {
      entryType: 'QUICK_NOTE',
      states,
      customState: asBoundedString(entry.customState, MAX_CUSTOM_STATE_LENGTH),
      note: asBoundedString(entry.note, MAX_NOTE_LENGTH),
      createdAt,
    };
  }

  // Legacy null-entryType rows: conservative Quick-Note-style fields only.
  // Do not fabricate QUICK_NOTE / contextType / customState / customContext /
  // takeForward.
  return {
    entryType: null,
    states,
    note: asBoundedString(entry.note, MAX_NOTE_LENGTH),
    createdAt,
  };
}

// Compact deterministic prompt line. Athlete-authored strings are quoted
// verbatim. Empty optional fields are omitted — no empty headings.
function formatMindJournalContextLine(e) {
  const when = new Date(e.createdAt).toISOString().slice(0, 10);
  const states = Array.isArray(e.states) && e.states.length ? e.states.join(', ') : null;
  const parts = [];

  if (e.entryType === 'GUIDED_REFLECTION') {
    parts.push('Guided Reflection');
    // Prefer athlete-written customContext as the meaningful context display
    // when present; otherwise the fixed contextType enum. Never show both
    // "Something else" and the custom text as awkward duplicates.
    if (e.customContext) parts.push(`context: "${e.customContext}"`);
    else if (e.contextType) parts.push(`context: ${e.contextType}`);
    if (states) parts.push(`states: ${states}`);
    if (e.customState) parts.push(`custom state: "${e.customState}"`);
    if (e.takeForward) parts.push(`take forward: "${e.takeForward}"`);
  } else if (e.entryType === 'QUICK_NOTE') {
    parts.push('Quick Note');
    if (states) parts.push(`states: ${states}`);
    if (e.customState) parts.push(`custom state: "${e.customState}"`);
    if (e.note) parts.push(`note: "${e.note}"`);
  } else {
    // Legacy null-entryType: keep the previous compact useful shape.
    if (states) parts.push(states);
    if (e.note) parts.push(`note: "${e.note}"`);
  }

  const body = parts.join(' | ');
  return body ? `- ${when}: ${body}` : `- ${when}`;
}

module.exports = {
  mapEntryForCoach,
  formatMindJournalContextLine,
  COACH_CONTEXT_SELECT,
  FORBIDDEN_COACH_KEYS,
};
