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

const CATEGORY_TO_TRIGGER = {
  crisis: 'crisis_keyword',
  abuse: 'abuse_keyword',
  injury: 'injury_keyword',
};

function createRecordSafetyEvent(client = prisma) {
  return function recordSafetyEvent(userId, surface, category) {
    const triggerType = CATEGORY_TO_TRIGGER[category] || 'crisis_keyword';
    return client.safetyEvent
      .create({ data: { userId, surface, triggerType } })
      .catch(err => console.error(`[safety] event write failed (${surface}):`, err?.message));
  };
}

module.exports = createRecordSafetyEvent();
module.exports.createRecordSafetyEvent = createRecordSafetyEvent;
module.exports.CATEGORY_TO_TRIGGER = CATEGORY_TO_TRIGGER;
