// Short onboarding (Nov 2026): after the 4 screens, /welcome asks for the
// next match, then offers the Mind Challenge as the first reward. The
// starting profile is confirmed quietly in the background.
import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom';

vi.mock('../src/contexts/AuthContext', () => ({
  useAuth: () => ({ user: { name: 'Rohan Sharma' }, token: 't', language: 'en' }),
}));
vi.mock('../src/api', () => ({ apiFetch: vi.fn() }));
const { apiFetch } = await import('../src/api');
const { default: WelcomePage } = await import('../src/pages/WelcomePage');

function Probe() { const l = useLocation(); return <p>{`at:${l.pathname}:${!!l.state?.firstRun}`}</p>; }
const app = () => render(
  <MemoryRouter initialEntries={['/welcome']}>
    <Routes>
      <Route path="/welcome" element={<WelcomePage />} />
      <Route path="/mind-challenge" element={<Probe />} />
      <Route path="/dashboard" element={<Probe />} />
    </Routes>
  </MemoryRouter>,
);

beforeEach(() => {
  apiFetch.mockReset();
  apiFetch.mockImplementation((url) => Promise.resolve({ ok: true, json: async () => (url === '/api/path/match' ? { match: { nextDay: null } } : {}) }));
});
afterEach(() => cleanup());

describe('first-run welcome', () => {
  test('confirms the profile quietly, asks for the match day, then offers the Mind Challenge', async () => {
    app();
    await waitFor(() => expect(apiFetch).toHaveBeenCalledWith('/api/profile/confirm', expect.objectContaining({ method: 'POST', body: JSON.stringify({ fit: 'CONFIRMED' }) })));
    expect(screen.getByText('Which day is your match?')).toBeTruthy();
    fireEvent.click(screen.getAllByRole('radio')[2]);
    fireEvent.click(screen.getByTestId('match-save'));
    await waitFor(() => expect(apiFetch).toHaveBeenCalledWith('/api/path/match', expect.objectContaining({ method: 'PUT' })));
    expect(await screen.findByText('How strong is your mind game, Rohan?')).toBeTruthy();
    fireEvent.click(screen.getByTestId('welcome-play'));
    expect(await screen.findByText('at:/mind-challenge:true')).toBeTruthy();
  });

  test('"No match soon" skips the day; "Skip for now" goes Home', async () => {
    app();
    fireEvent.click(await screen.findByRole('button', { name: 'No match soon' }));
    expect(await screen.findByText('How strong is your mind game, Rohan?')).toBeTruthy();
    expect(apiFetch).not.toHaveBeenCalledWith('/api/path/match', expect.anything());
    fireEvent.click(screen.getByRole('button', { name: 'Skip for now' }));
    expect(await screen.findByText('at:/dashboard:false')).toBeTruthy();
  });
});
