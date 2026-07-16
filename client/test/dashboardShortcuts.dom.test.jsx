// Real render + click interaction tests for the Dashboard problem
// shortcuts (PR-1 bug fix). Unlike the rest of the suite (source-text
// assertions on raw file contents, because plain node:test can't run
// JSX), this file runs under vitest + jsdom + React Testing Library so
// we can actually click the buttons and observe navigation/state,
// exactly like an athlete would.

import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';

const mockNavigate = vi.fn();

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return { ...actual, useNavigate: () => mockNavigate };
});

vi.mock('../src/contexts/AuthContext', () => ({
  useAuth: () => ({
    user: { name: 'Test Athlete', xp: 40 },
    token: 'test-token',
    language: 'en',
  }),
}));

vi.mock('../src/api', () => ({
  // Never resolves during the test — Dashboard's loading branch isn't
  // what we're testing, and an unresolved promise keeps the mocked
  // fetch from ever settling into a state we'd have to account for.
  apiFetch: vi.fn(() => new Promise(() => {})),
}));

// Real component, mounted for real.
const { default: Dashboard } = await import('../src/pages/Dashboard.jsx');

function renderDashboard() {
  return render(
    <MemoryRouter initialEntries={['/dashboard']}>
      <Dashboard />
    </MemoryRouter>
  );
}

beforeEach(() => {
  mockNavigate.mockClear();
  localStorage.clear();
});

afterEach(() => {
  cleanup();
});

describe('Dashboard problem shortcuts — real click + navigation', () => {
  test('shortcuts render in their own "Need help right now?" section, structurally separate from Today\'s Mental Rep', async () => {
    const { apiFetch } = await import('../src/api');
    apiFetch.mockImplementation(() => Promise.resolve({ ok: true, json: async () => ({}) }));

    renderDashboard();

    const heading = await screen.findByText('Need help right now?');
    const nervousButton = await screen.findByRole('button', { name: "I'm nervous" });
    const trainingChip = await screen.findByRole('button', { name: 'Training today' });

    // The shortcut lives after its own section heading, and the context
    // picker chip is a different DOM subtree entirely (not a shared parent
    // beyond <main>).
    expect(heading.compareDocumentPosition(nervousButton) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(nervousButton.closest('main')).toBe(trainingChip.closest('main'));
    expect(nervousButton.parentElement).not.toBe(trainingChip.parentElement);
  });


  // Dashboard renders its content only once `loaded` is true, which
  // normally waits on the /api/playbook fetch. Since that fetch never
  // resolves in this test, exercise the loading-skeleton branch is
  // skipped — instead we assert the shortcuts render once loaded by
  // driving `loaded` via a resolvable apiFetch per-test where needed.
  test('all four shortcuts are present and distinct from the day-context picker', async () => {
    const { apiFetch } = await import('../src/api');
    apiFetch.mockImplementation(() => Promise.resolve({ ok: true, json: async () => ({}) }));

    renderDashboard();

    // Context picker chips (must remain, unaffected)
    expect(await screen.findByRole('button', { name: 'Training today' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Match today' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Recovery day' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Just a rep' })).toBeTruthy();

    // Problem shortcuts — separate buttons, separate labels
    expect(screen.getByRole('button', { name: "I'm nervous" })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'I made a mistake' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'I need focus' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'I feel low confidence' })).toBeTruthy();
  });

  const CASES = [
    { label: "I'm nervous",            prefillContains: 'nervous' },
    { label: 'I made a mistake',       prefillContains: 'mistake' },
    { label: 'I need focus',           prefillContains: 'focus' },
    { label: 'I feel low confidence',  prefillContains: 'confidence' },
  ];

  for (const { label, prefillContains } of CASES) {
    test(`clicking "${label}" navigates to /coaching with its own visible prefill, and nothing else`, async () => {
      const { apiFetch } = await import('../src/api');
      apiFetch.mockImplementation(() => Promise.resolve({ ok: true, json: async () => ({}) }));

      renderDashboard();
      const user = userEvent.setup();

      const button = await screen.findByRole('button', { name: label });
      await user.click(button);

      expect(mockNavigate).toHaveBeenCalledTimes(1);
      const [to, options] = mockNavigate.mock.calls[0];
      expect(to).toBe('/coaching');
      expect(options).toBeTruthy();
      expect(options.state).toBeTruthy();
      expect(typeof options.state.prefillMsg).toBe('string');
      expect(options.state.prefillMsg.length).toBeGreaterThan(0);
      expect(options.state.prefillMsg.toLowerCase()).toContain(prefillContains);

      // No day-context side effect and no localStorage write from a
      // problem-shortcut click — that's the context picker's job only.
      expect(localStorage.getItem('arjun_day_context')).toBeNull();
    });
  }

  test('clicking a problem shortcut does not change the Dashboard context/recommended-tool state', async () => {
    const { apiFetch } = await import('../src/api');
    apiFetch.mockImplementation(() => Promise.resolve({ ok: true, json: async () => ({}) }));

    renderDashboard();
    const user = userEvent.setup();

    // No context picked yet, so no recommended-tool card should exist.
    expect(screen.queryByText('Pressure Reset')).toBeNull();
    expect(screen.queryByText('Reflect Like an Athlete')).toBeNull();

    await user.click(await screen.findByRole('button', { name: "I'm nervous" }));

    // Still no recommended-tool card after the shortcut click — proves
    // the shortcut never touched dayContext.
    expect(screen.queryByText('Pressure Reset')).toBeNull();
    expect(screen.queryByText('Reflect Like an Athlete')).toBeNull();
  });

  test('the day-context picker still works and is unaffected by the shortcuts existing', async () => {
    const { apiFetch } = await import('../src/api');
    apiFetch.mockImplementation(() => Promise.resolve({ ok: true, json: async () => ({}) }));

    renderDashboard();
    const user = userEvent.setup();

    await user.click(await screen.findByRole('button', { name: 'Match today' }));

    // Picking a context is a same-page state update, not a navigation.
    expect(mockNavigate).not.toHaveBeenCalled();
    expect(localStorage.getItem('arjun_day_context')).toContain('match');
    expect(await screen.findByText('Pressure Reset')).toBeTruthy();
  });

  test('shortcuts still work correctly when a day-context (and its recommended-tool card) is already picked', async () => {
    // Reproduces the exact reported scenario: dayContext is already
    // persisted from earlier in the day (as it would be for a returning
    // athlete), so the recommended-tool card renders above the
    // shortcuts row before any shortcut is ever clicked.
    localStorage.setItem('arjun_day_context', JSON.stringify({
      date: new Date().toISOString().slice(0, 10),
      context: 'match',
    }));
    const { apiFetch } = await import('../src/api');
    apiFetch.mockImplementation(() => Promise.resolve({ ok: true, json: async () => ({}) }));

    renderDashboard();
    const user = userEvent.setup();

    // Sanity: the recommended-tool card is indeed present, same as a
    // real returning athlete would see.
    expect(await screen.findByText('Pressure Reset')).toBeTruthy();

    await user.click(await screen.findByRole('button', { name: "I'm nervous" }));

    expect(mockNavigate).toHaveBeenCalledTimes(1);
    const [to, options] = mockNavigate.mock.calls[0];
    expect(to).toBe('/coaching');
    expect(options.state.prefillMsg.toLowerCase()).toContain('nervous');
    // The pre-existing context selection must be untouched by the click.
    expect(JSON.parse(localStorage.getItem('arjun_day_context')).context).toBe('match');
  });

  test('no problem shortcut ever navigates to a game, Pressure Reset, or a skill path', async () => {
    const { apiFetch } = await import('../src/api');
    apiFetch.mockImplementation(() => Promise.resolve({ ok: true, json: async () => ({}) }));

    renderDashboard();
    const user = userEvent.setup();

    for (const { label } of CASES) {
      mockNavigate.mockClear();
      await user.click(await screen.findByRole('button', { name: label }));
      const [to] = mockNavigate.mock.calls[0];
      expect(to).not.toMatch(/\/games\/|\/skills\/|\/body-reset|\/self-talk/);
    }
  });
});
