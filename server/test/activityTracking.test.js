// Unit tests for touchActivity (Pilot Tracking Phase 2A). Injectable-client
// pattern — no database, no real Prisma client construction.

const test = require('node:test');
const assert = require('node:assert/strict');
const { createTouchActivity } = require('../src/services/activityTracking');

function makeStubClient({ throwOnUpdate = false } = {}) {
  const calls = [];
  return {
    calls,
    user: {
      update: async ({ where, data }) => {
        calls.push({ where, data });
        if (throwOnUpdate) throw new Error('simulated database failure');
        return { id: where.id, ...data };
      },
    },
  };
}

test('touchActivity sets lastActiveAt via a single User.update call', async () => {
  const client = makeStubClient();
  const touchActivity = createTouchActivity(client);

  await touchActivity('user-1');

  assert.equal(client.calls.length, 1);
  assert.equal(client.calls[0].where.id, 'user-1');
  assert.ok(client.calls[0].data.lastActiveAt instanceof Date);
});

test('touchActivity defaults occurredAt to "now" (within a generous margin)', async () => {
  const client = makeStubClient();
  const touchActivity = createTouchActivity(client);

  const before = Date.now();
  await touchActivity('user-1');
  const after = Date.now();

  const written = client.calls[0].data.lastActiveAt.getTime();
  assert.ok(written >= before && written <= after);
});

test('an explicit occurredAt is used verbatim — for backfill/test use', async () => {
  const client = makeStubClient();
  const touchActivity = createTouchActivity(client);
  const explicit = new Date('2026-01-15T10:00:00Z');

  await touchActivity('user-1', explicit);

  assert.equal(client.calls[0].data.lastActiveAt.getTime(), explicit.getTime());
});

test('a Prisma/database failure is caught and swallowed — touchActivity never rejects', async () => {
  const client = makeStubClient({ throwOnUpdate: true });
  const touchActivity = createTouchActivity(client);

  await assert.doesNotReject(() => touchActivity('user-1'));
});

test('the swallowed failure is logged with a message only — no userId, no request data', async () => {
  const client = makeStubClient({ throwOnUpdate: true });
  const touchActivity = createTouchActivity(client);

  const originalError = console.error;
  const logs = [];
  console.error = (...args) => logs.push(args.map(String).join(' '));
  try {
    await touchActivity('user-should-not-appear-in-logs');
  } finally {
    console.error = originalError;
  }

  const joined = logs.join('\n');
  assert.match(joined, /touchActivity failed/);
  assert.doesNotMatch(joined, /user-should-not-appear-in-logs/);
});

test('a missing/falsy userId is a no-op — no write attempted, never throws', async () => {
  const client = makeStubClient();
  const touchActivity = createTouchActivity(client);

  await assert.doesNotReject(() => touchActivity(undefined));
  await assert.doesNotReject(() => touchActivity(null));
  await assert.doesNotReject(() => touchActivity(''));
  assert.equal(client.calls.length, 0);
});

// ── The critical execution-order contract ───────────────────────────────
// touchActivity itself has no opinion on ordering — this documents the
// contract callers must follow (see activityTracking.js's own comment and
// every call site's placement after its route's real write).

test('touchActivity performs exactly one write per call — callers control whether/when it runs, never touchActivity itself', async () => {
  const client = makeStubClient();
  const touchActivity = createTouchActivity(client);

  await touchActivity('user-1');
  await touchActivity('user-1');

  assert.equal(client.calls.length, 2, 'touchActivity does not itself debounce — that is a caller/future concern, not a correctness requirement here');
});
