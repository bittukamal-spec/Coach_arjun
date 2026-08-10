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
  pressure: {
    branchId: 'mistakes',
    stages: [
      { stage: 'situation', questionId: 'primary_priority', answerIds: ['after_mistake'], customText: null, status: 'set' },
      { stage: 'firstResponse', questionId: 'mistakes_first_response', answerIds: ['keep_thinking'], customText: null, status: 'set' },
      { stage: 'impact', questionId: 'mistakes_next', answerIds: ['hesitate'], customText: null, status: 'set' },
      { stage: 'reset', questionId: 'mistakes_recovery', answerIds: ['few_minutes'], customText: null, status: 'set' },
    ],
  },
  selections: {
    supports: { questionId: 'supports', answerIds: ['clear_preparation'], customText: null, status: 'set' },
    strengths: { questionId: 'strengths', answerIds: ['hard_working'], customText: null, status: 'set' },
    broadGoals: { questionId: 'broad_goals', answerIds: ['confidence'], customText: null, status: 'set' },
    fourWeekOutcome: { questionId: 'four_week_outcome', answerIds: ['recover_faster'], customText: null, status: 'set' },
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

// The one visible anchor present in every mode: the athlete's own situation
// answer, exactly as the question offered it.
const PATTERN_ANCHOR = 'After I make a mistake';

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
  test('shows the starting-profile summary of what the athlete told us, and says it is not a diagnosis', async () => {
    wire(makeServer());
    render(<App />);
    await screen.findByText(PATTERN_ANCHOR);
    expect(screen.getByRole('heading', { level: 1, name: 'Your starting profile' })).toBeTruthy();
    expect(screen.getByText('Main focus')).toBeTruthy();
    expect(screen.getByText('When pressure hits')).toBeTruthy();
    expect(screen.getByText('What helps')).toBeTruthy();
    expect(screen.getByText('Strengths')).toBeTruthy();
    // Their own answers, not the rule engine's phrasing of them.
    expect(screen.getByText('I keep thinking about it')).toBeTruthy();
    expect(screen.getByText('I hesitate')).toBeTruthy();
    expect(document.body.textContent).not.toContain('Your attention may stay on what went wrong');
    expect(document.body.textContent).not.toContain(SECTIONS.whereWeBegin);
    expect(screen.getByRole('button', { name: 'Looks right' })).toBeTruthy();
    expect(screen.getByText(/not a doctor or therapist/i)).toBeTruthy();
  });

  test('the old verbose interpretive report is gone from the first-time screen', async () => {
    wire(makeServer());
    render(<App />);
    await screen.findByText(PATTERN_ANCHOR);
    for (const gone of ['Your Starting Pattern', 'What Already Helps', 'Where We Can Begin', 'Does this fit?']) {
      expect(screen.queryByText(gone)).toBeNull();
    }
  });

  test('"Looks right" confirms, then offers the first conversation', async () => {
    const server = makeServer();
    wire(server);
    render(<App />);
    const user = userEvent.setup();
    await screen.findByText(PATTERN_ANCHOR);
    await user.click(screen.getByRole('button', { name: 'Looks right' }));
    await screen.findByRole('button', { name: 'Start with Arjun' });
    expect(server.state.profile.fitResponse).toBe('CONFIRMED');
    // Confirmation is not asked a second time.
    expect(screen.queryByRole('button', { name: 'Looks right' })).toBeNull();
  });

  test('confirming stores the agreed priority the server resolved', async () => {
    const server = makeServer();
    wire(server);
    render(<App />);
    const user = userEvent.setup();
    await screen.findByText(PATTERN_ANCHOR);
    await user.click(screen.getByRole('button', { name: 'Looks right' }));
    await waitFor(() => expect(server.state.profile.agreedPriorityId).toBe('after_mistake'));
    expect(server.state.profile.confirmedAt !== undefined).toBe(true);
  });

  // Modernization pass 2 removed "Continue coaching" from the saved view —
  // the idempotent start-chat call now has exactly one remaining trigger:
  // the one-time "Got it" completion transition right after confirming.
  test('starting the conversation opens the exact session the server created', async () => {
    const server = makeServer();
    wire(server);
    render(<App />);
    const user = userEvent.setup();
    await screen.findByText(PATTERN_ANCHOR);
    await user.click(screen.getByRole('button', { name: 'Looks right' }));
    await user.click(await screen.findByRole('button', { name: 'Start with Arjun' }));
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
    await screen.findByRole('heading', { level: 1, name: 'तुम्हारी शुरुआती प्रोफाइल' });
    expect(screen.getByRole('button', { name: 'सही है' })).toBeTruthy();
    expect(screen.getByText('जब दबाव आता है')).toBeTruthy();
  });
});

describe('Starting Performance Profile — confirmation summary and navigation', () => {
  test('the confirmation summary reads as a sentence, never as a raw onboarding label', async () => {
    const server = makeServer();
    wire(server);
    render(<App />);
    const user = userEvent.setup();
    await screen.findByText(PATTERN_ANCHOR);
    await user.click(screen.getByRole('button', { name: 'Looks right' }));
    await screen.findByText("We'll start by exploring what happens after a mistake.");
    expect(screen.queryByText(/start with When/i)).toBeNull();
    expect(screen.queryByText(/After I make a mistake\./)).toBeNull();
  });

  test('the summary phrase comes from the server, whatever priority it resolved', async () => {
    const server = makeServer({ profile: { suggestedPriorityId: 'lose_focus' } });
    wire(server);
    render(<App />);
    const user = userEvent.setup();
    await screen.findByText(PATTERN_ANCHOR);
    await user.click(screen.getByRole('button', { name: 'Looks right' }));
    await screen.findByText("We'll start by exploring what pulls your focus away.");
  });

  test('opening the first conversation passes an explicit return destination, so Back does not reopen the profile', async () => {
    const server = makeServer();
    wire(server);
    render(<App />);
    const user = userEvent.setup();
    await screen.findByText(PATTERN_ANCHOR);
    await user.click(screen.getByRole('button', { name: 'Looks right' }));
    await user.click(await screen.findByRole('button', { name: 'Start with Arjun' }));
    const state = JSON.parse((await screen.findByTestId('coaching-state')).textContent);
    expect(state.chatSessionId).toBe('cs-1');
    expect(state.returnTo).toBe('/dashboard');
    expect(state.enteredFromStartingProfile).toBe(true);
  });

  test('tapping the coaching action twice still opens the one session the server returns', async () => {
    const server = makeServer();
    wire(server);
    render(<App />);
    const user = userEvent.setup();
    await screen.findByText(PATTERN_ANCHOR);
    await user.click(screen.getByRole('button', { name: 'Looks right' }));
    const btn = await screen.findByRole('button', { name: 'Start with Arjun' });
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

const COMPLETION_CONTROLS = ['Looks right', 'Change something', 'Got it', 'Start with Arjun', 'Not now'];
function expectNoCompletionUi() {
  expect(screen.queryByText('Your starting profile')).toBeNull();
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
    expect(screen.getByRole('heading', { level: 1, name: 'Your starting profile' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Looks right' })).toBeTruthy();
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
    await user.click(screen.getByRole('button', { name: 'Looks right' }));
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

  test('the saved view shows the modernized visual sections, the current focus, the response and the date', async () => {
    wire(makeServer({ profile: CONFIRMED }));
    render(<App />);
    await screen.findByText('Your Performance Profile');
    expect(screen.getByText('Current Focus')).toBeTruthy();
    expect(screen.getByText('My Game')).toBeTruthy();
    expect(screen.getByText('When Pressure Hits')).toBeTruthy();
    expect(screen.getByText('What Helps Me')).toBeTruthy();
    expect(screen.getByText('My Strengths')).toBeTruthy();
    // No full-profile refresh, and no abstract "pattern" vocabulary.
    expect(screen.queryByText('Refresh my profile')).toBeNull();
    expect(screen.queryByText('My Performance Pattern')).toBeNull();
    expect(screen.queryByText('Your Starting Pattern')).toBeNull();
    expect(screen.queryByText('Where We Can Begin')).toBeNull();
    // The headline is the athlete-facing action label, never the
    // mid-sentence phrase used inside prose.
    expect(screen.getByText('Bounce back after mistakes')).toBeTruthy();
    expect(screen.queryByText('what happens after a mistake')).toBeNull();
    expect(screen.getByText(/^Updated /)).toBeTruthy();
    // The profile's fit response describes the one-time Starting Profile
    // review, not this mutable focus, so the card shows no status.
    expect(screen.queryByText('Confirmed')).toBeNull();
    expect(screen.queryByText(/Current response/i)).toBeNull();
  });

  test('a corrected profile shows no fit status on the saved profile', async () => {
    // "Corrected" / "Partly corrected" answered "does this fit?" about the
    // original profile. It is not a property of the current focus, so it is
    // no longer surfaced on the saved view.
    for (const fitResponse of ['NOT_REALLY', 'PARTLY']) {
      cleanup();
      wire(makeServer({ profile: { ...CONFIRMED, fitResponse } }));
      render(<App />);
      await screen.findByText('Your Performance Profile');
      expect(screen.queryByText('Corrected')).toBeNull();
      expect(screen.queryByText('Partly corrected')).toBeNull();
      expect(screen.queryByText(/Current response/i)).toBeNull();
      // The focus itself, and its date, still render.
      expect(screen.getByText('Bounce back after mistakes')).toBeTruthy();
      expect(screen.getByText(/^Updated /)).toBeTruthy();
    }
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
    expect(screen.queryByRole('button', { name: 'Looks right' })).toBeNull();
  });

  test('Modernization pass 2: the saved view has no Continue coaching action — Coach stays reachable via the bottom nav', async () => {
    wire(makeServer({ profile: CONFIRMED }));
    render(<App />);
    await screen.findByText('Your Performance Profile');
    expect(screen.queryByRole('button', { name: 'Continue coaching' })).toBeNull();
    expect(screen.getByRole('link', { name: /Coach/ })).toBeTruthy();
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
    expect(screen.getByText('अभी का फोकस')).toBeTruthy();
    // No fit status on the focus card, in either language.
    expect(screen.queryByText('सही बताया')).toBeNull();
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
