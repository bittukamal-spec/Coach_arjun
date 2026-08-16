// Focused tests for the public POST /api/contact endpoint. Email delivery
// is always mocked — these tests never send a real email. Each rate-limit-
// sensitive test gets a fresh router instance (require-cache cleared, same
// technique as founderAuth.test.js) so limiter state never leaks between
// tests.

const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');

const emailService = require('../src/services/email');

function freshContactRouter() {
  const rateLimitsPath = require.resolve('../src/middleware/rateLimits');
  const contactPath = require.resolve('../src/routes/contact');
  delete require.cache[rateLimitsPath];
  delete require.cache[contactPath];
  return require('../src/routes/contact');
}

function startApp(router) {
  const app = express();
  app.use(express.json());
  app.use('/api/contact', router);
  return new Promise((resolve) => {
    const server = app.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      resolve({ server, baseUrl: `http://127.0.0.1:${port}/api/contact` });
    });
  });
}

function stopApp(server) {
  return new Promise((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));
}

function mockSendContactEmail(impl) {
  const original = emailService.sendContactEmail;
  emailService.sendContactEmail = impl;
  return () => { emailService.sendContactEmail = original; };
}

const VALID_BODY = {
  name: 'Aarav Singh',
  email: 'aarav@example.com',
  reason: 'technical',
  message: 'The app crashes when I open the chat screen on Android.',
};

async function post(baseUrl, body) {
  const res = await fetch(baseUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return { res, data: await res.json() };
}

// ── 1-2. Happy path ─────────────────────────────────────────────────────────

test('valid submission is accepted and the email helper is invoked exactly once', async () => {
  const calls = [];
  const restore = mockSendContactEmail(async (args) => { calls.push(args); });
  const { server, baseUrl } = await startApp(freshContactRouter());
  try {
    const { res, data } = await post(baseUrl, VALID_BODY);
    assert.equal(res.status, 200);
    assert.equal(data.success, true);
    assert.equal(calls.length, 1);
    assert.equal(calls[0].name, 'Aarav Singh');
    assert.equal(calls[0].email, 'aarav@example.com');
    assert.equal(calls[0].reason, 'technical');
    assert.equal(calls[0].reasonLabel, 'Technical issue');
    assert.equal(calls[0].message, VALID_BODY.message);
  } finally {
    restore();
    await stopApp(server);
  }
});

// ── 3. Strict reason enum ────────────────────────────────────────────────────

test('every approved reason is accepted', async () => {
  const restore = mockSendContactEmail(async () => {});
  const { server, baseUrl } = await startApp(freshContactRouter());
  try {
    for (const reason of ['general', 'technical', 'billing', 'safety', 'partnership']) {
      const { res, data } = await post(baseUrl, { ...VALID_BODY, reason });
      assert.equal(res.status, 200, `reason "${reason}" should be accepted`);
      assert.equal(data.success, true);
    }
  } finally {
    restore();
    await stopApp(server);
  }
});

test('an unrecognised reason is rejected', async () => {
  const calls = [];
  const restore = mockSendContactEmail(async () => { calls.push(1); });
  const { server, baseUrl } = await startApp(freshContactRouter());
  try {
    const { res, data } = await post(baseUrl, { ...VALID_BODY, reason: 'marketing' });
    assert.equal(res.status, 400);
    assert.ok(data.error);
    assert.equal(calls.length, 0);
  } finally {
    restore();
    await stopApp(server);
  }
});

// ── 4-7. Field validation ───────────────────────────────────────────────────

test('invalid email is rejected', async () => {
  const restore = mockSendContactEmail(async () => {});
  const { server, baseUrl } = await startApp(freshContactRouter());
  try {
    const { res } = await post(baseUrl, { ...VALID_BODY, email: 'not-an-email' });
    assert.equal(res.status, 400);
  } finally {
    restore();
    await stopApp(server);
  }
});

test('too-short message is rejected', async () => {
  const restore = mockSendContactEmail(async () => {});
  const { server, baseUrl } = await startApp(freshContactRouter());
  try {
    const { res } = await post(baseUrl, { ...VALID_BODY, message: 'too short' });
    assert.equal(res.status, 400);
  } finally {
    restore();
    await stopApp(server);
  }
});

test('oversized message (>2000 chars) is rejected', async () => {
  const restore = mockSendContactEmail(async () => {});
  const { server, baseUrl } = await startApp(freshContactRouter());
  try {
    const { res } = await post(baseUrl, { ...VALID_BODY, message: 'x'.repeat(2001) });
    assert.equal(res.status, 400);
  } finally {
    restore();
    await stopApp(server);
  }
});

test('oversized name (>80 chars) is rejected', async () => {
  const restore = mockSendContactEmail(async () => {});
  const { server, baseUrl } = await startApp(freshContactRouter());
  try {
    const { res } = await post(baseUrl, { ...VALID_BODY, name: 'A'.repeat(81) });
    assert.equal(res.status, 400);
  } finally {
    restore();
    await stopApp(server);
  }
});

// ── 8. Unknown fields never bypass validation ───────────────────────────────

test('extra unknown fields do not bypass validation or reach the email helper', async () => {
  const calls = [];
  const restore = mockSendContactEmail(async (args) => { calls.push(args); });
  const { server, baseUrl } = await startApp(freshContactRouter());
  try {
    const { res } = await post(baseUrl, {
      ...VALID_BODY,
      reason: 'not-a-real-reason',
      isAdmin: true,
      role: 'admin',
    });
    assert.equal(res.status, 400);
    assert.equal(calls.length, 0);
  } finally {
    restore();
    await stopApp(server);
  }
});

// ── 9-10. Honeypot ───────────────────────────────────────────────────────────

test('a populated honeypot field sends no email', async () => {
  const calls = [];
  const restore = mockSendContactEmail(async () => { calls.push(1); });
  const { server, baseUrl } = await startApp(freshContactRouter());
  try {
    await post(baseUrl, { ...VALID_BODY, website: 'http://spam.example' });
    assert.equal(calls.length, 0);
  } finally {
    restore();
    await stopApp(server);
  }
});

test('a populated honeypot field still returns a generic success response', async () => {
  const restore = mockSendContactEmail(async () => {});
  const { server, baseUrl } = await startApp(freshContactRouter());
  try {
    const { res, data } = await post(baseUrl, { ...VALID_BODY, website: 'http://spam.example' });
    assert.equal(res.status, 200);
    assert.equal(data.success, true);
  } finally {
    restore();
    await stopApp(server);
  }
});

// ── 11. Rate limiting ────────────────────────────────────────────────────────

test('a 6th submission within the window is rate-limited with a 429', async () => {
  const restore = mockSendContactEmail(async () => {});
  const { server, baseUrl } = await startApp(freshContactRouter());
  try {
    let last;
    for (let i = 0; i < 6; i++) {
      last = await post(baseUrl, VALID_BODY);
    }
    assert.equal(last.res.status, 429);
    assert.ok(last.data.error);
  } finally {
    restore();
    await stopApp(server);
  }
});

// ── 12-13. Email-provider failure ────────────────────────────────────────────

test('an email-provider failure returns a safe generic error, not the provider message', async () => {
  const restore = mockSendContactEmail(async () => {
    throw new Error('Resend API key invalid: sk_live_abc123');
  });
  const { server, baseUrl } = await startApp(freshContactRouter());
  try {
    const { res, data } = await post(baseUrl, VALID_BODY);
    assert.equal(res.status, 500);
    assert.doesNotMatch(data.error, /sk_live|Resend|API key/i);
  } finally {
    restore();
    await stopApp(server);
  }
});

test('the full message body is never logged, even on a delivery failure', async () => {
  const secretMarker = 'UNIQUE_MESSAGE_BODY_MARKER_' + Math.random().toString(36).slice(2);
  const restore = mockSendContactEmail(async () => {
    throw new Error('delivery failed');
  });
  const originalError = console.error;
  const logs = [];
  console.error = (...args) => logs.push(args);
  const { server, baseUrl } = await startApp(freshContactRouter());
  try {
    await post(baseUrl, { ...VALID_BODY, message: `${secretMarker} ${'x'.repeat(20)}` });
    const flat = logs.flat().map((a) => (a && a.stack) || String(a)).join('\n');
    assert.doesNotMatch(flat, new RegExp(secretMarker));
  } finally {
    console.error = originalError;
    restore();
    await stopApp(server);
  }
});

// ── 14-16. Scope guarantees ──────────────────────────────────────────────────

test('the endpoint does not require authentication', async () => {
  const restore = mockSendContactEmail(async () => {});
  const { server, baseUrl } = await startApp(freshContactRouter());
  try {
    const res = await fetch(baseUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }, // no Authorization header
      body: JSON.stringify(VALID_BODY),
    });
    assert.equal(res.status, 200);
  } finally {
    restore();
    await stopApp(server);
  }
});

test('the route source never sends the destination email to the client and never touches the database', () => {
  const src = require('node:fs').readFileSync(require.resolve('../src/routes/contact.js'), 'utf8');
  assert.doesNotMatch(src, /res\.json\([^)]*CONTACT_TO_EMAIL/);
  assert.doesNotMatch(src, /prisma|PrismaClient/i);
  assert.doesNotMatch(src, /require\(['"].*middleware\/authenticate['"]\)/);
});

test('a successful response never includes the destination address or message content', async () => {
  const restore = mockSendContactEmail(async () => {});
  const { server, baseUrl } = await startApp(freshContactRouter());
  try {
    const { data } = await post(baseUrl, VALID_BODY);
    const flat = JSON.stringify(data);
    assert.doesNotMatch(flat, /@/); // no email address of any kind in the response
    assert.deepEqual(Object.keys(data), ['success']);
  } finally {
    restore();
    await stopApp(server);
  }
});
