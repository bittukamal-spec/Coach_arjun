// Real behavioral tests for practiceRouteFor (PR-12 amendment) — a pure,
// framework-free function, so these run as genuine unit tests via Node's
// built-in test runner, not source-text assertions. This is the single
// source of truth ChatPage's ServerCardBubble uses to decide whether a
// prescribed practice card gets a "Start Practice" launch action.

import test from 'node:test';
import assert from 'node:assert/strict';
import { practiceRouteFor } from '../src/utils/prescriptionPractice.js';

// The complete approved practice key set (server
// src/services/coaching/practiceRegistry.js) — only the first two currently
// have a real completion integration point.
const SUPPORTED_KEYS = ['pressure_reset', 'post_performance_reflection'];
const UNSUPPORTED_APPROVED_KEYS = [
  'focus_cue_building',
  'attentional_routine',
  'pre_performance_routine',
  'mistake_reset_routine',
  'guided_rehearsal',
  'acclimatization_homework',
];

test('supported practice keys resolve to their real route', () => {
  assert.equal(practiceRouteFor('pressure_reset'), '/body-reset');
  assert.equal(practiceRouteFor('post_performance_reflection'), '/debrief');
});

test('every other approved practice key resolves to null — no invented route, no silent generic fallback', () => {
  for (const key of UNSUPPORTED_APPROVED_KEYS) {
    assert.equal(practiceRouteFor(key), null, `${key} must not resolve to a route yet`);
  }
});

test('malformed or unknown practice keys resolve to null, never throw', () => {
  const malformed = [undefined, null, '', 'not_a_real_key', 'PRESSURE_RESET', ' pressure_reset', 123, {}, []];
  for (const value of malformed) {
    assert.doesNotThrow(() => practiceRouteFor(value));
    assert.equal(practiceRouteFor(value), null, `${JSON.stringify(value)} must resolve to null`);
  }
});

test('the supported and unsupported sets are disjoint and cover the exact known approved practice keys', () => {
  const all = [...SUPPORTED_KEYS, ...UNSUPPORTED_APPROVED_KEYS];
  assert.equal(new Set(all).size, all.length, 'no key should appear in both lists');
  assert.equal(all.length, 8, 'the approved practice set has exactly 8 keys');
});
