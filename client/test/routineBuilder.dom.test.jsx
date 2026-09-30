// Routine Builder (PR 3) — real router integration for the hub, the builder
// flow, the saved-routine view and the classic-page transition. Only useAuth
// and apiFetch are mocked; every request body the UI sends is asserted.

import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom';

const authState = { user: { id: 'u1', onboardingDone: true, position: 'Singles' }, token: 'test-token', language: 'en', updateUser: vi.fn() };
vi.mock('../src/contexts/AuthContext', () => ({ useAuth: () => authState }));
vi.mock('../src/api', () => ({ apiFetch: vi.fn() }));

const { apiFetch } = await import('../src/api');
const { default: RoutinesHubPage } = await import('../src/pages/routines/RoutinesHubPage.jsx');
const { default: RoutineBuilderPage } = await import('../src/pages/routines/RoutineBuilderPage.jsx');
const { default: RoutineViewPage } = await import('../src/pages/routines/RoutineViewPage.jsx');
const { default: RitualPage } = await import('../src/pages/RitualPage.jsx');
const { translations } = await import('../src/i18n/translations');

const t = translations.en.routineBuilder;
const json = (body, status = 200) => ({ ok: status >= 200 && status < 300, status, json: async () => body });
const GUIDANCE = "What you're describing is bigger than sport. Please talk to a trusted adult right now.";

function Probe() {
  const loc = useLocation();
  return <div data-testid="pathname">{loc.pathname}</div>;
}

function renderAt(path) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Probe />
      <Routes>
        <Route path="/train" element={<div>train</div>} />
        <Route path="/ritual" element={<RoutinesHubPage />} />
        <Route path="/ritual/new" element={<RoutineBuilderPage />} />
        <Route path="/ritual/classic" element={<RitualPage />} />
        <Route path="/ritual/:id" element={<RoutineViewPage />} />
      </Routes>
    </MemoryRouter>
  );
}

// Routes every request through `handlers[method path]`, recording each call.
let calls;
function mockApi(handlers) {
  calls = [];
  apiFetch.mockImplementation(async (path, init = {}) => {
    const method = init.method || 'GET';
    const body = init.body ? JSON.parse(init.body) : undefined;
    calls.push({ method, path, body });
    const handler = handlers[`${method} ${path}`];
    if (!handler) throw new Error(`unexpected ${method} ${path}`);
    return typeof handler === 'function' ? handler(body, calls) : handler;
  });
}
const callsTo = (method, path) => calls.filter(c => c.method === method && c.path === path);

// Echoes the requested habits as existing steps plus one suggested step.
function suggestHandler(body) {
  const habits = body.existingHabits || [];
  return json({
    suggestion: {
      category: body.category, timeWindow: body.timeWindow, purposeKey: body.purposeKey === 'not_sure' ? null : body.purposeKey,
      matchType: 'specific', templateKey: `${body.category}.${body.timeWindow}.${body.purposeKey}`, templateVersion: 1,
      steps: [
        ...habits.map(h => ({ kind: 'custom', instruction: h, cue: null, origin: 'existing' })),
        { kind: 'prepare', instruction: 'Choose your plan for the next action', cue: null, origin: 'suggested' },
      ],
      reasons: [],
    },
  });
}

async function answer(user, { situation, moment, purpose, habits = [], timing }) {
  await user.click(await screen.findByRole('radio', { name: situation }));
  await user.click(screen.getByRole('button', { name: t.continue }));
  await user.type(screen.getByRole('textbox', { name: t.momentTitle }), moment);
  await user.click(screen.getByRole('button', { name: t.continue }));
  await user.click(screen.getByRole('radio', { name: purpose }));
  await user.click(screen.getByRole('button', { name: t.continue }));
  for (const h of habits) {
    await user.type(screen.getByRole('textbox', { name: t.habitPlaceholder }), h);
    await user.click(screen.getByRole('button', { name: t.addHabit }));
  }
  await user.click(screen.getByRole('button', { name: habits.length ? t.continue : t.nothingYet }));
  if (timing) {
    await user.click(await screen.findByRole('radio', { name: timing }));
    await user.click(screen.getByRole('button', { name: t.continue }));
  }
  await screen.findByRole('heading', { name: t.reviewTitle });
}

beforeEach(() => { authState.language = 'en'; apiFetch.mockReset(); });
afterEach(() => cleanup());

describe('Routine builder flow', () => {
  test('builds, reviews, edits and saves; existingHabits follow the final reviewed steps', async () => {
    mockApi({
      'POST /api/routines/suggest': suggestHandler,
      'POST /api/routines': (body) => json({ routine: { id: 'r42', ...body } }, 201),
    });
    const user = userEvent.setup();
    renderAt('/ritual/new');
    await answer(user, {
      situation: t.situations.repeated_moment, moment: 'After every point',
      purpose: t.purposes.focus, habits: ['Towel off', 'Tap the line twice'],
    });

    // Timing was never asked for repeated actions; the default is sent.
    expect(screen.queryByText(t.timingTitle)).toBeNull();
    expect(callsTo('POST', '/api/routines/suggest').map(c => c.body)).toEqual([{
      category: 'repeated_moment', purposeKey: 'focus', timeWindow: 'seconds', existingHabits: ['Towel off', 'Tap the line twice'],
    }]);
    // Nothing is saved just by getting a suggestion.
    expect(callsTo('POST', '/api/routines')).toHaveLength(0);

    expect(screen.getByLabelText(t.nameLabel).value).toBe('After every point');
    expect(screen.getAllByText(t.youAlreadyDoThis)).toHaveLength(2);

    // Edit habit 2, move it to the top, delete the other habit.
    const step2 = screen.getByRole('textbox', { name: t.stepLabel(2) });
    await user.clear(step2);
    await user.type(step2, 'Tap the line three times');
    await user.click(screen.getByRole('button', { name: `${t.moveUp}: ${t.stepLabel(2)}` }));
    await user.click(screen.getByRole('button', { name: `${t.deleteStep}: ${t.stepLabel(2)}` }));
    // Add a step of my own.
    await user.click(screen.getByRole('button', { name: t.addStep }));
    await user.type(screen.getByRole('textbox', { name: t.stepLabel(3) }), 'Look at my strings');

    await user.click(screen.getByRole('button', { name: t.save }));
    expect(await screen.findByRole('heading', { name: t.savedTitle })).toBeTruthy();

    const [save] = callsTo('POST', '/api/routines');
    expect(save.body).toEqual({
      name: 'After every point',
      category: 'repeated_moment',
      moment: 'After every point',
      purpose: 'Focus on the next action',
      existingHabits: ['Tap the line three times'],
      steps: [
        { kind: 'custom', instruction: 'Tap the line three times', cue: null, origin: 'existing' },
        { kind: 'prepare', instruction: 'Choose your plan for the next action', cue: null, origin: 'suggested' },
        { kind: 'custom', instruction: 'Look at my strings', cue: null, origin: 'custom' },
      ],
      templateKey: 'repeated_moment.seconds.focus',
      templateVersion: 1,
      role: 'Singles',
    });
    expect(screen.getByRole('link', { name: t.viewRoutine }).getAttribute('href')).toBe('/ritual/r42');
  });

  test('timing is asked only for pressure moments / something else; "Not sure yet" saves no purpose text', async () => {
    mockApi({ 'POST /api/routines/suggest': suggestHandler, 'POST /api/routines': (b) => json({ routine: { id: 'r1', ...b } }, 201) });
    const user = userEvent.setup();
    renderAt('/ritual/new');
    await answer(user, {
      situation: t.situations.pressure_moment, moment: 'Last over', purpose: t.purposes.not_sure, timing: t.timing.short,
    });
    expect(callsTo('POST', '/api/routines/suggest')[0].body).toEqual({ category: 'pressure_moment', purposeKey: 'not_sure', timeWindow: 'short' });
    await user.click(screen.getByRole('button', { name: t.save }));
    await screen.findByRole('heading', { name: t.savedTitle });
    const body = callsTo('POST', '/api/routines')[0].body;
    expect(body.purpose).toBeNull();
    expect(body.existingHabits).toEqual([]);
    expect(body).not.toHaveProperty('purposeKey');
    expect(body).not.toHaveProperty('timeWindow');
  });

  test('before training uses the longer default without asking about timing', async () => {
    mockApi({ 'POST /api/routines/suggest': suggestHandler });
    const user = userEvent.setup();
    renderAt('/ritual/new');
    await answer(user, { situation: t.situations.session_preparation, moment: 'Warm-up', purpose: t.purposes.prepare });
    expect(callsTo('POST', '/api/routines/suggest')[0].body.timeWindow).toBe('longer');
  });

  test('moment is required: whitespace alone cannot continue', async () => {
    mockApi({});
    const user = userEvent.setup();
    renderAt('/ritual/new');
    await user.click(await screen.findByRole('radio', { name: t.situations.repeated_moment }));
    await user.click(screen.getByRole('button', { name: t.continue }));
    const cont = screen.getByRole('button', { name: t.continue });
    expect(cont.disabled).toBe(true);
    await user.type(screen.getByRole('textbox', { name: t.momentTitle }), '   ');
    expect(cont.disabled).toBe(true);
    await user.type(screen.getByRole('textbox', { name: t.momentTitle }), 'x');
    expect(cont.disabled).toBe(false);
  });

  test('habits: wording preserved exactly, edit, remove, and the maximum of 5', async () => {
    mockApi({ 'POST /api/routines/suggest': suggestHandler });
    const user = userEvent.setup();
    renderAt('/ritual/new');
    await user.click(await screen.findByRole('radio', { name: t.situations.repeated_moment }));
    await user.click(screen.getByRole('button', { name: t.continue }));
    await user.type(screen.getByRole('textbox', { name: t.momentTitle }), 'Serve');
    await user.click(screen.getByRole('button', { name: t.continue }));
    await user.click(screen.getByRole('radio', { name: t.purposes.reset }));
    await user.click(screen.getByRole('button', { name: t.continue }));

    for (const h of ['one', 'TWO  spaced', 'three', 'four', 'five']) {
      await user.type(screen.getByRole('textbox', { name: t.habitPlaceholder }), h);
      await user.click(screen.getByRole('button', { name: t.addHabit }));
    }
    expect(screen.queryByRole('textbox', { name: t.habitPlaceholder })).toBeNull(); // max reached

    await user.click(screen.getAllByRole('button', { name: t.removeHabit })[0]);
    await user.click(screen.getAllByRole('button', { name: t.editHabit })[2]);
    const edit = screen.getByRole('textbox', { name: t.editHabit });
    await user.clear(edit);
    await user.type(edit, 'Four, edited');
    await user.click(screen.getByRole('button', { name: t.saveHabit }));
    await user.click(screen.getByRole('button', { name: t.continue }));
    await screen.findByRole('heading', { name: t.reviewTitle });
    expect(callsTo('POST', '/api/routines/suggest')[0].body.existingHabits).toEqual(['TWO  spaced', 'three', 'Four, edited', 'five']);
  });

  test('default name comes from the moment, stays within 60 characters and can be edited', async () => {
    mockApi({ 'POST /api/routines/suggest': suggestHandler, 'POST /api/routines': (b) => json({ routine: { id: 'r1', ...b } }, 201) });
    const user = userEvent.setup();
    renderAt('/ritual/new');
    const long = 'Standing at the top of my run up before the final over when everyone is watching';
    await answer(user, { situation: t.situations.pressure_moment, moment: long, purpose: t.purposes.settle, timing: t.timing.seconds });
    const nameInput = screen.getByLabelText(t.nameLabel);
    expect(nameInput.value.length).toBeLessThanOrEqual(60);
    expect(long.startsWith(nameInput.value)).toBe(true);
    await user.clear(nameInput);
    await user.type(nameInput, 'Final over');
    await user.click(screen.getByRole('button', { name: t.save }));
    await screen.findByRole('heading', { name: t.savedTitle });
    expect(callsTo('POST', '/api/routines')[0].body.name).toBe('Final over');
  });

  test('a flagged save (200 and 422) shows safety guidance and keeps the whole draft', async () => {
    const responses = [
      json({ safetyFlag: 'needs_support', guidance: GUIDANCE }, 200),
      json({ error: 'needs_support', safetyFlag: 'needs_support', guidance: GUIDANCE }, 422),
      json({ routine: { id: 'r9' } }, 201),
    ];
    mockApi({ 'POST /api/routines/suggest': suggestHandler, 'POST /api/routines': () => responses.shift() });
    const user = userEvent.setup();
    renderAt('/ritual/new');
    await answer(user, { situation: t.situations.repeated_moment, moment: 'After a mistake', purpose: t.purposes.reset, habits: ['Breathe out'] });
    await user.type(screen.getByRole('textbox', { name: t.stepLabel(1) }), ' slowly');

    for (let i = 0; i < 2; i++) {
      await user.click(screen.getByRole('button', { name: t.save }));
      expect(await screen.findByText(GUIDANCE)).toBeTruthy();
      expect(screen.getByText('1800-599-0019')).toBeTruthy();
      expect(screen.queryByRole('heading', { name: t.savedTitle })).toBeNull();
      expect(screen.queryByText(t.saveError)).toBeNull();
      // Draft intact.
      expect(screen.getByLabelText(t.nameLabel).value).toBe('After a mistake');
      expect(screen.getByRole('textbox', { name: t.stepLabel(1) }).value).toBe('Breathe out slowly');
      expect(screen.getByRole('textbox', { name: t.stepLabel(2) }).value).toBe('Choose your plan for the next action');
      await user.click(screen.getByRole('button', { name: translations.en.mindJournal.safety.okBtn }));
    }
    await user.click(screen.getByRole('button', { name: t.save }));
    expect(await screen.findByRole('heading', { name: t.savedTitle })).toBeTruthy();
  });

  test('routine limit on save shows the limit message; other failures show the generic error', async () => {
    const responses = [json({ error: 'routine_limit_reached' }, 409), json({ error: 'server_error' }, 500)];
    mockApi({ 'POST /api/routines/suggest': suggestHandler, 'POST /api/routines': () => responses.shift() });
    const user = userEvent.setup();
    renderAt('/ritual/new');
    await answer(user, { situation: t.situations.repeated_moment, moment: 'Serve', purpose: t.purposes.focus });
    await user.click(screen.getByRole('button', { name: t.save }));
    expect(await screen.findByText(t.limitReached(5))).toBeTruthy();
    await user.click(screen.getByRole('button', { name: t.save }));
    expect(await screen.findByText(t.saveError)).toBeTruthy();
  });

  test('changing an answer after editing asks before replacing the edited routine', async () => {
    mockApi({ 'POST /api/routines/suggest': suggestHandler });
    const user = userEvent.setup();
    renderAt('/ritual/new');
    await answer(user, { situation: t.situations.repeated_moment, moment: 'Serve', purpose: t.purposes.focus });
    await user.type(screen.getByRole('textbox', { name: t.stepLabel(1) }), ' now');

    // Back to purpose (review → habits → purpose), change it, return. The
    // header back arrow is the first button on every builder screen.
    await user.click(screen.getAllByRole('button')[0]);
    await screen.findByRole('heading', { name: t.habitsTitle });
    await user.click(screen.getAllByRole('button')[0]);
    await user.click(await screen.findByRole('radio', { name: t.purposes.settle }));
    await user.click(screen.getByRole('button', { name: t.continue }));
    await user.click(screen.getByRole('button', { name: t.nothingYet }));

    expect(await screen.findByText(t.replaceBody)).toBeTruthy();
    await user.click(screen.getByRole('button', { name: t.replaceKeep }));
    expect(screen.getByRole('textbox', { name: t.stepLabel(1) }).value).toBe('Choose your plan for the next action now');
    expect(callsTo('POST', '/api/routines/suggest')).toHaveLength(1);
  });
});

describe('Routines hub and legacy transition', () => {
  const routine = { id: 'r1', name: 'After every point', category: 'repeated_moment', steps: [{}, {}] };

  test('lists routines, links to the builder, and never imports on load', async () => {
    mockApi({ 'GET /api/routines': json({ routines: [routine], limit: 5, legacy: { status: 'available', routineId: null } }) });
    renderAt('/ritual');
    const link = await screen.findByRole('link', { name: /After every point/ });
    expect(link.getAttribute('href')).toBe('/ritual/r1');
    expect(screen.getByRole('link', { name: t.buildNew }).getAttribute('href')).toBe('/ritual/new');
    expect(screen.getByRole('link', { name: t.legacyOpen }).getAttribute('href')).toBe('/ritual/classic');
    expect(callsTo('POST', '/api/routines/import-legacy')).toHaveLength(0);
  });

  test('at the routine limit, Build is disabled with the limit message', async () => {
    const five = Array.from({ length: 5 }, (_, i) => ({ ...routine, id: `r${i}` }));
    mockApi({ 'GET /api/routines': json({ routines: five, limit: 5, legacy: { status: 'none', routineId: null } }) });
    renderAt('/ritual');
    expect((await screen.findByRole('button', { name: t.buildNew })).disabled).toBe(true);
    expect(screen.getByText(t.limitReached(5))).toBeTruthy();
    expect(screen.queryByRole('link', { name: t.buildNew })).toBeNull();
  });

  test('the classic page is only offered when legacy ritual data exists', async () => {
    for (const status of ['none', 'deleted']) {
      mockApi({ 'GET /api/routines': json({ routines: [], limit: 5, legacy: { status, routineId: null } }) });
      renderAt('/ritual');
      await screen.findByRole('link', { name: t.buildNew });
      expect(screen.queryByRole('link', { name: t.legacyOpen })).toBeNull();
      cleanup();
    }
    mockApi({ 'GET /api/routines': json({ routines: [routine], limit: 5, legacy: { status: 'linked', routineId: 'r1' } }) });
    renderAt('/ritual');
    expect(await screen.findByRole('link', { name: t.legacyOpen })).toBeTruthy();
    expect(screen.queryByRole('button', { name: t.legacyImport })).toBeNull();
  });

  test('explicit import: success refreshes the list; limit and safety responses are handled', async () => {
    let state = { routines: [], limit: 5, legacy: { status: 'available', routineId: null } };
    const importResponses = [
      json({ error: 'routine_limit_reached' }, 409),
      json({ status: 'needs_support', routine: null, safetyFlag: 'needs_support', guidance: GUIDANCE }, 200),
      () => {
        state = { routines: [{ ...routine, id: 'legacy1', name: 'My Match Ritual' }], limit: 5, legacy: { status: 'linked', routineId: 'legacy1' } };
        return json({ status: 'imported', routine: state.routines[0] }, 201);
      },
    ];
    mockApi({
      'GET /api/routines': () => json(state),
      'POST /api/routines/import-legacy': () => { const r = importResponses.shift(); return typeof r === 'function' ? r() : r; },
    });
    const user = userEvent.setup();
    renderAt('/ritual');

    await user.click(await screen.findByRole('button', { name: t.legacyImport }));
    expect(await screen.findByText(t.limitReached(5))).toBeTruthy();

    await user.click(screen.getByRole('button', { name: t.legacyImport }));
    expect(await screen.findByText(GUIDANCE)).toBeTruthy();

    await user.click(screen.getByRole('button', { name: t.legacyImport }));
    expect(await screen.findByRole('link', { name: /My Match Ritual/ })).toBeTruthy();
    expect(screen.queryByRole('button', { name: t.legacyImport })).toBeNull();
    expect(callsTo('POST', '/api/routines/import-legacy')).toHaveLength(3);
  });

  test('/ritual/classic without legacy data redirects to the hub', async () => {
    mockApi({
      'GET /api/ritual/me': json({ ritualName: null, steps: [] }),
      'GET /api/routines': json({ routines: [], limit: 5, legacy: { status: 'none', routineId: null } }),
    });
    renderAt('/ritual/classic');
    expect(await screen.findByRole('heading', { name: t.hubTitle })).toBeTruthy();
    expect(screen.getByTestId('pathname').textContent).toBe('/ritual');
  });

  test('/ritual/classic with legacy data still shows the classic ritual, linking back to the hub', async () => {
    mockApi({ 'GET /api/ritual/me': json({ ritualName: 'My Match Ritual', steps: [{ type: 'breathe', label: 'Slow breath' }] }) });
    renderAt('/ritual/classic');
    expect(await screen.findByText('My Match Ritual')).toBeTruthy();
    expect(screen.getByRole('link', { name: translations.en.ritual.backRoutines }).getAttribute('href')).toBe('/ritual');
  });
});

describe('Routine view', () => {
  test('shows the saved routine in order with the existing-habit label', async () => {
    mockApi({
      'GET /api/routines/r1': json({ routine: {
        id: 'r1', name: 'After every point', category: 'repeated_moment', moment: 'After every point',
        purpose: 'Move on from the last action',
        steps: [
          { id: 's1', kind: 'custom', instruction: 'Towel off', origin: 'existing' },
          { id: 's2', kind: 'prepare', instruction: 'Choose your plan for the next action', origin: 'suggested' },
        ],
      } }),
    });
    renderAt('/ritual/r1');
    const list = await screen.findByRole('list');
    const items = within(list).getAllByRole('listitem');
    expect(items.map(li => li.textContent)).toEqual([
      `1Towel off${t.youAlreadyDoThis}`,
      '2Choose your plan for the next action',
    ]);
    expect(screen.getByText('Move on from the last action')).toBeTruthy();
  });

  test('a missing routine shows not found', async () => {
    mockApi({ 'GET /api/routines/nope': json({ error: 'not_found' }, 404) });
    renderAt('/ritual/nope');
    expect(await screen.findByText(t.notFound)).toBeTruthy();
  });
});
