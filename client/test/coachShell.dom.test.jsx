// Stage C — Coach conversation interface.
//
// Renders the real ChatPage inside a real router (same harness style as
// internalContentFilter.dom.test.jsx) and asserts the redesigned shell:
// immersive layout with no bottom navigation, an on-dark Coach header,
// plain-text Arjun turns vs. tinted athlete bubbles, and a pill composer
// whose send/disabled rules are unchanged.
//
// These are presentation guarantees. The behavioural guardrails they sit
// beside — streaming, persistence, prescription linkage, safety — are
// covered by weeklyReviews.dom.test.jsx, prescriptionCompletionLinkage and
// the source suites, and are deliberately not duplicated or relaxed here.

import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route } from 'react-router-dom';

vi.mock('../src/contexts/AuthContext', () => ({
  useAuth: () => ({
    user: { name: 'Test Athlete' },
    token: 'test-token',
    language: 'en',
  }),
}));
vi.mock('../src/api', () => ({ apiFetch: vi.fn(() => new Promise(() => {})) }));

const { default: ChatPage } = await import('../src/pages/ChatPage.jsx');
const { default: BottomNav } = await import('../src/components/BottomNav.jsx');

const ARJUN_REPLY = 'What happens right before you commit to the shot?';
const ATHLETE_MSG = 'I rushed the shot again';

async function mockApi(messages) {
  const { apiFetch } = await import('../src/api');
  apiFetch.mockImplementation((path) => {
    const json =
      path.startsWith('/api/sessions/end-stale') ? { count: 0 }
      : path.startsWith('/api/chat/usage') ? { isPremium: true, trialDaysRemaining: 14 }
      : path.includes('/messages') ? { messages }
      : path.startsWith('/api/sessions') ? { sessions: [{ id: 'cs-1', mode: 'main', sessionType: 'general', createdAt: new Date().toISOString() }] }
      : {};
    return Promise.resolve({ ok: true, status: 200, json: async () => json });
  });
}

// Mounts ChatPage alongside BottomNav exactly as App.jsx does for /coaching,
// so "no bottom nav in Coach" is proven against the real composition rather
// than against ChatPage in isolation.
function App() {
  return (
    <MemoryRouter initialEntries={['/coaching']}>
      <Routes>
        <Route path="/coaching" element={<><ChatPage /><BottomNav /></>} />
      </Routes>
    </MemoryRouter>
  );
}

const twoTurns = () => ([
  { id: 'm1', role: 'user', content: ATHLETE_MSG, createdAt: new Date().toISOString() },
  { id: 'm2', role: 'assistant', content: ARJUN_REPLY, createdAt: new Date().toISOString() },
]);

beforeEach(() => vi.clearAllMocks());
afterEach(() => cleanup());

describe('Coach — immersive shell', () => {
  test('no bottom navigation is rendered during an active Coach conversation', async () => {
    await mockApi(twoTurns());
    render(<App />);
    await screen.findByText(ARJUN_REPLY);

    expect(screen.queryByRole('navigation')).toBeNull();
    expect(screen.queryByRole('link', { name: /Playbook/i })).toBeNull();
  });

  test('the Coach header renders with branding, a labelled back control and the safety control', async () => {
    await mockApi(twoTurns());
    render(<App />);
    await screen.findByText(ARJUN_REPLY);

    const header = document.querySelector('header');
    expect(header).toBeTruthy();
    // The header is now integrated into the chat background rather than
    // sitting on the near-black nav surface, and carries no heavy divider.
    expect(header.className).toMatch(/bg-dark-900/);
    expect(header.style.background).not.toContain('--nav-bar');
    expect(header.className).not.toMatch(/border-b/);
    expect(within(header).getByLabelText('Go back')).toBeTruthy();
    // Branding stays.
    expect(within(header).getByLabelText('Arjun logo')).toBeTruthy();
    expect(within(header).getByRole('heading', { level: 1, name: 'Arjun' })).toBeTruthy();

    // History and Info moved into a single accessible overflow menu — they
    // are still reachable from the header, one level in.
    const menuBtn = within(header).getByLabelText('More options');
    expect(menuBtn.getAttribute('aria-expanded')).toBe('false');
    await userEvent.setup().click(menuBtn);
    expect(within(header).getByRole('link', { name: 'Weekly Reviews' })).toBeTruthy();
    expect(within(header).getByRole('button', { name: 'Safety info' })).toBeTruthy();
  });

  test('the safety note and India helplines stay reachable from the header', async () => {
    await mockApi(twoTurns());
    render(<App />);
    await screen.findByText(ARJUN_REPLY);
    const user = userEvent.setup();

    await user.click(screen.getByLabelText('More options'));
    await user.click(screen.getByLabelText('Safety info'));

    expect(screen.getByText(/not a medical or crisis service/i)).toBeTruthy();
    expect(screen.getByText(/iCall: 9152987821/)).toBeTruthy();
    expect(screen.getByText(/KIRAN: 1800-599-0019/)).toBeTruthy();
  });
});

describe('Coach — message presentation', () => {
  test('message history still renders both turns', async () => {
    await mockApi(twoTurns());
    render(<App />);
    expect(await screen.findByText(ARJUN_REPLY)).toBeTruthy();
    expect(screen.getByText(ATHLETE_MSG)).toBeTruthy();
  });

  test('athlete and Arjun turns stay visually distinguishable', async () => {
    await mockApi(twoTurns());
    render(<App />);
    await screen.findByText(ARJUN_REPLY);

    const athlete = screen.getByText(ATHLETE_MSG);
    const arjun = screen.getByText(ARJUN_REPLY);

    // Athlete: a bubble on the approved selected-surface tint.
    expect(athlete.style.background).toContain('--surface-selected');
    // ...and no longer the old saturated brand fill.
    expect(athlete.className).not.toMatch(/bg-brand-600/);
    expect(athlete.className).not.toMatch(/text-white/);

    // Arjun: plain text, no bubble surface of its own.
    expect(arjun.style.background).toBe('');
    expect(arjun.className).not.toMatch(/bg-dark-400/);
  });

  test('long athlete messages wrap instead of overflowing', async () => {
    const long = 'I keep replaying the same mistake over and over again in my head '.repeat(6);
    await mockApi([{ id: 'm1', role: 'user', content: long, createdAt: new Date().toISOString() }]);
    render(<App />);

    const bubble = await screen.findByText((_, el) => el?.textContent === long && el.className.includes('break-words'));
    expect(bubble.className).toMatch(/break-words/);
    expect(bubble.className).toMatch(/whitespace-pre-wrap/);
    // Constrained so a long turn never spans the full conversation width.
    expect(bubble.className).toMatch(/max-w-\[78%\]/);
  });
});

describe('Coach — composer', () => {
  test('the composer is present in a valid chat state and sits in a single pill', async () => {
    await mockApi(twoTurns());
    render(<App />);
    await screen.findByText(ARJUN_REPLY);

    const input = screen.getByRole('textbox');
    expect(input).toBeTruthy();
    expect(screen.getByLabelText(/send/i)).toBeTruthy();

    // One shared composer surface holding both input and send.
    const pill = input.parentElement;
    expect(pill.style.background).toContain('--surface-card');
    expect(pill.className).toMatch(/rounded-\[24px\]/);
    expect(within(pill).getByLabelText(/send/i)).toBeTruthy();
  });

  test('empty input cannot be submitted', async () => {
    await mockApi(twoTurns());
    render(<App />);
    await screen.findByText(ARJUN_REPLY);

    expect(screen.getByLabelText(/send/i).disabled).toBe(true);
  });

  test('whitespace-only input still cannot be submitted', async () => {
    await mockApi(twoTurns());
    render(<App />);
    await screen.findByText(ARJUN_REPLY);
    const user = userEvent.setup();

    await user.type(screen.getByRole('textbox'), '    ');

    expect(screen.getByLabelText(/send/i).disabled).toBe(true);
  });

  test('send enables once real text is entered', async () => {
    await mockApi(twoTurns());
    render(<App />);
    await screen.findByText(ARJUN_REPLY);
    const user = userEvent.setup();

    await user.type(screen.getByRole('textbox'), 'I felt tight in the warm-up');

    expect(screen.getByLabelText(/send/i).disabled).toBe(false);
  });

  test('the send control keeps a >=44px tap target', async () => {
    await mockApi(twoTurns());
    render(<App />);
    await screen.findByText(ARJUN_REPLY);

    // w-11/h-11 is 44px. The pill redesign must not shrink this below the
    // minimum touch target.
    expect(screen.getByLabelText(/send/i).className).toMatch(/w-11 h-11/);
  });

  test('there is exactly one send control — the redesign did not duplicate it', async () => {
    await mockApi(twoTurns());
    render(<App />);
    await screen.findByText(ARJUN_REPLY);

    expect(screen.getAllByLabelText(/send/i)).toHaveLength(1);
  });

  test('the composer clears the home indicator with a safe-area inset', async () => {
    await mockApi(twoTurns());
    render(<App />);
    await screen.findByText(ARJUN_REPLY);

    // The composer floats over the conversation now, so its safe-area padding
    // sits on the floating wrapper rather than a shrink-0 panel.
    const composerRegion = screen.getByRole('textbox').closest('.absolute');
    expect(composerRegion.className).toMatch(/env\(safe-area-inset-bottom\)/);
    // No separator line above it any more.
    expect(composerRegion.className).not.toMatch(/border-t/);
  });
});
