// The single reflection-context pipeline for the main coaching chat.
//
// After the PR 2 cutover the Mind Journal is Arjun's only reflection system,
// so Coach gets exactly ONE reflection block, built here: one consent gate,
// one chronology across every source, one total cap, one prompt section.
//
// ── Sources ─────────────────────────────────────────────────────────────
//   1. new unified reflections      (MindJournalEntry, entryType REFLECTION)
//   2. older Mind Journal shapes    (MindJournalEntry, Quick Note / Guided /
//                                    pre-typed legacy rows)
//   3. historical reflections       (Debrief, from the retired tool)
//
// They are merged by actual entry date, newest first, and truncated to
// MAX_TOTAL_ENTRIES records IN TOTAL — never a cap per source. The ten most
// recent eligible records across the whole history are all Coach ever sees.
//
// ── Privacy contract ────────────────────────────────────────────────────
// Gated by the single athlete control, User.mindJournalContextEnabled
// (default false). Consent off → null: nothing is injected and nothing is
// even queried, from any source.
//
// Unifying the paths changed WHICH records are eligible, never WHAT a record
// exposes. Each source keeps the exact projection it had:
//   - REFLECTION rows → buildReflectionHistoryWindow's compact structured
//     projection (tag keys the app defined + Arjun's own stored takeaway).
//     Every "Write my own" field the athlete typed stays out.
//   - older Mind Journal rows → loadMindJournalContext's restricted mapping,
//     unchanged (guided narratives are never selected).
//   - Debrief rows → only wentWell / doDifferently / nextFocus, the exact
//     three the retired unconditional prompt section already surfaced, now
//     bounded and behind the consent gate.
//
// Historical rows are read-only here: this module only ever reads. No
// migration, no backfill, no write of any kind.

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const {
  mapReflectionForHistory,
  formatReflectionHistoryLine,
  HISTORY_SELECT,
} = require('./buildReflectionHistoryWindow');
const {
  mapEntryForCoach,
  formatMindJournalContextLine,
  COACH_CONTEXT_SELECT,
} = require('./loadMindJournalContext');

// The approved window: ten reflection records in total, across all sources.
const MAX_TOTAL_ENTRIES = 10;

// Legacy Debrief text is athlete-written and unbounded in the old model.
const MAX_LEGACY_FIELD_LENGTH = 240;

// Source markers. Only these three values ever appear on a mapped item, and
// each one selects both its projection above and its line renderer below.
const SOURCE_REFLECTION = 'reflection';
const SOURCE_JOURNAL = 'journal';
const SOURCE_LEGACY_DEBRIEF = 'legacy_debrief';

// The only Debrief columns that may ever be read for Coach context.
const LEGACY_DEBRIEF_SELECT = {
  wentWell: true,
  doDifferently: true,
  nextFocus: true,
  createdAt: true,
};

// Debrief columns that must never reach Coach context through this module.
// Asserted against in tests so a later field addition cannot quietly widen it.
const FORBIDDEN_LEGACY_KEYS = [
  'id', 'userId', 'arjunInsight', 'mode', 'eventType', 'resultType',
  'wentWellChips', 'wentWellText', 'wouldChange', 'wouldChangeText',
  'cueWordFeedback', 'sport', 'xpAwarded',
];

function bounded(value) {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed.length > MAX_LEGACY_FIELD_LENGTH
    ? trimmed.slice(0, MAX_LEGACY_FIELD_LENGTH)
    : trimmed;
}

function mapLegacyDebrief(row) {
  return {
    wentWell: bounded(row.wentWell),
    doDifferently: bounded(row.doDifferently),
    nextFocus: bounded(row.nextFocus),
    createdAt: row.createdAt,
  };
}

// One compact line per legacy reflection. Empty fields are omitted rather
// than rendered as empty headings — same shape as the other renderers.
function formatLegacyReflectionLine(item) {
  const when = new Date(item.createdAt).toISOString().slice(0, 10);
  const parts = [];
  if (item.wentWell) parts.push(`went well: "${item.wentWell}"`);
  if (item.doDifferently) parts.push(`do differently: "${item.doDifferently}"`);
  if (item.nextFocus) parts.push(`next focus: "${item.nextFocus}"`);
  const body = parts.join(' | ');
  return body ? `- ${when}: ${body}` : `- ${when}`;
}

// Each item renders through its own source's formatter, so a record is
// described exactly as its source allows and never normalized into a wider
// shared shape.
function formatReflectionLine(item) {
  if (item.source === SOURCE_REFLECTION) return formatReflectionHistoryLine(item);
  if (item.source === SOURCE_LEGACY_DEBRIEF) return formatLegacyReflectionLine(item);
  return formatMindJournalContextLine(item);
}

// Newest first. Deterministic tie-break on source order so two records
// sharing a timestamp always render in the same sequence.
const SOURCE_ORDER = [SOURCE_REFLECTION, SOURCE_JOURNAL, SOURCE_LEGACY_DEBRIEF];
function byNewestFirst(a, b) {
  const diff = new Date(b.createdAt) - new Date(a.createdAt);
  if (diff !== 0) return diff;
  return SOURCE_ORDER.indexOf(a.source) - SOURCE_ORDER.indexOf(b.source);
}

// Merges the already-projected items from every source into the single
// bounded history. Exported so the selection rule can be tested directly.
function mergeReflectionContext(reflections = [], journalEntries = [], legacyDebriefs = []) {
  return [
    ...reflections.map((e) => ({ source: SOURCE_REFLECTION, ...mapReflectionForHistory(e) })),
    ...journalEntries.map((e) => ({ source: SOURCE_JOURNAL, ...mapEntryForCoach(e) })),
    ...legacyDebriefs.map((e) => ({ source: SOURCE_LEGACY_DEBRIEF, ...mapLegacyDebrief(e) })),
  ]
    .sort(byNewestFirst)
    .slice(0, MAX_TOTAL_ENTRIES);
}

// Renders the one reflection block. Returns '' when there is nothing to
// show, so the prompt never carries an empty heading.
function buildReflectionContextSection(items) {
  if (!Array.isArray(items) || !items.length) return '';

  return `## Recent Reflections — athlete opted in
The athlete turned on Mind Journal context, so their ${MAX_TOTAL_ENTRIES} most recent reflections are available to you as background only, newest first:
${items.map(formatReflectionLine).join('\n')}
How to use this:
- Do not diagnose, label, or profile the athlete from these reflections.
- Do not assume one thing here caused another, and do not assume anything here is still true today — if it seems relevant, ask them about it.
- Do not treat a reflection as a confirmed barrier, and never confirm a barrier from reflections alone.
- Do not automatically prescribe a Mental Rep from reflections — a prescription still needs the normal coaching flow (clarify barrier → athlete confirms → one approved Mental Rep).
- Do not calculate or infer any score, rating, or ranking from these.
- Use this only where it is genuinely relevant; what the athlete says in THIS conversation always takes priority.
- You are not required to mention their reflections.`;
}

// `client` is injectable (same pattern used throughout this codebase) so
// tests can supply a fixture instead of a real database.
function createLoadReflectionContext(client = prisma) {
  return async function loadReflectionContext(userId) {
    const user = await client.user.findUnique({
      where: { id: userId },
      select: { mindJournalContextEnabled: true },
    });
    // Consent off → nothing queried and nothing injected, from any source.
    if (!user?.mindJournalContextEnabled) return null;

    // Three small bounded reads, not an unbounded merge: the newest ten of
    // any one source is the most that source can contribute to the newest
    // ten overall, so ten from each is exactly enough to be correct.
    const [reflections, journalEntries, legacyDebriefs] = await Promise.all([
      client.mindJournalEntry.findMany({
        where: { userId, entryType: 'REFLECTION' },
        orderBy: { createdAt: 'desc' },
        take: MAX_TOTAL_ENTRIES,
        select: HISTORY_SELECT,
      }).catch(() => []),
      client.mindJournalEntry.findMany({
        where: { userId, entryType: { not: 'REFLECTION' } },
        orderBy: { createdAt: 'desc' },
        take: MAX_TOTAL_ENTRIES,
        select: COACH_CONTEXT_SELECT,
      }).catch(() => []),
      client.debrief.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        take: MAX_TOTAL_ENTRIES,
        select: LEGACY_DEBRIEF_SELECT,
      }).catch(() => []),
    ]);

    const items = mergeReflectionContext(reflections, journalEntries, legacyDebriefs);
    return items.length ? items : null;
  };
}

module.exports = createLoadReflectionContext();
module.exports.createLoadReflectionContext = createLoadReflectionContext;
module.exports.buildReflectionContextSection = buildReflectionContextSection;
module.exports.mergeReflectionContext = mergeReflectionContext;
module.exports.formatReflectionLine = formatReflectionLine;
module.exports.formatLegacyReflectionLine = formatLegacyReflectionLine;
module.exports.mapLegacyDebrief = mapLegacyDebrief;
module.exports.LEGACY_DEBRIEF_SELECT = LEGACY_DEBRIEF_SELECT;
module.exports.FORBIDDEN_LEGACY_KEYS = FORBIDDEN_LEGACY_KEYS;
module.exports.MAX_TOTAL_ENTRIES = MAX_TOTAL_ENTRIES;
module.exports.MAX_LEGACY_FIELD_LENGTH = MAX_LEGACY_FIELD_LENGTH;
module.exports.SOURCE_REFLECTION = SOURCE_REFLECTION;
module.exports.SOURCE_JOURNAL = SOURCE_JOURNAL;
module.exports.SOURCE_LEGACY_DEBRIEF = SOURCE_LEGACY_DEBRIEF;
