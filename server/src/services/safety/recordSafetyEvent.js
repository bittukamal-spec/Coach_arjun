const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

// Shared structured SafetyEvent writer for the deterministic screening layer.
// Uses the existing SafetyEvent model exactly as designed: surface +
// triggerType only. NO message content, matched excerpt, or AI-generated
// summary is ever passed in or stored — the model comment in schema.prisma
// ("deliberately stores NO message content or free text") is preserved.
//
// The screening category is encoded in triggerType so events stay
// structured without a schema change (schema work belongs to a later PR):
//   crisis → 'crisis_keyword' (existing value)
//   abuse  → 'abuse_keyword'
//   injury → 'injury_keyword'
//
// Fire-and-forget: a failed event write must never block or break the
// athlete-facing safety response.
//
// `createRecordSafetyEvent` is injectable for tests (same pattern as
// requireGuardianConsent); the default export always uses the real client.
//
// PR-6 adds an optional 4th `source` argument carrying structured
// references only (riskLevel, sourceType, sourceRecordId, chatSessionId,
// userMessageId) — never message content or a matched excerpt. It is
// entirely optional: every existing 3-argument call site is unaffected and
// simply produces rows where these fields are null, exactly like the
// pre-PR-6 rows already in the table.

const CATEGORY_TO_TRIGGER = {
  crisis: 'crisis_keyword',
  abuse: 'abuse_keyword',
  injury: 'injury_keyword',
};

const SOURCE_FIELDS = ['riskLevel', 'sourceType', 'sourceRecordId', 'chatSessionId', 'userMessageId'];

function createRecordSafetyEvent(client = prisma) {
  return function recordSafetyEvent(userId, surface, category, source = {}) {
    const triggerType = CATEGORY_TO_TRIGGER[category] || 'crisis_keyword';
    const data = { userId, surface, triggerType };
    for (const key of SOURCE_FIELDS) {
      if (source && source[key] !== undefined) data[key] = source[key];
    }
    return client.safetyEvent
      .create({ data })
      .catch(err => console.error(`[safety] event write failed (${surface}):`, err?.message));
  };
}

module.exports = createRecordSafetyEvent();
module.exports.createRecordSafetyEvent = createRecordSafetyEvent;
module.exports.CATEGORY_TO_TRIGGER = CATEGORY_TO_TRIGGER;
