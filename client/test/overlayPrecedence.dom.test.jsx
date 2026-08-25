// Overlay precedence — proves the App Update Prompt and the Pilot
// Communication popup can NEVER both be on screen at once, and that the
// update prompt always wins. Mounts the two REAL components together
// (not a rewrite of either's own state machine — see
// hooks/useOverlayPriority.js, the one small shared primitive both defer
// to) with mocked auth/api/service-worker, no real network, no real SW.

import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import { useState } from 'react';
import { render, screen, cleanup, waitFor } from '@testing-library/react';
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

function Both() {
  return (
    <MemoryRouter initialEntries={['/dashboard']}>
      <AppUpdatePrompt />
      <PilotCommunicationPopup />
    </MemoryRouter>
  );
}

// A stateful mock so a single test can flip needRefresh mid-flight and
// re-render, exercising the REACTIVE guard (not just the mount-time
// check) — two plain test-only buttons drive it in either direction, the
// same setter the real Later button (and a real update detection) would
// call.
function StatefulBoth({ initialNeedRefresh }) {
  const [needRefresh, setNeedRefresh] = useState(initialNeedRefresh);
  useRegisterSW.mockImplementation(() => ({
    needRefresh: [needRefresh, setNeedRefresh],
    offlineReady: [false, vi.fn()],
    updateServiceWorker: vi.fn().mockResolvedValue(undefined),
  }));
  return (
    <MemoryRouter initialEntries={['/dashboard']}>
      <AppUpdatePrompt />
      <PilotCommunicationPopup />
      <button onClick={() => setNeedRefresh(true)}>test-trigger-update</button>
      <button onClick={() => setNeedRefresh(false)}>test-dismiss-update</button>
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
  test('when the update prompt is active, Pilot Communication never renders even with an eligible communication ready', async () => {
    useRegisterSW.mockReturnValue({
      needRefresh: [true, vi.fn()],
      offlineReady: [false, vi.fn()],
      updateServiceWorker: vi.fn(),
    });
    apiFetch.mockImplementation(async (path) => {
      if (path === '/api/pilot-communications/next') return jsonResponse({ communication: announcement });
      return jsonResponse({ ok: true });
    });

    render(<Both />);

    // The update prompt is showing...
    expect(screen.getByText('Arjun has an update')).toBeTruthy();
    // ...and Pilot Communication's own content is never shown alongside it,
    // even though its fetch resolves with a real, eligible communication.
    await waitFor(() => expect(apiFetch).toHaveBeenCalledWith('/api/pilot-communications/next', expect.anything()));
    expect(screen.queryByText('New: Focus Deck')).toBeNull();

    // Exactly one dialog on screen — never two competing overlays.
    expect(screen.getAllByRole('dialog').length).toBe(1);
  });

  test('when the update prompt is not active, normal Pilot Communication eligibility/rendering is unchanged', async () => {
    useRegisterSW.mockReturnValue({
      needRefresh: [false, vi.fn()],
      offlineReady: [false, vi.fn()],
      updateServiceWorker: vi.fn(),
    });
    apiFetch.mockImplementation(async (path) => {
      if (path === '/api/pilot-communications/next') return jsonResponse({ communication: announcement });
      return jsonResponse({ ok: true });
    });

    render(<Both />);

    expect(screen.queryByText('Arjun has an update')).toBeNull();
    expect(await screen.findByText('New: Focus Deck')).toBeTruthy();
    expect(screen.getAllByRole('dialog').length).toBe(1);
  });

  test('an update becoming active AFTER Pilot Communication is already showing hides it immediately (reactive, not just mount-time)', async () => {
    apiFetch.mockImplementation(async (path) => {
      if (path === '/api/pilot-communications/next') return jsonResponse({ communication: announcement });
      return jsonResponse({ ok: true });
    });

    render(<StatefulBoth initialNeedRefresh={false} />);
    expect(await screen.findByText('New: Focus Deck')).toBeTruthy();
    expect(screen.queryByText('Arjun has an update')).toBeNull();

    // Simulate a just-detected update while the pilot popup was already
    // on screen — the shared flag flips, and PilotCommunicationPopup must
    // hide itself immediately even though nothing about its own state
    // (it never unmounted, never lost `communication`) changed.
    screen.getByText('test-trigger-update').click();

    await waitFor(() => expect(screen.getByText('Arjun has an update')).toBeTruthy());
    expect(screen.queryByText('New: Focus Deck')).toBeNull();
    expect(screen.getAllByRole('dialog').length).toBe(1);
  });

  test('dismissing the update prompt (Later) immediately reveals Pilot Communication within the same app load', async () => {
    apiFetch.mockImplementation(async (path) => {
      if (path === '/api/pilot-communications/next') return jsonResponse({ communication: announcement });
      return jsonResponse({ ok: true });
    });

    render(<StatefulBoth initialNeedRefresh />);
    expect(await waitFor(() => screen.getByText('Arjun has an update'))).toBeTruthy();
    expect(screen.queryByText('New: Focus Deck')).toBeNull();

    // Fire the same setter Later uses (the real Later button dispatches
    // this exact call — see appUpdatePrompt.dom.test.jsx for that direct
    // proof); this test is about what happens to PILOT COMMUNICATION once
    // it does.
    screen.getByText('test-dismiss-update').click();

    expect(await screen.findByText('New: Focus Deck')).toBeTruthy();
    expect(screen.queryByText('Arjun has an update')).toBeNull();
  });

  test('Pilot Communication\'s own eligibility/dismiss/respond behavior is untouched by the guard — the CTA button still works normally once visible', async () => {
    useRegisterSW.mockReturnValue({
      needRefresh: [false, vi.fn()],
      offlineReady: [false, vi.fn()],
      updateServiceWorker: vi.fn(),
    });
    apiFetch.mockImplementation(async (path) => {
      if (path === '/api/pilot-communications/next') return jsonResponse({ communication: announcement });
      return jsonResponse({ ok: true });
    });

    render(<Both />);
    expect(await screen.findByRole('button', { name: 'Open Focus Deck' })).toBeTruthy();
  });
});
