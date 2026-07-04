const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

// Blocks coaching endpoints for under-18 users until a guardian has consented.
// Legacy accounts (no dateOfBirth) and adults pass through untouched.
// Mount AFTER authenticate.
async function requireGuardianConsent(req, res, next) {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.userId },
      select: { dateOfBirth: true, guardianConsentAt: true },
    });
    if (!user) return res.status(404).json({ error: 'User not found' });

    if (user.dateOfBirth && !user.guardianConsentAt) {
      const birth = new Date(user.dateOfBirth);
      const now = new Date();
      let years = now.getFullYear() - birth.getFullYear();
      const m = now.getMonth() - birth.getMonth();
      if (m < 0 || (m === 0 && now.getDate() < birth.getDate())) years -= 1;

      if (years < 18) {
        return res.status(403).json({
          error: 'Parent or guardian consent is required before you can use coaching tools',
          code: 'CONSENT_REQUIRED',
        });
      }
    }
    next();
  } catch (err) {
    console.error('[consent] middleware error:', err?.message);
    res.status(500).json({ error: 'Server error' });
  }
}

module.exports = requireGuardianConsent;
