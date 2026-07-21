const express = require('express');
const Anthropic = require('@anthropic-ai/sdk');
const { PrismaClient } = require('@prisma/client');
const authenticate = require('../middleware/authenticate');
const requireGuardianConsent = require('../middleware/requireGuardianConsent');
const { isTrialActive } = require('./chat');
const { screenSafetyText, recordSafetyEvent } = require('../services/safety');
const { cycleRolloverBoundary } = require('../utils/cycleBoundary');
const { generateMissingCycleReviews } = require('./weeklyReports');

const router = express.Router();
const prisma = new PrismaClient();

// ── Seven-day chat-cycle rollover ──────────────────────────────────────────
//
// A "chat cycle" is one main ChatSession, and it lasts exactly SEVEN DAYS
// from that session's own createdAt — never a calendar boundary. A session
// created on a Sunday does not reset on Monday; it stays the active cycle
// until the following Sunday (see utils/cycleBoundary.js, the one shared
// deterministic definition). At or after createdAt + 7 days the session is
// eligible for one rollover: status flips to 'archived' and endedAt is
// stamped with the rollover moment — which becomes the cycle's recorded
// end, so the Weekly Review generated for it carries the cycle's ACTUAL
// date range (createdAt → endedAt). Messages are never deleted or
// modified: the whole transcript stays in place under the archived
// session, it just stops being the session Chat reopens. GET / below then
// excludes archived sessions, so the client's existing entry flow
// naturally offers a fresh active cycle.
//
// This touches ONLY ChatSession.status/endedAt. It never touches Message
// rows, CoachingCycle, Prescription, UserCoachingState, follow-up opener
// claims, Mind Journal, Playbook data, SafetyEvent, or guardian-consent
// state — chat-cycle reset and coaching-cycle state are different things.
//
// Idempotency: the archive is a conditional updateMany over the candidate
// ids with `status: { not: 'archived' }` re-checked in the WHERE — a
// concurrent second call (another tab, a retry) matches zero rows, gets
// count 0, and returns no completed cycles, so only the winning call ever
// triggers review generation. The injectable factory mirrors
// createGenerateCycleReview so tests can pin the clock and stub the
// database. Returns the completed cycles ({ sessionId, cycleStart,
// cycleEnd }) this call archived — empty when there was nothing to do.

function createArchiveCompletedCycles({ db = prisma, now = () => new Date() } = {}) {
  return async function archiveCompletedCycles(userId) {
    const nowDate = now();
    const boundary = cycleRolloverBoundary(nowDate);
    const completed = await db.chatSession.findMany({
      where: {
        userId,
        mode: 'main',
        status: { not: 'archived' },
        createdAt: { lte: boundary },
      },
      select: { id: true, createdAt: true },
    });
    if (completed.length === 0) return [];

    const claim = await db.chatSession.updateMany({
      where: { id: { in: completed.map(s => s.id) }, status: { not: 'archived' } },
      data: { status: 'archived', endedAt: nowDate },
    });
    if (claim.count === 0) return []; // a concurrent call archived first

    return completed.map(s => ({ sessionId: s.id, cycleStart: s.createdAt, cycleEnd: nowDate }));
  };
}

const archiveCompletedCycles = createArchiveCompletedCycles();

// ── Session type display labels for title generation ──────────────────────

const SESSION_TYPE_LABELS = {
  general:        'General',
  match_prep:     'Pre-match',
  post_match:     'Post-match',
  build_focus:    'Focus',
  confidence:     'Confidence',
  handle_pressure:'Handle pressure',
  open:           'Open chat',
  post_checkin:   'Post check-in',
};

function generateTitle(sessionType) {
  const now = new Date();
  const day = now.getUTCDate();
  const month = now.toLocaleString('en', { month: 'short', timeZone: 'UTC' });
  const label = SESSION_TYPE_LABELS[sessionType] || 'Session';
  return `${label} · ${day} ${month}`;
}

// ── Summary generation helper ──────────────────────────────────────────────

async function generateSessionSummary(sessionId, userId) {
  const msgs = await prisma.message.findMany({
    where: { chatSessionId: sessionId },
    orderBy: { createdAt: 'asc' },
    select: { role: true, content: true },
  });
  if (msgs.length < 3) return null;

  // Deterministic pre-LLM safety screen on the athlete's side of the
  // DERIVED transcript. On a hit: the transcript is never sent to
  // Anthropic; the session gets the same neutral date summary as the
  // existing AI-failure fallback; one structured SafetyEvent (no content)
  // is recorded — summaries run once per session, so this cannot spam.
  const athleteText = msgs.filter(m => m.role !== 'assistant').map(m => m.content).join('\n');
  const summaryScreen = screenSafetyText(athleteText);
  if (summaryScreen.flagged) {
    // sessionId is the real, already-persisted ChatSession id being
    // summarized — a genuine identifier, not an invented one.
    if (userId) {
      recordSafetyEvent(userId, 'session_summary', summaryScreen.category, {
        riskLevel: summaryScreen.riskLevel,
        sourceType: 'session_summary',
        sourceRecordId: sessionId,
        chatSessionId: sessionId,
      });
    }
    const s = await prisma.chatSession.findUnique({
      where: { id: sessionId },
      select: { createdAt: true },
    });
    const dateStr = s?.createdAt
      ? new Date(s.createdAt).toLocaleDateString('en-IN')
      : 'this date';
    return `Session on ${dateStr}.`;
  }

  const transcript = msgs.map(m =>
    `[${m.role === 'assistant' ? 'Arjun' : 'Athlete'}]: ${m.content}`
  ).join('\n');

  try {
    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    const r = await anthropic.messages.create({
      model: process.env.ANTHROPIC_MODEL || 'claude-haiku-4-5-20251001',
      max_tokens: 150,
      system: 'You are Arjun, a mental performance coach. Summarise this coaching session in 2-3 sentences. Write in second person ("You talked about...", "You worked on..."). Be specific about what was discussed and any insight or action that came up. Do not use bullet points. Keep it warm and concrete. Output only the summary text.',
      messages: [{ role: 'user', content: transcript }],
    });
    return r.content[0].text;
  } catch {
    const s = await prisma.chatSession.findUnique({
      where: { id: sessionId },
      select: { createdAt: true },
    });
    const dateStr = s?.createdAt
      ? new Date(s.createdAt).toLocaleDateString('en-IN')
      : 'this date';
    return `Session on ${dateStr}.`;
  }
}

// ── GET / — list sessions ────────────────────────────────────────────────

router.get('/', authenticate, async (req, res) => {
  try {
    // Seven-day rollover first, so the listing below already reflects it.
    // A rollover failure must never block the athlete from chatting.
    let completedCycles = [];
    try {
      completedCycles = await archiveCompletedCycles(req.userId);
    } catch (err) {
      console.error('cycle rollover error:', err);
    }

    // The moment a cycle completes, trigger its Weekly Review — strictly
    // fire-and-forget so chat entry is NEVER blocked on model latency.
    // Reuses the one idempotent generator (unique userId+weekStart), so a
    // failure or crash here is harmless: opening /weekly-reviews runs the
    // same sweep again and retries safely, and a race between the two can
    // only ever leave one review. Same trial gate as the other lazy AI
    // work in this file; consent-blocked minors cannot have chat messages
    // (every message-writing route is consent-gated), so the generator's
    // ≥3-message threshold makes this a no-op for them — and the
    // consent-gated /weekly-reviews route stays the only reading surface.
    if (completedCycles.length > 0) {
      isTrialActive(req.userId)
        .then(active => (active ? generateMissingCycleReviews(req.userId) : null))
        .catch(err => console.error('cycle review generation error:', err));
    }

    // Archived cycles are deliberately excluded: their messages are
    // preserved (and feed weekly-review generation), but Chat only ever
    // reopens the current active cycle.
    const sessions = await prisma.chatSession.findMany({
      where: { userId: req.userId, mode: 'main', status: { not: 'archived' } },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        sessionType: true,
        title: true,
        summary: true,
        status: true,
        createdAt: true,
        endedAt: true,
        _count: { select: { messages: true } },
      },
    });
    res.json({ sessions });
  } catch (err) {
    console.error('sessions list error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ── POST / — create session ───────────────────────────────────────────────

router.post('/', authenticate, async (req, res) => {
  const { sessionType = 'general', mode = 'main' } = req.body;
  try {
    // Opportunistic cleanup: delete user's old quick sessions before creating a new one
    if (mode === 'quick') {
      const oldQuick = await prisma.chatSession.findMany({
        where: { userId: req.userId, mode: 'quick' },
        select: { id: true },
      });
      for (const s of oldQuick) {
        await prisma.message.deleteMany({ where: { chatSessionId: s.id } });
        await prisma.chatSession.delete({ where: { id: s.id } });
      }
    }

    const session = await prisma.chatSession.create({
      data: {
        userId: req.userId,
        sessionType,
        mode,
        title: mode === 'quick' ? 'Quick chat' : generateTitle(sessionType),
        status: 'active',
      },
    });
    res.json({ session });
  } catch (err) {
    console.error('session create error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ── POST /end-stale — auto-end sessions from previous days ───────────────
// Must be registered BEFORE /:id routes to avoid "end-stale" being treated as an id

router.post('/end-stale', authenticate, requireGuardianConsent, async (req, res) => {
  try {
    const todayStart = new Date();
    todayStart.setUTCHours(0, 0, 0, 0);

    const staleSessions = await prisma.chatSession.findMany({
      where: {
        userId: req.userId,
        status: 'active',
        createdAt: { lt: todayStart },
      },
      select: { id: true },
    });

    if (staleSessions.length === 0) return res.json({ count: 0 });

    const ids = staleSessions.map(s => s.id);
    await prisma.chatSession.updateMany({
      where: { id: { in: ids } },
      data: { status: 'ended', endedAt: new Date() },
    });

    // Generate summaries asynchronously — do not block response.
    // Trial gate: skip the AI summaries for expired-trial free users; sessions still end.
    if (await isTrialActive(req.userId)) {
      Promise.all(ids.map(async id => {
        const summary = await generateSessionSummary(id, req.userId);
        if (summary) {
          await prisma.chatSession.update({ where: { id }, data: { summary } });
        }
      })).catch(err => console.error('stale summary error:', err));
    }

    res.json({ count: staleSessions.length });
  } catch (err) {
    console.error('end-stale error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ── GET /:id/messages — messages for a session ────────────────────────────

router.get('/:id/messages', authenticate, async (req, res) => {
  try {
    const session = await prisma.chatSession.findUnique({
      where: { id: req.params.id },
      select: { userId: true },
    });
    if (!session || session.userId !== req.userId) {
      return res.status(404).json({ error: 'Session not found' });
    }
    const msgWhere = { chatSessionId: req.params.id };
    if (req.query.since) {
      const sinceDate = new Date(req.query.since);
      if (!isNaN(sinceDate.getTime())) {
        msgWhere.createdAt = { gte: sinceDate };
      }
    }
    const messages = await prisma.message.findMany({
      where: msgWhere,
      orderBy: { createdAt: 'asc' },
      select: { id: true, role: true, content: true, sessionType: true, createdAt: true },
    });
    res.json({ messages });
  } catch (err) {
    console.error('session messages error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ── POST /:id/end — end a session and generate summary ────────────────────

router.post('/:id/end', authenticate, requireGuardianConsent, async (req, res) => {
  try {
    const session = await prisma.chatSession.findUnique({
      where: { id: req.params.id },
      select: { userId: true, status: true },
    });
    if (!session || session.userId !== req.userId) {
      return res.status(404).json({ error: 'Session not found' });
    }

    const updated = await prisma.chatSession.update({
      where: { id: req.params.id },
      data: { status: 'ended', endedAt: new Date() },
    });

    // Generate summary synchronously so it's ready when user lands on sessions page
    let summary = null;
    // Trial gate: skip the AI summary for expired-trial free users; the session still ends.
    if (await isTrialActive(req.userId)) try {
      summary = await generateSessionSummary(req.params.id, req.userId);
      if (summary) {
        await prisma.chatSession.update({ where: { id: req.params.id }, data: { summary } });
      }
    } catch (err) {
      console.error('summary error:', err);
    }

    res.json({ session: { ...updated, summary } });
  } catch (err) {
    console.error('session end error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ── PATCH /:id — update session (e.g. re-activate for continue) ───────────

router.patch('/:id', authenticate, async (req, res) => {
  const { status } = req.body;
  try {
    const session = await prisma.chatSession.findUnique({
      where: { id: req.params.id },
      select: { userId: true },
    });
    if (!session || session.userId !== req.userId) {
      return res.status(404).json({ error: 'Session not found' });
    }
    const updated = await prisma.chatSession.update({
      where: { id: req.params.id },
      data: { status, ...(status === 'active' ? { endedAt: null } : {}) },
    });
    res.json({ session: updated });
  } catch (err) {
    console.error('session patch error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ── DELETE /:id — delete session and its messages ─────────────────────────

router.delete('/:id', authenticate, async (req, res) => {
  try {
    const session = await prisma.chatSession.findUnique({
      where: { id: req.params.id },
      select: { userId: true },
    });
    if (!session || session.userId !== req.userId) {
      return res.status(404).json({ error: 'Session not found' });
    }
    // Message→ChatSession has no onDelete:Cascade — delete messages explicitly
    await prisma.message.deleteMany({ where: { chatSessionId: req.params.id } });
    await prisma.chatSession.delete({ where: { id: req.params.id } });
    res.json({ ok: true });
  } catch (err) {
    console.error('session delete error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
module.exports.createArchiveCompletedCycles = createArchiveCompletedCycles;
