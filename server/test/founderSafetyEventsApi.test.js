const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const jwt = require('jsonwebtoken');
const { SafetyReviewStatus, SafetyReviewOutcome } = require('@prisma/client');
const { createFounderSafetyEventsRouter } = require('../src/routes/founderSafetyEvents');

test('reviewStatus and reviewOutcome are database-constrained Prisma enums, not free strings', () => {
  assert.deepEqual(Object.values(SafetyReviewStatus).sort(), ['REVIEWED', 'UNREVIEWED']);
  assert.deepEqual(
    Object.values(SafetyReviewOutcome).sort(),
    ['ESCALATED', 'FALSE_POSITIVE', 'FOLLOW_UP_REQUIRED', 'NO_ACTION']
  );
});

// Real HTTP requests against a Prisma stub — no database is ever touched.
// The founder session token is a real jsonwebtoken signed with a test
// secret, exercising the exact same verification path founderAuthenticate
// uses in production.

const TEST_SECRET = 'founder-api-test-secret';
const ORIGINAL_SECRET = process.env.FOUNDER_SESSION_SECRET;

test.before(() => { process.env.FOUNDER_SESSION_SECRET = TEST_SECRET; });
test.after(() => {
  if (ORIGINAL_SECRET === undefined) delete process.env.FOUNDER_SESSION_SECRET;
  else process.env.FOUNDER_SESSION_SECRET = ORIGINAL_SECRET;
});

function validToken() {
  return jwt.sign({ role: 'founder' }, TEST_SECRET, { expiresIn: '15m' });
}

function makeStubClient(events) {
  return {
    safetyEvent: {
      findMany: async ({ where = {}, take } = {}) => {
        let list = events.filter((e) => !where.reviewStatus || e.reviewStatus === where.reviewStatus);
        list = [...list].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
        return typeof take === 'number' ? list.slice(0, take) : list;
      },
      findUnique: async ({ where: { id } }) => events.find((e) => e.id === id) || null,
      update: async ({ where: { id }, data }) => {
        const idx = events.findIndex((e) => e.id === id);
        events[idx] = { ...events[idx], ...data };
        return events[idx];
      },
    },
  };
}

function sampleEvents() {
  const base = {
    userId: 'u1', surface: 'chat', triggerType: 'crisis_keyword', riskLevel: 'high',
    sourceType: null, sourceRecordId: null, chatSessionId: null, userMessageId: null,
    reviewStatus: 'UNREVIEWED', reviewOutcome: null, reviewedAt: null, reviewedBy: null,
    user: { id: 'u1', name: 'Test Athlete', sport: 'cricket' },
  };
  return [
    { ...base, id: 'e1', createdAt: new Date('2026-07-01T00:00:00Z') },
    { ...base, id: 'e2', createdAt: new Date('2026-07-03T00:00:00Z') },
    { ...base, id: 'e3', createdAt: new Date('2026-07-02T00:00:00Z'), reviewStatus: 'REVIEWED', reviewOutcome: 'NO_ACTION', reviewedAt: new Date('2026-07-02T01:00:00Z'), reviewedBy: 'founder' },
  ];
}

function startServer(events) {
  const router = createFounderSafetyEventsRouter(makeStubClient(events));
  const app = express();
  app.use(express.json());
  app.use('/events', router);
  return new Promise((resolve) => {
    const server = app.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      resolve({ server, baseUrl: `http://127.0.0.1:${port}/events` });
    });
  });
}

function stop(server) {
  return new Promise((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));
}

test('unauthenticated list request receives 401', async () => {
  const { server, baseUrl } = await startServer(sampleEvents());
  try {
    const res = await fetch(baseUrl);
    assert.equal(res.status, 401);
  } finally { await stop(server); }
});

test('invalid/garbage token receives 401', async () => {
  const { server, baseUrl } = await startServer(sampleEvents());
  try {
    const res = await fetch(baseUrl, { headers: { Authorization: 'Bearer garbage-token' } });
    assert.equal(res.status, 401);
  } finally { await stop(server); }
});

test('valid founder session lists events newest first', async () => {
  const { server, baseUrl } = await startServer(sampleEvents());
  try {
    const res = await fetch(baseUrl, { headers: { Authorization: `Bearer ${validToken()}` } });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.deepEqual(body.events.map((e) => e.id), ['e2', 'e3', 'e1']);
  } finally { await stop(server); }
});

test('list results are bounded by the requested limit', async () => {
  const { server, baseUrl } = await startServer(sampleEvents());
  try {
    const res = await fetch(`${baseUrl}?limit=2`, { headers: { Authorization: `Bearer ${validToken()}` } });
    const body = await res.json();
    assert.equal(body.events.length, 2);
  } finally { await stop(server); }
});

test('list results are bounded by a hard maximum even if a larger limit is requested', async () => {
  const bulk = Array.from({ length: 80 }, (_, i) => ({
    id: `bulk-${i}`, userId: 'u1', surface: 'chat', triggerType: 'crisis_keyword', riskLevel: 'high',
    sourceType: null, sourceRecordId: null, chatSessionId: null, userMessageId: null,
    reviewStatus: 'UNREVIEWED', reviewOutcome: null, reviewedAt: null, reviewedBy: null,
    createdAt: new Date(Date.now() - i * 1000),
    user: { id: 'u1', name: 'Test Athlete', sport: 'cricket' },
  }));
  const { server, baseUrl } = await startServer(bulk);
  try {
    const res = await fetch(`${baseUrl}?limit=999`, { headers: { Authorization: `Bearer ${validToken()}` } });
    const body = await res.json();
    assert.ok(body.events.length <= 50, `expected <= 50 events, got ${body.events.length}`);
  } finally { await stop(server); }
});

test('reviewStatus filter accepts only supported values and rejects the rest', async () => {
  const { server, baseUrl } = await startServer(sampleEvents());
  try {
    const good = await fetch(`${baseUrl}?reviewStatus=REVIEWED`, { headers: { Authorization: `Bearer ${validToken()}` } });
    assert.equal(good.status, 200);
    const goodBody = await good.json();
    assert.ok(goodBody.events.every((e) => e.reviewStatus === 'REVIEWED'));
    assert.equal(goodBody.events.length, 1);

    const bad = await fetch(`${baseUrl}?reviewStatus=DELETED`, { headers: { Authorization: `Bearer ${validToken()}` } });
    assert.equal(bad.status, 400);
  } finally { await stop(server); }
});

test('event responses never contain message body, matched excerpt, or AI summary fields', async () => {
  const { server, baseUrl } = await startServer(sampleEvents());
  try {
    const res = await fetch(baseUrl, { headers: { Authorization: `Bearer ${validToken()}` } });
    const body = await res.json();
    const json = JSON.stringify(body);
    assert.doesNotMatch(json, /"content"|excerpt|matchedText|arjunResponse|arjunNote|arjunInsight/i);
  } finally { await stop(server); }
});

test('reading a known event returns structured metadata and minimal athlete identification', async () => {
  const { server, baseUrl } = await startServer(sampleEvents());
  try {
    const res = await fetch(`${baseUrl}/e1`, { headers: { Authorization: `Bearer ${validToken()}` } });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.event.id, 'e1');
    assert.equal(body.event.user.name, 'Test Athlete');
    assert.equal(body.event.user.sport, 'cricket');
  } finally { await stop(server); }
});

test('reading an unknown event returns 404', async () => {
  const { server, baseUrl } = await startServer(sampleEvents());
  try {
    const res = await fetch(`${baseUrl}/does-not-exist`, { headers: { Authorization: `Bearer ${validToken()}` } });
    assert.equal(res.status, 404);
  } finally { await stop(server); }
});

test('a valid structured review update succeeds and sets reviewedAt/reviewedBy server-side', async () => {
  const { server, baseUrl } = await startServer(sampleEvents());
  try {
    const res = await fetch(`${baseUrl}/e1/review`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${validToken()}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ reviewStatus: 'REVIEWED', reviewOutcome: 'FOLLOW_UP_REQUIRED' }),
    });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.event.reviewStatus, 'REVIEWED');
    assert.equal(body.event.reviewOutcome, 'FOLLOW_UP_REQUIRED');
    assert.equal(body.event.reviewedBy, 'founder');
    assert.ok(body.event.reviewedAt);
  } finally { await stop(server); }
});

test('an invalid reviewOutcome value is rejected with 400', async () => {
  const { server, baseUrl } = await startServer(sampleEvents());
  try {
    const res = await fetch(`${baseUrl}/e1/review`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${validToken()}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ reviewStatus: 'REVIEWED', reviewOutcome: 'MADE_UP_VALUE' }),
    });
    assert.equal(res.status, 400);
  } finally { await stop(server); }
});

test('an invalid reviewStatus value is rejected with 400', async () => {
  const { server, baseUrl } = await startServer(sampleEvents());
  try {
    const res = await fetch(`${baseUrl}/e1/review`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${validToken()}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ reviewStatus: 'CLOSED', reviewOutcome: 'NO_ACTION' }),
    });
    assert.equal(res.status, 400);
  } finally { await stop(server); }
});

test('a review update carrying an extra free-text note field is rejected with 400', async () => {
  const { server, baseUrl } = await startServer(sampleEvents());
  try {
    const res = await fetch(`${baseUrl}/e1/review`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${validToken()}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ reviewStatus: 'REVIEWED', reviewOutcome: 'NO_ACTION', note: 'the athlete said something concerning' }),
    });
    assert.equal(res.status, 400);
  } finally { await stop(server); }
});

test('reviewing an unknown event returns 404', async () => {
  const { server, baseUrl } = await startServer(sampleEvents());
  try {
    const res = await fetch(`${baseUrl}/does-not-exist/review`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${validToken()}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ reviewStatus: 'REVIEWED', reviewOutcome: 'NO_ACTION' }),
    });
    assert.equal(res.status, 404);
  } finally { await stop(server); }
});

test('reviewing without authentication receives 401, not 400/404', async () => {
  const { server, baseUrl } = await startServer(sampleEvents());
  try {
    const res = await fetch(`${baseUrl}/e1/review`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reviewStatus: 'REVIEWED', reviewOutcome: 'NO_ACTION' }),
    });
    assert.equal(res.status, 401);
  } finally { await stop(server); }
});
