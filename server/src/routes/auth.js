const express = require('express');
const passport = require('passport');
const jwt = require('jsonwebtoken');
const { PrismaClient } = require('@prisma/client');
const authenticate = require('../middleware/authenticate');

const router = express.Router();
const prisma = new PrismaClient();

// Step 1: Redirect user to Google's consent screen
router.get(
  '/google',
  passport.authenticate('google', { scope: ['profile', 'email'], session: false })
);

// Step 2: Google redirects back here after the user approves
router.get(
  '/google/callback',
  passport.authenticate('google', {
    session: false,
    failureRedirect: `${process.env.CLIENT_URL}/?error=auth_failed`,
  }),
  (req, res) => {
    const token = jwt.sign(
      { userId: req.user.id, email: req.user.email },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );
    // Send token to the frontend via redirect
    res.redirect(`${process.env.CLIENT_URL}/auth/callback?token=${token}`);
  }
);

// Get the currently logged-in user's profile
router.get('/me', authenticate, async (req, res) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.userId },
      select: {
        id: true, email: true, name: true, avatar: true,
        tier: true, language: true,
        sport: true, experienceLevel: true, goals: true, onboardingDone: true,
      },
    });

    if (!user) return res.status(404).json({ error: 'User not found' });
    res.json({ user: { ...user, goals: JSON.parse(user.goals || '[]') } });
  } catch {
    res.status(500).json({ error: 'Server error' });
  }
});

// Update language preference (en / hi)
router.patch('/me/language', authenticate, async (req, res) => {
  const { language } = req.body;
  if (!['en', 'hi'].includes(language)) {
    return res.status(400).json({ error: 'Language must be "en" or "hi"' });
  }
  try {
    const user = await prisma.user.update({
      where: { id: req.userId },
      data: { language },
      select: { id: true, language: true },
    });
    res.json({ user });
  } catch {
    res.status(500).json({ error: 'Server error' });
  }
});

// Save onboarding answers and mark onboarding complete
router.patch('/me/onboarding', authenticate, async (req, res) => {
  const { sport, experienceLevel, goals, language } = req.body;

  const validLevels = ['beginner', 'amateur', 'competitive', 'professional'];
  const validGoals  = ['focus', 'pressure', 'nerves', 'confidence', 'resilience', 'motivation', 'communication', 'injury'];
  const validLangs  = ['en', 'hi'];

  if (!sport || typeof sport !== 'string') {
    return res.status(400).json({ error: 'sport is required' });
  }
  if (!validLevels.includes(experienceLevel)) {
    return res.status(400).json({ error: 'Invalid experienceLevel' });
  }
  if (!Array.isArray(goals) || goals.length === 0 || goals.length > 3 || !goals.every(g => validGoals.includes(g))) {
    return res.status(400).json({ error: 'goals must be 1–3 valid values' });
  }
  if (!validLangs.includes(language)) {
    return res.status(400).json({ error: 'language must be "en" or "hi"' });
  }

  try {
    const user = await prisma.user.update({
      where: { id: req.userId },
      data: {
        sport,
        experienceLevel,
        goals: JSON.stringify(goals),
        language,
        onboardingDone: true,
      },
      select: {
        id: true, email: true, name: true, avatar: true,
        tier: true, language: true,
        sport: true, experienceLevel: true, goals: true, onboardingDone: true,
      },
    });
    // Parse goals back to array before sending
    res.json({ user: { ...user, goals: JSON.parse(user.goals) } });
  } catch {
    res.status(500).json({ error: 'Server error' });
  }
});

// Logout (client just drops the token, but this endpoint is here for completeness)
router.post('/logout', (_req, res) => {
  res.json({ message: 'Logged out' });
});

module.exports = router;
