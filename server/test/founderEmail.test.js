// Founder Email Center v1 — founder surface (routes/founderEmail.js). Real
// HTTP requests against an isolated express app, a real founder session
// JWT through the real founderAuthenticate middleware, an injected
// in-memory Prisma-like client, and the 'resend' package replaced in the
// require cache with a controllable fake (same techniques as
// founderPushTest.test.js and welcomeEmail.test.js respectively) — no real
// database, no real network, no real email is ever sent by this file.

const test = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const jwt = require('jsonwebtoken');
const express = require('express');

const resendPath = require.resolve('resend');
let sendBehavior = {}; // email -> 'success' | 'error' | 'throw'
let sentEmails = [];

class FakeResend {
  constructor(apiKey) { this.apiKey = apiKey; }
  get emails() {
    return {
      send: async (payload) => {
        sentEmails.push(payload);
        const behavior = sendBehavior[payload.to] ?? 'success';
        if (behavior === 'throw') throw new Error('network down');
        if (behavior === 'error') return { data: null, error: { message: 'Resend rejected it' } };
        return { data: { id: `msg-${sentEmails.length}` }, error: null };
      },
    };
  }
}

require.cache[resendPath] = {
  id: resendPath,
  filename: resendPath,
  loaded: true,
  exports: { Resend: FakeResend },
};

process.env.RESEND_API_KEY = 'test-key';
process.env.RESEND_FROM_EMAIL = 'noreply@example.test';
process.env.CLIENT_URL = 'https://arjun.test';
process.env.CONTACT_TO_EMAIL = 'support@example.test';
process.env.FOUNDER_TEST_EMAIL = 'founder-test@example.test';

const emailServicePath = require.resolve('../src/services/email');
const founderEmailRoutePath = require.resolve('../src/routes/founderEmail');
delete require.cache[emailServicePath];
delete require.cache[founderEmailRoutePath];
const { createFounderEmailRouter } = require(founderEmailRoutePath);

const TEST_SECRET = 'founder-email-test-secret';
const ORIGINAL_SECRET = process.env.FOUNDER_SESSION_SECRET;
test.before(() => { process.env.FOUNDER_SESSION_SECRET = TEST_SECRET; });
test.after(() => {
  if (ORIGINAL_SECRET === undefined) delete process.env.FOUNDER_SESSION_SECRET;
  else process.env.FOUNDER_SESSION_SECRET = ORIGINAL_SECRET;
});

function founderToken() {
  return jwt.sign({ role: 'founder' }, TEST_SECRET, { expiresIn: '15m' });
}
function authed() {
  return { Authorization: `Bearer ${founderToken()}`, 'Content-Type': 'application/json' };
}

test.beforeEach(() => {
  sendBehavior = {};
  sentEmails = [];
});

// ── In-memory fake Prisma client ─────────────────────────────────────────

function makeFakeClient({ users = [] } = {}) {
  const storedUsers = users.map((u) => ({ ...u }));
  const campaigns = [];
  const deliveries = [];
  let seq = 0;
  const nextId = (prefix) => `${prefix}${++seq}`;

  return {
    user: {
      findMany: async ({ where, select } = {}) => {
        let list = storedUsers;
        if (where?.id?.in) list = list.filter((u) => where.id.in.includes(u.id));
        return list.map((u) => {
          if (!select) return { ...u };
          const row = {};
          for (const k of Object.keys(select)) if (select[k]) row[k] = u[k];
          return row;
        });
      },
    },
    founderEmailCampaign: {
      create: async ({ data }) => {
        const row = { id: nextId('camp'), createdAt: new Date(), ...data };
        campaigns.push(row);
        return { ...row };
      },
      findMany: async ({ orderBy } = {}) => {
        let list = campaigns;
        if (orderBy?.createdAt === 'desc') list = [...list].sort((a, b) => b.createdAt - a.createdAt);
        return list.map((c) => ({ ...c }));
      },
      findUnique: async ({ where: { id } }) => {
        const row = campaigns.find((c) => c.id === id);
        return row ? { ...row } : null;
      },
    },
    founderEmailDelivery: {
      create: async ({ data }) => {
        const row = { id: nextId('deliv'), createdAt: new Date(), ...data };
        deliveries.push(row);
        return { ...row };
      },
      findMany: async ({ where, orderBy } = {}) => {
        let list = deliveries;
        if (where?.campaignId?.in) list = list.filter((d) => where.campaignId.in.includes(d.campaignId));
        else if (where?.campaignId) list = list.filter((d) => d.campaignId === where.campaignId);
        if (orderBy?.createdAt === 'asc') list = [...list].sort((a, b) => a.createdAt - b.createdAt);
        return list.map((d) => {
          const row = { ...d };
          const u = storedUsers.find((uu) => uu.id === d.userId);
          row.user = u ? { id: u.id, name: u.name } : null;
          return row;
        });
      },
    },
    __campaigns: campaigns,
    __deliveries: deliveries,
  };
}

function buildApp(client) {
  const app = express();
  app.use(express.json());
  app.use('/api/founder/email', createFounderEmailRouter(client));
  return app;
}
function start(app) {
  return new Promise((resolve) => {
    const server = app.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      resolve({ server, baseUrl: `http://127.0.0.1:${port}` });
    });
  });
}
function stop(server) {
  return new Promise((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));
}
async function withApp(client, fn) {
  const app = buildApp(client);
  const { server, baseUrl } = await start(app);
  try {
    await fn(baseUrl, client);
  } finally {
    await stop(server);
  }
}

function threeAthletes() {
  return [
    { id: 'u1', name: 'Aarav Sharma', email: 'aarav@example.test', sport: 'cricket', createdAt: new Date('2026-06-01') },
    { id: 'u2', name: 'Bhavna Rao', email: 'bhavna@example.test', sport: 'badminton', createdAt: new Date('2026-06-02') },
    { id: 'u3', name: 'Chirag Patel', email: 'chirag@example.test', sport: 'football', createdAt: new Date('2026-06-03') },
  ];
}

function draft(overrides = {}) {
  return {
    fromName: 'Arjun',
    subject: 'A quick check-in',
    body: 'Hope training is going well this week.',
    ...overrides,
  };
}

// ── Founder auth required on every endpoint ──────────────────────────────

test('every founder email endpoint requires the founder session token', async () => {
  const client = makeFakeClient({ users: threeAthletes() });
  await withApp(client, async (baseUrl) => {
    const calls = [
      ['GET', '/athletes'],
      ['POST', '/test'],
      ['POST', '/send'],
      ['GET', '/'],
      ['GET', '/x'],
    ];
    for (const [method, path] of calls) {
      const res = await fetch(`${baseUrl}/api/founder/email${path}`, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: method === 'GET' ? undefined : JSON.stringify(draft()),
      });
      assert.equal(res.status, 401, `${method} ${path} should require the founder session`);
    }
    assert.equal(sentEmails.length, 0);
  });
});

test('the legacy static FOUNDER_TOKEN is never accepted here', async () => {
  const client = makeFakeClient({ users: threeAthletes() });
  await withApp(client, async (baseUrl) => {
    const res = await fetch(`${baseUrl}/api/founder/email/`, {
      headers: { Authorization: 'Bearer some-legacy-static-token' },
    });
    assert.equal(res.status, 401);
  });
});

// ── GET /athletes ──────────────────────────────────────────────────────────

test('GET /athletes returns id/name/email/sport for every athlete — the same source as Pilot Overview/Communications', async () => {
  const client = makeFakeClient({ users: threeAthletes() });
  await withApp(client, async (baseUrl) => {
    const res = await fetch(`${baseUrl}/api/founder/email/athletes`, { headers: authed() });
    assert.equal(res.status, 200);
    const { athletes } = await res.json();
    assert.equal(athletes.length, 3);
    assert.deepEqual(athletes.find((a) => a.id === 'u1'), { id: 'u1', name: 'Aarav Sharma', email: 'aarav@example.test', sport: 'cricket' });
  });
});

// ── POST /test ─────────────────────────────────────────────────────────────

test('test send goes only to the configured founder test email, never a pilot athlete', async () => {
  const client = makeFakeClient({ users: threeAthletes() });
  await withApp(client, async (baseUrl) => {
    const res = await fetch(`${baseUrl}/api/founder/email/test`, { method: 'POST', headers: authed(), body: JSON.stringify(draft()) });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.result, 'sent');
    assert.equal(sentEmails.length, 1);
    assert.equal(sentEmails[0].to, 'founder-test@example.test');
    for (const a of threeAthletes()) assert.notEqual(sentEmails[0].to, a.email);
  });
});

test('test send never creates a campaign or delivery row — it is stateless', async () => {
  const client = makeFakeClient({ users: threeAthletes() });
  await withApp(client, async (baseUrl) => {
    await fetch(`${baseUrl}/api/founder/email/test`, { method: 'POST', headers: authed(), body: JSON.stringify(draft()) });
    assert.equal(client.__campaigns.length, 0);
    assert.equal(client.__deliveries.length, 0);
  });
});

test('test send never requires an audience — the request body carries no audience field at all', async () => {
  const client = makeFakeClient({ users: threeAthletes() });
  await withApp(client, async (baseUrl) => {
    const res = await fetch(`${baseUrl}/api/founder/email/test`, { method: 'POST', headers: authed(), body: JSON.stringify(draft()) });
    assert.equal(res.status, 200);
  });
});

test('test send reports "failed" (not a 500) when Resend rejects the send', async () => {
  sendBehavior['founder-test@example.test'] = 'error';
  const client = makeFakeClient({ users: threeAthletes() });
  await withApp(client, async (baseUrl) => {
    const res = await fetch(`${baseUrl}/api/founder/email/test`, { method: 'POST', headers: authed(), body: JSON.stringify(draft()) });
    assert.equal(res.status, 200);
    assert.equal((await res.json()).result, 'failed');
  });
});

test('test send rejects an invalid draft (e.g. empty subject) before ever calling Resend', async () => {
  const client = makeFakeClient({ users: threeAthletes() });
  await withApp(client, async (baseUrl) => {
    const res = await fetch(`${baseUrl}/api/founder/email/test`, { method: 'POST', headers: authed(), body: JSON.stringify(draft({ subject: '' })) });
    assert.equal(res.status, 400);
    assert.equal(sentEmails.length, 0);
  });
});

test('test send rejects a CTA route outside the allowlist', async () => {
  const client = makeFakeClient({ users: threeAthletes() });
  await withApp(client, async (baseUrl) => {
    const res = await fetch(`${baseUrl}/api/founder/email/test`, {
      method: 'POST', headers: authed(),
      body: JSON.stringify(draft({ ctaRoute: 'https://evil.example.com', ctaLabel: 'Click' })),
    });
    assert.equal(res.status, 400);
    assert.equal(sentEmails.length, 0);
  });
});

test('with FOUNDER_TEST_EMAIL unset, falls back to CONTACT_TO_EMAIL', async () => {
  delete process.env.FOUNDER_TEST_EMAIL;
  try {
    const client = makeFakeClient({ users: threeAthletes() });
    await withApp(client, async (baseUrl) => {
      const res = await fetch(`${baseUrl}/api/founder/email/test`, { method: 'POST', headers: authed(), body: JSON.stringify(draft()) });
      assert.equal(res.status, 200);
      assert.equal(sentEmails[0].to, 'support@example.test');
    });
  } finally {
    process.env.FOUNDER_TEST_EMAIL = 'founder-test@example.test';
  }
});

test('with neither FOUNDER_TEST_EMAIL nor CONTACT_TO_EMAIL configured, test send fails with a clear config error and sends nothing', async () => {
  delete process.env.FOUNDER_TEST_EMAIL;
  const originalContact = process.env.CONTACT_TO_EMAIL;
  delete process.env.CONTACT_TO_EMAIL;
  try {
    const client = makeFakeClient({ users: threeAthletes() });
    await withApp(client, async (baseUrl) => {
      const res = await fetch(`${baseUrl}/api/founder/email/test`, { method: 'POST', headers: authed(), body: JSON.stringify(draft()) });
      assert.equal(res.status, 500);
      assert.equal(sentEmails.length, 0);
    });
  } finally {
    process.env.FOUNDER_TEST_EMAIL = 'founder-test@example.test';
    process.env.CONTACT_TO_EMAIL = originalContact;
  }
});

// ── POST /send — audience resolution ──────────────────────────────────────

test('SELECTED audience resolves ids to emails server-side and sends one individual email per athlete', async () => {
  const client = makeFakeClient({ users: threeAthletes() });
  await withApp(client, async (baseUrl) => {
    const res = await fetch(`${baseUrl}/api/founder/email/send`, {
      method: 'POST', headers: authed(),
      body: JSON.stringify({ ...draft(), audience: { mode: 'SELECTED', userIds: ['u1', 'u2'] } }),
    });
    assert.equal(res.status, 201);
    assert.equal(sentEmails.length, 2);
    const tos = sentEmails.map((e) => e.to).sort();
    assert.deepEqual(tos, ['aarav@example.test', 'bhavna@example.test']);
  });
});

test('no athlete email ever appears in another recipient\'s To/CC — every send is individual', async () => {
  const client = makeFakeClient({ users: threeAthletes() });
  await withApp(client, async (baseUrl) => {
    await fetch(`${baseUrl}/api/founder/email/send`, {
      method: 'POST', headers: authed(),
      body: JSON.stringify({ ...draft(), audience: { mode: 'ALL' } }),
    });
    assert.equal(sentEmails.length, 3);
    for (const e of sentEmails) {
      assert.equal(typeof e.to, 'string'); // a single address, never an array
      assert.equal(e.cc, undefined);
      assert.equal(e.bcc, undefined);
    }
  });
});

test('ALL audience snapshots the current user list at send time', async () => {
  const client = makeFakeClient({ users: threeAthletes() });
  await withApp(client, async (baseUrl) => {
    const res = await fetch(`${baseUrl}/api/founder/email/send`, {
      method: 'POST', headers: authed(),
      body: JSON.stringify({ ...draft(), audience: { mode: 'ALL' } }),
    });
    assert.equal(res.status, 201);
    const { campaign } = await res.json();
    assert.equal(campaign.audienceMode, 'ALL');
    assert.equal(campaign.recipientCount, 3);
    assert.equal(client.__deliveries.length, 3);
  });
});

test('an invalid/nonexistent user id in a SELECTED audience is rejected — nothing is sent', async () => {
  const client = makeFakeClient({ users: threeAthletes() });
  await withApp(client, async (baseUrl) => {
    const res = await fetch(`${baseUrl}/api/founder/email/send`, {
      method: 'POST', headers: authed(),
      body: JSON.stringify({ ...draft(), audience: { mode: 'SELECTED', userIds: ['u1', 'ghost'] } }),
    });
    assert.equal(res.status, 400);
    assert.equal(sentEmails.length, 0);
    assert.equal(client.__campaigns.length, 0);
  });
});

test('an empty SELECTED userIds array is rejected', async () => {
  const client = makeFakeClient({ users: threeAthletes() });
  await withApp(client, async (baseUrl) => {
    const res = await fetch(`${baseUrl}/api/founder/email/send`, {
      method: 'POST', headers: authed(),
      body: JSON.stringify({ ...draft(), audience: { mode: 'SELECTED', userIds: [] } }),
    });
    assert.equal(res.status, 400);
  });
});

test('an invalid/missing audience is rejected', async () => {
  const client = makeFakeClient({ users: threeAthletes() });
  await withApp(client, async (baseUrl) => {
    const res1 = await fetch(`${baseUrl}/api/founder/email/send`, { method: 'POST', headers: authed(), body: JSON.stringify(draft()) });
    assert.equal(res1.status, 400);
    const res2 = await fetch(`${baseUrl}/api/founder/email/send`, {
      method: 'POST', headers: authed(),
      body: JSON.stringify({ ...draft(), audience: { mode: 'EVERYONE_EVER' } }),
    });
    assert.equal(res2.status, 400);
  });
});

test('the browser can never supply a raw recipient email address — only a userId/mode is accepted, and it is ignored if sent', async () => {
  const client = makeFakeClient({ users: threeAthletes() });
  await withApp(client, async (baseUrl) => {
    await fetch(`${baseUrl}/api/founder/email/send`, {
      method: 'POST', headers: authed(),
      body: JSON.stringify({ ...draft(), audience: { mode: 'SELECTED', userIds: ['u1'], email: 'attacker@evil.example.com' } }),
    });
    assert.equal(sentEmails.length, 1);
    assert.equal(sentEmails[0].to, 'aarav@example.test');
  });
});

test('an invalid CTA route on /send is rejected before any audience is resolved or any email sent', async () => {
  const client = makeFakeClient({ users: threeAthletes() });
  await withApp(client, async (baseUrl) => {
    const res = await fetch(`${baseUrl}/api/founder/email/send`, {
      method: 'POST', headers: authed(),
      body: JSON.stringify({ ...draft({ ctaRoute: '/not-real', ctaLabel: 'Go' }), audience: { mode: 'ALL' } }),
    });
    assert.equal(res.status, 400);
    assert.equal(sentEmails.length, 0);
  });
});

test('subject/body validation applies on /send exactly as it does on /test', async () => {
  const client = makeFakeClient({ users: threeAthletes() });
  await withApp(client, async (baseUrl) => {
    const res = await fetch(`${baseUrl}/api/founder/email/send`, {
      method: 'POST', headers: authed(),
      body: JSON.stringify({ ...draft({ body: '' }), audience: { mode: 'ALL' } }),
    });
    assert.equal(res.status, 400);
  });
});

// ── POST /send — delivery outcomes recorded ───────────────────────────────

test('a successful Resend send is recorded as SENT with the returned message id', async () => {
  const client = makeFakeClient({ users: threeAthletes() });
  await withApp(client, async (baseUrl) => {
    await fetch(`${baseUrl}/api/founder/email/send`, {
      method: 'POST', headers: authed(),
      body: JSON.stringify({ ...draft(), audience: { mode: 'SELECTED', userIds: ['u1'] } }),
    });
    const d = client.__deliveries[0];
    assert.equal(d.status, 'SENT');
    assert.ok(d.resendMessageId);
    assert.ok(d.sentAt instanceof Date);
    assert.equal(d.failedAt, null);
  });
});

test('a Resend-reported error is recorded as FAILED, and other recipients still get their emails', async () => {
  sendBehavior['bhavna@example.test'] = 'error';
  const client = makeFakeClient({ users: threeAthletes() });
  await withApp(client, async (baseUrl) => {
    const res = await fetch(`${baseUrl}/api/founder/email/send`, {
      method: 'POST', headers: authed(),
      body: JSON.stringify({ ...draft(), audience: { mode: 'SELECTED', userIds: ['u1', 'u2'] } }),
    });
    assert.equal(res.status, 201);
    const { campaign } = await res.json();
    assert.equal(campaign.sentCount, 1);
    assert.equal(campaign.failedCount, 1);
    const failedDelivery = client.__deliveries.find((d) => d.email === 'bhavna@example.test');
    assert.equal(failedDelivery.status, 'FAILED');
    assert.equal(failedDelivery.resendMessageId, null);
    assert.ok(failedDelivery.failedAt instanceof Date);
  });
});

test('a thrown network error for one recipient is also recorded as FAILED, not a 500 for the whole send', async () => {
  sendBehavior['chirag@example.test'] = 'throw';
  const client = makeFakeClient({ users: threeAthletes() });
  await withApp(client, async (baseUrl) => {
    const res = await fetch(`${baseUrl}/api/founder/email/send`, {
      method: 'POST', headers: authed(),
      body: JSON.stringify({ ...draft(), audience: { mode: 'ALL' } }),
    });
    assert.equal(res.status, 201);
    const { campaign } = await res.json();
    assert.equal(campaign.sentCount, 2);
    assert.equal(campaign.failedCount, 1);
  });
});

// ── GET / and GET /:id — history ──────────────────────────────────────────

test('GET / lists campaigns newest first with aggregated delivery counts', async () => {
  sendBehavior['bhavna@example.test'] = 'error';
  const client = makeFakeClient({ users: threeAthletes() });
  await withApp(client, async (baseUrl) => {
    await fetch(`${baseUrl}/api/founder/email/send`, {
      method: 'POST', headers: authed(),
      body: JSON.stringify({ ...draft({ subject: 'First campaign' }), audience: { mode: 'SELECTED', userIds: ['u1', 'u2'] } }),
    });
    const listRes = await fetch(`${baseUrl}/api/founder/email`, { headers: authed() });
    assert.equal(listRes.status, 200);
    const { campaigns } = await listRes.json();
    assert.equal(campaigns.length, 1);
    assert.equal(campaigns[0].subject, 'First campaign');
    assert.equal(campaigns[0].recipientCount, 2);
    assert.equal(campaigns[0].sentCount, 1);
    assert.equal(campaigns[0].failedCount, 1);
    assert.equal(campaigns[0].deliveredCount, 0);
    assert.equal(campaigns[0].bouncedCount, 0);
  });
});

test('GET /:id returns per-recipient detail: name, email, status, sentAt, message id', async () => {
  const client = makeFakeClient({ users: threeAthletes() });
  await withApp(client, async (baseUrl) => {
    const sendRes = await fetch(`${baseUrl}/api/founder/email/send`, {
      method: 'POST', headers: authed(),
      body: JSON.stringify({ ...draft(), audience: { mode: 'SELECTED', userIds: ['u1'] } }),
    });
    const { campaign } = await sendRes.json();
    const detailRes = await fetch(`${baseUrl}/api/founder/email/${campaign.id}`, { headers: authed() });
    assert.equal(detailRes.status, 200);
    const { deliveries } = await detailRes.json();
    assert.equal(deliveries.length, 1);
    assert.equal(deliveries[0].name, 'Aarav Sharma');
    assert.equal(deliveries[0].email, 'aarav@example.test');
    assert.equal(deliveries[0].status, 'SENT');
    assert.ok(deliveries[0].resendMessageId);
  });
});

test('GET /:id 404s for an unknown campaign', async () => {
  const client = makeFakeClient({ users: threeAthletes() });
  await withApp(client, async (baseUrl) => {
    const res = await fetch(`${baseUrl}/api/founder/email/ghost`, { headers: authed() });
    assert.equal(res.status, 404);
  });
});

// ── Personalization ────────────────────────────────────────────────────────

test('each athlete is greeted with their own first name, derived server-side from their stored name', async () => {
  const client = makeFakeClient({ users: threeAthletes() });
  await withApp(client, async (baseUrl) => {
    await fetch(`${baseUrl}/api/founder/email/send`, {
      method: 'POST', headers: authed(),
      body: JSON.stringify({ ...draft(), audience: { mode: 'SELECTED', userIds: ['u1', 'u2'] } }),
    });
    const aaravEmail = sentEmails.find((e) => e.to === 'aarav@example.test');
    const bhavnaEmail = sentEmails.find((e) => e.to === 'bhavna@example.test');
    assert.match(aaravEmail.html, /Hi Aarav,/);
    assert.match(bhavnaEmail.html, /Hi Bhavna,/);
  });
});

// ── No Coach / Mind Journal / Pilot Communication coupling ────────────────

test('never creates, reads, or references a PilotCommunication/Message/MindJournalEntry row — the fake client has no such model and nothing throws', async () => {
  const client = makeFakeClient({ users: threeAthletes() });
  await withApp(client, async (baseUrl) => {
    const res = await fetch(`${baseUrl}/api/founder/email/send`, {
      method: 'POST', headers: authed(),
      body: JSON.stringify({ ...draft(), audience: { mode: 'ALL' } }),
    });
    assert.equal(res.status, 201);
  });
});

function stripComments(source) {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .filter((l) => !l.trim().startsWith('//'))
    .join('\n');
}

test('source: routes/founderEmail.js never references Message, ChatSession, MindJournalEntry, SafetyEvent, or PilotCommunication content', () => {
  const code = stripComments(readFileSync(founderEmailRoutePath, 'utf8'));
  assert.doesNotMatch(code, /client\.(message|chatSession|mindJournalEntry|safetyEvent|pilotCommunication)/i);
});

test('source: routes/founderEmail.js never references a Resend webhook (no webhook subsystem was added)', () => {
  const code = stripComments(readFileSync(founderEmailRoutePath, 'utf8'));
  assert.doesNotMatch(code, /webhook/i);
});
