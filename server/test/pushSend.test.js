// Push Notifications v1 — services/pushSend.js. The 'web-push' package is
// replaced in the require cache with an in-memory fake before pushSend.js
// is loaded, so these tests never touch the network and never configure
// real VAPID keys — same require-cache technique welcomeEmail.test.js uses
// for 'resend'.

const test = require('node:test');
const assert = require('node:assert/strict');

const webPushPath = require.resolve('web-push');

let vapidCalls = [];
let sendCalls = [];
let nextResult = { ok: true };

class FakeWebPushError extends Error {
  constructor(statusCode) {
    super('push service rejected the request');
    this.statusCode = statusCode;
  }
}

const fakeWebPush = {
  setVapidDetails: (subject, publicKey, privateKey) => {
    vapidCalls.push({ subject, publicKey, privateKey });
  },
  sendNotification: async (subscription, payload) => {
    sendCalls.push({ subscription, payload });
    if (nextResult.ok) return { statusCode: 201 };
    throw new FakeWebPushError(nextResult.statusCode);
  },
};

require.cache[webPushPath] = {
  id: webPushPath,
  filename: webPushPath,
  loaded: true,
  exports: fakeWebPush,
};

const pushSendPath = require.resolve('../src/services/pushSend');
delete require.cache[pushSendPath];
const { buildReminderPayload, sendPushToSubscription, REMINDER_ROUTE, __resetConfigForTests } = require(pushSendPath);

const ORIGINAL_ENV = {
  VAPID_SUBJECT: process.env.VAPID_SUBJECT,
  VAPID_PUBLIC_KEY: process.env.VAPID_PUBLIC_KEY,
  VAPID_PRIVATE_KEY: process.env.VAPID_PRIVATE_KEY,
};

function clearVapidEnv() {
  delete process.env.VAPID_SUBJECT;
  delete process.env.VAPID_PUBLIC_KEY;
  delete process.env.VAPID_PRIVATE_KEY;
}
function setVapidEnv() {
  process.env.VAPID_SUBJECT = 'mailto:test@example.test';
  process.env.VAPID_PUBLIC_KEY = 'test-public-key';
  process.env.VAPID_PRIVATE_KEY = 'test-private-key';
}

test.beforeEach(() => {
  vapidCalls = [];
  sendCalls = [];
  nextResult = { ok: true };
  __resetConfigForTests();
});
test.after(() => {
  for (const [key, value] of Object.entries(ORIGINAL_ENV)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

// ── buildReminderPayload ────────────────────────────────────────────────

test('buildReminderPayload: English by default and for an unknown language', () => {
  for (const lang of [undefined, null, 'fr', 'xx']) {
    const payload = JSON.parse(buildReminderPayload(lang));
    assert.equal(payload.title, 'A quick mental rep?');
    assert.equal(payload.body, 'Take 2 minutes to prepare your focus.');
    assert.equal(payload.route, REMINDER_ROUTE);
  }
});

test('buildReminderPayload: Hindi copy for language "hi"', () => {
  const payload = JSON.parse(buildReminderPayload('hi'));
  assert.notEqual(payload.title, 'A quick mental rep?');
  assert.equal(payload.route, '/mental-rep');
});

test('buildReminderPayload: payload contains only title/body/route — no other fields', () => {
  const payload = JSON.parse(buildReminderPayload('en'));
  assert.deepEqual(Object.keys(payload).sort(), ['body', 'route', 'title']);
});

// ── VAPID configuration path ────────────────────────────────────────────

test('sendPushToSubscription: without VAPID env vars, fails safely without throwing and never calls web-push', async () => {
  clearVapidEnv();
  const result = await sendPushToSubscription({ endpoint: 'https://push.example/1', p256dh: 'a', auth: 'b' }, '{}');
  assert.equal(result.ok, false);
  assert.equal(result.terminal, false);
  assert.equal(sendCalls.length, 0);
});

test('sendPushToSubscription: with VAPID configured, setVapidDetails is called exactly once across multiple sends', async () => {
  setVapidEnv();
  await sendPushToSubscription({ endpoint: 'https://push.example/1', p256dh: 'a', auth: 'b' }, '{}');
  await sendPushToSubscription({ endpoint: 'https://push.example/2', p256dh: 'c', auth: 'd' }, '{}');
  assert.equal(vapidCalls.length, 1);
  assert.equal(vapidCalls[0].subject, 'mailto:test@example.test');
});

// ── Success / terminal / transient classification ───────────────────────

test('sendPushToSubscription: success returns { ok: true }', async () => {
  setVapidEnv();
  nextResult = { ok: true };
  const result = await sendPushToSubscription({ endpoint: 'https://push.example/1', p256dh: 'a', auth: 'b' }, '{}');
  assert.deepEqual(result, { ok: true });
});

test('sendPushToSubscription: 404/410 classify as terminal', async () => {
  setVapidEnv();
  for (const statusCode of [404, 410]) {
    nextResult = { ok: false, statusCode };
    const result = await sendPushToSubscription({ endpoint: 'https://push.example/x', p256dh: 'a', auth: 'b' }, '{}');
    assert.equal(result.ok, false);
    assert.equal(result.terminal, true, `expected statusCode ${statusCode} to be terminal`);
  }
});

test('sendPushToSubscription: 500/network errors classify as transient, never crash', async () => {
  setVapidEnv();
  for (const statusCode of [500, undefined]) {
    nextResult = { ok: false, statusCode };
    const result = await sendPushToSubscription({ endpoint: 'https://push.example/y', p256dh: 'a', auth: 'b' }, '{}');
    assert.equal(result.ok, false);
    assert.equal(result.terminal, false, `expected statusCode ${statusCode} to be transient`);
  }
});

test('sendPushToSubscription: never logs the VAPID private key or subscription keys', async () => {
  setVapidEnv();
  const originalError = console.error;
  const logged = [];
  console.error = (...args) => logged.push(args.join(' '));
  try {
    nextResult = { ok: false, statusCode: 500 };
    await sendPushToSubscription({ endpoint: 'https://push.example/z', p256dh: 'super-secret-p256dh', auth: 'super-secret-auth' }, '{}');
  } finally {
    console.error = originalError;
  }
  const allLogged = logged.join(' ');
  assert.ok(!allLogged.includes('test-private-key'));
  assert.ok(!allLogged.includes('super-secret-p256dh'));
  assert.ok(!allLogged.includes('super-secret-auth'));
});

test('sendPushToSubscription: sends the exact endpoint and keys given, and the payload verbatim', async () => {
  setVapidEnv();
  nextResult = { ok: true };
  const sub = { endpoint: 'https://push.example/exact', p256dh: 'p', auth: 'a' };
  await sendPushToSubscription(sub, '{"title":"hi","body":"there","route":"/mental-rep"}');
  assert.equal(sendCalls.length, 1);
  assert.equal(sendCalls[0].subscription.endpoint, sub.endpoint);
  assert.deepEqual(sendCalls[0].subscription.keys, { p256dh: 'p', auth: 'a' });
  assert.equal(sendCalls[0].payload, '{"title":"hi","body":"there","route":"/mental-rep"}');
});
