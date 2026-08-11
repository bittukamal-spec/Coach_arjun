// Behavioural tests for the section-scoped profile edits (the returning-user
// update flow). Real page + real router; a small fake server backs apiFetch.
// Mirrors the fake-server pattern used by performanceProfile and
// startingProfile's own DOM suites.

import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
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
  startingPattern: { situation: 'after a mistake', nodes: [], notes: [] },
  pressure: {
    branchId: 'mistakes',
    stages: [
      { stage: 'situation', questionId: 'primary_priority', answerIds: ['after_mistake'], customText: null, status: 'set' },
      { stage: 'firstResponse', questionId: 'mistakes_first_response', answerIds: ['keep_thinking'], customText: null, status: 'set' },
      { stage: 'impact', questionId: 'mistakes_next', answerIds: ['hesitate'], customText: null, status: 'set' },
      { stage: 'reset', questionId: 'mistakes_recovery', answerIds: ['most_of_session'], customText: null, status: 'set' },
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
  primary_priority: { answerIds: ['after_mistake'] },
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
        screens: {
          goals: ['broad_goals', 'four_week_outcome'],
          helps: ['supports'],
          strengths: ['strengths'],
          pressure: ['primary_priority', 'mistakes_first_response', 'mistakes_next', 'mistakes_recovery'],
          pattern: ['mistakes_first_response', 'mistakes_next', 'mistakes_recovery'],
        },
        answers: JSON.parse(JSON.stringify(CHECKIN_ANSWERS)),
      },
      ...(over.profile || {}),
    },
    consent: { pending: false, guardianEmailMasked: null },
    calls: [],
    patched: [],
  };
  return {
    state,
    handle(method, p, body) {
      state.calls.push(`${method} ${p}`);
      if (p === '/api/profile/starting' && method === 'GET') return [200, { profile: state.profile, consent: state.consent }];
      if (p === '/api/profile/answers' && method === 'PATCH') {
        state.patched.push(body.answers || {});
        for (const [qid, ans] of Object.entries(body.answers || {})) {
          state.profile.checkin.answers[qid] = ans;
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

const patchedQids = (server) => server.state.patched.flatMap((p) => Object.keys(p)).sort();

beforeEach(() => { apiFetch.mockReset(); authState.language = 'en'; });
afterEach(() => cleanup());

describe('the retired full check-in', () => {
  test('the bare check-in URL lands on the Performance Profile instead of a 5–7 minute flow', async () => {
    renderAt('/starting-profile/check-in');
    expect(await screen.findByRole('heading', { name: 'Your Performance Profile' })).toBeTruthy();
    expect(screen.queryByText(/Takes about 5–7 minutes/)).toBeNull();
    expect(screen.queryByRole('button', { name: 'Start check-in' })).toBeNull();
  });

  test('no screen in a scoped edit calls itself onboarding, or a check-in the athlete must finish', async () => {
    renderAt('/starting-profile/check-in?section=helps');
    await screen.findByRole('checkbox', { name: /Clear preparation/i });
    expect(document.body.textContent).not.toMatch(/onboarding/i);
    expect(document.body.textContent).not.toMatch(/Performance Check-in/i);
  });
});

describe('section-scoped edits open only their own section', () => {
  test('?section=pressure asks Situation first, then the branch follow-ups — and nothing else', async () => {
    const user = userEvent.setup();
    renderAt('/starting-profile/check-in?section=pressure');
    // 1. Situation, explicitly, with the athlete's stored answer preselected.
    expect(await screen.findByRole('heading', { name: 'Which situation gives you the most trouble right now?' })).toBeTruthy();
    expect(screen.getByRole('radio', { name: 'After I make a mistake' }).getAttribute('aria-checked')).toBe('true');
    await user.click(screen.getByRole('button', { name: 'Next' }));
    // 2. First response.
    expect(await screen.findByRole('heading', { name: 'What usually happens first after you make a mistake?' })).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Next' }));
    // 3. Performance impact.
    expect(await screen.findByRole('heading', { name: 'What usually happens to your performance next?' })).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Next' }));
    // 4. Reset time — and this is the last one: it saves, it does not continue.
    expect(await screen.findByRole('heading', { name: 'How long does it usually take you to get back on track?' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Save changes' })).toBeTruthy();
    // Never any other section's questions.
    expect(screen.queryByRole('checkbox', { name: /Hard-working/i })).toBeNull();
  });

  test('the old ?section=pattern bookmark still opens the pressure flow', async () => {
    renderAt('/starting-profile/check-in?section=pattern');
    expect(await screen.findByRole('heading', { name: 'Which situation gives you the most trouble right now?' })).toBeTruthy();
  });

  test('?section=helps opens only the what-helps question', async () => {
    renderAt('/starting-profile/check-in?section=helps');
    expect(await screen.findByRole('heading', { name: "When you're struggling, what usually helps you perform better?" })).toBeTruthy();
    expect(screen.getByRole('checkbox', { name: /Clear preparation/i }).getAttribute('aria-checked')).toBe('true');
    expect(screen.queryByRole('checkbox', { name: /Hard-working/i })).toBeNull();
    expect(screen.getByRole('button', { name: 'Save changes' })).toBeTruthy();
  });

  test('?section=strengths opens only the strengths question', async () => {
    renderAt('/starting-profile/check-in?section=strengths');
    expect(await screen.findByRole('heading', { name: 'Which strengths can you rely on in sport?' })).toBeTruthy();
    expect(screen.getByRole('checkbox', { name: /Hard-working/i }).getAttribute('aria-checked')).toBe('true');
    expect(screen.queryByRole('checkbox', { name: /Clear preparation/i })).toBeNull();
  });

  test('?section=goals opens only the two goal questions', async () => {
    const user = userEvent.setup();
    renderAt('/starting-profile/check-in?section=goals');
    expect(await screen.findByRole('heading', { name: 'What would you like help with?' })).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Next' }));
    expect(await screen.findByRole('heading', { name: 'What one change would make the biggest difference in the next four weeks?' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Save changes' })).toBeTruthy();
  });
});

describe('a scoped edit saves straight from its last question', () => {
  test('there is no old-values → new-values review screen anywhere in the flow', async () => {
    const user = userEvent.setup();
    renderAt('/starting-profile/check-in?section=strengths');
    await user.click(await screen.findByRole('checkbox', { name: /Brave/i }));
    expect(screen.queryByRole('button', { name: 'Next' })).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Save changes' }));
    expect(screen.queryByRole('heading', { name: 'Review your changes' })).toBeNull();
    expect(screen.queryByText('Unchanged')).toBeNull();
    expect(await screen.findByRole('heading', { name: 'Your Performance Profile' })).toBeTruthy();
  });

  test('strengths: Save changes PATCHes only the strengths answer, then returns to the profile', async () => {
    const server = makeServer();
    const user = userEvent.setup();
    renderAt('/starting-profile/check-in?section=strengths', server);
    await user.click(await screen.findByRole('checkbox', { name: /Brave/i }));
    await user.click(screen.getByRole('button', { name: 'Save changes' }));
    await vi.waitFor(() => expect(server.state.patched.length).toBe(1));
    expect(patchedQids(server)).toEqual(['strengths']);
    expect(server.state.profile.checkin.answers.strengths.answerIds).toEqual(['hard_working', 'brave']);
    // Unrelated sections are untouched, both in the request and in the store.
    expect(server.state.profile.checkin.answers.supports.answerIds).toEqual(['clear_preparation']);
    expect(server.state.profile.checkin.answers.mistakes_next.answerIds).toEqual(['hesitate']);
    expect(await screen.findByRole('heading', { name: 'Your Performance Profile' })).toBeTruthy();
  });

  test('helps: Save changes PATCHes only the supports answer', async () => {
    const server = makeServer();
    const user = userEvent.setup();
    renderAt('/starting-profile/check-in?section=helps', server);
    await user.click(await screen.findByRole('checkbox', { name: /Staying relaxed/i }));
    await user.click(screen.getByRole('button', { name: 'Save changes' }));
    await vi.waitFor(() => expect(server.state.patched.length).toBe(1));
    expect(patchedQids(server)).toEqual(['supports']);
    expect(server.state.profile.checkin.answers.strengths.answerIds).toEqual(['hard_working']);
  });

  test('goals: Save changes PATCHes only the goal questions', async () => {
    const server = makeServer();
    const user = userEvent.setup();
    renderAt('/starting-profile/check-in?section=goals', server);
    await user.click(await screen.findByRole('checkbox', { name: /Handling Pressure/i }));
    await user.click(screen.getByRole('button', { name: 'Next' }));
    await user.click(await screen.findByRole('radio', { name: 'Stay focused for longer' }));
    await user.click(screen.getByRole('button', { name: 'Save changes' }));
    await vi.waitFor(() => expect(server.state.patched.length).toBe(1));
    expect(patchedQids(server)).toEqual(['broad_goals', 'four_week_outcome']);
    // Only goal fields move.
    expect(server.state.profile.checkin.answers.supports.answerIds).toEqual(['clear_preparation']);
    expect(server.state.profile.checkin.answers.primary_priority.answerIds).toEqual(['after_mistake']);
  });

  test('pressure: the whole four-question sequence saves once, and only its own questions', async () => {
    const server = makeServer();
    const user = userEvent.setup();
    renderAt('/starting-profile/check-in?section=pressure', server);
    await screen.findByRole('heading', { name: 'Which situation gives you the most trouble right now?' });
    await user.click(screen.getByRole('button', { name: 'Next' }));
    await user.click(await screen.findByRole('radio', { name: /angry/i }));
    await user.click(screen.getByRole('button', { name: 'Next' }));
    await user.click(await screen.findByRole('radio', { name: /I lose focus/i }));
    await user.click(screen.getByRole('button', { name: 'Next' }));
    await user.click(await screen.findByRole('radio', { name: 'A few minutes' }));
    await user.click(screen.getByRole('button', { name: 'Save changes' }));
    await vi.waitFor(() => expect(server.state.patched.length).toBe(1));
    expect(patchedQids(server)).toEqual(['mistakes_first_response', 'mistakes_next', 'mistakes_recovery', 'primary_priority']);
    expect(server.state.profile.checkin.answers.mistakes_first_response.answerIds).toEqual(['angry_self']);
    expect(server.state.profile.checkin.answers.mistakes_recovery.answerIds).toEqual(['few_minutes']);
    expect(server.state.profile.checkin.answers.strengths.answerIds).toEqual(['hard_working']);
  });
});

describe('changing the situation', () => {
  test('switching to another situation warns once, then asks that branch\'s own questions', async () => {
    const user = userEvent.setup();
    renderAt('/starting-profile/check-in?section=pressure');
    await screen.findByRole('heading', { name: 'Which situation gives you the most trouble right now?' });
    await user.click(screen.getByRole('radio', { name: 'When I lose focus' }));
    await user.click(screen.getByRole('button', { name: 'Next' }));
    expect(await screen.findByRole('dialog')).toBeTruthy();
    expect(screen.getByText(/Your earlier answers stay saved/i)).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Yes, change it' }));
    expect(await screen.findByRole('heading', { name: 'What usually takes your focus away first?' })).toBeTruthy();
  });

  test('keeping the current situation does not change which questions are asked', async () => {
    const user = userEvent.setup();
    renderAt('/starting-profile/check-in?section=pressure');
    await screen.findByRole('heading', { name: 'Which situation gives you the most trouble right now?' });
    await user.click(screen.getByRole('button', { name: 'Next' }));
    expect(await screen.findByRole('heading', { name: 'What usually happens first after you make a mistake?' })).toBeTruthy();
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});

describe('drafts and navigation', () => {
  test('an in-progress change survives navigating Back then forward again', async () => {
    const user = userEvent.setup();
    renderAt('/starting-profile/check-in?section=pressure');
    await screen.findByRole('heading', { name: 'Which situation gives you the most trouble right now?' });
    await user.click(screen.getByRole('button', { name: 'Next' }));
    await screen.findByRole('radio', { checked: true, name: /keep thinking/i });
    await user.click(screen.getByRole('radio', { name: /angry/i }));
    await user.click(screen.getAllByRole('button')[0]); // back chevron → Situation
    await screen.findByRole('heading', { name: 'Which situation gives you the most trouble right now?' });
    await user.click(screen.getByRole('button', { name: 'Next' }));
    const angry = await screen.findByRole('radio', { name: /angry/i });
    expect(angry.getAttribute('aria-checked')).toBe('true');
    expect(screen.getByRole('radio', { name: /keep thinking/i }).getAttribute('aria-checked')).toBe('false');
  });

  test('Back from the first question of a scoped edit returns to the Performance Profile', async () => {
    const user = userEvent.setup();
    renderAt('/starting-profile/check-in?section=strengths');
    await screen.findByRole('checkbox', { name: /Hard-working/i });
    await user.click(screen.getAllByRole('button')[0]); // the back chevron button
    expect(await screen.findByRole('heading', { name: 'Your Performance Profile' })).toBeTruthy();
  });
});

// ── Pressure questions are single-choice ───────────────────────────────────
// primary_priority/mistakes_first_response/mistakes_next/mistakes_recovery all
// render through the same CheckinQuestion component off the same config
// contract, so this behaviour holds for every branch's questions.
describe('pressure questions are single-choice', () => {
  test('picking a new predefined option replaces the previous one — never both selected', async () => {
    const user = userEvent.setup();
    renderAt('/starting-profile/check-in?section=pressure');
    await screen.findByRole('heading', { name: 'Which situation gives you the most trouble right now?' });
    await user.click(screen.getByRole('button', { name: 'Next' }));
    await screen.findByRole('radio', { name: /keep thinking/i, checked: true });
    await user.click(screen.getByRole('radio', { name: /angry/i }));
    expect(screen.getByRole('radio', { name: /angry/i }).getAttribute('aria-checked')).toBe('true');
    expect(screen.getByRole('radio', { name: /keep thinking/i }).getAttribute('aria-checked')).toBe('false');
    expect(screen.queryAllByRole('checkbox').length).toBe(0);
  });

  test('a custom answer is accepted and saved verbatim as exactly one answer id', async () => {
    const server = makeServer();
    const user = userEvent.setup();
    renderAt('/starting-profile/check-in?section=pressure', server);
    await screen.findByRole('heading', { name: 'Which situation gives you the most trouble right now?' });
    await user.click(screen.getByRole('button', { name: 'Next' }));
    await screen.findByRole('radio', { name: /keep thinking/i, checked: true });
    await user.click(screen.getByRole('radio', { name: 'Something else' }));
    const input = await screen.findByLabelText('Write your own');
    expect(screen.getByRole('button', { name: 'Next' }).disabled).toBe(true);
    await user.type(input, 'I go completely silent');
    expect(screen.getByRole('button', { name: 'Next' }).disabled).toBe(false);
    expect(screen.getByRole('radio', { name: /keep thinking/i }).getAttribute('aria-checked')).toBe('false');
    await user.click(screen.getByRole('button', { name: 'Next' }));
    await user.click(await screen.findByRole('button', { name: 'Next' }));
    await user.click(await screen.findByRole('button', { name: 'Save changes' }));
    await vi.waitFor(() => expect(server.state.patched.length).toBe(1));
    const sent = server.state.profile.checkin.answers.mistakes_first_response;
    expect(sent.answerIds).toEqual(['something_else']);
    expect(sent.customText).toBe('I go completely silent');
  });

  test('choosing a predefined option after custom text was entered drops the custom text', async () => {
    const user = userEvent.setup();
    renderAt('/starting-profile/check-in?section=pressure');
    await screen.findByRole('heading', { name: 'Which situation gives you the most trouble right now?' });
    await user.click(screen.getByRole('button', { name: 'Next' }));
    await user.click(await screen.findByRole('radio', { name: 'Something else' }));
    await user.type(await screen.findByLabelText('Write your own'), 'draft text');
    await user.click(screen.getByRole('radio', { name: /become cautious/i }));
    expect(screen.queryByLabelText('Write your own')).toBeNull();
    expect(screen.getByRole('radio', { name: /become cautious/i }).getAttribute('aria-checked')).toBe('true');
  });

  test('a legacy answer with more than one stored id must be resolved by the athlete, never for them', async () => {
    const server = makeServer();
    server.state.profile.checkin.answers.mistakes_first_response = { answerIds: ['keep_thinking', 'angry_self'] };
    const user = userEvent.setup();
    renderAt('/starting-profile/check-in?section=pressure', server);
    await screen.findByRole('heading', { name: 'Which situation gives you the most trouble right now?' });
    await user.click(screen.getByRole('button', { name: 'Next' }));
    await screen.findByText('What usually happens first after you make a mistake?');
    // Nothing is silently chosen on the athlete's behalf.
    expect(screen.getByRole('radio', { name: /keep thinking/i }).getAttribute('aria-checked')).toBe('false');
    expect(screen.getByRole('radio', { name: /angry/i }).getAttribute('aria-checked')).toBe('false');
    expect(screen.getByText('Choose the one that fits you best now.')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Next' }).disabled).toBe(true);
    // Resolving with an explicit tap unblocks the flow and leaves exactly one.
    await user.click(screen.getByRole('radio', { name: /angry/i }));
    expect(screen.queryByText('Choose the one that fits you best now.')).toBeNull();
    expect(screen.getByRole('button', { name: 'Next' }).disabled).toBe(false);
  });
});

// ── Legacy `unsure` athletes ───────────────────────────────────────────────
// Their stored difficult_moments = ['not_sure'] used to keep them on the
// shallow branch no matter which situation they picked, so the flow asked the
// old branch's questions after a brand-new situation. The explicit situation
// now decides, on the client exactly as on the server.

function legacyUnsureServer() {
  const server = makeServer();
  const p = server.state.profile;
  p.displayProfile.pressure = {
    branchId: 'unsure',
    stages: [
      { stage: 'situation', questionId: 'primary_priority', answerIds: [], customText: null, status: 'unset' },
      { stage: 'firstResponse', questionId: 'unsure_recognition', answerIds: ['one_mistake_snowballs'], customText: null, status: 'set' },
      { stage: 'reset', questionId: 'unsure_recovery', answerIds: ['few_minutes'], customText: null, status: 'set' },
    ],
  };
  p.checkin.screens.pressure = ['primary_priority', 'unsure_recognition', 'unsure_recovery'];
  p.checkin.answers = {
    ...p.checkin.answers,
    primary_priority: { answerIds: [] },
    unsure_recognition: { answerIds: ['one_mistake_snowballs'] },
    unsure_recovery: { answerIds: ['few_minutes'] },
  };
  delete p.checkin.answers.mistakes_first_response;
  delete p.checkin.answers.mistakes_next;
  delete p.checkin.answers.mistakes_recovery;
  return server;
}

test('a legacy unsure athlete who picks a real situation is asked THAT situation\'s questions', async () => {
  const server = legacyUnsureServer();
  const user = userEvent.setup();
  renderAt('/starting-profile/check-in?section=pressure', server);
  await screen.findByRole('heading', { name: 'Which situation gives you the most trouble right now?' });
  await user.click(screen.getByRole('radio', { name: 'After I make a mistake' }));
  await user.click(screen.getByRole('button', { name: 'Next' }));
  // They are told once that the old branch's answers stay saved…
  expect(await screen.findByRole('dialog')).toBeTruthy();
  expect(screen.getByText(/Your earlier answers stay saved/i)).toBeTruthy();
  await user.click(screen.getByRole('button', { name: 'Yes, change it' }));
  // …and then answer the questions for the situation they actually chose.
  expect(screen.queryByRole('heading', { name: 'Which sounds most like you recently?' })).toBeNull();
  expect(await screen.findByRole('heading', { name: 'What usually happens first after you make a mistake?' })).toBeTruthy();
});

test('their save carries the new situation and its own branch answers, and nothing from the old one', async () => {
  const server = legacyUnsureServer();
  const user = userEvent.setup();
  renderAt('/starting-profile/check-in?section=pressure', server);
  await screen.findByRole('heading', { name: 'Which situation gives you the most trouble right now?' });
  await user.click(screen.getByRole('radio', { name: 'After I make a mistake' }));
  await user.click(screen.getByRole('button', { name: 'Next' }));
  await user.click(await screen.findByRole('button', { name: 'Yes, change it' }));
  await user.click(await screen.findByRole('radio', { name: /angry/i }));
  await user.click(screen.getByRole('button', { name: 'Next' }));
  await user.click(await screen.findByRole('radio', { name: /I lose focus/i }));
  await user.click(screen.getByRole('button', { name: 'Next' }));
  await user.click(await screen.findByRole('radio', { name: 'A few minutes' }));
  await user.click(screen.getByRole('button', { name: 'Save changes' }));
  await vi.waitFor(() => expect(server.state.patched.length).toBe(1));
  expect(patchedQids(server)).toEqual(['mistakes_first_response', 'mistakes_next', 'mistakes_recovery', 'primary_priority']);
  // The old branch's answer is never re-sent, and never overwritten either.
  expect(server.state.patched[0].unsure_recognition).toBeUndefined();
  expect(server.state.profile.checkin.answers.unsure_recognition.answerIds).toEqual(['one_mistake_snowballs']);
  // Unrelated sections untouched.
  expect(server.state.profile.checkin.answers.supports.answerIds).toEqual(['clear_preparation']);
  expect(server.state.profile.checkin.answers.strengths.answerIds).toEqual(['hard_working']);
});

test('their profile shows "Not set yet" for a situation they have not chosen — never a stale one', async () => {
  const server = legacyUnsureServer();
  renderAt('/starting-profile', server);
  const ol = await screen.findByRole('list', { name: 'When Pressure Hits' });
  expect(ol.textContent).toContain('Situation');
  expect(ol.textContent).toContain('Not set yet');
  // The shallow branch asked one combined question, so it is labelled as one.
  expect(ol.textContent).toContain('What usually happens');
  expect(ol.textContent).not.toContain('First response');
});
