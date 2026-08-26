// Push Notifications v1 — pure timezone/time helpers (services/pushTimezone.js).
// No database, no clock mocking beyond passing explicit Date objects.

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  isValidTimeZone,
  getLocalDateString,
  getLocalTimeString,
  isValidReminderTime,
  minutesSinceMidnight,
} = require('../src/services/pushTimezone');

test('isValidTimeZone: accepts real IANA zones', () => {
  assert.equal(isValidTimeZone('Asia/Kolkata'), true);
  assert.equal(isValidTimeZone('America/New_York'), true);
  assert.equal(isValidTimeZone('UTC'), true);
});

test('isValidTimeZone: rejects garbage, empty, and non-string values', () => {
  for (const bad of ['Foo/Bar', '', null, undefined, 42, 'not a timezone']) {
    assert.equal(isValidTimeZone(bad), false, `expected ${JSON.stringify(bad)} to be invalid`);
  }
});

test('getLocalDateString/getLocalTimeString: correctly rolls the calendar day forward across the IST offset', () => {
  // 23:45 UTC + 5:30 (Asia/Kolkata) = 05:15 the NEXT day.
  const instant = new Date('2026-08-25T23:45:00Z');
  assert.equal(getLocalDateString(instant, 'Asia/Kolkata'), '2026-08-26');
  assert.equal(getLocalTimeString(instant, 'Asia/Kolkata'), '05:15');
  // UTC itself is unaffected.
  assert.equal(getLocalDateString(instant, 'UTC'), '2026-08-25');
  assert.equal(getLocalTimeString(instant, 'UTC'), '23:45');
});

test('isValidReminderTime: strict 24-hour HH:MM only', () => {
  for (const ok of ['00:00', '18:00', '23:59', '09:05']) {
    assert.equal(isValidReminderTime(ok), true, `expected ${ok} to be valid`);
  }
  for (const bad of ['24:00', '6:00pm', '18:60', '18:0', '', null, undefined, '18:00:00']) {
    assert.equal(isValidReminderTime(bad), false, `expected ${JSON.stringify(bad)} to be invalid`);
  }
});

test('minutesSinceMidnight: converts HH:MM correctly', () => {
  assert.equal(minutesSinceMidnight('00:00'), 0);
  assert.equal(minutesSinceMidnight('18:00'), 1080);
  assert.equal(minutesSinceMidnight('23:59'), 1439);
});
