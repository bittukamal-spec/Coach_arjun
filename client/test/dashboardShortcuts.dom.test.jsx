// Real ROUTER integration tests for the Dashboard problem shortcuts
// (hotfix for the production bug reported after PR-24: shortcuts appeared
// to change Dashboard content instead of leaving Home).
//
// Unlike the rest of the suite (source-text assertions on raw file
// contents, because plain node:test can't run JSX), this file runs under
// vitest + jsdom + React Testing Library. Crucially, this version does
// NOT mock useNavigate/react-router-dom — it mounts a real <MemoryRouter>
// with real <Routes>, so a click has to travel through the actual
// react-router-dom machinery (Link → history push → route match →
// component swap → useLocation) exactly as it does in production. A test
// that only mocks useNavigate and asserts the mock was called proves the
// onClick handler *ran*; it never proves a real <a>/click actually landed
// on that DOM node, or that the app actually ended up on a different
// route with the right location.state. This file proves the latter.

import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import { useState } from 'react';
import { render, screen, cleanup, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom';

vi.mock('../src/contexts/AuthContext', () => ({
  useAuth: () => ({
    user: { name: 'Test Athlete', xp: 40 },
    token: 'test-token',
    language: 'en',
  }),
}));

// Home no longer calls any API of its own — it used to fetch /api/playbook
// purely to gate a loading skeleton — so the module is mocked only to prove
// that nothing on this page reaches for it.
vi.mock('../src/api', () => ({
  apiFetch: vi.fn(() => new Promise(() => {})),
}));

// Real component, mounted for real.
const { default: Dashboard } = await import('../src/pages/Dashboard.jsx');

// A minimal stand-in for the real /coaching destination. It mirrors the
// exact contract ChatPage's prefillMsgRef mechanism promises: the
// composer starts pre-filled with location.state.prefillMsg, visibly, and
// nothing sends automatically. ChatPage's own real prefillMsgRef source is
// separately verified in test/pilotVisibilityCleanup.test.js; this probe
// exists only to prove ROUTING + STATE TRANSFER actually happen for real.
let sendMock;
function CoachingProbe() {
  const location = useLocation();
  const [composer, setComposer] = useState(location.state?.prefillMsg ?? '');
  return (
    <div>
      <p data-testid="pathname">{location.pathname}</p>
      <p data-testid="prefill-raw">{JSON.stringify(location.state ?? null)}</p>
      <textarea aria-label="composer" value={composer} onChange={(e) => setComposer(e.target.value)} />
      <button onClick={() => sendMock(composer)}>Send</button>
    </div>
  );
}

function TestApp({ initialEntries = ['/dashboard'] }) {
  return (
    <MemoryRouter initialEntries={initialEntries}>
      <Routes>
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/coaching" element={<CoachingProbe />} />
      </Routes>
    </MemoryRouter>
  );
}

beforeEach(async () => {
  localStorage.clear();
  sendMock = vi.fn();
  const { apiFetch } = await import('../src/api');
  apiFetch.mockClear();
});

afterEach(() => {
  cleanup();
});

describe('Dashboard problem shortcuts — real router integration', () => {
  test('shortcuts render as real links in their own "Pick what you need now" section', async () => {
    render(<TestApp />);

    const heading = await screen.findByText('Pick what you need now');
    const nervousLink = await screen.findByRole('link', { name: "I'm nervous" });

    expect(nervousLink.tagName).toBe('A');
    expect(nervousLink.getAttribute('href')).toBe('/coaching');
    expect(heading.compareDocumentPosition(nervousLink) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(nervousLink.closest('main')).toBe(heading.closest('main'));
  });

  test('Home renders its four sections with no API call and no loading skeleton', async () => {
    const { apiFetch } = await import('../src/api');
    render(<TestApp />);

    // Present immediately — nothing is gated behind a fetch any more.
    expect(screen.getByRole('heading', { level: 1, name: 'Hi, Test' })).toBeTruthy();
    expect(screen.getByText('Mind Journal')).toBeTruthy();
    expect(screen.getByText('Talk to Arjun')).toBeTruthy();
    expect(screen.getByText('Pick what you need now')).toBeTruthy();
    expect(apiFetch).not.toHaveBeenCalled();
  });

  test('the "What\'s today?" selector and its recommended practice are gone from Home', async () => {
    render(<TestApp />);
    await screen.findByText('Pick what you need now');

    expect(screen.queryByRole('combobox')).toBeNull();
    expect(screen.queryByText("What's today?")).toBeNull();
    expect(screen.queryByText('Choose your day')).toBeNull();
    expect(screen.queryByText(/Today's Mental Rep/)).toBeNull();
    expect(screen.queryByText('Pressure Reset')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Start Rep' })).toBeNull();
  });

  test('Home never writes the retired day-context key to localStorage', async () => {
    render(<TestApp />);
    await screen.findByText('Pick what you need now');
    expect(localStorage.getItem('arjun_day_context')).toBeNull();
    const keys = Object.keys(localStorage);
    expect(keys.filter((k) => /day_context|context/i.test(k))).toEqual([]);
  });

  test('a stale arjun_day_context value left over from the old selector changes nothing', async () => {
    localStorage.setItem('arjun_day_context', JSON.stringify({
      date: new Date().toISOString().slice(0, 10),
      context: 'match',
    }));
    render(<TestApp />);

    await screen.findByText('Pick what you need now');
    // No recommendation is derived from it, and it is neither read into a
    // control nor rewritten.
    expect(screen.queryByText('Pressure Reset')).toBeNull();
    expect(screen.queryByRole('combobox')).toBeNull();
    expect(JSON.parse(localStorage.getItem('arjun_day_context')).context).toBe('match');
  });

  const CASES = [
    { label: "I'm nervous",            prefillContains: 'nervous' },
    { label: 'I made a mistake',       prefillContains: 'mistake' },
    { label: 'I need focus',           prefillContains: 'focus' },
    { label: 'I feel low confidence',  prefillContains: 'confidence' },
  ];

  for (const { label, prefillContains } of CASES) {
    test(`clicking "${label}" performs a REAL route transition: /dashboard → /coaching with the correct prefill`, async () => {
      render(<TestApp />);
      const user = userEvent.setup();

      // 1. Render starts at /dashboard.
      expect(await screen.findByText('Pick what you need now')).toBeTruthy();
      expect(screen.queryByTestId('pathname')).toBeNull();

      const link = await screen.findByRole('link', { name: label });
      await user.click(link);

      // 2. Clicking the exact visible shortcut changes pathname to /coaching.
      expect((await screen.findByTestId('pathname')).textContent).toBe('/coaching');
      // Dashboard itself is gone — this is a real navigation, not a local
      // re-render (the earlier reported bug: "Dashboard content changes").
      expect(screen.queryByText('Pick what you need now')).toBeNull();
      expect(screen.queryByText('Need help right now?')).toBeNull();

      // 3. location.state.prefillMsg contains the correct shortcut-specific message.
      const composer = screen.getByLabelText('composer');
      expect(composer.value.length).toBeGreaterThan(0);
      expect(composer.value.toLowerCase()).toContain(prefillContains);

      // 4. No message-send function is called.
      expect(sendMock).not.toHaveBeenCalled();
    });
  }

  test('no problem shortcut ever targets a game, Pressure Reset, or a skill path', async () => {
    render(<TestApp />);

    for (const { label } of CASES) {
      const link = await screen.findByRole('link', { name: label });
      expect(link.getAttribute('href')).toBe('/coaching');
    }
  });
});
