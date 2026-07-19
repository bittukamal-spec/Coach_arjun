// Real ROUTER integration tests for Stage 6 (Shared practice shell), proven
// first on Quick Rep (MentalRepPage). Mounts the real page under a real
// <MemoryRouter>, mirroring the pattern established in
// dashboardShortcuts.dom.test.jsx and navigationIaCleanup.dom.test.jsx:
// only useAuth and apiFetch are mocked, everything else (routing, the
// PracticeShell components, the wizard's own state machine) runs for real.

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

const { default: MentalRepPage } = await import('../src/pages/MentalRepPage.jsx');

function RouteProbe({ label }) {
  const location = useLocation();
  return <p data-testid="route-probe">{label}:{location.pathname}</p>;
}

function TestApp({ initialEntries = [{ pathname: '/mental-rep' }] }) {
  return (
    <MemoryRouter initialEntries={initialEntries}>
      <Routes>
        <Route path="/mental-rep" element={<MentalRepPage />} />
        <Route path="/dashboard" element={<RouteProbe label="dashboard" />} />
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

describe('Quick Rep — shared practice shell (Stage 6)', () => {
  test('opens on exactly one intro screen with one Start action, not directly on the wizard', async () => {
    render(<TestApp />);

    expect(screen.getByText('Quick Rep')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Start' })).toBeTruthy();
    // The first wizard question must not be visible yet.
    expect(screen.queryByText('What are you preparing for?')).toBeNull();
  });

  test('the "why this works" disclosure is collapsed by default and expands on tap', async () => {
    render(<TestApp />);
    const user = userEvent.setup();

    const toggle = screen.getByRole('button', { name: /Why this works/i });
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    expect(screen.queryByText(/process focus/i)).toBeNull();

    await user.click(toggle);
    expect(toggle.getAttribute('aria-expanded')).toBe('true');
    expect(screen.getByText(/process focus/i)).toBeTruthy();
  });

  test('Start advances from intro into the existing context question', async () => {
    render(<TestApp />);
    const user = userEvent.setup();

    await user.click(screen.getByRole('button', { name: 'Start' }));
    expect(await screen.findByText('What are you preparing for?')).toBeTruthy();
  });

  test('Dashboard-preset context still skips the context question after intro (unchanged data flow)', async () => {
    render(<TestApp initialEntries={[{ pathname: '/mental-rep', state: { context: 'match' } }]} />);
    const user = userEvent.setup();

    // Intro still shows first even when Dashboard pre-answered the context.
    expect(screen.getByRole('button', { name: 'Start' })).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Start' }));

    expect(await screen.findByText('How is your mind right now?')).toBeTruthy();
    expect(screen.queryByText('What are you preparing for?')).toBeNull();
  });

  test('back from intro exits to /dashboard, matching the pre-shell exit destination', async () => {
    render(<TestApp />);
    const user = userEvent.setup();

    const backButtons = screen.getAllByRole('button');
    // The header back button is the first rendered button (icon-only, no accessible name).
    const backButton = backButtons.find(b => b.querySelector('svg') && !b.textContent.trim());
    await user.click(backButton);

    expect(await screen.findByTestId('route-probe')).toHaveProperty('textContent', 'dashboard:/dashboard');
  });

  test('completes the full rep and still posts to /api/mental-rep/complete unchanged (data/completion semantics preserved)', async () => {
    const { apiFetch } = await import('../src/api');
    render(<TestApp />);
    const user = userEvent.setup();

    await user.click(screen.getByRole('button', { name: 'Start' }));
    await user.click(await screen.findByText('Training today'));
    await user.click(await screen.findByText('Ready'));
    await user.click(await screen.findByText('First few minutes'));
    // 'ready' state's rep step is a single chip choice.
    await user.click(await screen.findByText('Strong start'));
    await user.click(await screen.findByText(/^"Strong start"$/));
    await user.click(await screen.findByRole('button', { name: /Save cue/i }));

    expect(await screen.findByText('Rep complete.')).toBeTruthy();
    expect(apiFetch).toHaveBeenCalledWith('/api/mental-rep/complete', expect.objectContaining({ method: 'POST' }));
  });

  test('Hindi: intro renders bilingual copy correctly', async () => {
    authState.language = 'hi';
    render(<TestApp />);

    expect(screen.getByText('Quick Rep')).toBeTruthy();
    expect(screen.getByText('4 मिनट में मन तैयार करो और एक cue लेकर निकलो।')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'शुरू करो' })).toBeTruthy();
  });
});
