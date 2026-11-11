// Breathing cues are opt-in, remembered per device, and never throw where
// the browser has no audio or vibration support.

import { describe, test, expect, vi, beforeEach } from 'vitest';
import { createBreathCues, cuesPreferred, rememberCues } from '../src/utils/breathCues.js';

beforeEach(() => {
  localStorage.clear();
  delete window.AudioContext;
  delete window.webkitAudioContext;
  delete navigator.vibrate;
});

describe('breathCues', () => {
  test('cues are off until the athlete turns them on, and the choice is remembered', () => {
    expect(cuesPreferred()).toBe(false);
    rememberCues(true);
    expect(cuesPreferred()).toBe(true);
    rememberCues(false);
    expect(cuesPreferred()).toBe(false);
  });

  test('does nothing, safely, without audio or vibration support', () => {
    const cues = createBreathCues();
    expect(() => { cues.unlock(); cues.cue('inhale'); cues.cue('exhale'); cues.close(); }).not.toThrow();
  });

  test('one buzz for breathe in, two for breathe out', () => {
    navigator.vibrate = vi.fn();
    const cues = createBreathCues();
    cues.cue('inhale');
    cues.cue('exhale');
    expect(navigator.vibrate.mock.calls).toEqual([[70], [[70, 90, 70]]]);
  });
});
