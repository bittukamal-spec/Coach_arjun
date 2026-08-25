// Pilot Communications v1 — athlete surface.
// Pure helper unit tests (services/pilotCommunications.js) + real HTTP
// requests against routes/pilotCommunications.js backed by the shared
// in-memory stub — no database anywhere in this file. Same technique as
// mindJournalApi.test.js / founderSafetyEventsApi.test.js: a real signed
// JWT through the real `authenticate` middleware.

const test = require('node:test');
const assert = require('node:assert/strict');
const jwt = require('jsonwebtoken');
const express = require('express');

const {
  validateCommunicationInput,
  validateResponseValue,
  deriveAthleteStatus,
  isEligible,
  isValidCtaRoute,
} = require('../src/services/pilotCommunications');
const { createPilotCommunicationsRouter } = require('../src/routes/pilotCommunications');
const { makeState, makeStubClient } = require('./helpers/pilotCommunicationsStub');

// ── Pure helper unit tests ──────────────────────────────────────────────────

test('validateCommunicationInput: rejects an unknown type', () => {
  assert.equal(validateCommunicationInput({ type: 'NOTICE', title: 'x', body: 'y' }).ok, false);
});

test('validateCommunicationInput: rejects empty/too-long title and body', () => {
  assert.equal(validateCommunicationInput({ type: 'ANNOUNCEMENT', title: '', body: 'y' }).ok, false);
  assert.equal(validateCommunicationInput({ type: 'ANNOUNCEMENT', title: 'x'.repeat(101), body: 'y' }).ok, false);
  assert.equal(validateCommunicationInput({ type: 'ANNOUNCEMENT', title: 'x', body: '' }).ok, false);
  assert.equal(validateCommunicationInput({ type: 'ANNOUNCEMENT', title: 'x', body: 'y'.repeat(501) }).ok, false);
});

test('validateCommunicationInput: accepts a minimal valid announcement', () => {
  const r = validateCommunicationInput({ type: 'ANNOUNCEMENT', title: 'Hi', body: 'Body text' });
  assert.equal(r.ok, true);
  assert.equal(r.data.ctaRoute, null);
  assert.equal(r.data.responseType, null);
});

test('validateCommunicationInput: rejects a CTA route outside the allowlist', () => {
  const r = validateCommunicationInput({
    type: 'ANNOUNCEMENT', title: 'Hi', body: 'Body',
    ctaRoute: 'https://evil.example.com', ctaLabel: 'Go',
  });
  assert.equal(r.ok, false);
  assert.equal(isValidCtaRoute('https://evil.example.com'), false);
  assert.equal(isValidCtaRoute('/dashboard'), true);
});

test('validateCommunicationInput: an approved CTA route requires a label', () => {
  const r = validateCommunicationInput({ type: 'ANNOUNCEMENT', title: 'Hi', body: 'Body', ctaRoute: '/train' });
  assert.equal(r.ok, false);
});

test('validateCommunicationInput: survey requires a valid responseType', () => {
  assert.equal(validateCommunicationInput({ type: 'SURVEY', title: 'Q', body: 'B' }).ok, false);
  assert.equal(
    validateCommunicationInput({ type: 'SURVEY', title: 'Q', body: 'B', responseType: 'FREE_TEXT' }).ok,
    false
  );
});

test('validateCommunicationInput: an announcement cannot carry a survey response type', () => {
  const r = validateCommunicationInput({
    type: 'ANNOUNCEMENT', title: 'Hi', body: 'Body', responseType: 'YES_SOMEWHAT_NO',
  });
  assert.equal(r.ok, false);
});

test('validateCommunicationInput: custom survey needs 2-5 non-empty, non-duplicate, bounded-length options', () => {
  const base = { type: 'SURVEY', title: 'Q', body: 'B', responseType: 'CUSTOM_SINGLE_CHOICE' };
  assert.equal(validateCommunicationInput({ ...base, responseOptions: ['only one'] }).ok, false);
  assert.equal(validateCommunicationInput({ ...base, responseOptions: ['a', 'b', 'c', 'd', 'e', 'f'] }).ok, false);
  assert.equal(validateCommunicationInput({ ...base, responseOptions: ['a', 'a'] }).ok, false);
  assert.equal(validateCommunicationInput({ ...base, responseOptions: ['x'.repeat(41), 'ok'] }).ok, false);
  const ok = validateCommunicationInput({ ...base, responseOptions: ['Great', 'Okay', 'Bad'] });
  assert.equal(ok.ok, true);
  assert.deepEqual(JSON.parse(ok.data.responseOptions), ['Great', 'Okay', 'Bad']);
});

test('validateResponseValue: yes/somewhat/no', () => {
  const c = { responseType: 'YES_SOMEWHAT_NO' };
  assert.equal(validateResponseValue(c, 'yes'), true);
  assert.equal(validateResponseValue(c, 'somewhat'), true);
  assert.equal(validateResponseValue(c, 'no'), true);
  assert.equal(validateResponseValue(c, 'maybe'), false);
});

test('validateResponseValue: 1-5 rating rejects out-of-range or malformed values', () => {
  const c = { responseType: 'RATING_1_5' };
  for (const v of ['1', '2', '3', '4', '5']) assert.equal(validateResponseValue(c, v), true);
  for (const v of ['0', '6', 'three', '3.5', '', null]) assert.equal(validateResponseValue(c, v), false);
});

test('validateResponseValue: custom option must belong to THIS communication, not another survey', () => {
  const c1 = { responseType: 'CUSTOM_SINGLE_CHOICE', responseOptions: JSON.stringify(['Red', 'Blue']) };
  const c2 = { responseType: 'CUSTOM_SINGLE_CHOICE', responseOptions: JSON.stringify(['Cricket', 'Football']) };
  assert.equal(validateResponseValue(c1, 'Red'), true);
  assert.equal(validateResponseValue(c1, 'Cricket'), false, 'an option from a different survey must be rejected');
  assert.equal(validateResponseValue(c2, 'Cricket'), true);
});

test('deriveAthleteStatus: not_seen / seen / deferred / dismissed / responded precedence', () => {
  assert.equal(deriveAthleteStatus(null), 'not_seen');
  assert.equal(deriveAthleteStatus({ seenAt: new Date() }), 'seen');
  assert.equal(deriveAthleteStatus({ seenAt: new Date(), deferCount: 1 }), 'deferred');
  assert.equal(deriveAthleteStatus({ seenAt: new Date(), deferCount: 2, dismissedAt: new Date() }), 'dismissed');
  assert.equal(
    deriveAthleteStatus({ seenAt: new Date(), respondedAt: new Date(), responseValue: 'yes' }),
    'responded'
  );
});

test('isEligible: inactive, dismissed, or responded communications are never eligible', () => {
  const active = { isActive: true };
  assert.equal(isEligible(active, null), true);
  assert.equal(isEligible({ isActive: false }, null), false);
  assert.equal(isEligible(active, { dismissedAt: new Date() }), false);
  assert.equal(isEligible(active, { respondedAt: new Date() }), false);
  assert.equal(isEligible(active, { deferCount: 1 }), true, 'a single defer stays eligible');
});

// ── HTTP tests against the athlete router (stub Prisma client) ─────────────

const TEST_JWT_SECRET = 'pilot-comms-athlete-test-secret';
const ORIGINAL_JWT_SECRET = process.env.JWT_SECRET;
test.before(() => { process.env.JWT_SECRET = TEST_JWT_SECRET; });
test.after(() => {
  if (ORIGINAL_JWT_SECRET === undefined) delete process.env.JWT_SECRET;
  else process.env.JWT_SECRET = ORIGINAL_JWT_SECRET;
});

function tokenFor(userId) {
  return jwt.sign({ userId }, TEST_JWT_SECRET, { expiresIn: '15m' });
}

function baseCommunication(overrides = {}) {
  return {
    id: 'c1',
    type: 'ANNOUNCEMENT',
    title: 'New feature',
    body: 'Check out Focus Deck.',
    ctaRoute: '/focus-deck',
    ctaLabel: 'Open Focus Deck',
    audienceMode: 'ALL',
    responseType: null,
    responseOptions: '[]',
    isActive: true,
    publishedAt: new Date('2026-08-01T00:00:00Z'),
    createdAt: new Date('2026-08-01T00:00:00Z'),
    updatedAt: new Date('2026-08-01T00:00:00Z'),
    ...overrides,
  };
}

function survey(overrides = {}) {
  return baseCommunication({
    id: 'c-survey',
    type: 'SURVEY',
    title: 'How was signup?',
    body: '',
    ctaRoute: null,
    ctaLabel: null,
    responseType: 'YES_SOMEWHAT_NO',
    ...overrides,
  });
}

function startServer(state) {
  const client = makeStubClient(state);
  const router = createPilotCommunicationsRouter(client);
  const app = express();
  app.use(express.json());
  app.use('/pc', router);
  return new Promise((resolve) => {
    const server = app.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      resolve({ server, baseUrl: `http://127.0.0.1:${port}/pc`, client });
    });
  });
}
function stop(server) {
  return new Promise((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));
}
function authed(token) {
  return { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
}

// ── Authorization boundaries ────────────────────────────────────────────────

test('every athlete endpoint requires authentication', async () => {
  const state = makeState({ communications: [baseCommunication()], targets: [{ id: 't1', communicationId: 'c1', userId: 'u1', createdAt: new Date() }] });
  const { server, baseUrl } = await startServer(state);
  try {
    const paths = [
      ['GET', '/next'],
      ['POST', '/c1/seen'],
      ['POST', '/c1/dismiss'],
      ['POST', '/c1/not-now'],
      ['POST', '/c1/respond'],
    ];
    for (const [method, path] of paths) {
      const res = await fetch(`${baseUrl}${path}`, { method });
      assert.equal(res.status, 401, `${method} ${path} should require auth`);
    }
  } finally { await stop(server); }
});

// ── GET /next ────────────────────────────────────────────────────────────

test('GET /next returns null when the athlete has nothing targeted', async () => {
  const state = makeState({ communications: [baseCommunication()], targets: [] });
  const { server, baseUrl } = await startServer(state);
  try {
    const res = await fetch(`${baseUrl}/next`, { headers: authed(tokenFor('u1')) });
    assert.equal(res.status, 200);
    assert.equal((await res.json()).communication, null);
  } finally { await stop(server); }
});

test('GET /next never returns a communication for an athlete who is not explicitly targeted', async () => {
  const state = makeState({
    communications: [baseCommunication()],
    targets: [{ id: 't1', communicationId: 'c1', userId: 'someone-else', createdAt: new Date() }],
  });
  const { server, baseUrl } = await startServer(state);
  try {
    const res = await fetch(`${baseUrl}/next`, { headers: authed(tokenFor('u1')) });
    assert.equal((await res.json()).communication, null);
  } finally { await stop(server); }
});

test('GET /next never returns an inactive (draft/deactivated) communication', async () => {
  const state = makeState({
    communications: [baseCommunication({ isActive: false })],
    targets: [{ id: 't1', communicationId: 'c1', userId: 'u1', createdAt: new Date() }],
  });
  const { server, baseUrl } = await startServer(state);
  try {
    const res = await fetch(`${baseUrl}/next`, { headers: authed(tokenFor('u1')) });
    assert.equal((await res.json()).communication, null);
  } finally { await stop(server); }
});

test('GET /next returns the oldest eligible published communication first', async () => {
  const state = makeState({
    communications: [
      baseCommunication({ id: 'newer', publishedAt: new Date('2026-08-10T00:00:00Z') }),
      baseCommunication({ id: 'older', publishedAt: new Date('2026-08-01T00:00:00Z') }),
    ],
    targets: [
      { id: 't1', communicationId: 'newer', userId: 'u1', createdAt: new Date() },
      { id: 't2', communicationId: 'older', userId: 'u1', createdAt: new Date() },
    ],
  });
  const { server, baseUrl } = await startServer(state);
  try {
    const res = await fetch(`${baseUrl}/next`, { headers: authed(tokenFor('u1')) });
    const { communication } = await res.json();
    assert.equal(communication.id, 'older');
  } finally { await stop(server); }
});

test('GET /next skips a dismissed announcement and a responded survey, but still returns a once-deferred survey', async () => {
  const state = makeState({
    communications: [
      baseCommunication({ id: 'dismissed-one', publishedAt: new Date('2026-08-01T00:00:00Z') }),
      survey({ id: 'responded-one', publishedAt: new Date('2026-08-02T00:00:00Z') }),
      survey({ id: 'deferred-one', publishedAt: new Date('2026-08-03T00:00:00Z') }),
    ],
    targets: [
      { id: 't1', communicationId: 'dismissed-one', userId: 'u1', createdAt: new Date() },
      { id: 't2', communicationId: 'responded-one', userId: 'u1', createdAt: new Date() },
      { id: 't3', communicationId: 'deferred-one', userId: 'u1', createdAt: new Date() },
    ],
    responses: [
      { id: 'r1', communicationId: 'dismissed-one', userId: 'u1', dismissedAt: new Date(), seenAt: new Date(), deferCount: 0, responseValue: null, respondedAt: null, createdAt: new Date(), updatedAt: new Date() },
      { id: 'r2', communicationId: 'responded-one', userId: 'u1', dismissedAt: null, seenAt: new Date(), deferCount: 0, responseValue: 'yes', respondedAt: new Date(), createdAt: new Date(), updatedAt: new Date() },
      { id: 'r3', communicationId: 'deferred-one', userId: 'u1', dismissedAt: null, seenAt: new Date(), deferCount: 1, responseValue: null, respondedAt: null, createdAt: new Date(), updatedAt: new Date() },
    ],
  });
  const { server, baseUrl } = await startServer(state);
  try {
    const res = await fetch(`${baseUrl}/next`, { headers: authed(tokenFor('u1')) });
    const { communication } = await res.json();
    assert.equal(communication.id, 'deferred-one');
  } finally { await stop(server); }
});

// ── POST /:id/seen ───────────────────────────────────────────────────────

test('POST /:id/seen sets seenAt once and is idempotent (never overwrites the first timestamp)', async () => {
  const state = makeState({
    communications: [baseCommunication()],
    targets: [{ id: 't1', communicationId: 'c1', userId: 'u1', createdAt: new Date() }],
  });
  const { server, baseUrl, client } = await startServer(state);
  try {
    let res = await fetch(`${baseUrl}/c1/seen`, { method: 'POST', headers: authed(tokenFor('u1')) });
    assert.equal(res.status, 200);
    const first = await client.pilotCommunicationResponse.findUnique({ where: { communicationId_userId: { communicationId: 'c1', userId: 'u1' } } });
    assert.ok(first.seenAt);

    await new Promise((r) => setTimeout(r, 5));
    res = await fetch(`${baseUrl}/c1/seen`, { method: 'POST', headers: authed(tokenFor('u1')) });
    assert.equal(res.status, 200);
    const second = await client.pilotCommunicationResponse.findUnique({ where: { communicationId_userId: { communicationId: 'c1', userId: 'u1' } } });
    assert.equal(second.seenAt.getTime(), first.seenAt.getTime(), 'seenAt must never be overwritten');
  } finally { await stop(server); }
});

test('POST /:id/seen for a non-targeted athlete returns 404', async () => {
  const state = makeState({ communications: [baseCommunication()], targets: [] });
  const { server, baseUrl } = await startServer(state);
  try {
    const res = await fetch(`${baseUrl}/c1/seen`, { method: 'POST', headers: authed(tokenFor('u1')) });
    assert.equal(res.status, 404);
  } finally { await stop(server); }
});

// ── POST /:id/dismiss (announcement) ────────────────────────────────────

test('POST /:id/dismiss permanently dismisses an announcement, idempotently', async () => {
  const state = makeState({
    communications: [baseCommunication()],
    targets: [{ id: 't1', communicationId: 'c1', userId: 'u1', createdAt: new Date() }],
  });
  const { server, baseUrl, client } = await startServer(state);
  try {
    await fetch(`${baseUrl}/c1/dismiss`, { method: 'POST', headers: authed(tokenFor('u1')) });
    const after1 = await client.pilotCommunicationResponse.findUnique({ where: { communicationId_userId: { communicationId: 'c1', userId: 'u1' } } });
    assert.ok(after1.dismissedAt);

    const res2 = await fetch(`${baseUrl}/c1/dismiss`, { method: 'POST', headers: authed(tokenFor('u1')) });
    assert.equal(res2.status, 200);
    const after2 = await client.pilotCommunicationResponse.findUnique({ where: { communicationId_userId: { communicationId: 'c1', userId: 'u1' } } });
    assert.equal(after2.dismissedAt.getTime(), after1.dismissedAt.getTime());

    const nextRes = await fetch(`${baseUrl}/next`, { headers: authed(tokenFor('u1')) });
    assert.equal((await nextRes.json()).communication, null, 'a dismissed announcement is never eligible again');
  } finally { await stop(server); }
});

test('POST /:id/dismiss on a SURVEY is rejected (announcement-only endpoint)', async () => {
  const state = makeState({
    communications: [survey()],
    targets: [{ id: 't1', communicationId: 'c-survey', userId: 'u1', createdAt: new Date() }],
  });
  const { server, baseUrl } = await startServer(state);
  try {
    const res = await fetch(`${baseUrl}/c-survey/dismiss`, { method: 'POST', headers: authed(tokenFor('u1')) });
    assert.equal(res.status, 404);
  } finally { await stop(server); }
});

// ── POST /:id/not-now (survey) ───────────────────────────────────────────

test('POST /:id/not-now: first call defers, second call permanently dismisses, further calls are stable', async () => {
  const state = makeState({
    communications: [survey()],
    targets: [{ id: 't1', communicationId: 'c-survey', userId: 'u1', createdAt: new Date() }],
  });
  const { server, baseUrl, client } = await startServer(state);
  const key = { communicationId_userId: { communicationId: 'c-survey', userId: 'u1' } };
  try {
    await fetch(`${baseUrl}/c-survey/not-now`, { method: 'POST', headers: authed(tokenFor('u1')) });
    let row = await client.pilotCommunicationResponse.findUnique({ where: key });
    assert.equal(row.deferCount, 1);
    assert.equal(row.dismissedAt, null);

    const nextAfterFirst = await fetch(`${baseUrl}/next`, { headers: authed(tokenFor('u1')) });
    assert.equal((await nextAfterFirst.json()).communication.id, 'c-survey', 'still eligible after one defer');

    await fetch(`${baseUrl}/c-survey/not-now`, { method: 'POST', headers: authed(tokenFor('u1')) });
    row = await client.pilotCommunicationResponse.findUnique({ where: key });
    assert.equal(row.deferCount, 2);
    assert.ok(row.dismissedAt, 'second Not now is permanent');

    await fetch(`${baseUrl}/c-survey/not-now`, { method: 'POST', headers: authed(tokenFor('u1')) });
    const stable = await client.pilotCommunicationResponse.findUnique({ where: key });
    assert.equal(stable.dismissedAt.getTime(), row.dismissedAt.getTime(), 'a third call must not change state');

    const nextAfterDismiss = await fetch(`${baseUrl}/next`, { headers: authed(tokenFor('u1')) });
    assert.equal((await nextAfterDismiss.json()).communication, null);
  } finally { await stop(server); }
});

// ── POST /:id/respond ────────────────────────────────────────────────────

test('POST /:id/respond rejects an invalid response value', async () => {
  const state = makeState({
    communications: [survey()],
    targets: [{ id: 't1', communicationId: 'c-survey', userId: 'u1', createdAt: new Date() }],
  });
  const { server, baseUrl } = await startServer(state);
  try {
    const res = await fetch(`${baseUrl}/c-survey/respond`, {
      method: 'POST', headers: authed(tokenFor('u1')), body: JSON.stringify({ value: 'definitely' }),
    });
    assert.equal(res.status, 400);
  } finally { await stop(server); }
});

test('POST /:id/respond rejects a response to an inactive or non-targeted communication', async () => {
  const state = makeState({
    communications: [survey({ id: 'inactive-survey', isActive: false })],
    targets: [{ id: 't1', communicationId: 'inactive-survey', userId: 'u1', createdAt: new Date() }],
  });
  const { server, baseUrl } = await startServer(state);
  try {
    const res = await fetch(`${baseUrl}/inactive-survey/respond`, {
      method: 'POST', headers: authed(tokenFor('u1')), body: JSON.stringify({ value: 'yes' }),
    });
    assert.equal(res.status, 404);

    const res2 = await fetch(`${baseUrl}/does-not-exist/respond`, {
      method: 'POST', headers: authed(tokenFor('u1')), body: JSON.stringify({ value: 'yes' }),
    });
    assert.equal(res2.status, 404);
  } finally { await stop(server); }
});

test('POST /:id/respond: a valid response is recorded and the survey becomes ineligible afterwards', async () => {
  const state = makeState({
    communications: [survey()],
    targets: [{ id: 't1', communicationId: 'c-survey', userId: 'u1', createdAt: new Date() }],
  });
  const { server, baseUrl, client } = await startServer(state);
  try {
    const res = await fetch(`${baseUrl}/c-survey/respond`, {
      method: 'POST', headers: authed(tokenFor('u1')), body: JSON.stringify({ value: 'somewhat' }),
    });
    assert.equal(res.status, 200);
    const row = await client.pilotCommunicationResponse.findUnique({ where: { communicationId_userId: { communicationId: 'c-survey', userId: 'u1' } } });
    assert.equal(row.responseValue, 'somewhat');
    assert.ok(row.respondedAt);

    const nextRes = await fetch(`${baseUrl}/next`, { headers: authed(tokenFor('u1')) });
    assert.equal((await nextRes.json()).communication, null);
  } finally { await stop(server); }
});

test('POST /:id/respond: an identical repeat submit is idempotent; a conflicting one is rejected (no editing answers in v1)', async () => {
  const state = makeState({
    communications: [survey()],
    targets: [{ id: 't1', communicationId: 'c-survey', userId: 'u1', createdAt: new Date() }],
  });
  const { server, baseUrl } = await startServer(state);
  try {
    await fetch(`${baseUrl}/c-survey/respond`, {
      method: 'POST', headers: authed(tokenFor('u1')), body: JSON.stringify({ value: 'yes' }),
    });
    const repeat = await fetch(`${baseUrl}/c-survey/respond`, {
      method: 'POST', headers: authed(tokenFor('u1')), body: JSON.stringify({ value: 'yes' }),
    });
    assert.equal(repeat.status, 200);

    const conflict = await fetch(`${baseUrl}/c-survey/respond`, {
      method: 'POST', headers: authed(tokenFor('u1')), body: JSON.stringify({ value: 'no' }),
    });
    assert.equal(conflict.status, 409);
  } finally { await stop(server); }
});

test('two athletes are fully isolated from each other\'s targeting and responses', async () => {
  const state = makeState({
    communications: [survey()],
    targets: [{ id: 't1', communicationId: 'c-survey', userId: 'u1', createdAt: new Date() }],
  });
  const { server, baseUrl } = await startServer(state);
  try {
    const res = await fetch(`${baseUrl}/c-survey/respond`, {
      method: 'POST', headers: authed(tokenFor('u2')), body: JSON.stringify({ value: 'yes' }),
    });
    assert.equal(res.status, 404, 'u2 was never targeted for this survey');
  } finally { await stop(server); }
});
