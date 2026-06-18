const express = require('express');
const { PrismaClient } = require('@prisma/client');
const authenticate = require('../middleware/authenticate');

const router = express.Router();
const prisma = new PrismaClient();

const STEP_TYPES = ['breathe', 'cue', 'visualize', 'physical', 'custom'];

// GET /api/ritual/me — fetch user's saved ritual
router.get('/me', authenticate, async (req, res) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.userId },
      select: { ritualName: true, ritualSteps: true },
    });
    const steps = JSON.parse(user?.ritualSteps || '[]');
    res.json({ ritualName: user?.ritualName || null, steps });
  } catch {
    res.status(500).json({ error: 'Server error' });
  }
});

// POST /api/ritual/me — save / update ritual
router.post('/me', authenticate, async (req, res) => {
  const { ritualName, steps } = req.body;

  if (!ritualName || typeof ritualName !== 'string' || ritualName.trim().length === 0) {
    return res.status(400).json({ error: 'ritualName is required' });
  }
  if (!Array.isArray(steps) || steps.length === 0 || steps.length > 5) {
    return res.status(400).json({ error: 'steps must be an array of 1-5 items' });
  }
  for (const step of steps) {
    if (!STEP_TYPES.includes(step.type)) return res.status(400).json({ error: `Invalid step type: ${step.type}` });
    if (!step.label || typeof step.label !== 'string' || step.label.trim().length === 0) {
      return res.status(400).json({ error: 'Each step must have a label' });
    }
    if (step.label.length > 120) return res.status(400).json({ error: 'Step label too long (max 120 chars)' });
  }

  try {
    await prisma.user.update({
      where: { id: req.userId },
      data: {
        ritualName: ritualName.trim(),
        ritualSteps: JSON.stringify(steps.map(s => ({ type: s.type, label: s.label.trim() }))),
      },
    });
    res.json({ ok: true });
  } catch {
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
