// Submit, draft-recovery, and completed-user guard tests for PR 1 onboarding.
// Real router + real page; only useAuth and apiFetch mocked.

import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route } from 'react-router-dom';

const authState = {
  user: { id: 'u1', onboardingDone: false, name: 'Test Athlete' },
  token: 'test-token',
  language: 'en',
  updateUser: vi.fn(),
};
vi.mock('../src/contexts/AuthContext', () => ({ useAuth: () => authState }));
vi.mock('../src/api', () => ({ apiFetch: vi.fn() }));

const { default: OnboardingPage } = await import('../src/pages/OnboardingPage.jsx');
const { apiFetch } = await import('../src/api');

function TestApp() {
  return (
    <MemoryRouter initialEntries={['/onboarding']}>
      <Routes>
        <Route path="/onboarding" element={<OnboardingPage />} />
        <Route path="/mind-journal" element={<p>mind journal landing</p>} />
      </Routes>
    </MemoryRouter>
  );
}

const cont = () => screen.getByRole('button', { name: /^(Continue|Finish)$/ });
const DRAFT_KEY = 'arjun_onboarding_draft_u1';

// Fill screens 1–4 with predefined answers, leaving the goals screen open.
async function fillToGoals(user) {
  await user.click(screen.getByRole('radio', { name: 'Cricket' }));
  await user.click(cont());
  await user.click(await screen.findByRole('radio', { name: 'No fixed role' }));
  await user.click(cont());
  await user.click(await screen.findByRole('radio', { name: 'State level' }));
  await user.click(screen.getByRole('radio', { name: /Semi-serious/ }));
  await user.click(cont());
  await user.click(await screen.findByRole('radio', { name: 'Finding it hard to stay focused' }));
  await user.click(cont());
  await screen.findByRole('checkbox', { name: 'Focus & Concentration' });
}

beforeEach(() => {
  localStorage.clear();
  authState.language = 'en';
  authState.user = { id: 'u1', onboardingDone: false, name: 'Test Athlete' };
  apiFetch.mockReset();
});
afterEach(() => cleanup());

describe('Onboarding submit & draft', () => {
  test('successful submit sends the derived payload, clears the draft, and lands on Mind Journal', async () => {
    apiFetch.mockResolvedValue({ ok: true, json: async () => ({ user: { onboardingDone: true } }) });
    render(<TestApp />);
    const user = userEvent.setup();
    await fillToGoals(user);
    await user.click(screen.getByRole('checkbox', { name: 'Focus & Concentration' }));
    await user.click(screen.getByRole('button', { name: 'Finish' }));

    await screen.findByText('mind journal landing');
    expect(apiFetch).toHaveBeenCalledTimes(1);
    const [url, init] = apiFetch.mock.calls[0];
    expect(url).toBe('/api/auth/me/onboarding');
    expect(init.method).toBe('PATCH');
    const body = JSON.parse(init.body);
    expect(body).toMatchObject({
      sport: 'cricket',
      position: 'No fixed role',
      competitionLevel: 'state',
      experienceLevel: 'competitive',
      primaryChallenge: 'focus',
      goals: ['focus'],
      language: 'en',
    });
    // draft cleared after success
    expect(localStorage.getItem(DRAFT_KEY)).toBeNull();
    expect(authState.updateUser).toHaveBeenCalled();
  });

  test('custom answers are sanitised and sent correctly', async () => {
    apiFetch.mockResolvedValue({ ok: true, json: async () => ({ user: { onboardingDone: true } }) });
    render(<TestApp />);
    const user = userEvent.setup();

    // sport = custom
    await user.click(screen.getByRole('radio', { name: 'Other sport' }));
    await user.type(screen.getByLabelText('Your sport'), '  Ultimate Frisbee ');
    await user.click(cont());
    // role = custom
    await user.click(await screen.findByRole('radio', { name: 'My role or event is different' }));
    await user.type(screen.getByLabelText('Your role, position or event'), 'Handler');
    await user.click(cont());
    // competition = custom, experience predefined
    await user.click(await screen.findByRole('radio', { name: 'Other' }));
    await user.type(screen.getByLabelText('Your competition level'), 'College league');
    await user.click(screen.getByRole('radio', { name: /Semi-serious/ }));
    await user.click(cont());
    // starting = custom
    await user.click(await screen.findByRole('radio', { name: 'My situation is different' }));
    await user.type(screen.getByLabelText('Your situation'), 'Big-game jitters');
    await user.click(cont());
    // goal
    await user.click(await screen.findByRole('checkbox', { name: 'Building Confidence' }));
    await user.click(screen.getByRole('button', { name: 'Finish' }));

    await screen.findByText('mind journal landing');
    const body = JSON.parse(apiFetch.mock.calls[0][1].body);
    expect(body.sport).toBe('Ultimate Frisbee'); // trimmed
    expect(body.position).toBe('Handler');
    expect(body.competitionLevel).toBe('College league');
    expect(body.primaryChallenge).toBe('Big-game jitters');
    expect(body.goals).toEqual(['confidence']);
  });

  test('submit failure shows an error, keeps the draft, and allows retry', async () => {
    apiFetch.mockResolvedValueOnce({ ok: false, json: async () => ({ error: 'Server error' }) });
    render(<TestApp />);
    const user = userEvent.setup();
    await fillToGoals(user);
    await user.click(screen.getByRole('checkbox', { name: 'Focus & Concentration' }));
    await user.click(screen.getByRole('button', { name: 'Finish' }));

    // error surfaced, still on the form, draft retained
    expect(await screen.findByRole('alert')).toBeTruthy();
    expect(screen.getByText('Server error')).toBeTruthy();
    expect(localStorage.getItem(DRAFT_KEY)).not.toBeNull();
    expect(screen.queryByText('mind journal landing')).toBeNull();

    // retry succeeds
    apiFetch.mockResolvedValueOnce({ ok: true, json: async () => ({ user: { onboardingDone: true } }) });
    await user.click(screen.getByRole('button', { name: 'Finish' }));
    await screen.findByText('mind journal landing');
    expect(apiFetch).toHaveBeenCalledTimes(2);
  });

  test('local draft recovers the current screen and answers after a remount (refresh)', async () => {
    apiFetch.mockResolvedValue({ ok: true, json: async () => ({ user: {} }) });
    const first = render(<TestApp />);
    const user = userEvent.setup();
    await user.click(screen.getByRole('radio', { name: 'Cricket' }));
    await user.click(cont());
    // now on the role screen; simulate a refresh
    await screen.findByRole('heading', { name: "What's your role, position or event?" });
    first.unmount();

    render(<TestApp />);
    // restored straight back onto the role screen with cricket retained
    expect(await screen.findByRole('heading', { name: "What's your role, position or event?" })).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Back' }));
    expect((await screen.findByRole('radio', { name: 'Cricket' })).getAttribute('aria-checked')).toBe('true');
  });

  test('a completed user is redirected away and never sees the editable form', async () => {
    authState.user = { id: 'u1', onboardingDone: true, name: 'Test Athlete' };
    render(<TestApp />);
    await waitFor(() => expect(screen.getByText('mind journal landing')).toBeTruthy());
    expect(screen.queryByRole('heading', { name: 'What sport do you play?' })).toBeNull();
  });

  test('completed-user guard clears any stale local draft', async () => {
    localStorage.setItem(DRAFT_KEY, JSON.stringify({ v: 1, userId: 'u1', data: { screen: 2 } }));
    authState.user = { id: 'u1', onboardingDone: true, name: 'Test Athlete' };
    render(<TestApp />);
    await waitFor(() => expect(localStorage.getItem(DRAFT_KEY)).toBeNull());
  });

  test('custom text field auto-focuses when revealed (keyboard contract)', async () => {
    render(<TestApp />);
    const user = userEvent.setup();
    await user.click(screen.getByRole('radio', { name: 'Other sport' }));
    const input = screen.getByLabelText('Your sport');
    await waitFor(() => expect(document.activeElement).toBe(input));
  });
});
