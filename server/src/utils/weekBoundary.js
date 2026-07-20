// Shared weekly-cycle boundary — the ONE definition of Arjun's 7-day
// coaching week, used by both weekly-review generation (weeklyReports.js)
// and the chat-cycle weekly rollover (sessions.js). Weeks run Monday
// 00:00:00 UTC → Sunday 23:59:59.999 UTC, exactly as WeeklyReport rows
// have always been keyed (WeeklyReport.weekStart is "Monday 00:00:00 UTC"
// in schema.prisma) — extracting it here changes no behavior.

function getWeekStart(date) {
  const d = new Date(date);
  const day = d.getUTCDay(); // 0=Sun … 6=Sat
  const diff = day === 0 ? -6 : 1 - day; // offset back to Monday
  d.setUTCDate(d.getUTCDate() + diff);
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

function getWeekEnd(weekStart) {
  const d = new Date(weekStart);
  d.setUTCDate(d.getUTCDate() + 6);
  d.setUTCHours(23, 59, 59, 999);
  return d;
}

module.exports = { getWeekStart, getWeekEnd };
