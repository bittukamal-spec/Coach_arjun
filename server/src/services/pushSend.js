// Push Notifications v1 — the one place VAPID is configured and pushes are
// actually sent. Standard Web Push (VAPID) via `web-push` — no Firebase,
// no other vendor. Same require('web-push') pattern services/email.js
// already uses for 'resend' — testable by swapping the module in
// require.cache before this file is loaded (see welcomeEmail.test.js for
// the established technique; pushSend.test.js does the same for
// 'web-push').
//
// Never logs VAPID_PRIVATE_KEY, a subscription's p256dh/auth keys, or any
// push payload content beyond what's already server-controlled generic
// copy (see REMINDER_COPY below — no athlete data ever reaches this file).

const webpush = require('web-push');

// Configured lazily, once, on first real send attempt — never at module
// load time. A missing/incomplete VAPID config must never crash server
// boot (dev/test routinely run without it configured); it only ever
// surfaces as a clear, structured failure from sendPushToSubscription()
// itself, at the moment a real send is attempted.
let configured = false;
let configuredOk = false;

function ensureConfigured() {
  if (configured) return configuredOk;
  configured = true;
  const subject = process.env.VAPID_SUBJECT;
  const publicKey = process.env.VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  if (!subject || !publicKey || !privateKey) {
    console.error('[push] VAPID_SUBJECT/VAPID_PUBLIC_KEY/VAPID_PRIVATE_KEY not fully configured — push sends will fail until set');
    configuredOk = false;
    return false;
  }
  webpush.setVapidDetails(subject, publicKey, privateKey);
  configuredOk = true;
  return true;
}

// Test-only seam — lets a test force re-evaluation of env vars set after
// this module was first loaded. Never called from app code.
function __resetConfigForTests() {
  configured = false;
  configuredOk = false;
}

// v1's one notification type. Server-controlled, generic, performance-
// focused only — no athlete name, no journal/reflection content, no
// inferred mental state, never streak/guilt language. English/Hindi only
// (User.language is the one persisted, reliable language signal this repo
// already has — reused as-is, no new preference invented for push).
const REMINDER_COPY = {
  en: { title: 'A quick mental rep?', body: 'Take 2 minutes to prepare your focus.' },
  hi: { title: 'एक quick Mental Rep?', body: 'अपना focus तैयार करने के लिए 2 मिनट निकालो।' },
};
const REMINDER_ROUTE = '/mental-rep';

// Returns the exact JSON string sent as the push payload — title/body/
// route only, nothing else, matching the service worker's own defensive
// payload validation (client/src/sw.js).
function buildReminderPayload(language) {
  const copy = REMINDER_COPY[language] || REMINDER_COPY.en;
  return JSON.stringify({ title: copy.title, body: copy.body, route: REMINDER_ROUTE });
}

// Sends one payload to one subscription row ({ endpoint, p256dh, auth }).
// Never throws — every outcome is a structured result so callers (the
// scheduler) can make send-decision/claim logic deterministic and
// testable without try/catch scattered through it.
//
// Returns one of:
//   { ok: true }
//   { ok: false, terminal: true,  statusCode }   — 404/410: subscription is dead
//   { ok: false, terminal: false, statusCode? }  — anything else: transient
async function sendPushToSubscription(subscription, payloadJson) {
  if (!ensureConfigured()) {
    return { ok: false, terminal: false, reason: 'not_configured' };
  }
  try {
    await webpush.sendNotification(
      {
        endpoint: subscription.endpoint,
        keys: { p256dh: subscription.p256dh, auth: subscription.auth },
      },
      payloadJson
    );
    return { ok: true };
  } catch (err) {
    const statusCode = err && err.statusCode;
    const terminal = statusCode === 404 || statusCode === 410;
    // Message/status only — never the subscription keys, never err.body
    // (which can echo the push service's own diagnostic text).
    console.error('[push] send failed:', statusCode || err?.message || 'unknown error', terminal ? '(terminal)' : '(transient)');
    return { ok: false, terminal, statusCode };
  }
}

module.exports = {
  buildReminderPayload,
  sendPushToSubscription,
  REMINDER_ROUTE,
  __resetConfigForTests,
};
