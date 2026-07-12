const express = require('express');
const Anthropic = require('@anthropic-ai/sdk');
const { PrismaClient } = require('@prisma/client');
const authenticate = require('../middleware/authenticate');
const requireGuardianConsent = require('../middleware/requireGuardianConsent');
const { aiLimiter } = require('../middleware/rateLimits');
const { isTrialActive } = require('./chat');

const router = express.Router();
const prisma = new PrismaClient();

// ── Date helpers ──────────────────────────────────────────────────────────────

function getWeekStart(date) {
  const d = new Date(date);
  const day = d.getUTCDay(); // 0=Sun … 6=Sat
  const diff = day === 0 ? -6 : 1 - day; // offset back to Monday
  d.setUTCDate(d.getUTCDate() + diff);
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

function getWeekEnd(weekStart) {
  const d = new Date(weekStart);
  d.setUTCDate(d.getUTCDate() + 6);
  d.setUTCHours(23, 59, 59, 999);
  return d;
}

// ── Lazy generation: generate last week's report if missing ───────────────────

async function maybeGenerateLastWeekReport(userId) {
  const now = new Date();
  const thisWeekStart = getWeekStart(now);

  const lastWeekStart = new Date(thisWeekStart);
  lastWeekStart.setUTCDate(lastWeekStart.getUTCDate() - 7);
  const lastWeekEnd = getWeekEnd(lastWeekStart);

  // Skip if report already exists
  const existing = await prisma.weeklyReport.findUnique({
    where: { userId_weekStart: { userId, weekStart: lastWeekStart } },
  });
  if (existing) return;

  // Count user messages from last week
  const messages = await prisma.message.findMany({
    where: {
      userId,
      role: 'user',
      createdAt: { gte: lastWeekStart, lte: lastWeekEnd },
    },
    orderBy: { createdAt: 'asc' },
    select: { content: true, createdAt: true },
  });

  if (messages.length < 3) return; // not enough data for a meaningful report

  const messageBlock = messages
    .map(m => `[${m.createdAt.toISOString().slice(0, 10)}] ${m.content}`)
    .join('\n');

  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const res = await anthropic.messages.create({
    model: process.env.ANTHROPIC_MODEL || 'claude-haiku-4-5-20251001',
    max_tokens: 600,
    system: `You are Arjun, an AI mental coach for young Indian athletes. Write a weekly coaching report based on what the athlete shared with you this week. Use a direct, encouraging coach voice — not clinical, not corporate. Write 180–250 words. Use these exact section headings in bold: **How your week looked** / **What I noticed** / **Your mental highlight** / **One thing to work on** / **Going into next week**. Bold each heading. No bullet points — flowing sentences. Address the athlete as "you". Start directly with the first section heading, no preamble.`,
    messages: [
      {
        role: 'user',
        content: `Here are my messages from this week:\n\n${messageBlock}\n\nWrite my weekly report.`,
      },
    ],
  });

  await prisma.weeklyReport.create({
    data: {
      userId,
      weekStart: lastWeekStart,
      weekEnd: lastWeekEnd,
      content: res.content[0].text,
      messageCount: messages.length,
    },
  });
}

// ── GET / — return last 8 reports, lazily generating last week's if missing ───

router.get('/', authenticate, aiLimiter, requireGuardianConsent, async (req, res) => {
  try {
    // Fire-and-forget: try to generate last week's report if not yet created.
    // Errors are suppressed so they never block the response.
    // Trial gate: skip generation for expired-trial free users; already-generated
    // reports below are still returned.
    if (await isTrialActive(req.userId)) {
      await maybeGenerateLastWeekReport(req.userId).catch(err =>
        console.error('weekly-report generation error:', err)
      );
    }

    const reports = await prisma.weeklyReport.findMany({
      where: { userId: req.userId },
      orderBy: { weekStart: 'desc' },
      take: 8,
      select: { id: true, weekStart: true, weekEnd: true, content: true, createdAt: true },
    });

    res.json(reports);
  } catch (err) {
    console.error('weekly-reports error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
