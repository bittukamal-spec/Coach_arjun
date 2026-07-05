const express = require('express');
const { PrismaClient } = require('@prisma/client');
const authenticate = require('../middleware/authenticate');

const router = express.Router();
const prisma = new PrismaClient();

// Client-reported safety events (Body Reset keyword hit).
// Server-detected events (Self-Talk flag, chat helpline response) are written
// directly in their own routes. Only minimal metadata is stored — never content.

const VALID_SURFACES = ['body_reset', 'self_talk', 'chat'];
const VALID_TRIGGERS = ['crisis_keyword', 'intensity_max', 'needs_support', 'helpline_response'];

router.post('/event', authenticate, async (req, res) => {
  const { surface, triggerType } = req.body;
  if (!VALID_SURFACES.includes(surface) || !VALID_TRIGGERS.includes(triggerType)) {
    return res.status(400).json({ error: 'Invalid surface or triggerType' });
  }
  try {
    await prisma.safetyEvent.create({
      data: { userId: req.userId, surface, triggerType },
    });
    res.json({ success: true });
  } catch (err) {
    console.error('[safety] event create failed:', err?.message);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
