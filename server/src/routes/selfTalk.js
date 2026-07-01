const express = require('express');
const Anthropic = require('@anthropic-ai/sdk');
const { PrismaClient } = require('@prisma/client');
const authenticate = require('../middleware/authenticate');

const router = express.Router();
const prisma = new PrismaClient();

const MAX_ACTIVE_CARDS = 5;

const SYSTEM_PROMPT = `You are Arjun, an AI mental performance coach for young Indian athletes (14–25). Your job is to help the athlete transform an unhelpful thought into a powerful Focus Card they can use during competition.

Analyse the athlete's situation, thought, and context, then return a JSON object with EXACTLY these fields:

{
  "safety_flag": "safe" | "needs_support",
  "focus_word": "One strong word (e.g. Lock, Rise, Trust, Flow)",
  "reset_word": "One calming word for tough moments (e.g. Breathe, Reset, Now, Easy)",
  "power_line": "A short first-person mantra (6–12 words max, athlete's voice)",
  "performance_reminder": "One practical thing they already know how to do (20 words max)",
  "arjun_note": "1-3 short sentences — a coaching observation specific to this athlete's situation and old thought. Not generic. Reference their sport and moment if provided. Sound like a real coach, not an app.",
  "tags": ["tag1", "tag2"]
}

Rules:
- safety_flag = "needs_support" ONLY if the thought suggests self-harm, harm to others, or deep psychological distress beyond sport performance. Normal nervousness, fear of failure, performance anxiety = "safe".
- focus_word and reset_word: single words, capitalised, in English (athletes use English sport terms even in Hindi).
- power_line: first-person, present tense, athlete's natural voice. Not corporate. E.g. "I trust my hands when it counts" not "I am a high-performance athlete."
- performance_reminder: something concrete and physical. E.g. "Keep head still, watch the ball all the way."
- arjun_note: warm and direct, like a coach who knows the player. Reference the specific sport/moment if given.
- tags: 2–4 relevant tags from: ["pressure", "confidence", "focus", "mistakes", "nerves", "selection", "technique", "fitness", "pre-competition", "in-play"]

Return ONLY the JSON object. No markdown, no explanation, no wrapping.`;

// ── POST /api/self-talk/generate ─────────────────────────────────────────────

router.post('/generate', authenticate, async (req, res) => {
  const {
    sport, roleOrPosition, performanceMoment, skillContext,
    situationCategory, situationText,
    oldThought, thoughtIntensityBefore, confidenceBefore,
  } = req.body;

  if (!situationCategory || !oldThought) {
    return res.status(400).json({ error: 'situationCategory and oldThought are required' });
  }

  const contextLines = [
    sport ? `Sport: ${sport}` : null,
    roleOrPosition ? `Role/position: ${roleOrPosition}` : null,
    performanceMoment ? `Performance moment: ${performanceMoment}` : null,
    skillContext ? `Skill context: ${skillContext}` : null,
    `Situation: ${situationCategory}${situationText ? ` — ${situationText}` : ''}`,
    `Unhelpful thought: "${oldThought}"`,
    thoughtIntensityBefore != null ? `Thought intensity (1–10): ${thoughtIntensityBefore}` : null,
    confidenceBefore != null ? `Current confidence (1–10): ${confidenceBefore}` : null,
  ].filter(Boolean).join('\n');

  try {
    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    const message = await anthropic.messages.create({
      model: process.env.ANTHROPIC_MODEL || 'claude-haiku-4-5-20251001',
      max_tokens: 700,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: `Here is my context:\n\n${contextLines}\n\nBuild my Focus Card.` }],
    });

    let rawText = message.content[0].text.trim();
    // Strip markdown code fences Claude occasionally wraps around JSON
    if (rawText.startsWith('```')) {
      rawText = rawText.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '').trim();
    }
    let parsed;
    try {
      parsed = JSON.parse(rawText);
    } catch {
      console.error('self-talk JSON parse error:', rawText);
      return res.status(500).json({ error: 'parse_error' });
    }

    if (parsed.safety_flag === 'needs_support') {
      return res.json({ safetyFlag: 'needs_support' });
    }

    return res.json({
      safetyFlag: 'safe',
      focusWord: parsed.focus_word,
      resetWord: parsed.reset_word,
      powerLine: parsed.power_line,
      performanceReminder: parsed.performance_reminder,
      arjunNote: parsed.arjun_note,
      tags: parsed.tags || [],
      aiModel: message.model,
    });
  } catch (err) {
    console.error('self-talk generate error:', err);
    return res.status(500).json({ error: 'server_error' });
  }
});

// ── POST /api/self-talk/save ──────────────────────────────────────────────────

router.post('/save', authenticate, async (req, res) => {
  const userId = req.userId;

  const activeCount = await prisma.selfTalkCard.count({
    where: { userId, isActive: true, isArchived: false },
  });
  if (activeCount >= MAX_ACTIVE_CARDS) {
    return res.status(400).json({ error: 'max_cards_reached' });
  }

  const {
    sport, roleOrPosition, performanceMoment, skillContext,
    situationCategory, situationText,
    oldThought, thoughtIntensityBefore, confidenceBefore,
    focusWord, resetWord, powerLine, performanceReminder, arjunNote,
    safetyFlag, aiModel, tags,
  } = req.body;

  if (!situationCategory || !oldThought || !focusWord || !resetWord || !powerLine || !performanceReminder || !arjunNote) {
    return res.status(400).json({ error: 'missing_required_fields' });
  }

  try {
    const card = await prisma.selfTalkCard.create({
      data: {
        userId,
        sport: sport || null,
        roleOrPosition: roleOrPosition || null,
        performanceMoment: performanceMoment || null,
        skillContext: skillContext || null,
        situationCategory,
        situationText: situationText || null,
        oldThought,
        thoughtIntensityBefore: thoughtIntensityBefore ?? null,
        confidenceBefore: confidenceBefore ?? null,
        focusWord,
        resetWord,
        powerLine,
        performanceReminder,
        arjunNote,
        safetyFlag: safetyFlag || 'safe',
        aiModel: aiModel || null,
        tags: tags || [],
      },
    });

    await prisma.toolReport.create({
      data: {
        userId,
        toolType: 'self_talk_builder',
        summary: `${situationCategory} — ${focusWord}`,
        arjunResponse: arjunNote,
        details: JSON.stringify({
          focusWord,
          resetWord,
          powerLine,
          situationCategory,
          sport: sport || null,
          performanceMoment: performanceMoment || null,
          oldThought,
        }),
      },
    });

    return res.json({ success: true, card });
  } catch (err) {
    console.error('self-talk save error:', err);
    return res.status(500).json({ error: 'server_error' });
  }
});

// ── GET /api/self-talk/cards ──────────────────────────────────────────────────

router.get('/cards', authenticate, async (req, res) => {
  const userId = req.userId;
  const { filter = 'active' } = req.query;

  let where = { userId };
  if (filter === 'active') {
    where.isArchived = false;
  } else if (filter === 'archived') {
    where.isArchived = true;
  }
  // filter === 'all' → no extra conditions

  try {
    const cards = await prisma.selfTalkCard.findMany({
      where,
      orderBy: [{ isMatchDayCard: 'desc' }, { createdAt: 'desc' }],
    });
    return res.json(cards);
  } catch (err) {
    console.error('self-talk cards error:', err);
    return res.status(500).json({ error: 'server_error' });
  }
});

// ── PATCH /api/self-talk/cards/:id ───────────────────────────────────────────

router.patch('/cards/:id', authenticate, async (req, res) => {
  const userId = req.userId;
  const { id } = req.params;

  const existing = await prisma.selfTalkCard.findUnique({ where: { id } });
  if (!existing || existing.userId !== userId) {
    return res.status(404).json({ error: 'not_found' });
  }

  const allowed = ['isMatchDayCard', 'isArchived', 'isActive', 'confidenceAfter'];
  const data = {};
  for (const key of allowed) {
    if (req.body[key] !== undefined) data[key] = req.body[key];
  }

  try {
    if (data.isMatchDayCard === true) {
      await prisma.selfTalkCard.updateMany({
        where: { userId, isMatchDayCard: true },
        data: { isMatchDayCard: false },
      });
    }

    const updated = await prisma.selfTalkCard.update({ where: { id }, data });
    return res.json({ success: true, card: updated });
  } catch (err) {
    console.error('self-talk patch error:', err);
    return res.status(500).json({ error: 'server_error' });
  }
});

// ── DELETE /api/self-talk/cards/:id ──────────────────────────────────────────

router.delete('/cards/:id', authenticate, async (req, res) => {
  const userId = req.userId;
  const { id } = req.params;

  const existing = await prisma.selfTalkCard.findUnique({ where: { id } });
  if (!existing || existing.userId !== userId) {
    return res.status(404).json({ error: 'not_found' });
  }

  try {
    await prisma.selfTalkCard.delete({ where: { id } });
    return res.json({ success: true });
  } catch (err) {
    console.error('self-talk delete error:', err);
    return res.status(500).json({ error: 'server_error' });
  }
});

// ── POST /api/self-talk/cards/:id/practice ───────────────────────────────────

router.post('/cards/:id/practice', authenticate, async (req, res) => {
  const userId = req.userId;
  const { id } = req.params;

  const existing = await prisma.selfTalkCard.findUnique({ where: { id } });
  if (!existing || existing.userId !== userId) {
    return res.status(404).json({ error: 'not_found' });
  }

  try {
    const updated = await prisma.selfTalkCard.update({
      where: { id },
      data: { usedCount: { increment: 1 }, lastUsedAt: new Date() },
    });
    return res.json({ success: true, usedCount: updated.usedCount });
  } catch (err) {
    console.error('self-talk practice error:', err);
    return res.status(500).json({ error: 'server_error' });
  }
});

module.exports = router;
