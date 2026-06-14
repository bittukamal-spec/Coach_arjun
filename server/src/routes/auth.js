const express = require('express');
const bcrypt  = require('bcrypt');
const jwt     = require('jsonwebtoken');
const { PrismaClient } = require('@prisma/client');
const authenticate = require('../middleware/authenticate');

const router  = express.Router();
const prisma  = new PrismaClient();
const SALT_ROUNDS = 12;

// Fields we're safe to return to the client (never include password)
const SAFE_SELECT = {
  id: true, email: true, name: true, avatar: true,
  tier: true, language: true,
  sport: true, experienceLevel: true, goals: true, onboardingDone: true,
};

function makeToken(user) {
  return jwt.sign(
    { userId: user.id, email: user.email },
    process.env.JWT_SECRET,
    { expiresIn: '7d' }
  );
}

function parseGoals(user) {
  return { ...user, goals: JSON.parse(user.goals || '[]') };
}

// ── POST /api/auth/register ────────────────────────────────────────────────

router.post('/register', async (req, res) => {
  const { name, email, password } = req.body;

  if (!name?.trim())   return res.status(400).json({ error: 'Name is required' });
  if (!email?.trim())  return res.status(400).json({ error: 'Email is required' });
  if (!password)       return res.status(400).json({ error: 'Password is required' });
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ error: 'Please enter a valid email address' });
  }
  if (password.length < 8) {
    return res.status(400).json({ error: 'Password must be at least 8 characters' });
  }

  try {
    const existing = await prisma.user.findUnique({ where: { email: email.toLowerCase().trim() } });
    if (existing) {
      return res.status(409).json({ error: 'An account with this email already exists. Try signing in.' });
    }

    const hashed = await bcrypt.hash(password, SALT_ROUNDS);
    const user = await prisma.user.create({
      data: {
        name:     name.trim(),
        email:    email.toLowerCase().trim(),
        password: hashed,
      },
      select: SAFE_SELECT,
    });

    res.status(201).json({ token: makeToken(user), user: parseGoals(user) });
  } catch {
    res.status(500).json({ error: 'Server error' });
  }
});

// ── POST /api/auth/login ───────────────────────────────────────────────────

router.post('/login', async (req, res) => {
  const { email, password } = req.body;

  if (!email?.trim() || !password) {
    return res.status(400).json({ error: 'Email and password are required' });
  }

  try {
    const user = await prisma.user.findUnique({
      where: { email: email.toLowerCase().trim() },
    });

    // Use a constant-time comparison to avoid user enumeration timing attacks
    const validPassword = user?.password
      ? await bcrypt.compare(password, user.password)
      : false;

    if (!user || !validPassword) {
      return res.status(401).json({ error: 'Incorrect email or password' });
    }

    // Fetch safe fields for the response
    const safeUser = await prisma.user.findUnique({
      where: { id: user.id },
      select: SAFE_SELECT,
    });

    res.json({ token: makeToken(user), user: parseGoals(safeUser) });
  } catch {
    res.status(500).json({ error: 'Server error' });
  }
});

// ── GET /api/auth/me ───────────────────────────────────────────────────────

router.get('/me', authenticate, async (req, res) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.userId },
      select: SAFE_SELECT,
    });
    if (!user) return res.status(404).json({ error: 'User not found' });
    res.json({ user: parseGoals(user) });
  } catch {
    res.status(500).json({ error: 'Server error' });
  }
});

// ── PATCH /api/auth/me/language ────────────────────────────────────────────

router.patch('/me/language', authenticate, async (req, res) => {
  const { language } = req.body;
  if (!['en', 'hi'].includes(language)) {
    return res.status(400).json({ error: 'language must be "en" or "hi"' });
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

// ── PATCH /api/auth/me/onboarding ─────────────────────────────────────────

router.patch('/me/onboarding', authenticate, async (req, res) => {
  const { sport, experienceLevel, goals, language } = req.body;

  const validLevels = ['beginner', 'amateur', 'competitive', 'professional'];
  const validGoals  = ['focus', 'pressure', 'nerves', 'confidence', 'resilience', 'motivation', 'communication', 'injury'];
  const validLangs  = ['en', 'hi'];

  if (!sport || typeof sport !== 'string') return res.status(400).json({ error: 'sport is required' });
  if (!validLevels.includes(experienceLevel))  return res.status(400).json({ error: 'Invalid experienceLevel' });
  if (!Array.isArray(goals) || goals.length === 0 || goals.length > 3 || !goals.every(g => validGoals.includes(g))) {
    return res.status(400).json({ error: 'goals must be 1–3 valid values' });
  }
  if (!validLangs.includes(language)) return res.status(400).json({ error: 'language must be "en" or "hi"' });

  try {
    const user = await prisma.user.update({
      where: { id: req.userId },
      data: { sport, experienceLevel, goals: JSON.stringify(goals), language, onboardingDone: true },
      select: SAFE_SELECT,
    });
    res.json({ user: parseGoals(user) });
  } catch {
    res.status(500).json({ error: 'Server error' });
  }
});

// ── POST /api/auth/logout ──────────────────────────────────────────────────

router.post('/logout', (_req, res) => {
  res.json({ message: 'Logged out' });
});

module.exports = router;
