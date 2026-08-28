// Push Notifications v1 — services/pushScheduler.js. The 'web-push' package
// is replaced in the require cache with a controllable in-memory fake
// (same technique as pushSend.test.js), and pushSend.js/pushScheduler.js
// are freshly required under it so every send in these tests is fully
// deterministic — no network, no real VAPID keys, no real database, and no
// real clock (every test injects its own fixed `now`).
//
// The fake Prisma client below stores its own independent copies of every
// row and returns/accepts independent objects on every call — exactly like
// the real `@prisma/client` does. Concretely this means: mutating a row via
// updateMany()/update() never reaches back into a `pref`/`sub` object a
// test already holds from an earlier call. This matters for real
// correctness here — processOnePreference's claim-release logic
// (`data: { lastSentLocalDate: pref.lastSentLocalDate }`) relies on the
// `pref` object it was called with staying exactly as it was read, even
// after the function's own earlier `updateMany()` claim call. Assertions
// below therefore always re-read current state through the client
// (`getPref`/`getSub`), never through a stale local variable.

const test = require('node:test');
const assert = require('node:assert/strict');

const webPushPath = require.resolve('web-push');

// endpoint -> 'success' | number (statusCode to throw)
let sendBehavior = {};
let sendCalls = [];

class FakeWebPushError extends Error {
  constructor(statusCode) {
    super('push service rejected the request');
    this.statusCode = statusCode;
  }
}

require.cache[webPushPath] = {
  id: webPushPath,
  filename: webPushPath,
  loaded: true,
  exports: {
    setVapidDetails: () => {},
    sendNotification: async (subscription, payload) => {
      sendCalls.push({ endpoint: subscription.endpoint, payload });
      const behavior = sendBehavior[subscription.endpoint] ?? 'success';
      if (behavior === 'success') return { statusCode: 201 };
      throw new FakeWebPushError(behavior);
    },
  },
};

process.env.VAPID_SUBJECT = 'mailto:test@example.test';
process.env.VAPID_PUBLIC_KEY = 'test-public-key';
process.env.VAPID_PRIVATE_KEY = 'test-private-key';

const pushSendPath = require.resolve('../src/services/pushSend');
const pushSchedulerPath = require.resolve('../src/services/pushScheduler');
delete require.cache[pushSendPath];
delete require.cache[pushSchedulerPath];
require(pushSendPath).__resetConfigForTests();

const { processOnePreference, runSweepOnce, createPushScheduler, SYSTEM_REMINDER_TIME } = require(pushSchedulerPath);

test.beforeEach(() => {
  sendBehavior = {};
  sendCalls = [];
});

// ── In-memory fake Prisma client ────────────────────────────────────────

let nextId = 1;
function makePreference(overrides = {}) {
  return {
    id: overrides.id || `pref-${nextId++}`,
    userId: overrides.userId || `user-${nextId}`,
    enabled: true,
    reminderTime: '18:00',
    timezone: 'Asia/Kolkata',
    lastSentLocalDate: null,
    ...overrides,
  };
}
function makeSubscription(overrides = {}) {
  return {
    id: overrides.id || `sub-${nextId++}`,
    userId: overrides.userId,
    endpoint: overrides.endpoint || `https://push.example/${nextId}`,
    p256dh: 'p', auth: 'a',
    disabledAt: null,
    ...overrides,
  };
}

// `preferences`/`subscriptions` store independent clones of the seed rows —
// never the exact objects a test passes to processOnePreference() — so
// in-place mutation inside the fake's updateMany()/update() can never leak
// back into a variable the test already holds. Real Prisma behaves the
// same way: every query returns a fresh object.
function makeFakeClient({ preferences = [], subscriptions = [], usersById = {} } = {}) {
  const storedPreferences = preferences.map((p) => ({ ...p }));
  const storedSubscriptions = subscriptions.map((s) => ({ ...s }));

  return {
    pushNotificationPreference: {
      findMany: async ({ where }) => storedPreferences
        .filter((p) => {
          if (where.enabled !== undefined && p.enabled !== where.enabled) return false;
          if (where.reminderTime?.not === null && p.reminderTime === null) return false;
          if (where.timezone?.not === null && p.timezone === null) return false;
          return true;
        })
        .map((p) => ({ ...p })),
      updateMany: async ({ where, data }) => {
        const rows = storedPreferences.filter((p) => p.id === where.id && p.lastSentLocalDate === where.lastSentLocalDate);
        rows.forEach((p) => Object.assign(p, data));
        return { count: rows.length };
      },
      update: async ({ where, data }) => {
        const p = storedPreferences.find((p) => p.id === where.id);
        if (p) Object.assign(p, data);
        return p ? { ...p } : null;
      },
    },
    pushSubscription: {
      findMany: async ({ where }) => storedSubscriptions
        .filter((s) => s.userId === where.userId && (where.disabledAt === null ? s.disabledAt == null : true))
        .map((s) => ({ ...s })),
      update: async ({ where, data }) => {
        const s = storedSubscriptions.find((s) => s.id === where.id);
        if (s) Object.assign(s, data);
        return s ? { ...s } : null;
      },
    },
    user: {
      findUnique: async ({ where }) => (usersById[where.id] ? { ...usersById[where.id] } : null),
    },
    __getPref: (id) => storedPreferences.find((p) => p.id === id),
    __getSub: (id) => storedSubscriptions.find((s) => s.id === id),
  };
}

// ── processOnePreference: due / not-due / already-sent ──────────────────

test('the v1 fixed system reminder time is 18:00', () => {
  assert.equal(SYSTEM_REMINDER_TIME, '18:00');
});

test('a due athlete within the window is sent, and lastSentLocalDate is set', async () => {
  const seedPref = makePreference({ userId: 'u1', reminderTime: '18:00', timezone: 'UTC' });
  const seedSub = makeSubscription({ userId: 'u1' });
  const client = makeFakeClient({ preferences: [seedPref], subscriptions: [seedSub], usersById: { u1: { language: 'en' } } });
  const now = new Date('2026-08-26T18:03:00Z');

  const result = await processOnePreference(client, { ...seedPref }, now);
  assert.equal(result.status, 'sent');
  assert.equal(client.__getPref(seedPref.id).lastSentLocalDate, '2026-08-26');
  assert.equal(sendCalls.length, 1);
  assert.equal(sendCalls[0].endpoint, seedSub.endpoint);
});

test('an athlete outside the due window is skipped and untouched', async () => {
  const seedPref = makePreference({ userId: 'u2', reminderTime: '18:00', timezone: 'UTC' });
  const seedSub = makeSubscription({ userId: 'u2' });
  const client = makeFakeClient({ preferences: [seedPref], subscriptions: [seedSub] });

  for (const isoTime of ['2026-08-26T17:59:00Z', '2026-08-26T18:11:00Z']) {
    const result = await processOnePreference(client, { ...seedPref }, new Date(isoTime));
    assert.equal(result.status, 'not_due');
  }
  assert.equal(client.__getPref(seedPref.id).lastSentLocalDate, null);
  assert.equal(sendCalls.length, 0);
});

test('already sent today is skipped — one reminder per athlete per local day', async () => {
  const seedPref = makePreference({ userId: 'u3', reminderTime: '18:00', timezone: 'UTC', lastSentLocalDate: '2026-08-26' });
  const seedSub = makeSubscription({ userId: 'u3' });
  const client = makeFakeClient({ preferences: [seedPref], subscriptions: [seedSub] });

  const result = await processOnePreference(client, { ...seedPref }, new Date('2026-08-26T18:05:00Z'));
  assert.equal(result.status, 'already_sent_today');
  assert.equal(sendCalls.length, 0);
});

test('correct IANA timezone handling: the fixed 18:00 reminder is evaluated against the ATHLETE\'S local date, not the raw UTC instant\'s', async () => {
  // America/Phoenix is UTC-7 with no DST (fixed offset — no seasonal
  // ambiguity in a test). At UTC 2026-08-26T01:05:00Z the Phoenix local
  // clock reads 2026-08-25 18:05 — inside the fixed due window, but on
  // the PREVIOUS calendar day relative to UTC.
  const seedPref = makePreference({ userId: 'u4', reminderTime: SYSTEM_REMINDER_TIME, timezone: 'America/Phoenix' });
  const seedSub = makeSubscription({ userId: 'u4' });
  const client = makeFakeClient({ preferences: [seedPref], subscriptions: [seedSub] });

  const result = await processOnePreference(client, { ...seedPref }, new Date('2026-08-26T01:05:00Z'));
  assert.equal(result.status, 'sent');
  assert.equal(client.__getPref(seedPref.id).lastSentLocalDate, '2026-08-25'); // athlete's local date, not the UTC date
});

test('an invalid stored timezone never crashes — reported and skipped', async () => {
  const seedPref = makePreference({ userId: 'u5', timezone: 'Foo/Bar' });
  const client = makeFakeClient({ preferences: [seedPref], subscriptions: [] });
  const result = await processOnePreference(client, { ...seedPref }, new Date('2026-08-26T18:00:00Z'));
  assert.equal(result.status, 'invalid_preference');
  assert.equal(sendCalls.length, 0);
});

// ── v1 simplification: fixed system reminder time, not the stored column ──

test('a legacy/custom stored reminderTime is ignored — every athlete is scheduled at the fixed system time', async () => {
  // An athlete who chose 07:30 under the old picker UI (or any other
  // value) must still be scheduled at the fixed v1 time, with no DB
  // backfill — the stored value is simply never read for this decision.
  const seedPref = makePreference({ userId: 'u4b', reminderTime: '07:30', timezone: 'UTC' });
  const seedSub = makeSubscription({ userId: 'u4b' });
  const client = makeFakeClient({ preferences: [seedPref], subscriptions: [seedSub] });

  // Not due at the athlete's OLD chosen time (07:30) — proves it's ignored.
  const atOldTime = await processOnePreference(client, { ...seedPref }, new Date('2026-08-26T07:35:00Z'));
  assert.equal(atOldTime.status, 'not_due');
  assert.equal(sendCalls.length, 0);

  // Due at the fixed system time (18:00) instead.
  const atSystemTime = await processOnePreference(client, { ...client.__getPref(seedPref.id) }, new Date('2026-08-26T18:03:00Z'));
  assert.equal(atSystemTime.status, 'sent');
  assert.equal(sendCalls.length, 1);
});

test('a stored reminderTime that is not even a valid HH:MM string no longer matters — only the timezone is validated', async () => {
  const seedPref = makePreference({ userId: 'u4c', reminderTime: 'not-a-time-at-all', timezone: 'UTC' });
  const seedSub = makeSubscription({ userId: 'u4c' });
  const client = makeFakeClient({ preferences: [seedPref], subscriptions: [seedSub] });

  const result = await processOnePreference(client, { ...seedPref }, new Date('2026-08-26T18:03:00Z'));
  assert.equal(result.status, 'sent'); // garbage reminderTime does not block scheduling
});

// ── Overlapping claim / race protection ──────────────────────────────────

test('overlapping sweeps racing the same athlete: only one claims and sends', async () => {
  const seedPref = makePreference({ userId: 'u6', reminderTime: '18:00', timezone: 'UTC' });
  const seedSub = makeSubscription({ userId: 'u6' });
  const client = makeFakeClient({ preferences: [seedPref], subscriptions: [seedSub] });
  const now = new Date('2026-08-26T18:02:00Z');

  // Two "concurrent" sweeps each read the row before either claimed it —
  // two independent stale copies of the same starting state, exactly like
  // two real findMany() calls racing each other.
  const staleCopyA = { ...seedPref };
  const staleCopyB = { ...seedPref };

  const [resultA, resultB] = await Promise.all([
    processOnePreference(client, staleCopyA, now),
    processOnePreference(client, staleCopyB, now),
  ]);

  const statuses = [resultA.status, resultB.status].sort();
  assert.deepEqual(statuses, ['lost_claim_race', 'sent']);
  assert.equal(sendCalls.length, 1, 'expected exactly one send despite two concurrent attempts');
  assert.equal(client.__getPref(seedPref.id).lastSentLocalDate, '2026-08-26');
});

// ── Restart-safe: DB state, not memory, is what a second sweep reads ─────

test('restart-safe: a fresh scheduler instance reading the same DB state never double-sends', async () => {
  const seedPref = makePreference({ userId: 'u7', reminderTime: '18:00', timezone: 'UTC' });
  const seedSub = makeSubscription({ userId: 'u7' });
  const client = makeFakeClient({ preferences: [seedPref], subscriptions: [seedSub] });
  const now = () => new Date('2026-08-26T18:02:00Z');

  // First "process" runs a sweep.
  const schedulerA = createPushScheduler({ client, now });
  const resultsA = await schedulerA.sweep();
  assert.equal(resultsA[0].status, 'sent');

  // Simulated restart: a brand-new scheduler instance, same underlying DB
  // (the `client`'s stored rows are the only thing that persisted).
  const schedulerB = createPushScheduler({ client, now });
  const resultsB = await schedulerB.sweep();
  assert.equal(resultsB[0].status, 'already_sent_today');
  assert.equal(sendCalls.length, 1, 'the athlete must not be sent to twice');
});

// ── Multiple devices = one athlete-level decision ────────────────────────

test('multiple active subscriptions: one send-decision, one push per device', async () => {
  const seedPref = makePreference({ userId: 'u8', reminderTime: '18:00', timezone: 'UTC' });
  const subA = makeSubscription({ userId: 'u8', endpoint: 'https://push.example/a' });
  const subB = makeSubscription({ userId: 'u8', endpoint: 'https://push.example/b' });
  const client = makeFakeClient({ preferences: [seedPref], subscriptions: [subA, subB] });

  const result = await processOnePreference(client, { ...seedPref }, new Date('2026-08-26T18:00:00Z'));
  assert.equal(result.status, 'sent');
  assert.equal(sendCalls.length, 2);
  assert.equal(client.__getPref(seedPref.id).lastSentLocalDate, '2026-08-26'); // set once, athlete-level
});

test('404/410 disables ONLY the failing subscription; other devices are untouched', async () => {
  const seedPref = makePreference({ userId: 'u9', reminderTime: '18:00', timezone: 'UTC' });
  const subA = makeSubscription({ userId: 'u9', endpoint: 'https://push.example/good' });
  const subB = makeSubscription({ userId: 'u9', endpoint: 'https://push.example/dead' });
  sendBehavior[subB.endpoint] = 410;
  const client = makeFakeClient({ preferences: [seedPref], subscriptions: [subA, subB] });

  const result = await processOnePreference(client, { ...seedPref }, new Date('2026-08-26T18:00:00Z'));
  assert.equal(result.status, 'sent'); // at least one succeeded
  assert.equal(client.__getSub(subA.id).disabledAt, null);
  assert.notEqual(client.__getSub(subB.id).disabledAt, null);
});

test('one succeeded + one transiently-failed device still counts the athlete as sent for the day', async () => {
  const seedPref = makePreference({ userId: 'u10', reminderTime: '18:00', timezone: 'UTC' });
  const subA = makeSubscription({ userId: 'u10', endpoint: 'https://push.example/ok' });
  const subB = makeSubscription({ userId: 'u10', endpoint: 'https://push.example/flaky' });
  sendBehavior[subB.endpoint] = 500;
  const client = makeFakeClient({ preferences: [seedPref], subscriptions: [subA, subB] });

  const result = await processOnePreference(client, { ...seedPref }, new Date('2026-08-26T18:00:00Z'));
  assert.equal(result.status, 'sent');
  assert.equal(client.__getPref(seedPref.id).lastSentLocalDate, '2026-08-26');
  assert.equal(client.__getSub(subB.id).disabledAt, null, 'a transient failure must never disable the subscription');
});

test('every subscription failing transiently: the claim is released so a later sweep the same day can retry', async () => {
  const seedPref = makePreference({ userId: 'u11', reminderTime: '18:00', timezone: 'UTC', lastSentLocalDate: null });
  const seedSub = makeSubscription({ userId: 'u11', endpoint: 'https://push.example/downnow' });
  sendBehavior[seedSub.endpoint] = 500;
  const client = makeFakeClient({ preferences: [seedPref], subscriptions: [seedSub] });

  const result = await processOnePreference(client, { ...seedPref }, new Date('2026-08-26T18:00:00Z'));
  assert.equal(result.status, 'all_sends_failed');
  assert.equal(client.__getPref(seedPref.id).lastSentLocalDate, null, 'claim must be released, not left as sent, so retry is possible later today');

  // A later sweep the same day, now with a healthy send path, succeeds —
  // reading the current (released) row, exactly as a real later sweep would.
  sendBehavior[seedSub.endpoint] = 'success';
  const retryResult = await processOnePreference(client, { ...client.__getPref(seedPref.id) }, new Date('2026-08-26T18:07:00Z'));
  assert.equal(retryResult.status, 'sent');
});

test('no active subscriptions: handled safely, preference is disabled, never spins forever', async () => {
  const seedPref = makePreference({ userId: 'u12', reminderTime: '18:00', timezone: 'UTC' });
  const client = makeFakeClient({ preferences: [seedPref], subscriptions: [] });

  const result = await processOnePreference(client, { ...seedPref }, new Date('2026-08-26T18:00:00Z'));
  assert.equal(result.status, 'no_active_subscriptions');
  assert.equal(client.__getPref(seedPref.id).enabled, false);
  assert.equal(sendCalls.length, 0);
});

test('all subscriptions already disabled (none active): same safe no-active-subscriptions handling', async () => {
  const seedPref = makePreference({ userId: 'u13', reminderTime: '18:00', timezone: 'UTC' });
  const deadSub = makeSubscription({ userId: 'u13', disabledAt: new Date('2026-08-01T00:00:00Z') });
  const client = makeFakeClient({ preferences: [seedPref], subscriptions: [deadSub] });

  const result = await processOnePreference(client, { ...seedPref }, new Date('2026-08-26T18:00:00Z'));
  assert.equal(result.status, 'no_active_subscriptions');
  assert.equal(client.__getPref(seedPref.id).enabled, false);
});

// ── Disabled preferences are never even considered ───────────────────────

test('runSweepOnce: a disabled preference is never processed or sent to', async () => {
  const disabledPref = makePreference({ userId: 'u14', enabled: false, reminderTime: '18:00', timezone: 'UTC' });
  const sub = makeSubscription({ userId: 'u14' });
  const client = makeFakeClient({ preferences: [disabledPref], subscriptions: [sub] });

  const results = await runSweepOnce(client, () => new Date('2026-08-26T18:00:00Z'));
  assert.deepEqual(results, []);
  assert.equal(sendCalls.length, 0);
  assert.equal(client.__getPref(disabledPref.id).lastSentLocalDate, null);
});

test('runSweepOnce: processes only enabled preferences among a mixed set', async () => {
  const enabledPref = makePreference({ userId: 'u15', reminderTime: '18:00', timezone: 'UTC' });
  const disabledPref = makePreference({ userId: 'u16', enabled: false, reminderTime: '18:00', timezone: 'UTC' });
  const subEnabled = makeSubscription({ userId: 'u15' });
  const client = makeFakeClient({ preferences: [enabledPref, disabledPref], subscriptions: [subEnabled] });

  const results = await runSweepOnce(client, () => new Date('2026-08-26T18:00:00Z'));
  assert.equal(results.length, 1);
  assert.equal(results[0].userId, 'u15');
  assert.equal(results[0].status, 'sent');
});

// ── In-process overlap guard (createPushScheduler) ───────────────────────

test('createPushScheduler: a sweep already in flight is skipped, not queued or duplicated', async () => {
  const seedPref = makePreference({ userId: 'u17', reminderTime: '18:00', timezone: 'UTC' });
  const seedSub = makeSubscription({ userId: 'u17' });
  let releaseFirstFindMany;
  const gate = new Promise((resolve) => { releaseFirstFindMany = resolve; });

  const client = makeFakeClient({ preferences: [seedPref], subscriptions: [seedSub] });
  const realFindMany = client.pushNotificationPreference.findMany;
  let callCount = 0;
  client.pushNotificationPreference.findMany = async (...args) => {
    callCount += 1;
    if (callCount === 1) await gate; // hold the first sweep open
    return realFindMany(...args);
  };

  const scheduler = createPushScheduler({ client, now: () => new Date('2026-08-26T18:00:00Z') });
  const firstSweep = scheduler.sweep();
  const secondSweep = scheduler.sweep(); // fires while the first is still gated open

  const secondResult = await secondSweep;
  assert.deepEqual(secondResult, [], 'a sweep that overlaps an in-flight one must be skipped, not run twice');

  releaseFirstFindMany();
  const firstResult = await firstSweep;
  assert.equal(firstResult[0].status, 'sent');
});
