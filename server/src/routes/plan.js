// Coach-led plan API (Prompt 1 foundation).
// No AI call, no trial gate (plan reads/writes are not Claude usage), same
// authenticate-only pattern as games.js/skills.js.

const express = require('express');
const { PrismaClient } = require('@prisma/client');
const authenticate = require('../middleware/authenticate');
const { ensureStarterPlan, SKILL_LABELS, PLAN_TOOLS } = require('../services/planGenerator');

const router = express.Router();
const prisma = new PrismaClient();

// Shape a plan row (with sessions) for the client, adding display labels so
// the frontend doesn't need its own skillKey/toolId mapping tables.
function toClientPlan(plan) {
  if (!plan) return null;
  const sessions = (plan.sessions || []).map(s => ({
    id: s.id,
    sessionNumber: s.sessionNumber,
    title: s.title,
    toolId: s.toolId,
    toolLabel: PLAN_TOOLS[s.toolId]?.label || s.title,
    toolRoute: s.toolRoute,
    skillKey: s.skillKey,
    skillLabel: SKILL_LABELS[s.skillKey] || s.skillKey,
    durationMinutes: s.durationMinutes,
    status: s.status,
    personalizedReason: s.personalizedReason,
    coachInstruction: s.coachInstruction,
    outputType: s.outputType,
    completedAt: s.completedAt,
  }));
  const doneCount = sessions.filter(s => s.status === 'done').length;
  return {
    id: plan.id,
    planType: plan.planType,
    title: plan.title,
    status: plan.status,
    currentSessionNum: plan.currentSessionNum,
    primarySkillFocus: plan.primarySkillFocus,
    primarySkillLabel: SKILL_LABELS[plan.primarySkillFocus] || plan.primarySkillFocus,
    secondarySkillFocus: plan.secondarySkillFocus,
    coachNote: plan.coachNote,
    generatedReason: plan.generatedReason,
    createdAt: plan.createdAt,
    completedAt: plan.completedAt,
    doneCount,
    totalSessions: sessions.length,
    sessions,
    todaySession: sessions.find(s => s.status === 'today') || null,
  };
}

// ── GET /api/plan/current ───────────────────────────────────────────────────
// Returns the newest active plan (any type). If the user finished onboarding
// but has no active plan yet (all existing users at launch), generates the
// starter plan on the spot.
router.get('/current', authenticate, async (req, res) => {
  try {
    let plan = await prisma.plan.findFirst({
      where: { userId: req.userId, status: 'active' },
      orderBy: { createdAt: 'desc' },
      include: { sessions: { orderBy: { sessionNumber: 'asc' } } },
    });

    if (!plan) {
      plan = await ensureStarterPlan(req.userId); // null if onboarding not done
    }

    res.json({ plan: toClientPlan(plan) });
  } catch (err) {
    console.error('[plan] GET /current error:', err?.message);
    res.status(500).json({ error: 'Server error' });
  }
});

// ── POST /api/plan/generate ─────────────────────────────────────────────────
// Explicit generation. Never duplicates an active starter plan — returns the
// existing one instead. (No regenerate flag exposed in Prompt 1: archiving/
// regenerating a live plan is a product decision for a later prompt.)
router.post('/generate', authenticate, async (req, res) => {
  try {
    const plan = await ensureStarterPlan(req.userId);
    if (!plan) return res.status(400).json({ error: 'Complete onboarding first' });
    res.json({ plan: toClientPlan(plan) });
  } catch (err) {
    console.error('[plan] POST /generate error:', err?.message);
    res.status(500).json({ error: 'Server error' });
  }
});

// ── PATCH /api/plan/session/:sessionId/complete ─────────────────────────────
// Marks a session done and unlocks the next one as "today". If it was the
// last open session, the plan itself is marked completed. Basic by design —
// later prompts will have tools call this automatically on completion.
router.patch('/session/:sessionId/complete', authenticate, async (req, res) => {
  try {
    const session = await prisma.planSession.findUnique({
      where: { id: req.params.sessionId },
      include: { plan: true },
    });
    // Ownership check — the session's plan must belong to the caller.
    if (!session || session.plan.userId !== req.userId) {
      return res.status(404).json({ error: 'Session not found' });
    }
    if (session.status === 'done') {
      return res.json({ success: true, alreadyDone: true });
    }

    await prisma.planSession.update({
      where: { id: session.id },
      data: { status: 'done', completedAt: new Date() },
    });

    // Advance: next non-done/non-skipped session (by number) becomes "today".
    const next = await prisma.planSession.findFirst({
      where: {
        planId: session.planId,
        status: { in: ['locked', 'today'] },
        id: { not: session.id },
      },
      orderBy: { sessionNumber: 'asc' },
    });

    if (next) {
      await prisma.planSession.update({
        where: { id: next.id },
        data: { status: 'today' },
      });
      await prisma.plan.update({
        where: { id: session.planId },
        data: { currentSessionNum: next.sessionNumber },
      });
    } else {
      await prisma.plan.update({
        where: { id: session.planId },
        data: { status: 'completed', completedAt: new Date() },
      });
    }

    const plan = await prisma.plan.findUnique({
      where: { id: session.planId },
      include: { sessions: { orderBy: { sessionNumber: 'asc' } } },
    });
    res.json({ success: true, plan: toClientPlan(plan) });
  } catch (err) {
    console.error('[plan] PATCH /session/:id/complete error:', err?.message);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
