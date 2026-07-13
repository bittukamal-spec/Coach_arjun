// Pure, framework-free helpers for ChatPage's client-only AI-disclosure and
// break reminders (PR-4). Kept separate from ChatPage.jsx (which contains
// JSX) so this logic is directly testable with Node's built-in test runner
// without a JSX transform.

// Recurring AI-coach reminder: repeats every Nth completed assistant reply
// in the current visible session — never before the first threshold, never
// on every message. `assistantReplyIndex` is the 1-based position of a
// completed (non-streaming) assistant reply within the session.
export const AI_REMINDER_INTERVAL = 15;

export function shouldShowAiReminder(assistantReplyIndex) {
  return (
    Number.isInteger(assistantReplyIndex) &&
    assistantReplyIndex > 0 &&
    assistantReplyIndex % AI_REMINDER_INTERVAL === 0
  );
}

// Gentle break reminder after ~30 minutes of continuous chat use, measured
// from when the chat page/component mounted — the simplest reliable
// client-session interpretation available without adding inactivity
// tracking, browser notifications, or analytics.
export const BREAK_REMINDER_MS = 30 * 60 * 1000;
