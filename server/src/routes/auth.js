const express = require('express');
const bcrypt  = require('bcrypt');
const jwt     = require('jsonwebtoken');
const crypto  = require('crypto');
const { PrismaClient } = require('@prisma/client');
const authenticate = require('../middleware/authenticate');
const { sendPasswordResetEmail, sendWelcomeEmail } = require('../services/email');

const router  = express.Router();
const prisma  = new PrismaClient();
const SALT_ROUNDS = 12;

// Fields we're safe to return to the client (never include password)
const SAFE_SELECT = {
  id: true, email: true, name: true, avatar: true,
  tier: true, language: true, trialStarted: true,
  sport: true, experienceLevel: true, goals: true, onboardingDone: true,
  competitionLevel: true, primaryChallenge: true, pressureResponse: true, position: true,
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
        name:         name.trim(),
        email:        email.toLowerCase().trim(),
        password:     hashed,
        trialStarted: new Date(),
      },
      select: SAFE_SELECT,
    });

    // Fire-and-forget welcome email — don't block the response
    sendWelcomeEmail(user.email, user.name).catch(err =>
      console.error('[auth] welcome email failed:', err?.message)
    );

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
  const { sport, experienceLevel, goals, language, competitionLevel, primaryChallenge, pressureResponse, position } = req.body;

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
      data: {
        sport,
        experienceLevel,
        goals: JSON.stringify(goals),
        language,
        onboardingDone: true,
        ...(competitionLevel && { competitionLevel }),
        ...(primaryChallenge && { primaryChallenge }),
        ...(pressureResponse && { pressureResponse }),
        ...(position && { position }),
      },
      select: SAFE_SELECT,
    });
    res.json({ user: parseGoals(user) });
  } catch {
    res.status(500).json({ error: 'Server error' });
  }
});

// ── DELETE /api/auth/account ──────────────────────────────────────────────
// Permanently delete the authenticated user and all their data.

router.delete('/account', authenticate, async (req, res) => {
  try {
    // Prisma cascades deletes via onDelete: Cascade on all relations
    await prisma.user.delete({ where: { id: req.userId } });
    res.json({ message: 'Account deleted' });
  } catch {
    res.status(500).json({ error: 'Server error' });
  }
});

// ── POST /api/auth/logout ──────────────────────────────────────────────────

router.post('/logout', (_req, res) => {
  res.json({ message: 'Logged out' });
});

// ── POST /api/auth/forgot-password ────────────────────────────────────────

router.post('/forgot-password', async (req, res) => {
  const { email } = req.body;
  if (!email?.trim()) return res.status(400).json({ error: 'Email is required' });

  try {
    const user = await prisma.user.findUnique({
      where: { email: email.toLowerCase().trim() },
      select: { id: true, email: true },
    });

    // Always respond with success to prevent email enumeration
    if (!user) {
      return res.json({ message: 'If that email exists, a reset link has been sent.' });
    }

    // Invalidate any existing tokens for this user
    await prisma.passwordResetToken.updateMany({
      where: { userId: user.id, used: false },
      data: { used: true },
    });

    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

    await prisma.passwordResetToken.create({
      data: { userId: user.id, token, expiresAt },
    });

    const clientUrl = process.env.CLIENT_URL || 'http://localhost:5173';
    const resetUrl = `${clientUrl}/reset-password?token=${token}`;

    await sendPasswordResetEmail(user.email, resetUrl);

    res.json({ message: 'If that email exists, a reset link has been sent.' });
  } catch (err) {
    console.error('[auth] forgot-password error:', err?.message);
    res.status(500).json({ error: 'Server error' });
  }
});

// ── POST /api/auth/reset-password ─────────────────────────────────────────

router.post('/reset-password', async (req, res) => {
  const { token, password } = req.body;
  if (!token || !password) return res.status(400).json({ error: 'Token and password are required' });
  if (password.length < 8) return res.status(400).json({ error: 'Password must be at least 8 characters' });

  try {
    const record = await prisma.passwordResetToken.findUnique({
      where: { token },
      include: { user: true },
    });

    if (!record || record.used || record.expiresAt < new Date()) {
      return res.status(400).json({ error: 'This reset link is invalid or has expired.' });
    }

    const hashed = await bcrypt.hash(password, SALT_ROUNDS);

    await prisma.$transaction([
      prisma.user.update({ where: { id: record.userId }, data: { password: hashed } }),
      prisma.passwordResetToken.update({ where: { id: record.id }, data: { used: true } }),
    ]);

    res.json({ message: 'Password updated successfully. You can now log in.' });
  } catch (err) {
    console.error('[auth] reset-password error:', err?.message);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
