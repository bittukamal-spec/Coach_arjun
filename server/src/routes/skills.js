const express = require('express');
const authenticate = require('../middleware/authenticate');
const { VALID_SKILL_KEYS } = require('../config/skillRegistry');
const { markSkillProgress, getSkillProgress } = require('../services/skillProgress');

const router = express.Router();

const EMPTY_PROGRESS = {
  learnCompletedAt: null,
  quickCheckPassedAt: null,
  toolCompletedAt: null,
  practiceCompletedAt: null,
  lastRecommendedAt: null,
};

// GET /api/skills/:skillKey — current progress for one skill path
router.get('/:skillKey', authenticate, async (req, res) => {
  const { skillKey } = req.params;
  if (!VALID_SKILL_KEYS.includes(skillKey)) {
    return res.status(400).json({ error: 'Unknown skillKey' });
  }
  try {
    const progress = await getSkillProgress(req.userId, skillKey);
    res.json(progress ? {
      learnCompletedAt: progress.learnCompletedAt,
      quickCheckPassedAt: progress.quickCheckPassedAt,
      toolCompletedAt: progress.toolCompletedAt,
      practiceCompletedAt: progress.practiceCompletedAt,
      lastRecommendedAt: progress.lastRecommendedAt,
    } : EMPTY_PROGRESS);
  } catch (err) {
    console.error('[skills] GET error:', err?.message);
    res.status(500).json({ error: 'Server error' });
  }
});

// POST /api/skills/:skillKey/learn — mark the Learn step (intro + example) done
router.post('/:skillKey/learn', authenticate, async (req, res) => {
  const { skillKey } = req.params;
  if (!VALID_SKILL_KEYS.includes(skillKey)) {
    return res.status(400).json({ error: 'Unknown skillKey' });
  }
  try {
    await markSkillProgress(req.userId, skillKey, 'learnCompletedAt');
    res.json({ success: true });
  } catch (err) {
    console.error('[skills] learn error:', err?.message);
    res.status(500).json({ error: 'Server error' });
  }
});

// POST /api/skills/:skillKey/quick-check { passed: boolean }
// Only writes progress on a pass — a fail is never persisted, so retrying
// carries no penalty and there's nothing to "reset".
router.post('/:skillKey/quick-check', authenticate, async (req, res) => {
  const { skillKey } = req.params;
  const { passed } = req.body;
  if (!VALID_SKILL_KEYS.includes(skillKey)) {
    return res.status(400).json({ error: 'Unknown skillKey' });
  }
  try {
    if (passed === true) {
      await markSkillProgress(req.userId, skillKey, 'quickCheckPassedAt');
    }
    res.json({ success: true });
  } catch (err) {
    console.error('[skills] quick-check error:', err?.message);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
