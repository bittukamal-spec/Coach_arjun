// Stage I regression coverage for the final QA sweep.
//
// These are real-render tests for the fixes that source text cannot prove:
// the StrictMode remount bug on the Performance Profile, the semantic page
// heading on each redesigned surface, Mind Journal's shared save indicator,
// and a Focus Card power line long enough to have been truncated before.

import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import { StrictMode } from 'react';
import { render, screen, cleanup, within } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';

const authState = { user: { id: 'u1', onboardingDone: true, name: 'Rahul' }, token: 't', language: 'en', updateUser: vi.fn(), toggleLanguage: vi.fn() };
vi.mock('../src/contexts/AuthContext', () => ({ useAuth: () => authState }));
vi.mock('../src/api', () => ({ apiFetch: vi.fn() }));

const { apiFetch } = await import('../src/api');
const { default: StartingProfilePage } = await import('../src/pages/StartingProfilePage.jsx');
const { default: FocusDeckPage } = await import('../src/pages/FocusDeckPage.jsx');
const { default: MindJournalPage } = await import('../src/pages/MindJournalPage.jsx');
const { default: QuickNotePage } = await import('../src/pages/mindJournal/QuickNotePage.jsx');

// ── Fixtures ────────────────────────────────────────────────────────────────

const DISPLAY = {
  currentFocus: { id: 'after_mistake', label: 'Bounce back after mistakes', updatedAt: '2026-07-27T00:00:00.000Z', canChange: true },
  suggestedFocus: { id: 'after_mistake', label: 'Bounce back after mistakes' },
  snapshot: { sport: 'Cricket', role: 'Batter', playingContext: 'State', experience: 'Competitive', goals: [], fourWeekOutcome: null },
  startingPattern: { nodes: [{ type: 'situation', label: 'Situation', text: 'After a mistake' }], notes: [] },
  supports: [{ id: 'pre_routine', label: 'Routine before you perform' }],
  strengths: [{ id: 'hard_working', label: 'Hard-working' }],
  interpretation: 'One possible pattern is that after a mistake, your focus may slip.',
  nextStep: 'Start with the first few seconds after a mistake.',
  updatedAt: '2026-07-27T00:00:00.000Z',
};

const PROFILE = {
  displayProfile: DISPLAY,
  focusOptions: [{ id: 'after_mistake', label: 'Bounce back after mistakes', personalised: true }],
  fitResponse: 'CONFIRMED', agreedPriorityId: 'after_mistake',
  priorityOptions: ['after_mistake'], suggestedPriorityId: 'after_mistake',
  updatedAt: '2026-07-27T00:00:00.000Z',
};

function jsonOnce(payload, status = 200) {
  return { ok: status >= 200 && status < 300, status, json: async () => payload };
}

beforeEach(() => { apiFetch.mockReset(); authState.language = 'en'; });
afterEach(() => cleanup());

// ── 1. StrictMode remount — the development-only profile-loading bug ────────

describe('Performance Profile under React StrictMode', () => {
  // StrictMode deliberately mounts, runs cleanup, then remounts every effect in
  // development. The hook used to null out its `mounted` ref in that cleanup
  // and never re-arm it, so every state write after the remount was silently
  // dropped and the page sat on its loading skeleton forever in `npm run dev`.
  test('leaves the loading state after a StrictMode mount → cleanup → remount cycle', async () => {
    apiFetch.mockImplementation(async (p) => {
      if (p === '/api/profile/starting') return jsonOnce({ profile: PROFILE, consent: { pending: false } });
      return jsonOnce({});
    });

    render(
      <StrictMode>
        <MemoryRouter initialEntries={[{ pathname: '/starting-profile', state: { entryMode: 'saved-profile' } }]}>
          <Routes><Route path="/starting-profile" element={<StartingProfilePage />} /></Routes>
        </MemoryRouter>
      </StrictMode>
    );

    // The real assertion: the profile renders. Before the fix this timed out on
    // the loading skeleton no matter how long it waited.
    expect(await screen.findByRole('heading', { level: 1, name: 'Your Performance Profile' })).toBeTruthy();
    expect(screen.getByText('Bounce back after mistakes')).toBeTruthy();
    expect(screen.queryByText('Putting this together…')).toBeNull();
  });

  test('the same page still reaches its error state under StrictMode', async () => {
    apiFetch.mockImplementation(async () => jsonOnce({ error: 'x' }, 500));
    render(
      <StrictMode>
        <MemoryRouter initialEntries={['/starting-profile']}>
          <Routes><Route path="/starting-profile" element={<StartingProfilePage />} /></Routes>
        </MemoryRouter>
      </StrictMode>
    );
    expect(await screen.findByText('Could not load your starting profile.')).toBeTruthy();
  });

  test('the incomplete-onboarding state also survives the remount', async () => {
    apiFetch.mockImplementation(async () => jsonOnce({}, 422));
    render(
      <StrictMode>
        <MemoryRouter initialEntries={['/starting-profile']}>
          <Routes><Route path="/starting-profile" element={<StartingProfilePage />} /></Routes>
        </MemoryRouter>
      </StrictMode>
    );
    expect(await screen.findByText(/Finish onboarding first/)).toBeTruthy();
  });

  test('a slow first response cannot overwrite a newer one', async () => {
    // Two loads in flight (exactly what StrictMode produces); the FIRST resolves
    // last and carries stale data. The newest load must win.
    let call = 0;
    apiFetch.mockImplementation((p) => {
      if (p !== '/api/profile/starting') return Promise.resolve(jsonOnce({}));
      call += 1;
      const isFirst = call === 1;
      const label = isFirst ? 'STALE focus' : 'Bounce back after mistakes';
      return new Promise((resolve) => setTimeout(
        () => resolve(jsonOnce({
          profile: { ...PROFILE, displayProfile: { ...DISPLAY, currentFocus: { ...DISPLAY.currentFocus, label } } },
          consent: { pending: false },
        })),
        isFirst ? 60 : 0
      ));
    });

    render(
      <StrictMode>
        <MemoryRouter initialEntries={[{ pathname: '/starting-profile', state: { entryMode: 'saved-profile' } }]}>
          <Routes><Route path="/starting-profile" element={<StartingProfilePage />} /></Routes>
        </MemoryRouter>
      </StrictMode>
    );

    expect(await screen.findByText('Bounce back after mistakes')).toBeTruthy();
    await new Promise((r) => setTimeout(r, 120)); // let the stale response land
    expect(screen.queryByText('STALE focus')).toBeNull();
  });
});

// ── 2. Semantic page headings ───────────────────────────────────────────────

describe('every redesigned surface has exactly one page-level heading', () => {
  test('Mind Journal renders one <h1>, carrying the page title', async () => {
    apiFetch.mockImplementation(async () => jsonOnce({ entries: [] }));
    render(<MemoryRouter><MindJournalPage /></MemoryRouter>);
    const h1s = await screen.findAllByRole('heading', { level: 1 });
    expect(h1s).toHaveLength(1);
    expect(h1s[0].textContent).toBe('Mind Journal');
  });

  test('each Mind Journal creation screen also renders exactly one <h1>', async () => {
    apiFetch.mockImplementation(async () => jsonOnce({ entries: [] }));
    render(<MemoryRouter><QuickNotePage /></MemoryRouter>);
    const h1s = await screen.findAllByRole('heading', { level: 1 });
    expect(h1s).toHaveLength(1);
    expect(h1s[0].textContent).toBe('Quick note');
  });

  test('the Performance Profile still renders exactly one <h1>', async () => {
    apiFetch.mockImplementation(async (p) =>
      p === '/api/profile/starting' ? jsonOnce({ profile: PROFILE, consent: { pending: false } }) : jsonOnce({}));
    render(
      <MemoryRouter initialEntries={[{ pathname: '/starting-profile', state: { entryMode: 'saved-profile' } }]}>
        <Routes><Route path="/starting-profile" element={<StartingProfilePage />} /></Routes>
      </MemoryRouter>
    );
    await screen.findByText('Bounce back after mistakes');
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
  });
});

// ── 3. Focus Card power line is readable in full ────────────────────────────

// The Playbook overview that used to show a Focus Card was retired with the
// page. Focus Cards keep their own dedicated surface, so the same guarantee is
// now proven on the Focus Deck — the athlete's own sentence must never be
// clipped wherever it renders.
describe('Focus Card power line on the Focus Deck', () => {
  const LONG_EN = 'I have prepared for this exact moment more times than I can count, so I trust my hands and play the next ball on its merit.';
  const LONG_HI = 'मैंने इस पल के लिए इतनी बार तैयारी की है कि गिन नहीं सकता, इसलिए मैं अपने हाथों पर भरोसा करता हूँ और अगली गेंद उसकी अपनी मेरिट पर खेलता हूँ।';

  function renderWithCard(powerLine) {
    apiFetch.mockImplementation(async () => jsonOnce([
      { id: 'c1', focusWord: 'Steady', resetWord: 'Reset', powerLine },
    ]));
    return render(<MemoryRouter><FocusDeckPage /></MemoryRouter>);
  }

  test.each([['English', LONG_EN], ['Hindi', LONG_HI]])(
    'a long %s power line is rendered in full, never truncated',
    async (_lang, line) => {
      renderWithCard(line);
      const el = await screen.findByText(`"${line}"`);
      // The whole sentence is present in the DOM…
      expect(el.textContent).toContain(line);
      // …and nothing clips it. `truncate` is the exact class this used to carry.
      expect(el.className).not.toMatch(/\btruncate\b/);
      expect(el.className).not.toMatch(/whitespace-nowrap|line-clamp/);
    }
  );
});

// ── 4. Mind Journal uses the shared save indicator ──────────────────────────

// PR 2A moved writing off the Mind Journal landing screen onto the dedicated
// creation screens; Quick Note is where a save can now fail, and it uses the
// same shared indicator this test was written to protect.
describe('Mind Journal save state', () => {
  test('a failed save surfaces the specific error through the shared indicator, with a retry', async () => {
    const { default: userEvent } = await import('@testing-library/user-event');
    apiFetch.mockImplementation(async (p, init = {}) => {
      if (p === '/api/mind-journal' && init.method === 'POST') return jsonOnce({ error: 'Something went wrong' }, 500);
      return jsonOnce({ entries: [] });
    });
    render(<MemoryRouter><QuickNotePage /></MemoryRouter>);

    // Pick a state so Save is enabled, then save.
    const states = await screen.findAllByRole('button');
    const calm = states.find((b) => /Calm/i.test(b.textContent || ''));
    await userEvent.click(calm);
    await userEvent.click(screen.getByRole('button', { name: 'Save note' }));

    // The status region announces the failure, keeping the SPECIFIC message
    // rather than flattening it to a generic one, and offers a retry.
    const status = await screen.findByRole('status');
    expect(within(status).getByText('Something went wrong')).toBeTruthy();
    expect(within(status).getByRole('button', { name: 'Try again' })).toBeTruthy();
  });
});
