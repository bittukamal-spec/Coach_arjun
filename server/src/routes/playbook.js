// Mental Playbook — the private reward/progress surface of the Healthy
// Hook loop. Read-only aggregation over models that already exist
// (ToolReport, SelfTalkCard, Debrief, and — since PR-13 — Prescription's
// outcome fields), no AI call. Insight detection is deliberately rule-based
// and returns a KEY (plus params), not prose, so the client renders it
// bilingually and copy stays in one place. "Progress without pressure":
// plain counts and short athlete-visible lessons only — no scores, no
// streak shame, no ranking, no raw chat message bodies.

const express = require('express');
const { PrismaClient } = require('@prisma/client');
const authenticate = require('../middleware/authenticate');
const { APPROVED_PRACTICES } = require('../services/coaching/practiceRegistry');

const router = express.Router();
const prisma = new PrismaClient();

const OUTCOME_HISTORY_LIMIT = 10;
const NEUTRAL_PRACTICE_FALLBACK = 'Mental Rep';

function parseDetails(raw) {
  try { return JSON.parse(raw || '{}'); } catch { return {}; }
}

function practiceDisplayName(practiceKey) {
  return APPROVED_PRACTICES[practiceKey]?.label || NEUTRAL_PRACTICE_FALLBACK;
}

function topEntry(counts) {
  const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]);
  return sorted.length ? { value: sorted[0][0], count: sorted[0][1] } : null;
}

router.get('/', authenticate, async (req, res) => {
  try {
    const weekAgo  = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const monthAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    const [reports, focusCards, reflections, outcomePrescriptions] = await Promise.all([
      prisma.toolReport.findMany({
        where: { userId: req.userId, createdAt: { gte: monthAgo } },
        orderBy: { createdAt: 'desc' },
        select: { toolType: true, details: true, createdAt: true },
      }),
      prisma.selfTalkCard.findMany({
        where: { userId: req.userId, isArchived: false, isActive: true },
        orderBy: [{ isMatchDayCard: 'desc' }, { createdAt: 'desc' }],
        take: 5,
        select: { id: true, focusWord: true, resetWord: true, powerLine: true, isMatchDayCard: true, createdAt: true },
      }),
      prisma.debrief.findMany({
        where: { userId: req.userId },
        orderBy: { createdAt: 'desc' },
        take: 5,
        select: { id: true, eventType: true, resultType: true, nextFocus: true, arjunInsight: true, createdAt: true },
      }),
      // Prescription outcomes (PR-13) — "What I'm learning". Newest first,
      // bounded, this athlete's records only. Never the raw chat message
      // (outcomeLesson is a separate, short, athlete-visible field) and
      // never internal tool/cycle data beyond the cycle's bare status.
      prisma.prescription.findMany({
        where: { userId: req.userId, outcomeStatus: { not: null } },
        orderBy: { outcomeRecordedAt: 'desc' },
        take: OUTCOME_HISTORY_LIMIT,
        select: {
          id: true,
          practiceKey: true,
          situation: true,
          outcomeStatus: true,
          outcomeLesson: true,
          outcomeRecordedAt: true,
          cycle: { select: { status: true } },
        },
      }),
    ]);

    const weekReports      = reports.filter(r => r.createdAt >= weekAgo);
    const weekRepCount     = weekReports.filter(r => r.toolType === 'mental_rep').length;
    const weekResetCount   = weekReports.filter(r => r.toolType === 'body_reset').length;

    // Cue history from mental reps (last 30 days)
    const repDetails = reports
      .filter(r => r.toolType === 'mental_rep')
      .map(r => ({ ...parseDetails(r.details), createdAt: r.createdAt }))
      .filter(d => d.cue);

    const savedCues = repDetails
      .filter(d => d.savedCue)
      .slice(0, 8)
      .map(d => ({ cue: d.cue, state: d.state, moment: d.moment, context: d.context, createdAt: d.createdAt }));

    const cueCounts = {}, stateCounts = {}, momentCounts = {};
    for (const d of repDetails) {
      cueCounts[d.cue] = (cueCounts[d.cue] || 0) + 1;
      if (d.state)  stateCounts[d.state]   = (stateCounts[d.state] || 0) + 1;
      if (d.moment) momentCounts[d.moment] = (momentCounts[d.moment] || 0) + 1;
    }
    const topCue    = topEntry(cueCounts);
    const topState  = topEntry(stateCounts);
    const topMoment = topEntry(momentCounts);

    // Rule-based "pattern noticed" — a key the client turns into copy.
    // Requires at least 2 data points so day-one users don't get a fake
    // pattern; null means the client simply hides the insight card.
    let insight = null;
    if (topMoment?.value === 'after_mistake' && topMoment.count >= 2) {
      insight = { key: 'reset_after_mistake' };
    } else if (topState?.value === 'frustrated' && topState.count >= 2) {
      insight = { key: 'reset_after_mistake' };
    } else if (topState?.value === 'nervous' && topState.count >= 2) {
      insight = { key: 'nervous_pattern' };
    } else if (topCue && topCue.count >= 2) {
      insight = { key: 'cue_repeat', cue: topCue.value };
    }

    const practiceOutcomes = outcomePrescriptions.map(p => ({
      prescriptionId: p.id,
      practiceKey: p.practiceKey,
      practiceName: practiceDisplayName(p.practiceKey),
      situation: p.situation,
      outcomeStatus: p.outcomeStatus,
      lesson: p.outcomeLesson,
      outcomeRecordedAt: p.outcomeRecordedAt,
      cycleStatus: p.cycle?.status || null,
    }));

    res.json({
      weekRepCount,
      weekResetCount,
      totalRepCount: repDetails.length,
      topCue,
      savedCues,
      focusCards,
      reflections,
      insight,
      practiceOutcomes,
    });
  } catch (err) {
    console.error('[playbook] GET error:', err?.message);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
// Exported for direct unit testing (same pattern as
// requireGuardianConsent's createRequireGuardianConsent) — attaching a
// named property to the router function/object doesn't change how
// index.js consumes it as Express middleware.
module.exports.practiceDisplayName = practiceDisplayName;
