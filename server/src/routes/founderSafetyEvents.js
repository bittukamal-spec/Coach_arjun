const express = require('express');
const { PrismaClient } = require('@prisma/client');
const founderAuthenticate = require('../middleware/founderAuthenticate');

// Founder-only SafetyEvent review API (PR-6). Guarded exclusively by the new
// short-lived founder session token — the old static FOUNDER_TOKEN (used by
// routes/founder.js's /pulse) is never accepted here.
//
// Every response below is built from an explicit field allowlist. It can
// never include Message.content, CheckIn free-text fields, or any other
// athlete-authored text — those columns are simply never selected, so there
// is nothing to accidentally leak even if the underlying model gains such a
// field later.
//
// `createFounderSafetyEventsRouter` is injectable for tests (same pattern as
// requireGuardianConsent/recordSafetyEvent/weeklyReports); the default
// export always uses the real Prisma client.

const REVIEW_STATUSES = ['UNREVIEWED', 'REVIEWED'];
const REVIEW_OUTCOMES = ['NO_ACTION', 'FOLLOW_UP_REQUIRED', 'ESCALATED', 'FALSE_POSITIVE'];
const MAX_LIMIT = 50;
const DEFAULT_LIMIT = 20;

const EVENT_SELECT = {
  id: true,
  userId: true,
  surface: true,
  triggerType: true,
  riskLevel: true,
  sourceType: true,
  sourceRecordId: true,
  chatSessionId: true,
  userMessageId: true,
  reviewStatus: true,
  reviewOutcome: true,
  reviewedAt: true,
  reviewedBy: true,
  createdAt: true,
  // Minimal athlete identification only — no email, no free-text profile fields.
  user: { select: { id: true, name: true, sport: true } },
};

function createFounderSafetyEventsRouter(client = new PrismaClient()) {
  const router = express.Router();

  // GET / — newest first, bounded, optional review-status filter.
  router.get('/', founderAuthenticate, async (req, res) => {
    try {
      const rawLimit = parseInt(req.query.limit, 10);
      const limit = Number.isFinite(rawLimit) && rawLimit > 0
        ? Math.min(rawLimit, MAX_LIMIT)
        : DEFAULT_LIMIT;

      const where = {};
      if (req.query.reviewStatus !== undefined) {
        if (!REVIEW_STATUSES.includes(req.query.reviewStatus)) {
          return res.status(400).json({ error: 'Invalid reviewStatus filter' });
        }
        where.reviewStatus = req.query.reviewStatus;
      }

      const events = await client.safetyEvent.findMany({
        where,
        select: EVENT_SELECT,
        orderBy: { createdAt: 'desc' },
        take: limit,
      });
      res.json({ events });
    } catch (err) {
      console.error('[founder] safety-events list error:', err?.message);
      res.status(500).json({ error: 'Server error' });
    }
  });

  // GET /:id — single event, same allowlisted shape.
  router.get('/:id', founderAuthenticate, async (req, res) => {
    try {
      const event = await client.safetyEvent.findUnique({
        where: { id: req.params.id },
        select: EVENT_SELECT,
      });
      if (!event) return res.status(404).json({ error: 'Not found' });
      res.json({ event });
    } catch (err) {
      console.error('[founder] safety-event read error:', err?.message);
      res.status(500).json({ error: 'Server error' });
    }
  });

  // PATCH /:id/review — structured review only. Accepts exactly
  // {reviewStatus, reviewOutcome}, both from a fixed enum. reviewedAt/
  // reviewedBy are always set server-side; no other field (in particular,
  // no free-text note) is ever accepted.
  router.patch('/:id/review', founderAuthenticate, async (req, res) => {
    const body = req.body || {};
    const bodyKeys = Object.keys(body);
    const { reviewStatus, reviewOutcome } = body;

    const onlyAllowedKeys = bodyKeys.length > 0 && bodyKeys.every(
      (k) => k === 'reviewStatus' || k === 'reviewOutcome'
    );

    if (!onlyAllowedKeys || !REVIEW_STATUSES.includes(reviewStatus) || !REVIEW_OUTCOMES.includes(reviewOutcome)) {
      return res.status(400).json({ error: 'Invalid review update' });
    }

    try {
      const existing = await client.safetyEvent.findUnique({ where: { id: req.params.id } });
      if (!existing) return res.status(404).json({ error: 'Not found' });

      const event = await client.safetyEvent.update({
        where: { id: req.params.id },
        data: {
          reviewStatus,
          reviewOutcome,
          reviewedAt: new Date(),
          reviewedBy: 'founder',
        },
        select: EVENT_SELECT,
      });
      res.json({ event });
    } catch (err) {
      console.error('[founder] safety-event review error:', err?.message);
      res.status(500).json({ error: 'Server error' });
    }
  });

  return router;
}

module.exports = createFounderSafetyEventsRouter();
module.exports.createFounderSafetyEventsRouter = createFounderSafetyEventsRouter;
