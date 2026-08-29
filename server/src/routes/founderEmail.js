const express = require('express');
const { PrismaClient } = require('@prisma/client');
const founderAuthenticate = require('../middleware/founderAuthenticate');
const { validateEmailContent, buildEmailHtml } = require('../services/founderEmail');
const { sendRawEmail } = require('../services/email');

// Founder Email Center v1 — founder-only surface for sending beta/product
// emails to pilot athletes, and reviewing what was sent.
//
// This is NOT a full inbox: no reply threading, no incoming-mail handling,
// no attachments, no search. Guarded exclusively by the short-lived founder
// session token (founderAuthenticate) — same as every other founder-only
// router; the legacy static FOUNDER_TOKEN used by routes/founder.js's
// /pulse is never accepted here.
//
// Reuses the EXISTING Resend integration (services/email.js's getResend()/
// FROM, via the new sendRawEmail() export) — no second email provider, and
// the Resend API key never leaves the server. Content only ever reads
// User.id/name/email — never Message, ChatSession, MindJournalEntry,
// SafetyEvent, or PilotCommunication data, and email engagement never
// feeds back into Coach or athlete scoring (there is no code path here
// that could — this file only writes FounderEmailCampaign/Delivery rows).
//
// No Resend webhook is added in this PR — Resend webhooks are not
// currently configured anywhere in this codebase (audited: no existing
// webhook route/verification to reuse), and building one is out of the
// narrow scope requested here. SENT/FAILED are recorded synchronously from
// the Resend API response; DELIVERED/BOUNCED/opened/clicked tracking needs
// a follow-up webhook PR (see FounderEmailDeliveryStatus's schema comment).
//
// `createFounderEmailRouter` is injectable for tests (same pattern as every
// other founder router); the default export always uses the real Prisma
// client.

// Founder's own test-send destination. Prefers a dedicated, explicit env
// var (so a test send is never accidentally aimed at the shared public
// contact-form inbox); falls back to CONTACT_TO_EMAIL, the closest existing
// configured "founder/support email" already in this codebase, if that's
// the only thing configured. Never a hard-coded address in source.
function getFounderTestEmail() {
  const value = process.env.FOUNDER_TEST_EMAIL || process.env.CONTACT_TO_EMAIL;
  return value && value.trim() ? value.trim() : null;
}

// Reply-To for every founder-sent email — the existing configured support
// inbox (same env var the public /contact form already delivers to), so a
// reply from an athlete lands somewhere the founder actually reads it.
// Omitted (Resend then defaults Reply-To to the From address) when unset,
// rather than guessing at a value.
function replyToAddress() {
  const value = process.env.CONTACT_TO_EMAIL;
  return value && value.trim() ? value.trim() : undefined;
}

// The one allowed personalization: the athlete's own first name, derived
// the same way sendWelcomeEmail already does (name.trim().split(' ')[0]).
// Never AI-written, never derived from Coach/Mind Journal/activity data.
function firstNameOf(name) {
  const first = (name || '').trim().split(/\s+/)[0];
  return first || null;
}

function serializeCampaign(c, stats = {}) {
  return {
    id: c.id,
    fromName: c.fromName,
    subject: c.subject,
    previewText: c.previewText,
    body: c.body,
    ctaLabel: c.ctaLabel,
    ctaRoute: c.ctaRoute,
    audienceMode: c.audienceMode,
    createdAt: c.createdAt,
    sentAt: c.sentAt,
    recipientCount: stats.recipientCount ?? 0,
    sentCount: stats.sentCount ?? 0,
    failedCount: stats.failedCount ?? 0,
    deliveredCount: stats.deliveredCount ?? 0,
    bouncedCount: stats.bouncedCount ?? 0,
  };
}

function createFounderEmailRouter(client = new PrismaClient()) {
  const router = express.Router();

  // GET /athletes — audience-picker identity. Same source as
  // founderPilotCommunications.js's own /athletes (the full User table —
  // there is no separate pilot-membership system), but unlike that
  // endpoint this ALSO returns the email address: the founder needs it to
  // confirm they're selecting the right person before sending real email.
  router.get('/athletes', founderAuthenticate, async (req, res) => {
    try {
      const users = await client.user.findMany({
        orderBy: { createdAt: 'desc' },
        select: { id: true, name: true, email: true, sport: true },
      });
      res.json({
        athletes: users.map((u) => ({ id: u.id, name: u.name, email: u.email, sport: u.sport || null })),
      });
    } catch (err) {
      console.error('[founder] email athletes error:', err?.message);
      res.status(500).json({ error: 'Server error' });
    }
  });

  // POST /test — sends the exact current draft to ONLY the founder's own
  // configured test address. Never touches a pilot athlete, never creates
  // a campaign/delivery row (stateless — same "no tracked row" convention
  // founderPushTest.js's test send already uses) and never requires
  // creating a Resend Audience/segment.
  router.post('/test', founderAuthenticate, async (req, res) => {
    const validation = validateEmailContent(req.body);
    if (!validation.ok) return res.status(400).json({ error: validation.error });

    const testEmail = getFounderTestEmail();
    if (!testEmail) return res.status(500).json({ error: 'Test send destination not configured' });

    try {
      const html = buildEmailHtml({ ...validation.data, firstName: null });
      const result = await sendRawEmail({
        to: testEmail,
        fromName: validation.data.fromName,
        subject: validation.data.subject,
        html,
        replyTo: replyToAddress(),
      });
      if (result?.error) return res.json({ result: 'failed' });
      res.json({ result: 'sent' });
    } catch (err) {
      console.error('[founder] email test-send error:', err?.message);
      res.json({ result: 'failed' });
    }
  });

  // POST /send — resolves the audience server-side (the browser only ever
  // supplies a mode + optional user ids — never a recipient email address
  // directly), then sends one INDIVIDUAL Resend call per athlete, never a
  // shared To/CC list, so no athlete's address is ever exposed to another.
  // Sequential, bounded by pilot scale — no queue, no Redis.
  router.post('/send', founderAuthenticate, async (req, res) => {
    const validation = validateEmailContent(req.body);
    if (!validation.ok) return res.status(400).json({ error: validation.error });

    const audience = req.body?.audience;
    if (!audience || (audience.mode !== 'ALL' && audience.mode !== 'SELECTED')) {
      return res.status(400).json({ error: 'Invalid audience' });
    }

    let recipients;
    try {
      if (audience.mode === 'ALL') {
        recipients = await client.user.findMany({ select: { id: true, name: true, email: true } });
      } else {
        if (!Array.isArray(audience.userIds) || audience.userIds.length === 0) {
          return res.status(400).json({ error: 'Select at least one athlete' });
        }
        const uniqueIds = Array.from(new Set(audience.userIds.filter((id) => typeof id === 'string' && id)));
        recipients = await client.user.findMany({
          where: { id: { in: uniqueIds } },
          select: { id: true, name: true, email: true },
        });
        if (recipients.length !== uniqueIds.length) {
          return res.status(400).json({ error: 'One or more selected athletes are invalid' });
        }
      }
    } catch (err) {
      console.error('[founder] email send (audience resolve) error:', err?.message);
      return res.status(500).json({ error: 'Server error' });
    }

    if (recipients.length === 0) {
      return res.status(400).json({ error: 'No recipients' });
    }

    try {
      const campaign = await client.founderEmailCampaign.create({
        data: { ...validation.data, audienceMode: audience.mode, sentAt: new Date() },
      });

      let sentCount = 0;
      let failedCount = 0;
      const replyTo = replyToAddress();

      for (const recipient of recipients) {
        const html = buildEmailHtml({ ...validation.data, firstName: firstNameOf(recipient.name) });
        let status = 'FAILED';
        let resendMessageId = null;
        try {
          const result = await sendRawEmail({
            to: recipient.email,
            fromName: validation.data.fromName,
            subject: validation.data.subject,
            html,
            replyTo,
          });
          if (!result?.error) {
            status = 'SENT';
            resendMessageId = result?.data?.id || null;
          }
        } catch (err) {
          console.error('[founder] email send (per-athlete) error:', err?.message);
        }

        const now = new Date();
        await client.founderEmailDelivery.create({
          data: {
            campaignId: campaign.id,
            userId: recipient.id,
            email: recipient.email,
            resendMessageId,
            status,
            sentAt: status === 'SENT' ? now : null,
            failedAt: status === 'FAILED' ? now : null,
          },
        });
        if (status === 'SENT') sentCount += 1;
        else failedCount += 1;
      }

      res.status(201).json({
        campaign: serializeCampaign(campaign, { recipientCount: recipients.length, sentCount, failedCount }),
      });
    } catch (err) {
      console.error('[founder] email send error:', err?.message);
      res.status(500).json({ error: 'Server error' });
    }
  });

  // GET / — sent history with server-aggregated delivery counts. Declared
  // after /athletes, /test, /send so none of those literal segments is ever
  // swallowed by /:id below (same literal-before-param convention used
  // throughout the founder routers).
  router.get('/', founderAuthenticate, async (req, res) => {
    try {
      const campaigns = await client.founderEmailCampaign.findMany({ orderBy: { createdAt: 'desc' } });
      const ids = campaigns.map((c) => c.id);
      const deliveries = await client.founderEmailDelivery.findMany({
        where: { campaignId: { in: ids } },
        select: { campaignId: true, status: true },
      });

      const stats = {};
      for (const d of deliveries) {
        const s = (stats[d.campaignId] ||= { recipientCount: 0, sentCount: 0, failedCount: 0, deliveredCount: 0, bouncedCount: 0 });
        s.recipientCount += 1;
        if (d.status === 'SENT') s.sentCount += 1;
        else if (d.status === 'FAILED') s.failedCount += 1;
        else if (d.status === 'DELIVERED') s.deliveredCount += 1;
        else if (d.status === 'BOUNCED') s.bouncedCount += 1;
      }

      res.json({ campaigns: campaigns.map((c) => serializeCampaign(c, stats[c.id])) });
    } catch (err) {
      console.error('[founder] email list error:', err?.message);
      res.status(500).json({ error: 'Server error' });
    }
  });

  // GET /:id — per-recipient delivery detail. Founder-only view; showing
  // every recipient's address here is not the "no athlete sees another
  // athlete's address" leak this PR guards against — that rule is about
  // what athletes receive, and no athlete ever reaches this endpoint.
  router.get('/:id', founderAuthenticate, async (req, res) => {
    try {
      const campaign = await client.founderEmailCampaign.findUnique({ where: { id: req.params.id } });
      if (!campaign) return res.status(404).json({ error: 'Not found' });

      const deliveries = await client.founderEmailDelivery.findMany({
        where: { campaignId: campaign.id },
        include: { user: { select: { id: true, name: true } } },
        orderBy: { createdAt: 'asc' },
      });

      const stats = { recipientCount: deliveries.length, sentCount: 0, failedCount: 0, deliveredCount: 0, bouncedCount: 0 };
      for (const d of deliveries) {
        if (d.status === 'SENT') stats.sentCount += 1;
        else if (d.status === 'FAILED') stats.failedCount += 1;
        else if (d.status === 'DELIVERED') stats.deliveredCount += 1;
        else if (d.status === 'BOUNCED') stats.bouncedCount += 1;
      }

      res.json({
        campaign: serializeCampaign(campaign, stats),
        deliveries: deliveries.map((d) => ({
          userId: d.userId,
          name: d.user?.name || null,
          email: d.email,
          status: d.status,
          sentAt: d.sentAt,
          deliveredAt: d.deliveredAt,
          bouncedAt: d.bouncedAt,
          failedAt: d.failedAt,
          resendMessageId: d.resendMessageId,
        })),
      });
    } catch (err) {
      console.error('[founder] email detail error:', err?.message);
      res.status(500).json({ error: 'Server error' });
    }
  });

  return router;
}

module.exports = createFounderEmailRouter();
module.exports.createFounderEmailRouter = createFounderEmailRouter;
