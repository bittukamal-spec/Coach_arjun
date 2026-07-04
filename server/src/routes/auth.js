const express = require('express');
const bcrypt  = require('bcrypt');
const jwt     = require('jsonwebtoken');
const crypto  = require('crypto');
const { PrismaClient } = require('@prisma/client');
const authenticate = require('../middleware/authenticate');
const { sendPasswordResetEmail, sendWelcomeEmail, sendDeletionEmail, sendGuardianConsentEmail } = require('../services/email');
const { authLimiter } = require('../middleware/rateLimits');

const router  = express.Router();
const prisma  = new PrismaClient();
const SALT_ROUNDS = 12;

// Fields we're safe to return to the client (never include password)
const SAFE_SELECT = {
  id: true, email: true, name: true, avatar: true,
  tier: true, language: true, trialStarted: true,
  sport: true, experienceLevel: true, goals: true, onboardingDone: true,
  competitionLevel: true, primaryChallenge: true, pressureResponse: true, position: true,
  xp: true, createdAt: true,
  age: true, profileIntro: true,
  subscriptionPlanType: true, subscriptionStartDate: true,
  cueWord: true, cueArousalState: true,
  dateOfBirth: true, guardianEmail: true, guardianConsentAt: true,
};

// Age helpers for the minor-user gate. Legacy accounts (no dateOfBirth) are never gated.
function ageFromDob(dob) {
  const birth = new Date(dob);
  const now = new Date();
  let years = now.getFullYear() - birth.getFullYear();
  const m = now.getMonth() - birth.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < birth.getDate())) years -= 1;
  return years;
}

function makeToken(user) {
  return jwt.sign(
    { userId: user.id, email: user.email },
    process.env.JWT_SECRET,
    { expiresIn: '30d' }
  );
}

function parseGoals(user) {
  return { ...user, goals: JSON.parse(user.goals || '[]') };
}

// ── POST /api/auth/register ────────────────────────────────────────────────

router.post('/register', authLimiter, async (req, res) => {
  const { name, email, password, dateOfBirth, guardianEmail } = req.body;
  const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  if (!name?.trim())   return res.status(400).json({ error: 'Name is required' });
  if (!email?.trim())  return res.status(400).json({ error: 'Email is required' });
  if (!password)       return res.status(400).json({ error: 'Password is required' });
  if (!emailRe.test(email)) {
    return res.status(400).json({ error: 'Please enter a valid email address' });
  }
  if (password.length < 8) {
    return res.status(400).json({ error: 'Password must be at least 8 characters' });
  }

  // Age gate — DOB is required for new accounts
  if (!dateOfBirth) {
    return res.status(400).json({ error: 'Date of birth is required', code: 'DOB_REQUIRED' });
  }
  const dob = new Date(dateOfBirth);
  if (isNaN(dob.getTime()) || dob > new Date()) {
    return res.status(400).json({ error: 'Please enter a valid date of birth' });
  }
  const years = ageFromDob(dob);
  if (years > 100) {
    return res.status(400).json({ error: 'Please enter a valid date of birth' });
  }
  if (years < 13) {
    return res.status(403).json({
      error: 'Arjun is for athletes aged 13 and above. You cannot create an account yet.',
      code: 'AGE_BLOCKED',
    });
  }
  const isMinor = years < 18;
  if (isMinor) {
    if (!guardianEmail?.trim() || !emailRe.test(guardianEmail)) {
      return res.status(400).json({
        error: 'A parent or guardian email is required for athletes under 18',
        code: 'GUARDIAN_EMAIL_REQUIRED',
      });
    }
    if (guardianEmail.toLowerCase().trim() === email.toLowerCase().trim()) {
      return res.status(400).json({ error: 'Guardian email must be different from your own email' });
    }
  }

  try {
    const existing = await prisma.user.findUnique({ where: { email: email.toLowerCase().trim() } });
    if (existing) {
      return res.status(409).json({ error: 'An account with this email already exists. Try signing in.' });
    }

    const hashed = await bcrypt.hash(password, SALT_ROUNDS);
    const consentToken = isMinor ? crypto.randomBytes(32).toString('hex') : null;
    const user = await prisma.user.create({
      data: {
        name:         name.trim(),
        email:        email.toLowerCase().trim(),
        password:     hashed,
        trialStarted: new Date(),
        dateOfBirth:  dob,
        age:          years,
        ...(isMinor && {
          guardianEmail: guardianEmail.toLowerCase().trim(),
          guardianConsentToken: consentToken,
        }),
      },
      select: SAFE_SELECT,
    });

    // Fire-and-forget emails — don't block the response
    sendWelcomeEmail(user.email, user.name).catch(err =>
      console.error('[auth] welcome email failed:', err?.message)
    );
    if (isMinor) {
      const clientUrl = process.env.CLIENT_URL || 'http://localhost:5173';
      const consentUrl = `${clientUrl}/guardian-consent?token=${consentToken}`;
      sendGuardianConsentEmail(user.guardianEmail, user.name, consentUrl).catch(err =>
        console.error('[auth] guardian consent email failed:', err?.message)
      );
    }

    res.status(201).json({ token: makeToken(user), user: parseGoals(user) });
  } catch {
    res.status(500).json({ error: 'Server error' });
  }
});

// ── POST /api/auth/guardian-consent — public, from the emailed link ────────

router.post('/guardian-consent', async (req, res) => {
  const { token } = req.body;
  if (!token) return res.status(400).json({ error: 'Token is required' });

  try {
    const user = await prisma.user.findUnique({
      where: { guardianConsentToken: token },
      select: { id: true, name: true, guardianConsentAt: true },
    });
    if (!user) {
      return res.status(400).json({ error: 'This consent link is invalid or has already been used.' });
    }
    if (user.guardianConsentAt) {
      return res.json({ success: true, athleteName: user.name.split(' ')[0], alreadyConfirmed: true });
    }

    await prisma.user.update({
      where: { id: user.id },
      data: { guardianConsentAt: new Date() },
    });

    console.log(JSON.stringify({
      event: 'guardian_consent_confirmed',
      timestamp: new Date().toISOString(),
    }));

    res.json({ success: true, athleteName: user.name.split(' ')[0] });
  } catch {
    res.status(500).json({ error: 'Server error' });
  }
});

// ── POST /api/auth/resend-guardian-consent — authenticated minor re-sends ──

router.post('/resend-guardian-consent', authenticate, async (req, res) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.userId },
      select: { name: true, guardianEmail: true, guardianConsentAt: true, guardianConsentToken: true },
    });
    if (!user?.guardianEmail || user.guardianConsentAt) {
      return res.status(400).json({ error: 'No pending guardian consent for this account' });
    }

    let token = user.guardianConsentToken;
    if (!token) {
      token = crypto.randomBytes(32).toString('hex');
      await prisma.user.update({ where: { id: req.userId }, data: { guardianConsentToken: token } });
    }

    const clientUrl = process.env.CLIENT_URL || 'http://localhost:5173';
    await sendGuardianConsentEmail(user.guardianEmail, user.name, `${clientUrl}/guardian-consent?token=${token}`);
    res.json({ success: true });
  } catch (err) {
    console.error('[auth] resend guardian consent failed:', err?.message);
    res.status(500).json({ error: 'Server error' });
  }
});

// ── POST /api/auth/login ───────────────────────────────────────────────────

router.post('/login', authLimiter, async (req, res) => {
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

// ── PUT /api/auth/me/profile — update editable profile fields ─────────────

router.put('/me/profile', authenticate, async (req, res) => {
  const { name, age, sport, competitionLevel, experienceLevel, primaryChallenge, goals, language, position } = req.body;

  const validLevels  = ['beginner', 'amateur', 'competitive', 'professional'];
  const validGoals   = ['focus', 'pressure', 'nerves', 'confidence', 'resilience', 'motivation', 'communication', 'injury'];
  const validLangs   = ['en', 'hi'];

  const updates = {};
  if (name && typeof name === 'string' && name.trim()) updates.name = name.trim();
  if (age !== undefined && age !== null) {
    const ageNum = parseInt(age, 10);
    if (!isNaN(ageNum) && ageNum >= 8 && ageNum <= 80) updates.age = ageNum;
  }
  if (sport && typeof sport === 'string') updates.sport = sport.trim();
  if (competitionLevel && validLevels.includes(competitionLevel)) updates.competitionLevel = competitionLevel;
  if (experienceLevel && validLevels.includes(experienceLevel)) updates.experienceLevel = experienceLevel;
  if (primaryChallenge) updates.primaryChallenge = primaryChallenge;
  if (goals && Array.isArray(goals) && goals.every(g => validGoals.includes(g))) {
    updates.goals = JSON.stringify(goals);
  }
  if (language && validLangs.includes(language)) updates.language = language;
  if (position !== undefined) updates.position = position || null;

  if (Object.keys(updates).length === 0) {
    return res.status(400).json({ error: 'No valid fields to update' });
  }

  try {
    const user = await prisma.user.update({
      where: { id: req.userId },
      data: updates,
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
    // Step 1: Read user data needed for post-deletion actions
    const user = await prisma.user.findUnique({
      where: { id: req.userId },
      select: { id: true, name: true, email: true, razorpaySubscriptionId: true },
    });
    if (!user) return res.status(404).json({ error: 'User not found' });

    const { name, email, razorpaySubscriptionId } = user;
    const firstName = name ? name.split(' ')[0] : 'there';

    // Step 2: Cancel Razorpay subscription if one exists (fire-and-forget; never block deletion)
    if (razorpaySubscriptionId) {
      try {
        const Razorpay = require('razorpay');
        const rzp = new Razorpay({
          key_id: process.env.RAZORPAY_KEY_ID,
          key_secret: process.env.RAZORPAY_KEY_SECRET,
        });
        await rzp.subscriptions.cancel(razorpaySubscriptionId, { cancel_at_cycle_end: false });
      } catch (rzpErr) {
        console.error('Razorpay cancel failed during account deletion (continuing):', rzpErr?.message);
      }
    }

    // Step 3: Delete Messages first (Message.chatSessionId has no explicit onDelete cascade)
    await prisma.message.deleteMany({ where: { userId: req.userId } });

    // Step 4: Delete ChatSessions
    await prisma.chatSession.deleteMany({ where: { userId: req.userId } });

    // Step 5: Delete the User (cascades all remaining relations via onDelete: Cascade)
    await prisma.user.delete({ where: { id: req.userId } });

    // Step 6: Audit log
    console.log(JSON.stringify({
      event: 'account_deleted',
      timestamp: new Date().toISOString(),
      hadSubscription: !!razorpaySubscriptionId,
    }));

    // Step 7: Send confirmation email (best-effort)
    try {
      await sendDeletionEmail(email, firstName);
    } catch (emailErr) {
      console.error('Deletion email failed (non-blocking):', emailErr?.message);
    }

    res.json({ success: true, deletedAt: new Date().toISOString() });
  } catch {
    res.status(500).json({ error: 'Server error' });
  }
});

// ── POST /api/auth/logout ──────────────────────────────────────────────────

router.post('/logout', (_req, res) => {
  res.json({ message: 'Logged out' });
});

// ── POST /api/auth/forgot-password ────────────────────────────────────────

router.post('/forgot-password', authLimiter, async (req, res) => {
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
