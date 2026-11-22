// Hook fix 4 (docs/HOOK-AUDIT.md #4): the one daily reminder becomes
// specific on days that matter; each kind can be switched off.
const test = require('node:test');
const assert = require('node:assert/strict');
const { pickMoment, buildMomentPayload, MOMENT_MESSAGES } = require('../src/services/pushMoments');
const { processOnePreference } = require('../src/services/pushScheduler');

const base = { localDate: '2026-11-23', localWeekday: 1, nowMs: Date.parse('2026-11-23T12:30:00Z') };

test('match tomorrow beats everything; then the review for 3 days', () => {
  assert.equal(pickMoment({ ...base, nextMatchDay: '2026-11-24', chattedLastWeek: true }), 'match_tomorrow');
  assert.equal(pickMoment({ ...base, nextMatchDay: '2026-11-21' }), 'match_review');
  assert.equal(pickMoment({ ...base, nextMatchDay: '2026-11-19' }), null, 'after 3 days it stops');
  assert.equal(pickMoment({ ...base, nextMatchDay: '2026-11-23' }), null, 'match day itself: no extra push');
  assert.equal(pickMoment({ ...base, nextMatchDay: '2026-11-24', pref: { matchReminders: false } }), null);
});

test('rematch only in the first 3 days after it opens; weekly only on Mondays after chatting', () => {
  const ready = (daysAgo) => new Date(base.nowMs - (28 + daysAgo) * 86400000);
  assert.equal(pickMoment({ ...base, localWeekday: 3, lastChallengeAt: ready(0.5) }), 'rematch');
  assert.equal(pickMoment({ ...base, localWeekday: 3, lastChallengeAt: ready(4) }), null);
  assert.equal(pickMoment({ ...base, localWeekday: 3, lastChallengeAt: ready(-2) }), null, 'not open yet');
  assert.equal(pickMoment({ ...base, localWeekday: 3, lastChallengeAt: ready(1), pref: { rematchReminders: false } }), null);
  assert.equal(pickMoment({ ...base, chattedLastWeek: true }), 'weekly');
  assert.equal(pickMoment({ ...base, localWeekday: 2, chattedLastWeek: true }), null);
  assert.equal(pickMoment({ ...base, chattedLastWeek: false }), null);
  assert.equal(pickMoment({ ...base, chattedLastWeek: true, pref: { weeklyReminders: false } }), null);
});

test('copy is fixed, calm, and routes only to allowed screens', () => {
  const sw = require('fs').readFileSync(require('path').join(__dirname, '../../client/src/sw.js'), 'utf8');
  for (const [key, m] of Object.entries(MOMENT_MESSAGES)) {
    assert.doesNotMatch(`${m.title} ${m.body}`, /streak|don't miss|hurry|last chance|lose/i, key);
    assert.ok(sw.includes(`'${m.route}'`), `${m.route} must be on the service worker allowlist`);
    assert.deepEqual(Object.keys(JSON.parse(buildMomentPayload(key))), ['title', 'body', 'route']);
  }
});

test('scheduler sends the moment message instead of the generic one', async () => {
  const sent = [];
  const pushSend = require('../src/services/pushSend');
  const orig = pushSend.sendPushToSubscription;
  // processOnePreference holds its own reference, so stub via require cache.
  const schedPath = require.resolve('../src/services/pushScheduler');
  const sendPath = require.resolve('../src/services/pushSend');
  delete require.cache[schedPath];
  require.cache[sendPath].exports = { ...pushSend, sendPushToSubscription: async (_sub, payload) => { sent.push(JSON.parse(payload)); return { ok: true }; } };
  const { processOnePreference: run } = require('../src/services/pushScheduler');
  try {
    const now = new Date('2026-11-23T12:32:00Z'); // 18:02 in India
    const client = {
      pushNotificationPreference: { updateMany: async () => ({ count: 1 }), update: async () => ({}) },
      pushSubscription: { findMany: async () => [{ id: 's1' }] },
      user: { findUnique: async () => ({ language: 'en' }) },
      pathProgress: { findUnique: async () => ({ nextMatchDay: '2026-11-24' }) },
      mindChallengeResult: { findFirst: async () => null },
      message: { count: async () => 0 },
    };
    const r = await run(client, { id: 'p1', userId: 'u1', timezone: 'Asia/Kolkata', lastSentLocalDate: null, matchReminders: true }, now);
    assert.equal(r.status, 'sent');
    assert.equal(r.moment, 'match_tomorrow');
    assert.equal(sent[0].title, 'Match tomorrow');
  } finally {
    require.cache[sendPath].exports = { ...pushSend, sendPushToSubscription: orig };
    delete require.cache[schedPath];
  }
  assert.equal(typeof processOnePreference, 'function');
});
