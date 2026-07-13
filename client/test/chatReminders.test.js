// Real behavioral tests for the pure, framework-free chat-reminder helpers
// (PR-4). No JSX involved, so these run as genuine unit tests via Node's
// built-in test runner — not just source-text assertions.

import test from 'node:test';
import assert from 'node:assert/strict';
import { AI_REMINDER_INTERVAL, shouldShowAiReminder, BREAK_REMINDER_MS } from '../src/utils/chatReminders.js';

test('recurring AI reminder: interval is 15', () => {
  assert.equal(AI_REMINDER_INTERVAL, 15);
});

test('recurring AI reminder: does not fire before the first threshold', () => {
  for (let i = 0; i < 15; i++) {
    assert.equal(shouldShowAiReminder(i), false, `should not fire at reply index ${i}`);
  }
});

test('recurring AI reminder: fires at the intended threshold (15) and repeats at sensible intervals (30, 45)', () => {
  assert.equal(shouldShowAiReminder(15), true);
  assert.equal(shouldShowAiReminder(30), true);
  assert.equal(shouldShowAiReminder(45), true);
});

test('recurring AI reminder: does not fire on every message between thresholds', () => {
  for (const i of [16, 17, 20, 25, 29, 31, 44]) {
    assert.equal(shouldShowAiReminder(i), false, `should not fire at reply index ${i}`);
  }
});

test('recurring AI reminder: handles non-positive/non-integer input safely', () => {
  assert.equal(shouldShowAiReminder(0), false);
  assert.equal(shouldShowAiReminder(-15), false);
  assert.equal(shouldShowAiReminder(15.5), false);
  assert.equal(shouldShowAiReminder(undefined), false);
});

test('break reminder: duration is approximately 30 minutes', () => {
  assert.equal(BREAK_REMINDER_MS, 30 * 60 * 1000);
});
