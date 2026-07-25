// Behavioural tests for the Starting Performance Profile screen (PR 3).
// Real page + real router; a small fake server backs apiFetch.

import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route } from 'react-router-dom';

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

function makeServer(over = {}) {
  const state = {
    profile: {
      sections: SECTIONS,
      language: 'en',
      wordingStatus: 'AI_OK',
      deterministicFallbackUsed: false,
      suggestedPriorityId: 'after_mistake',
      priorityOptions: ['after_mistake', 'lose_focus'],
      fitResponse: null,
      agreedPriorityId: null,
      firstChatSessionId: null,
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
        state.profile = {
          ...state.profile,
          fitResponse: body.fit,
          agreedPriorityId: body.agreedPriorityId || state.profile.suggestedPriorityId,
          correctionText: body.correctionText || null,
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

function App() {
  return (
    <MemoryRouter initialEntries={['/starting-profile']}>
      <Routes>
        <Route path="/starting-profile" element={<StartingProfilePage />} />
        <Route path="/coaching" element={<p>coaching</p>} />
        <Route path="/dashboard" element={<p>dashboard</p>} />
        <Route path="/onboarding" element={<p>onboarding</p>} />
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
    await screen.findByText(SECTIONS.whatMatters);
    expect(screen.getByText(SECTIONS.possiblePattern)).toBeTruthy();
    expect(screen.getByText(SECTIONS.whatHelps)).toBeTruthy();
    expect(screen.getByText(SECTIONS.whereWeBegin)).toBeTruthy();
    expect(screen.getByRole('radio', { name: 'That fits' })).toBeTruthy();
    expect(screen.getByRole('radio', { name: 'Partly' })).toBeTruthy();
    expect(screen.getByRole('radio', { name: 'Not really' })).toBeTruthy();
    expect(screen.getByText(/not a doctor or therapist/i)).toBeTruthy();
  });

  test('the athlete cannot continue without answering whether it fits', async () => {
    wire(makeServer());
    render(<App />);
    await screen.findByText(SECTIONS.whatMatters);
    expect(screen.getByRole('button', { name: 'Continue' }).disabled).toBe(true);
  });

  test('"That fits" confirms, then offers the first conversation', async () => {
    const server = makeServer();
    wire(server);
    render(<App />);
    const user = userEvent.setup();
    await screen.findByText(SECTIONS.whatMatters);
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
    await screen.findByText(SECTIONS.whatMatters);
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
    await screen.findByText(SECTIONS.whatMatters);
    await user.click(screen.getByRole('radio', { name: 'Not really' }));
    await user.click(await screen.findByRole('radio', { name: 'When I lose focus' }));
    await user.click(screen.getByRole('button', { name: 'Continue' }));
    await waitFor(() => expect(server.state.profile.agreedPriorityId).toBe('lose_focus'));
  });

  test('starting the conversation opens the exact session the server created', async () => {
    const server = makeServer({ profile: { fitResponse: 'CONFIRMED', agreedPriorityId: 'after_mistake' } });
    wire(server);
    render(<App />);
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'Start with Arjun' }));
    await screen.findByText('coaching');
    expect(server.state.calls).toContain('POST /api/profile/start-chat');
  });

  test('an athlete waiting on guardian consent can read and confirm, but is not offered the conversation', async () => {
    const server = makeServer({
      profile: { fitResponse: 'CONFIRMED', agreedPriorityId: 'after_mistake' },
      consent: { pending: true, guardianEmailMasked: 'p•••••@example.com' },
    });
    wire(server);
    render(<App />);
    await screen.findByText(SECTIONS.whatMatters);
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
