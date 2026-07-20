const express = require('express');
const Anthropic = require('@anthropic-ai/sdk');
const { PrismaClient } = require('@prisma/client');
const authenticate = require('../middleware/authenticate');
const requireGuardianConsent = require('../middleware/requireGuardianConsent');
const { aiLimiter } = require('../middleware/rateLimits');
const { isTrialActive } = require('./chat');
const { screenSafetyText, recordSafetyEvent, getSafetyGuidance } = require('../services/safety');

const { getWeekStart, getWeekEnd } = require('../utils/weekBoundary');

const router = express.Router();
const prisma = new PrismaClient();

// ── Lazy generation: generate last week's report if missing ───────────────────
//
// Injectable so tests can stub the database and the Anthropic client
// instead of touching a real database or calling the real API — same
// pattern as requireGuardianConsent (PR-2) and recordSafetyEvent (PR-5).
// The default export below always uses the real client and the shared
// safety service; the route handler's call site is unchanged.

function createMaybeGenerateLastWeekReport({
  db = prisma,
  createAnthropicClient = () => new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY }),
  screenText = screenSafetyText,
  recordEvent = recordSafetyEvent,
  getGuidance = getSafetyGuidance,
  // Injectable clock so tests can pin the week boundary deterministically —
  // production always uses the real current time.
  now = () => new Date(),
} = {}) {
  return async function maybeGenerateLastWeekReport(userId) {
    const thisWeekStart = getWeekStart(now());

    const lastWeekStart = new Date(thisWeekStart);
    lastWeekStart.setUTCDate(lastWeekStart.getUTCDate() - 7);
    const lastWeekEnd = getWeekEnd(lastWeekStart);

    // Skip if report already exists
    const existing = await db.weeklyReport.findUnique({
      where: { userId_weekStart: { userId, weekStart: lastWeekStart } },
    });
    if (existing) return;

    // Count user messages from last week
    const messages = await db.message.findMany({
      where: {
        userId,
        role: 'user',
        createdAt: { gte: lastWeekStart, lte: lastWeekEnd },
      },
      orderBy: { createdAt: 'asc' },
      select: { content: true, createdAt: true },
    });

    if (messages.length < 3) return; // not enough data for a meaningful report

    // Deterministic pre-LLM safety screen on DERIVED content. This is a
    // short-circuit, not a filter: if ANY stored message in the window trips
    // the screen, generation aborts entirely — zero Anthropic calls are made
    // with this week's transcript. A minimal client-compatible WeeklyReport
    // row is written instead, carrying fixed safety guidance as its content.
    // That row satisfies the *existing* per-week dedup check above
    // (`existing` via the userId_weekStart unique key) on every subsequent
    // page load, so exactly one SafetyEvent is ever recorded for this
    // request — re-running the screen and re-eventing on every load is
    // avoided by the same mechanism that already prevents re-generation.
    const flaggedMessage = messages.find(m => screenText(m.content).flagged);
    if (flaggedMessage) {
      const screen = screenText(flaggedMessage.content);
      const category = screen.category;
      const user = await db.user.findUnique({ where: { id: userId }, select: { language: true } }).catch(() => null);
      const report = await db.weeklyReport.create({
        data: {
          userId,
          weekStart: lastWeekStart,
          weekEnd: lastWeekEnd,
          content: getGuidance(category, user?.language),
          messageCount: messages.length,
        },
      });
      // Fire-and-forget, defensively caught here too: a failing writer —
      // whether it throws synchronously or returns a rejected promise — must
      // never affect the fallback report already written above. Runs after
      // the report create so sourceRecordId can reference the real,
      // already-persisted WeeklyReport row rather than an invented id.
      try {
        Promise.resolve(recordEvent(userId, 'weekly_report', category, {
          riskLevel: screen.riskLevel,
          sourceType: 'weekly_report',
          sourceRecordId: report?.id || null,
        })).catch(() => {});
      } catch { /* writer failure must not surface to the caller */ }
      return; // zero Anthropic calls
    }

    const messageBlock = messages
      .map(m => `[${m.createdAt.toISOString().slice(0, 10)}] ${m.content}`)
      .join('\n');

    const anthropic = createAnthropicClient();
    const res = await anthropic.messages.create({
      model: process.env.ANTHROPIC_MODEL || 'claude-haiku-4-5-20251001',
      max_tokens: 600,
      system: `You are Arjun, an AI mental coach for young Indian athletes. Write a short Weekly Review of the athlete's coaching week based on what they shared with you. Use a direct, encouraging coach voice — not clinical, not corporate. Write 150–220 words. Use these exact section headings in bold: **What you worked on** / **Patterns Arjun noticed** / **What helped** / **Your next focus**. Bold each heading. No bullet points — flowing sentences. Address the athlete as "you". Only describe things the athlete actually said — never invent progress or make unsupported performance claims, and skip generic praise filler. Never include scores, ratings, marks, percentages, levels, diagnoses, or personality labels. If the athlete mentioned anything sensitive or unsafe, do not repeat those details. Start directly with the first section heading, no preamble.`,
      messages: [
        {
          role: 'user',
          content: `Here are my messages from this week:\n\n${messageBlock}\n\nWrite my weekly report.`,
        },
      ],
    });

    await db.weeklyReport.create({
      data: {
        userId,
        weekStart: lastWeekStart,
        weekEnd: lastWeekEnd,
        content: res.content[0].text,
        messageCount: messages.length,
      },
    });
  };
}

const maybeGenerateLastWeekReport = createMaybeGenerateLastWeekReport();

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
module.exports.createMaybeGenerateLastWeekReport = createMaybeGenerateLastWeekReport;
