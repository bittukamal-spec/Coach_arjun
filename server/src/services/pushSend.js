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
// copy (see NOTIFICATION_MESSAGES below — no athlete data ever reaches
// this file).

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

// v1's curated notification library — server-controlled, generic,
// performance-focused only. No athlete name, no journal/reflection
// content, no inferred mental state, never streak/guilt/missed-day
// language. English/Hindi only (User.language is the one persisted,
// reliable language signal this repo already has — reused as-is, same
// established `copy[language] || copy.en` fallback as before, no new
// preference invented for push).
//
// Deliberately NOT AI-generated and never will be at send time — this is
// a small fixed array, hand-written once, reviewed for tone. Nothing in
// this file calls an LLM, a campaign engine, or reads athlete data
// (mood/journal/Coach) to pick or personalize a message.
const NOTIFICATION_MESSAGES = [
  { en: { title: 'Ready for your mental game?', body: 'Take a minute for Arjun.' },
    hi: { title: 'मानसिक खेल के लिए तैयार?', body: 'अर्जुन के लिए एक मिनट निकालो।' } },
  { en: { title: 'A quick reset?', body: 'Arjun is here when you need it.' },
    hi: { title: 'एक quick reset?', body: 'जब जरूरत हो, अर्जुन यहीं है।' } },
  { en: { title: 'Training today?', body: 'Check in with your mental game before you start.' },
    hi: { title: 'आज ट्रेनिंग है?', body: 'शुरू करने से पहले अपने मानसिक खेल को चेक करो।' } },
  { en: { title: 'How did today go?', body: 'Open Arjun and take something useful forward.' },
    hi: { title: 'आज कैसा रहा?', body: 'अर्जुन खोलो और कुछ उपयोगी आगे ले जाओ।' } },
  { en: { title: 'Keep your mental game sharp.', body: 'A few minutes can make a difference.' },
    hi: { title: 'अपने मानसिक खेल को sharp रखो।', body: 'कुछ मिनट फर्क ला सकते हैं।' } },
  { en: { title: 'Back to your game.', body: "Open Arjun when you're ready." },
    hi: { title: 'वापस अपने खेल पर।', body: 'जब तैयार हो, अर्जुन खोलो।' } },
  { en: { title: 'Your mental training is here.', body: 'Take a quick moment for yourself and your performance.' },
    hi: { title: 'आपकी मानसिक ट्रेनिंग यहाँ है।', body: 'खुद के लिए और अपनी परफॉर्मेंस के लिए एक पल निकालो।' } },
  { en: { title: 'Got 2 minutes?', body: 'Open Arjun for a quick mental rep or reflection.' },
    hi: { title: '2 मिनट हैं?', body: 'एक quick mental rep या reflection के लिए अर्जुन खोलो।' } },
  { en: { title: 'Reset. Refocus. Move forward.', body: 'Take a quick moment with Arjun.' },
    hi: { title: 'Reset करो। Refocus करो। आगे बढ़ो।', body: 'अर्जुन के साथ एक पल निकालो।' } },
  { en: { title: 'Make space for your mental game.', body: 'A short check-in can help you reset and refocus.' },
    hi: { title: 'अपने मानसिक खेल के लिए जगह बनाओ।', body: 'एक छोटा check-in reset और refocus में मदद कर सकता है।' } },
];

// Routine scheduled pushes open Arjun Home, not a specific tool — the
// athlete decides what to do once they're in the app. (Was '/mental-rep'
// in v1's first cut; changed to '/dashboard' as a small follow-up. The
// service worker's own destination allowlist — client/src/sw.js — already
// accepts '/dashboard' as its default/fallback route, so no change was
// needed there.)
const REMINDER_ROUTE = '/dashboard';

// Deterministic rotation — no randomized selection, no AI, no per-athlete
// personalization or athlete data of any kind. The same local calendar
// date always maps to the same message index, for every athlete alike
// (different athletes CAN and will see the same message on the same day —
// that's expected, not a bug). `localDateStr` is the athlete's own local
// date ("YYYY-MM-DD", from pushTimezone.js's getLocalDateString) — reused
// here rather than reading a fresh clock, so this stays fully deterministic
// and testable with no mocking beyond the date string already computed by
// the scheduler for the send decision itself.
function selectMessageIndex(localDateStr) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(localDateStr || '');
  if (!match) return 0; // no valid date given — stable, not random
  const [, y, m, d] = match.map(Number);
  const dayNumber = Math.floor(Date.UTC(y, m - 1, d) / 86400000);
  return ((dayNumber % NOTIFICATION_MESSAGES.length) + NOTIFICATION_MESSAGES.length) % NOTIFICATION_MESSAGES.length;
}

// Returns the exact JSON string sent as the push payload — title/body/
// route only, nothing else, matching the service worker's own defensive
// payload validation (client/src/sw.js).
function buildReminderPayload(language, localDateStr) {
  const message = NOTIFICATION_MESSAGES[selectMessageIndex(localDateStr)];
  const copy = message[language] || message.en;
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
  selectMessageIndex,
  NOTIFICATION_MESSAGES,
  REMINDER_ROUTE,
  __resetConfigForTests,
};
