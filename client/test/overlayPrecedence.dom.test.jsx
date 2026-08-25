// Overlay precedence — proves the App Update Prompt and the Pilot
// Communication popup can NEVER both be on screen at once, that the
// update prompt always wins, and that once a genuine update has been
// detected, Pilot Communication stays suppressed for the REST of that
// app load — including after the athlete taps Later — never persisted,
// only cleared by a genuinely fresh app load. Mounts the two REAL
// components together (not a rewrite of either's own state machine — see
// hooks/useOverlayPriority.js, the one small shared latch both defer to)
// with mocked auth/api/service-worker, no real network, no real SW.

import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import { useState } from 'react';
import { render, screen, cleanup, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';

vi.mock('../src/contexts/AuthContext', () => ({
  useAuth: () => ({ token: 'test-token', language: 'en' }),
}));

vi.mock('../src/api', () => ({ apiFetch: vi.fn() }));

const useRegisterSW = vi.fn();
vi.mock('virtual:pwa-register/react', () => ({
  useRegisterSW: (options) => useRegisterSW(options),
}));

const { default: AppUpdatePrompt } = await import('../src/components/AppUpdatePrompt.jsx');
const { default: PilotCommunicationPopup, __resetPilotCommunicationLoadStateForTests } =
  await import('../src/components/pilotCommunications/PilotCommunicationPopup.jsx');
const { apiFetch } = await import('../src/api');
const { __resetOverlayPriorityForTests } = await import('../src/hooks/useOverlayPriority.js');

function jsonResponse(body, ok = true) {
  return { ok, json: async () => body };
}

const announcement = {
  id: 'c1',
  type: 'ANNOUNCEMENT',
  title: 'New: Focus Deck',
  body: 'Save your best Focus Cards for match day.',
  ctaRoute: '/focus-deck',
  ctaLabel: 'Open Focus Deck',
  responseType: null,
  responseOptions: [],
};

function mockPilotCommEligible() {
  apiFetch.mockImplementation(async (path) => {
    if (path === '/api/pilot-communications/next') return jsonResponse({ communication: announcement });
    return jsonResponse({ ok: true });
  });
}

function Both() {
  return (
    <MemoryRouter initialEntries={['/dashboard']}>
      <AppUpdatePrompt />
      <PilotCommunicationPopup />
    </MemoryRouter>
  );
}

// A stateful mock so a single test can flip needRefresh mid-flight and
// re-render, exercising the REAL AppUpdatePrompt effect that latches the
// shared flag (hooks/useOverlayPriority.js) — not a hand-simulated one.
// One test-only trigger button; there is deliberately no "un-trigger"
// button, because the real system has no way to un-detect an update
// either — only the real Later button (also rendered here, for real) can
// close the prompt, and it must NOT touch the latch.
function StatefulBoth({ initialNeedRefresh }) {
  const [needRefresh, setNeedRefresh] = useState(initialNeedRefresh);
  const updateServiceWorker = vi.fn().mockResolvedValue(undefined);
  useRegisterSW.mockImplementation(() => ({
    needRefresh: [needRefresh, setNeedRefresh],
    offlineReady: [false, vi.fn()],
    updateServiceWorker,
  }));
  return (
    <MemoryRouter initialEntries={['/dashboard']}>
      <AppUpdatePrompt />
      <PilotCommunicationPopup />
      <button onClick={() => setNeedRefresh(true)}>test-trigger-update</button>
    </MemoryRouter>
  );
}

beforeEach(() => {
  useRegisterSW.mockReset();
  apiFetch.mockReset();
  __resetPilotCommunicationLoadStateForTests();
  __resetOverlayPriorityForTests();
});

afterEach(() => {
  cleanup();
});

describe('Overlay precedence — App Update Prompt vs. Pilot Communication', () => {
  // ── 1. Pilot Communication is hidden when an update becomes available ──

  test('when the update prompt is active, Pilot Communication never renders even with an eligible communication ready', async () => {
    useRegisterSW.mockReturnValue({
      needRefresh: [true, vi.fn()],
      offlineReady: [false, vi.fn()],
      updateServiceWorker: vi.fn(),
    });
    mockPilotCommEligible();

    render(<Both />);

    expect(screen.getByText('Arjun has an update')).toBeTruthy();
    await waitFor(() => expect(apiFetch).toHaveBeenCalledWith('/api/pilot-communications/next', expect.anything()));
    expect(screen.queryByText('New: Focus Deck')).toBeNull();
    expect(screen.getAllByRole('dialog').length).toBe(1); // #5 — never two overlays
  });

  test('an update becoming active AFTER Pilot Communication is already showing hides it immediately (reactive, not just mount-time)', async () => {
    mockPilotCommEligible();

    render(<StatefulBoth initialNeedRefresh={false} />);
    expect(await screen.findByText('New: Focus Deck')).toBeTruthy();
    expect(screen.queryByText('Arjun has an update')).toBeNull();

    screen.getByText('test-trigger-update').click();

    await waitFor(() => expect(screen.getByText('Arjun has an update')).toBeTruthy());
    expect(screen.queryByText('New: Focus Deck')).toBeNull();
    expect(screen.getAllByRole('dialog').length).toBe(1);
  });

  // ── 2. Later closes the prompt but Pilot Communication STAYS hidden ────

  test('choosing Later closes the update prompt, but Pilot Communication remains suppressed for the rest of this app load', async () => {
    mockPilotCommEligible();

    render(<StatefulBoth initialNeedRefresh />);
    expect(await waitFor(() => screen.getByText('Arjun has an update'))).toBeTruthy();
    expect(screen.queryByText('New: Focus Deck')).toBeNull();

    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Later' }));

    // The update prompt itself is gone...
    expect(screen.queryByText('Arjun has an update')).toBeNull();
    // ...but Pilot Communication does NOT take its place. This is the
    // core behavior this PR changes: the old build revealed it here.
    expect(screen.queryByText('New: Focus Deck')).toBeNull();
    expect(screen.queryByRole('dialog')).toBeNull(); // #5 — no overlay at all now, not a swap
  });

  test('Pilot Communication stays suppressed even well after Later — no timer, no later re-check reveals it this load', async () => {
    mockPilotCommEligible();
    render(<StatefulBoth initialNeedRefresh />);
    await waitFor(() => screen.getByText('Arjun has an update'));

    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Later' }));
    expect(screen.queryByText('New: Focus Deck')).toBeNull();

    // Give any stray effect/timer a real chance to fire before asserting
    // it didn't reveal anything.
    await new Promise((r) => setTimeout(r, 50));
    expect(screen.queryByText('New: Focus Deck')).toBeNull();
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  // ── 3. A fresh app load (no active update) allows Pilot Communication ──

  test('when no update has ever been detected, normal Pilot Communication eligibility/rendering is unchanged', async () => {
    useRegisterSW.mockReturnValue({
      needRefresh: [false, vi.fn()],
      offlineReady: [false, vi.fn()],
      updateServiceWorker: vi.fn(),
    });
    mockPilotCommEligible();

    render(<Both />);

    expect(screen.queryByText('Arjun has an update')).toBeNull();
    expect(await screen.findByText('New: Focus Deck')).toBeTruthy();
    expect(screen.getAllByRole('dialog').length).toBe(1);
  });

  test('a genuinely fresh app load clears the suppression — the latch does not survive past this load\'s own module reset', async () => {
    // Simulate an outdated load that detected an update and was suppressed.
    useRegisterSW.mockReturnValue({
      needRefresh: [true, vi.fn()],
      offlineReady: [false, vi.fn()],
      updateServiceWorker: vi.fn(),
    });
    mockPilotCommEligible();
    const { unmount } = render(<Both />);
    expect(screen.getByText('Arjun has an update')).toBeTruthy();
    unmount();

    // No persisted state of any kind carries the suppression forward.
    expect(localStorage.length).toBe(0);
    expect(sessionStorage.length).toBe(0);

    // A genuinely fresh app load: no update pending this time, and the
    // in-memory latch resets exactly the way it would on a real reload
    // (a fresh JS module instance) — __resetOverlayPriorityForTests
    // stands in for that fresh instance here.
    __resetOverlayPriorityForTests();
    __resetPilotCommunicationLoadStateForTests();
    useRegisterSW.mockReturnValue({
      needRefresh: [false, vi.fn()],
      offlineReady: [false, vi.fn()],
      updateServiceWorker: vi.fn(),
    });
    render(<Both />);

    expect(screen.queryByText('Arjun has an update')).toBeNull();
    expect(await screen.findByText('New: Focus Deck')).toBeTruthy();
  });

  // ── 4. Refresh behaviour is unchanged by the presence of Pilot Communication ──

  test('Refresh now still calls updateServiceWorker(true) normally, with Pilot Communication suppressed throughout', async () => {
    const updateServiceWorker = vi.fn().mockResolvedValue(undefined);
    useRegisterSW.mockReturnValue({
      needRefresh: [true, vi.fn()],
      offlineReady: [false, vi.fn()],
      updateServiceWorker,
    });
    mockPilotCommEligible();

    render(<Both />);
    await waitFor(() => expect(apiFetch).toHaveBeenCalledWith('/api/pilot-communications/next', expect.anything()));

    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Refresh now' }));

    expect(updateServiceWorker).toHaveBeenCalledWith(true);
    expect(updateServiceWorker).toHaveBeenCalledTimes(1);
    // Pilot Communication never appeared at any point during this flow.
    expect(screen.queryByText('New: Focus Deck')).toBeNull();
  });

  // ── 5. No simultaneous overlays, across a realistic sequence ───────────

  test('across mount -> update detected -> Later, at most one dialog is ever on screen at once', async () => {
    mockPilotCommEligible();
    render(<StatefulBoth initialNeedRefresh={false} />);

    await screen.findByText('New: Focus Deck');
    expect(screen.getAllByRole('dialog').length).toBe(1);

    screen.getByText('test-trigger-update').click();
    await waitFor(() => expect(screen.getByText('Arjun has an update')).toBeTruthy());
    expect(screen.getAllByRole('dialog').length).toBe(1);

    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Later' }));
    expect(screen.queryAllByRole('dialog').length).toBe(0);
  });

  test('Pilot Communication\'s own eligibility/dismiss/respond behavior is untouched by the guard — the CTA button still works normally once visible', async () => {
    useRegisterSW.mockReturnValue({
      needRefresh: [false, vi.fn()],
      offlineReady: [false, vi.fn()],
      updateServiceWorker: vi.fn(),
    });
    mockPilotCommEligible();

    render(<Both />);
    expect(await screen.findByRole('button', { name: 'Open Focus Deck' })).toBeTruthy();
  });
});
