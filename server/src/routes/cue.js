const express = require('express');
const { PrismaClient } = require('@prisma/client');
const authenticate = require('../middleware/authenticate');

const router = express.Router();
const prisma = new PrismaClient();

// PATCH /api/user/cue-word
// Saves the athlete's chosen cue word from the Before You Play flow.
// Awards 15 XP server-side.
router.patch('/cue-word', authenticate, async (req, res) => {
  const { cueWord, cueArousalState, cueLanguage } = req.body;
  if (!cueWord || typeof cueWord !== 'string') {
    return res.status(400).json({ error: 'cueWord is required' });
  }
  const CUE_XP = 15;
  try {
    await prisma.user.update({
      where: { id: req.userId },
      data: {
        cueWord:         cueWord.trim().toUpperCase().slice(0, 20),
        cueArousalState: cueArousalState || null,
        cueLanguage:     cueLanguage || 'en',
        cueUpdatedAt:    new Date(),
        cueEventType:    'before_match',
        xp:              { increment: CUE_XP },
      },
    });
    const updated = await prisma.user.findUnique({
      where:  { id: req.userId },
      select: { xp: true, cueWord: true },
    });

    // Save ToolReport (fire-and-forget) — template-based, no Claude call
    const arousalLabel = { calm_down: 'calm down', lock_in: 'lock in', fire_up: 'fire up' }[cueArousalState] || 'get ready';
    const savedWord = updated.cueWord || cueWord.trim().toUpperCase().slice(0, 20);
    prisma.toolReport.create({
      data: {
        userId:        req.userId,
        toolType:      'cue_word',
        summary:       `Set cue word "${savedWord}" to ${arousalLabel} before a match.`,
        arjunResponse: `Your word is locked in — ${savedWord}. Use it the moment you need to ${arousalLabel}.`,
        details:       JSON.stringify({ cueWord: savedWord, cueArousalState, cueLanguage }),
      },
    }).catch(() => {});

    res.json({ ok: true, cueWord: updated.cueWord, xpEarned: CUE_XP, xp: updated.xp });
  } catch (err) {
    console.error('cue-word error:', err);
    res.status(500).json({ error: 'Failed to save cue word' });
  }
});

module.exports = router;
