const express = require('express');
const Anthropic = require('@anthropic-ai/sdk');
const { PrismaClient } = require('@prisma/client');
const authenticate = require('../middleware/authenticate');

const router = express.Router();
const prisma = new PrismaClient();

// ── Session type display labels for title generation ──────────────────────

const SESSION_TYPE_LABELS = {
  general:        'General',
  match_prep:     'Pre-match',
  post_match:     'Post-match',
  build_focus:    'Focus',
  confidence:     'Confidence',
  handle_pressure:'Handle pressure',
  pressure_reset: 'Pressure reset',
  setback_reset:  'Bounce back',
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

async function generateSessionSummary(sessionId) {
  const msgs = await prisma.message.findMany({
    where: { chatSessionId: sessionId },
    orderBy: { createdAt: 'asc' },
    select: { role: true, content: true },
  });
  if (msgs.length < 3) return null;

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
    const sessions = await prisma.chatSession.findMany({
      where: { userId: req.userId, mode: 'main' },
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

router.post('/end-stale', authenticate, async (req, res) => {
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

    // Generate summaries asynchronously — do not block response
    Promise.all(ids.map(async id => {
      const summary = await generateSessionSummary(id);
      if (summary) {
        await prisma.chatSession.update({ where: { id }, data: { summary } });
      }
    })).catch(err => console.error('stale summary error:', err));

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

router.post('/:id/end', authenticate, async (req, res) => {
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
    try {
      summary = await generateSessionSummary(req.params.id);
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
