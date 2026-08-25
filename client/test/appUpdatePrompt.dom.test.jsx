// App Update Prompt (PWA) — real component, mocked
// `virtual:pwa-register/react` (a Vite virtual module — not resolvable
// under Vitest without this mock, which is the standard, documented way
// to test code built on it) and mocked AuthContext. No real service
// worker, no real network.

import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import { useEffect, useState } from 'react';
import { render, screen, cleanup, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

vi.mock('../src/contexts/AuthContext', () => ({
  useAuth: () => ({ language: 'en' }),
}));

const useRegisterSW = vi.fn();
vi.mock('virtual:pwa-register/react', () => ({
  useRegisterSW: (options) => useRegisterSW(options),
}));

const { default: AppUpdatePrompt } = await import('../src/components/AppUpdatePrompt.jsx');

function fakeRegistration() {
  return { update: vi.fn().mockResolvedValue(undefined) };
}

// Builds a controllable mock: `needRefresh` starts at `initial`; the
// setter returned to the component is captured onto `setNeedRefreshSpy`
// AND actually flips a real React state value (via a tiny stateful
// wrapper below) so clicking Later genuinely re-renders the tree — the
// same technique real usage relies on, not just a call-count assertion.
function mockUseRegisterSW({ initial = false, registration = fakeRegistration(), updateServiceWorker = vi.fn().mockResolvedValue(undefined) } = {}) {
  const setNeedRefreshSpy = vi.fn();
  useRegisterSW.mockImplementation((options) => {
    // A real hook, called from within AppUpdatePrompt's own render — this
    // is exactly how the real registerSW.js's onRegisteredSW fires once
    // registration resolves.
    // eslint-disable-next-line react-hooks/rules-of-hooks
    useEffect(() => { options?.onRegisteredSW?.('/sw.js', registration); }, []);
    const [value, setValue] = useState(initial);
    return {
      needRefresh: [value, (v) => { setNeedRefreshSpy(v); setValue(v); }],
      offlineReady: [false, vi.fn()],
      updateServiceWorker,
    };
  });
  return { setNeedRefreshSpy, registration, updateServiceWorker };
}

beforeEach(() => {
  useRegisterSW.mockReset();
});

afterEach(() => {
  cleanup();
});

describe('AppUpdatePrompt', () => {
  test('renders nothing when needRefresh is false', () => {
    mockUseRegisterSW({ initial: false });
    render(<AppUpdatePrompt />);
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  test('renders the prompt when needRefresh is true', () => {
    mockUseRegisterSW({ initial: true });
    render(<AppUpdatePrompt />);
    expect(screen.getByRole('dialog')).toBeTruthy();
  });

  test('shows the correct title, body, and both actions', () => {
    mockUseRegisterSW({ initial: true });
    render(<AppUpdatePrompt />);
    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByText('Arjun has an update')).toBeTruthy();
    expect(within(dialog).getByText('Refresh to get the latest version.')).toBeTruthy();
    expect(within(dialog).getByRole('button', { name: 'Refresh now' })).toBeTruthy();
    expect(within(dialog).getByRole('button', { name: 'Later' })).toBeTruthy();
  });

  test('centered-modal contract: no bottom sheet, capped width, above BottomNav and Pilot Communication', () => {
    mockUseRegisterSW({ initial: true });
    render(<AppUpdatePrompt />);
    const dialog = screen.getByRole('dialog');
    const wrapper = dialog.parentElement;
    expect(wrapper.className).toMatch(/\bitems-center\b/);
    expect(wrapper.className).not.toMatch(/items-end/);
    expect(wrapper.className).toMatch(/z-\[70\]/);
    expect(dialog.className).not.toMatch(/rounded-t-/);
    expect(dialog.className).toMatch(/rounded-3xl/);
    expect(dialog.className).toMatch(/max-w-\[340px\]/);
  });

  test('a dimmed backdrop is present', () => {
    mockUseRegisterSW({ initial: true });
    render(<AppUpdatePrompt />);
    expect(screen.getByTestId('app-update-backdrop')).toBeTruthy();
    expect(screen.getByTestId('app-update-backdrop').className).toMatch(/bg-black\/50/);
  });

  test('Refresh now invokes updateServiceWorker(true)', async () => {
    const { updateServiceWorker } = mockUseRegisterSW({ initial: true });
    render(<AppUpdatePrompt />);
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Refresh now' }));
    expect(updateServiceWorker).toHaveBeenCalledWith(true);
    expect(updateServiceWorker).toHaveBeenCalledTimes(1);
  });

  test('rapid double-tap on Refresh now cannot invoke updateServiceWorker twice', async () => {
    let resolveUpdate;
    const updateServiceWorker = vi.fn(() => new Promise((r) => { resolveUpdate = r; }));
    mockUseRegisterSW({ initial: true, updateServiceWorker });
    render(<AppUpdatePrompt />);
    const user = userEvent.setup();
    const button = screen.getByRole('button', { name: 'Refresh now' });

    await user.click(button);
    // Still "in flight" — the button must now be disabled, so a second
    // physical tap cannot fire a second call.
    expect(button.disabled).toBe(true);
    await user.click(button);
    expect(updateServiceWorker).toHaveBeenCalledTimes(1);

    resolveUpdate();
  });

  test('the Refresh button communicates its busy state while activating', async () => {
    let resolveUpdate;
    const updateServiceWorker = vi.fn(() => new Promise((r) => { resolveUpdate = r; }));
    mockUseRegisterSW({ initial: true, updateServiceWorker });
    render(<AppUpdatePrompt />);
    const user = userEvent.setup();
    const button = screen.getByRole('button', { name: 'Refresh now' });

    await user.click(button);
    expect(button.getAttribute('aria-busy')).toBe('true');
    expect(button.textContent).toBe('Refreshing…');
    // Later is disabled too while a refresh is committed.
    expect(screen.getByRole('button', { name: 'Later' }).disabled).toBe(true);

    resolveUpdate();
  });

  test('Later dismisses the prompt for the current render without activating the worker', async () => {
    const { setNeedRefreshSpy, updateServiceWorker } = mockUseRegisterSW({ initial: true });
    render(<AppUpdatePrompt />);
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Later' }));

    expect(setNeedRefreshSpy).toHaveBeenCalledWith(false);
    expect(updateServiceWorker).not.toHaveBeenCalled();
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  test('Later does not persist any dismissal — a fresh mount with a pending update shows the prompt again', () => {
    const { setNeedRefreshSpy } = mockUseRegisterSW({ initial: true });
    const { unmount } = render(<AppUpdatePrompt />);
    expect(screen.getByRole('dialog')).toBeTruthy();
    unmount();
    // No localStorage/sessionStorage write of any kind.
    expect(localStorage.length).toBe(0);
    expect(sessionStorage.length).toBe(0);

    // A brand-new mount, freshly told there's still a pending update —
    // nothing from the previous instance suppresses it.
    mockUseRegisterSW({ initial: true });
    render(<AppUpdatePrompt />);
    expect(screen.getByRole('dialog')).toBeTruthy();
    void setNeedRefreshSpy;
  });

  test('Escape behaves like Later (dismisses, does not refresh)', async () => {
    const { updateServiceWorker } = mockUseRegisterSW({ initial: true });
    render(<AppUpdatePrompt />);
    const user = userEvent.setup();
    await user.keyboard('{Escape}');
    expect(updateServiceWorker).not.toHaveBeenCalled();
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  test('clicking the backdrop behaves like Later', async () => {
    mockUseRegisterSW({ initial: true });
    render(<AppUpdatePrompt />);
    const user = userEvent.setup();
    await user.click(screen.getByTestId('app-update-backdrop'));
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  test('foreground return (visibilitychange -> visible) calls registration.update()', () => {
    const { registration } = mockUseRegisterSW({ initial: true });
    render(<AppUpdatePrompt />);
    Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true });
    document.dispatchEvent(new Event('visibilitychange'));
    expect(registration.update).toHaveBeenCalledTimes(1);
  });

  test('a hidden visibilitychange event never triggers a check', () => {
    const { registration } = mockUseRegisterSW({ initial: true });
    render(<AppUpdatePrompt />);
    Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true });
    document.dispatchEvent(new Event('visibilitychange'));
    expect(registration.update).not.toHaveBeenCalled();
  });

  test('rapid repeated visible events are debounced — not checked more than once in quick succession', () => {
    const { registration } = mockUseRegisterSW({ initial: true });
    render(<AppUpdatePrompt />);
    Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true });
    document.dispatchEvent(new Event('visibilitychange'));
    document.dispatchEvent(new Event('visibilitychange'));
    document.dispatchEvent(new Event('visibilitychange'));
    expect(registration.update).toHaveBeenCalledTimes(1);
  });

  test('the visibilitychange listener is added exactly once and removed on unmount', () => {
    const addSpy = vi.spyOn(document, 'addEventListener');
    const removeSpy = vi.spyOn(document, 'removeEventListener');
    mockUseRegisterSW({ initial: false });
    const { unmount } = render(<AppUpdatePrompt />);

    const addCalls = addSpy.mock.calls.filter((c) => c[0] === 'visibilitychange').length;
    expect(addCalls).toBe(1);

    unmount();
    const removeCalls = removeSpy.mock.calls.filter((c) => c[0] === 'visibilitychange').length;
    expect(removeCalls).toBe(1);

    addSpy.mockRestore();
    removeSpy.mockRestore();
  });

  test('after unmount, a visibilitychange event no longer triggers a check', () => {
    const { registration } = mockUseRegisterSW({ initial: true });
    const { unmount } = render(<AppUpdatePrompt />);
    unmount();
    Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true });
    document.dispatchEvent(new Event('visibilitychange'));
    expect(registration.update).not.toHaveBeenCalled();
  });

  // ── Accessibility ──────────────────────────────────────────────────────

  test('dialog has proper semantics: role, aria-modal, labelled and described heading/body', () => {
    mockUseRegisterSW({ initial: true });
    render(<AppUpdatePrompt />);
    const dialog = screen.getByRole('dialog');
    expect(dialog.getAttribute('aria-modal')).toBe('true');
    const labelledby = dialog.getAttribute('aria-labelledby');
    const describedby = dialog.getAttribute('aria-describedby');
    expect(document.getElementById(labelledby)?.textContent).toBe('Arjun has an update');
    expect(document.getElementById(describedby)?.textContent).toBe('Refresh to get the latest version.');
  });

  test('focus moves to the heading on open', () => {
    mockUseRegisterSW({ initial: true });
    render(<AppUpdatePrompt />);
    expect(document.activeElement?.textContent).toBe('Arjun has an update');
  });

  test('Later has an accessible name via aria-label matching its visible text', () => {
    mockUseRegisterSW({ initial: true });
    render(<AppUpdatePrompt />);
    const later = screen.getByRole('button', { name: 'Later' });
    expect(later.getAttribute('aria-label')).toBe('Later');
  });
});
