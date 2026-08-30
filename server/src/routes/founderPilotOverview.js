const express = require('express');
const { PrismaClient } = require('@prisma/client');
const founderAuthenticate = require('../middleware/founderAuthenticate');

// Founder Pilot Overview — Phase 1 (funnel) + Phase 2B (engagement).
//
// Deliberately derives everything from data the product already writes for
// its own normal operation. No new model, no ProductEvent table, no
// page-view/click tracking, no third-party analytics — Phase 2B's
// Active/Returning metrics only ever READ the same User.lastActiveAt
// column the Pilot Tracking Phase 2A foundation already writes and
// backfilled. This file never imports or calls that write-side service —
// no second tracking system, no new write path, read-only end to end.
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
// lastActiveAt (Phase 2B) and lastSeenAt (Pilot Presence Tracking) are both
// forwarded directly — both are already deliberately coarse, non-content
// timestamps, never free text, and conceptually distinct (see schema.prisma
// doc comments on each field): lastActiveAt is meaningful product activity,
// lastSeenAt is mere app-open/foreground presence.
const RECENT_ATHLETE_SELECT = {
  id: true,
  name: true,
  createdAt: true,
  onboardingDone: true,
  tier: true,
  guardianEmail: true,
  guardianConsentAt: true,
  lastActiveAt: true,
  lastSeenAt: true,
  // Pilot beta entitlement (routes/founderPilotAccess.js is the only
  // writer) — forwarded directly, same as lastActiveAt/lastSeenAt: a
  // non-content timestamp, never free text.
  pilotAccessUntil: true,
  pilotAccessGrantedAt: true,
};

// Pilot Presence Tracking — an athlete is LIVE while their last presence
// heartbeat (User.lastSeenAt, written only by services/presence.js) is
// within this window of `now`. Strictly less-than, not less-than-or-equal:
// an athlete last seen exactly 2:00 ago has just crossed out of the live
// window. `now` is always passed in (never read internally) so this stays
// deterministic and testable — same convention as isReturningAthlete below.
const LIVE_THRESHOLD_MS = 2 * 60 * 1000;

function isLive(lastSeenAt, now) {
  if (!lastSeenAt) return false;
  return now.getTime() - lastSeenAt.getTime() < LIVE_THRESHOLD_MS;
}

// One pass over { lastSeenAt } rows produces the pilot-wide live count.
// Deliberately separate from summarizeActivity() below — presence and
// activity are two different signals and must never be merged into one
// computation, even though both happen to iterate the same row set.
function summarizePresence(rows, now) {
  let liveNow = 0;
  for (const u of rows) {
    if (isLive(u.lastSeenAt, now)) liveNow += 1;
  }
  return { liveNow };
}

const DAY_MS = 24 * 60 * 60 * 1000;
// Same shift-then-slice IST-calendar-day convention already used throughout
// this repo (games.js's istDayStart(), founder.js's todayIST for
// MentalFitnessEntry, chat.js's todayIST) — reused here, never reinvented.
const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;

function istDateString(date) {
  return new Date(date.getTime() + IST_OFFSET_MS).toISOString().slice(0, 10);
}

// An athlete is "returning" only if their latest meaningful activity
// (User.lastActiveAt) happened on an IST calendar day strictly AFTER their
// signup's IST calendar day. Same-day activity does not count. No activity
// at all (lastActiveAt null) does not count. Never a raw lastActiveAt >
// createdAt comparison — that would count later-the-same-day activity as
// returning, which this pilot definition explicitly excludes.
function isReturningAthlete(createdAt, lastActiveAt) {
  if (!lastActiveAt) return false;
  return istDateString(lastActiveAt) > istDateString(createdAt);
}

// One pass over { createdAt, lastActiveAt } rows for every athlete produces
// the three Phase 2B engagement numbers. `now` is always passed in (never
// read internally) so this stays deterministic and testable without the
// real clock.
function summarizeActivity(rows, now) {
  const cutoff24h = now.getTime() - DAY_MS;
  const cutoff7d = now.getTime() - 7 * DAY_MS;
  let activeLast24Hours = 0;
  let activeLast7Days = 0;
  let returningAthletes = 0;

  for (const u of rows) {
    if (u.lastActiveAt) {
      const at = u.lastActiveAt.getTime();
      if (at >= cutoff24h) activeLast24Hours += 1;
      if (at >= cutoff7d) activeLast7Days += 1;
    }
    if (isReturningAthlete(u.createdAt, u.lastActiveAt)) returningAthletes += 1;
  }

  return { activeLast24Hours, activeLast7Days, returningAthletes };
}

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
        activityRows,
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
        // Phase 2B + Pilot Presence Tracking — every athlete's signup,
        // last-activity, AND last-seen timestamps only (no name, no email,
        // no content). One pass over this feeds the three engagement
        // numbers below via summarizeActivity(), and a separate pass feeds
        // the live count via summarizePresence() — same row set, two
        // independent computations, never merged into one.
        client.user.findMany({ select: { createdAt: true, lastActiveAt: true, lastSeenAt: true } }),
      ]);

      const onboardingStarted = new Set(onboardingSessionRows.map((r) => r.userId)).size;
      const coachUsedAthletes = new Set(userMessageRows.map((r) => r.userId)).size;
      const rep = summarizePrescriptions(prescriptionRows);
      const activity = summarizeActivity(activityRows, now);
      const presence = summarizePresence(activityRows, now);

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
        lastActiveAt: u.lastActiveAt,
        isReturning: isReturningAthlete(u.createdAt, u.lastActiveAt),
        lastSeenAt: u.lastSeenAt,
        isLive: isLive(u.lastSeenAt, now),
        // Pilot beta entitlement — raw pilotAccessUntil plus a
        // server-computed `pilotAccessActive` so the dashboard never has to
        // redo the expiry comparison itself (same "effective signal, not
        // raw math" convention as GET /api/chat/usage's hasPilotAccess).
        pilotAccessUntil: u.pilotAccessUntil,
        pilotAccessGrantedAt: u.pilotAccessGrantedAt,
        pilotAccessActive: !!(u.pilotAccessUntil && u.pilotAccessUntil.getTime() > now.getTime()),
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
          activeLast24Hours: activity.activeLast24Hours,
          activeLast7Days: activity.activeLast7Days,
          returningAthletes: activity.returningAthletes,
          returningPercentage: pct(activity.returningAthletes, totalAthletes),
          liveNow: presence.liveNow,
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
// Pure helpers exported for direct, deterministic unit testing (same
// convention as backfill-last-active.js's latestPerUser/mergeLatest) —
// exact boundary/timezone behavior is proven here without needing to
// simulate it through the HTTP+stub-client path.
module.exports.istDateString = istDateString;
module.exports.isReturningAthlete = isReturningAthlete;
module.exports.summarizeActivity = summarizeActivity;
module.exports.isLive = isLive;
module.exports.summarizePresence = summarizePresence;
module.exports.LIVE_THRESHOLD_MS = LIVE_THRESHOLD_MS;
