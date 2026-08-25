const express = require('express');
const { PrismaClient } = require('@prisma/client');
const founderAuthenticate = require('../middleware/founderAuthenticate');
const {
  parseOptions,
  validateCommunicationInput,
  deriveAthleteStatus,
} = require('../services/pilotCommunications');

// Pilot Communications v1 — founder surface.
//
// Guarded exclusively by the short-lived founder session token
// (founderAuthenticate) — same as founderSafetyEvents.js and
// founderPilotOverview.js. The legacy static FOUNDER_TOKEN used by
// routes/founder.js's /pulse is never accepted here.
//
// Every athlete-identifying field returned below is the same minimal
// allowlist founderSafetyEvents.js already uses (id, first name, sport) —
// no email, no free-text profile fields.
//
// `createFounderPilotCommunicationsRouter` is injectable for tests (same
// pattern as the other founder routers); the default export always uses
// the real Prisma client.

function serializeCommunication(c, counts = {}) {
  return {
    id: c.id,
    type: c.type,
    title: c.title,
    body: c.body,
    ctaRoute: c.ctaRoute,
    ctaLabel: c.ctaLabel,
    audienceMode: c.audienceMode,
    responseType: c.responseType,
    responseOptions: parseOptions(c.responseOptions),
    isActive: c.isActive,
    publishedAt: c.publishedAt,
    createdAt: c.createdAt,
    targetCount: counts.targetCount ?? 0,
    seenCount: counts.seenCount ?? 0,
    respondedCount: counts.respondedCount ?? 0,
    dismissedCount: counts.dismissedCount ?? 0,
  };
}

// Structured survey breakdown, keyed by every configured option/value —
// including options nobody picked (count 0) — never derived from whatever
// values happen to appear in the response rows.
function buildSurveyBreakdown(communication, responses) {
  let keys;
  if (communication.responseType === 'YES_SOMEWHAT_NO') keys = ['yes', 'somewhat', 'no'];
  else if (communication.responseType === 'RATING_1_5') keys = ['1', '2', '3', '4', '5'];
  else keys = parseOptions(communication.responseOptions);

  const counts = {};
  for (const k of keys) counts[k] = 0;
  for (const r of responses) {
    if (!r.respondedAt) continue;
    if (Object.prototype.hasOwnProperty.call(counts, r.responseValue)) counts[r.responseValue] += 1;
  }
  return counts;
}

function createFounderPilotCommunicationsRouter(client = new PrismaClient()) {
  const router = express.Router();

  // GET /athletes — minimal identity list for the founder's audience
  // checklist. Declared before /:id so it is never swallowed as a
  // communication id (same convention as App.jsx's own literal-before-param
  // route ordering).
  router.get('/athletes', founderAuthenticate, async (req, res) => {
    try {
      const users = await client.user.findMany({
        orderBy: { createdAt: 'desc' },
        select: { id: true, name: true, sport: true },
      });
      res.json({
        athletes: users.map((u) => ({
          id: u.id,
          firstName: (u.name || '').trim().split(' ')[0] || 'Athlete',
          sport: u.sport || null,
        })),
      });
    } catch (err) {
      console.error('[founder] pilot-communications athletes error:', err?.message);
      res.status(500).json({ error: 'Server error' });
    }
  });

  // GET / — every communication with server-aggregated counts. A single
  // pass over targets/responses (same style as founderPilotOverview.js)
  // rather than a Prisma groupBy, so this stays trivially stubbable in
  // tests without a real database.
  router.get('/', founderAuthenticate, async (req, res) => {
    try {
      const communications = await client.pilotCommunication.findMany({ orderBy: { createdAt: 'desc' } });
      const ids = communications.map((c) => c.id);

      const [targets, responses] = await Promise.all([
        client.pilotCommunicationTarget.findMany({
          where: { communicationId: { in: ids } },
          select: { communicationId: true },
        }),
        client.pilotCommunicationResponse.findMany({
          where: { communicationId: { in: ids } },
          select: { communicationId: true, seenAt: true, respondedAt: true, dismissedAt: true },
        }),
      ]);

      const targetCount = {};
      for (const t of targets) targetCount[t.communicationId] = (targetCount[t.communicationId] || 0) + 1;
      const seenCount = {};
      const respondedCount = {};
      const dismissedCount = {};
      for (const r of responses) {
        if (r.seenAt) seenCount[r.communicationId] = (seenCount[r.communicationId] || 0) + 1;
        if (r.respondedAt) respondedCount[r.communicationId] = (respondedCount[r.communicationId] || 0) + 1;
        if (r.dismissedAt) dismissedCount[r.communicationId] = (dismissedCount[r.communicationId] || 0) + 1;
      }

      res.json({
        communications: communications.map((c) => serializeCommunication(c, {
          targetCount: targetCount[c.id] || 0,
          seenCount: seenCount[c.id] || 0,
          respondedCount: respondedCount[c.id] || 0,
          dismissedCount: dismissedCount[c.id] || 0,
        })),
      });
    } catch (err) {
      console.error('[founder] pilot-communications list error:', err?.message);
      res.status(500).json({ error: 'Server error' });
    }
  });

  // GET /:id — targeted athletes + per-athlete status + structured survey
  // breakdown. Never exposes anything beyond the minimal athlete identity
  // allowlist and the athlete's own structured response value.
  router.get('/:id', founderAuthenticate, async (req, res) => {
    try {
      const communication = await client.pilotCommunication.findUnique({ where: { id: req.params.id } });
      if (!communication) return res.status(404).json({ error: 'Not found' });

      const [targets, responses] = await Promise.all([
        client.pilotCommunicationTarget.findMany({
          where: { communicationId: communication.id },
          include: { user: { select: { id: true, name: true, sport: true } } },
        }),
        client.pilotCommunicationResponse.findMany({ where: { communicationId: communication.id } }),
      ]);

      const responseByUser = {};
      for (const r of responses) responseByUser[r.userId] = r;

      const athletes = targets.map((t) => {
        const response = responseByUser[t.userId] || null;
        return {
          userId: t.userId,
          firstName: (t.user?.name || '').trim().split(' ')[0] || 'Athlete',
          sport: t.user?.sport || null,
          status: deriveAthleteStatus(response),
          responseValue: response?.respondedAt ? response.responseValue : null,
          respondedAt: response?.respondedAt || null,
        };
      });

      const counts = {
        targetCount: targets.length,
        seenCount: responses.filter((r) => r.seenAt).length,
        respondedCount: responses.filter((r) => r.respondedAt).length,
        dismissedCount: responses.filter((r) => r.dismissedAt).length,
      };

      res.json({
        communication: serializeCommunication(communication, counts),
        athletes,
        breakdown: communication.type === 'SURVEY' ? buildSurveyBreakdown(communication, responses) : null,
      });
    } catch (err) {
      console.error('[founder] pilot-communications detail error:', err?.message);
      res.status(500).json({ error: 'Server error' });
    }
  });

  // POST / — create a draft. Content is fully validated server-side
  // (validateCommunicationInput); client validation is never trusted alone.
  // Audience is validated here too: "ALL" is stored as a mode only (real
  // targets are resolved at publish time, see POST /:id/publish);
  // "SELECTED" targets are created immediately, since every id must
  // already exist as a real athlete.
  router.post('/', founderAuthenticate, async (req, res) => {
    const validation = validateCommunicationInput(req.body);
    if (!validation.ok) return res.status(400).json({ error: validation.error });

    const audience = req.body?.audience;
    if (!audience || (audience.mode !== 'ALL' && audience.mode !== 'SELECTED')) {
      return res.status(400).json({ error: 'Invalid audience' });
    }

    let selectedIds = [];
    if (audience.mode === 'SELECTED') {
      if (!Array.isArray(audience.userIds) || audience.userIds.length === 0) {
        return res.status(400).json({ error: 'Select at least one athlete' });
      }
      const uniqueIds = Array.from(new Set(audience.userIds.filter((id) => typeof id === 'string' && id)));
      try {
        const existingUsers = await client.user.findMany({
          where: { id: { in: uniqueIds } },
          select: { id: true },
        });
        if (existingUsers.length !== uniqueIds.length) {
          return res.status(400).json({ error: 'One or more selected athletes are invalid' });
        }
      } catch (err) {
        console.error('[founder] pilot-communications create (audience check) error:', err?.message);
        return res.status(500).json({ error: 'Server error' });
      }
      selectedIds = uniqueIds;
    }

    try {
      const created = await client.$transaction(async (tx) => {
        const communication = await tx.pilotCommunication.create({
          data: { ...validation.data, audienceMode: audience.mode },
        });
        if (audience.mode === 'SELECTED') {
          await tx.pilotCommunicationTarget.createMany({
            data: selectedIds.map((userId) => ({ communicationId: communication.id, userId })),
            skipDuplicates: true,
          });
        }
        return communication;
      });
      res.status(201).json({
        communication: serializeCommunication(created, { targetCount: selectedIds.length }),
      });
    } catch (err) {
      console.error('[founder] pilot-communications create error:', err?.message);
      res.status(500).json({ error: 'Server error' });
    }
  });

  // POST /:id/publish — resolves the audience into explicit target rows and
  // activates. Idempotent: calling this again on an already-published
  // communication changes nothing and never re-resolves "ALL" against
  // current pilot membership — see the PilotCommunicationTarget model
  // comment for why. Transactional so a failure never leaves partial
  // target rows behind.
  router.post('/:id/publish', founderAuthenticate, async (req, res) => {
    try {
      const communication = await client.pilotCommunication.findUnique({ where: { id: req.params.id } });
      if (!communication) return res.status(404).json({ error: 'Not found' });

      if (communication.isActive && communication.publishedAt) {
        const targetCount = await client.pilotCommunicationTarget.count({
          where: { communicationId: communication.id },
        });
        return res.json({ communication: serializeCommunication(communication, { targetCount }) });
      }

      const updated = await client.$transaction(async (tx) => {
        if (communication.audienceMode === 'ALL') {
          const allUsers = await tx.user.findMany({ select: { id: true } });
          if (allUsers.length > 0) {
            await tx.pilotCommunicationTarget.createMany({
              data: allUsers.map((u) => ({ communicationId: communication.id, userId: u.id })),
              skipDuplicates: true,
            });
          }
        }
        return tx.pilotCommunication.update({
          where: { id: communication.id },
          data: { isActive: true, publishedAt: new Date() },
        });
      });

      const targetCount = await client.pilotCommunicationTarget.count({
        where: { communicationId: updated.id },
      });
      res.json({ communication: serializeCommunication(updated, { targetCount }) });
    } catch (err) {
      console.error('[founder] pilot-communications publish error:', err?.message);
      res.status(500).json({ error: 'Server error' });
    }
  });

  // PATCH /:id/deactivate — hides it from athletes immediately (GET /next
  // filters on isActive). Historical target/response rows are untouched —
  // no hard delete in v1.
  router.patch('/:id/deactivate', founderAuthenticate, async (req, res) => {
    try {
      const communication = await client.pilotCommunication.findUnique({ where: { id: req.params.id } });
      if (!communication) return res.status(404).json({ error: 'Not found' });

      const updated = await client.pilotCommunication.update({
        where: { id: communication.id },
        data: { isActive: false },
      });
      const targetCount = await client.pilotCommunicationTarget.count({
        where: { communicationId: updated.id },
      });
      res.json({ communication: serializeCommunication(updated, { targetCount }) });
    } catch (err) {
      console.error('[founder] pilot-communications deactivate error:', err?.message);
      res.status(500).json({ error: 'Server error' });
    }
  });

  return router;
}

module.exports = createFounderPilotCommunicationsRouter();
module.exports.createFounderPilotCommunicationsRouter = createFounderPilotCommunicationsRouter;
