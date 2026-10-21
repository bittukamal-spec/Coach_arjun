// RitualPage (Ritual rebuild PR 3) under a real <MemoryRouter>, against the
// saved-routines API. Only useAuth and apiFetch are mocked.
//
// Covers: the list, the one-time legacy import, create / edit / delete,
// the walkthrough, the 5-routine limit, and save outcomes — a save flagged
// by the server's safety screen (a 200 with safetyFlag) shows the standard
// guidance and never a save confirmation; any other failure shows the
// generic error.

import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom';

const authState = { user: { id: 'u1', onboardingDone: true }, token: 'test-token', language: 'en', updateUser: vi.fn() };
vi.mock('../src/contexts/AuthContext', () => ({ useAuth: () => authState }));
vi.mock('../src/api', () => ({ apiFetch: vi.fn() }));

const { apiFetch } = await import('../src/api');
const { default: RitualPage } = await import('../src/pages/RitualPage.jsx');
const { translations } = await import('../src/i18n/translations');

const t = translations.en.ritual;
const json = (body, status = 200) => ({ ok: status >= 200 && status < 300, status, json: async () => body });
const GUIDANCE = "What you're describing is bigger than sport. Please talk to a trusted adult right now.";

const routine = (over = {}) => ({
  id: 'r1',
  name: 'Before I bat',
  category: 'session_preparation',
  steps: [
    { id: 's1', kind: 'breathe', instruction: 'Two slow breaths', cue: null, origin: 'custom' },
    { id: 's2', kind: 'cue', instruction: 'Say my word', cue: 'Sharp', origin: 'suggested' },
  ],
  isLegacyImport: false,
  ...over,
});

const listBody = (routines = [], legacy = { status: 'none', routineId: null }) => ({ routines, limit: 5, legacy });

// handlers: { 'GET /api/routines': fn | response, ... }
function mockApi(handlers) {
  apiFetch.mockImplementation(async (path, init = {}) => {
    const key = `${init.method || 'GET'} ${path}`;
    const h = handlers[key];
    if (!h) throw new Error(`unexpected ${key}`);
    return typeof h === 'function' ? h(init) : h;
  });
}

const calls = (method, path) => apiFetch.mock.calls.filter(([p, init = {}]) => p === path && (init.method || 'GET') === method);

function renderPage() {
  return render(<MemoryRouter><RitualPage /></MemoryRouter>);
}

async function fillNewRoutine(user) {
  await user.click(await screen.findByRole('button', { name: new RegExp(t.newRoutine) }));
  await user.type(screen.getByLabelText(t.nameLabel), 'Match day');
  await user.click(screen.getByRole('radio', { name: new RegExp(t.categories.pressure_moment) }));
  await user.type(screen.getByLabelText(`${t.stepN(1)}: ${t.stepTextLabel}`), 'Some step text');
}

describe('RitualPage — routines', () => {
  beforeEach(() => {
    authState.language = 'en';
    apiFetch.mockReset();
    sessionStorage.clear();
  });
  afterEach(() => cleanup());

  test('empty state offers a new routine and never calls the legacy ritual API', async () => {
    mockApi({ 'GET /api/routines': json(listBody()) });
    renderPage();
    expect(await screen.findByText(t.emptyTitle)).toBeTruthy();
    expect(screen.getByRole('button', { name: new RegExp(t.newRoutine) })).toBeTruthy();
    expect(apiFetch.mock.calls.some(([p]) => p.startsWith('/api/ritual/'))).toBe(false);
  });

  test('lists saved routines with their category, a step preview and the saved count', async () => {
    mockApi({ 'GET /api/routines': json(listBody([routine()])) });
    renderPage();
    const card = await screen.findByRole('button', { name: /Before I bat/ });
    expect(within(card).getByText(t.categories.session_preparation)).toBeTruthy();
    expect(within(card).getByText('Two slow breaths')).toBeTruthy();
    expect(within(card).getByText('Say my word')).toBeTruthy();
    expect(screen.getByText(t.savedCount(1, 5))).toBeTruthy();
    expect(screen.getByText(t.heroTitle)).toBeTruthy();
  });

  test('an available legacy ritual is imported once and appears in the list', async () => {
    let listCount = 0;
    mockApi({
      'GET /api/routines': () => {
        listCount += 1;
        return listCount === 1
          ? json(listBody([], { status: 'available', routineId: null }))
          : json(listBody([routine({ isLegacyImport: true })], { status: 'linked', routineId: 'r1' }));
      },
      'POST /api/routines/import-legacy': json({ status: 'imported', routine: routine() }, 201),
    });
    renderPage();
    expect(await screen.findByText('Before I bat')).toBeTruthy();
    expect(calls('POST', '/api/routines/import-legacy')).toHaveLength(1);

    // A second visit in the same session does not try again.
    cleanup();
    mockApi({ 'GET /api/routines': json(listBody([], { status: 'available', routineId: null })) });
    apiFetch.mockClear();
    renderPage();
    expect(await screen.findByText(t.emptyTitle)).toBeTruthy();
    expect(calls('POST', '/api/routines/import-legacy')).toHaveLength(0);
  });

  test('a flagged legacy import shows the safety guidance above the list', async () => {
    mockApi({
      'GET /api/routines': json(listBody([], { status: 'available', routineId: null })),
      'POST /api/routines/import-legacy': json({ status: 'needs_support', routine: null, safetyFlag: 'needs_support', guidance: GUIDANCE }),
    });
    renderPage();
    expect(await screen.findByText(GUIDANCE)).toBeTruthy();
    expect(screen.getByText(translations.en.mindJournal.safety.heading)).toBeTruthy();
    expect(screen.getByText(t.emptyTitle)).toBeTruthy();
  });

  test('creating a routine POSTs name, category and steps, then opens it', async () => {
    let sent;
    mockApi({
      'GET /api/routines': json(listBody()),
      'POST /api/routines': (init) => {
        sent = JSON.parse(init.body);
        return json({ routine: routine({ id: 'r9', name: sent.name, category: sent.category, steps: [{ id: 'x', ...sent.steps[0] }] }) }, 201);
      },
    });
    const user = userEvent.setup();
    renderPage();
    await fillNewRoutine(user);
    await user.click(screen.getByRole('button', { name: t.save }));

    expect(sent).toEqual({
      name: 'Match day',
      category: 'pressure_moment',
      steps: [{ kind: 'custom', instruction: 'Some step text', cue: null, origin: 'custom' }],
    });
    expect(await screen.findByRole('heading', { name: 'Match day' })).toBeTruthy();
    expect(screen.getByText(t.saved)).toBeTruthy();
  });

  test('Suggest asks what it should help with, then fills steps after the athlete\'s own', async () => {
    let sentSuggest;
    let sentSave;
    mockApi({
      'GET /api/routines': json(listBody()),
      'POST /api/routines/suggest': (init) => {
        sentSuggest = JSON.parse(init.body);
        return json({ suggestion: {
          templateKey: 'pressure_moment.short.settle', templateVersion: 1,
          steps: [
            { kind: 'custom', instruction: 'Towel off', cue: null, origin: 'existing' },
            { kind: 'breathe', instruction: 'Take one slow breath with a longer exhale', cue: null, origin: 'suggested' },
            { kind: 'prepare', instruction: 'Choose your plan for the next action', cue: null, origin: 'suggested' },
          ],
        } });
      },
      'POST /api/routines': (init) => {
        sentSave = JSON.parse(init.body);
        return json({ routine: routine({ id: 'r9', name: sentSave.name, category: sentSave.category, steps: sentSave.steps.map((x, i) => ({ id: `s${i}`, ...x })) }) }, 201);
      },
    });
    const user = userEvent.setup();
    renderPage();
    await user.click(await screen.findByRole('button', { name: new RegExp(t.newRoutine) }));
    await user.type(screen.getByLabelText(t.nameLabel), 'Big moment');
    await user.click(screen.getByRole('radio', { name: new RegExp(t.categories.pressure_moment) }));
    await user.type(screen.getByLabelText(`${t.stepN(1)}: ${t.stepTextLabel}`), 'Towel off');

    await user.click(screen.getByRole('button', { name: t.suggestBtn }));
    expect(screen.getByText(t.suggestQuestion)).toBeTruthy();
    await user.click(screen.getByRole('button', { name: t.purposes.settle }));

    expect(sentSuggest).toEqual({ category: 'pressure_moment', purposeKey: 'settle', existingHabits: ['Towel off'], language: 'en' });
    expect(screen.getByDisplayValue('Take one slow breath with a longer exhale')).toBeTruthy();
    expect(screen.getByDisplayValue('Choose your plan for the next action')).toBeTruthy();
    expect(screen.getByText(t.suggestedNote)).toBeTruthy();

    await user.click(screen.getByRole('button', { name: t.save }));
    expect(sentSave.templateKey).toBe('pressure_moment.short.settle');
    expect(sentSave.templateVersion).toBe(1);
    expect(sentSave.steps.map(x => x.origin)).toEqual(['custom', 'suggested', 'suggested']);
  });

  test('Suggest needs a category first, and "own situation" skips the purpose question', async () => {
    let sentSuggest;
    mockApi({
      'GET /api/routines': json(listBody()),
      'POST /api/routines/suggest': (init) => {
        sentSuggest = JSON.parse(init.body);
        return json({ suggestion: { templateKey: 'own_situation.short.fallback', templateVersion: 1,
          steps: [{ kind: 'prepare', instruction: 'Choose your plan for the next action', cue: null, origin: 'suggested' }] } });
      },
    });
    const user = userEvent.setup();
    renderPage();
    await user.click(await screen.findByRole('button', { name: new RegExp(t.newRoutine) }));
    await user.click(screen.getByRole('button', { name: t.suggestBtn }));
    expect(screen.getByText(t.errCategoryFirst)).toBeTruthy();

    await user.click(screen.getByRole('radio', { name: new RegExp(t.categories.own_situation) }));
    await user.click(screen.getByRole('button', { name: t.suggestBtn }));
    expect(screen.queryByText(t.suggestQuestion)).toBeNull();
    expect(sentSuggest.purposeKey).toBeUndefined();
    expect(await screen.findByDisplayValue('Choose your plan for the next action')).toBeTruthy();
  });

  test('a failed suggestion shows an error and keeps the athlete\'s steps', async () => {
    mockApi({
      'GET /api/routines': json(listBody()),
      'POST /api/routines/suggest': json({ error: 'server_error' }, 500),
    });
    const user = userEvent.setup();
    renderPage();
    await user.click(await screen.findByRole('button', { name: new RegExp(t.newRoutine) }));
    await user.click(screen.getByRole('radio', { name: new RegExp(t.categories.pressure_moment) }));
    await user.type(screen.getByLabelText(`${t.stepN(1)}: ${t.stepTextLabel}`), 'Towel off');
    await user.click(screen.getByRole('button', { name: t.suggestBtn }));
    await user.click(screen.getByRole('button', { name: t.purposes.focus }));
    expect(await screen.findByText(t.errSuggest)).toBeTruthy();
    expect(screen.getByDisplayValue('Towel off')).toBeTruthy();
  });

  test('the builder asks for a category before saving', async () => {
    mockApi({ 'GET /api/routines': json(listBody()) });
    const user = userEvent.setup();
    renderPage();
    await user.click(await screen.findByRole('button', { name: new RegExp(t.newRoutine) }));
    await user.type(screen.getByLabelText(t.nameLabel), 'Match day');
    await user.type(screen.getByLabelText(`${t.stepN(1)}: ${t.stepTextLabel}`), 'Step');
    await user.click(screen.getByRole('button', { name: t.save }));
    expect(await screen.findByText(t.errCategoryRequired)).toBeTruthy();
    expect(calls('POST', '/api/routines')).toHaveLength(0);
  });

  test('a safety-flagged save shows the returned guidance and helplines, not a save or generic error', async () => {
    mockApi({
      'GET /api/routines': json(listBody()),
      'POST /api/routines': json({ safetyFlag: 'needs_support', guidance: GUIDANCE }),
    });
    const user = userEvent.setup();
    renderPage();
    await fillNewRoutine(user);
    await user.click(screen.getByRole('button', { name: t.save }));

    expect(await screen.findByText(GUIDANCE)).toBeTruthy();
    expect(screen.getByText(translations.en.mindJournal.safety.heading)).toBeTruthy();
    expect(screen.getByText('1800-599-0019')).toBeTruthy();
    expect(screen.queryByText(t.errSave)).toBeNull();
    expect(screen.queryByText(t.saved)).toBeNull();
    // Still in the builder with the athlete's text, so it can be changed.
    expect(screen.getByDisplayValue('Match day')).toBeTruthy();

    await user.click(screen.getByRole('button', { name: translations.en.mindJournal.safety.okBtn }));
    expect(screen.queryByText(GUIDANCE)).toBeNull();
  });

  test('any other failed save shows the generic error', async () => {
    mockApi({
      'GET /api/routines': json(listBody()),
      'POST /api/routines': json({ error: 'server_error' }, 500),
    });
    const user = userEvent.setup();
    renderPage();
    await fillNewRoutine(user);
    await user.click(screen.getByRole('button', { name: t.save }));

    expect(await screen.findByText(t.errSave)).toBeTruthy();
    expect(screen.queryByText(translations.en.mindJournal.safety.heading)).toBeNull();
  });

  test('the builder is plain: one text box per step, no step-type buttons or cue box', async () => {
    mockApi({ 'GET /api/routines': json(listBody()) });
    const user = userEvent.setup();
    renderPage();
    await user.click(await screen.findByRole('button', { name: new RegExp(t.newRoutine) }));
    expect(screen.getByLabelText(`${t.stepN(1)}: ${t.stepTextLabel}`)).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Breathe|Cue word|Picture it/ })).toBeNull();
    expect(screen.getAllByRole('textbox')).toHaveLength(2); // name + step 1
  });

  test('editing PATCHes with step ids, kinds and cues kept, and an edited suggested step becomes custom', async () => {
    let sent;
    mockApi({
      'GET /api/routines': json(listBody([routine()])),
      'PATCH /api/routines/r1': (init) => {
        sent = JSON.parse(init.body);
        return json({ routine: routine({ steps: sent.steps }) });
      },
    });
    const user = userEvent.setup();
    renderPage();
    await user.click(await screen.findByRole('button', { name: /Before I bat/ }));
    await user.click(screen.getByRole('button', { name: t.edit }));
    const second = screen.getByLabelText(`${t.stepN(2)}: ${t.stepTextLabel}`);
    await user.clear(second);
    await user.type(second, 'Say it out loud');
    await user.click(screen.getByRole('button', { name: t.save }));

    expect(sent.steps).toEqual([
      { id: 's1', kind: 'breathe', instruction: 'Two slow breaths', cue: null, origin: 'custom' },
      { id: 's2', kind: 'cue', instruction: 'Say it out loud', cue: 'Sharp', origin: 'custom' },
    ]);
    expect(await screen.findByText('Say it out loud')).toBeTruthy();
  });

  test('the detail screen shows the steps, when to use it and Arjun help — and no start button', async () => {
    mockApi({ 'GET /api/routines': json(listBody([routine()])) });
    const user = userEvent.setup();
    renderPage();
    await user.click(await screen.findByRole('button', { name: /Before I bat/ }));

    expect(screen.getByRole('heading', { name: 'Before I bat' })).toBeTruthy();
    expect(screen.getByText('Two slow breaths')).toBeTruthy();
    expect(screen.getByText('“Sharp”')).toBeTruthy();
    expect(screen.getByText(new RegExp(t.useWhen.session_preparation))).toBeTruthy();
    expect(screen.getByRole('heading', { name: t.arjunTitle })).toBeTruthy();
    expect(screen.getByRole('link', { name: t.askArjun })).toBeTruthy();
    expect(screen.queryByRole('button', { name: /start/i })).toBeNull();
  });

  test('"Talk to Arjun" opens Coach with the routine pre-filled, not sent', async () => {
    mockApi({ 'GET /api/routines': json(listBody([routine()])) });
    function CoachProbe() {
      const { state } = useLocation();
      return <pre data-testid="coach-probe">{state?.prefillMsg}</pre>;
    }
    const user = userEvent.setup();
    render(
      <MemoryRouter initialEntries={['/ritual']}>
        <Routes>
          <Route path="/ritual" element={<RitualPage />} />
          <Route path="/coaching" element={<CoachProbe />} />
        </Routes>
      </MemoryRouter>
    );
    await user.click(await screen.findByRole('button', { name: /Before I bat/ }));
    await user.click(screen.getByRole('link', { name: t.askArjun }));

    expect(screen.getByTestId('coach-probe').textContent).toBe(
      t.arjunPrefill('Before I bat', t.categories.session_preparation, '1. Two slow breaths\n2. Say my word')
    );
    expect(calls('POST', '/api/chat/message')).toHaveLength(0);
  });

  test('deleting asks for confirmation, then removes the routine from the list', async () => {
    mockApi({
      'GET /api/routines': json(listBody([routine()])),
      'DELETE /api/routines/r1': json({ deleted: true, clearedLegacyRitual: false }),
    });
    const user = userEvent.setup();
    renderPage();
    await user.click(await screen.findByRole('button', { name: /Before I bat/ }));
    await user.click(screen.getByRole('button', { name: t.delete }));

    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByText(t.deleteTitle)).toBeTruthy();
    await user.click(within(dialog).getByRole('button', { name: t.deleteConfirm }));

    expect(await screen.findByText(t.emptyTitle)).toBeTruthy();
    expect(calls('DELETE', '/api/routines/r1')).toHaveLength(1);
  });

  test('at the routine limit the new-routine button is replaced by the limit note', async () => {
    const five = [1, 2, 3, 4, 5].map(n => routine({ id: `r${n}`, name: `Routine ${n}` }));
    mockApi({ 'GET /api/routines': json(listBody(five)) });
    renderPage();
    expect(await screen.findByText(t.limitReached(5))).toBeTruthy();
    expect(screen.queryByRole('button', { name: new RegExp(t.newRoutine) })).toBeNull();
  });

  test('a failed load offers a retry', async () => {
    let fail = true;
    mockApi({ 'GET /api/routines': () => (fail ? json({ error: 'server_error' }, 500) : json(listBody())) });
    const user = userEvent.setup();
    renderPage();
    expect(await screen.findByText(t.errLoad)).toBeTruthy();
    fail = false;
    await user.click(screen.getByRole('button', { name: t.retry }));
    expect(await screen.findByText(t.emptyTitle)).toBeTruthy();
  });

  test('renders in Hindi', async () => {
    authState.language = 'hi';
    mockApi({ 'GET /api/routines': json(listBody([routine()])) });
    renderPage();
    expect(await screen.findByRole('heading', { name: translations.hi.ritual.title })).toBeTruthy();
    expect(screen.getByText(translations.hi.ritual.categories.session_preparation)).toBeTruthy();
    expect(screen.getByText(translations.hi.ritual.savedCount(1, 5))).toBeTruthy();
  });
});

test('English and Hindi ritual copy have the same keys', () => {
  const keys = (o) => Object.keys(o).sort();
  const en = translations.en.ritual;
  const hi = translations.hi.ritual;
  expect(keys(hi)).toEqual(keys(en));
  for (const k of ['categories', 'categoryHints', 'useWhen', 'purposes']) {
    expect(keys(hi[k])).toEqual(keys(en[k]));
  }
  expect(hi.stepExamples).toHaveLength(en.stepExamples.length);
});
