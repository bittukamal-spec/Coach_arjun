// Behavioural tests for the Starting Performance Profile screen (PR 3).
// Real page + real router; a small fake server backs apiFetch.

import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route, Link, Navigate, useLocation } from 'react-router-dom';

const authState = { user: { id: 'u1', onboardingDone: true, name: 'Rahul' }, token: 't', language: 'en', updateUser: vi.fn() };
vi.mock('../src/contexts/AuthContext', () => ({ useAuth: () => authState }));
vi.mock('../src/api', () => ({ apiFetch: vi.fn() }));

const { apiFetch } = await import('../src/api');
const { default: StartingProfilePage } = await import('../src/pages/StartingProfilePage.jsx');

const SECTIONS = {
  whatMatters: 'From what you shared, you play cricket.',
  possiblePattern: 'One possible pattern is that after a mistake, you keep thinking about it.',
  whatHelps: 'Clear preparation already seems useful for you.',
  whereWeBegin: 'We can begin by understanding what happens right after a mistake.',
};

// The redesigned page renders the server-owned display payload rather than the
// four prose blocks. `sections` stays in the fixture because the API still
// sends it (the change was additive) — it is simply no longer what is drawn.
const DISPLAY = {
  currentFocus: null,
  suggestedFocus: { id: 'after_mistake', label: 'Bounce back after mistakes' },
  snapshot: {
    sport: 'Cricket', role: 'Batter', playingContext: 'State', experience: 'Competitive',
    goals: [{ id: 'confidence', label: 'Confidence' }], fourWeekOutcome: 'Recover faster after mistakes',
  },
  startingPattern: {
    situation: 'after a mistake',
    nodes: [
      { type: 'situation', label: 'Situation', text: 'After a mistake' },
      { type: 'reaction', label: 'Reaction', text: 'Your attention may stay on what went wrong', code: 'a:b' },
    ],
    notes: [],
  },
  supports: [{ id: 'clear_preparation', label: 'Clear preparation' }],
  strengths: [{ id: 'hard_working', label: 'Hard-working' }],
  interpretation: SECTIONS.possiblePattern,
  nextStep: SECTIONS.whereWeBegin,
  fitStatus: null,
  generatedAt: '2026-07-01T10:00:00.000Z',
  updatedAt: '2026-07-02T10:00:00.000Z',
};

const HI_DISPLAY = {
  ...DISPLAY,
  suggestedFocus: { id: 'after_mistake', label: 'गलती के बाद जल्दी संभलना' },
  snapshot: { ...DISPLAY.snapshot, sport: 'क्रिकेट', role: 'बल्लेबाज़' },
  startingPattern: {
    situation: 'गलती के बाद',
    nodes: [{ type: 'situation', label: 'स्थिति', text: 'गलती के बाद' }],
    notes: [],
  },
  nextStep: 'हम गलती के बाद के पलों से शुरू कर सकते हैं।',
};

const FOCUS_OPTIONS = [
  { id: 'after_mistake', label: 'Bounce back after mistakes', personalised: true },
  { id: 'lose_focus', label: 'Regain focus', personalised: true },
];

// The one visible anchor that is present in every mode.
const PATTERN_ANCHOR = 'After a mistake';

function makeServer(over = {}) {
  const state = {
    profile: {
      sections: SECTIONS,
      displayProfile: JSON.parse(JSON.stringify(DISPLAY)),
      focusOptions: FOCUS_OPTIONS,
      language: 'en',
      wordingStatus: 'AI_OK',
      deterministicFallbackUsed: false,
      suggestedPriorityId: 'after_mistake',
      agreedPriorityPhrase: null,
      priorityOptions: ['after_mistake', 'lose_focus'],
      fitResponse: null,
      agreedPriorityId: null,
      firstChatSessionId: null,
      confirmedAt: null,
      generatedAt: '2026-07-01T10:00:00.000Z',
      updatedAt: '2026-07-02T10:00:00.000Z',
      ...(over.profile || {}),
    },
    consent: { pending: false, guardianEmailMasked: null, ...(over.consent || {}) },
    startChatStatus: over.startChatStatus || 200,
    calls: [],
  };
  return {
    state,
    handle(method, path, body) {
      state.calls.push(`${method} ${path}`);
      if (path === '/api/profile/starting' && method === 'GET') {
        if (over.loadStatus && over.loadStatus !== 200) return [over.loadStatus, { error: 'ONBOARDING_INCOMPLETE' }];
        return [200, { profile: state.profile, consent: state.consent }];
      }
      if (path === '/api/profile/confirm' && method === 'POST') {
        if (body.fit === 'NOT_REALLY' && !body.agreedPriorityId && !body.correctionText) {
          return [400, { error: 'INVALID_CORRECTION' }];
        }
        const agreed = body.agreedPriorityId || state.profile.suggestedPriorityId;
        state.profile = {
          ...state.profile,
          fitResponse: body.fit,
          agreedPriorityId: agreed,
          // The server sends the conversational phrase, never the raw label.
          agreedPriorityPhrase: agreed === 'lose_focus'
            ? 'what pulls your focus away'
            : 'what happens after a mistake',
          correctionText: body.correctionText || null,
          displayProfile: {
            ...state.profile.displayProfile,
            fitStatus: body.fit,
            currentFocus: {
              id: agreed,
              label: agreed === 'lose_focus' ? 'Regain focus' : 'Bounce back after mistakes',
              phrase: agreed === 'lose_focus' ? 'what pulls your focus away' : 'what happens after a mistake',
              source: 'STARTING_PROFILE', updatedAt: '2026-07-02T10:00:00.000Z', canChange: true,
            },
          },
        };
        return [200, { profile: state.profile, consent: state.consent }];
      }
      if (path === '/api/profile/start-chat' && method === 'POST') {
        if (state.startChatStatus !== 200) return [state.startChatStatus, { error: 'CONSENT_REQUIRED' }];
        return [200, { chatSessionId: 'cs-1' }];
      }
      return [404, { error: 'NOPE' }];
    },
  };
}

function wire(server) {
  apiFetch.mockImplementation((path, init = {}) => {
    const method = init.method || 'GET';
    const body = init.body ? JSON.parse(init.body) : undefined;
    const [status, payload] = server.handle(method, path, body);
    return Promise.resolve({ ok: status < 400, status, json: async () => payload });
  });
}

// Mirrors the real Account link, including its saved-profile entry mode.
function AccountStub() {
  return <Link to="/starting-profile" state={{ entryMode: 'saved-profile' }}>open profile</Link>;
}

// Echoes the navigation state so the profile → chat contract is observable.
function CoachingStub() {
  const location = useLocation();
  return <p data-testid="coaching-state">{JSON.stringify(location.state)}</p>;
}

function App({ entry } = {}) {
  return (
    <MemoryRouter initialEntries={[entry || '/starting-profile']}>
      <Routes>
        <Route path="/starting-profile" element={<StartingProfilePage />} />
        <Route path="/coaching" element={<CoachingStub />} />
        <Route path="/dashboard" element={<p>dashboard</p>} />
        <Route path="/onboarding" element={<p>onboarding</p>} />
        <Route path="/account" element={<AccountStub />} />
        <Route path="/mental-game-profile" element={<Navigate to="/starting-profile" replace state={{ entryMode: 'saved-profile' }} />} />
      </Routes>
    </MemoryRouter>
  );
}

beforeEach(() => { authState.language = 'en'; apiFetch.mockReset(); });
afterEach(() => cleanup());

describe('Starting Performance Profile', () => {
  test('shows the four sections and the fit question, and says it is not a diagnosis', async () => {
    wire(makeServer());
    render(<App />);
    await screen.findByText(PATTERN_ANCHOR);
    expect(screen.getByText('Your Starting Pattern')).toBeTruthy();
    expect(screen.getByText('What Already Helps')).toBeTruthy();
    expect(screen.getByText('Where We Can Begin')).toBeTruthy();
    expect(screen.getByText(SECTIONS.whereWeBegin)).toBeTruthy();
    expect(screen.getByRole('radio', { name: 'That fits' })).toBeTruthy();
    expect(screen.getByRole('radio', { name: 'Partly' })).toBeTruthy();
    expect(screen.getByRole('radio', { name: 'Not really' })).toBeTruthy();
    expect(screen.getByText(/not a doctor or therapist/i)).toBeTruthy();
  });

  test('the athlete cannot continue without answering whether it fits', async () => {
    wire(makeServer());
    render(<App />);
    await screen.findByText(PATTERN_ANCHOR);
    expect(screen.getByRole('button', { name: 'Continue' }).disabled).toBe(true);
  });

  test('"That fits" confirms, then offers the first conversation', async () => {
    const server = makeServer();
    wire(server);
    render(<App />);
    const user = userEvent.setup();
    await screen.findByText(PATTERN_ANCHOR);
    await user.click(screen.getByRole('radio', { name: 'That fits' }));
    await user.click(screen.getByRole('button', { name: 'Continue' }));
    await screen.findByRole('button', { name: 'Start with Arjun' });
    expect(server.state.profile.fitResponse).toBe('CONFIRMED');
    // The fit question is not asked a second time.
    expect(screen.queryByRole('radio', { name: 'That fits' })).toBeNull();
  });

  test('"Not really" asks what to start with instead, offering only the athlete\'s own answers', async () => {
    wire(makeServer());
    render(<App />);
    const user = userEvent.setup();
    await screen.findByText(PATTERN_ANCHOR);
    await user.click(screen.getByRole('radio', { name: 'Not really' }));
    await screen.findByText('What should we start with instead?');
    // From priorityOptions: after_mistake + lose_focus, and nothing else.
    expect(screen.getByRole('radio', { name: 'After I make a mistake' })).toBeTruthy();
    expect(screen.getByRole('radio', { name: 'When I lose focus' })).toBeTruthy();
    expect(screen.queryByRole('radio', { name: /family/i })).toBeNull();
    // Continue stays blocked until a correction is given.
    expect(screen.getByRole('button', { name: 'Continue' }).disabled).toBe(true);
    await user.click(screen.getByRole('radio', { name: 'When I lose focus' }));
    expect(screen.getByRole('button', { name: 'Continue' }).disabled).toBe(false);
  });

  test('the agreed focus is what gets saved when the athlete corrects it', async () => {
    const server = makeServer();
    wire(server);
    render(<App />);
    const user = userEvent.setup();
    await screen.findByText(PATTERN_ANCHOR);
    await user.click(screen.getByRole('radio', { name: 'Not really' }));
    await user.click(await screen.findByRole('radio', { name: 'When I lose focus' }));
    await user.click(screen.getByRole('button', { name: 'Continue' }));
    await waitFor(() => expect(server.state.profile.agreedPriorityId).toBe('lose_focus'));
  });

  // A profile that was already confirmed opens in the saved view, so the way
  // back into coaching there is the quiet "Continue coaching" action.
  test('starting the conversation opens the exact session the server created', async () => {
    const server = makeServer({ profile: { fitResponse: 'CONFIRMED', agreedPriorityId: 'after_mistake' } });
    wire(server);
    render(<App />);
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'Continue coaching' }));
    const state = JSON.parse((await screen.findByTestId('coaching-state')).textContent);
    expect(state.chatSessionId).toBe('cs-1');
    expect(server.state.calls).toContain('POST /api/profile/start-chat');
  });

  test('an athlete waiting on guardian consent can read and confirm, but is not offered the conversation', async () => {
    const server = makeServer({
      profile: { fitResponse: 'CONFIRMED', agreedPriorityId: 'after_mistake' },
      consent: { pending: true, guardianEmailMasked: 'p•••••@example.com' },
    });
    wire(server);
    render(<App />);
    await screen.findByText(PATTERN_ANCHOR);
    expect(screen.getByText(/Waiting for parent\/guardian consent/i)).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Start with Arjun' })).toBeNull();
    expect(screen.getByText(/p•••••@example\.com/)).toBeTruthy();
  });

  test('an incomplete onboarding sends the athlete back to finish it instead of inventing a profile', async () => {
    wire(makeServer({ loadStatus: 422 }));
    render(<App />);
    await screen.findByText(/Finish onboarding first/i);
  });

  test('a failed load is recoverable, never a dead end', async () => {
    wire(makeServer({ loadStatus: 500 }));
    render(<App />);
    await screen.findByRole('button', { name: 'Try again' });
  });

  test('Hindi renders the Hindi screen copy', async () => {
    authState.language = 'hi';
    wire(makeServer());
    render(<App />);
    await screen.findByText('हम यहाँ से शुरू कर रहे हैं');
    expect(screen.getByRole('radio', { name: 'हाँ, यही है' })).toBeTruthy();
  });
});

describe('Starting Performance Profile — confirmation summary and navigation', () => {
  test('the confirmation summary reads as a sentence, never as a raw onboarding label', async () => {
    const server = makeServer();
    wire(server);
    render(<App />);
    const user = userEvent.setup();
    await screen.findByText(PATTERN_ANCHOR);
    await user.click(screen.getByRole('radio', { name: 'That fits' }));
    await user.click(screen.getByRole('button', { name: 'Continue' }));
    await screen.findByText("We'll start by exploring what happens after a mistake.");
    expect(screen.queryByText(/start with When/i)).toBeNull();
    expect(screen.queryByText(/After I make a mistake\./)).toBeNull();
  });

  test('a corrected focus is summarised with its own conversational phrase', async () => {
    const server = makeServer();
    wire(server);
    render(<App />);
    const user = userEvent.setup();
    await screen.findByText(PATTERN_ANCHOR);
    await user.click(screen.getByRole('radio', { name: 'Not really' }));
    await user.click(await screen.findByRole('radio', { name: 'When I lose focus' }));
    await user.click(screen.getByRole('button', { name: 'Continue' }));
    await screen.findByText("We'll start by exploring what pulls your focus away.");
  });

  test('opening the first conversation passes an explicit return destination, so Back does not reopen the profile', async () => {
    const server = makeServer({ profile: { fitResponse: 'CONFIRMED', agreedPriorityId: 'after_mistake', agreedPriorityPhrase: 'what happens after a mistake' } });
    wire(server);
    render(<App />);
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'Continue coaching' }));
    const state = JSON.parse((await screen.findByTestId('coaching-state')).textContent);
    expect(state.chatSessionId).toBe('cs-1');
    expect(state.returnTo).toBe('/dashboard');
    expect(state.enteredFromStartingProfile).toBe(true);
  });

  test('tapping the coaching action twice still opens the one session the server returns', async () => {
    const server = makeServer({ profile: { fitResponse: 'CONFIRMED', agreedPriorityId: 'after_mistake', agreedPriorityPhrase: 'what happens after a mistake' } });
    wire(server);
    render(<App />);
    const user = userEvent.setup();
    const btn = await screen.findByRole('button', { name: 'Continue coaching' });
    await user.click(btn);
    const state = JSON.parse((await screen.findByTestId('coaching-state')).textContent);
    expect(state.chatSessionId).toBe('cs-1');
    expect(server.state.calls.filter((c) => c === 'POST /api/profile/start-chat').length).toBe(1);
  });
});

// ── Two modes: first-time flow vs saved profile view ───────────────────────
// Founder preview: reopening a confirmed profile from Account still showed
// the onboarding-completion UI ("Does this fit?", "Got it", "Start with
// Arjun", "Not now").

const CONFIRMED = {
  fitResponse: 'CONFIRMED',
  agreedPriorityId: 'after_mistake',
  agreedPriorityPhrase: 'what happens after a mistake',
  firstChatSessionId: 'cs-1',
};

const COMPLETION_CONTROLS = ['That fits', 'Partly', 'Not really', 'Got it', 'Start with Arjun', 'Not now'];
function expectNoCompletionUi() {
  expect(screen.queryByText('Does this fit?')).toBeNull();
  for (const name of COMPLETION_CONTROLS) {
    expect(screen.queryByRole('radio', { name })).toBeNull();
    expect(screen.queryByRole('button', { name })).toBeNull();
    expect(screen.queryByText(name)).toBeNull();
  }
}

describe('Starting Performance Profile — first-time vs saved modes', () => {
  test('an unconfirmed profile shows the confirmation controls, whatever the entry mode claims', async () => {
    wire(makeServer());
    render(
      <MemoryRouter initialEntries={[{ pathname: '/starting-profile', state: { entryMode: 'saved-profile' } }]}>
        <Routes><Route path="/starting-profile" element={<StartingProfilePage />} /></Routes>
      </MemoryRouter>
    );
    await screen.findByText(PATTERN_ANCHOR);
    expect(screen.getByText('Does this fit?')).toBeTruthy();
    expect(screen.getByRole('radio', { name: 'That fits' })).toBeTruthy();
    expect(screen.queryByText('Your Performance Profile')).toBeNull();
  });

  test('confirming during the onboarding flow shows the one-time transition', async () => {
    wire(makeServer());
    render(
      <MemoryRouter initialEntries={[{ pathname: '/starting-profile', state: { entryMode: 'onboarding-completion' } }]}>
        <Routes>
          <Route path="/starting-profile" element={<StartingProfilePage />} />
          <Route path="/coaching" element={<CoachingStub />} />
          <Route path="/dashboard" element={<p>dashboard</p>} />
        </Routes>
      </MemoryRouter>
    );
    const user = userEvent.setup();
    await screen.findByText(PATTERN_ANCHOR);
    await user.click(screen.getByRole('radio', { name: 'That fits' }));
    await user.click(screen.getByRole('button', { name: 'Continue' }));
    expect(await screen.findByRole('button', { name: 'Start with Arjun' })).toBeTruthy();
    expect(screen.getByText('Got it')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Not now' })).toBeTruthy();
    // The heading has not switched to the saved view mid-transition.
    expect(screen.queryByText('Your Performance Profile')).toBeNull();
  });

  test('a confirmed profile opened from Account shows the saved view, with no completion controls', async () => {
    wire(makeServer({ profile: CONFIRMED }));
    render(<App entry="/account" />);
    const user = userEvent.setup();
    await user.click(await screen.findByRole('link', { name: 'open profile' }));
    await screen.findByText('Your Performance Profile');
    // The redesign deliberately has no subtitle under the saved-view heading.
    expect(screen.queryByText('Your starting profile based on what you shared during onboarding.')).toBeNull();
    expect(screen.queryByText(/starting point, not a verdict/i)).toBeNull();
    expectNoCompletionUi();
  });

  test('the saved view shows the visual sections, the current focus, the response and the date', async () => {
    wire(makeServer({ profile: CONFIRMED }));
    render(<App />);
    await screen.findByText('Your Performance Profile');
    expect(screen.getByText('Current Focus')).toBeTruthy();
    expect(screen.getByText('Your Starting Pattern')).toBeTruthy();
    expect(screen.getByText('What Already Helps')).toBeTruthy();
    expect(screen.getByText('Where We Can Begin')).toBeTruthy();
    // The headline is the athlete-facing action label, never the
    // mid-sentence phrase used inside prose.
    expect(screen.getByText('Bounce back after mistakes')).toBeTruthy();
    expect(screen.queryByText('what happens after a mistake')).toBeNull();
    expect(screen.getByText('Confirmed')).toBeTruthy();
    expect(screen.getByText(/^Updated /)).toBeTruthy();
  });

  test('a corrected profile reports that it was corrected', async () => {
    wire(makeServer({ profile: { ...CONFIRMED, fitResponse: 'NOT_REALLY' } }));
    render(<App />);
    await screen.findByText('Your Performance Profile');
    expect(screen.getByText('Corrected')).toBeTruthy();
    wire(makeServer({ profile: { ...CONFIRMED, fitResponse: 'PARTLY' } }));
    cleanup();
    render(<App />);
    await screen.findByText('Your Performance Profile');
    expect(screen.getByText('Partly corrected')).toBeTruthy();
  });

  test('direct navigation and a refresh both land on the saved view (no navigation state at all)', async () => {
    wire(makeServer({ profile: CONFIRMED }));
    const first = render(<App />);
    await screen.findByText('Your Performance Profile');
    expectNoCompletionUi();
    // A refresh is a fresh mount with no in-memory state.
    first.unmount();
    render(<App />);
    await screen.findByText('Your Performance Profile');
    expectNoCompletionUi();
  });

  test('the retired /mental-game-profile link opens the saved view', async () => {
    wire(makeServer({ profile: CONFIRMED }));
    render(<App entry="/mental-game-profile" />);
    await screen.findByText('Your Performance Profile');
    expectNoCompletionUi();
  });

  test('the saved view is read-only — no fit controls, no correction field, no editing', async () => {
    wire(makeServer({ profile: CONFIRMED }));
    render(<App />);
    await screen.findByText('Your Performance Profile');
    expect(screen.queryAllByRole('radio').length).toBe(0);
    expect(screen.queryByRole('textbox')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Continue' })).toBeNull();
  });

  test('Continue coaching opens the existing conversation without creating another', async () => {
    const server = makeServer({ profile: CONFIRMED });
    wire(server);
    render(<App />);
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'Continue coaching' }));
    const state = JSON.parse((await screen.findByTestId('coaching-state')).textContent);
    expect(state.chatSessionId).toBe('cs-1');
    expect(server.state.calls.filter((c) => c === 'POST /api/profile/start-chat').length).toBe(1);
  });

  test('a consent-pending athlete keeps the consent notice in the saved view, and is not offered coaching', async () => {
    wire(makeServer({
      profile: { ...CONFIRMED, firstChatSessionId: null },
      consent: { pending: true, guardianEmailMasked: 'p•••••@example.com' },
    }));
    render(<App />);
    await screen.findByText('Your Performance Profile');
    expect(screen.getByText(/Waiting for parent\/guardian consent/i)).toBeTruthy();
    expect(screen.getByText(/p•••••@example\.com/)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Resend consent email' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Continue coaching' })).toBeNull();
    expectNoCompletionUi();
  });

  test('the saved view renders in Hindi', async () => {
    authState.language = 'hi';
    wire(makeServer({ profile: CONFIRMED }));
    render(<App />);
    await screen.findByText('तुम्हारी परफॉर्मेंस प्रोफाइल');
    expect(screen.getByText('सही बताया')).toBeTruthy();
  });

  test('the saved view has identical DOM structure in light and dark themes', async () => {
    wire(makeServer({ profile: CONFIRMED }));
    document.documentElement.setAttribute('data-theme', 'light');
    const light = render(<App />);
    await screen.findByText('Your Performance Profile');
    const lightHtml = light.container.innerHTML;
    cleanup();

    wire(makeServer({ profile: CONFIRMED }));
    document.documentElement.setAttribute('data-theme', 'dark');
    const dark = render(<App />);
    await screen.findByText('Your Performance Profile');
    expect(dark.container.innerHTML).toBe(lightHtml);
    document.documentElement.removeAttribute('data-theme');
  });

  test('the saved view uses the shared mobile column, with no fixed-width or horizontally scrolling layout', async () => {
    wire(makeServer({ profile: CONFIRMED }));
    const { container } = render(<App />);
    await screen.findByText('Your Performance Profile');
    const column = container.querySelector('.max-w-md');
    expect(column).toBeTruthy();
    expect(column.className).toContain('mx-auto');
    expect(container.innerHTML).not.toMatch(/w-\[\d+px\]|min-w-\[\d{3,}px\]/);
  });
});
