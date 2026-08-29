const express = require('express');
const { PrismaClient } = require('@prisma/client');
const founderAuthenticate = require('../middleware/founderAuthenticate');
const { isValidTimeZone, getLocalDateString } = require('../services/pushTimezone');
const { buildReminderPayload, sendPushToSubscription } = require('../services/pushSend');

// Push Notifications v1 — founder-only operational testing utility.
//
// Lets the founder send ONE immediate test push to a single selected pilot
// athlete's active device(s), to verify the Web Push pipeline end-to-end
// without waiting for the 18:00 scheduler window. This is deliberately a
// one-athlete-at-a-time tool, not a send-to-everyone one, and it is not a
// Pilot Communication:
//   - exactly one athlete, chosen by the founder, per call — never "ALL"
//   - reuses the exact same curated NOTIFICATION_MESSAGES rotation and
//     REMINDER_ROUTE ('/dashboard') the real scheduler uses — no custom
//     free-text push content is ever accepted here
//   - never touches PushNotificationPreference.lastSentLocalDate — so a
//     founder test send never consumes or interferes with that athlete's
//     normal daily scheduled reminder
//   - never creates a PilotCommunication row — completely separate system
//
// Guarded exclusively by the short-lived founder session token
// (founderAuthenticate), same as every other founder-only router. The
// athlete never supplies their own userId here — the founder selects it,
// and this route is unreachable without a valid founder session.
//
// `createFounderPushTestRouter` is injectable for tests (same pattern as
// founderPilotCommunications.js); the default export always uses the real
// Prisma client.

function createFounderPushTestRouter(client = new PrismaClient()) {
  const router = express.Router();

  router.post('/', founderAuthenticate, async (req, res) => {
    try {
      const userId = req.body?.userId;
      if (typeof userId !== 'string' || !userId) {
        return res.status(400).json({ error: 'userId is required' });
      }

      const user = await client.user.findUnique({
        where: { id: userId },
        select: { id: true, language: true },
      });
      if (!user) return res.status(404).json({ error: 'Athlete not found' });

      const subscriptions = await client.pushSubscription.findMany({
        where: { userId, disabledAt: null },
      });
      if (subscriptions.length === 0) {
        return res.json({ result: 'no_subscription' });
      }

      // Reuses the athlete's own stored timezone if they have one (so the
      // test send picks the SAME message their real 18:00 reminder would
      // pick today), falling back to UTC — never a new/invented value,
      // never inferred from IP or request headers. This is read-only:
      // nothing on PushNotificationPreference is ever written by this
      // route.
      const preference = await client.pushNotificationPreference.findUnique({ where: { userId } });
      const timezone = isValidTimeZone(preference?.timezone) ? preference.timezone : 'UTC';
      const localDateStr = getLocalDateString(new Date(), timezone);
      const payload = buildReminderPayload(user.language, localDateStr);

      let sentCount = 0;
      let failedCount = 0;
      for (const sub of subscriptions) {
        const result = await sendPushToSubscription(sub, payload);
        if (result.ok) {
          sentCount += 1;
        } else {
          failedCount += 1;
          if (result.terminal) {
            // Same terminal-failure convention as the scheduler: disable,
            // never hard-delete.
            await client.pushSubscription.update({ where: { id: sub.id }, data: { disabledAt: new Date() } });
          }
        }
      }

      if (sentCount > 0) return res.json({ result: 'sent', sentCount, failedCount });
      return res.json({ result: 'failed', sentCount, failedCount });
    } catch (err) {
      console.error('[founder] push-test error:', err?.message);
      res.status(500).json({ error: 'Server error' });
    }
  });

  return router;
}

module.exports = createFounderPushTestRouter();
module.exports.createFounderPushTestRouter = createFounderPushTestRouter;
