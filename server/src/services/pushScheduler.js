// Push Notifications v1 — the one shared scheduler sweep. Pilot scale
// only: no Bull/Redis/queue, no per-user timers, no second Railway
// service, no external cron — one `setInterval` inside the existing
// always-on server, wired once from index.js. DB-backed and restart-safe:
// the only state that matters (PushNotificationPreference.lastSentLocalDate)
// lives in Postgres, not memory, so a server restart just means the next
// sweep re-evaluates from the same source of truth it always would have.
//
// Same injectable-Prisma-client pattern as founderPilotOverview.js /
// pilotCommunications.js (testable without a real database), extended
// with an injectable `now` clock since this service is inherently
// time-driven — tests inject a fixed Date, never the real clock.

const { PrismaClient } = require('@prisma/client');
const {
  isValidTimeZone,
  getLocalDateString,
  getLocalTimeString,
  minutesSinceMidnight,
} = require('./pushTimezone');
const { buildReminderPayload, sendPushToSubscription } = require('./pushSend');

// A reminder is considered due for the ten minutes starting at
// SYSTEM_REMINDER_TIME local time — "around 18:00–18:10", never promised
// to the exact minute. Matches the sweep interval 1:1 so consecutive
// sweeps never leave a gap an athlete's due window could fall entirely
// inside and be missed.
const DUE_WINDOW_MINUTES = 10;
const SWEEP_INTERVAL_MS = 10 * 60 * 1000;

// v1 simplification: the athlete no longer picks a reminder time — every
// enabled athlete gets one system-defined local reminder window. This is
// read here, NOT from `pref.reminderTime` — that column still exists on
// the row (written as this same value by the subscribe route, and left
// alone for any athlete who set a different time under the old picker
// UI) purely so a future v2 can reintroduce per-athlete scheduling
// without a schema change. No DB backfill was needed or done: an athlete
// who previously chose, say, 07:30 is simply scheduled at 18:00 from now
// on, the moment this deploys — their stored `reminderTime` value is
// inert, never read for the due-window calculation below.
const SYSTEM_REMINDER_TIME = '18:00';

// Processes exactly one athlete's preference row for "now". Never throws —
// every path returns a structured status string so this is fully
// deterministic and testable without mocking time.sleep or catching
// exceptions in test code.
async function processOnePreference(client, pref, nowDate) {
  if (!isValidTimeZone(pref.timezone)) {
    return { userId: pref.userId, status: 'invalid_preference' };
  }

  const localDateStr = getLocalDateString(nowDate, pref.timezone);
  if (pref.lastSentLocalDate === localDateStr) {
    return { userId: pref.userId, status: 'already_sent_today' };
  }

  const nowMinutes = minutesSinceMidnight(getLocalTimeString(nowDate, pref.timezone));
  const dueStart = minutesSinceMidnight(SYSTEM_REMINDER_TIME);
  const dueEnd = dueStart + DUE_WINDOW_MINUTES;
  if (nowMinutes < dueStart || nowMinutes >= dueEnd) {
    return { userId: pref.userId, status: 'not_due' };
  }

  // Atomic claim: the WHERE clause pins the row to the exact
  // lastSentLocalDate value we just read it as. If any other process (an
  // overlapping sweep, or — belt-and-braces — a second scheduler
  // instance) already claimed this athlete/day between our read and this
  // write, `count` comes back 0 and we simply back off; we never send
  // twice.
  const claim = await client.pushNotificationPreference.updateMany({
    where: { id: pref.id, lastSentLocalDate: pref.lastSentLocalDate },
    data: { lastSentLocalDate: localDateStr },
  });
  if (claim.count === 0) {
    return { userId: pref.userId, status: 'lost_claim_race' };
  }

  const subscriptions = await client.pushSubscription.findMany({
    where: { userId: pref.userId, disabledAt: null },
  });

  if (subscriptions.length === 0) {
    // Nothing to send to, and nothing will appear later today either —
    // disable the preference so the scheduler stops re-evaluating an
    // athlete with no valid device, rather than spinning on this every
    // sweep indefinitely.
    await client.pushNotificationPreference.update({
      where: { id: pref.id },
      data: { enabled: false },
    });
    return { userId: pref.userId, status: 'no_active_subscriptions' };
  }

  const user = await client.user.findUnique({ where: { id: pref.userId }, select: { language: true } });
  const payload = buildReminderPayload(user?.language);

  let anySucceeded = false;
  for (const sub of subscriptions) {
    const result = await sendPushToSubscription(sub, payload);
    if (result.ok) {
      anySucceeded = true;
    } else if (result.terminal) {
      await client.pushSubscription.update({ where: { id: sub.id }, data: { disabledAt: nowDate } });
    }
    // Transient failure: no per-subscription action — it stays active and
    // is retried on its own on a later due day.
  }

  if (!anySucceeded) {
    // Every attempt failed — release the claim (revert to the value it
    // had before this sweep touched it) so a later sweep THE SAME DAY may
    // retry, instead of silently losing today's reminder. If every
    // subscription just went terminal above, the next sweep's
    // findMany(disabledAt: null) naturally comes back empty and this
    // athlete converges to the no_active_subscriptions/disable path on
    // its own — no extra branching needed here for that case.
    await client.pushNotificationPreference.update({
      where: { id: pref.id },
      data: { lastSentLocalDate: pref.lastSentLocalDate },
    });
    return { userId: pref.userId, status: 'all_sends_failed' };
  }

  return { userId: pref.userId, status: 'sent' };
}

async function runSweepOnce(client, now) {
  const nowDate = now();
  const preferences = await client.pushNotificationPreference.findMany({
    where: { enabled: true, reminderTime: { not: null }, timezone: { not: null } },
  });

  const results = [];
  for (const pref of preferences) {
    try {
      results.push(await processOnePreference(client, pref, nowDate));
    } catch (err) {
      console.error('[push-scheduler] error processing preference', pref.id, err?.message);
      results.push({ userId: pref.userId, status: 'error' });
    }
  }
  return results;
}

// `client`/`now` injectable for tests. `sweepInProgress` is closure-scoped
// per instance (not module-level) so each createPushScheduler() call gets
// its own independent overlap guard — the real app creates exactly one at
// startup; tests can safely create several without polluting each other.
function createPushScheduler({ client = new PrismaClient(), now = () => new Date() } = {}) {
  let sweepInProgress = false;

  async function sweep() {
    if (sweepInProgress) {
      console.warn('[push-scheduler] previous sweep still running — skipping this tick');
      return [];
    }
    sweepInProgress = true;
    try {
      return await runSweepOnce(client, now);
    } finally {
      sweepInProgress = false;
    }
  }

  return { sweep };
}

// Wired once from server/src/index.js. Returns { stop, scheduler } —
// `stop()` clears the interval (used by tests; the real server never
// calls it). The timer is unref'd so it can never by itself keep the
// Node process alive (consistent with how a health-check-driven Railway
// deploy expects the process to behave, and lets a test process exit
// cleanly without an explicit stop()).
function startPushScheduler(options = {}) {
  const { intervalMs = SWEEP_INTERVAL_MS, ...schedulerOptions } = options;
  const scheduler = createPushScheduler(schedulerOptions);
  const timer = setInterval(() => {
    scheduler.sweep().catch((err) => console.error('[push-scheduler] sweep failed:', err?.message));
  }, intervalMs);
  if (typeof timer.unref === 'function') timer.unref();
  return { stop: () => clearInterval(timer), scheduler };
}

module.exports = {
  DUE_WINDOW_MINUTES,
  SWEEP_INTERVAL_MS,
  SYSTEM_REMINDER_TIME,
  processOnePreference,
  runSweepOnce,
  createPushScheduler,
  startPushScheduler,
};
