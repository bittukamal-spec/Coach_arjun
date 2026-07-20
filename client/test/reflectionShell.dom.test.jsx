// Real ROUTER integration tests for Stage 8 (Reflection/Debrief migration
// onto the Stage 6/7 shared practice shell). Mounts the real page under a
// real <MemoryRouter>, mirroring the pattern established in
// pressureResetShell.dom.test.jsx: only useAuth and apiFetch are mocked,
// everything else (routing, the PracticeShell components, the wizard's own
// state machine, self-abuse detection, submission) runs for real.

import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom';

const authState = { user: { sport: 'football', cueWord: null }, token: 'test-token', language: 'en', updateUser: vi.fn() };
vi.mock('../src/contexts/AuthContext', () => ({
  useAuth: () => authState,
}));

const apiFetchMock = vi.fn((url, opts) => {
  if (url === '/api/debrief' && (!opts || opts.method === undefined)) {
    return Promise.resolve({ ok: true, json: async () => ({ todayDebrief: authState.todayDebrief || null }) });
  }
  if (url === '/api/debrief' && opts?.method === 'POST') {
    return Promise.resolve({
      ok: true,
      status: 200,
      json: async () => ({
        insight: 'Solid effort. Keep watching the ball early.',
        pattern: null,
        nextFocus: 'First touch',
        xp: 120,
        recentEntries: [],
      }),
    });
  }
  if (typeof url === 'string' && url.startsWith('/api/prescriptions/')) {
    return Promise.resolve({ ok: true, json: async () => ({}) });
  }
  return Promise.resolve({ ok: true, json: async () => ({}) });
});
vi.mock('../src/api', () => ({
  apiFetch: (...args) => apiFetchMock(...args),
}));

const { default: DebriefPage } = await import('../src/pages/DebriefPage.jsx');

function RouteProbe({ label }) {
  const location = useLocation();
  return <p data-testid="route-probe">{label}:{location.pathname}</p>;
}

function TestApp({ initialEntries = [{ pathname: '/debrief' }] }) {
  return (
    <MemoryRouter initialEntries={initialEntries}>
      <Routes>
        <Route path="/debrief" element={<DebriefPage />} />
        <Route path="/train" element={<RouteProbe label="train" />} />
      </Routes>
    </MemoryRouter>
  );
}

beforeEach(() => {
  authState.language = 'en';
  authState.user = { sport: 'football', cueWord: null };
  authState.todayDebrief = null;
  apiFetchMock.mockClear();
});

afterEach(() => {
  cleanup();
});

describe('Reflection — shared practice shell (Stage 8)', () => {
  test('opens on exactly one intro screen with one Start action, not directly on the wizard', async () => {
    render(<TestApp />);

    expect(screen.getAllByText('Reflection').length).toBeGreaterThan(0);
    expect(screen.getByRole('button', { name: /Start review/i })).toBeTruthy();
    expect(screen.queryByText('How much time do you have?')).toBeNull();
  });

  test('Start advances from intro into the entry mode-pick screen', async () => {
    render(<TestApp />);
    const user = userEvent.setup();

    await user.click(screen.getByRole('button', { name: /Start review/i }));
    expect(await screen.findByText('How much time do you have?')).toBeTruthy();
    expect(screen.getByText('Quick review')).toBeTruthy();
    expect(screen.getByText('Full review')).toBeTruthy();
  });

  test('back from intro exits to /train', async () => {
    render(<TestApp />);
    const user = userEvent.setup();

    const backButtons = screen.getAllByRole('button');
    const backButton = backButtons.find(b => b.querySelector('svg') && !b.textContent.trim());
    await user.click(backButton);

    expect(await screen.findByTestId('route-probe')).toHaveProperty('textContent', 'train:/train');
  });

  test('back from the entry mode-pick screen also exits to /train', async () => {
    render(<TestApp />);
    const user = userEvent.setup();

    await user.click(screen.getByRole('button', { name: /Start review/i }));
    await screen.findByText('How much time do you have?');

    const backButtons = screen.getAllByRole('button');
    const backButton = backButtons.find(b => b.querySelector('svg') && !b.textContent.trim());
    await user.click(backButton);

    expect(await screen.findByTestId('route-probe')).toHaveProperty('textContent', 'train:/train');
  });

  test('an existing today review shows the already-done screen instead of the wizard', async () => {
    authState.todayDebrief = { arjunInsight: 'Great composure today.', nextFocus: 'Stay calm', eventType: 'Match', resultType: 'Good result + good performance' };
    render(<TestApp />);
    const user = userEvent.setup();

    await user.click(screen.getByRole('button', { name: /Start review/i }));
    expect(await screen.findByText("You've already reviewed today ✓")).toBeTruthy();
    expect(screen.getByText('Great composure today.')).toBeTruthy();

    await user.click(screen.getByRole('button', { name: /Back to training/i }));
    expect(await screen.findByTestId('route-probe')).toHaveProperty('textContent', 'train:/train');
  });

  test('full mode: self-abuse text still shows the warning and helpline', async () => {
    render(<TestApp />);
    const user = userEvent.setup();

    await user.click(screen.getByRole('button', { name: /Start review/i }));
    await user.click(await screen.findByText('Full review'));

    await user.click(screen.getByText('Match'));
    await user.click(screen.getByText('Good result + good performance'));
    await screen.findByText('What should you keep from today?');

    await user.click(screen.getByText('Effort'));
    await user.click(screen.getByRole('button', { name: /Next/ }));

    await screen.findByText('What would you change next time?');
    await user.click(screen.getByText('Start sharper'));
    const textarea = screen.getByPlaceholderText('What specifically? (optional)');
    await user.type(textarea, 'I am so stupid');

    expect(await screen.findByText(/Don't label yourself/i)).toBeTruthy();
    expect(screen.getByText(/iCall 9152987821/i)).toBeTruthy();
  });

  test('quick mode: full submission flow saves the same payload shape and completes a linked prescription', async () => {
    render(<TestApp initialEntries={[{ pathname: '/debrief', state: { prescriptionId: 'presc-1', practiceKey: 'post_performance_reflection' } }]} />);
    const user = userEvent.setup();

    await user.click(screen.getByRole('button', { name: /Start review/i }));
    await user.click(await screen.findByText('Quick review'));

    await screen.findByText('What did you just finish?');
    await user.click(screen.getByText('Match'));
    await user.click(screen.getByText('Good result + good performance'));

    await screen.findByText('What should you keep from today?', {}, { timeout: 2000 });
    await user.click(screen.getByText('Effort'));
    await user.click(screen.getByRole('button', { name: /Next/ }));

    await screen.findByText('What would you change next time?');
    await user.click(screen.getByText('Start sharper'));
    await user.click(screen.getByRole('button', { name: /Next/ }));

    await screen.findByText('One thing to focus on next time.');
    await user.click(screen.getByText('First touch'));

    expect(await screen.findByText(/Solid effort\. Keep watching the ball early\./i, {}, { timeout: 3000 })).toBeTruthy();

    const submitCall = apiFetchMock.mock.calls.find(([url, opts]) => url === '/api/debrief' && opts?.method === 'POST');
    expect(submitCall).toBeTruthy();
    const payload = JSON.parse(submitCall[1].body);
    expect(payload.mode).toBe('quick');
    expect(payload.eventType).toBe('Match');
    expect(payload.resultType).toBe('Good result + good performance');
    expect(payload.wentWellChips).toEqual(['Effort']);
    expect(payload.wouldChange).toBe('Start sharper');
    expect(payload.nextFocus).toBe('First touch');

    expect(await screen.findByText(/\+15 MXP/i)).toBeTruthy();

    const prescriptionCall = apiFetchMock.mock.calls.find(([url]) => typeof url === 'string' && url.startsWith('/api/prescriptions/'));
    expect(prescriptionCall).toBeTruthy();
    expect(prescriptionCall[0]).toBe('/api/prescriptions/presc-1/complete');
    expect(JSON.parse(prescriptionCall[1].body)).toEqual({ practiceKey: 'post_performance_reflection' });
  });

  test('full mode with a saved cue word reaches the cue-word feedback step before done', async () => {
    authState.user = { sport: 'football', cueWord: 'Reset' };
    render(<TestApp />);
    const user = userEvent.setup();

    await user.click(screen.getByRole('button', { name: /Start review/i }));
    await user.click(await screen.findByText('Full review'));

    await user.click(screen.getByText('Match'));
    await user.click(screen.getByText('Good result + good performance'));
    await screen.findByText('What should you keep from today?');
    await user.click(screen.getByText('Effort'));
    await user.click(screen.getByRole('button', { name: /Next/ }));

    await screen.findByText('What would you change next time?');
    await user.click(screen.getByText('Start sharper'));
    await user.click(screen.getByRole('button', { name: /Next/ }));

    await screen.findByText('One thing to focus on next time.');
    await user.click(screen.getByText('First touch'));

    expect(await screen.findByText('Did your cue word help today?')).toBeTruthy();
    expect(screen.getByText('Reset')).toBeTruthy();
  });

  test('Hindi: intro renders bilingual copy correctly, tool name stays "Reflection"', async () => {
    authState.language = 'hi';
    render(<TestApp />);

    expect(screen.getAllByText('Reflection').length).toBeGreaterThan(0);
    expect(screen.getByRole('button', { name: 'समीक्षा शुरू करो →' })).toBeTruthy();
  });
});
