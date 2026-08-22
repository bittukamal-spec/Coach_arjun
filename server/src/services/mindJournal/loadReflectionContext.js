// Unified reflection context for the main coaching chat (PR 2 cutover).
//
// After the cutover there is exactly ONE reflection system — the Mind
// Journal — so there is exactly one reflection block in Arjun's prompt.
// This module builds it, and it is the only place reflection history is
// allowed to reach Coach.
//
// ── Privacy contract ────────────────────────────────────────────────────
// Gated by the single existing athlete control, User.mindJournalContextEnabled
// (default false). Consent off → null: no Mind Journal reflection, and no
// legacy Debrief either. That is a NARROWING of the previous behaviour, in
// which the old `## Recent Post-Match Debriefs` section was injected
// unconditionally with no athlete control at all. Nothing here broadens
// consent: the legacy fields surfaced below are exactly the three the old
// unconditional section already surfaced (wentWell / doDifferently /
// nextFocus), now bounded, capped, and behind the toggle.
//
// New Mind Journal reflections are NOT sent as raw entries. They go through
// buildReflectionHistoryWindow's compact structured projection — tag keys
// the app itself defined plus Arjun's own stored one-line takeaway. Every
// "Write my own" field the athlete typed (customContext / customEvent /
// customState / customThought / customResponse / customBody) stays out.
//
// Historical Debrief rows are read-only here: this module only ever reads
// them, never writes, migrates, or deletes.

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const {
  buildReflectionHistoryWindow,
  formatReflectionHistoryLine,
  HISTORY_SELECT,
  MAX_HISTORY_ENTRIES,
} = require('./buildReflectionHistoryWindow');

// Approved window for the new reflection system.
const MAX_REFLECTIONS = MAX_HISTORY_ENTRIES; // 10
// Unchanged from the old unconditional injection — the legacy tail is not
// widened by moving it behind consent.
const MAX_LEGACY_DEBRIEFS = 2;
// Legacy Debrief text is athlete-written and unbounded in the old model.
const MAX_LEGACY_FIELD_LENGTH = 240;

// The only Debrief columns that may ever be read for Coach context — the
// exact three the retired prompt section already used.
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
// than rendered as empty headings — same shape as the Mind Journal lines.
function formatLegacyReflectionLine(item) {
  const when = new Date(item.createdAt).toISOString().slice(0, 10);
  const parts = [];
  if (item.wentWell) parts.push(`went well: "${item.wentWell}"`);
  if (item.doDifferently) parts.push(`do differently: "${item.doDifferently}"`);
  if (item.nextFocus) parts.push(`next focus: "${item.nextFocus}"`);
  const body = parts.join(' | ');
  return body ? `- ${when}: ${body}` : `- ${when}`;
}

// Renders the single reflection block. Returns '' when there is nothing to
// show, so the prompt never carries an empty heading.
function buildReflectionContextSection(context) {
  if (!context) return '';
  const reflections = Array.isArray(context.reflections) ? context.reflections : [];
  const legacy = Array.isArray(context.legacy) ? context.legacy : [];
  if (!reflections.length && !legacy.length) return '';

  const blocks = [];
  if (reflections.length) {
    blocks.push(`Recent Mind Journal reflections (newest first):\n${reflections.map(formatReflectionHistoryLine).join('\n')}`);
  }
  if (legacy.length) {
    blocks.push(`Older reflections the athlete wrote in the retired reflection tool (read-only history):\n${legacy.map(formatLegacyReflectionLine).join('\n')}`);
  }

  return `## Recent Reflections — athlete opted in
The athlete turned on Mind Journal context, so their recent reflections are available to you as background only.
${blocks.join('\n\n')}
How to use this:
- Do not diagnose, label, or profile the athlete from these reflections.
- Do not assume anything here is still true today — if it seems relevant, ask them about it.
- Do not treat a reflection as a confirmed barrier, and never confirm a barrier from reflections alone.
- Do not automatically prescribe a Mental Rep from reflections — a prescription still needs the normal coaching flow (clarify barrier → athlete confirms → one approved Mental Rep).
- Do not calculate or infer any score, rating, or ranking from these.
- What the athlete says in THIS conversation always takes priority over this history.
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
    // Consent off → no reflection context of any kind, new or legacy.
    if (!user?.mindJournalContextEnabled) return null;

    const [entries, debriefs] = await Promise.all([
      client.mindJournalEntry.findMany({
        where: { userId, entryType: 'REFLECTION' },
        orderBy: { createdAt: 'desc' },
        take: MAX_REFLECTIONS,
        select: HISTORY_SELECT,
      }).catch(() => []),
      client.debrief.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        take: MAX_LEGACY_DEBRIEFS,
        select: LEGACY_DEBRIEF_SELECT,
      }).catch(() => []),
    ]);

    const reflections = buildReflectionHistoryWindow(entries);
    const legacy = (debriefs || []).slice(0, MAX_LEGACY_DEBRIEFS).map(mapLegacyDebrief);
    if (!reflections.length && !legacy.length) return null;

    return { reflections, legacy };
  };
}

module.exports = createLoadReflectionContext();
module.exports.createLoadReflectionContext = createLoadReflectionContext;
module.exports.buildReflectionContextSection = buildReflectionContextSection;
module.exports.formatLegacyReflectionLine = formatLegacyReflectionLine;
module.exports.mapLegacyDebrief = mapLegacyDebrief;
module.exports.LEGACY_DEBRIEF_SELECT = LEGACY_DEBRIEF_SELECT;
module.exports.FORBIDDEN_LEGACY_KEYS = FORBIDDEN_LEGACY_KEYS;
module.exports.MAX_REFLECTIONS = MAX_REFLECTIONS;
module.exports.MAX_LEGACY_DEBRIEFS = MAX_LEGACY_DEBRIEFS;
module.exports.MAX_LEGACY_FIELD_LENGTH = MAX_LEGACY_FIELD_LENGTH;
