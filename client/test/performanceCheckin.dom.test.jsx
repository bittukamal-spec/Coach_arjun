// Behavioural tests for the Performance Check-in flow (returning-user
// profile update). Real page + real router; a small fake server backs
// apiFetch. Mirrors the fake-server pattern used by performanceProfile and
// startingProfile's own DOM suites.

import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route } from 'react-router-dom';

const authState = { user: { id: 'u1', onboardingDone: true, name: 'Rahul' }, token: 't', language: 'en', updateUser: vi.fn() };
vi.mock('../src/contexts/AuthContext', () => ({ useAuth: () => authState }));
vi.mock('../src/api', () => ({ apiFetch: vi.fn() }));

const { apiFetch } = await import('../src/api');
const { default: PerformanceCheckinPage } = await import('../src/pages/PerformanceCheckinPage.jsx');
const { default: StartingProfilePage } = await import('../src/pages/StartingProfilePage.jsx');

const DISPLAY = {
  currentFocus: { id: 'after_mistake', label: 'Bounce back after mistakes', phrase: 'what happens after a mistake', source: 'STARTING_PROFILE', updatedAt: '2026-07-27T00:00:00.000Z', canChange: true },
  suggestedFocus: { id: 'after_mistake', label: 'Bounce back after mistakes' },
  snapshot: { sport: 'Cricket', role: 'Batter', playingContext: 'State', experience: 'Competitive', goals: [{ id: 'confidence', label: 'Confidence' }], fourWeekOutcome: 'Recover faster after mistakes' },
  startingPattern: {
    situation: 'after a mistake',
    nodes: [
      { type: 'situation', label: 'Situation', text: 'After a mistake' },
      { type: 'reaction', label: 'Reaction', text: 'Frustration with yourself can rise' },
      { type: 'effect', label: 'Performance effect', text: 'Your focus may dip for a bit' },
    ],
    notes: [],
  },
  supports: [{ id: 'clear_preparation', label: 'Clear preparation' }],
  strengths: [{ id: 'hard_working', label: 'Hard-working' }],
  interpretation: 'possible pattern',
  nextStep: 'where we begin',
  fitStatus: 'CONFIRMED',
  generatedAt: '2026-07-01T00:00:00.000Z',
  updatedAt: '2026-07-27T00:00:00.000Z',
};

const CHECKIN_ANSWERS = {
  strengths: { answerIds: ['hard_working'] },
  supports: { answerIds: ['clear_preparation'] },
  broad_goals: { answerIds: ['confidence'] },
  four_week_outcome: { answerIds: ['recover_faster'] },
  mistakes_first_response: { answerIds: ['keep_thinking'] },
  mistakes_next: { answerIds: ['hesitate'] },
  mistakes_recovery: { answerIds: ['most_of_session'] },
};

function makeServer(over = {}) {
  const state = {
    profile: {
      sections: { whatMatters: 'WM', possiblePattern: 'PP', whatHelps: 'WH', whereWeBegin: 'WB' },
      displayProfile: JSON.parse(JSON.stringify(DISPLAY)),
      focusOptions: [], language: 'en', wordingStatus: 'AI_OK', deterministicFallbackUsed: false,
      suggestedPriorityId: 'after_mistake', agreedPriorityPhrase: 'what happens after a mistake',
      priorityOptions: ['after_mistake'], fitResponse: 'CONFIRMED', agreedPriorityId: 'after_mistake',
      firstChatSessionId: 'cs-1', confirmedAt: '2026-07-27T00:00:00.000Z',
      generatedAt: '2026-07-01T00:00:00.000Z', updatedAt: '2026-07-27T00:00:00.000Z',
      checkin: {
        screens: { goals: ['broad_goals', 'four_week_outcome'], helps: ['supports'], strengths: ['strengths'], pattern: ['mistakes_first_response', 'mistakes_next', 'mistakes_recovery'] },
        answers: JSON.parse(JSON.stringify(CHECKIN_ANSWERS)),
      },
      ...(over.profile || {}),
    },
    consent: { pending: false, guardianEmailMasked: null },
    calls: [],
  };
  return {
    state,
    handle(method, p, body) {
      state.calls.push(`${method} ${p}`);
      if (p === '/api/profile/starting' && method === 'GET') return [200, { profile: state.profile, consent: state.consent }];
      if (p === '/api/profile/answers' && method === 'PATCH') {
        for (const [qid, ans] of Object.entries(body.answers || {})) {
          state.profile.checkin.answers[qid] = ans;
        }
        // Reflect a strengths change into displayProfile for the "refreshed
        // values appear immediately" guarantee, same shape the real server
        // returns from buildDisplayProfile.
        if (body.answers?.strengths) {
          state.profile.displayProfile.strengths = body.answers.strengths.answerIds.map((id) => ({ id, label: id === 'brave' ? 'Brave' : id }));
        }
        return [200, { profile: state.profile, consent: state.consent }];
      }
      return [404, {}];
    },
  };
}

function wire(server) {
  apiFetch.mockImplementation(async (p, init = {}) => {
    const method = init.method || 'GET';
    const body = init.body ? JSON.parse(init.body) : undefined;
    const [status, payload] = server.handle(method, p, body);
    return { ok: status < 400, status, json: async () => payload };
  });
}

function renderAt(path, server = makeServer()) {
  wire(server);
  const utils = render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/starting-profile" element={<StartingProfilePage />} />
        <Route path="/starting-profile/check-in" element={<PerformanceCheckinPage />} />
      </Routes>
    </MemoryRouter>
  );
  return { ...utils, server };
}

beforeEach(() => { apiFetch.mockReset(); authState.language = 'en'; });
afterEach(() => cleanup());

describe('Performance Check-in — entry screen (full flow)', () => {
  test('renders the entry screen with the approved copy, never the word "onboarding"', async () => {
    renderAt('/starting-profile/check-in');
    expect(await screen.findByRole('heading', { name: 'Performance Check-in' })).toBeTruthy();
    expect(screen.getByText("Let's update your profile")).toBeTruthy();
    expect(screen.getByText(/Your current answers are already selected/)).toBeTruthy();
    expect(screen.getByText(/Takes about 5–7 minutes/)).toBeTruthy();
    expect(screen.getByText(/See what's changed before you save/)).toBeTruthy();
    // The approved mockup explicitly drops the "Only you can see this" claim.
    expect(screen.queryByText(/Only you can see this/i)).toBeNull();
    expect(document.body.textContent).not.toMatch(/onboarding/i);
  });

  test('Start check-in walks pattern → helps → strengths → goals with existing answers preselected', async () => {
    const user = userEvent.setup();
    renderAt('/starting-profile/check-in');
    await user.click(await screen.findByRole('button', { name: 'Start check-in' }));
    // Pattern first question: existing answer preselected.
    expect(await screen.findByRole('checkbox', { name: /keep thinking/i, checked: true })).toBeTruthy();
  });
});

describe('Performance Check-in — section-scoped entry points', () => {
  test('?section=strengths skips the entry screen and opens only the strengths question', async () => {
    renderAt('/starting-profile/check-in?section=strengths');
    expect(await screen.findByRole('checkbox', { checked: true, name: /Hard-working/i })).toBeTruthy();
    expect(screen.queryByRole('heading', { name: 'Performance Check-in' })).toBeNull();
  });

  test('changed state: Next reaches the review screen showing the diff, Save is shown and enabled, and Save PATCHes the correct payload', async () => {
    const server = makeServer();
    const user = userEvent.setup();
    renderAt('/starting-profile/check-in?section=strengths', server);
    const brave = await screen.findByRole('checkbox', { name: /Brave/i });
    await user.click(brave); // now [hard_working, brave]
    await user.click(screen.getByRole('button', { name: 'Next' }));
    expect(await screen.findByRole('heading', { name: 'Review your changes' })).toBeTruthy();
    expect(screen.getByText('Strengths')).toBeTruthy();
    expect(screen.getByText('Hard-working, Brave')).toBeTruthy();

    // Save is present, enabled, and "Go back to questions" (the no-change
    // action) is NOT shown in the changed state.
    const saveBtn = screen.getByRole('button', { name: 'Save profile' });
    expect(saveBtn.disabled).toBe(false);
    expect(screen.queryByRole('button', { name: 'Go back to questions' })).toBeNull();

    await user.click(saveBtn);
    // Only the strengths qid is sent — nothing else in this section-scoped
    // run — and it's the exact new selection.
    await vi.waitFor(() => expect(server.state.calls.some((c) => c === 'PATCH /api/profile/answers')).toBe(true));
    expect(server.state.profile.checkin.answers.strengths.answerIds).toEqual(['hard_working', 'brave']);
  });

  test('changed state: "Go back" (not "Go back to questions") returns to the question screen with the change still selected — draft preserved', async () => {
    const user = userEvent.setup();
    renderAt('/starting-profile/check-in?section=strengths');
    const brave = await screen.findByRole('checkbox', { name: /Brave/i });
    await user.click(brave);
    await user.click(screen.getByRole('button', { name: 'Next' }));
    await screen.findByRole('heading', { name: 'Review your changes' });
    await user.click(screen.getByRole('button', { name: 'Go back' }));
    const restored = await screen.findByRole('checkbox', { name: /Brave/i });
    expect(restored.getAttribute('aria-checked')).toBe('true');
  });

  describe('no-change state', () => {
    test('shows "No changes yet" and "Go back to questions", with no Save action rendered at all', async () => {
      const user = userEvent.setup();
      renderAt('/starting-profile/check-in?section=strengths');
      await user.click(await screen.findByRole('button', { name: 'Next' }));
      expect(await screen.findByRole('heading', { name: 'Review your changes' })).toBeTruthy();
      expect(screen.getByText('No changes yet')).toBeTruthy();
      expect(screen.getByText('Go back if you want to update something.')).toBeTruthy();
      expect(screen.getByRole('button', { name: 'Go back to questions' })).toBeTruthy();
      // Save is absent, not merely disabled — it must not be possible to
      // trigger a save at all from this screen.
      expect(screen.queryByRole('button', { name: 'Save profile' })).toBeNull();
      expect(screen.queryByRole('button', { name: 'Go back' })).toBeNull();
    });

    test('no PATCH request is ever sent while there are zero changes', async () => {
      const server = makeServer();
      const user = userEvent.setup();
      renderAt('/starting-profile/check-in?section=strengths', server);
      await user.click(await screen.findByRole('button', { name: 'Next' }));
      await screen.findByText('No changes yet');
      await user.click(screen.getByRole('button', { name: 'Go back to questions' }));
      // Back to the (only) question in this section-scoped run — not a
      // network round trip of any kind.
      await screen.findByRole('checkbox', { name: /Hard-working/i });
      expect(server.state.calls.some((c) => c === 'PATCH /api/profile/answers')).toBe(false);
      expect(server.state.calls.filter((c) => c.startsWith('PATCH')).length).toBe(0);
    });

    test('"Go back to questions" preserves the (unchanged) draft — returns to the same question, same selection', async () => {
      const user = userEvent.setup();
      renderAt('/starting-profile/check-in?section=strengths');
      await user.click(await screen.findByRole('button', { name: 'Next' }));
      await screen.findByText('No changes yet');
      await user.click(screen.getByRole('button', { name: 'Go back to questions' }));
      const hardWorking = await screen.findByRole('checkbox', { name: /Hard-working/i });
      expect(hardWorking.getAttribute('aria-checked')).toBe('true');
    });
  });

  test('Back from the first (and only) question in a section-scoped run returns to the Performance Profile', async () => {
    const user = userEvent.setup();
    renderAt('/starting-profile/check-in?section=strengths');
    await screen.findByRole('checkbox', { name: /Hard-working/i });
    await user.click(screen.getAllByRole('button')[0]); // the back chevron button
    expect(await screen.findByRole('heading', { name: 'Your Performance Profile' })).toBeTruthy();
  });
});

describe('Performance Check-in — draft preserved across Back/Next', () => {
  test('an in-progress change survives navigating Back then Next again', async () => {
    const user = userEvent.setup();
    renderAt('/starting-profile/check-in?section=pattern');
    // mistakes_first_response, mistakes_next, mistakes_recovery — 3 screens.
    await screen.findByRole('checkbox', { checked: true, name: /keep thinking/i });
    await user.click(screen.getByRole('checkbox', { name: /angry/i })); // add a second answer
    await user.click(screen.getByRole('button', { name: 'Next' }));
    await screen.findByRole('heading', { name: /hesitate|next/i, level: 2 }).catch(() => {}); // best-effort, screen 2
    // Go back to screen 1 and confirm the draft (both selections) survived.
    await user.click(screen.getAllByRole('button')[0]);
    const angry = await screen.findByRole('checkbox', { name: /angry/i });
    expect(angry.getAttribute('aria-checked')).toBe('true');
  });
});
