// Push Notifications v1 — services/pushSend.js. The 'web-push' package is
// replaced in the require cache with an in-memory fake before pushSend.js
// is loaded, so these tests never touch the network and never configure
// real VAPID keys — same require-cache technique welcomeEmail.test.js uses
// for 'resend'.

const test = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');

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
const {
  buildReminderPayload,
  sendPushToSubscription,
  selectMessageIndex,
  NOTIFICATION_MESSAGES,
  REMINDER_ROUTE,
  __resetConfigForTests,
} = require(pushSendPath);

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

// ── Destination: routine scheduled pushes open Home, not Mental Rep ─────

test('REMINDER_ROUTE is /dashboard', () => {
  assert.equal(REMINDER_ROUTE, '/dashboard');
});

test('buildReminderPayload: every payload routes to /dashboard, never /mental-rep', () => {
  for (const localDateStr of ['2026-08-01', '2026-08-02', '2026-08-15', '2026-12-31']) {
    for (const lang of ['en', 'hi', undefined]) {
      const payload = JSON.parse(buildReminderPayload(lang, localDateStr));
      assert.equal(payload.route, '/dashboard');
      assert.notEqual(payload.route, '/mental-rep');
    }
  }
});

// ── Curated message library ──────────────────────────────────────────────

test('NOTIFICATION_MESSAGES is a small bounded curated library (~10 messages)', () => {
  assert.ok(Array.isArray(NOTIFICATION_MESSAGES));
  assert.equal(NOTIFICATION_MESSAGES.length, 10);
});

test('every message has both an EN and HI title + body', () => {
  for (const message of NOTIFICATION_MESSAGES) {
    for (const lang of ['en', 'hi']) {
      assert.equal(typeof message[lang]?.title, 'string');
      assert.ok(message[lang].title.length > 0);
      assert.equal(typeof message[lang]?.body, 'string');
      assert.ok(message[lang].body.length > 0);
    }
  }
});

test('every message every selected payload has both title and body present', () => {
  for (let day = 0; day < NOTIFICATION_MESSAGES.length; day++) {
    const localDateStr = `2026-01-${String(day + 1).padStart(2, '0')}`;
    for (const lang of ['en', 'hi']) {
      const payload = JSON.parse(buildReminderPayload(lang, localDateStr));
      assert.ok(payload.title, `missing title for ${lang} on ${localDateStr}`);
      assert.ok(payload.body, `missing body for ${lang} on ${localDateStr}`);
    }
  }
});

const FORBIDDEN_PHRASES = [
  /haven'?t (trained|checked in)/i,
  /lose your streak/i,
  /you (seem|sound|look) (nervous|anxious|stressed|down)/i,
  /miss(ed)? (a |your )?(day|session)/i,
  /don'?t break/i,
  /streak/i,
];

test('the curated library (EN + HI) never uses guilt/streak/sensitive/missed-day framing', () => {
  for (const message of NOTIFICATION_MESSAGES) {
    for (const lang of ['en', 'hi']) {
      const text = `${message[lang].title} ${message[lang].body}`;
      for (const re of FORBIDDEN_PHRASES) {
        assert.doesNotMatch(text, re, `found forbidden phrasing (${re}) in ${lang}: "${text}"`);
      }
    }
  }
});

test('no message includes an athlete name placeholder or guardian reference', () => {
  for (const message of NOTIFICATION_MESSAGES) {
    for (const lang of ['en', 'hi']) {
      const text = `${message[lang].title} ${message[lang].body}`;
      assert.doesNotMatch(text, /\{.*name.*\}|guardian|parent/i);
    }
  }
});

// ── Deterministic rotation ────────────────────────────────────────────────

test('selectMessageIndex: the same local date always selects the same message index', () => {
  const a = selectMessageIndex('2026-08-15');
  const b = selectMessageIndex('2026-08-15');
  assert.equal(a, b);
});

test('selectMessageIndex: always returns a valid index into the library', () => {
  for (const localDateStr of ['2026-01-01', '2026-06-30', '2026-12-31', '2027-02-28']) {
    const index = selectMessageIndex(localDateStr);
    assert.ok(Number.isInteger(index));
    assert.ok(index >= 0 && index < NOTIFICATION_MESSAGES.length);
  }
});

test('selectMessageIndex: consecutive calendar days rotate through the library deterministically (not fixed on one message)', () => {
  const indices = [];
  for (let day = 1; day <= 20; day++) {
    indices.push(selectMessageIndex(`2026-08-${String(day).padStart(2, '0')}`));
  }
  const distinctValues = new Set(indices);
  assert.ok(distinctValues.size > 1, 'expected rotation across at least a few distinct messages over 20 days');
});

test('selectMessageIndex: an invalid/missing date is handled safely, never throws, never random', () => {
  for (const bad of [undefined, null, '', 'not-a-date']) {
    const first = selectMessageIndex(bad);
    const second = selectMessageIndex(bad);
    assert.equal(first, second); // stable, not Math.random()
    assert.ok(first >= 0 && first < NOTIFICATION_MESSAGES.length);
  }
});

// ── No AI / personalization path ─────────────────────────────────────────

test('pushSend.js never calls an AI provider and never uses Math.random for message selection', () => {
  const source = readFileSync(pushSendPath, 'utf8');
  assert.doesNotMatch(source, /anthropic|openai|claude-|gpt-/i);
  assert.doesNotMatch(source, /Math\.random/);
});

test('buildReminderPayload: payload contains only title/body/route — no other fields', () => {
  const payload = JSON.parse(buildReminderPayload('en', '2026-08-15'));
  assert.deepEqual(Object.keys(payload).sort(), ['body', 'route', 'title']);
});

test('buildReminderPayload: falls back to English only for a missing/unknown language — never silently drops a known "hi" preference', () => {
  const hiPayload = JSON.parse(buildReminderPayload('hi', '2026-08-15'));
  const enPayload = JSON.parse(buildReminderPayload('en', '2026-08-15'));
  assert.notEqual(hiPayload.title, enPayload.title);
  for (const lang of [undefined, null, 'fr', 'xx']) {
    const payload = JSON.parse(buildReminderPayload(lang, '2026-08-15'));
    assert.deepEqual(payload, enPayload);
  }
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
  await sendPushToSubscription(sub, '{"title":"hi","body":"there","route":"/dashboard"}');
  assert.equal(sendCalls.length, 1);
  assert.equal(sendCalls[0].subscription.endpoint, sub.endpoint);
  assert.deepEqual(sendCalls[0].subscription.keys, { p256dh: 'p', auth: 'a' });
  assert.equal(sendCalls[0].payload, '{"title":"hi","body":"there","route":"/dashboard"}');
});
