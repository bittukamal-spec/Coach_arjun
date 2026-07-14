// Deterministic next-open prescription follow-up (PR-11) + exact prescription
// completion linkage (PR-12). No Anthropic call anywhere in this file.

const express = require('express');
const { PrismaClient } = require('@prisma/client');
const authenticate = require('../middleware/authenticate');
const requireGuardianConsent = require('../middleware/requireGuardianConsent');
const { claimPrescriptionFollowUp, InvalidChatSessionError } = require('../services/coaching/claimPrescriptionFollowUp');
const {
  completeActivePrescription,
  loadActivePrescription,
  PrescriptionNotFoundError,
  PrescriptionMismatchError,
} = require('../services/coaching/completeActivePrescription');

const router = express.Router();
const prisma = new PrismaClient();

router.post('/claim-opener', authenticate, requireGuardianConsent, async (req, res) => {
  try {
    const { chatSessionId } = req.body;
    if (!chatSessionId || typeof chatSessionId !== 'string') {
      return res.status(400).json({ error: 'chatSessionId is required' });
    }

    const user = await prisma.user.findUnique({
      where: { id: req.userId },
      select: { language: true },
    });
    if (!user) return res.status(404).json({ error: 'User not found' });

    const result = await claimPrescriptionFollowUp({
      userId: req.userId,
      chatSessionId,
      language: user.language,
    });

    if (!result.claimed) return res.json({ claimed: false });

    res.json({
      claimed: true,
      message: {
        id: result.message.id,
        role: result.message.role,
        content: result.message.content,
        createdAt: result.message.createdAt,
      },
    });
  } catch (err) {
    if (err instanceof InvalidChatSessionError) {
      // Never reveal whether the session exists for another athlete — same
      // generic 404 the sessions routes already use for a foreign/missing id.
      return res.status(404).json({ error: 'Chat session not found' });
    }
    console.error('[prescriptions] claim-opener error:', err?.message);
    res.status(500).json({ error: 'Server error' });
  }
});

function serializePrescription(p) {
  return {
    id: p.id,
    practiceKey: p.practiceKey,
    status: p.status,
    completedAt: p.completedAt,
  };
}

// ── POST /:prescriptionId/complete — exact prescription completion (PR-12) ──
router.post('/:prescriptionId/complete', authenticate, requireGuardianConsent, async (req, res) => {
  try {
    const { practiceKey } = req.body;
    if (!practiceKey || typeof practiceKey !== 'string') {
      return res.status(400).json({ error: 'practiceKey is required' });
    }

    const result = await completeActivePrescription({
      userId: req.userId,
      prescriptionId: req.params.prescriptionId,
      practiceKey,
    });

    res.json({
      completed: result.completed,
      alreadyCompleted: result.alreadyCompleted,
      prescription: serializePrescription(result.prescription),
    });
  } catch (err) {
    if (err instanceof PrescriptionNotFoundError) {
      // Never reveal whether the id exists for another athlete.
      return res.status(404).json({ error: 'Prescription not found' });
    }
    if (err instanceof PrescriptionMismatchError) {
      return res.status(409).json({ error: 'Prescription cannot be completed' });
    }
    console.error('[prescriptions] complete error:', err?.message);
    res.status(500).json({ error: 'Server error' });
  }
});

// ── GET /active — the athlete's current selected Prescription, if any ──────
router.get('/active', authenticate, requireGuardianConsent, async (req, res) => {
  try {
    const prescription = await loadActivePrescription(req.userId);
    res.json({ prescription });
  } catch (err) {
    console.error('[prescriptions] active lookup error:', err?.message);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
