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
        <Route path="/starting-profile" element={<p>starting profile</p>} />
      </Routes>
    </MemoryRouter>
  );
}

const cont = () => screen.getByRole('button', { name: /^(Continue|Finish)$/ });
const radio = (name) => screen.getByRole('radio', { name });
const checkbox = (name) => screen.getByRole('checkbox', { name });

// Advance through the fixed About-you screens into "What would you like help
// with?" — the first screen of the simplified sequence after the sport facts.
async function toHelpWith(user) {
  await user.click(await screen.findByRole('radio', { name: 'Cricket' }));
  await user.click(cont());
  await user.click(await screen.findByRole('radio', { name: 'No fixed role' }));
  await user.click(cont());
  await user.click(await screen.findByRole('radio', { name: 'State level' }));
  await user.click(screen.getByRole('radio', { name: 'Semi-serious' }));
  await user.click(cont());
  await screen.findByRole('heading', { name: 'What would you like help with?' });
}

// …and on into the Situation question (help with → 4-week change → situation).
async function toSituation(user) {
  await toHelpWith(user);
  await user.click(checkbox('Recovering from Setbacks'));
  await user.click(cont());
  await screen.findByRole('heading', { name: 'What one change would make the biggest difference in the next four weeks?' });
  await user.click(radio('Recover faster after mistakes'));
  await user.click(cont());
  await screen.findByRole('heading', { name: 'Which situation gives you the most trouble right now?' });
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

  test('"What would you like help with?" is a multi-select capped at three', async () => {
    wire(makeServer());
    render(<App />);
    const user = userEvent.setup();
    await toHelpWith(user);
    await user.click(checkbox('Focus & Concentration'));
    await user.click(checkbox('Handling Pressure'));
    await user.click(checkbox('Building Confidence'));
    expect(checkbox('Staying Motivated').disabled).toBe(true);
    // Unpicking one frees the slot again.
    await user.click(checkbox('Handling Pressure'));
    expect(checkbox('Staying Motivated').disabled).toBe(false);
  });

  test('the 4-week change is one answer, and it is asked before the pressure questions', async () => {
    wire(makeServer());
    render(<App />);
    const user = userEvent.setup();
    await toHelpWith(user);
    await user.click(checkbox('Recovering from Setbacks'));
    await user.click(cont());
    const heading = await screen.findByRole('heading', { name: 'What one change would make the biggest difference in the next four weeks?' });
    expect(heading).toBeTruthy();
    await user.click(radio('Recover faster after mistakes'));
    await user.click(radio('Stay focused for longer'));
    // Single-choice: the second answer replaces the first, never adds to it.
    expect(radio('Recover faster after mistakes').getAttribute('aria-checked')).toBe('false');
    expect(radio('Stay focused for longer').getAttribute('aria-checked')).toBe('true');
  });

  test('the athlete explicitly chooses their situation, from the whole situation list', async () => {
    wire(makeServer());
    render(<App />);
    const user = userEvent.setup();
    await toSituation(user);
    // Every situation is offered — the athlete is not limited to a shortlist
    // they picked on an earlier screen, and it is a single choice.
    for (const name of [
      'After I make a mistake', 'Before an important performance', 'When the pressure increases',
      'When I lose focus', 'When my confidence drops', 'When training motivation is low',
      'When selection feels uncertain', 'My situation is different',
    ]) {
      expect(radio(name)).toBeTruthy();
    }
    // "I'm not sure yet" is not a situation, so it is not offered here.
    expect(screen.queryByRole('radio', { name: "I'm not sure yet" })).toBeNull();
    expect(screen.queryByRole('checkbox', { name: 'After I make a mistake' })).toBeNull();
  });

  test('a custom situation keeps the athlete\'s own words on the Situation question itself', async () => {
    wire(makeServer());
    render(<App />);
    const user = userEvent.setup();
    await toSituation(user);
    await user.click(radio('My situation is different'));
    const input = await screen.findByLabelText('Write your own');
    expect(cont().disabled).toBe(true); // empty custom blocks
    await user.type(input, 'exam pressure');
    expect(cont().disabled).toBe(false);
  });

  test('the mistakes branch asks first response → performance impact → reset time', async () => {
    wire(makeServer());
    render(<App />);
    const user = userEvent.setup();
    await toSituation(user);
    await user.click(radio('After I make a mistake'));
    await user.click(cont());
    // Each question names the situation it follows, in that order.
    expect(await screen.findByRole('heading', { name: 'What usually happens first after you make a mistake?' })).toBeTruthy();
    await user.click(radio('I keep thinking about it'));
    await user.click(cont());
    expect(await screen.findByRole('heading', { name: 'What usually happens to your performance next?' })).toBeTruthy();
    await user.click(radio('I hesitate'));
    await user.click(cont());
    expect(await screen.findByRole('heading', { name: 'How long does it usually take you to get back on track?' })).toBeTruthy();
    // Reset time is one answer from the plain-language set.
    expect(radio('A few minutes')).toBeTruthy();
    expect(radio('Most of the session or match')).toBeTruthy();
  });

  test('the pre-performance branch asks the same three stages — no extra onset question', async () => {
    wire(makeServer());
    render(<App />);
    const user = userEvent.setup();
    await toSituation(user);
    await user.click(radio('Before an important performance'));
    await user.click(cont());
    expect(await screen.findByRole('heading', { name: 'Before an important performance, what usually happens first?' })).toBeTruthy();
    expect(screen.queryByRole('heading', { name: 'When do you first notice the pressure or nerves?' })).toBeNull();
    await user.click(radio('Tight or tense body'));
    await user.click(cont());
    expect(await screen.findByRole('heading', { name: 'What usually happens to your performance next?' })).toBeTruthy();
    await user.click(radio('I rush'));
    await user.click(cont());
    expect(await screen.findByRole('heading', { name: 'How long does it usually take you to get back on track?' })).toBeTruthy();
  });

  test('a historical "not sure yet" session still skips the situation and keeps its unsure branch', async () => {
    // Existing athletes routed to the shallow branch before the simplification
    // are never re-routed or re-onboarded by it.
    wire(makeServer({ answers: {
      sport: { answerIds: ['cricket'] }, role_position: { answerIds: ['none'] },
      competition_level: { answerIds: ['state'] }, experience_level: { answerIds: ['competitive'] },
      difficult_moments: { answerIds: ['not_sure'] },
    }, currentStepId: 'unsure_recognition', branchId: 'unsure' }));
    render(<App />);
    expect(await screen.findByRole('heading', { name: 'Which sounds most like you recently?' })).toBeTruthy();
    expect(screen.queryByRole('heading', { name: 'Which situation gives you the most trouble right now?' })).toBeNull();
  });

  test('strengths is optional — Finish is enabled with nothing selected', async () => {
    wire(makeServer({ answers: {
      sport: { answerIds: ['cricket'] }, role_position: { answerIds: ['none'] },
      competition_level: { answerIds: ['state'] }, experience_level: { answerIds: ['competitive'] },
      broad_goals: { answerIds: ['resilience'] }, four_week_outcome: { answerIds: ['recover_faster'] },
      primary_priority: { answerIds: ['after_mistake'] },
      mistakes_first_response: { answerIds: ['keep_thinking'] }, mistakes_next: { answerIds: ['hesitate'] }, mistakes_recovery: { answerIds: ['few_minutes'] },
      supports: { answerIds: ['clear_preparation'] },
    }, currentStepId: 'strengths', branchId: 'mistakes' }));
    render(<App />);
    expect(await screen.findByRole('heading', { name: 'Which strengths can you rely on in sport?' })).toBeTruthy();
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
      broad_goals: { answerIds: ['resilience'] }, four_week_outcome: { answerIds: ['recover_faster'] },
      primary_priority: { answerIds: ['after_mistake'] },
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
    expect(await screen.findByRole('heading', { name: 'What usually takes your focus away first?' })).toBeTruthy();
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

  test('completion posts complete, updates the user, and lands on the Starting Performance Profile', async () => {
    wire(makeServer({ answers: {
      sport: { answerIds: ['cricket'] }, role_position: { answerIds: ['none'] },
      competition_level: { answerIds: ['state'] }, experience_level: { answerIds: ['competitive'] },
      broad_goals: { answerIds: ['confidence'] }, four_week_outcome: { answerIds: ['recover_faster'] },
      primary_priority: { answerIds: ['after_mistake'] },
      mistakes_first_response: { answerIds: ['keep_thinking'] }, mistakes_next: { answerIds: ['hesitate'] }, mistakes_recovery: { answerIds: ['few_minutes'] },
      supports: { answerIds: ['clear_preparation'] },
    }, currentStepId: 'strengths', branchId: 'mistakes' }));
    render(<App />);
    const user = userEvent.setup();
    await user.click(await screen.findByRole('checkbox', { name: 'Brave' }));
    await user.click(screen.getByRole('button', { name: 'Finish' }));
    await screen.findByText('starting profile');
    expect(authState.updateUser).toHaveBeenCalled();
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

  test('Stage G: a single-select shows no indicator until chosen; a multi-select always shows its checkbox', async () => {
    wire(makeServer());
    render(<App />);
    const user = userEvent.setup();

    await screen.findByRole('heading', { name: 'What sport do you play?' });
    // Single-select, unselected: no check glyph anywhere in the option.
    expect(radio('Football').textContent).not.toContain('✓');
    await user.click(radio('Cricket'));
    expect(radio('Cricket').textContent).toContain('✓');

    await user.click(cont());
    await user.click(await screen.findByRole('radio', { name: 'No fixed role' }));
    await user.click(cont());
    await user.click(await screen.findByRole('radio', { name: 'State level' }));
    await user.click(screen.getByRole('radio', { name: 'Semi-serious' }));
    await user.click(cont());

    // Multi-select: the checkbox slot is present even when unselected, so it
    // reads as "you may pick several" before anything is chosen.
    await screen.findByRole('heading', { name: 'What would you like help with?' });
    const box = checkbox('Focus & Concentration');
    expect(box.getAttribute('aria-checked')).toBe('false');
    expect(box.querySelector('.rounded-md')).toBeTruthy();
  });

  test('Stage G: options disabled at the limit are dimmed to the approved ~55%, never styled as selected', async () => {
    wire(makeServer());
    render(<App />);
    const user = userEvent.setup();
    await toHelpWith(user);
    await user.click(checkbox('Focus & Concentration'));
    await user.click(checkbox('Handling Pressure'));
    await user.click(checkbox('Building Confidence'));

    const blocked = checkbox('Staying Motivated');
    expect(blocked.disabled).toBe(true);
    expect(blocked.className).toMatch(/opacity-\[0\.55\]/);
    // Dimmed, but never wearing the selected treatment.
    expect(blocked.className).not.toMatch(/border-brand-500/);
    expect(blocked.getAttribute('aria-checked')).toBe('false');
  });

  test('Stage G: the selection count sits with the Continue action, and the action area has no divider panel', async () => {
    wire(makeServer());
    render(<App />);
    const user = userEvent.setup();
    await toHelpWith(user);
    await user.click(checkbox('Focus & Concentration'));

    const footer = document.querySelector('footer');
    expect(footer.textContent).toContain('1 of 3 selected');
    expect(footer.className).not.toMatch(/border-t/);
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
