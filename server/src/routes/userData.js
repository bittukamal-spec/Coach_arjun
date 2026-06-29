const express = require('express');
const { PrismaClient } = require('@prisma/client');
const authenticate = require('../middleware/authenticate');

const router = express.Router();
const prisma = new PrismaClient();

const ALLOWED_TYPES = ['chat-history', 'reflections', 'mental-profile', 'cue-word', 'checkin-history'];

// DELETE /api/user/data/:type
router.delete('/data/:type', authenticate, async (req, res) => {
  const { type } = req.params;
  const userId = req.userId;

  if (!ALLOWED_TYPES.includes(type)) {
    return res.status(400).json({ error: 'Invalid data type' });
  }

  try {
    switch (type) {
      case 'chat-history':
        await prisma.message.deleteMany({ where: { userId } });
        await prisma.chatSession.deleteMany({ where: { userId } });
        break;

      case 'reflections':
        await prisma.debrief.deleteMany({ where: { userId } });
        break;

      case 'mental-profile':
        await prisma.user.update({
          where: { id: userId },
          data: {
            oceanO: null,
            oceanC: null,
            oceanE: null,
            oceanA: null,
            oceanN: null,
            onboardingDone: false,
            profileIntro: null,
          },
        });
        break;

      case 'cue-word':
        await prisma.user.update({
          where: { id: userId },
          data: {
            cueWord: null,
            cueLanguage: null,
            cueArousalState: null,
            cueEventType: null,
            cueUpdatedAt: null,
          },
        });
        break;

      case 'checkin-history':
        await prisma.mentalFitnessEntry.deleteMany({ where: { userId } });
        break;
    }

    res.json({ success: true, type });
  } catch (err) {
    console.error('userData delete error', err);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
