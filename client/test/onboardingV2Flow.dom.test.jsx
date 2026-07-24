// Behavioural tests for the adaptive onboarding (v2) flow. Real page + real
// router; a stateful fake server backs apiFetch and uses the SAME client
// config helpers for branch/prune so the mock matches server semantics.

import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import * as CFG from '../src/onboarding/config';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const shellSrc = readFileSync(path.join(__dirname, '../src/components/onboarding/OnboardingShell.jsx'), 'utf8');

const authState = { user: { id: 'u1', onboardingDone: false, name: 'A' }, token: 't', language: 'en', updateUser: vi.fn() };
vi.mock('../src/contexts/AuthContext', () => ({ useAuth: () => authState }));
vi.mock('../src/api', () => ({ apiFetch: vi.fn() }));

const { apiFetch } = await import('../src/api');
const { default: OnboardingPage } = await import('../src/pages/OnboardingPage.jsx');

function makeServer(overrides = {}) {
  let session = {
    onboardingVersion: 2, attemptNumber: 1, status: 'IN_PROGRESS', revision: 0,
    currentStepId: null, branchId: null, primaryPriorityId: null, answers: {},
    startedAt: new Date().toISOString(), lastSavedAt: new Date().toISOString(), completedAt: null,
    ...overrides,
  };
  const srv = {
    get session() { return session; },
    bump() { session = { ...session, revision: session.revision + 1 }; },
    handle(method, path, body) {
      if (path === '/api/onboarding/session' && method === 'GET') return [200, { session, questionSetVersion: 2 }];
      if (path === '/api/onboarding/session' && method === 'PATCH') {
        if (body.expectedRevision !== session.revision) return [409, { error: 'STALE_CONFLICT', session, revision: session.revision }];
        const merged = { ...session.answers };
        for (const [q, a] of Object.entries(body.answers || {})) merged[q] = a;
        const reachable = CFG.reachableQuestionIds(merged);
        const pruned = Object.keys(merged).filter((q) => !reachable.has(q));
        pruned.forEach((q) => delete merged[q]);
        session = {
          ...session, answers: merged, currentStepId: body.currentStepId ?? session.currentStepId,
          branchId: CFG.resolveBranch(merged), primaryPriorityId: merged.primary_priority?.answerIds?.[0] || null,
          revision: session.revision + 1,
        };
        return [200, { session, prunedQuestionIds: pruned }];
      }
      if (path === '/api/onboarding/session/complete' && method === 'POST') {
        if (body.expectedRevision !== session.revision) return [409, { error: 'STALE_CONFLICT', session, revision: session.revision }];
        session = { ...session, status: 'COMPLETED', completedAt: new Date().toISOString(), revision: session.revision + 1 };
        return [200, { user: { id: 'u1', onboardingDone: true, goals: [] }, session }];
      }
      return [404, { error: 'NOPE' }];
    },
  };
  return srv;
}

function wire(server, opts = {}) {
  apiFetch.mockImplementation((path, init = {}) => {
    const method = init.method || 'GET';
    const body = init.body ? JSON.parse(init.body) : undefined;
    if (opts.failNext && method === 'PATCH') { opts.failNext = false; return Promise.reject(new Error('network')); }
    const [status, payload] = server.handle(method, path, body);
    return Promise.resolve({ ok: status < 400, status, json: async () => payload });
  });
}

function App() {
  return (
    <MemoryRouter initialEntries={['/onboarding']}>
      <Routes>
        <Route path="/onboarding" element={<OnboardingPage />} />
        <Route path="/mind-journal" element={<p>mind journal</p>} />
      </Routes>
    </MemoryRouter>
  );
}

const cont = () => screen.getByRole('button', { name: /^(Continue|Finish)$/ });
const radio = (name) => screen.getByRole('radio', { name });
const checkbox = (name) => screen.getByRole('checkbox', { name });

// Advance through the fixed About-you screens into difficult_moments.
async function toDifficultMoments(user) {
  await user.click(await screen.findByRole('radio', { name: 'Cricket' }));
  await user.click(cont());
  await user.click(await screen.findByRole('radio', { name: 'No fixed role' }));
  await user.click(cont());
  await user.click(await screen.findByRole('radio', { name: 'State level' }));
  await user.click(screen.getByRole('radio', { name: 'Semi-serious' }));
  await user.click(cont());
  await screen.findByRole('heading', { name: 'Which moments feel hardest right now?' });
}

beforeEach(() => { localStorage.clear(); authState.language = 'en'; authState.user = { id: 'u1', onboardingDone: false, name: 'A' }; });
afterEach(() => cleanup());

describe('Adaptive onboarding v2', () => {
  test('shows a loading state, then resumes on the first screen from the server session', async () => {
    wire(makeServer());
    render(<App />);
    expect(await screen.findByRole('heading', { name: 'What sport do you play?' })).toBeTruthy();
    expect(screen.getAllByText('Stage 1 of 3').length).toBeGreaterThan(0);
  });

  test('playing_context is one screen holding both competition and experience questions', async () => {
    wire(makeServer());
    render(<App />);
    const user = userEvent.setup();
    await user.click(await screen.findByRole('radio', { name: 'Cricket' }));
    await user.click(cont());
    await user.click(await screen.findByRole('radio', { name: 'No fixed role' }));
    await user.click(cont());
    // both question groups on the same screen
    expect(await screen.findByText('Where do you mostly compete?')).toBeTruthy();
    expect(screen.getByText('How would you describe your experience?')).toBeTruthy();
    // Continue gated until both answered
    await user.click(screen.getByRole('radio', { name: 'State level' }));
    expect(cont().disabled).toBe(true);
    await user.click(screen.getByRole('radio', { name: 'Semi-serious' }));
    expect(cont().disabled).toBe(false);
  });

  test('difficult_moments enforces the 3-limit and not_sure is exclusive', async () => {
    wire(makeServer());
    render(<App />);
    const user = userEvent.setup();
    await toDifficultMoments(user);
    await user.click(checkbox('After I make a mistake'));
    await user.click(checkbox('When I lose focus'));
    await user.click(checkbox('When my confidence drops'));
    // fourth disabled at limit
    expect(checkbox('After a poor result').disabled).toBe(true);
    // exclusive not_sure clears the others
    await user.click(checkbox("I'm not sure yet"));
    expect(checkbox("I'm not sure yet").getAttribute('aria-checked')).toBe('true');
    expect(checkbox('After I make a mistake').getAttribute('aria-checked')).toBe('false');
    // choosing a normal one clears the exclusive
    await user.click(checkbox('After I make a mistake'));
    expect(checkbox("I'm not sure yet").getAttribute('aria-checked')).toBe('false');
  });

  test('custom difficult-moment counts toward the limit and needs valid text', async () => {
    wire(makeServer());
    render(<App />);
    const user = userEvent.setup();
    await toDifficultMoments(user);
    await user.click(checkbox('My situation is different'));
    const input = await screen.findByLabelText('Your answer');
    expect(cont().disabled).toBe(true); // empty custom blocks
    await user.type(input, 'exam pressure');
    expect(cont().disabled).toBe(false);
    // counts as one of three
    await user.click(checkbox('After I make a mistake'));
    await user.click(checkbox('When I lose focus'));
    expect(checkbox('When my confidence drops').disabled).toBe(true);
  });

  test('primary_priority only shows the difficult moments the athlete chose', async () => {
    wire(makeServer());
    render(<App />);
    const user = userEvent.setup();
    await toDifficultMoments(user);
    await user.click(checkbox('After I make a mistake'));
    await user.click(checkbox('When I lose focus'));
    await user.click(cont());
    expect(await screen.findByRole('heading', { name: 'Which one affects you most right now?' })).toBeTruthy();
    expect(radio('After I make a mistake')).toBeTruthy();
    expect(radio('When I lose focus')).toBeTruthy();
    expect(screen.queryByRole('radio', { name: 'When my confidence drops' })).toBeNull();
  });

  test('mistakes branch renders its three screens in order', async () => {
    wire(makeServer());
    render(<App />);
    const user = userEvent.setup();
    await toDifficultMoments(user);
    await user.click(checkbox('After I make a mistake'));
    await user.click(cont());
    await user.click(await screen.findByRole('radio', { name: 'After I make a mistake' }));
    await user.click(cont());
    expect(await screen.findByRole('heading', { name: 'What usually happens first after a mistake?' })).toBeTruthy();
    await user.click(checkbox('I keep thinking about it'));
    await user.click(cont());
    expect(await screen.findByRole('heading', { name: 'What tends to happen next?' })).toBeTruthy();
    await user.click(checkbox('I hesitate'));
    await user.click(cont());
    expect(await screen.findByRole('heading', { name: 'How long does it usually affect you?' })).toBeTruthy();
  });

  test('pre_performance branch renders FOUR screens', async () => {
    wire(makeServer());
    render(<App />);
    const user = userEvent.setup();
    await toDifficultMoments(user);
    await user.click(checkbox('Before an important performance'));
    await user.click(cont());
    await user.click(await screen.findByRole('radio', { name: 'Before an important performance' }));
    await user.click(cont());
    expect(await screen.findByRole('heading', { name: 'When do you first notice the pressure or nerves?' })).toBeTruthy();
    await user.click(radio('Just before I perform'));
    await user.click(cont());
    await user.click(await screen.findByRole('checkbox', { name: 'Tight or tense body' }));
    await user.click(cont());
    await user.click(await screen.findByRole('checkbox', { name: 'I rush' }));
    await user.click(cont());
    // the 4th, branch-specific duration screen
    expect(await screen.findByRole('heading', { name: 'How long does the pressure stay disruptive?' })).toBeTruthy();
  });

  test('choosing only "I\'m not sure yet" skips priority and enters the shallow unsure branch', async () => {
    wire(makeServer());
    render(<App />);
    const user = userEvent.setup();
    await toDifficultMoments(user);
    await user.click(checkbox("I'm not sure yet"));
    await user.click(cont());
    // no priority screen — straight to recognition
    expect(await screen.findByRole('heading', { name: 'Which sounds most like you recently?' })).toBeTruthy();
    expect(screen.queryByRole('heading', { name: 'Which one affects you most right now?' })).toBeNull();
  });

  test('contextual_pressures is optional — Continue is enabled with nothing selected', async () => {
    wire(makeServer({ answers: {
      sport: { answerIds: ['cricket'] }, role_position: { answerIds: ['none'] },
      competition_level: { answerIds: ['state'] }, experience_level: { answerIds: ['competitive'] },
      difficult_moments: { answerIds: ['after_mistake'] }, primary_priority: { answerIds: ['after_mistake'] },
      mistakes_first_response: { answerIds: ['keep_thinking'] }, mistakes_next: { answerIds: ['hesitate'] }, mistakes_recovery: { answerIds: ['few_minutes'] },
    }, currentStepId: 'contextual_pressures', branchId: 'mistakes' }));
    render(<App />);
    expect(await screen.findByRole('heading', { name: 'What can make this harder?' })).toBeTruthy();
    expect(cont().disabled).toBe(false);
  });

  test('save failure keeps the athlete on the screen and offers Retry, then succeeds', async () => {
    const server = makeServer();
    const opts = { failNext: false };
    wire(server, opts);
    render(<App />);
    const user = userEvent.setup();
    await user.click(await screen.findByRole('radio', { name: 'Cricket' }));
    opts.failNext = true; // next PATCH fails
    await user.click(cont());
    expect(await screen.findByText("Couldn't save")).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'What sport do you play?' })).toBeTruthy(); // did not advance
    await user.click(screen.getByRole('button', { name: 'Retry' }));
    expect(await screen.findByRole('heading', { name: "What's your role, position or event?" })).toBeTruthy();
  });

  test('changing the primary priority to a new branch warns before clearing branch answers', async () => {
    wire(makeServer({ answers: {
      sport: { answerIds: ['cricket'] }, role_position: { answerIds: ['none'] },
      competition_level: { answerIds: ['state'] }, experience_level: { answerIds: ['competitive'] },
      difficult_moments: { answerIds: ['after_mistake', 'lose_focus'] }, primary_priority: { answerIds: ['after_mistake'] },
      mistakes_first_response: { answerIds: ['keep_thinking'] },
    }, currentStepId: 'primary_priority', branchId: 'mistakes', primaryPriorityId: 'after_mistake', revision: 3 }));
    render(<App />);
    const user = userEvent.setup();
    // switch priority → focus branch, which orphans mistakes_first_response
    await user.click(await screen.findByRole('radio', { name: 'When I lose focus' }));
    await user.click(cont());
    expect(await screen.findByRole('dialog')).toBeTruthy();
    expect(screen.getByText(/earlier answers about the previous situation will be removed/i)).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Yes, change it' }));
    // now on the focus branch's first screen
    expect(await screen.findByRole('heading', { name: 'When does your focus usually drift?' })).toBeTruthy();
  });

  test('a newer server revision with unsaved local edits surfaces a conflict choice', async () => {
    const server = makeServer({ revision: 5 });
    wire(server);
    // Seed a recovery cache that is behind the server and has a pending edit.
    localStorage.setItem('arjun_onboarding_v2_u1', JSON.stringify({
      userId: 'u1', baseRevision: 3, answers: { sport: { answerIds: ['football'] } }, dirty: ['sport'], currentStepId: 'sport',
    }));
    render(<App />);
    expect(await screen.findByRole('dialog')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Use the saved version' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Re-apply my changes' })).toBeTruthy();
  });

  test('completion posts complete, updates the user, and lands on Mind Journal', async () => {
    wire(makeServer({ answers: {
      sport: { answerIds: ['cricket'] }, role_position: { answerIds: ['none'] },
      competition_level: { answerIds: ['state'] }, experience_level: { answerIds: ['competitive'] },
      difficult_moments: { answerIds: ['after_mistake'] }, primary_priority: { answerIds: ['after_mistake'] },
      mistakes_first_response: { answerIds: ['keep_thinking'] }, mistakes_next: { answerIds: ['hesitate'] }, mistakes_recovery: { answerIds: ['few_minutes'] },
      contextual_pressures: { answerIds: [] }, supports: { answerIds: ['clear_preparation'] }, strengths: { answerIds: ['brave'] },
      broad_goals: { answerIds: ['confidence'] },
    }, currentStepId: 'four_week_outcome', branchId: 'mistakes' }));
    render(<App />);
    const user = userEvent.setup();
    await user.click(await screen.findByRole('radio', { name: 'Recover faster after mistakes' }));
    await user.click(screen.getByRole('button', { name: 'Finish' }));
    await screen.findByText('mind journal');
    expect(authState.updateUser).toHaveBeenCalled();
  });

  test('an already-onboarded user is redirected away from onboarding', async () => {
    authState.user = { id: 'u1', onboardingDone: true, name: 'A' };
    wire(makeServer());
    render(<App />);
    await waitFor(() => expect(screen.getByText('mind journal')).toBeTruthy());
  });

  test('DOM structure is identical in light and dark themes on the sport screen', async () => {
    wire(makeServer());
    document.documentElement.setAttribute('data-theme', 'light');
    const { container: light } = render(<App />);
    await screen.findByRole('heading', { name: 'What sport do you play?' });
    const lightHtml = light.innerHTML;
    cleanup();
    localStorage.clear();
    wire(makeServer());
    document.documentElement.setAttribute('data-theme', 'dark');
    const { container: dark } = render(<App />);
    await screen.findByRole('heading', { name: 'What sport do you play?' });
    expect(dark.innerHTML).toBe(lightHtml);
    document.documentElement.removeAttribute('data-theme');
  });

  test('Hindi renders the first screen', async () => {
    authState.language = 'hi';
    wire(makeServer());
    render(<App />);
    expect(await screen.findByRole('heading', { name: 'आप कौन सा खेल खेलते हैं?' })).toBeTruthy();
  });

  test('advancing a screen moves focus to the new heading (focus management)', async () => {
    wire(makeServer());
    render(<App />);
    const user = userEvent.setup();
    await user.click(await screen.findByRole('radio', { name: 'Cricket' }));
    await user.click(cont());
    const roleHeading = await screen.findByRole('heading', { name: "What's your role, position or event?" });
    await waitFor(() => expect(document.activeElement).toBe(roleHeading));
  });

  test('the onboarding heading is programmatically focusable and options are accessible controls', async () => {
    wire(makeServer());
    render(<App />);
    const heading = await screen.findByRole('heading', { name: 'What sport do you play?' });
    expect(heading.getAttribute('tabindex')).toBe('-1');
    const cricket = radio('Cricket');
    expect(cricket.getAttribute('aria-checked')).toBe('false');
    expect(cricket.closest('[role="radiogroup"]')).toBeTruthy();
  });

  // jsdom can't evaluate max()/env() inline styles or CSS animations, so these
  // frame contracts are asserted at the source level (the shell is shared).
  test('the shell footer honours the device safe area and the entrance is reduced-motion safe', () => {
    expect(shellSrc).toMatch(/env\(safe-area-inset-bottom\)/);
    expect(shellSrc).toMatch(/motion-safe:animate-fade-in/);
  });
});
