// Unit tests for the shared SafetyEvent writer, using an injected stub
// client (same pattern as requireGuardianConsent) — no database.

const test = require('node:test');
const assert = require('node:assert/strict');
const { createRecordSafetyEvent, CATEGORY_TO_TRIGGER } = require('../src/services/safety/recordSafetyEvent');

function makeStub() {
  const calls = [];
  return {
    calls,
    client: {
      safetyEvent: {
        create: async (args) => { calls.push(args); return {}; },
      },
    },
  };
}

test('maps each screening category to its structured triggerType', async () => {
  assert.deepEqual(CATEGORY_TO_TRIGGER, {
    crisis: 'crisis_keyword',
    abuse: 'abuse_keyword',
    injury: 'injury_keyword',
  });

  const { calls, client } = makeStub();
  const record = createRecordSafetyEvent(client);

  await record('user-1', 'chat', 'crisis');
  await record('user-1', 'debrief', 'abuse');
  await record('user-1', 'body_reset', 'injury');

  assert.deepEqual(calls.map(c => c.data), [
    { userId: 'user-1', surface: 'chat', triggerType: 'crisis_keyword' },
    { userId: 'user-1', surface: 'debrief', triggerType: 'abuse_keyword' },
    { userId: 'user-1', surface: 'body_reset', triggerType: 'injury_keyword' },
  ]);
});

test('never receives or stores message content — data is userId/surface/triggerType only', async () => {
  const { calls, client } = makeStub();
  await createRecordSafetyEvent(client)('user-2', 'self_talk', 'crisis');
  assert.deepEqual(Object.keys(calls[0].data).sort(), ['surface', 'triggerType', 'userId']);
});

test('is fire-and-forget: a failing write is swallowed, never thrown', async () => {
  const failing = { safetyEvent: { create: async () => { throw new Error('db down'); } } };
  await assert.doesNotReject(() => createRecordSafetyEvent(failing)('user-3', 'chat', 'crisis'));
});

// ── PR-6: structured source references ──────────────────────────────────────

test('structured source references are passed through to the Prisma create call', async () => {
  const { calls, client } = makeStub();
  await createRecordSafetyEvent(client)('user-4', 'chat', 'crisis', {
    riskLevel: 'high',
    sourceType: 'message',
    sourceRecordId: 'msg-1',
    chatSessionId: 'session-1',
    userMessageId: 'msg-1',
  });

  assert.deepEqual(calls[0].data, {
    userId: 'user-4',
    surface: 'chat',
    triggerType: 'crisis_keyword',
    riskLevel: 'high',
    sourceType: 'message',
    sourceRecordId: 'msg-1',
    chatSessionId: 'session-1',
    userMessageId: 'msg-1',
  });
});

test('old callers without the optional source argument remain valid — extra fields are simply absent, not null-filled', async () => {
  const { calls, client } = makeStub();
  await createRecordSafetyEvent(client)('user-5', 'debrief', 'abuse');

  assert.deepEqual(Object.keys(calls[0].data).sort(), ['surface', 'triggerType', 'userId']);
});

test('a partial source object only sets the fields it provides', async () => {
  const { calls, client } = makeStub();
  await createRecordSafetyEvent(client)('user-6', 'self_talk', 'injury', { riskLevel: 'high' });

  assert.deepEqual(calls[0].data, {
    userId: 'user-6',
    surface: 'self_talk',
    triggerType: 'injury_keyword',
    riskLevel: 'high',
  });
});

test('raw content, matched excerpts, and free-text notes are never accepted into the stored data, even if a caller tries to pass them', async () => {
  const { calls, client } = makeStub();
  await createRecordSafetyEvent(client)('user-7', 'chat', 'crisis', {
    riskLevel: 'high',
    content: 'the athlete said something concerning',
    matchedExcerpt: 'kill myself',
    note: 'founder note',
  });

  const keys = Object.keys(calls[0].data);
  assert.ok(!keys.includes('content'));
  assert.ok(!keys.includes('matchedExcerpt'));
  assert.ok(!keys.includes('note'));
  assert.equal(calls[0].data.riskLevel, 'high');
});
