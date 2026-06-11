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
      select: { id: true, email: true, name: true, avatar: true, tier: true, language: true },
    });

    if (!user) return res.status(404).json({ error: 'User not found' });
    res.json({ user });
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

// Logout (client just drops the token, but this endpoint is here for completeness)
router.post('/logout', (_req, res) => {
  res.json({ message: 'Logged out' });
});

module.exports = router;
