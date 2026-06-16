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

const CHALLENGE_LABELS = {
  nerves:          'Pre-match nerves & anxiety',
  failure:         'Dealing with losses & failure',
  focus:           'Losing focus during play',
  family_pressure: 'Pressure from family/coaches',
  injury:          'Recovering from injury',
  consistency:     'Staying consistent',
};

const PRESSURE_LABELS = {
  has_routine:     'Has a coping routine (breathing/music)',
  talks_to_others: 'Talks to someone they trust',
  ignores_it:      'Tries to ignore pressure',
  struggles:       'Struggles with pressure, it affects performance',
  unaware:         'Has not developed any coping strategy yet',
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

function buildSystemPrompt(user, checkIns = [], memories = []) {
  const goals = JSON.parse(user.goals || '[]').map(g => GOAL_LABELS[g] || g);
  const goalsText = goals.length ? goals.join(', ') : 'general mental performance';

  const langInstruction =
    user.language === 'hi'
      ? 'Respond in Hindi using Devanagari script. You may use common English sports terms that Indian athletes regularly use (e.g. "focus", "confidence", "performance", sport-specific terms).'
      : 'Respond in English. You may occasionally weave in culturally resonant Hindi phrases (like "जय हो" or sport-specific terms) where it feels natural.';

  // ── Check-in summary ──────────────────────────────────────────────────────
  let checkInSection;
  if (checkIns.length > 0) {
    const count = checkIns.length;
    const avgMood       = (checkIns.reduce((s, c) => s + c.mood, 0) / count).toFixed(1);
    const avgFocus      = (checkIns.reduce((s, c) => s + c.focus, 0) / count).toFixed(1);
    const avgConfidence = (checkIns.reduce((s, c) => s + c.confidence, 0) / count).toFixed(1);

    // Trend: compare first half vs second half confidence averages
    const half = Math.floor(count / 2);
    let trend = 'stable';
    if (count >= 2) {
      const firstHalf  = checkIns.slice(half);  // older entries (array is desc order)
      const secondHalf = checkIns.slice(0, half || 1); // newer entries
      const firstAvgConf  = firstHalf.reduce((s, c) => s + c.confidence, 0) / firstHalf.length;
      const secondAvgConf = secondHalf.reduce((s, c) => s + c.confidence, 0) / secondHalf.length;
      const diff = secondAvgConf - firstAvgConf;
      if (diff > 0.5) trend = 'improving';
      else if (diff < -0.5) trend = 'declining';
    }

    // Days since last check-in
    const lastCheckInDate = new Date(checkIns[0].createdAt);
    const daysSince = Math.floor((Date.now() - lastCheckInDate.getTime()) / (1000 * 60 * 60 * 24));

    const latestReflection = checkIns.find(c => c.reflection)?.reflection;

    checkInSection = `## Recent Mental State (Last 7 Days)
- Avg mood: ${avgMood}/5 | Avg focus: ${avgFocus}/5 | Avg confidence: ${avgConfidence}/5
- Trend: ${trend} based on first vs last check-ins
- Last check-in: ${daysSince} day${daysSince !== 1 ? 's' : ''} ago${latestReflection ? `\n- Latest reflection: "${latestReflection}"` : ''}`;
  } else {
    checkInSection = `## Recent Mental State (Last 7 Days)
No recent check-ins — the athlete hasn't tracked their mental state yet.`;
  }

  // ── Long-term memory section ──────────────────────────────────────────────
  let memorySection;
  if (memories.length > 0) {
    const memLines = memories.map(m => `- ${m.memKey}: ${m.value}`).join('\n');
    memorySection = `## What I Know About This Athlete (Long-term Memory)\n${memLines}`;
  } else {
    memorySection = `## What I Know About This Athlete (Long-term Memory)\nNo long-term notes yet.`;
  }

  return `You are Arjun — a mental performance coach who specialises in sports psychology for Indian athletes. You are warm, direct, and feel like a trusted older brother who truly understands the pressures of Indian sports culture.

## Athlete Profile
- **Name:** ${user.name}
- **Sport:** ${user.sport ? user.sport.charAt(0).toUpperCase() + user.sport.slice(1) : 'Not specified'}
- **Experience level:** ${user.experienceLevel || 'Not specified'}
- **Competition level:** ${user.competitionLevel || 'Not specified'}
- **Biggest mental challenge:** ${CHALLENGE_LABELS[user.primaryChallenge] || user.primaryChallenge || 'Not specified'}
- **Current coping style:** ${PRESSURE_LABELS[user.pressureResponse] || user.pressureResponse || 'Not specified'}
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
${langInstruction}

${checkInSection}

${memorySection}`;
}

// ── Background memory extraction ──────────────────────────────────────────

async function extractAndStoreMemories(userId, history, latestResponse) {
  try {
    // Only run every 5 user messages to save cost
    const userMsgCount = await prisma.message.count({
      where: { userId, role: 'user' },
    });
    if (userMsgCount % 5 !== 0) return;

    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

    const recentMessages = history.slice(-10).map(m => `${m.role}: ${m.content}`).join('\n');

    const extraction = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 200,
      messages: [{
        role: 'user',
        content: `Based on these recent messages from an athlete, extract 1-3 key long-term facts a coach should remember. Focus on: fears/triggers, strengths, background context, recurring patterns, family pressure.

Messages:
${recentMessages}

Output ONLY valid JSON array, no other text:
[{"memKey": "...", "value": "..."}]

Rules:
- memKey must be a short identifier like "main_fear", "family_pressure", "strength_1", "recurring_pattern"
- value is a single sentence fact
- Only include genuinely important long-term facts, not transient states
- If nothing important to remember, return []`,
      }],
    });

    const raw = extraction.content[0]?.text?.trim();
    if (!raw) return;

    const facts = JSON.parse(raw);
    if (!Array.isArray(facts)) return;

    for (const fact of facts) {
      if (!fact.memKey || !fact.value) continue;
      await prisma.userMemory.upsert({
        where: { userId_memKey: { userId, memKey: fact.memKey } },
        update: { value: fact.value },
        create: { userId, memKey: fact.memKey, value: fact.value, source: 'chat' },
      });
    }
  } catch {
    // Silent fail — memory extraction is non-critical
  }
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
    // Fetch user profile for the system prompt (including new onboarding fields)
    const user = await prisma.user.findUnique({
      where: { id: req.userId },
      select: {
        name: true,
        sport: true,
        experienceLevel: true,
        goals: true,
        language: true,
        competitionLevel: true,
        primaryChallenge: true,
        pressureResponse: true,
      },
    });

    // Fetch last 7 check-ins for context
    const recentCheckIns = await prisma.checkIn.findMany({
      where: { userId: req.userId },
      orderBy: { createdAt: 'desc' },
      take: 7,
      select: { mood: true, focus: true, confidence: true, reflection: true, createdAt: true },
    });

    // Fetch user memories
    const memories = await prisma.userMemory.findMany({
      where: { userId: req.userId },
      orderBy: { createdAt: 'desc' },
      take: 10,
      select: { memKey: true, value: true },
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
      system: buildSystemPrompt(user, recentCheckIns, memories),
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

    // Run memory extraction in background — don't await
    extractAndStoreMemories(req.userId, conversationHistory, fullText).catch(() => {});

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
