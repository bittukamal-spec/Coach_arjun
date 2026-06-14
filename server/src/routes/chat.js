const express = require('express');
const Anthropic = require('@anthropic-ai/sdk');
const { PrismaClient } = require('@prisma/client');
const authenticate = require('../middleware/authenticate');

const router = express.Router();
const prisma = new PrismaClient();

// How many past messages to send to Claude as context (keeps costs reasonable)
const MAX_HISTORY = 20;

// Free tier weekly message limit
const FREE_LIMIT = 5;

// Human-readable goal names for the system prompt
const GOAL_LABELS = {
  focus:         'Focus & Concentration',
  pressure:      'Handling Pressure',
  nerves:        'Pre-Match Nerves',
  confidence:    'Building Confidence',
  resilience:    'Recovering from Setbacks',
  motivation:    'Staying Motivated',
  communication: 'Team Communication',
  injury:        'Dealing with Injuries',
};

// ── Middleware: block free users who hit their weekly limit ────────────────

async function checkFreeLimit(req, res, next) {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.userId },
      select: { tier: true },
    });
    if (user?.tier === 'premium') return next();

    const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const used = await prisma.message.count({
      where: { userId: req.userId, role: 'user', createdAt: { gte: weekAgo } },
    });

    if (used >= FREE_LIMIT) {
      return res.status(429).json({
        error: 'Weekly message limit reached. Upgrade to Premium for unlimited access.',
        code: 'LIMIT_REACHED',
        used,
        limit: FREE_LIMIT,
      });
    }
    next();
  } catch {
    res.status(500).json({ error: 'Server error' });
  }
}

// ── Helper: build personalised system prompt ─────────────────────────────

function buildSystemPrompt(user) {
  const goals = JSON.parse(user.goals || '[]').map(g => GOAL_LABELS[g] || g);
  const goalsText = goals.length ? goals.join(', ') : 'general mental performance';

  const langInstruction =
    user.language === 'hi'
      ? 'Respond in Hindi using Devanagari script. You may use common English sports terms that Indian athletes regularly use (e.g. "focus", "confidence", "performance", sport-specific terms).'
      : 'Respond in English. You may occasionally weave in culturally resonant Hindi phrases (like "जय हो" or sport-specific terms) where it feels natural.';

  return `You are MindGame Coach — an expert mental performance coach specialising in sports psychology for Indian athletes.

## Athlete Profile
- **Name:** ${user.name}
- **Sport:** ${user.sport ? user.sport.charAt(0).toUpperCase() + user.sport.slice(1) : 'Not specified'}
- **Experience level:** ${user.experienceLevel || 'Not specified'}
- **Focus areas:** ${goalsText}

## Coaching Style
- Be warm, direct, and encouraging — a trusted coach, not a therapist
- Keep responses concise and practical: 2–4 short paragraphs maximum
- Use evidence-based techniques: visualisation, self-talk, breathing regulation, process goals, confidence routines
- Acknowledge Indian sports realities: family pressure, limited mental health awareness, academic-sports balance, financial constraints
- Use the athlete's name occasionally to personalise the conversation
- End most responses with one concrete, actionable step or a 2-minute mental exercise
- Ask a follow-up question to understand the athlete's situation more deeply

## Boundaries
- You are a performance coach, not a doctor or clinical therapist
- For serious mental health concerns (depression, anxiety disorders, trauma), warmly suggest professional help while still being supportive
- Stay focused on sport performance, mindset, and mental skills
- Never diagnose conditions or suggest medications

## Language
${langInstruction}`;
}

// ── GET /api/chat/messages — load existing history ────────────────────────

router.get('/messages', authenticate, async (req, res) => {
  try {
    const messages = await prisma.message.findMany({
      where: { userId: req.userId },
      orderBy: { createdAt: 'asc' },
      take: 50,
      select: { id: true, role: true, content: true, createdAt: true },
    });
    res.json({ messages });
  } catch {
    res.status(500).json({ error: 'Server error' });
  }
});

// ── GET /api/chat/usage — weekly usage for the free tier badge ────────────

router.get('/usage', authenticate, async (req, res) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.userId },
      select: { tier: true },
    });

    if (user?.tier === 'premium') {
      return res.json({ isPremium: true, used: 0, limit: null });
    }

    const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const used = await prisma.message.count({
      where: { userId: req.userId, role: 'user', createdAt: { gte: weekAgo } },
    });

    res.json({ isPremium: false, used, limit: FREE_LIMIT });
  } catch {
    res.status(500).json({ error: 'Server error' });
  }
});

// ── POST /api/chat/message — send a message, stream Claude's response ─────

router.post('/message', authenticate, checkFreeLimit, async (req, res) => {
  if (!process.env.ANTHROPIC_API_KEY) {
    return res.status(503).json({
      error: 'AI coaching is not configured. Add ANTHROPIC_API_KEY to your server .env file.',
    });
  }

  const { content } = req.body;
  if (!content || typeof content !== 'string' || content.trim().length === 0) {
    return res.status(400).json({ error: 'Message content is required' });
  }
  if (content.length > 2000) {
    return res.status(400).json({ error: 'Message too long (max 2000 characters)' });
  }

  try {
    // Fetch user profile for the system prompt
    const user = await prisma.user.findUnique({
      where: { id: req.userId },
      select: { name: true, sport: true, experienceLevel: true, goals: true, language: true },
    });

    // Save the user's message first
    await prisma.message.create({
      data: { userId: req.userId, role: 'user', content: content.trim() },
    });

    // Fetch recent history to provide context to Claude
    const history = await prisma.message.findMany({
      where: { userId: req.userId },
      orderBy: { createdAt: 'desc' },
      take: MAX_HISTORY,
      select: { role: true, content: true },
    });
    // Reverse so oldest is first (Claude expects chronological order)
    const conversationHistory = history.reverse().map(m => ({
      role: m.role,
      content: m.content,
    }));

    // Set up Server-Sent Events stream
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();

    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    let fullText = '';

    const stream = anthropic.messages.stream({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 800,
      system: buildSystemPrompt(user),
      messages: conversationHistory,
    });

    stream.on('text', (text) => {
      fullText += text;
      res.write(`data: ${JSON.stringify({ t: 'd', c: text })}\n\n`);
    });

    await stream.finalMessage();

    // Save the complete assistant response
    const assistantMsg = await prisma.message.create({
      data: { userId: req.userId, role: 'assistant', content: fullText },
    });

    res.write(`data: ${JSON.stringify({ t: 'end', id: assistantMsg.id })}\n\n`);
    res.end();

  } catch (err) {
    console.error('[chat] Anthropic error:', err?.message || err);
    if (res.headersSent) {
      res.write(`data: ${JSON.stringify({ t: 'error', message: 'AI response failed. Please try again.' })}\n\n`);
      res.end();
    } else {
      res.status(500).json({ error: 'Failed to get AI response. Please try again.' });
    }
  }
});

module.exports = router;
