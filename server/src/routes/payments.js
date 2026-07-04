const express = require('express');
const crypto  = require('crypto');
const Razorpay = require('razorpay');
const { PrismaClient } = require('@prisma/client');
const authenticate = require('../middleware/authenticate');

const router = express.Router();
const prisma = new PrismaClient();

// ── POST /api/payments/webhook ─────────────────────────────────────────────
// Receives Razorpay webhook events. req.body is a raw Buffer (set by
// express.raw() registered in index.js before express.json()).
// Always returns 200 — Razorpay retries if it gets anything else.

router.post('/webhook', async (req, res) => {
  try {
    const sig = req.headers['x-razorpay-signature'];
    const expectedSig = crypto
      .createHmac('sha256', process.env.RAZORPAY_WEBHOOK_SECRET)
      .update(req.body)
      .digest('hex');

    if (!sig || sig !== expectedSig) {
      console.error('[PAYMENT] Webhook signature mismatch');
      return res.status(400).json({ error: 'Invalid signature' });
    }

    const payload  = JSON.parse(req.body.toString());
    const event    = payload.event;
    const subEntity = payload.payload?.subscription?.entity;
    const userId   = subEntity?.notes?.userId;

    // Idempotency: Razorpay retries deliver the same x-razorpay-event-id.
    // Record it first — a unique violation means we already processed this event.
    const eventId = req.headers['x-razorpay-event-id'];
    if (eventId) {
      try {
        await prisma.processedWebhookEvent.create({
          data: { eventId, eventType: event ?? null },
        });
      } catch (dupErr) {
        if (dupErr?.code === 'P2002') {
          console.log(`[PAYMENT] Duplicate webhook event ${eventId} ignored`);
          return res.status(200).json({ received: true, duplicate: true });
        }
        // Dedup table hiccup — log and continue; processing twice is the
        // pre-existing behavior, dropping a real event would be worse.
        console.error('[PAYMENT] Webhook dedup write failed (continuing):', dupErr?.message);
      }
    }

    if (event === 'subscription.activated') {
      if (userId) {
        await prisma.user.update({
          where: { id: userId },
          data: {
            tier:                   'premium',
            razorpaySubscriptionId: subEntity.id,
            subscriptionPlanType:   subEntity.notes?.planType ?? null,
            subscriptionStartDate:  new Date(),
            subscriptionEndDate:    null,
          },
        });
        console.log(`[PAYMENT] User ${userId} upgraded to premium`);
      }

    } else if (event === 'subscription.charged') {
      if (userId) {
        await prisma.user.update({
          where: { id: userId },
          data: { subscriptionStartDate: new Date() },
        });
        console.log(`[PAYMENT] User ${userId} subscription renewed`);
      }

    } else if (event === 'subscription.cancelled') {
      if (userId) {
        await prisma.user.update({
          where: { id: userId },
          data: {
            tier:                   'free',
            razorpaySubscriptionId: null,
            subscriptionEndDate:    new Date(),
          },
        });
        console.log(`[PAYMENT] User ${userId} subscription cancelled`);
      }

    } else if (event === 'subscription.halted') {
      // Payment failed — Razorpay retries automatically. Do NOT downgrade tier.
      console.log(`[PAYMENT] User ${userId ?? 'unknown'} subscription halted (payment failure, Razorpay will retry)`);
    }

  } catch (err) {
    console.error('[PAYMENT] Webhook handler error:', err.message);
  }

  // Always 200 — prevents Razorpay from retrying for unknown event types
  res.status(200).json({ received: true });
});

// ── POST /api/payments/create-subscription ─────────────────────────────────

router.post('/create-subscription', authenticate, async (req, res) => {
  try {
    const { planType } = req.body;

    if (!['monthly', 'yearly'].includes(planType)) {
      return res.status(400).json({ error: 'Invalid plan type' });
    }

    const planId = planType === 'monthly'
      ? process.env.RAZORPAY_PLAN_MONTHLY
      : process.env.RAZORPAY_PLAN_YEARLY;

    if (!planId) {
      console.error(`[PAYMENT] Missing plan ID env var for planType=${planType}`);
      return res.status(500).json({ error: 'Payment configuration error. Please try again.' });
    }

    const razorpay = new Razorpay({
      key_id:     process.env.RAZORPAY_KEY_ID,
      key_secret: process.env.RAZORPAY_KEY_SECRET,
    });

    const subscription = await razorpay.subscriptions.create({
      plan_id:         planId,
      customer_notify: 1,
      total_count:     planType === 'yearly' ? 12 : 120,
      notes:           { userId: req.userId, planType },
    });

    res.json({ subscriptionId: subscription.id });
  } catch (err) {
    console.error('[PAYMENT] Create subscription error:', err.message);
    res.status(500).json({ error: 'Failed to create subscription. Please try again.' });
  }
});

// ── GET /api/payments/status ───────────────────────────────────────────────

router.get('/status', authenticate, async (req, res) => {
  try {
    const user = await prisma.user.findUnique({
      where:  { id: req.userId },
      select: {
        tier:                   true,
        subscriptionPlanType:   true,
        subscriptionStartDate:  true,
        razorpaySubscriptionId: true,
      },
    });
    res.json(user);
  } catch (err) {
    console.error('[PAYMENT] Status error:', err.message);
    res.status(500).json({ error: 'Server error' });
  }
});

// ── POST /api/payments/cancel ──────────────────────────────────────────────

router.post('/cancel', authenticate, async (req, res) => {
  try {
    const user = await prisma.user.findUnique({
      where:  { id: req.userId },
      select: { razorpaySubscriptionId: true },
    });

    if (!user?.razorpaySubscriptionId) {
      return res.status(400).json({ error: 'No active subscription found' });
    }

    const razorpay = new Razorpay({
      key_id:     process.env.RAZORPAY_KEY_ID,
      key_secret: process.env.RAZORPAY_KEY_SECRET,
    });

    await razorpay.subscriptions.cancel(user.razorpaySubscriptionId, { cancel_at_cycle_end: true });

    res.json({ success: true, message: 'Subscription will end at period end' });
  } catch (err) {
    console.error('[PAYMENT] Cancel error:', err.message);
    res.status(500).json({ error: 'Failed to cancel subscription. Please try again.' });
  }
});

module.exports = router;
