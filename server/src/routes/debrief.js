const express = require('express');
const Anthropic = require('@anthropic-ai/sdk');
const { PrismaClient } = require('@prisma/client');
const authenticate = require('../middleware/authenticate');

const router = express.Router();
const prisma = new PrismaClient();
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const XP_QUICK = 15;
const XP_FULL  = 20;
const XP_LEGACY = 10;

// ── helpers ──────────────────────────────────────────────────────────────────

function buildInsightPrompt(data, user, prevChanges) {
  const { eventType, resultType, wentWellChips, wentWellText, wouldChange, wouldChangeText, nextFocus, mode } = data;
  const name  = user.name?.split(' ')[0] || 'athlete';
  const sport = user.sport || 'their sport';
  const lang  = user.language === 'hi' ? 'Hindi (Hinglish-friendly)' : 'English';

  const wentWellSummary = [wentWellChips?.join(', '), wentWellText].filter(Boolean).join(' — ');
  const wouldChangeSummary = [wouldChange, wouldChangeText].filter(Boolean).join(' — ');

  const patternBlock = prevChanges?.length >= 3
    ? `\nRecurring theme across last 3 sessions (wouldChange): ${prevChanges.join(' / ')}`
    : '';

  return `You are Arjun, an AI mental performance coach for young Indian athletes.

Athlete: ${name}. Sport: ${sport}. Language: ${lang}.
Event: ${eventType || 'practice'}. Result: ${resultType || 'unknown'}.
What they kept: ${wentWellSummary || 'not specified'}.
What they'd change: ${wouldChangeSummary || 'not specified'}.
Next focus: ${nextFocus || 'not specified'}.${patternBlock}

Return a JSON object with exactly two keys:
{
  "insight": "<2–3 direct sentences, coach tone, use their name, reference their sport and result>",
  "pattern": ${prevChanges?.length >= 3 ? '"<one short sentence calling out the recurring theme, or null>"' : 'null'}
}

Rules:
- insight: Validate their self-awareness, name one specific lesson, end with one concrete action.
- pattern: Only non-null when prevChanges shows a clear recurring theme. Keep it under 15 words.
- Write in ${lang}. Be direct, not generic. No corporate wellness language.
- Return ONLY valid JSON. No markdown, no preamble.`;
}

// ── POST /api/debrief ─────────────────────────────────────────────────────────

router.post('/', authenticate, async (req, res) => {
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
    try {
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

  // Build legacy required fields from structured data
  const wentWellLegacy     = [wentWellChips.join(', '), wentWellText].filter(Boolean).join(' — ');
  const doDifferentlyLegacy = [wouldChange, wouldChangeText].filter(Boolean).join(' — ');
  const nextFocusLegacy     = nextFocus;

  const xpAmount = mode === 'full' ? XP_FULL : XP_QUICK;

  // Fetch user profile for AI context
  const user = await prisma.user.findUnique({
    where: { id: req.userId },
    select: { name: true, sport: true, language: true, oceanN: true, experienceLevel: true },
  });

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
  try {
    const prompt = buildInsightPrompt(
      { eventType, resultType, wentWellChips, wentWellText, wouldChange, wouldChangeText, nextFocus, mode },
      user || {},
      prevChanges,
    );
    const msg = await anthropic.messages.create({
      model: process.env.ANTHROPIC_MODEL || 'claude-haiku-4-5-20251001',
      max_tokens: 300,
      messages: [{ role: 'user', content: prompt }],
    });
    const raw = msg.content[0]?.text?.trim() || '{}';
    const parsed = JSON.parse(raw);
    insight = parsed.insight || null;
    pattern = parsed.pattern || null;
  } catch { /* insight optional */ }

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
      select: { id: true, eventType: true, resultType: true, wentWell: true, nextFocus: true, createdAt: true, mode: true },
    });

    return res.json({ insight, pattern, debrief, xp: updatedUser.xp, xpEarned: xpAmount, recentEntries });
  } catch {
    return res.status(500).json({ error: 'Server error' });
  }
});

// ── GET /api/debrief ─────────────────────────────────────────────────────────

router.get('/', authenticate, async (req, res) => {
  try {
    const debriefs = await prisma.debrief.findMany({
      where: { userId: req.userId },
      orderBy: { createdAt: 'desc' },
      take: 5,
    });
    res.json({ debriefs });
  } catch {
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
