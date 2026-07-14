// Deterministic next-open prescription follow-up (PR-11). No Anthropic call
// on this route — the opener is a fixed template built from the persisted
// Prescription, claimed at most once via claimPrescriptionFollowUp's atomic
// transaction.

const express = require('express');
const { PrismaClient } = require('@prisma/client');
const authenticate = require('../middleware/authenticate');
const requireGuardianConsent = require('../middleware/requireGuardianConsent');
const { claimPrescriptionFollowUp, InvalidChatSessionError } = require('../services/coaching/claimPrescriptionFollowUp');

const router = express.Router();
const prisma = new PrismaClient();

router.post('/claim-opener', authenticate, requireGuardianConsent, async (req, res) => {
  try {
    const { chatSessionId } = req.body;
    if (!chatSessionId || typeof chatSessionId !== 'string') {
      return res.status(400).json({ error: 'chatSessionId is required' });
    }

    const user = await prisma.user.findUnique({
      where: { id: req.userId },
      select: { language: true },
    });
    if (!user) return res.status(404).json({ error: 'User not found' });

    const result = await claimPrescriptionFollowUp({
      userId: req.userId,
      chatSessionId,
      language: user.language,
    });

    if (!result.claimed) return res.json({ claimed: false });

    res.json({
      claimed: true,
      message: {
        id: result.message.id,
        role: result.message.role,
        content: result.message.content,
        createdAt: result.message.createdAt,
      },
    });
  } catch (err) {
    if (err instanceof InvalidChatSessionError) {
      // Never reveal whether the session exists for another athlete — same
      // generic 404 the sessions routes already use for a foreign/missing id.
      return res.status(404).json({ error: 'Chat session not found' });
    }
    console.error('[prescriptions] claim-opener error:', err?.message);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
