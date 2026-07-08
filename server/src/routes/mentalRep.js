// Daily Mental Rep — the core habit of the Healthy Hook loop.
// No AI call, no trial gate (same pattern as games.js): the rep itself is
// rule-based and client-driven; this endpoint just records the completed
// rep. It reuses the existing ToolReport model (details JSON carries the
// rep's context/state/moment/cue) — zero schema changes — which also means
// completed reps automatically reach Arjun's chat context via the existing
// "last 3 ToolReports" prompt section.

const express = require('express');
const { PrismaClient } = require('@prisma/client');
const authenticate = require('../middleware/authenticate');
const { awardXP } = require('../services/gamification');
const { markSkillProgress } = require('../services/skillProgress');

const router = express.Router();
const prisma = new PrismaClient();

const VALID_CONTEXTS = ['training', 'match', 'recovery', 'just_rep'];
const VALID_STATES   = ['distracted', 'nervous', 'flat', 'ready', 'frustrated', 'overthinking'];
const VALID_MOMENTS  = ['first_minutes', 'after_mistake', 'pressure_moment', 'coach_watching', 'selection_trial', 'end_of_session', 'own'];

// Which existing mental skill this rep practised — keeps SkillProgress and
// chat's skill annotations consistent with the rest of the app.
const STATE_SKILL = {
  nervous:      'calm_body',
  distracted:   'focus_self_talk',
  overthinking: 'focus_self_talk',
  ready:        'focus_self_talk',
  frustrated:   'mistake_reset',
  flat:         'confidence',
};

router.post('/complete', authenticate, async (req, res) => {
  try {
    const { context, state, moment, momentText, cue, saveCue } = req.body;

    if (!VALID_CONTEXTS.includes(context)) return res.status(400).json({ error: 'Invalid context' });
    if (!VALID_STATES.includes(state))     return res.status(400).json({ error: 'Invalid state' });
    if (!VALID_MOMENTS.includes(moment))   return res.status(400).json({ error: 'Invalid moment' });
    if (!cue || typeof cue !== 'string' || cue.trim().length === 0 || cue.length > 60) {
      return res.status(400).json({ error: 'cue is required (max 60 chars)' });
    }
    const ownMoment = moment === 'own' && typeof momentText === 'string'
      ? momentText.trim().slice(0, 120)
      : null;

    const skillKey = STATE_SKILL[state];
    const momentLabel = ownMoment || moment.replace(/_/g, ' ');

    await prisma.toolReport.create({
      data: {
        userId: req.userId,
        toolType: 'mental_rep',
        skillKey,
        summary: `Daily Mental Rep (${context}): felt ${state}, preparing for "${momentLabel}" → cue "${cue.trim()}"${saveCue ? ' (cue saved to Playbook)' : ''}`,
        details: JSON.stringify({
          context,
          state,
          moment,
          momentText: ownMoment,
          cue: cue.trim(),
          savedCue: !!saveCue,
        }),
      },
    });

    markSkillProgress(req.userId, skillKey, 'practiceCompletedAt').catch(() => {});
    const { xp } = await awardXP(req.userId, 10);

    res.json({ success: true, xp, xpEarned: 10 });
  } catch (err) {
    console.error('[mentalRep] complete error:', err?.message);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
