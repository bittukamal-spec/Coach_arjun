const express = require('express');
const Anthropic = require('@anthropic-ai/sdk');
const { PrismaClient } = require('@prisma/client');
const authenticate = require('../middleware/authenticate');
const requireGuardianConsent = require('../middleware/requireGuardianConsent');
const { aiLimiter } = require('../middleware/rateLimits');
const { isTrialActive } = require('./chat');
const { screenSafetyText, recordSafetyEvent, getSafetyGuidance } = require('../services/safety');

const { CYCLE_LENGTH_MS } = require('../utils/cycleBoundary');

const router = express.Router();
const prisma = new PrismaClient();

// ── Per-cycle Weekly Review generation ────────────────────────────────────────
//
// One Weekly Review per COMPLETED seven-day chat cycle (an archived main
// ChatSession — see the rollover in routes/sessions.js). The review reads
// that cycle's own transcript (messages by chatSessionId — archived
// messages are preserved, never deleted, and are exactly what feeds the
// review) and is stored on the existing WeeklyReport model with
// weekStart = the cycle's real start (session.createdAt) and weekEnd = the
// cycle's real end (the archive timestamp), so the visible date range
// always matches the actual completed cycle. The pre-existing
// @@unique([userId, weekStart]) is the duplicate-prevention guarantee:
// the same cycle can never produce two reviews, no matter how many
// tabs/requests race — a concurrent loser's create() throws the unique
// violation and is swallowed by the caller's catch. Historical
// Monday-keyed WeeklyReport rows are left exactly as stored and simply
// render with their stored ranges.
//
// Injectable so tests can stub the database and the Anthropic client —
// same pattern as requireGuardianConsent (PR-2) and recordSafetyEvent
// (PR-5). The default export below always uses the real client and the
// shared safety service.

function createGenerateCycleReview({
  db = prisma,
  createAnthropicClient = () => new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY }),
  screenText = screenSafetyText,
  recordEvent = recordSafetyEvent,
  getGuidance = getSafetyGuidance,
} = {}) {
  return async function generateCycleReview(userId, { sessionId, cycleStart, cycleEnd }) {
    const weekStart = new Date(cycleStart);
    // A legacy archived cycle without a stamped end falls back to the
    // nominal seven-day span — never an invented wider window.
    const weekEnd = cycleEnd ? new Date(cycleEnd) : new Date(weekStart.getTime() + CYCLE_LENGTH_MS);

    // Skip if this cycle's review already exists (retry-safe fast path).
    const existing = await db.weeklyReport.findUnique({
      where: { userId_weekStart: { userId, weekStart } },
    });
    if (existing) return;

    // The completed cycle's own athlete messages.
    const messages = await db.message.findMany({
      where: { userId, role: 'user', chatSessionId: sessionId },
      orderBy: { createdAt: 'asc' },
      select: { content: true, createdAt: true },
    });

    if (messages.length < 3) return; // not enough data for a meaningful review

    // Deterministic pre-LLM safety screen on DERIVED content. This is a
    // short-circuit, not a filter: if ANY stored message in the cycle trips
    // the screen, generation aborts entirely — zero Anthropic calls are made
    // with this cycle's transcript. A minimal client-compatible WeeklyReport
    // row is written instead, carrying fixed safety guidance as its content.
    // That row satisfies the *existing* per-cycle dedup check above
    // (`existing` via the userId_weekStart unique key) on every subsequent
    // attempt, so exactly one SafetyEvent is ever recorded for this
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
          weekStart,
          weekEnd,
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

    // If a concurrent request (rollover trigger vs /weekly-reviews retry)
    // won the race since the dedup check above, this create throws the
    // userId_weekStart unique violation — the caller's catch swallows it
    // and exactly one review remains.
    await db.weeklyReport.create({
      data: {
        userId,
        weekStart,
        weekEnd,
        content: res.content[0].text,
        messageCount: messages.length,
      },
    });
  };
}

const generateCycleReview = createGenerateCycleReview();

// ── Retry-safe sweep: generate any missing review for completed cycles ────────
//
// Called fire-and-forget from the chat-cycle rollover (sessions.js) the
// moment a cycle completes, AND awaited from GET / below — so if the
// first attempt failed or was interrupted (crash, network, model error),
// simply opening Weekly Reviews retries it safely. Per-cycle failures are
// isolated: one bad cycle never blocks the others, the fresh chat cycle,
// or the reports listing. Bounded to the most recent few archived cycles.

function createGenerateMissingCycleReviews({ db = prisma, generate = generateCycleReview } = {}) {
  return async function generateMissingCycleReviews(userId) {
    const cycles = await db.chatSession.findMany({
      where: { userId, mode: 'main', status: 'archived' },
      orderBy: { createdAt: 'desc' },
      take: 4,
      select: { id: true, createdAt: true, endedAt: true },
    });
    for (const c of cycles) {
      await generate(userId, { sessionId: c.id, cycleStart: c.createdAt, cycleEnd: c.endedAt })
        .catch(err => console.error('weekly-review generation error:', err));
    }
  };
}

const generateMissingCycleReviews = createGenerateMissingCycleReviews();

// ── GET / — return last 8 reports, generating any missing cycle review ────────

router.get('/', authenticate, aiLimiter, requireGuardianConsent, async (req, res) => {
  try {
    // Retry-safe: fill in any missing review for completed cycles. Errors
    // are isolated per cycle and never block the response below.
    // Trial gate: skip generation for expired-trial free users; already-generated
    // reports below are still returned.
    if (await isTrialActive(req.userId)) {
      await generateMissingCycleReviews(req.userId).catch(err =>
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
module.exports.createGenerateCycleReview = createGenerateCycleReview;
module.exports.generateCycleReview = generateCycleReview;
module.exports.createGenerateMissingCycleReviews = createGenerateMissingCycleReviews;
module.exports.generateMissingCycleReviews = generateMissingCycleReviews;
