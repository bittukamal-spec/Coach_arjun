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
import { render, screen, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom';

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

beforeEach(() => {
  localStorage.clear();
  sendMock = vi.fn();
});

afterEach(() => {
  cleanup();
});

async function mockPlaybook() {
  const { apiFetch } = await import('../src/api');
  apiFetch.mockImplementation(() => Promise.resolve({ ok: true, json: async () => ({}) }));
}

describe('Dashboard problem shortcuts — real router integration', () => {
  test('shortcuts render as real links in their own "Need help right now?" section, structurally separate from Today\'s Mental Rep', async () => {
    await mockPlaybook();
    render(<TestApp />);

    const heading = await screen.findByText('Need help right now?');
    const nervousLink = await screen.findByRole('link', { name: "I'm nervous" });
    const trainingChip = await screen.findByRole('button', { name: 'Training today' });

    expect(nervousLink.tagName).toBe('A');
    expect(nervousLink.getAttribute('href')).toBe('/coaching');
    expect(heading.compareDocumentPosition(nervousLink) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(nervousLink.closest('main')).toBe(trainingChip.closest('main'));
    expect(nervousLink.parentElement).not.toBe(trainingChip.parentElement);
  });

  const CASES = [
    { label: "I'm nervous",            prefillContains: 'nervous' },
    { label: 'I made a mistake',       prefillContains: 'mistake' },
    { label: 'I need focus',           prefillContains: 'focus' },
    { label: 'I feel low confidence',  prefillContains: 'confidence' },
  ];

  for (const { label, prefillContains } of CASES) {
    test(`clicking "${label}" performs a REAL route transition: /dashboard → /coaching with the correct prefill`, async () => {
      await mockPlaybook();
      render(<TestApp />);
      const user = userEvent.setup();

      // 1. Render starts at /dashboard.
      expect((await screen.findAllByText(/Today's Mental Rep/)).length).toBeGreaterThan(0);
      expect(screen.queryByTestId('pathname')).toBeNull();

      const link = await screen.findByRole('link', { name: label });
      await user.click(link);

      // 2. Clicking the exact visible shortcut changes pathname to /coaching.
      expect((await screen.findByTestId('pathname')).textContent).toBe('/coaching');
      // Dashboard itself is gone — this is a real navigation, not a local
      // re-render (the earlier reported bug: "Dashboard content changes").
      expect(screen.queryAllByText(/Today's Mental Rep/).length).toBe(0);
      expect(screen.queryByText('Need help right now?')).toBeNull();

      // 3. location.state.prefillMsg contains the correct shortcut-specific message.
      const composer = screen.getByLabelText('composer');
      expect(composer.value.length).toBeGreaterThan(0);
      expect(composer.value.toLowerCase()).toContain(prefillContains);

      // 4. dayContext does not change.
      expect(localStorage.getItem('arjun_day_context')).toBeNull();

      // 6. No message-send function is called.
      expect(sendMock).not.toHaveBeenCalled();
    });
  }

  test('5. no context-recommendation-card change happens on Dashboard before/because of the shortcut click — the click leaves the page entirely', async () => {
    // Pre-existing context, so the recommended-tool card is already on
    // screen — the exact scenario the production bug was reported in.
    localStorage.setItem('arjun_day_context', JSON.stringify({
      date: new Date().toISOString().slice(0, 10),
      context: 'match',
    }));
    await mockPlaybook();
    render(<TestApp />);
    const user = userEvent.setup();

    expect(await screen.findByText('Pressure Reset')).toBeTruthy();

    await user.click(await screen.findByRole('link', { name: "I'm nervous" }));

    // Real navigation happened — Dashboard (and its recommended-tool
    // card) is unmounted, not merely re-rendered with different content.
    expect((await screen.findByTestId('pathname')).textContent).toBe('/coaching');
    expect(screen.queryByText('Pressure Reset')).toBeNull();
    // The pre-existing context selection itself is untouched in storage.
    expect(JSON.parse(localStorage.getItem('arjun_day_context')).context).toBe('match');
  });

  test('7. context picker buttons remain real buttons on /dashboard and only update dayContext, never navigating', async () => {
    await mockPlaybook();
    render(<TestApp />);
    const user = userEvent.setup();

    // Stage 4: exactly one primary action card — before any pick, it shows
    // the default Mental Rep action.
    expect((await screen.findAllByText(/Today's Mental Rep/)).length).toBeGreaterThan(0);

    const matchChip = await screen.findByRole('button', { name: 'Match today' });
    expect(matchChip.tagName).toBe('BUTTON');
    expect(matchChip.getAttribute('href')).toBeNull();

    await user.click(matchChip);

    // Still on /dashboard — no route probe mounted.
    expect(screen.queryByTestId('pathname')).toBeNull();
    expect(localStorage.getItem('arjun_day_context')).toContain('match');
    // The single primary action card swaps in place — it now reads
    // "Pressure Reset" and the default "Today's Mental Rep" title is gone,
    // never a second card stacked alongside it.
    expect(await screen.findByText('Pressure Reset')).toBeTruthy();
    expect(screen.queryAllByText(/Today's Mental Rep/).length).toBe(0);
  });

  test('no problem shortcut ever targets a game, Pressure Reset, or a skill path', async () => {
    await mockPlaybook();
    render(<TestApp />);

    for (const { label } of CASES) {
      const link = await screen.findByRole('link', { name: label });
      expect(link.getAttribute('href')).toBe('/coaching');
    }
  });
});
