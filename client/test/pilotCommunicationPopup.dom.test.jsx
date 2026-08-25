// Pilot Communications v1 — athlete popup. Real component, real router
// (MemoryRouter + Routes, same technique as dashboardShortcuts.dom.test.jsx
// so a CTA click has to travel through actual react-router-dom machinery),
// mocked AuthContext + apiFetch. No database, no real network.

import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom';

vi.mock('../src/contexts/AuthContext', () => ({
  useAuth: () => ({ token: 'test-token', language: 'en' }),
}));

vi.mock('../src/api', () => ({ apiFetch: vi.fn() }));

const { default: PilotCommunicationPopup, __resetPilotCommunicationLoadStateForTests } =
  await import('../src/components/pilotCommunications/PilotCommunicationPopup.jsx');
const { apiFetch } = await import('../src/api');

function jsonResponse(body, ok = true) {
  return { ok, json: async () => body };
}

function CtaProbe() {
  const location = useLocation();
  return <p data-testid="pathname">{location.pathname}</p>;
}

function TestApp() {
  return (
    <MemoryRouter initialEntries={['/dashboard']}>
      <Routes>
        <Route path="/dashboard" element={<PilotCommunicationPopup />} />
        <Route path="/focus-deck" element={<CtaProbe />} />
      </Routes>
    </MemoryRouter>
  );
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

const yesSomewhatNoSurvey = {
  id: 'c2',
  type: 'SURVEY',
  title: 'How was signup?',
  body: '',
  ctaRoute: null,
  ctaLabel: null,
  responseType: 'YES_SOMEWHAT_NO',
  responseOptions: [],
};

const customSurvey = {
  id: 'c3',
  type: 'SURVEY',
  title: 'How easy was signup?',
  body: '',
  ctaRoute: null,
  ctaLabel: null,
  responseType: 'CUSTOM_SINGLE_CHOICE',
  responseOptions: ['Very easy', 'A little confusing', 'Very confusing'],
};

beforeEach(() => {
  __resetPilotCommunicationLoadStateForTests();
  apiFetch.mockReset();
});

afterEach(() => {
  cleanup();
});

describe('PilotCommunicationPopup — athlete surface', () => {
  test('renders nothing when there is no eligible communication', async () => {
    apiFetch.mockImplementation(async (path) => {
      if (path === '/api/pilot-communications/next') return jsonResponse({ communication: null });
      return jsonResponse({ ok: true });
    });
    render(<TestApp />);
    await waitFor(() => expect(apiFetch).toHaveBeenCalledWith('/api/pilot-communications/next', expect.anything()));
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  test('renders an announcement with title, body and CTA, and marks it seen', async () => {
    apiFetch.mockImplementation(async (path) => {
      if (path === '/api/pilot-communications/next') return jsonResponse({ communication: announcement });
      return jsonResponse({ ok: true });
    });
    render(<TestApp />);

    const dialog = await screen.findByRole('dialog');
    expect(dialog).toBeTruthy();
    expect(screen.getByText('New: Focus Deck')).toBeTruthy();
    expect(screen.getByText('Save your best Focus Cards for match day.')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Open Focus Deck' })).toBeTruthy();

    await waitFor(() => expect(apiFetch).toHaveBeenCalledWith('/api/pilot-communications/c1/seen', expect.objectContaining({ method: 'POST' })));
  });

  test('an announcement popup carries no free-text input anywhere', async () => {
    apiFetch.mockImplementation(async (path) => {
      if (path === '/api/pilot-communications/next') return jsonResponse({ communication: announcement });
      return jsonResponse({ ok: true });
    });
    render(<TestApp />);
    await screen.findByRole('dialog');
    expect(screen.queryByRole('textbox')).toBeNull();
  });

  test('CTA click permanently resolves the announcement (dismiss) before navigating internally', async () => {
    apiFetch.mockImplementation(async (path) => {
      if (path === '/api/pilot-communications/next') return jsonResponse({ communication: announcement });
      return jsonResponse({ ok: true });
    });
    render(<TestApp />);
    const user = userEvent.setup();
    const cta = await screen.findByRole('button', { name: 'Open Focus Deck' });

    await user.click(cta);

    await waitFor(() => expect(apiFetch).toHaveBeenCalledWith('/api/pilot-communications/c1/dismiss', expect.objectContaining({ method: 'POST' })));
    expect((await screen.findByTestId('pathname')).textContent).toBe('/focus-deck');
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  test('dismiss (X) permanently closes the announcement and calls the dismiss endpoint', async () => {
    apiFetch.mockImplementation(async (path) => {
      if (path === '/api/pilot-communications/next') return jsonResponse({ communication: announcement });
      return jsonResponse({ ok: true });
    });
    render(<TestApp />);
    const user = userEvent.setup();
    await screen.findByRole('dialog');

    await user.click(screen.getByRole('button', { name: 'Close' }));

    await waitFor(() => expect(apiFetch).toHaveBeenCalledWith('/api/pilot-communications/c1/dismiss', expect.objectContaining({ method: 'POST' })));
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  test('a Yes/Somewhat/No survey renders three structured options, no free text', async () => {
    apiFetch.mockImplementation(async (path) => {
      if (path === '/api/pilot-communications/next') return jsonResponse({ communication: yesSomewhatNoSurvey });
      return jsonResponse({ ok: true });
    });
    render(<TestApp />);
    await screen.findByRole('dialog');

    expect(screen.getByRole('radio', { name: 'Yes' })).toBeTruthy();
    expect(screen.getByRole('radio', { name: 'Somewhat' })).toBeTruthy();
    expect(screen.getByRole('radio', { name: 'No' })).toBeTruthy();
    expect(screen.queryByRole('textbox')).toBeNull();
    expect(screen.getByRole('button', { name: 'Not now' })).toBeTruthy();
  });

  test('Submit is disabled until an option is selected, then enabled', async () => {
    apiFetch.mockImplementation(async (path) => {
      if (path === '/api/pilot-communications/next') return jsonResponse({ communication: yesSomewhatNoSurvey });
      return jsonResponse({ ok: true });
    });
    render(<TestApp />);
    const user = userEvent.setup();
    await screen.findByRole('dialog');

    const submit = screen.getByRole('button', { name: 'Submit' });
    expect(submit.disabled).toBe(true);

    await user.click(screen.getByRole('radio', { name: 'Somewhat' }));
    expect(submit.disabled).toBe(false);
  });

  test('a valid submit posts the selected value and shows the acknowledgement, announced to screen readers', async () => {
    apiFetch.mockImplementation(async (path, init) => {
      if (path === '/api/pilot-communications/next') return jsonResponse({ communication: yesSomewhatNoSurvey });
      if (path === '/api/pilot-communications/c2/respond') {
        expect(JSON.parse(init.body)).toEqual({ value: 'yes' });
        return jsonResponse({ ok: true, status: 'responded' });
      }
      return jsonResponse({ ok: true });
    });
    render(<TestApp />);
    const user = userEvent.setup();
    await screen.findByRole('dialog');

    await user.click(screen.getByRole('radio', { name: 'Yes' }));
    await user.click(screen.getByRole('button', { name: 'Submit' }));

    const ack = await screen.findByRole('status');
    expect(ack.textContent).toMatch(/Thanks/);
    expect(screen.getByRole('button', { name: 'Done' })).toBeTruthy();
    // Does not immediately show the next queued communication.
    expect(apiFetch.mock.calls.filter(([p]) => p === '/api/pilot-communications/next').length).toBe(1);
  });

  test('Done closes the popup after a successful submit', async () => {
    apiFetch.mockImplementation(async (path) => {
      if (path === '/api/pilot-communications/next') return jsonResponse({ communication: yesSomewhatNoSurvey });
      if (path === '/api/pilot-communications/c2/respond') return jsonResponse({ ok: true, status: 'responded' });
      return jsonResponse({ ok: true });
    });
    render(<TestApp />);
    const user = userEvent.setup();
    await screen.findByRole('dialog');
    await user.click(screen.getByRole('radio', { name: 'Yes' }));
    await user.click(screen.getByRole('button', { name: 'Submit' }));
    await screen.findByRole('status');

    await user.click(screen.getByRole('button', { name: 'Done' }));
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  test('Not now calls the not-now endpoint and closes without showing another popup this load', async () => {
    apiFetch.mockImplementation(async (path) => {
      if (path === '/api/pilot-communications/next') return jsonResponse({ communication: yesSomewhatNoSurvey });
      return jsonResponse({ ok: true });
    });
    render(<TestApp />);
    const user = userEvent.setup();
    await screen.findByRole('dialog');

    await user.click(screen.getByRole('button', { name: 'Not now' }));

    await waitFor(() => expect(apiFetch).toHaveBeenCalledWith('/api/pilot-communications/c2/not-now', expect.objectContaining({ method: 'POST' })));
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  test('a custom-choice survey renders the founder-authored option text exactly, single-select only', async () => {
    apiFetch.mockImplementation(async (path) => {
      if (path === '/api/pilot-communications/next') return jsonResponse({ communication: customSurvey });
      return jsonResponse({ ok: true });
    });
    render(<TestApp />);
    await screen.findByRole('dialog');

    const options = screen.getAllByRole('radio');
    expect(options.length).toBe(3);
    expect(screen.getByRole('radio', { name: 'Very easy' })).toBeTruthy();
    expect(screen.getByRole('radio', { name: 'A little confusing' })).toBeTruthy();
    expect(screen.getByRole('radio', { name: 'Very confusing' })).toBeTruthy();
  });

  test('at most one fetch for the next communication per app load — a remount never re-fetches', async () => {
    apiFetch.mockImplementation(async (path) => {
      if (path === '/api/pilot-communications/next') return jsonResponse({ communication: null });
      return jsonResponse({ ok: true });
    });
    const { unmount } = render(<TestApp />);
    await waitFor(() => expect(apiFetch).toHaveBeenCalledTimes(1));
    unmount();

    render(<TestApp />);
    // Give any (incorrect) re-fetch a chance to fire before asserting it didn't.
    await new Promise((r) => setTimeout(r, 20));
    expect(apiFetch).toHaveBeenCalledTimes(1);
  });
});
