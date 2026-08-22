// Fixed context-type vocabulary for guided Mind Journal reflections
// (PR 1 of the redesign). Mirrors the MindJournalContextType Prisma enum
// exactly — kept as a plain array here (not read from Prisma) so validation
// stays fast, dependency-free, and unit-testable without a database.

const CONTEXT_TYPE_KEYS = [
  'TRAINING',
  'COMPETITION',
  'TOUGH_MOMENT',
  'RECOVERY_DAY',
  'SOMETHING_ELSE',
  // Unified reflection (PR 1) — additive. RECOVERY_DAY above is retained
  // unchanged for historical guided rows and is not offered at Q1 any more.
  'WENT_WELL',
  'CONFIDENCE_PRESSURE',
  'SELECTION_TRIAL',
  'RECOVERY_INJURY',
  'OUTSIDE_SPORT',
];

// The nine Q1 choices the unified reflection actually offers, in screen
// order. SOMETHING_ELSE is the "Write my own" choice and stays last.
const REFLECTION_CONTEXT_KEYS = [
  'TRAINING',
  'COMPETITION',
  'TOUGH_MOMENT',
  'WENT_WELL',
  'CONFIDENCE_PRESSURE',
  'SELECTION_TRIAL',
  'RECOVERY_INJURY',
  'OUTSIDE_SPORT',
  'SOMETHING_ELSE',
];

module.exports = { CONTEXT_TYPE_KEYS, REFLECTION_CONTEXT_KEYS };
