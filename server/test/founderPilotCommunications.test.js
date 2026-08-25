// Pilot Communications v1 — founder surface. Real HTTP requests against
// routes/founderPilotCommunications.js backed by the shared in-memory stub
// — no database anywhere in this file. Same founder-session-JWT technique
// as founderSafetyEventsApi.test.js.

const test = require('node:test');
const assert = require('node:assert/strict');
const jwt = require('jsonwebtoken');
const express = require('express');

const { createFounderPilotCommunicationsRouter } = require('../src/routes/founderPilotCommunications');
const { makeState, makeStubClient } = require('./helpers/pilotCommunicationsStub');

const TEST_SECRET = 'pilot-comms-founder-test-secret';
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

function threeAthletes() {
  return [
    { id: 'u1', name: 'Aarav Sharma', sport: 'cricket', createdAt: new Date('2026-06-01') },
    { id: 'u2', name: 'Bhavna Rao', sport: 'badminton', createdAt: new Date('2026-06-02') },
    { id: 'u3', name: 'Chirag Patel', sport: 'football', createdAt: new Date('2026-06-03') },
  ];
}

function startServer(state) {
  const client = makeStubClient(state);
  const router = createFounderPilotCommunicationsRouter(client);
  const app = express();
  app.use(express.json());
  app.use('/fpc', router);
  return new Promise((resolve) => {
    const server = app.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      resolve({ server, baseUrl: `http://127.0.0.1:${port}/fpc`, client });
    });
  });
}
function stop(server) {
  return new Promise((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));
}

const announcementPayload = {
  type: 'ANNOUNCEMENT',
  title: 'New: Focus Deck',
  body: 'Save your best Focus Cards for match day.',
  ctaRoute: '/focus-deck',
  ctaLabel: 'Open Focus Deck',
};

// ── Authorization boundaries ────────────────────────────────────────────────

test('every founder endpoint requires the founder session token', async () => {
  const state = makeState({ users: threeAthletes() });
  const { server, baseUrl } = await startServer(state);
  try {
    const calls = [
      ['GET', '/'],
      ['GET', '/athletes'],
      ['GET', '/x'],
      ['POST', '/'],
      ['POST', '/x/publish'],
      ['PATCH', '/x/deactivate'],
    ];
    for (const [method, path] of calls) {
      const res = await fetch(`${baseUrl}${path}`, { method });
      assert.equal(res.status, 401, `${method} ${path} should require the founder session`);
    }
  } finally { await stop(server); }
});

test('the legacy static FOUNDER_TOKEN header is never accepted here', async () => {
  const state = makeState({ users: threeAthletes() });
  const { server, baseUrl } = await startServer(state);
  try {
    const res = await fetch(`${baseUrl}/`, { headers: { Authorization: 'Bearer some-legacy-static-token' } });
    assert.equal(res.status, 401);
  } finally { await stop(server); }
});

// ── Create — content validation ─────────────────────────────────────────────

test('create rejects an invalid announcement payload (missing title)', async () => {
  const state = makeState({ users: threeAthletes() });
  const { server, baseUrl } = await startServer(state);
  try {
    const res = await fetch(`${baseUrl}/`, {
      method: 'POST', headers: authed(),
      body: JSON.stringify({ ...announcementPayload, title: '', audience: { mode: 'ALL' } }),
    });
    assert.equal(res.status, 400);
  } finally { await stop(server); }
});

test('create rejects a survey with an invalid responseType', async () => {
  const state = makeState({ users: threeAthletes() });
  const { server, baseUrl } = await startServer(state);
  try {
    const res = await fetch(`${baseUrl}/`, {
      method: 'POST', headers: authed(),
      body: JSON.stringify({
        type: 'SURVEY', title: 'Q', body: 'B', responseType: 'FREE_TEXT', audience: { mode: 'ALL' },
      }),
    });
    assert.equal(res.status, 400);
  } finally { await stop(server); }
});

test('create rejects a custom survey with more than 5 options', async () => {
  const state = makeState({ users: threeAthletes() });
  const { server, baseUrl } = await startServer(state);
  try {
    const res = await fetch(`${baseUrl}/`, {
      method: 'POST', headers: authed(),
      body: JSON.stringify({
        type: 'SURVEY', title: 'Q', body: 'B', responseType: 'CUSTOM_SINGLE_CHOICE',
        responseOptions: ['a', 'b', 'c', 'd', 'e', 'f'], audience: { mode: 'ALL' },
      }),
    });
    assert.equal(res.status, 400);
  } finally { await stop(server); }
});

test('create rejects an external/unapproved CTA route', async () => {
  const state = makeState({ users: threeAthletes() });
  const { server, baseUrl } = await startServer(state);
  try {
    const res = await fetch(`${baseUrl}/`, {
      method: 'POST', headers: authed(),
      body: JSON.stringify({
        ...announcementPayload, ctaRoute: 'https://example.com/evil', audience: { mode: 'ALL' },
      }),
    });
    assert.equal(res.status, 400);
  } finally { await stop(server); }
});

test('create rejects a "selected" audience referencing a non-existent athlete id', async () => {
  const state = makeState({ users: threeAthletes() });
  const { server, baseUrl } = await startServer(state);
  try {
    const res = await fetch(`${baseUrl}/`, {
      method: 'POST', headers: authed(),
      body: JSON.stringify({ ...announcementPayload, audience: { mode: 'SELECTED', userIds: ['u1', 'ghost'] } }),
    });
    assert.equal(res.status, 400);
  } finally { await stop(server); }
});

test('create rejects a "selected" audience with zero athletes', async () => {
  const state = makeState({ users: threeAthletes() });
  const { server, baseUrl } = await startServer(state);
  try {
    const res = await fetch(`${baseUrl}/`, {
      method: 'POST', headers: authed(),
      body: JSON.stringify({ ...announcementPayload, audience: { mode: 'SELECTED', userIds: [] } }),
    });
    assert.equal(res.status, 400);
  } finally { await stop(server); }
});

// ── GET /athletes ────────────────────────────────────────────────────────

test('GET /athletes returns minimal identity only — no email, no free-text fields', async () => {
  const state = makeState({ users: threeAthletes() });
  const { server, baseUrl } = await startServer(state);
  try {
    const res = await fetch(`${baseUrl}/athletes`, { headers: authed() });
    const { athletes } = await res.json();
    assert.equal(athletes.length, 3);
    assert.deepEqual(Object.keys(athletes[0]).sort(), ['firstName', 'id', 'sport']);
  } finally { await stop(server); }
});

// ── Targeting: SELECTED audience creates targets at create time ────────────

test('a "selected" audience creates target rows immediately, scoped to only the chosen athletes', async () => {
  const state = makeState({ users: threeAthletes() });
  const { server, baseUrl, client } = await startServer(state);
  try {
    const res = await fetch(`${baseUrl}/`, {
      method: 'POST', headers: authed(),
      body: JSON.stringify({ ...announcementPayload, audience: { mode: 'SELECTED', userIds: ['u1', 'u2'] } }),
    });
    assert.equal(res.status, 201);
    const { communication } = await res.json();
    assert.equal(communication.targetCount, 2);
    assert.equal(communication.isActive, false, 'created, not yet published');

    const targets = await client.pilotCommunicationTarget.findMany({ where: { communicationId: communication.id } });
    assert.deepEqual(targets.map((t) => t.userId).sort(), ['u1', 'u2']);
  } finally { await stop(server); }
});

// ── Publish: ALL audience snapshot + idempotency ───────────────────────────

test('publishing an "ALL" audience snapshots the CURRENT pilot list into explicit target rows', async () => {
  const state = makeState({ users: threeAthletes() });
  const { server, baseUrl, client } = await startServer(state);
  try {
    const createRes = await fetch(`${baseUrl}/`, {
      method: 'POST', headers: authed(),
      body: JSON.stringify({ ...announcementPayload, audience: { mode: 'ALL' } }),
    });
    const { communication } = await createRes.json();
    assert.equal(communication.targetCount, 0, 'ALL is not resolved until publish');

    const publishRes = await fetch(`${baseUrl}/${communication.id}/publish`, { method: 'POST', headers: authed() });
    assert.equal(publishRes.status, 200);
    const published = (await publishRes.json()).communication;
    assert.equal(published.isActive, true);
    assert.ok(published.publishedAt);
    assert.equal(published.targetCount, 3);

    const targets = await client.pilotCommunicationTarget.findMany({ where: { communicationId: communication.id } });
    assert.deepEqual(targets.map((t) => t.userId).sort(), ['u1', 'u2', 'u3']);
  } finally { await stop(server); }
});

test('publish is idempotent and never re-targets an already-published communication', async () => {
  const state = makeState({ users: threeAthletes() });
  const { server, baseUrl, client } = await startServer(state);
  try {
    const createRes = await fetch(`${baseUrl}/`, {
      method: 'POST', headers: authed(), body: JSON.stringify({ ...announcementPayload, audience: { mode: 'ALL' } }),
    });
    const { communication } = await createRes.json();
    await fetch(`${baseUrl}/${communication.id}/publish`, { method: 'POST', headers: authed() });

    // A 4th athlete joins the pilot AFTER publish.
    state.users.push({ id: 'u4', name: 'Late Joiner', sport: 'tennis', createdAt: new Date() });

    const secondPublish = await fetch(`${baseUrl}/${communication.id}/publish`, { method: 'POST', headers: authed() });
    assert.equal(secondPublish.status, 200);
    const body = await secondPublish.json();
    assert.equal(body.communication.targetCount, 3, 'a late-joining athlete must never be silently added');

    const targets = await client.pilotCommunicationTarget.findMany({ where: { communicationId: communication.id } });
    assert.equal(targets.length, 3);
  } finally { await stop(server); }
});

test('publish is transactional: an ALL-audience publish creates exactly one target row per athlete, no duplicates on repeat', async () => {
  const state = makeState({ users: threeAthletes() });
  const { server, baseUrl, client } = await startServer(state);
  try {
    const createRes = await fetch(`${baseUrl}/`, {
      method: 'POST', headers: authed(), body: JSON.stringify({ ...announcementPayload, audience: { mode: 'ALL' } }),
    });
    const { communication } = await createRes.json();
    await fetch(`${baseUrl}/${communication.id}/publish`, { method: 'POST', headers: authed() });
    await fetch(`${baseUrl}/${communication.id}/publish`, { method: 'POST', headers: authed() });
    const targets = await client.pilotCommunicationTarget.findMany({ where: { communicationId: communication.id } });
    assert.equal(targets.length, 3);
  } finally { await stop(server); }
});

// ── List + detail + aggregation ─────────────────────────────────────────────

test('list returns server-aggregated target/seen/responded/dismissed counts', async () => {
  const state = makeState({
    users: threeAthletes(),
    communications: [{
      id: 'c1', type: 'SURVEY', title: 'Q', body: 'B', ctaRoute: null, ctaLabel: null,
      audienceMode: 'ALL', responseType: 'YES_SOMEWHAT_NO', responseOptions: '[]',
      isActive: true, publishedAt: new Date(), createdAt: new Date(), updatedAt: new Date(),
    }],
    targets: [
      { id: 't1', communicationId: 'c1', userId: 'u1', createdAt: new Date() },
      { id: 't2', communicationId: 'c1', userId: 'u2', createdAt: new Date() },
      { id: 't3', communicationId: 'c1', userId: 'u3', createdAt: new Date() },
    ],
    responses: [
      { id: 'r1', communicationId: 'c1', userId: 'u1', seenAt: new Date(), deferCount: 0, dismissedAt: null, responseValue: 'yes', respondedAt: new Date(), createdAt: new Date(), updatedAt: new Date() },
      { id: 'r2', communicationId: 'c1', userId: 'u2', seenAt: new Date(), deferCount: 0, dismissedAt: new Date(), responseValue: null, respondedAt: null, createdAt: new Date(), updatedAt: new Date() },
    ],
  });
  const { server, baseUrl } = await startServer(state);
  try {
    const res = await fetch(`${baseUrl}/`, { headers: authed() });
    const { communications } = await res.json();
    const c = communications.find((c) => c.id === 'c1');
    assert.equal(c.targetCount, 3);
    assert.equal(c.seenCount, 2);
    assert.equal(c.respondedCount, 1);
    assert.equal(c.dismissedCount, 1);
  } finally { await stop(server); }
});

test('detail returns per-athlete status and a survey breakdown derived safely from configured options', async () => {
  const state = makeState({
    users: threeAthletes(),
    communications: [{
      id: 'c1', type: 'SURVEY', title: 'How easy was signup?', body: '', ctaRoute: null, ctaLabel: null,
      audienceMode: 'ALL', responseType: 'CUSTOM_SINGLE_CHOICE',
      responseOptions: JSON.stringify(['Very easy', 'Okay', 'Confusing']),
      isActive: true, publishedAt: new Date(), createdAt: new Date(), updatedAt: new Date(),
    }],
    targets: [
      { id: 't1', communicationId: 'c1', userId: 'u1', createdAt: new Date() },
      { id: 't2', communicationId: 'c1', userId: 'u2', createdAt: new Date() },
      { id: 't3', communicationId: 'c1', userId: 'u3', createdAt: new Date() },
    ],
    responses: [
      { id: 'r1', communicationId: 'c1', userId: 'u1', seenAt: new Date(), deferCount: 0, dismissedAt: null, responseValue: 'Very easy', respondedAt: new Date(), createdAt: new Date(), updatedAt: new Date() },
      { id: 'r2', communicationId: 'c1', userId: 'u2', seenAt: new Date(), deferCount: 1, dismissedAt: null, responseValue: null, respondedAt: null, createdAt: new Date(), updatedAt: new Date() },
    ],
  });
  const { server, baseUrl } = await startServer(state);
  try {
    const res = await fetch(`${baseUrl}/c1`, { headers: authed() });
    const { athletes, breakdown } = await res.json();
    assert.deepEqual(breakdown, { 'Very easy': 1, Okay: 0, Confusing: 0 });

    const byId = Object.fromEntries(athletes.map((a) => [a.userId, a]));
    assert.equal(byId.u1.status, 'responded');
    assert.equal(byId.u1.responseValue, 'Very easy');
    assert.equal(byId.u2.status, 'deferred');
    assert.equal(byId.u3.status, 'not_seen');
  } finally { await stop(server); }
});

test('detail on an unknown communication returns 404', async () => {
  const state = makeState({ users: threeAthletes() });
  const { server, baseUrl } = await startServer(state);
  try {
    const res = await fetch(`${baseUrl}/does-not-exist`, { headers: authed() });
    assert.equal(res.status, 404);
  } finally { await stop(server); }
});

// ── Deactivate ───────────────────────────────────────────────────────────

test('deactivate hides an active communication from athletes but preserves all historical responses', async () => {
  const state = makeState({
    users: threeAthletes(),
    communications: [{
      id: 'c1', type: 'ANNOUNCEMENT', title: 'T', body: 'B', ctaRoute: null, ctaLabel: null,
      audienceMode: 'ALL', responseType: null, responseOptions: '[]',
      isActive: true, publishedAt: new Date(), createdAt: new Date(), updatedAt: new Date(),
    }],
    targets: [{ id: 't1', communicationId: 'c1', userId: 'u1', createdAt: new Date() }],
    responses: [
      { id: 'r1', communicationId: 'c1', userId: 'u1', seenAt: new Date(), deferCount: 0, dismissedAt: new Date(), responseValue: null, respondedAt: null, createdAt: new Date(), updatedAt: new Date() },
    ],
  });
  const { server, baseUrl, client } = await startServer(state);
  try {
    const res = await fetch(`${baseUrl}/c1/deactivate`, { method: 'PATCH', headers: authed() });
    assert.equal(res.status, 200);
    const { communication } = await res.json();
    assert.equal(communication.isActive, false);

    const responses = await client.pilotCommunicationResponse.findMany({ where: { communicationId: 'c1' } });
    assert.equal(responses.length, 1, 'historical response rows are never deleted on deactivate');
  } finally { await stop(server); }
});

test('deactivating an unknown communication returns 404', async () => {
  const state = makeState({ users: threeAthletes() });
  const { server, baseUrl } = await startServer(state);
  try {
    const res = await fetch(`${baseUrl}/does-not-exist/deactivate`, { method: 'PATCH', headers: authed() });
    assert.equal(res.status, 404);
  } finally { await stop(server); }
});
