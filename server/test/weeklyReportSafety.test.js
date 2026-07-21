// Behavioral tests for the weekly-report safety short-circuit (correction
// to PR-5, kept through the per-cycle refactor): flagged stored content must abort generation entirely — zero
// Anthropic calls, one structured event, no raw text passed anywhere. Uses
// the injectable factory (createGenerateCycleReview) with a fully
// stubbed database and Anthropic client — no real DB, no network.

const test = require('node:test');
const assert = require('node:assert/strict');
const { createGenerateCycleReview } = require('../src/routes/weeklyReports');

// Any completed cycle works for these tests — the safety behavior is
// window-independent.
const CYCLE = {
  sessionId: 'cs-archived-1',
  cycleStart: new Date('2026-07-06T09:00:00.000Z'),
  cycleEnd: new Date('2026-07-13T09:00:00.000Z'),
};

function makeDbStub({ messages = [], existingReport = null }) {
  const created = [];
  return {
    created,
    db: {
      weeklyReport: {
        findUnique: async () => existingReport,
        create: async (args) => {
          created.push(args.data);
          // A real Prisma create() always returns the persisted row,
          // including its generated id — the stub mirrors that so
          // production code can reference report.id.
          return { id: `wr-${created.length}`, ...args.data };
        },
      },
      message: {
        findMany: async () => messages,
      },
      user: {
        findUnique: async () => ({ language: 'en' }),
      },
    },
  };
}

function messagesOf(...contents) {
  return contents.map((content, i) => ({ content, createdAt: new Date(Date.now() - (contents.length - i) * 1000) }));
}

test('flagged stored content: zero Anthropic calls', async () => {
  const { db, created } = makeDbStub({
    messages: messagesOf('had a good session today', 'felt strong', 'I want to end my life'),
  });
  let anthropicCalls = 0;
  const generate = createGenerateCycleReview({
    db,
    recordEvent: () => {}, // keep this test free of the real (DB-backed) writer
    createAnthropicClient: () => {
      anthropicCalls += 1; // constructing the client counts as "an Anthropic call was attempted"
      return { messages: { create: async () => { throw new Error('should never be called'); } } };
    },
  });

  await generate('user-1', CYCLE);

  assert.equal(anthropicCalls, 0);
  assert.equal(created.length, 1);
});

test('safe stored content: reaches the stubbed Anthropic path', async () => {
  const { db, created } = makeDbStub({
    messages: messagesOf('had a good session today', 'felt strong', 'ready for the next match'),
  });
  let anthropicCalls = 0;
  const generate = createGenerateCycleReview({
    db,
    createAnthropicClient: () => {
      anthropicCalls += 1;
      return {
        messages: {
          create: async () => ({ content: [{ text: 'Great week overall.' }] }),
        },
      };
    },
  });

  await generate('user-2', CYCLE);

  assert.equal(anthropicCalls, 1);
  assert.equal(created.length, 1);
  assert.equal(created[0].content, 'Great week overall.');
});

test('exactly one structured event is requested for the report operation, regardless of how many messages flag', async () => {
  const { db } = makeDbStub({
    messages: messagesOf('coach hits me after every loss', 'I want to die', 'normal message'),
  });
  const eventCalls = [];
  const generate = createGenerateCycleReview({
    db,
    recordEvent: (...args) => { eventCalls.push(args); },
    createAnthropicClient: () => ({ messages: { create: async () => { throw new Error('must not be called'); } } }),
  });

  await generate('user-3', CYCLE);

  assert.equal(eventCalls.length, 1, 'expected exactly one recordEvent call for the whole report request');
});

test('raw athlete text is never passed to the event writer', async () => {
  const { db } = makeDbStub({ messages: messagesOf('safe one', 'safe two', 'I want to end my life') });
  const eventCalls = [];
  const generate = createGenerateCycleReview({
    db,
    recordEvent: (...args) => { eventCalls.push(args); },
    createAnthropicClient: () => ({ messages: { create: async () => { throw new Error('must not be called'); } } }),
  });

  await generate('user-4', CYCLE);

  assert.equal(eventCalls.length, 1);
  const [userId, surface, category, source] = eventCalls[0];
  assert.equal(userId, 'user-4');
  assert.equal(surface, 'weekly_report');
  assert.equal(category, 'crisis');
  // A 4th argument (structured source) is now passed, but it must only ever
  // carry structured references — never the athlete's raw text.
  assert.equal(eventCalls[0].length, 4);
  for (const arg of eventCalls[0]) {
    assert.doesNotMatch(String(arg), /end my life/);
  }
  assert.doesNotMatch(JSON.stringify(source), /end my life/);
});

test('the event writer receives the real, already-persisted fallback report id as sourceRecordId — never an invented one', async () => {
  const { db, created } = makeDbStub({ messages: messagesOf('safe one', 'safe two', 'I want to end my life') });
  const eventCalls = [];
  const generate = createGenerateCycleReview({
    db,
    recordEvent: (...args) => { eventCalls.push(args); },
    createAnthropicClient: () => ({ messages: { create: async () => { throw new Error('must not be called'); } } }),
  });

  await generate('user-4b', CYCLE);

  assert.equal(created.length, 1, 'the fallback report must already be persisted before the event is recorded');
  const [, , , source] = eventCalls[0];
  assert.equal(source.sourceType, 'weekly_report');
  assert.equal(source.sourceRecordId, 'wr-1');
  assert.equal(source.riskLevel, 'high');
});

test('event writer failure still prevents Anthropic and still writes the fallback report', async () => {
  const { db, created } = makeDbStub({ messages: messagesOf('safe one', 'safe two', 'I want to die') });
  let anthropicCalls = 0;
  const generate = createGenerateCycleReview({
    db,
    recordEvent: () => { throw new Error('writer down'); }, // synchronous failure
    createAnthropicClient: () => {
      anthropicCalls += 1;
      return { messages: { create: async () => ({ content: [{ text: 'should not run' }] }) } };
    },
  });

  await assert.doesNotReject(() => generate('user-5', CYCLE));
  assert.equal(anthropicCalls, 0);
  assert.equal(created.length, 1);
  assert.notEqual(created[0].content, 'should not run');
});

test('duplicate-event prevention: an existing report row (the pre-existing per-cycle dedup key) skips generation entirely on the next call', async () => {
  const { db } = makeDbStub({ existingReport: { id: 'r1' } });
  let anthropicCalls = 0;
  let eventCalls = 0;
  const generate = createGenerateCycleReview({
    db,
    recordEvent: () => { eventCalls += 1; },
    createAnthropicClient: () => { anthropicCalls += 1; return { messages: { create: async () => ({ content: [{ text: 'x' }] }) } }; },
  });

  await generate('user-6', CYCLE);

  assert.equal(anthropicCalls, 0);
  assert.equal(eventCalls, 0);
});

test('fewer than 3 messages: no event, no Anthropic call, nothing created', async () => {
  const { db, created } = makeDbStub({ messages: messagesOf('I want to die') });
  let eventCalls = 0;
  const generate = createGenerateCycleReview({
    db,
    recordEvent: () => { eventCalls += 1; },
    createAnthropicClient: () => ({ messages: { create: async () => ({ content: [{ text: 'x' }] }) } }),
  });

  await generate('user-7', CYCLE);

  assert.equal(eventCalls, 0);
  assert.equal(created.length, 0);
});
