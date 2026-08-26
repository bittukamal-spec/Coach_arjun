// Push Notifications v1 — timezone helpers shared by the preferences route
// (validates an athlete-submitted IANA zone on write) and the scheduler
// (computes each athlete's current local date/time from it). Built
// entirely on Node's own Intl/date support — no timezone-offset math, no
// fixed UTC offsets, no new dependency. Node 20 (this repo's `engines`)
// ships the full ICU timezone database, so Intl already does the correct,
// DST-aware conversion; a library like moment-timezone/luxon would only
// duplicate what's already built in.

// Validates an IANA timezone string (e.g. "Asia/Kolkata"). Intl throws a
// RangeError for anything it doesn't recognize — that's the whole check;
// there is no more reliable source of truth than the runtime's own
// timezone database.
function isValidTimeZone(timeZone) {
  if (typeof timeZone !== 'string' || !timeZone) return false;
  try {
    // eslint-disable-next-line no-new
    new Intl.DateTimeFormat('en-US', { timeZone });
    return true;
  } catch {
    return false;
  }
}

// { year, month, day, hour, minute } for `date` as observed in `timeZone`
// — e.g. for a UTC instant that's 23:45 UTC and timeZone "Asia/Kolkata"
// (UTC+5:30), returns the next calendar day at 05:15. Used by the
// scheduler to decide whether "now" falls in an athlete's due window.
function getLocalParts(date, timeZone) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date);
  const get = (type) => Number(parts.find((p) => p.type === type)?.value);
  return {
    year: get('year'),
    month: get('month'),
    day: get('day'),
    hour: get('hour'),
    minute: get('minute'),
  };
}

// "YYYY-MM-DD" for `date` as observed in `timeZone` — the athlete-local
// calendar-day string PushNotificationPreference.lastSentLocalDate
// compares against. Zero-padded, unambiguous, safe for string equality.
function getLocalDateString(date, timeZone) {
  const { year, month, day } = getLocalParts(date, timeZone);
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

// "HH:MM" (24-hour) for `date` as observed in `timeZone`.
function getLocalTimeString(date, timeZone) {
  const { hour, minute } = getLocalParts(date, timeZone);
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}

// Strict "HH:MM" validation (24-hour) for the reminderTime preference —
// never accepts seconds, AM/PM, or an out-of-range hour/minute.
const REMINDER_TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;
function isValidReminderTime(value) {
  return typeof value === 'string' && REMINDER_TIME_RE.test(value);
}

// Minutes-since-midnight for an "HH:MM" string — used only to compare two
// same-shaped local-time strings, never mixed with a raw UTC offset.
function minutesSinceMidnight(hhmm) {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
}

module.exports = {
  isValidTimeZone,
  getLocalParts,
  getLocalDateString,
  getLocalTimeString,
  isValidReminderTime,
  minutesSinceMidnight,
};
