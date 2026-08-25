const express = require('express');
const { PrismaClient } = require('@prisma/client');
const authenticate = require('../middleware/authenticate');
const {
  parseOptions,
  validateResponseValue,
  isEligible,
} = require('../services/pilotCommunications');

// Pilot Communications v1 — athlete-facing surface.
//
// Every handler derives the athlete strictly from `req.userId` (set by
// `authenticate` from the verified JWT) — never from a client-supplied
// field. A communicationId the athlete isn't explicitly targeted for always
// reads as a plain 404, the same response as one that doesn't exist, so a
// non-targeted athlete can never distinguish "not mine" from "doesn't
// exist".
//
// This is a product/feedback channel only: nothing here is ever read by
// Coach, Mind Journal, Arjun Review, ToolReport, Mental Rep, skill
// progression, XP, streaks, or safety interpretation — see
// docs on Pilot Communications v1 in CLAUDE.md.
//
// `createPilotCommunicationsRouter` is injectable for tests (same pattern
// as founderSafetyEvents.js / founderPilotOverview.js); the default export
// always uses the real Prisma client.

function createPilotCommunicationsRouter(client = new PrismaClient()) {
  const router = express.Router();

  // GET /next — at most ONE eligible communication, oldest published first.
  // The server enforces eligibility end-to-end; the client never receives
  // more than it is allowed to show.
  router.get('/next', authenticate, async (req, res) => {
    try {
      const targets = await client.pilotCommunicationTarget.findMany({
        where: { userId: req.userId, communication: { isActive: true } },
        include: {
          communication: {
            include: { responses: { where: { userId: req.userId } } },
          },
        },
      });

      const eligible = targets
        .map((t) => ({
          communication: t.communication,
          response: t.communication.responses[0] || null,
        }))
        .filter(({ communication, response }) => isEligible(communication, response))
        .sort((a, b) => new Date(a.communication.publishedAt) - new Date(b.communication.publishedAt));

      if (eligible.length === 0) return res.json({ communication: null });

      const c = eligible[0].communication;
      res.json({
        communication: {
          id: c.id,
          type: c.type,
          title: c.title,
          body: c.body,
          ctaRoute: c.ctaRoute,
          ctaLabel: c.ctaLabel,
          responseType: c.responseType,
          responseOptions: parseOptions(c.responseOptions),
        },
      });
    } catch (err) {
      console.error('[pilot-communications] next error:', err?.message);
      res.status(500).json({ error: 'Server error' });
    }
  });

  // Shared guard: communication must exist + be active, and the athlete
  // must be explicitly targeted. Returns the communication row on success,
  // or null after already sending a 404.
  async function loadActiveTargetedCommunication(req, res, { requireType } = {}) {
    const communication = await client.pilotCommunication.findUnique({
      where: { id: req.params.id },
    });
    if (!communication || !communication.isActive) {
      res.status(404).json({ error: 'Not found' });
      return null;
    }
    if (requireType && communication.type !== requireType) {
      res.status(404).json({ error: 'Not found' });
      return null;
    }
    const target = await client.pilotCommunicationTarget.findUnique({
      where: { communicationId_userId: { communicationId: communication.id, userId: req.userId } },
    });
    if (!target) {
      res.status(404).json({ error: 'Not found' });
      return null;
    }
    return communication;
  }

  // POST /:id/seen — idempotent, sets seenAt once and never overwrites it.
  router.post('/:id/seen', authenticate, async (req, res) => {
    try {
      const communication = await loadActiveTargetedCommunication(req, res);
      if (!communication) return;

      await client.pilotCommunicationResponse.upsert({
        where: { communicationId_userId: { communicationId: communication.id, userId: req.userId } },
        create: { communicationId: communication.id, userId: req.userId, seenAt: new Date() },
        update: {}, // row already exists — never touch an existing seenAt
      });
      res.json({ ok: true });
    } catch (err) {
      console.error('[pilot-communications] seen error:', err?.message);
      res.status(500).json({ error: 'Server error' });
    }
  });

  // POST /:id/dismiss — announcement only. One dismissal = permanent.
  router.post('/:id/dismiss', authenticate, async (req, res) => {
    try {
      const communication = await loadActiveTargetedCommunication(req, res, { requireType: 'ANNOUNCEMENT' });
      if (!communication) return;

      await client.$transaction(async (tx) => {
        const existing = await tx.pilotCommunicationResponse.findUnique({
          where: { communicationId_userId: { communicationId: communication.id, userId: req.userId } },
        });
        if (existing?.dismissedAt || existing?.respondedAt) return; // stable — already terminal
        if (!existing) {
          await tx.pilotCommunicationResponse.create({
            data: { communicationId: communication.id, userId: req.userId, dismissedAt: new Date() },
          });
          return;
        }
        await tx.pilotCommunicationResponse.update({
          where: { id: existing.id },
          data: { dismissedAt: new Date() },
        });
      });
      res.json({ ok: true });
    } catch (err) {
      console.error('[pilot-communications] dismiss error:', err?.message);
      res.status(500).json({ error: 'Server error' });
    }
  });

  // POST /:id/not-now — survey only. First call defers once (still
  // eligible later); second call permanently dismisses. Further calls are
  // stable/idempotent (the transaction's first check returns early once
  // dismissedAt is set).
  router.post('/:id/not-now', authenticate, async (req, res) => {
    try {
      const communication = await loadActiveTargetedCommunication(req, res, { requireType: 'SURVEY' });
      if (!communication) return;

      await client.$transaction(async (tx) => {
        const existing = await tx.pilotCommunicationResponse.findUnique({
          where: { communicationId_userId: { communicationId: communication.id, userId: req.userId } },
        });
        if (existing?.dismissedAt || existing?.respondedAt) return; // stable — already terminal
        if (!existing) {
          await tx.pilotCommunicationResponse.create({
            data: { communicationId: communication.id, userId: req.userId, deferCount: 1 },
          });
          return;
        }
        if (existing.deferCount < 1) {
          await tx.pilotCommunicationResponse.update({
            where: { id: existing.id },
            data: { deferCount: 1 },
          });
          return;
        }
        // Second (or later) "Not now" — permanent dismissal.
        await tx.pilotCommunicationResponse.update({
          where: { id: existing.id },
          data: { deferCount: { increment: 1 }, dismissedAt: new Date() },
        });
      });
      res.json({ ok: true });
    } catch (err) {
      console.error('[pilot-communications] not-now error:', err?.message);
      res.status(500).json({ error: 'Server error' });
    }
  });

  // POST /:id/respond — survey only. Structured value, validated against
  // THIS communication's own responseType/options. No changing an answer
  // once respondedAt is set: an identical repeat is idempotent, a
  // conflicting one is rejected.
  router.post('/:id/respond', authenticate, async (req, res) => {
    try {
      const communication = await loadActiveTargetedCommunication(req, res, { requireType: 'SURVEY' });
      if (!communication) return;

      const { value } = req.body || {};
      if (!validateResponseValue(communication, value)) {
        return res.status(400).json({ error: 'Invalid response value' });
      }

      const existing = await client.pilotCommunicationResponse.findUnique({
        where: { communicationId_userId: { communicationId: communication.id, userId: req.userId } },
      });
      if (existing?.dismissedAt) {
        return res.status(409).json({ error: 'No longer eligible' });
      }
      if (existing?.respondedAt) {
        if (existing.responseValue === value) {
          return res.json({ ok: true, status: 'responded' }); // identical repeat — idempotent
        }
        return res.status(409).json({ error: 'Answer already submitted' }); // no changing answers in v1
      }

      await client.$transaction(async (tx) => {
        if (!existing) {
          await tx.pilotCommunicationResponse.create({
            data: {
              communicationId: communication.id,
              userId: req.userId,
              responseValue: value,
              respondedAt: new Date(),
              seenAt: new Date(),
            },
          });
        } else {
          await tx.pilotCommunicationResponse.update({
            where: { id: existing.id },
            data: { responseValue: value, respondedAt: new Date() },
          });
        }
      });
      res.json({ ok: true, status: 'responded' });
    } catch (err) {
      console.error('[pilot-communications] respond error:', err?.message);
      res.status(500).json({ error: 'Server error' });
    }
  });

  return router;
}

module.exports = createPilotCommunicationsRouter();
module.exports.createPilotCommunicationsRouter = createPilotCommunicationsRouter;
