// Optional Arjun context load for the score-free Mind Journal (main
// coaching chat ONLY — never Quick Chat, profile-intro, weekly reports,
// visualization, self-talk generation, body reset, debrief, or any founder
// view). Makes no Anthropic call itself; purely a data read.
//
// Privacy-minimizing Coach contract (final pilot mapping):
//   - consent off (User.mindJournalContextEnabled default false) → null
//   - latest 5 owned entries, newest-first, EXCLUDING unified REFLECTION
//     rows: since the PR 2 cutover those are the reflection system and reach
//     Coach only through loadReflectionContext.js's compact structured
//     window. Excluding them here is what keeps one reflection from being
//     represented twice in the same prompt, and keeps this loader's older
//     free-text contract (note / takeForward / customState / customContext)
//     off reflections entirely.
//   - QUICK_NOTE: entryType, states, customState, note, createdAt
//   - GUIDED_REFLECTION: entryType, contextType, customContext, states,
//     customState, takeForward, createdAt
//   - legacy (entryType null): entryType null, states, note, createdAt
//   - never: whatHappened, whatNoticed, helpedOrGotInWay (and never note
//     on guided). Restricted narratives are not selected from Prisma.

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const MAX_ENTRIES = 5;
const MAX_NOTE_LENGTH = 500;
const MAX_TAKE_FORWARD_LENGTH = 500;
const MAX_CUSTOM_STATE_LENGTH = 30;
const MAX_CUSTOM_CONTEXT_LENGTH = 80;

// Fields the Coach contract may surface. Restricted guided narratives are
// intentionally omitted so they never enter this loader's memory.
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

function buildMindJournalContextSection(mindJournalEntries) {
  if (!mindJournalEntries || !mindJournalEntries.length) return '';
  const lines = mindJournalEntries.map(formatMindJournalContextLine).join('\n');

  return `## Optional Mind Journal Context — athlete opted in
The athlete opted in to share their latest Mind Journal entries as background context only.
These are athlete-authored journal notes — optional background, not a diagnosis, not readiness, and not a substitute for the normal coaching loop:
${lines}
This is optional background context only, nothing more:
- Do not calculate or infer a score from these states.
- Do not diagnose or profile the athlete from this list.
- Do not treat a journal state as proof of a barrier, and never confirm a barrier from journal entries alone.
- Do not automatically prescribe a Mental Rep from journal entries — a prescription still requires the normal coaching-state flow (clarify barrier → confirm → one approved Mental Rep).
- Do not skip focused questions, barrier confirmation, or follow-up because a journal entry exists.
- Do not gate any feature, tool, or progress on journal entries.
- If something here seems relevant, ask the athlete directly rather than assuming it still applies.
- What the athlete says in THIS conversation always takes priority over this context.
- Never say a state is objectively good or bad — "nervous" and "tired" are simply what the athlete noticed, not problems to fix by default.
- You are not required to mention the journal.`;
}

// `prisma` is injectable (same pattern used throughout this codebase) so
// tests can supply a fixture instead of a real database; the default
// export below always uses the real Prisma client.
function createLoadMindJournalContext(client = prisma) {
  return async function loadMindJournalContext(userId) {
    const user = await client.user.findUnique({
      where: { id: userId },
      select: { mindJournalContextEnabled: true },
    });
    if (!user?.mindJournalContextEnabled) return null;

    const entries = await client.mindJournalEntry.findMany({
      where: { userId, entryType: { not: 'REFLECTION' } },
      orderBy: { createdAt: 'desc' },
      take: MAX_ENTRIES,
      select: COACH_CONTEXT_SELECT,
    });
    if (!entries.length) return null;

    return entries.map(mapEntryForCoach);
  };
}

module.exports = createLoadMindJournalContext();
module.exports.createLoadMindJournalContext = createLoadMindJournalContext;
module.exports.mapEntryForCoach = mapEntryForCoach;
module.exports.formatMindJournalContextLine = formatMindJournalContextLine;
module.exports.buildMindJournalContextSection = buildMindJournalContextSection;
module.exports.COACH_CONTEXT_SELECT = COACH_CONTEXT_SELECT;
module.exports.FORBIDDEN_COACH_KEYS = FORBIDDEN_COACH_KEYS;
module.exports.MAX_ENTRIES = MAX_ENTRIES;
