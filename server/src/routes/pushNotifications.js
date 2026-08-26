const express = require('express');
const { PrismaClient } = require('@prisma/client');
const authenticate = require('../middleware/authenticate');
const { isValidTimeZone, isValidReminderTime } = require('../services/pushTimezone');

// Push Notifications v1 — athlete-facing surface.
//
// Every handler derives the athlete strictly from `req.userId` (set by
// `authenticate` from the verified JWT) — the client can never supply its
// own userId, here or anywhere else in this router.
//
// Minor/guardian rule: this deliberately does NOT create a second,
// notification-specific consent flow. It only ever READS the same
// `dateOfBirth` / `guardianConsentAt` fields the existing coaching-tool
// gate (middleware/requireGuardianConsent.js) already reads, with the same
// age math, so an under-18 athlete without guardian consent is blocked
// from *enabling* notifications exactly as they're blocked from coaching
// tools today — never from disabling them, which must always succeed.
//
// `createPushNotificationsRouter` is injectable for tests (same pattern as
// pilotCommunications.js / founderPilotOverview.js); the default export
// always uses the real Prisma client.

function createPushNotificationsRouter(client = new PrismaClient()) {
  const router = express.Router();

  async function guardianConsentSatisfied(userId) {
    const user = await client.user.findUnique({
      where: { id: userId },
      select: { dateOfBirth: true, guardianConsentAt: true },
    });
    if (!user) return { ok: false, notFound: true };
    // Legacy accounts (no dateOfBirth) and anyone who already has consent
    // recorded pass through untouched — identical to requireGuardianConsent.
    if (!user.dateOfBirth || user.guardianConsentAt) return { ok: true };

    const birth = new Date(user.dateOfBirth);
    const now = new Date();
    let years = now.getFullYear() - birth.getFullYear();
    const m = now.getMonth() - birth.getMonth();
    if (m < 0 || (m === 0 && now.getDate() < birth.getDate())) years -= 1;

    return { ok: years >= 18 };
  }

  function consentRequiredResponse(res) {
    return res.status(403).json({
      error: 'Parent or guardian consent is required before you can enable notifications',
      code: 'CONSENT_REQUIRED',
    });
  }

  // Shape sent by PushSubscription.toJSON() in the browser — the only
  // subscription shape this router ever accepts.
  function isValidSubscriptionPayload(subscription) {
    return (
      !!subscription &&
      typeof subscription.endpoint === 'string' &&
      subscription.endpoint.startsWith('https://') &&
      !!subscription.keys &&
      typeof subscription.keys.p256dh === 'string' && subscription.keys.p256dh.length > 0 &&
      typeof subscription.keys.auth === 'string' && subscription.keys.auth.length > 0
    );
  }

  function serializePreference(pref) {
    return {
      enabled: pref?.enabled ?? false,
      reminderTime: pref?.reminderTime ?? null,
      timezone: pref?.timezone ?? null,
    };
  }

  // ── GET /preferences ─────────────────────────────────────────────────
  router.get('/preferences', authenticate, async (req, res) => {
    try {
      const pref = await client.pushNotificationPreference.findUnique({ where: { userId: req.userId } });
      res.json({ preference: serializePreference(pref) });
    } catch (err) {
      console.error('[push-notifications] preferences GET error:', err?.message);
      res.status(500).json({ error: 'Server error' });
    }
  });

  // ── POST /subscribe ──────────────────────────────────────────────────
  // Steps 5-10 of the subscribe flow: the browser has already asked for
  // (and been granted) Notification permission and called
  // pushManager.subscribe() before this is ever called — see
  // usePushNotifications.js. This endpoint only ever runs after that.
  router.post('/subscribe', authenticate, async (req, res) => {
    try {
      const { subscription, reminderTime, timezone } = req.body || {};

      if (!isValidSubscriptionPayload(subscription)) {
        return res.status(400).json({ error: 'A valid push subscription is required' });
      }
      if (!isValidReminderTime(reminderTime)) {
        return res.status(400).json({ error: 'reminderTime must be in HH:MM 24-hour format' });
      }
      if (!isValidTimeZone(timezone)) {
        return res.status(400).json({ error: 'A valid IANA timezone is required' });
      }

      const consent = await guardianConsentSatisfied(req.userId);
      if (consent.notFound) return res.status(404).json({ error: 'User not found' });
      if (!consent.ok) return consentRequiredResponse(res);

      const { endpoint, keys } = subscription;

      // `endpoint` is globally unique in the schema. One physical browser
      // endpoint can only ever belong to one athlete at a time — if it's
      // currently on file for a DIFFERENT user (a shared/reused device: a
      // previous athlete logged out, which disables but never deletes
      // their row, and a different athlete then enables notifications on
      // the same browser), this call reassigns it rather than silently
      // letting one endpoint serve two accounts. The previous owner's
      // sends were already stopped by the logout-time disable — this just
      // makes the reassignment explicit and re-activates it for its new
      // owner.
      await client.pushSubscription.upsert({
        where: { endpoint },
        create: { userId: req.userId, endpoint, p256dh: keys.p256dh, auth: keys.auth },
        update: { userId: req.userId, p256dh: keys.p256dh, auth: keys.auth, disabledAt: null },
      });

      const pref = await client.pushNotificationPreference.upsert({
        where: { userId: req.userId },
        create: { userId: req.userId, enabled: true, reminderTime, timezone },
        update: { enabled: true, reminderTime, timezone },
      });

      res.json({ preference: serializePreference(pref) });
    } catch (err) {
      console.error('[push-notifications] subscribe error:', err?.message);
      res.status(500).json({ error: 'Server error' });
    }
  });

  // ── PATCH /preferences ───────────────────────────────────────────────
  // Updates reminderTime/timezone on an already-enabled preference, and/or
  // toggles `enabled`. Turning notifications OFF must always succeed
  // (including for an under-18 athlete without guardian consent — consent
  // only ever gates turning them ON). This does not touch any
  // PushSubscription row; the client also calls POST /unsubscribe with its
  // own endpoint as part of "Turn off notifications" — see
  // usePushNotifications.js.
  router.patch('/preferences', authenticate, async (req, res) => {
    try {
      const { enabled, reminderTime, timezone } = req.body || {};
      const data = {};

      if (enabled !== undefined) {
        if (typeof enabled !== 'boolean') return res.status(400).json({ error: 'enabled must be a boolean' });
        data.enabled = enabled;
      }
      if (reminderTime !== undefined) {
        if (!isValidReminderTime(reminderTime)) {
          return res.status(400).json({ error: 'reminderTime must be in HH:MM 24-hour format' });
        }
        data.reminderTime = reminderTime;
      }
      if (timezone !== undefined) {
        if (!isValidTimeZone(timezone)) return res.status(400).json({ error: 'A valid IANA timezone is required' });
        data.timezone = timezone;
      }
      if (Object.keys(data).length === 0) {
        return res.status(400).json({ error: 'No valid fields to update' });
      }

      // Server-side enforcement — a direct API call cannot bypass the
      // client-side gate by simply omitting the subscribe step.
      if (data.enabled === true) {
        const consent = await guardianConsentSatisfied(req.userId);
        if (consent.notFound) return res.status(404).json({ error: 'User not found' });
        if (!consent.ok) return consentRequiredResponse(res);
      }

      const existing = await client.pushNotificationPreference.findUnique({ where: { userId: req.userId } });
      if (!existing && data.enabled !== true) {
        return res.status(400).json({ error: 'Enable notifications first' });
      }

      const pref = await client.pushNotificationPreference.upsert({
        where: { userId: req.userId },
        create: {
          userId: req.userId,
          enabled: data.enabled ?? false,
          reminderTime: data.reminderTime ?? null,
          timezone: data.timezone ?? null,
        },
        update: data,
      });

      res.json({ preference: serializePreference(pref) });
    } catch (err) {
      console.error('[push-notifications] preferences PATCH error:', err?.message);
      res.status(500).json({ error: 'Server error' });
    }
  });

  // ── POST /unsubscribe ────────────────────────────────────────────────
  // Disables (never deletes — same convention as the scheduler's own
  // terminal-failure handling) the ONE PushSubscription row matching this
  // athlete + this endpoint. Scoped to the current device only; other
  // devices and the preference row are untouched by this call alone.
  // Reused by two flows: the explicit "Turn off notifications" action, and
  // the logout flow (client/src/api.js) — both send the current browser's
  // own subscription endpoint.
  router.post('/unsubscribe', authenticate, async (req, res) => {
    try {
      const { endpoint } = req.body || {};
      if (typeof endpoint !== 'string' || !endpoint) {
        return res.status(400).json({ error: 'endpoint is required' });
      }

      const sub = await client.pushSubscription.findUnique({ where: { endpoint } });
      // Idempotent no-op if it's already gone/disabled, or (should never
      // happen) belongs to someone else — either way there's nothing for
      // this athlete's own request to do, and we never leak whether an
      // endpoint exists under a different account.
      if (sub && sub.userId === req.userId && !sub.disabledAt) {
        await client.pushSubscription.update({ where: { endpoint }, data: { disabledAt: new Date() } });
      }

      res.json({ ok: true });
    } catch (err) {
      console.error('[push-notifications] unsubscribe error:', err?.message);
      res.status(500).json({ error: 'Server error' });
    }
  });

  return router;
}

module.exports = createPushNotificationsRouter();
module.exports.createPushNotificationsRouter = createPushNotificationsRouter;
