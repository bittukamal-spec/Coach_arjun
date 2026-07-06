const express = require('express');
const Anthropic = require('@anthropic-ai/sdk');
const { PrismaClient } = require('@prisma/client');
const authenticate = require('../middleware/authenticate');
const requireGuardianConsent = require('../middleware/requireGuardianConsent');
const { aiLimiter } = require('../middleware/rateLimits');
const { isTrialActive } = require('./chat');
const { markSkillProgress } = require('../services/skillProgress');

const router = express.Router();
const prisma = new PrismaClient();
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const XP_QUICK = 15;
const XP_FULL  = 20;
const XP_LEGACY = 10;

// ── helpers ──────────────────────────────────────────────────────────────────

function buildInsightPrompt(data, user, prevChanges, recentCheckIns) {
  const { eventType, resultType, wentWellChips, wentWellText, wouldChange, wouldChangeText, nextFocus } = data;
  const name  = user.name?.split(' ')[0] || 'athlete';
  const sport = user.sport ? user.sport.charAt(0).toUpperCase() + user.sport.slice(1) : 'sport';
  const lang  = user.language === 'hi' ? 'Hindi (Hinglish-friendly, mix Hindi + common English sports terms)' : 'English';

  const wentWellSummary = [wentWellChips?.join(', '), wentWellText].filter(Boolean).join(' — ');
  const wouldChangeSummary = [wouldChange, wouldChangeText].filter(Boolean).join(' — ');

  // Check-in context
  let checkInNote = '';
  if (recentCheckIns?.length > 0) {
    const latest = recentCheckIns[0];
    const daysAgo = Math.floor((Date.now() - new Date(latest.createdAt).getTime()) / 86400000);
    if (daysAgo <= 1) {
      checkInNote = `\nMental state check-in: mood ${latest.mood}/5 | focus ${latest.focus}/5 | confidence ${latest.confidence}/5`;
    }
  }

  const toneNote = '';

  // Cue word
  const cueNote = user.cueWord
    ? `\nCue word: "${user.cueWord}" — reference it naturally as their mental trigger for next time.`
    : '';

  // Recurring pattern
  const patternBlock = prevChanges?.length >= 3
    ? `\nRecurring theme across last 3 sessions (keeps saying needs changing): ${prevChanges.join(' / ')}`
    : '';

  // Experience + level
  const levelNote = user.experienceLevel ? `\nLevel: ${user.experienceLevel}.` : '';

  return `You are Arjun, a mental performance coach for Indian athletes. Write a personalised post-event review.

Athlete: ${name}. Sport: ${sport}.${levelNote} Language: ${lang}.
Event: ${eventType || 'session'}. Result: ${resultType || 'unspecified'}.
What worked: ${wentWellSummary || 'not specified'}.
What to change: ${wouldChangeSummary || 'not specified'}.
Next training focus: ${nextFocus}.${checkInNote}${cueNote}${toneNote}${patternBlock}

Return JSON:
{
  "insight": "<Write 4–5 sentences as Arjun's coaching review. Structure: (1) Acknowledge the result honestly — don't rush past a bad one or oversell a good one. (2) Name one specific thing they did well and explain WHY it matters in ${sport}. (3) Address the change area directly — give a sport-specific observation, not a generic tip. (4) If they have a cue word, weave it in naturally as a reminder for next time. (5) Close by framing their next focus (${nextFocus}) as a concrete training commitment. Use ${name}'s name once. Sound like a coach who watched the match, not an app. No corporate wellness language.>",
  "pattern": ${prevChanges?.length >= 3 ? '"<One sentence naming the recurring theme across sessions, or null if no clear pattern>"' : 'null'}
}

Rules: ${lang} only. Sound like a trusted older brother who knows the sport. Return ONLY valid JSON. No markdown, no preamble.`;
}

// ── POST /api/debrief ─────────────────────────────────────────────────────────

router.post('/', authenticate, aiLimiter, requireGuardianConsent, async (req, res) => {
  const { mode } = req.body;

  // ── Legacy flow (old 3-textarea form) ────────────────────────────────────
  if (!mode) {
    const { wentWell, doDifferently, nextFocus } = req.body;
    if (!wentWell?.trim() || !doDifferently?.trim() || !nextFocus?.trim()) {
      return res.status(400).json({ error: 'All three fields are required' });
    }
    if (wentWell.length > 500 || doDifferently.length > 500 || nextFocus.length > 300) {
      return res.status(400).json({ error: 'Response too long' });
    }

    let arjunInsight = null;
    // Trial gate: skip AI insight for expired-trial free users; debrief still saves.
    if (await isTrialActive(req.userId)) try {
      const msg = await anthropic.messages.create({
        model: process.env.ANTHROPIC_MODEL || 'claude-haiku-4-5-20251001',
        max_tokens: 200,
        messages: [{
          role: 'user',
          content: `You are Arjun, an AI mental performance coach for Indian athletes. Generate a 2-3 sentence coaching insight based on this post-match debrief:\n\nWhat went well: "${wentWell.trim()}"\nWhat they'd do differently: "${doDifferently.trim()}"\nFocus for next time: "${nextFocus.trim()}"\n\nWrite directly to the athlete (use "you"). Validate their self-awareness, pull out one specific pattern or lesson, and end with ONE concrete action. Under 3 sentences. Be direct, not generic.`,
        }],
      });
      arjunInsight = msg.content[0]?.text?.trim() || null;
    } catch { /* insight optional */ }

    try {
      const [debrief] = await prisma.$transaction([
        prisma.debrief.create({
          data: { userId: req.userId, wentWell: wentWell.trim(), doDifferently: doDifferently.trim(), nextFocus: nextFocus.trim(), arjunInsight, xpAwarded: XP_LEGACY },
        }),
        prisma.user.update({ where: { id: req.userId }, data: { xp: { increment: XP_LEGACY } } }),
      ]);
      const user = await prisma.user.findUnique({ where: { id: req.userId }, select: { xp: true } });
      return res.json({ debrief, xp: user.xp, xpEarned: XP_LEGACY });
    } catch {
      return res.status(500).json({ error: 'Server error' });
    }
  }

  // ── New structured flow ───────────────────────────────────────────────────
  const { eventType, resultType, wentWellChips, wentWellText, wouldChange, wouldChangeText, nextFocus, cueWordFeedback } = req.body;

  if (!eventType || !resultType || !wentWellChips?.length || !wouldChange || !nextFocus) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  // Once-per-day guard — only one structured review allowed per UTC day
  const todayStart = new Date();
  todayStart.setUTCHours(0, 0, 0, 0);
  const existingToday = await prisma.debrief.findFirst({
    where: { userId: req.userId, createdAt: { gte: todayStart } },
  });
  if (existingToday) {
    return res.status(409).json({ error: 'Already done today', alreadyDone: true });
  }

  // Build legacy required fields from structured data
  const wentWellLegacy     = [wentWellChips.join(', '), wentWellText].filter(Boolean).join(' — ');
  const doDifferentlyLegacy = [wouldChange, wouldChangeText].filter(Boolean).join(' — ');
  const nextFocusLegacy     = nextFocus;

  const xpAmount = mode === 'full' ? XP_FULL : XP_QUICK;

  // Fetch user profile for AI context
  const [user, recentCheckIns] = await Promise.all([
    prisma.user.findUnique({
      where: { id: req.userId },
      select: {
        name: true, sport: true, language: true, experienceLevel: true,
        cueWord: true,
      },
    }),
    prisma.checkIn.findMany({
      where: { userId: req.userId },
      orderBy: { createdAt: 'desc' },
      take: 1,
      select: { mood: true, focus: true, confidence: true, createdAt: true },
    }),
  ]);

  // Query last 3 debriefs for pattern detection
  const prevDebriefs = await prisma.debrief.findMany({
    where: { userId: req.userId },
    orderBy: { createdAt: 'desc' },
    take: 3,
    select: { wouldChange: true, doDifferently: true },
  });
  const prevChanges = prevDebriefs
    .map(d => d.wouldChange || d.doDifferently)
    .filter(Boolean);

  // AI insight
  let insight = null;
  let pattern = null;
  // Trial gate: skip AI insight for expired-trial free users; debrief still saves.
  if (await isTrialActive(req.userId)) try {
    const prompt = buildInsightPrompt(
      { eventType, resultType, wentWellChips, wentWellText, wouldChange, wouldChangeText, nextFocus, mode },
      user || {},
      prevChanges,
      recentCheckIns,
    );
    const msg = await anthropic.messages.create({
      model: process.env.ANTHROPIC_MODEL || 'claude-haiku-4-5-20251001',
      max_tokens: 600,
      messages: [{ role: 'user', content: prompt }],
    });
    const raw = msg.content[0]?.text?.trim() || '{}';
    // Strip markdown code fences Claude sometimes wraps around JSON
    const cleaned = raw.replace(/^```(?:json)?\s*\n?|\n?```\s*$/gm, '').trim();
    const parsed = JSON.parse(cleaned);
    insight = typeof parsed.insight === 'string' ? parsed.insight.trim() : null;
    pattern = typeof parsed.pattern === 'string' ? parsed.pattern.trim() : null;
  } catch (e) {
    console.error('[debrief] AI parse error:', e?.message);
    /* insight optional — continue without it */
  }

  try {
    const [debrief] = await prisma.$transaction([
      prisma.debrief.create({
        data: {
          userId:         req.userId,
          wentWell:       wentWellLegacy,
          doDifferently:  doDifferentlyLegacy,
          nextFocus:      nextFocusLegacy,
          arjunInsight:   insight,
          mode,
          eventType,
          resultType,
          wentWellChips:  JSON.stringify(wentWellChips),
          wentWellText:   wentWellText || null,
          wouldChange,
          wouldChangeText: wouldChangeText || null,
          cueWordFeedback: cueWordFeedback || null,
          sport:          user?.sport || null,
          xpAwarded:      xpAmount,
        },
      }),
      prisma.user.update({ where: { id: req.userId }, data: { xp: { increment: xpAmount } } }),
    ]);

    const updatedUser = await prisma.user.findUnique({
      where: { id: req.userId },
      select: { xp: true },
    });

    // Return recent entries for history preview (last 3 excluding just-saved)
    const recentEntries = await prisma.debrief.findMany({
      where: { userId: req.userId, id: { not: debrief.id } },
      orderBy: { createdAt: 'desc' },
      take: 3,
      select: { id: true, eventType: true, resultType: true, wentWell: true, nextFocus: true, arjunInsight: true, createdAt: true, mode: true },
    });

    // Save ToolReport (fire-and-forget)
    prisma.toolReport.create({
      data: {
        userId:        req.userId,
        toolType:      'debrief',
        skillKey:      'reflection',
        summary:       `Match review: ${eventType}, result: ${resultType}. Went well: ${wentWellChips.join(', ')}. Would change: ${wouldChange}.`,
        arjunResponse: insight ? insight.slice(0, 500) : null,
        details:       JSON.stringify({ eventType, resultType, wentWellChips, wouldChange, nextFocus, mode }),
      },
    }).catch(() => {});
    markSkillProgress(req.userId, 'reflection', 'toolCompletedAt').catch(() => {});

    return res.json({ insight, pattern, debrief, xp: updatedUser.xp, xpEarned: xpAmount, recentEntries });
  } catch {
    return res.status(500).json({ error: 'Server error' });
  }
});

// ── GET /api/debrief ─────────────────────────────────────────────────────────

router.get('/', authenticate, async (req, res) => {
  try {
    const todayStart = new Date();
    todayStart.setUTCHours(0, 0, 0, 0);
    const [debriefs, todayDebrief] = await Promise.all([
      prisma.debrief.findMany({
        where: { userId: req.userId },
        orderBy: { createdAt: 'desc' },
        take: 5,
      }),
      prisma.debrief.findFirst({
        where: { userId: req.userId, createdAt: { gte: todayStart } },
        orderBy: { createdAt: 'desc' },
        select: { id: true, eventType: true, resultType: true, arjunInsight: true, nextFocus: true, createdAt: true, mode: true },
      }),
    ]);
    res.json({ debriefs, todayDebrief: todayDebrief || null });
  } catch {
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
