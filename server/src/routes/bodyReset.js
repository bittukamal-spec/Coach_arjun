const express = require('express');
const Anthropic = require('@anthropic-ai/sdk');
const { PrismaClient } = require('@prisma/client');
const authenticate = require('../middleware/authenticate');
const requireGuardianConsent = require('../middleware/requireGuardianConsent');
const { aiLimiter } = require('../middleware/rateLimits');
const { checkFreeLimit } = require('./chat');
const { markSkillProgress } = require('../services/skillProgress');
const { screenSafetyFields, recordSafetyEvent, getSafetyGuidance } = require('../services/safety');

const router = express.Router();
const prisma = new PrismaClient();

const FALLBACK_NOTE = { arjunNote: 'Good reset. Return to the next action.', tags: ['body_reset'] };

const SYSTEM_PROMPT = `You are Arjun, an AI mental performance coach for young Indian athletes aged 14-25. Your role is mental performance coaching, not therapy. The athlete completed a Pressure Reset. Write 1-2 sentences only. Practical, not effusive. Do NOT say anxiety is cured. Do NOT diagnose. Mention the next controllable action. Use sport-specific language only if sport is known. Return only valid JSON: { "arjun_note": "", "tags": [] }`;

// ── POST /api/body-reset/arjun-note ──────────────────────────────────────────

router.post('/arjun-note', authenticate, aiLimiter, requireGuardianConsent, checkFreeLimit, async (req, res) => {
  const { mode, feeling, context, focusWordUsed, tensionBefore, tensionAfter, sport } = req.body;

  const contextLines = [
    mode        ? `Reset type: ${mode}`                         : null,
    feeling     ? `Feeling before: ${feeling}`                  : null,
    context     ? `Situation: ${context}`                       : null,
    focusWordUsed ? `Focus word used: ${focusWordUsed}`         : null,
    tensionBefore != null ? `Body tension before: ${tensionBefore}/10` : null,
    tensionAfter  != null ? `Body tension after: ${tensionAfter}/10`   : null,
    sport       ? `Sport: ${sport}`                             : null,
  ].filter(Boolean).join('\n');

  // Deterministic pre-LLM safety screen on the athlete-authored fields
  // (feeling/context can carry custom free text; the client's own keyword
  // check remains, this is the server-side backstop). On a hit: nothing is
  // sent to Anthropic; the note slot carries the fixed guidance; a
  // structured SafetyEvent (no content) is recorded.
  const preScreen = screenSafetyFields(feeling, context, focusWordUsed);
  if (preScreen.flagged) {
    recordSafetyEvent(req.userId, 'body_reset', preScreen.category, {
      riskLevel: preScreen.riskLevel,
      sourceType: 'body_reset_arjun_note',
    });
    const u = await prisma.user.findUnique({ where: { id: req.userId }, select: { language: true } }).catch(() => null);
    return res.json({ arjunNote: getSafetyGuidance(preScreen.category, u?.language), tags: ['support'], safetyFlag: 'needs_support' });
  }

  try {
    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    const message = await anthropic.messages.create({
      model: process.env.ANTHROPIC_MODEL || 'claude-haiku-4-5-20251001',
      max_tokens: 200,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: `Athlete context:\n\n${contextLines}\n\nWrite the post-reset note.` }],
    });

    let rawText = message.content[0].text.trim();
    if (rawText.startsWith('```')) {
      rawText = rawText.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '').trim();
    }

    let parsed;
    try {
      parsed = JSON.parse(rawText);
    } catch {
      return res.json(FALLBACK_NOTE);
    }

    return res.json({
      arjunNote: parsed.arjun_note || FALLBACK_NOTE.arjunNote,
      tags: Array.isArray(parsed.tags) ? parsed.tags : ['body_reset'],
      aiModel: message.model,
    });
  } catch {
    return res.json(FALLBACK_NOTE);
  }
});

// ── POST /api/body-reset/save ─────────────────────────────────────────────────

router.post('/save', authenticate, async (req, res) => {
  const userId = req.userId;
  const {
    mode, feeling, feelingCustom, context, contextCustom,
    focusWordUsed, tensionBefore, readinessBefore,
    tensionAfter, readinessAfter,
    cyclesCompleted, durationSeconds,
    arjunNote, arjunTags, aiModel,
  } = req.body;

  if (!mode) {
    return res.status(400).json({ error: 'mode is required' });
  }

  try {
    const session = await prisma.bodyResetSession.create({
      data: {
        userId,
        mode,
        feeling:         feeling        || null,
        feelingCustom:   feelingCustom  || null,
        context:         context        || null,
        contextCustom:   contextCustom  || null,
        focusWordUsed:   focusWordUsed  || null,
        tensionBefore:   tensionBefore  ?? null,
        readinessBefore: readinessBefore ?? null,
        tensionAfter:    tensionAfter   ?? null,
        readinessAfter:  readinessAfter ?? null,
        cyclesCompleted: cyclesCompleted ?? 0,
        durationSeconds: durationSeconds ?? 0,
        arjunNote:       arjunNote      || null,
        arjunTags:       arjunTags      || [],
        aiModel:         aiModel        || null,
      },
    });

    await prisma.toolReport.create({
      data: {
        userId,
        toolType:      'body_reset',
        skillKey:      'calm_body',
        summary:       `${mode} reset — ${feeling || 'general'}`,
        arjunResponse: arjunNote || null,
        details: JSON.stringify({
          mode, feeling, context, focusWordUsed,
          tensionBefore, tensionAfter,
          cyclesCompleted, durationSeconds,
        }),
      },
    });
    markSkillProgress(userId, 'calm_body', 'toolCompletedAt').catch(() => {});

    return res.json({ success: true, session });
  } catch (err) {
    console.error('body-reset save error:', err);
    return res.status(500).json({ error: 'server_error' });
  }
});

// ── GET /api/body-reset/ ──────────────────────────────────────────────────────

router.get('/', authenticate, async (req, res) => {
  const userId = req.userId;
  try {
    const sessions = await prisma.bodyResetSession.findMany({
      where: { userId },
      orderBy: { completedAt: 'desc' },
      take: 20,
    });
    return res.json(sessions);
  } catch (err) {
    console.error('body-reset list error:', err);
    return res.status(500).json({ error: 'server_error' });
  }
});

// ── DELETE /api/body-reset/:id ────────────────────────────────────────────────

router.delete('/:id', authenticate, async (req, res) => {
  const userId = req.userId;
  const { id } = req.params;

  const existing = await prisma.bodyResetSession.findUnique({ where: { id } });
  if (!existing || existing.userId !== userId) {
    return res.status(404).json({ error: 'not_found' });
  }

  try {
    await prisma.bodyResetSession.delete({ where: { id } });
    return res.json({ success: true });
  } catch (err) {
    console.error('body-reset delete error:', err);
    return res.status(500).json({ error: 'server_error' });
  }
});

module.exports = router;
