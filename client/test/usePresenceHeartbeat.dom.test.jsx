// Pilot Presence Tracking — usePresenceHeartbeat hook. Real hook, mocked
// AuthContext + apiFetch, fake timers for the ~60s cadence (no real
// sleeping). Same visibilitychange-simulation technique as
// appUpdatePrompt.dom.test.jsx.

import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/react';

let mockToken = null;
vi.mock('../src/contexts/AuthContext', () => ({
  useAuth: () => ({ token: mockToken }),
}));

vi.mock('../src/api', () => ({ apiFetch: vi.fn() }));

const { apiFetch } = await import('../src/api');
const { usePresenceHeartbeat } = await import('../src/hooks/usePresenceHeartbeat.js');

function Harness() {
  usePresenceHeartbeat();
  return null;
}

function setVisibility(state) {
  Object.defineProperty(document, 'visibilityState', { value: state, configurable: true });
}
function fireVisibilityChange() {
  document.dispatchEvent(new Event('visibilitychange'));
}

function presenceCalls() {
  return apiFetch.mock.calls.filter(([path]) => path === '/api/activity/presence');
}

beforeEach(() => {
  vi.useFakeTimers();
  mockToken = null;
  apiFetch.mockReset();
  apiFetch.mockResolvedValue({ ok: true, json: async () => ({ ok: true }) });
  setVisibility('visible');
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('usePresenceHeartbeat — authenticated mount', () => {
  test('an initial authenticated mount touches presence exactly once', () => {
    mockToken = 'tok-1';
    render(<Harness />);
    expect(presenceCalls().length).toBe(1);
    const [, init] = presenceCalls()[0];
    expect(init.method).toBe('POST');
    expect(init.headers.Authorization).toBe('Bearer tok-1');
  });

  test('no heartbeat for unauthenticated state — no touch, no visibilitychange listener', () => {
    mockToken = null;
    const addSpy = vi.spyOn(document, 'addEventListener');
    render(<Harness />);
    expect(presenceCalls().length).toBe(0);
    const listenerAdds = addSpy.mock.calls.filter((c) => c[0] === 'visibilitychange').length;
    expect(listenerAdds).toBe(0);
    addSpy.mockRestore();
  });

  test('a session restored later (token appears after mount) touches presence when it does', () => {
    mockToken = null;
    const { rerender } = render(<Harness />);
    expect(presenceCalls().length).toBe(0);

    mockToken = 'restored-token';
    rerender(<Harness />);
    expect(presenceCalls().length).toBe(1);
  });
});

describe('usePresenceHeartbeat — foreground return', () => {
  test('returning to the foreground touches presence again', () => {
    mockToken = 'tok-1';
    render(<Harness />);
    expect(presenceCalls().length).toBe(1); // initial mount touch

    // Clear the initial-touch throttle window before the next touch.
    vi.advanceTimersByTime(20 * 1000);

    setVisibility('hidden');
    fireVisibilityChange();
    setVisibility('visible');
    fireVisibilityChange();

    expect(presenceCalls().length).toBe(2);
  });

  test('a rapid background/foreground flap is throttled — not a write per flap', () => {
    mockToken = 'tok-1';
    render(<Harness />);
    expect(presenceCalls().length).toBe(1);

    // Flap several times within the same second — well inside the
    // minimum-gap throttle window.
    for (let i = 0; i < 5; i++) {
      setVisibility('hidden');
      fireVisibilityChange();
      setVisibility('visible');
      fireVisibilityChange();
    }

    expect(presenceCalls().length).toBe(1); // still just the initial touch
  });
});

describe('usePresenceHeartbeat — heartbeat cadence', () => {
  test('while visible, a heartbeat fires roughly every 60 seconds', () => {
    mockToken = 'tok-1';
    render(<Harness />);
    expect(presenceCalls().length).toBe(1); // mount touch

    vi.advanceTimersByTime(60 * 1000);
    expect(presenceCalls().length).toBe(2);

    vi.advanceTimersByTime(60 * 1000);
    expect(presenceCalls().length).toBe(3);
  });

  test('no heartbeat ticks while hidden — stops immediately on backgrounding', () => {
    mockToken = 'tok-1';
    render(<Harness />);
    expect(presenceCalls().length).toBe(1);

    setVisibility('hidden');
    fireVisibilityChange();

    vi.advanceTimersByTime(5 * 60 * 1000); // well past several would-be ticks
    expect(presenceCalls().length).toBe(1); // unchanged — no ticks while hidden
  });

  test('never sends more than one touch roughly per minute — not every few seconds', () => {
    mockToken = 'tok-1';
    render(<Harness />);
    vi.advanceTimersByTime(10 * 1000);
    expect(presenceCalls().length).toBe(1); // still just the mount touch, nothing extra yet
  });
});

describe('usePresenceHeartbeat — cleanup', () => {
  test('the visibilitychange listener is added once and removed on unmount', () => {
    mockToken = 'tok-1';
    const addSpy = vi.spyOn(document, 'addEventListener');
    const removeSpy = vi.spyOn(document, 'removeEventListener');
    const { unmount } = render(<Harness />);

    expect(addSpy.mock.calls.filter((c) => c[0] === 'visibilitychange').length).toBe(1);
    unmount();
    expect(removeSpy.mock.calls.filter((c) => c[0] === 'visibilitychange').length).toBe(1);

    addSpy.mockRestore();
    removeSpy.mockRestore();
  });

  test('after unmount, the interval no longer ticks and visibilitychange no longer touches', () => {
    mockToken = 'tok-1';
    const { unmount } = render(<Harness />);
    const callsAtUnmount = presenceCalls().length;
    unmount();

    vi.advanceTimersByTime(5 * 60 * 1000);
    setVisibility('visible');
    fireVisibilityChange();

    expect(presenceCalls().length).toBe(callsAtUnmount);
  });

  test('logout (token clears) stops the heartbeat without unmounting', () => {
    mockToken = 'tok-1';
    const { rerender } = render(<Harness />);
    expect(presenceCalls().length).toBe(1);

    mockToken = null;
    rerender(<Harness />);

    vi.advanceTimersByTime(5 * 60 * 1000);
    setVisibility('visible');
    fireVisibilityChange();
    expect(presenceCalls().length).toBe(1); // no further touches once logged out
  });
});

describe('usePresenceHeartbeat — failure handling', () => {
  test('a rejected presence request never throws and never blocks the next scheduled touch', () => {
    mockToken = 'tok-1';
    apiFetch.mockRejectedValue(new Error('network down'));
    expect(() => render(<Harness />)).not.toThrow();

    vi.advanceTimersByTime(60 * 1000);
    // Still attempts the next heartbeat call despite the previous rejection.
    expect(presenceCalls().length).toBeGreaterThanOrEqual(2);
  });
});
