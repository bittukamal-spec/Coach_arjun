// Real ROUTER integration tests for Stage 7 (Pressure Reset migration onto
// the Stage 6 shared practice shell). Mounts the real page under a real
// <MemoryRouter>, mirroring the pattern established in
// practiceShell.dom.test.jsx: only useAuth and apiFetch are mocked,
// everything else (routing, the PracticeShell components, the wizard's own
// state machine, crisis detection) runs for real. Breathing-timer countdown
// itself is unchanged code already covered by the pre-migration behavior
// and is exercised manually per the founder preview checklist — these
// tests stop at reaching the breathing screen.

import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom';

const authState = { user: { sport: 'football' }, token: 'test-token', language: 'en' };
vi.mock('../src/contexts/AuthContext', () => ({
  useAuth: () => authState,
}));

vi.mock('../src/api', () => ({
  apiFetch: vi.fn(() => Promise.resolve({ ok: true, json: async () => ({}) })),
}));

const { default: BodyResetPage } = await import('../src/pages/BodyResetPage.jsx');

function RouteProbe({ label }) {
  const location = useLocation();
  return <p data-testid="route-probe">{label}:{location.pathname}</p>;
}

function TestApp({ initialEntries = [{ pathname: '/body-reset' }] }) {
  return (
    <MemoryRouter initialEntries={initialEntries}>
      <Routes>
        <Route path="/body-reset" element={<BodyResetPage />} />
        <Route path="/train" element={<RouteProbe label="train" />} />
        <Route path="/body-reset/history" element={<RouteProbe label="history" />} />
      </Routes>
    </MemoryRouter>
  );
}

beforeEach(() => {
  authState.language = 'en';
});

afterEach(() => {
  cleanup();
});

describe('Pressure Reset — shared practice shell (Stage 7)', () => {
  test('opens on exactly one intro screen with one Start action, not directly on the wizard', async () => {
    render(<TestApp />);

    expect(screen.getAllByText('Pressure Reset').length).toBeGreaterThan(0);
    expect(screen.getByRole('button', { name: 'Start' })).toBeTruthy();
    expect(screen.queryByText('How are you feeling in your body?')).toBeNull();
  });

  test('the "why this works" disclosure is collapsed by default and expands on tap', async () => {
    render(<TestApp />);
    const user = userEvent.setup();

    const toggle = screen.getByRole('button', { name: /Why this works/i });
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    expect(screen.queryByText(/reset switch/i)).toBeNull();

    await user.click(toggle);
    expect(toggle.getAttribute('aria-expanded')).toBe('true');
    expect(screen.getByText(/reset switch/i)).toBeTruthy();
  });

  test('Start advances from intro into the existing feeling question', async () => {
    render(<TestApp />);
    const user = userEvent.setup();

    await user.click(screen.getByRole('button', { name: 'Start' }));
    expect(await screen.findByText('How are you feeling in your body?')).toBeTruthy();
    // The merged context question is still on the same screen, unchanged.
    expect(screen.getByText('What is the situation?')).toBeTruthy();
  });

  test('the intro "View history" secondary action still navigates to /body-reset/history', async () => {
    render(<TestApp />);
    const user = userEvent.setup();

    await user.click(screen.getByRole('button', { name: /View history/i }));
    expect(await screen.findByTestId('route-probe')).toHaveProperty('textContent', 'history:/body-reset/history');
  });

  test('back from intro exits to /train, matching the pre-shell exit destination', async () => {
    render(<TestApp />);
    const user = userEvent.setup();

    const backButtons = screen.getAllByRole('button');
    const backButton = backButtons.find(b => b.querySelector('svg') && !b.textContent.trim());
    await user.click(backButton);

    expect(await screen.findByTestId('route-probe')).toHaveProperty('textContent', 'train:/train');
  });

  test('a crisis keyword in the custom feeling text still routes to the safety screen with HelplineList and reports the event', async () => {
    const { apiFetch } = await import('../src/api');
    render(<TestApp />);
    const user = userEvent.setup();

    await user.click(screen.getByRole('button', { name: 'Start' }));
    const [feelingCustomBtn, contextCustomBtn] = screen.getAllByRole('button', { name: 'Describe it yourself' });
    await user.click(feelingCustomBtn);
    const textarea = screen.getByPlaceholderText('How does your body feel right now…');
    await user.type(textarea, 'I want to end my life');
    await user.click(contextCustomBtn);
    const contextTextarea = screen.getByPlaceholderText('What is the situation…');
    await user.type(contextTextarea, 'training');
    await user.click(screen.getByRole('button', { name: /Next/ }));

    expect(await screen.findByText(/One moment\./i)).toBeTruthy();
    expect(screen.getByText(/iCall/i)).toBeTruthy();
    expect(apiFetch).toHaveBeenCalledWith(
      '/api/safety/event',
      expect.objectContaining({ method: 'POST', body: expect.stringContaining('crisis_keyword') })
    );
  });

  test('proceeding through feeling, mode, before-rating and focus reaches the breathing screen with the same header title', async () => {
    render(<TestApp />);
    const user = userEvent.setup();

    await user.click(screen.getByRole('button', { name: 'Start' }));
    await user.click(screen.getByText('Nervous'));
    await user.click(screen.getByText('Before match'));
    await user.click(screen.getByRole('button', { name: /Next/ }));

    await user.click(await screen.findByText('Quick Reset'));

    const tensionButtons = screen.getAllByRole('button', { name: '5' });
    await user.click(tensionButtons[0]);
    await user.click(screen.getByRole('button', { name: 'Start Breathing' }));

    await user.click(await screen.findByRole('button', { name: /Skip for now/i }));

    expect(await screen.findByText('Inhale')).toBeTruthy();
    expect(screen.getAllByText('Pressure Reset').length).toBeGreaterThan(0);
  });

  test('a session launched from a matching prescription card sets up the completion link (unchanged linkage data)', async () => {
    render(<TestApp initialEntries={[{ pathname: '/body-reset', state: { prescriptionId: 'presc-1', practiceKey: 'pressure_reset' } }]} />);
    // No visible difference on intro — the linkage is read once into a ref
    // and only used at save time (covered by prescriptionCompletionLinkage.test.js).
    expect(screen.getAllByText('Pressure Reset').length).toBeGreaterThan(0);
  });

  test('Hindi: intro renders bilingual copy correctly', async () => {
    authState.language = 'hi';
    render(<TestApp />);

    expect(screen.getAllByText('Pressure Reset').length).toBeGreaterThan(0);
    expect(screen.getByRole('button', { name: 'शुरू करो' })).toBeTruthy();
    expect(screen.getByRole('button', { name: /यह क्यों काम करता है/i })).toBeTruthy();
  });
});
