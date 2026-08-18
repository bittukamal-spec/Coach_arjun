const express = require('express');
const { PrismaClient } = require('@prisma/client');
const founderAuthenticate = require('../middleware/founderAuthenticate');

// Founder Pilot Overview — Phase 1 (read-only aggregate pilot metrics).
//
// Deliberately derives everything from data the product already writes for
// its own normal operation. No new model, no ProductEvent table, no
// lastActiveAt, no page-view/click tracking, no third-party analytics.
// Active/Returning-athlete metrics are explicitly out of scope for this
// phase (they need a cheap recency signal that doesn't exist yet) — see
// AUDIT.md's pilot-tracking audit for the full rationale.
//
// Guarded exclusively by the new short-lived founder session token
// (founderAuthenticate) — same as founderSafetyEvents.js. The legacy static
// FOUNDER_TOKEN used by routes/founder.js's /pulse is never accepted here
// and this file never reads it.
//
// Every response is built from an explicit field allowlist plus derived
// booleans/counts. It can never include Message.content, ChatSession
// summaries, Mind Journal text, Debrief free text, Self-Talk card text,
// Prescription cardContent/situation/outcomeLesson, SafetyEvent narrative,
// passwords, guardianConsentToken, or a raw guardian email address — those
// columns are either never selected, or selected only to derive a boolean
// that is computed server-side and never forwarded as-is.

const RECENT_LIMIT = 20;

// Selected once per request for the "recent athletes" list. guardianEmail
// and guardianConsentAt are selected only to derive `guardianConsentStatus`
// below — the raw guardianEmail value is never included in any response.
const RECENT_ATHLETE_SELECT = {
  id: true,
  name: true,
  createdAt: true,
  onboardingDone: true,
  tier: true,
  guardianEmail: true,
  guardianConsentAt: true,
};

// Safe percentage of `total` — never divides by zero, never returns
// NaN/Infinity. Rounded to one decimal place.
function pct(count, total) {
  if (!total) return 0;
  return Math.round((count / total) * 1000) / 10;
}

// guardianEmail is only ever set at signup when the athlete was a minor
// (see auth.js's isMinor gate) — its mere presence is the existing,
// already-determinable "guardian context required" signal. Never exposes
// the email itself, and never reads dateOfBirth (not operationally needed
// here since guardianEmail already carries this).
function guardianConsentStatus(user) {
  if (!user.guardianEmail) return 'not_required';
  return user.guardianConsentAt ? 'confirmed' : 'pending';
}

// One pass over a set of Prescription rows (id/userId/status/outcomeStatus
// only) produces every Mental-Rep-related number this endpoint needs — both
// the pilot-wide totals and, when scoped to the "recent athletes" subset,
// the per-athlete flags. NOT_TRIED is a real, replaceable placeholder
// (schema.prisma's own doc comment) and must never count as a reported
// outcome.
function summarizePrescriptions(rows) {
  const receivedAthletes = new Set();
  const completedAthletes = new Set();
  const outcomeReportedAthletes = new Set();
  let completedTotal = 0;
  let outcomesReportedTotal = 0;

  for (const p of rows) {
    receivedAthletes.add(p.userId);
    if (p.status === 'COMPLETED') {
      completedAthletes.add(p.userId);
      completedTotal += 1;
    }
    if (p.outcomeStatus && p.outcomeStatus !== 'NOT_TRIED') {
      outcomeReportedAthletes.add(p.userId);
      outcomesReportedTotal += 1;
    }
  }

  return {
    receivedTotal: rows.length,
    completedTotal,
    outcomesReportedTotal,
    receivedAthletes,
    completedAthletes,
    outcomeReportedAthletes,
  };
}

function createFounderPilotOverviewRouter(client = new PrismaClient()) {
  const router = express.Router();

  router.get('/', founderAuthenticate, async (req, res) => {
    try {
      const now = new Date();
      // Matches the existing convention already used for User counts in
      // routes/founder.js's /pulse (UTC calendar day + rolling 7-day
      // window) — reused here rather than inventing a different rule.
      const todayStart = new Date(now);
      todayStart.setUTCHours(0, 0, 0, 0);
      const weekStart = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

      const [
        totalAthletes,
        signupsToday,
        signupsLast7Days,
        onboardingCompleted,
        onboardingSessionRows,
        premiumAthletes,
        userMessageRows,
        coachSessionsTotal,
        prescriptionRows,
        guardianRequired,
        guardianConsentCompleted,
        recentUsersRaw,
      ] = await Promise.all([
        client.user.count(),
        client.user.count({ where: { createdAt: { gte: todayStart } } }),
        client.user.count({ where: { createdAt: { gte: weekStart } } }),
        client.user.count({ where: { onboardingDone: true } }),
        client.onboardingSession.findMany({ select: { userId: true } }),
        client.user.count({ where: { tier: 'premium' } }),
        client.message.findMany({ where: { role: 'user' }, select: { userId: true } }),
        client.chatSession.count(),
        client.prescription.findMany({ select: { userId: true, status: true, outcomeStatus: true } }),
        client.user.count({ where: { guardianEmail: { not: null } } }),
        client.user.count({ where: { guardianConsentAt: { not: null } } }),
        client.user.findMany({
          orderBy: { createdAt: 'desc' },
          take: RECENT_LIMIT,
          select: RECENT_ATHLETE_SELECT,
        }),
      ]);

      const onboardingStarted = new Set(onboardingSessionRows.map((r) => r.userId)).size;
      const coachUsedAthletes = new Set(userMessageRows.map((r) => r.userId)).size;
      const rep = summarizePrescriptions(prescriptionRows);

      // Per-athlete flags for the "recent athletes" list, scoped to just
      // those ids — never a full-table scan for this part.
      const recentIds = recentUsersRaw.map((u) => u.id);
      const [recentMessageRows, recentPrescriptionRows] = await Promise.all([
        client.message.findMany({
          where: { userId: { in: recentIds }, role: 'user' },
          select: { userId: true },
        }),
        client.prescription.findMany({
          where: { userId: { in: recentIds } },
          select: { userId: true, status: true, outcomeStatus: true },
        }),
      ]);
      const recentCoachUsedSet = new Set(recentMessageRows.map((r) => r.userId));
      const recentRep = summarizePrescriptions(recentPrescriptionRows);

      const recentAthletes = recentUsersRaw.map((u) => ({
        id: u.id,
        firstName: (u.name || '').trim().split(' ')[0] || 'Athlete',
        signupDate: u.createdAt,
        onboardingDone: u.onboardingDone,
        tier: u.tier,
        guardianConsentStatus: guardianConsentStatus(u),
        coachUsed: recentCoachUsedSet.has(u.id),
        mentalRepReceived: recentRep.receivedAthletes.has(u.id),
        mentalRepCompleted: recentRep.completedAthletes.has(u.id),
        outcomeReported: recentRep.outcomeReportedAthletes.has(u.id),
      }));

      const funnel = [
        { stage: 'signedUp', count: totalAthletes, percent: pct(totalAthletes, totalAthletes) },
        { stage: 'completedOnboarding', count: onboardingCompleted, percent: pct(onboardingCompleted, totalAthletes) },
        { stage: 'usedCoach', count: coachUsedAthletes, percent: pct(coachUsedAthletes, totalAthletes) },
        { stage: 'receivedMentalRep', count: rep.receivedAthletes.size, percent: pct(rep.receivedAthletes.size, totalAthletes) },
        { stage: 'completedMentalRep', count: rep.completedAthletes.size, percent: pct(rep.completedAthletes.size, totalAthletes) },
        { stage: 'reportedOutcome', count: rep.outcomeReportedAthletes.size, percent: pct(rep.outcomeReportedAthletes.size, totalAthletes) },
      ];

      res.json({
        metrics: {
          totalAthletes,
          signupsToday,
          signupsLast7Days,
          onboardingStarted,
          onboardingCompleted,
          coachUsedAthletes,
          coachSessionsTotal,
          mentalRepReceivedAthletes: rep.receivedAthletes.size,
          mentalRepsReceived: rep.receivedTotal,
          mentalRepsCompleted: rep.completedTotal,
          outcomesReported: rep.outcomesReportedTotal,
          tier: { premium: premiumAthletes, free: totalAthletes - premiumAthletes },
          guardian: { required: guardianRequired, consentCompleted: guardianConsentCompleted },
        },
        funnel,
        recentAthletes,
      });
    } catch (err) {
      console.error('[founder] pilot-overview error:', err?.message);
      res.status(500).json({ error: 'Server error' });
    }
  });

  return router;
}

module.exports = createFounderPilotOverviewRouter();
module.exports.createFounderPilotOverviewRouter = createFounderPilotOverviewRouter;
