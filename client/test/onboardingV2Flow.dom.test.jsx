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
      if (path === '/api/path/match' && method === 'PUT') return [200, { match: { nextDay: body.day } }];
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
        <Route path="/starting-profile" element={<p>starting profile</p>} />
        <Route path="/welcome" element={<p>welcome</p>} />
      </Routes>
    </MemoryRouter>
  );
}

const cont = () => screen.getByRole('button', { name: /^(Continue|Finish)$/ });
const radio = (name) => screen.getByRole('radio', { name });
const checkbox = (name) => screen.getByRole('checkbox', { name });

// Short onboarding (founder, Nov 2026): sport + role → level → situation →
// one follow-up → /welcome (next match → Mind Challenge).
async function toSituation(user) {
  await user.click(await screen.findByRole('radio', { name: 'Cricket' }));
  await user.click(await screen.findByRole('radio', { name: 'No fixed role' }));
  await user.click(cont());
  await screen.findByRole('heading', { name: 'Level' });
  await user.click(radio('State level'));
  await user.click(cont());
  await screen.findByRole('heading', { name: 'Which situation gives you the most trouble right now?' });
}

beforeEach(() => { localStorage.clear(); authState.language = 'en'; authState.user = { id: 'u1', onboardingDone: false, name: 'A' }; });
afterEach(() => cleanup());

const DONE_ANSWERS = {
  sport: { answerIds: ['cricket'] }, role_position: { answerIds: ['none'] },
  competition_level: { answerIds: ['state'] },
  primary_priority: { answerIds: ['after_mistake'] },
};

describe('Adaptive onboarding v2 (short flow)', () => {
  test('shows a loading state, then resumes on the first screen from the server session', async () => {
    wire(makeServer());
    render(<App />);
    expect(await screen.findByRole('heading', { name: 'What sport do you play?' })).toBeTruthy();
    expect(screen.getAllByText('Stage 1 of 3').length).toBeGreaterThan(0);
  });

  test('sport and role sit on one screen; the role choices follow the sport', async () => {
    wire(makeServer());
    render(<App />);
    const user = userEvent.setup();
    await screen.findByRole('heading', { name: 'What sport do you play?' });
    expect(screen.queryByRole('radio', { name: 'Batter' })).toBeNull();
    expect(cont().disabled).toBe(true);
    await user.click(radio('Cricket'));
    expect(await screen.findByRole('radio', { name: 'Batter' })).toBeTruthy();
    expect(cont().disabled).toBe(true);
    await user.click(radio('Batter'));
    expect(cont().disabled).toBe(false);
  });

  test('the level is one question (no separate experience question)', async () => {
    wire(makeServer());
    render(<App />);
    const user = userEvent.setup();
    await user.click(await screen.findByRole('radio', { name: 'Cricket' }));
    await user.click(await screen.findByRole('radio', { name: 'No fixed role' }));
    await user.click(cont());
    await screen.findByRole('heading', { name: 'Level' });
    expect(screen.queryByText('How would you describe your experience?')).toBeNull();
    await user.click(radio('State level'));
    expect(cont().disabled).toBe(false);
  });

  test('no goals or 4-week questions: the situation comes straight after the level, from the whole list', async () => {
    wire(makeServer());
    render(<App />);
    const user = userEvent.setup();
    await toSituation(user);
    for (const name of ['After I make a mistake', 'Nervousness before matches', 'When I lose focus', 'When my confidence drops', 'My situation is different']) {
      expect(radio(name)).toBeTruthy();
    }
    expect(screen.queryByRole('radio', { name: "I'm not sure yet" })).toBeNull();
  });

  test('a custom situation keeps the athlete\'s own words on the Situation question itself', async () => {
    wire(makeServer());
    render(<App />);
    const user = userEvent.setup();
    await toSituation(user);
    await user.click(radio('My situation is different'));
    const input = await screen.findByLabelText('Write your own');
    expect(cont().disabled).toBe(true);
    await user.type(input, 'exam pressure');
    expect(cont().disabled).toBe(false);
  });

  test('after the situation: what you notice first, then ONE follow-up, then pressure / what helps / your week', async () => {
    wire(makeServer());
    render(<App />);
    const user = userEvent.setup();
    await toSituation(user);
    await user.click(radio('After I make a mistake'));
    await user.click(cont());
    expect(await screen.findByRole('heading', { name: 'When it happens, what do you notice first?' })).toBeTruthy();
    expect(screen.getByTestId('onb-uses').textContent).toMatch(/Arjun uses this to.*Pressure Reset/);
    await user.click(screen.getByRole('radio', { name: /^My thoughts/ }));
    await user.click(cont());
    expect(await screen.findByRole('heading', { name: 'What usually happens to your performance next?' })).toBeTruthy();
    await user.click(radio('I hesitate'));
    await user.click(cont());
    expect(await screen.findByRole('heading', { name: 'Where does the pressure come from?' })).toBeTruthy();
    expect(screen.getAllByText('Stage 3 of 3').length).toBeGreaterThan(0);
    expect(cont().disabled).toBe(false); // optional
    await user.click(cont());
    expect(await screen.findByRole('heading', { name: 'What already helps you?' })).toBeTruthy();
    expect(cont().disabled).toBe(false); // optional
    await user.click(cont());
    expect(await screen.findByRole('heading', { name: 'Your week' })).toBeTruthy();
    expect(screen.getByTestId('onb-match')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Finish' }).disabled).toBe(true);
    await user.click(radio('Evening'));
    expect(screen.getByRole('button', { name: 'Finish' }).disabled).toBe(false);
  });

  test('a session saved on a screen from the old, longer onboarding resumes inside the short flow', async () => {
    wire(makeServer({ answers: { ...DONE_ANSWERS, supports: { answerIds: ['clear_preparation'] } }, currentStepId: 'strengths', branchId: 'mistakes' }));
    render(<App />);
    expect(await screen.findByRole('heading', { name: 'When it happens, what do you notice first?' })).toBeTruthy();
  });

  test('a historical "not sure yet" session still keeps its unsure branch', async () => {
    wire(makeServer({ answers: {
      sport: { answerIds: ['cricket'] }, role_position: { answerIds: ['none'] },
      competition_level: { answerIds: ['state'] }, difficult_moments: { answerIds: ['not_sure'] },
    }, currentStepId: 'unsure_recognition', branchId: 'unsure' }));
    render(<App />);
    expect(await screen.findByRole('heading', { name: 'Which sounds most like you recently?' })).toBeTruthy();
  });

  test('save failure keeps the athlete on the screen and offers Retry, then succeeds', async () => {
    const server = makeServer();
    const opts = { failNext: false };
    wire(server, opts);
    render(<App />);
    const user = userEvent.setup();
    await user.click(await screen.findByRole('radio', { name: 'Cricket' }));
    await user.click(await screen.findByRole('radio', { name: 'No fixed role' }));
    opts.failNext = true;
    await user.click(cont());
    expect(await screen.findByText("Couldn't save")).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'What sport do you play?' })).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Retry' }));
    expect(await screen.findByRole('heading', { name: 'Level' })).toBeTruthy();
  });

  test('changing the primary priority to a new branch warns before clearing branch answers', async () => {
    wire(makeServer({ answers: { ...DONE_ANSWERS, mistakes_next: { answerIds: ['hesitate'] } },
      currentStepId: 'primary_priority', branchId: 'mistakes', primaryPriorityId: 'after_mistake', revision: 3 }));
    render(<App />);
    const user = userEvent.setup();
    await user.click(await screen.findByRole('radio', { name: 'When I lose focus' }));
    await user.click(cont());
    expect(await screen.findByRole('dialog')).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Yes, change it' }));
    expect(await screen.findByRole('heading', { name: 'When it happens, what do you notice first?' })).toBeTruthy();
  });

  test('a newer server revision with unsaved local edits surfaces a conflict choice', async () => {
    const server = makeServer({ revision: 5 });
    wire(server);
    localStorage.setItem('arjun_onboarding_v2_u1', JSON.stringify({
      userId: 'u1', baseRevision: 3, answers: { sport: { answerIds: ['football'] } }, dirty: ['sport'], currentStepId: 'sport_role',
    }));
    render(<App />);
    expect(await screen.findByRole('dialog')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Use the saved version' })).toBeTruthy();
  });

  test('completion posts complete, saves the match day, and lands on the first-run welcome', async () => {
    wire(makeServer({ answers: { ...DONE_ANSWERS, first_signal: { answerIds: ['body'] }, mistakes_next: { answerIds: ['hesitate'] } }, currentStepId: 'training_time', branchId: 'mistakes' }));
    render(<App />);
    const user = userEvent.setup();
    await user.click(await screen.findByRole('radio', { name: 'Evening' }));
    const days = within(screen.getByTestId('onb-match')).getAllByRole('radio');
    await user.click(days[2]);
    await user.click(screen.getByRole('button', { name: 'Finish' }));
    await screen.findByText('welcome');
    expect(authState.updateUser).toHaveBeenCalled();
    expect(apiFetch).toHaveBeenCalledWith('/api/path/match', expect.objectContaining({ method: 'PUT' }));
  });

  test('an already-onboarded user is redirected away from onboarding', async () => {
    authState.user = { id: 'u1', onboardingDone: true, name: 'A' };
    wire(makeServer());
    render(<App />);
    await waitFor(() => expect(screen.getByText('starting profile')).toBeTruthy());
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
    await user.click(await screen.findByRole('radio', { name: 'No fixed role' }));
    await user.click(cont());
    const levelHeading = await screen.findByRole('heading', { name: 'Level' });
    await waitFor(() => expect(document.activeElement).toBe(levelHeading));
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

  test('a failed initial GET shows the error+Retry screen (not an infinite spinner), and Retry recovers in place', async () => {
    const server = makeServer();
    let failGet = true;
    apiFetch.mockImplementation((path, init = {}) => {
      const method = init.method || 'GET';
      if (path === '/api/onboarding/session' && method === 'GET' && failGet) {
        return Promise.resolve({ ok: false, status: 404, json: async () => ({ error: 'NOPE' }) });
      }
      const [status, payload] = server.handle(method, path, init.body ? JSON.parse(init.body) : undefined);
      return Promise.resolve({ ok: status < 400, status, json: async () => payload });
    });
    const getCount = () => apiFetch.mock.calls.filter(
      (c) => c[0] === '/api/onboarding/session' && (c[1]?.method || 'GET') === 'GET'
    ).length;

    render(<App />);
    const user = userEvent.setup();

    // Error screen is reachable; the infinite loading spinner is gone.
    expect(await screen.findByText("We couldn't load your onboarding. Please try again.")).toBeTruthy();
    expect(screen.queryByText('Loading your onboarding…')).toBeNull();
    expect(screen.getByRole('button', { name: 'Retry' })).toBeTruthy();

    // Error copy is user-friendly — no URLs, route names, DB/stack details.
    const errText = screen.getByText("We couldn't load your onboarding. Please try again.").textContent;
    expect(errText).not.toMatch(/\/api\/|onboarding\/session|prisma|Error:|http/i);

    // Retry re-runs the load in place (no page refresh) and recovers.
    const before = getCount();
    failGet = false;
    await user.click(screen.getByRole('button', { name: 'Retry' }));
    expect(await screen.findByRole('heading', { name: 'What sport do you play?' })).toBeTruthy();
    expect(getCount()).toBeGreaterThan(before);
  });

  test('a rejected (network/CORS) initial GET also shows the error screen, never a stuck spinner', async () => {
    let failGet = true;
    const server = makeServer();
    apiFetch.mockImplementation((path, init = {}) => {
      const method = init.method || 'GET';
      if (path === '/api/onboarding/session' && method === 'GET' && failGet) return Promise.reject(new Error('network'));
      const [status, payload] = server.handle(method, path, init.body ? JSON.parse(init.body) : undefined);
      return Promise.resolve({ ok: status < 400, status, json: async () => payload });
    });
    render(<App />);
    const user = userEvent.setup();
    expect(await screen.findByRole('button', { name: 'Retry' })).toBeTruthy();
    expect(screen.queryByText('Loading your onboarding…')).toBeNull();
    failGet = false;
    await user.click(screen.getByRole('button', { name: 'Retry' }));
    expect(await screen.findByRole('heading', { name: 'What sport do you play?' })).toBeTruthy();
  });

  // ── Stage G: presentation. These sit ON TOP of the behavioural coverage
  // above; none of them replace a flow assertion. ─────────────────────────

  test('Stage G: option sets with only short labels use the two-column grid; longer sets stay full-width rows', async () => {
    wire(makeServer());
    render(<App />);
    const user = userEvent.setup();

    // sport: longest label "Other sport" (11 chars) → grid of tiles.
    await screen.findByRole('heading', { name: 'What sport do you play?' });
    expect(radio('Cricket').closest('[role="radiogroup"]').className).toMatch(/grid-cols-2/);

    await user.click(radio('Cricket'));
    await user.click(cont());

    // role_position: longest is "My role or event is different" (29) → rows.
    await screen.findByRole('radio', { name: 'No fixed role' });
    expect(radio('No fixed role').closest('[role="radiogroup"]').className).toMatch(/flex-col/);
  });

  test('Stage G: the layout rule is language-stable — Hindi picks the same grid/rows as English', async () => {
    authState.language = 'hi';
    wire(makeServer());
    render(<App />);
    await screen.findByRole('heading', { name: 'आप कौन सा खेल खेलते हैं?' });
    // Same set, same decision, regardless of which language is rendering.
    const group = screen.getAllByRole('radiogroup')[0];
    expect(group.className).toMatch(/grid-cols-2/);
  });

  test('Stage G: a single-select shows no indicator until chosen', async () => {
    wire(makeServer());
    render(<App />);
    const user = userEvent.setup();
    await screen.findByRole('heading', { name: 'What sport do you play?' });
    expect(radio('Football').textContent).not.toContain('✓');
    await user.click(radio('Cricket'));
    expect(radio('Cricket').textContent).toContain('✓');
  });

  test('Stage G (short flow): onboarding asks no multi-select questions any more', async () => {
    wire(makeServer());
    render(<App />);
    const user = userEvent.setup();
    await toSituation(user);
    expect(screen.queryAllByRole('checkbox')).toHaveLength(0);
    expect(document.querySelector('footer').className).not.toMatch(/border-t/);
  });

  test('Stage G: onboarding mounts no app navigation of any kind', async () => {
    wire(makeServer());
    render(<App />);
    await screen.findByRole('heading', { name: 'What sport do you play?' });
    expect(screen.queryByRole('navigation')).toBeNull();
    for (const label of ['Home', 'Train', 'Coach', 'Playbook', 'Profile', 'Settings']) {
      expect(screen.queryByRole('link', { name: label })).toBeNull();
    }
  });

  test('Stage G: the shell pins the action area and keeps header controls at 44px', () => {
    // jsdom cannot lay out dvh/flex, so the frame contract is asserted at
    // source level the same way the safe-area contract already is.
    expect(shellSrc).toMatch(/h-dvh/);
    expect(shellSrc).toMatch(/overflow-y-auto/);
    expect(shellSrc).toMatch(/w-11 h-11/);
    expect(shellSrc).toMatch(/env\(safe-area-inset-top\)/);
  });
});
