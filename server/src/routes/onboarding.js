// Adaptive onboarding (v2) — structured, versioned, server-authoritative.
// Auth required; guardian consent is deliberately NOT required (minors may
// complete onboarding before consent is confirmed). The client is never
// trusted: all IDs, limits, exclusivity, custom text, branch consistency and
// completeness are validated here. Raw custom text is never logged.

const express = require('express');
const { PrismaClient } = require('@prisma/client');
const authenticate = require('../middleware/authenticate');
const C = require('../onboarding/config');
const { validateAnswers, missingRequired } = require('../onboarding/validate');
const { completeOnboarding, USER_SELECT } = require('../onboarding/complete');

const prisma = new PrismaClient();
const VERSION = 2;

function serialize(s) {
  return {
    onboardingVersion: s.onboardingVersion,
    attemptNumber: s.attemptNumber,
    status: s.status,
    revision: s.revision,
    currentStepId: s.currentStepId,
    branchId: s.branchId,
    primaryPriorityId: s.primaryPriorityId,
    answers: s.answers || {},
    startedAt: s.startedAt,
    lastSavedAt: s.lastSavedAt,
    completedAt: s.completedAt,
  };
}

function parseGoals(user) {
  if (!user) return user;
  let goals = [];
  try { goals = JSON.parse(user.goals || '[]'); } catch { goals = []; }
  return { ...user, goals };
}

// Race-safe first-attempt creation. The ActiveOnboardingSession composite PK
// (userId, onboardingVersion) guarantees only one active attempt: a concurrent
// loser hits P2002, rolls back, and reloads the winner's session.
async function createFirstAttempt(client, userId) {
  try {
    return await client.$transaction(async (tx) => {
      const s = await tx.onboardingSession.create({
        data: { userId, onboardingVersion: VERSION, attemptNumber: 1 },
      });
      await tx.activeOnboardingSession.create({
        data: { userId, onboardingVersion: VERSION, sessionId: s.id },
      });
      return s;
    });
  } catch (e) {
    if (e?.code === 'P2002') {
      const active = await client.activeOnboardingSession.findUnique({
        where: { userId_onboardingVersion: { userId, onboardingVersion: VERSION } },
        include: { session: true },
      });
      if (active?.session) return active.session;
    }
    throw e;
  }
}

function createOnboardingRouter(client = prisma, deps = {}) {
  const router = express.Router();

  // ── GET current session ────────────────────────────────────────────────
  router.get('/session', authenticate, async (req, res) => {
    try {
      const userId = req.userId;
      let session = await client.onboardingSession.findFirst({
        where: { userId, onboardingVersion: VERSION, status: 'IN_PROGRESS' },
      });
      if (!session) {
        const completed = await client.onboardingSession.findFirst({
          where: { userId, onboardingVersion: VERSION, status: 'COMPLETED' },
          orderBy: { attemptNumber: 'desc' },
        });
        if (completed) return res.json({ session: serialize(completed), questionSetVersion: VERSION });
        session = await createFirstAttempt(client, userId);
      }
      return res.json({ session: serialize(session), questionSetVersion: VERSION });
    } catch (e) {
      console.error('[onboarding] GET /session failed:', e?.message);
      return res.status(500).json({ error: 'Server error' });
    }
  });

  // ── PATCH partial save (optimistic revision) ───────────────────────────
  router.patch('/session', authenticate, async (req, res) => {
    try {
      const userId = req.userId;
      const { onboardingVersion, expectedRevision, currentStepId, answers } = req.body || {};

      if (onboardingVersion !== VERSION) return res.status(400).json({ error: 'BAD_VERSION' });
      if (!Number.isInteger(expectedRevision)) return res.status(400).json({ error: 'BAD_REVISION' });
      if (currentStepId != null && !C.allScreenIds().includes(currentStepId)) {
        return res.status(400).json({ error: 'INVALID_SCREEN_ID' });
      }

      const session = await client.onboardingSession.findFirst({
        where: { userId, onboardingVersion: VERSION, status: 'IN_PROGRESS' },
      });
      if (!session) return res.status(404).json({ error: 'NO_ACTIVE_SESSION' });

      if (expectedRevision !== session.revision) {
        return res.status(409).json({ error: 'STALE_CONFLICT', session: serialize(session), revision: session.revision });
      }

      // Merge (per-question replacement) for cross-question validation context.
      const merged = { ...(session.answers || {}) };
      for (const [qid, ans] of Object.entries(answers || {})) merged[qid] = ans;

      const check = validateAnswers(answers || {}, merged);
      if (!check.ok) {
        return res.status(400).json({ error: check.code, message: check.error, questionId: check.questionId });
      }

      // Apply cleaned answers (sanitised custom text) into the merged map.
      for (const [qid, cleaned] of Object.entries(check.cleaned)) merged[qid] = cleaned;

      // Prune answers for questions no longer reachable in the resolved branch.
      const reachable = C.reachableQuestionIds(merged);
      const prunedQuestionIds = Object.keys(merged).filter((qid) => !reachable.has(qid));
      for (const qid of prunedQuestionIds) delete merged[qid];

      const branchId = C.resolveBranch(merged);
      const primaryPriorityId = merged.primary_priority?.answerIds?.[0] || null;

      const upd = await client.onboardingSession.updateMany({
        where: { id: session.id, status: 'IN_PROGRESS', revision: expectedRevision },
        data: {
          answers: merged,
          currentStepId: currentStepId ?? session.currentStepId,
          branchId,
          primaryPriorityId,
          revision: { increment: 1 },
        },
      });
      if (upd.count === 0) {
        const fresh = await client.onboardingSession.findUnique({ where: { id: session.id } });
        return res.status(409).json({ error: 'STALE_CONFLICT', session: serialize(fresh), revision: fresh.revision });
      }

      const fresh = await client.onboardingSession.findUnique({ where: { id: session.id } });
      return res.json({ session: serialize(fresh), prunedQuestionIds });
    } catch (e) {
      console.error('[onboarding] PATCH /session failed:', e?.message);
      return res.status(500).json({ error: 'Server error' });
    }
  });

  // ── POST complete ──────────────────────────────────────────────────────
  router.post('/session/complete', authenticate, async (req, res) => {
    try {
      const userId = req.userId;
      const { onboardingVersion, expectedRevision } = req.body || {};
      if (onboardingVersion !== VERSION) return res.status(400).json({ error: 'BAD_VERSION' });
      if (!Number.isInteger(expectedRevision)) return res.status(400).json({ error: 'BAD_REVISION' });

      const session = await client.onboardingSession.findFirst({
        where: { userId, onboardingVersion: VERSION, status: 'IN_PROGRESS' },
      });

      if (!session) {
        // Idempotent: already completed → return the completed session + user.
        const completed = await client.onboardingSession.findFirst({
          where: { userId, onboardingVersion: VERSION, status: 'COMPLETED' },
          orderBy: { attemptNumber: 'desc' },
        });
        if (completed) {
          const user = await client.user.findUnique({ where: { id: userId }, select: USER_SELECT });
          return res.json({ user: parseGoals(user), session: serialize(completed) });
        }
        return res.status(404).json({ error: 'NO_ACTIVE_SESSION' });
      }

      if (expectedRevision !== session.revision) {
        return res.status(409).json({ error: 'STALE_CONFLICT', session: serialize(session), revision: session.revision });
      }

      const missing = missingRequired(session.answers || {});
      if (missing.length) return res.status(422).json({ error: 'INCOMPLETE', missing });

      const { user, session: done } = await completeOnboarding(client, session, deps);
      return res.json({ user: parseGoals(user), session: serialize(done) });
    } catch (e) {
      if (e?.code === 'STALE_CONFLICT') {
        const fresh = await client.onboardingSession.findFirst({
          where: { userId: req.userId, onboardingVersion: VERSION },
          orderBy: { attemptNumber: 'desc' },
        });
        return res.status(409).json({ error: 'STALE_CONFLICT', session: fresh ? serialize(fresh) : null, revision: fresh?.revision });
      }
      console.error('[onboarding] POST /session/complete failed:', e?.message);
      return res.status(500).json({ error: 'Server error' });
    }
  });

  return router;
}

module.exports = createOnboardingRouter();
module.exports.createOnboardingRouter = createOnboardingRouter;
module.exports.serialize = serialize;
module.exports.createFirstAttempt = createFirstAttempt;
