// Behavioural tests for the PR 1 onboarding flow: selection, validation,
// custom answers, multi-select limits, and answer preservation across
// Back/Continue. Real router + real page; only useAuth and apiFetch mocked.

import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route } from 'react-router-dom';

const authState = {
  user: { id: 'u1', onboardingDone: false, name: 'Test Athlete' },
  token: 'test-token',
  language: 'en',
  updateUser: vi.fn(),
};
vi.mock('../src/contexts/AuthContext', () => ({ useAuth: () => authState }));
vi.mock('../src/api', () => ({
  apiFetch: vi.fn(() => Promise.resolve({ ok: true, json: async () => ({ user: {} }) })),
}));

const { default: OnboardingPage } = await import('../src/pages/OnboardingPage.jsx');

function TestApp() {
  return (
    <MemoryRouter initialEntries={['/onboarding']}>
      <Routes>
        <Route path="/onboarding" element={<OnboardingPage />} />
        <Route path="/mind-journal" element={<p>mind journal</p>} />
      </Routes>
    </MemoryRouter>
  );
}

const cont = () => screen.getByRole('button', { name: /^(Continue|Finish)$/ });

beforeEach(() => {
  localStorage.clear();
  authState.language = 'en';
  authState.user = { id: 'u1', onboardingDone: false, name: 'Test Athlete' };
});
afterEach(() => cleanup());

describe('Onboarding flow — selection & validation', () => {
  test('Continue is gated until a sport is chosen', async () => {
    render(<TestApp />);
    const user = userEvent.setup();
    expect(cont().disabled).toBe(true);
    await user.click(screen.getByRole('radio', { name: 'Cricket' }));
    expect(cont().disabled).toBe(false);
  });

  test('custom sport: reveals an input, rejects whitespace-only, accepts a real value', async () => {
    render(<TestApp />);
    const user = userEvent.setup();
    await user.click(screen.getByRole('radio', { name: 'Other sport' }));
    const input = screen.getByLabelText('Your sport');
    expect(input).toBeTruthy();
    // whitespace-only does not satisfy validation
    await user.type(input, '   ');
    expect(cont().disabled).toBe(true);
    await user.clear(input);
    await user.type(input, 'Ultimate Frisbee');
    expect(cont().disabled).toBe(false);
  });

  test('role screen shows sport-specific roles plus the fixed escapes, and a custom field', async () => {
    render(<TestApp />);
    const user = userEvent.setup();
    await user.click(screen.getByRole('radio', { name: 'Cricket' }));
    await user.click(cont());

    // cricket-specific
    expect(await screen.findByRole('radio', { name: 'Batter' })).toBeTruthy();
    expect(screen.getByRole('radio', { name: 'Wicketkeeper' })).toBeTruthy();
    // fixed escapes always present
    expect(screen.getByRole('radio', { name: 'No fixed role' })).toBeTruthy();
    expect(screen.getByRole('radio', { name: "I'm not sure" })).toBeTruthy();
    // custom
    await user.click(screen.getByRole('radio', { name: 'My role or event is different' }));
    expect(screen.getByLabelText('Your role, position or event')).toBeTruthy();
  });

  test('"No fixed role" and "I\'m not sure" are each valid answers on their own', async () => {
    render(<TestApp />);
    const user = userEvent.setup();
    await user.click(screen.getByRole('radio', { name: 'Cricket' }));
    await user.click(cont());
    expect(cont().disabled).toBe(true);
    await user.click(await screen.findByRole('radio', { name: "I'm not sure" }));
    expect(cont().disabled).toBe(false);
    await user.click(screen.getByRole('radio', { name: 'No fixed role' }));
    expect(cont().disabled).toBe(false);
  });

  test('playing-context screen requires BOTH competition and experience', async () => {
    render(<TestApp />);
    const user = userEvent.setup();
    await user.click(screen.getByRole('radio', { name: 'Cricket' }));
    await user.click(cont());
    await user.click(await screen.findByRole('radio', { name: 'No fixed role' }));
    await user.click(cont());

    // Only competition chosen → still blocked
    await user.click(await screen.findByRole('radio', { name: 'State level' }));
    expect(cont().disabled).toBe(true);
    // Add experience → unblocked
    await user.click(screen.getByRole('radio', { name: /Semi-serious/ }));
    expect(cont().disabled).toBe(false);
  });

  test('custom competition level reveals an input', async () => {
    render(<TestApp />);
    const user = userEvent.setup();
    await user.click(screen.getByRole('radio', { name: 'Cricket' }));
    await user.click(cont());
    await user.click(await screen.findByRole('radio', { name: 'No fixed role' }));
    await user.click(cont());
    await user.click(await screen.findByRole('radio', { name: 'Other' }));
    expect(screen.getByLabelText('Your competition level')).toBeTruthy();
  });

  test('starting-area custom answer reveals an input', async () => {
    render(<TestApp />);
    const user = userEvent.setup();
    await user.click(screen.getByRole('radio', { name: 'Cricket' }));
    await user.click(cont());
    await user.click(await screen.findByRole('radio', { name: 'No fixed role' }));
    await user.click(cont());
    await user.click(await screen.findByRole('radio', { name: 'State level' }));
    await user.click(screen.getByRole('radio', { name: /Semi-serious/ }));
    await user.click(cont());
    await user.click(await screen.findByRole('radio', { name: 'My situation is different' }));
    expect(screen.getByLabelText('Your situation')).toBeTruthy();
  });

  test('goals: multi-select, 3-item cap disables further picks, and a live count is announced', async () => {
    render(<TestApp />);
    const user = userEvent.setup();
    await user.click(screen.getByRole('radio', { name: 'Cricket' }));
    await user.click(cont());
    await user.click(await screen.findByRole('radio', { name: 'No fixed role' }));
    await user.click(cont());
    await user.click(await screen.findByRole('radio', { name: 'State level' }));
    await user.click(screen.getByRole('radio', { name: /Semi-serious/ }));
    await user.click(cont());
    await user.click(await screen.findByRole('radio', { name: 'Finding it hard to stay focused' }));
    await user.click(cont());

    // On the goals screen — checkboxes now.
    const g1 = await screen.findByRole('checkbox', { name: 'Focus & Concentration' });
    const g2 = screen.getByRole('checkbox', { name: 'Handling Pressure' });
    const g3 = screen.getByRole('checkbox', { name: 'Nerves Before Performing' });
    const g4 = screen.getByRole('checkbox', { name: 'Building Confidence' });

    await user.click(g1);
    await user.click(g2);
    await user.click(g3);
    // Fourth is now disabled (max 3) but remains readable.
    expect(g4.getAttribute('aria-disabled')).toBe('true');
    expect(g4.disabled).toBe(true);
    // Live region announces the max.
    expect(screen.getAllByText('Maximum of 3 selected').length).toBeGreaterThan(0);

    // Deselecting one re-enables the fourth.
    await user.click(g3);
    expect(screen.getByRole('checkbox', { name: 'Building Confidence' }).disabled).toBe(false);
  });

  test('answers are preserved when navigating Back', async () => {
    render(<TestApp />);
    const user = userEvent.setup();
    await user.click(screen.getByRole('radio', { name: 'Cricket' }));
    await user.click(cont());
    await user.click(await screen.findByRole('radio', { name: 'No fixed role' }));
    // go Back to the sport screen
    await user.click(screen.getByRole('button', { name: 'Back' }));
    const cricket = await screen.findByRole('radio', { name: 'Cricket' });
    expect(cricket.getAttribute('aria-checked')).toBe('true');
    // forward again — role choice retained
    await user.click(cont());
    expect((await screen.findByRole('radio', { name: 'No fixed role' })).getAttribute('aria-checked')).toBe('true');
  });
});
