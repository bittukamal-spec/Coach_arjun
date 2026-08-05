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
];

module.exports = { CONTEXT_TYPE_KEYS };
