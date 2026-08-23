// Real router integration tests for the Mind Journal creation flow (PR 2A).
//
// Source-text assertions in mindJournalPage.test.js pin the structure; these
// mount the real screens under a real <MemoryRouter> and prove the things
// only a render can: the exact JSON each screen POSTs, that step 1 hands its
// answers to step 2 and gets them back, that a flagged submission never
// reads as a save, and that the three kinds of recent entry render the way
// the product rules require. Only useAuth and apiFetch are mocked.

import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom';

const authState = { user: { id: 'u1', onboardingDone: true }, token: 'test-token', language: 'en', updateUser: vi.fn() };
vi.mock('../src/contexts/AuthContext', () => ({ useAuth: () => authState }));
vi.mock('../src/api', () => ({ apiFetch: vi.fn() }));

const { apiFetch } = await import('../src/api');
const { default: MindJournalPage } = await import('../src/pages/MindJournalPage.jsx');
const { default: QuickNotePage } = await import('../src/pages/mindJournal/QuickNotePage.jsx');
const { default: GuidedReflectionPage } = await import('../src/pages/mindJournal/GuidedReflectionPage.jsx');
const { default: GuidedReflectionDetailsPage } = await import('../src/pages/mindJournal/GuidedReflectionDetailsPage.jsx');
const { default: ReflectionSavedPage } = await import('../src/pages/mindJournal/ReflectionSavedPage.jsx');
const { default: ReflectionDetailPage } = await import('../src/pages/mindJournal/ReflectionDetailPage.jsx');
const { default: ArjunContextPage } = await import('../src/pages/mindJournal/ArjunContextPage.jsx');

const json = (body, status = 200) => ({ ok: status >= 200 && status < 300, status, json: async () => body });

// The real route table for this feature, so navigation between the screens
// is exercised rather than simulated.
function LocationStateProbe() {
  const location = useLocation();
  return (
    <>
      <div data-testid="pathname">{location.pathname}</div>
      <div data-testid="location-key">{location.key}</div>
      <div data-testid="location-state">{JSON.stringify(location.state ?? null)}</div>
    </>
  );
}

function renderFlow(initialEntries = '/mind-journal') {
  const entries = Array.isArray(initialEntries) ? initialEntries : [initialEntries];
  return render(
    <MemoryRouter initialEntries={entries}>
      <LocationStateProbe />
      <Routes>
        <Route path="/prior" element={<div data-testid="prior-page">prior</div>} />
        <Route path="/mind-journal" element={<MindJournalPage />} />
        <Route path="/mind-journal/quick" element={<QuickNotePage />} />
        <Route path="/mind-journal/new" element={<GuidedReflectionPage />} />
        <Route path="/mind-journal/new/details" element={<GuidedReflectionDetailsPage />} />
        <Route path="/mind-journal/context" element={<ArjunContextPage />} />
        <Route path="/mind-journal/saved/:id" element={<ReflectionSavedPage />} />
        <Route path="/mind-journal/:id" element={<ReflectionDetailPage />} />
      </Routes>
    </MemoryRouter>
  );
}

// Body of the single POST /api/mind-journal call that was made.
function postedEntry() {
  const call = apiFetch.mock.calls.find(([p, init]) => p === '/api/mind-journal' && init?.method === 'POST');
  expect(call, 'a POST to /api/mind-journal must have been made').toBeTruthy();
  return JSON.parse(call[1].body);
}

const clickByName = async (name) => userEvent.click(await screen.findByRole('button', { name }));
const clickRadio = async (name) => userEvent.click(await screen.findByRole('radio', { name }));

beforeEach(() => {
  apiFetch.mockReset();
  apiFetch.mockImplementation(async () => json({ entries: [], contextEnabled: false }));
});
afterEach(cleanup);

// ── Quick note ─────────────────────────────────────────────────────────────

describe('Quick note', () => {
  test('POSTs exactly the QUICK_NOTE shape, with no guided fields', async () => {
    apiFetch.mockImplementation(async (p, init) => {
      if (p === '/api/mind-journal' && init?.method === 'POST') return json({ entry: { id: 'e1', states: ['calm'] } });
      return json({ entries: [], contextEnabled: false });
    });
    renderFlow('/mind-journal/quick');

    await clickByName('Calm');
    await userEvent.type(screen.getByLabelText('What stood out?'), '  held my rhythm  ');
    await clickByName('Save note');

    expect(postedEntry()).toEqual({ entryType: 'QUICK_NOTE', states: ['calm'], note: 'held my rhythm' });
  });

  test('omits an empty note entirely, and returns to the journal on success', async () => {
    apiFetch.mockImplementation(async (p, init) => {
      if (p === '/api/mind-journal' && init?.method === 'POST') return json({ entry: { id: 'e1', states: ['tired'] } });
      return json({ entries: [], contextEnabled: false });
    });
    renderFlow('/mind-journal/quick');

    await clickByName('Tired');
    await clickByName('Save note');

    expect(postedEntry()).toEqual({ entryType: 'QUICK_NOTE', states: ['tired'] });
    expect((await screen.findByTestId('pathname')).textContent).toBe('/mind-journal');
  });

  test('Save stays disabled until a state is picked, and refuses a third state', async () => {
    renderFlow('/mind-journal/quick');
    const save = await screen.findByRole('button', { name: 'Save note' });
    expect(save.disabled).toBe(true);

    await clickByName('Calm');
    expect(save.disabled).toBe(false);

    await clickByName('Focused');
    await clickByName('Tired');
    expect((await screen.findByRole('button', { name: 'Tired' })).getAttribute('aria-pressed')).toBe('false');
    expect((await screen.findByRole('button', { name: 'Calm' })).getAttribute('aria-pressed')).toBe('true');
  });

  test('Something else opens a custom field; custom-only and built-in+custom can save', async () => {
    apiFetch.mockImplementation(async (p, init) => {
      if (p === '/api/mind-journal' && init?.method === 'POST') {
        const body = JSON.parse(init.body);
        return json({ entry: { id: 'e-custom', ...body } });
      }
      return json({ entries: [], contextEnabled: false });
    });
    renderFlow('/mind-journal/quick');

    await clickByName('Something else');
    expect(await screen.findByLabelText('Write your own state')).toBeTruthy();
    await userEvent.type(screen.getByLabelText('Write your own state'), 'Match-day wired');
    await clickByName('Save note');
    expect(postedEntry()).toEqual({
      entryType: 'QUICK_NOTE',
      states: [],
      customState: 'Match-day wired',
    });

    cleanup();
    apiFetch.mockClear();
    apiFetch.mockImplementation(async (p, init) => {
      if (p === '/api/mind-journal' && init?.method === 'POST') {
        return json({ entry: { id: 'e2', states: ['calm'], customState: 'wired' } });
      }
      return json({ entries: [], contextEnabled: false });
    });
    renderFlow('/mind-journal/quick');
    await clickByName('Calm');
    await clickByName('Something else');
    await userEvent.type(screen.getByLabelText('Write your own state'), 'wired');
    await clickByName('Focused');
    expect((await screen.findByRole('button', { name: 'Focused' })).getAttribute('aria-pressed')).toBe('false');
    await clickByName('Save note');
    expect(postedEntry()).toEqual({
      entryType: 'QUICK_NOTE',
      states: ['calm'],
      customState: 'wired',
    });
  });

  test('a failed save retains the custom state text in the field', async () => {
    apiFetch.mockImplementation(async (p, init) => {
      if (p === '/api/mind-journal' && init?.method === 'POST') return json({ error: 'server_error' }, 500);
      return json({ entries: [], contextEnabled: false });
    });
    renderFlow('/mind-journal/quick');
    await clickByName('Something else');
    await userEvent.type(screen.getByLabelText('Write your own state'), 'still here');
    await clickByName('Save note');
    expect(await screen.findByText(/server_error|Something went wrong/)).toBeTruthy();
    expect(screen.getByLabelText('Write your own state').value).toBe('still here');
    expect(screen.getByTestId('pathname').textContent).toBe('/mind-journal/quick');
  });
});

describe('Quick note back navigation', () => {
  // Home no longer links to Quick Note, so the origin-marked journey is now
  // exercised through the reflection-detail link, which still carries it.
  // The contract under test — history back, no duplicate Journal entry — is
  // unchanged, and still covers every screen using useMindJournalBack.
  test('Journal → Reflection details → header back uses history and does not push another Journal entry', async () => {
    apiFetch.mockImplementation(async (p) => {
      if (p === '/api/mind-journal/e1') return json({ entry: { id: 'e1', entryType: 'QUICK_NOTE', states: ['calm'], note: 'ok', createdAt: new Date().toISOString() } });
      return json({ entries: [{ id: 'e1', entryType: 'QUICK_NOTE', states: ['calm'], note: 'ok', createdAt: new Date().toISOString() }], contextEnabled: false });
    });
    renderFlow(['/prior', '/mind-journal']);
    await userEvent.click(await screen.findByTestId('mj-reflection-card'));
    expect((await screen.findByTestId('pathname')).textContent).toBe('/mind-journal/e1');
    expect(JSON.parse(screen.getByTestId('location-state').textContent).from).toBe('mindJournal');

    await userEvent.click(screen.getByRole('button', { name: 'Back' }));
    expect((await screen.findByTestId('pathname')).textContent).toBe('/mind-journal');

    // Another back from Journal continues to the page before Journal — not the detail screen.
    await userEvent.click(screen.getByRole('button', { name: 'Back' }));
    expect((await screen.findByTestId('pathname')).textContent).toBe('/prior');
  });

  test('direct Quick Note access falls back with replace to Journal', async () => {
    renderFlow('/mind-journal/quick');
    await userEvent.click(await screen.findByRole('button', { name: 'Back' }));
    expect((await screen.findByTestId('pathname')).textContent).toBe('/mind-journal');
    // Replace means there is no Quick Note entry left behind to loop into.
    expect(screen.queryByRole('button', { name: 'Save note' })).toBeNull();
  });

  test('guided Step 2 back still restores Step 1 draft (unchanged contract)', async () => {
    renderFlow('/mind-journal/new');
    await clickRadio('A tough moment');
    await clickByName('Something else');
    await userEvent.type(screen.getByLabelText('Write your own state'), 'heavy legs');
    await clickByName('Continue');
    await screen.findByLabelText('What happened?');
    expect(screen.getByTestId('mj-custom-state-pill').textContent).toBe('heavy legs');

    await userEvent.click(screen.getByRole('button', { name: 'Back' }));
    expect((await screen.findByTestId('pathname')).textContent).toBe('/mind-journal/new');
    expect((await screen.findByRole('radio', { name: 'A tough moment' })).getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByLabelText('Write your own state').value).toBe('heavy legs');
  });
});

// ── Guided reflection ──────────────────────────────────────────────────────

describe('Guided reflection', () => {
  test('carries step 1 answers into step 2 and POSTs one GUIDED_REFLECTION, never a note', async () => {
    apiFetch.mockImplementation(async (p, init) => {
      if (p === '/api/mind-journal' && init?.method === 'POST') return json({ entry: { id: 'r9', takeForward: 'breathe first' } });
      return json({ entries: [], contextEnabled: false });
    });
    renderFlow('/mind-journal/new');

    await clickRadio('Competition');
    await clickByName('Nervous');
    await clickByName('Continue');
    expect((await screen.findByTestId('pathname')).textContent).toBe('/mind-journal/new/details');

    await userEvent.type(screen.getByLabelText('What happened?'), 'lost the first set');
    await userEvent.type(screen.getByLabelText('What do you want to try or repeat next time?'), 'breathe first');
    await clickByName('Save reflection');

    const body = postedEntry();
    expect(body).toEqual({
      entryType: 'GUIDED_REFLECTION',
      contextType: 'COMPETITION',
      states: ['nervous'],
      whatHappened: 'lost the first set',
      takeForward: 'breathe first',
    });
    expect(body).not.toHaveProperty('note');
    // Exactly one write for the whole reflection.
    expect(apiFetch.mock.calls.filter(([p, i]) => p === '/api/mind-journal' && i?.method === 'POST')).toHaveLength(1);
  });

  test('lands on the saved confirmation, which shows Take forward and no score', async () => {
    apiFetch.mockImplementation(async (p, init) => {
      if (p === '/api/mind-journal' && init?.method === 'POST') return json({ entry: { id: 'r9', takeForward: 'breathe first' } });
      return json({ entries: [], contextEnabled: false });
    });
    renderFlow('/mind-journal/new');

    await clickRadio('Training');
    await clickByName('Continue');
    await userEvent.type(screen.getByLabelText('What happened?'), 'good session');
    await clickByName('Save reflection');

    expect((await screen.findByTestId('pathname')).textContent).toBe('/mind-journal/saved/r9');
    expect(await screen.findByRole('heading', { level: 2, name: 'Reflection saved' })).toBeTruthy();
    expect(screen.getByText('breathe first')).toBeTruthy();
    // No evaluation of any kind. "scored" appears only in the copy that
    // rules it out, so the check is for the artifacts, not the word.
    expect(document.body.textContent).not.toMatch(/streak|points|rank|badge|level|\d+\s*\/\s*\d+|out of \d+/i);
    expect(screen.getByRole('button', { name: 'Done' })).toBeTruthy();
    expect(screen.getByRole('link', { name: 'View reflections' })).toBeTruthy();
    expect(screen.queryByTestId('bottom-nav')).toBeNull();
  });

  test('Continue is blocked until a context type is chosen; Something else also needs customContext', async () => {
    renderFlow('/mind-journal/new');
    const cont = await screen.findByRole('button', { name: 'Continue' });
    expect(cont.disabled).toBe(true);
    await clickRadio('Recovery day');
    expect(cont.disabled).toBe(false);

    await clickRadio('Something else');
    expect(cont.disabled).toBe(true);
    expect(screen.getByTestId('mj-custom-context-field')).toBeTruthy();
    await userEvent.type(screen.getByLabelText('What was it about?'), 'team meeting');
    expect(cont.disabled).toBe(false);
  });

  test('customContext carries Step1 → Step2 → back, and is POSTed only for SOMETHING_ELSE', async () => {
    apiFetch.mockImplementation(async (p, init) => {
      if (p === '/api/mind-journal' && init?.method === 'POST') {
        return json({
          entry: {
            id: 'r-cc',
            entryType: 'GUIDED_REFLECTION',
            contextType: 'SOMETHING_ELSE',
            customContext: 'selection trial',
            takeForward: 'stay steady',
          },
        });
      }
      return json({ entries: [], contextEnabled: false });
    });
    renderFlow('/mind-journal/new');
    await clickRadio('Something else');
    await userEvent.type(screen.getByLabelText('What was it about?'), '  selection trial  ');
    await clickByName('Continue');

    expect(screen.getByTestId('mj-summary-pills').textContent).toContain('selection trial');
    expect(screen.getByTestId('mj-summary-pills').textContent).not.toMatch(/Something else/);

    await userEvent.click(screen.getByRole('button', { name: 'Back' }));
    expect(screen.getByLabelText('What was it about?').value).toBe('selection trial');
    await clickByName('Continue');
    await userEvent.type(screen.getByLabelText('What do you want to try or repeat next time?'), 'stay steady');
    await clickByName('Save reflection');

    expect(postedEntry()).toEqual({
      entryType: 'GUIDED_REFLECTION',
      contextType: 'SOMETHING_ELSE',
      states: [],
      customContext: 'selection trial',
      takeForward: 'stay steady',
    });
  });

  test('choosing another context clears customContext from the outgoing payload', async () => {
    apiFetch.mockImplementation(async (p, init) => {
      if (p === '/api/mind-journal' && init?.method === 'POST') {
        return json({ entry: { id: 'r-clear', takeForward: 'ok' } });
      }
      return json({ entries: [], contextEnabled: false });
    });
    renderFlow('/mind-journal/new');
    await clickRadio('Something else');
    await userEvent.type(screen.getByLabelText('What was it about?'), 'stale text');
    await clickRadio('Training');
    expect(screen.queryByTestId('mj-custom-context-field')).toBeNull();
    await clickByName('Continue');
    await userEvent.type(screen.getByLabelText('What happened?'), 'session');
    await clickByName('Save reflection');
    expect(postedEntry()).toEqual({
      entryType: 'GUIDED_REFLECTION',
      contextType: 'TRAINING',
      states: [],
      whatHappened: 'session',
    });
    expect(postedEntry()).not.toHaveProperty('customContext');
  });

  test('going back to step 1 restores the answers already given', async () => {
    renderFlow('/mind-journal/new');
    await clickRadio('A tough moment');
    await clickByName('Frustrated');
    await clickByName('Continue');
    await screen.findByLabelText('What happened?');

    await userEvent.click(screen.getByRole('button', { name: 'Back' }));

    expect((await screen.findByTestId('pathname')).textContent).toBe('/mind-journal/new');
    expect((await screen.findByRole('radio', { name: 'A tough moment' })).getAttribute('aria-pressed')).toBe('true');
    expect((await screen.findByRole('button', { name: 'Frustrated' })).getAttribute('aria-pressed')).toBe('true');
  });

  test('custom state is available in Step 1, appears in Step 2 summary, and is POSTed', async () => {
    apiFetch.mockImplementation(async (p, init) => {
      if (p === '/api/mind-journal' && init?.method === 'POST') {
        return json({ entry: { id: 'r-custom', customState: 'heavy legs', takeForward: 'ease in' } });
      }
      return json({ entries: [], contextEnabled: false });
    });
    renderFlow('/mind-journal/new');
    await clickRadio('Training');
    await clickByName('Something else');
    await userEvent.type(screen.getByLabelText('Write your own state'), 'heavy legs');
    await clickByName('Continue');

    expect(screen.getByTestId('mj-custom-state-pill').textContent).toBe('heavy legs');
    await userEvent.type(screen.getByLabelText('What do you want to try or repeat next time?'), 'ease in');
    await clickByName('Save reflection');

    expect(postedEntry()).toEqual({
      entryType: 'GUIDED_REFLECTION',
      contextType: 'TRAINING',
      states: [],
      customState: 'heavy legs',
      takeForward: 'ease in',
    });
  });

  test('Save is blocked when only a context type was chosen — the server rule, enforced up front', async () => {
    renderFlow('/mind-journal/new');
    await clickRadio('Something else');
    await userEvent.type(screen.getByLabelText('What was it about?'), 'team meeting');
    await clickByName('Continue');

    const save = await screen.findByRole('button', { name: 'Save reflection' });
    expect(save.disabled).toBe(true);
    expect(screen.getByText('Add at least one state or one answer before saving.')).toBeTruthy();

    await userEvent.type(screen.getByLabelText('What did you notice?'), 'tight shoulders');
    expect(save.disabled).toBe(false);
  });

  test('a direct hit on step 2 with no step 1 answer returns to step 1', async () => {
    renderFlow('/mind-journal/new/details');
    expect((await screen.findByTestId('pathname')).textContent).toBe('/mind-journal/new');
  });
});

// ── Safety ─────────────────────────────────────────────────────────────────

describe('Safety-flagged submission', () => {
  test('shows guidance and helplines instead of a save confirmation, and does not navigate', async () => {
    apiFetch.mockImplementation(async (p, init) => {
      if (p === '/api/mind-journal' && init?.method === 'POST') {
        return json({ safetyFlag: 'needs_support', guidance: 'Please talk to someone you trust.' });
      }
      return json({ entries: [], contextEnabled: false });
    });
    renderFlow('/mind-journal/quick');

    await clickByName('Frustrated');
    await clickByName('Save note');

    expect(await screen.findByText('Please talk to someone you trust.')).toBeTruthy();
    expect(screen.getByText("You're not alone")).toBeTruthy();
    // Still on the quick-note screen, and nothing claims the note was kept.
    expect(screen.getByTestId('pathname').textContent).toBe('/mind-journal/quick');
    expect(screen.queryByText('Saved ✓')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Save note' })).toBeNull();
  });
});

// ── Home ───────────────────────────────────────────────────────────────────

describe('Mind Journal home', () => {
  const GUIDED = {
    id: 'g1', entryType: 'GUIDED_REFLECTION', contextType: 'COMPETITION', states: ['nervous'],
    customState: 'match tension', note: null, whatHappened: 'lost the first set', whatNoticed: null,
    helpedOrGotInWay: null, takeForward: 'breathe first', createdAt: '2026-08-01T10:00:00.000Z',
  };
  const QUICK = {
    id: 'q1', entryType: 'QUICK_NOTE', contextType: null, states: ['calm'], customState: null,
    note: 'steady today', whatHappened: null, whatNoticed: null, helpedOrGotInWay: null,
    takeForward: null, createdAt: '2026-08-02T10:00:00.000Z',
  };
  const LEGACY = {
    id: 'l1', entryType: null, contextType: null, states: ['tired'], note: 'long week',
    whatHappened: null, whatNoticed: null, helpedOrGotInWay: null, takeForward: null,
    createdAt: '2026-07-30T10:00:00.000Z',
  };
  const LONG_CUSTOM = {
    id: 'c1', entryType: 'QUICK_NOTE', contextType: null, states: [],
    customState: 'abcdefghijabcdefghijabcdefghij', note: null,
    whatHappened: null, whatNoticed: null, helpedOrGotInWay: null, takeForward: null,
    createdAt: '2026-08-03T10:00:00.000Z',
  };

  // The redesigned home leads with the violet hero. One way in: the separate
  // Quick Note card was retired; its route stays mounted for compatibility.
  test('leads with the frozen hero copy and exactly one way in', async () => {
    renderFlow();
    const hero = await screen.findByTestId('mj-hero-new');
    expect(within(hero).getByText('Reflect. Learn. Perform.')).toBeTruthy();
    expect(within(hero).getByText('About 2–3 minutes · Mostly taps')).toBeTruthy();
    expect(within(hero).getByText('Start a reflection')).toBeTruthy();
    expect(hero.getAttribute('href')).toBe('/mind-journal/new');
    expect(hero.getAttribute('aria-label')).toBe('Reflect. Learn. Perform.');
    // The superseded effort line and intro paragraph are gone.
    expect(screen.queryByText('About 3 minutes · 6 questions')).toBeNull();
    expect(screen.queryByText('Notice the moment. Carry something useful forward.')).toBeNull();
    expect(screen.queryByTestId('mj-intro')).toBeNull();
    expect(screen.queryByTestId('mj-quick-note')).toBeNull();
    expect(screen.queryByRole('link', { name: 'Quick note' })).toBeNull();
    expect(screen.getByTestId('mj-recent-section')).toBeTruthy();
    expect(screen.queryByTestId('bottom-nav')).toBeNull();
  });

  test('no score, streak, XP or chart appears anywhere on home', async () => {
    apiFetch.mockImplementation(async () => json({ entries: [QUICK, GUIDED], contextEnabled: false }));
    renderFlow();
    await screen.findByTestId('mj-hero-new');
    expect(document.body.textContent).not.toMatch(/\bscore\b|streak|\bXP\b|chart/i);
  });

  // The consent control is the header icon only — the old status row and its
  // "Change" link are gone, so the setting is never offered twice here.
  test('the coaching-access control is a single icon-only header button', async () => {
    renderFlow();
    const trigger = await screen.findByTestId('mj-ai-access-trigger');
    expect(trigger.tagName).toBe('BUTTON');
    expect(trigger.getAttribute('aria-label')).toBe('Reflection coaching access');
    // Icon only: no visible text inside the control.
    expect(trigger.textContent.trim()).toBe('');
    expect(screen.queryByTestId('mj-context-row')).toBeNull();
    expect(screen.queryByRole('link', { name: 'Change' })).toBeNull();
    expect(screen.queryByRole('link', { name: 'Arjun context and privacy' })).toBeNull();
    // Exactly one control for this setting on the page.
    expect(screen.getAllByLabelText('Reflection coaching access')).toHaveLength(1);
    expect(screen.queryByRole('checkbox')).toBeNull();
  });

  test('the trigger reflects OFF and ON without relying on colour alone', async () => {
    renderFlow();
    expect((await screen.findByTestId('mj-ai-access-trigger')).getAttribute('aria-pressed')).toBe('false');

    cleanup();
    apiFetch.mockImplementation(async () => json({ entries: [], contextEnabled: true }));
    renderFlow();
    expect((await screen.findByTestId('mj-ai-access-trigger')).getAttribute('aria-pressed')).toBe('true');
  });

  test('renders guided, quick and legacy entries by their own rules', async () => {
    apiFetch.mockImplementation(async () => json({ entries: [QUICK, GUIDED, LEGACY, LONG_CUSTOM], contextEnabled: false }));
    renderFlow();

    // Guided: translated context tag, state chips, the athlete's own title.
    const guided = (await screen.findByText('lost the first set')).closest('[data-testid="mj-reflection-card"]');
    expect(within(guided).getByText('Competition')).toBeTruthy();
    expect(within(guided).getByText('Nervous')).toBeTruthy();
    expect(within(guided).getByText('match tension')).toBeTruthy();

    // Quick note and legacy both read as a quick note, with their note text
    // and no guided scaffolding.
    expect(screen.getAllByText('Quick note').length).toBeGreaterThanOrEqual(2);
    expect(screen.getByText('steady today')).toBeTruthy();
    expect(screen.getByText('long week')).toBeTruthy();
    // Athlete custom text is shown verbatim and wraps without needing translation.
    const longPill = screen.getByText('abcdefghijabcdefghijabcdefghij');
    expect(longPill.className).toMatch(/break-words/);
    expect(screen.queryByText('What happened?')).toBeNull();
    expect(screen.queryByText('What did you notice in yourself?')).toBeNull();
  });

  test('every context category uses the one shared tag treatment', async () => {
    const contexts = [
      { ...GUIDED, id: 'c-tr', contextType: 'TRAINING', whatHappened: 'drill work' },
      { ...GUIDED, id: 'c-co', contextType: 'COMPETITION', whatHappened: 'match day' },
      { ...GUIDED, id: 'c-tm', contextType: 'TOUGH_MOMENT', whatHappened: 'hard patch' },
      { ...GUIDED, id: 'c-rd', contextType: 'RECOVERY_DAY', whatHappened: 'rest' },
    ];
    apiFetch.mockImplementation(async () => json({ entries: contexts, contextEnabled: false }));
    renderFlow();
    await screen.findByText('drill work');

    const tags = screen.getAllByTestId('mj-context-tag');
    expect(tags).toHaveLength(4);
    // Identical class list for every category — no colour encodes meaning.
    const classes = new Set(tags.map((t) => t.className));
    expect(classes.size).toBe(1);
    expect([...classes][0]).toContain('journal-tag');
    // The label is what distinguishes them.
    expect(tags.map((t) => t.textContent)).toEqual(['Training', 'Competition', 'A tough moment', 'Recovery day']);
  });

  test('a takeaway previews only when one is stored, never fabricated', async () => {
    const withTakeaway = {
      ...QUICK, id: 'r-t', entryType: 'REFLECTION', contextType: 'TRAINING',
      eventTags: ['repeated_mistake'], note: null, arjunTakeaway: 'Name the next action first.',
    };
    const withoutTakeaway = {
      ...QUICK, id: 'r-n', entryType: 'REFLECTION', contextType: 'TRAINING',
      eventTags: ['repeated_mistake'], note: null, arjunTakeaway: null,
    };
    apiFetch.mockImplementation(async () => json({ entries: [withTakeaway, withoutTakeaway], contextEnabled: false }));
    renderFlow();
    await screen.findByText('Name the next action first.');
    expect(screen.getAllByTestId('mj-card-takeaway')).toHaveLength(1);
  });

  test('recent rows link to Reflection Details with accessible names', async () => {
    apiFetch.mockImplementation(async () => json({ entries: [GUIDED, QUICK], contextEnabled: false }));
    renderFlow();
    await screen.findByText('lost the first set');

    const guidedLink = screen.getByText('lost the first set').closest('a');
    expect(guidedLink).toBeTruthy();
    expect(guidedLink.getAttribute('href')).toBe('/mind-journal/g1');
    expect(guidedLink.getAttribute('aria-label')).toBeTruthy();

    const quickLink = screen.getByText('steady today').closest('a');
    expect(quickLink.getAttribute('href')).toBe('/mind-journal/q1');
  });

  test('SOMETHING_ELSE recent row prefers customContext as the visible context label', async () => {
    const custom = {
      ...GUIDED,
      id: 'g-cc',
      contextType: 'SOMETHING_ELSE',
      customContext: 'selection trial',
      whatHappened: 'day of trials',
    };
    apiFetch.mockImplementation(async () => json({ entries: [custom], contextEnabled: false }));
    renderFlow();
    await screen.findByText('day of trials');
    const card = screen.getByTestId('mj-reflection-card');
    expect(within(card).getByText('selection trial')).toBeTruthy();
    expect(within(card).queryByText('Something else')).toBeNull();
  });

  test('shows the empty state, and a retry on a failed load', async () => {
    apiFetch.mockImplementation(async () => json({ entries: [], contextEnabled: false }));
    renderFlow();
    expect(await screen.findByText('Nothing here yet — start with today.')).toBeTruthy();

    cleanup();
    apiFetch.mockImplementation(async () => json({ error: 'nope' }, 500));
    renderFlow();
    expect(await screen.findByText('Could not load entries')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Retry' })).toBeTruthy();
  });
});

// ── AI-access popover on Mind Journal home ─────────────────────────────────
// The popover replaces the home surface's separate context interaction. It is
// anchored, not a route change, and it writes through the SAME consent
// endpoint the dedicated screen uses.

describe('Mind Journal AI-access popover', () => {
  const openPopover = async () => {
    await userEvent.click(await screen.findByTestId('mj-ai-access-trigger'));
    return screen.findByTestId('mj-ai-access-popover');
  };

  test('closed by default; opening shows the frozen copy without leaving Mind Journal', async () => {
    renderFlow();
    await screen.findByTestId('mj-ai-access-trigger');
    expect(screen.queryByTestId('mj-ai-access-popover')).toBeNull();

    const panel = await openPopover();
    expect(within(panel).getByText('Use reflections to personalise coaching')).toBeTruthy();
    expect(within(panel).getByText('Arjun can use your 10 most recent reflections to give more relevant coaching. You can turn this off anytime.')).toBeTruthy();
    expect(within(panel).getByText('Share recent reflections')).toBeTruthy();
    expect(within(panel).getByText('Only used to personalise your coaching — never to score you.')).toBeTruthy();
    // Still on Mind Journal — an anchored popover, not navigation.
    expect(screen.getByTestId('pathname').textContent).toBe('/mind-journal');
    expect(screen.getByTestId('mj-recent-section')).toBeTruthy();
  });

  test('dialog semantics, and the trigger reports its expanded state', async () => {
    renderFlow();
    const trigger = await screen.findByTestId('mj-ai-access-trigger');
    expect(trigger.getAttribute('aria-expanded')).toBe('false');
    expect(trigger.getAttribute('aria-haspopup')).toBe('dialog');

    const panel = await openPopover();
    expect(trigger.getAttribute('aria-expanded')).toBe('true');
    expect(panel.getAttribute('role')).toBe('dialog');
    expect(panel.getAttribute('aria-labelledby')).toBeTruthy();
    expect(panel.getAttribute('aria-describedby')).toBeTruthy();
    expect(trigger.getAttribute('aria-controls')).toBe(panel.getAttribute('id'));
  });

  test('closes on the close button, on click outside and on Escape — returning focus to the icon', async () => {
    renderFlow();
    const trigger = await screen.findByTestId('mj-ai-access-trigger');

    await openPopover();
    await userEvent.click(screen.getByTestId('mj-ai-access-close'));
    expect(screen.queryByTestId('mj-ai-access-popover')).toBeNull();
    expect(document.activeElement).toBe(trigger);

    await openPopover();
    await userEvent.click(screen.getByTestId('mj-ai-access-scrim'));
    expect(screen.queryByTestId('mj-ai-access-popover')).toBeNull();
    expect(document.activeElement).toBe(trigger);

    await openPopover();
    await userEvent.keyboard('{Escape}');
    expect(screen.queryByTestId('mj-ai-access-popover')).toBeNull();
    expect(document.activeElement).toBe(trigger);
  });

  test('the toggle PATCHes the existing consent endpoint and adopts the confirmed value', async () => {
    apiFetch.mockImplementation(async (p, init) => {
      if (p === '/api/mind-journal/context' && init?.method === 'PATCH') return json({ contextEnabled: true });
      return json({ entries: [], contextEnabled: false });
    });
    renderFlow();
    await openPopover();

    const box = screen.getByTestId('mj-ai-access-toggle');
    expect(box.checked).toBe(false);
    await userEvent.click(box);

    const patch = apiFetch.mock.calls.find(([p, i]) => p === '/api/mind-journal/context' && i?.method === 'PATCH');
    expect(patch).toBeTruthy();
    expect(JSON.parse(patch[1].body)).toEqual({ enabled: true });
    expect(screen.getByTestId('mj-ai-access-toggle').checked).toBe(true);
    // No second endpoint was invented for this control.
    const paths = apiFetch.mock.calls.map(([p]) => p);
    expect(paths.every((p) => p === '/api/mind-journal' || p === '/api/mind-journal/context')).toBe(true);
  });

  test('a refused write leaves the switch where it was and says so', async () => {
    apiFetch.mockImplementation(async (p, init) => {
      if (p === '/api/mind-journal/context' && init?.method === 'PATCH') return json({ error: 'nope' }, 500);
      return json({ entries: [], contextEnabled: false });
    });
    renderFlow();
    await openPopover();

    await userEvent.click(screen.getByTestId('mj-ai-access-toggle'));
    expect(await screen.findByTestId('mj-ai-access-error')).toBeTruthy();
    expect(screen.getByText('Could not save — please try again')).toBeTruthy();
    // Never claimed a state the server did not accept.
    expect(screen.getByTestId('mj-ai-access-toggle').checked).toBe(false);
    expect(screen.getByTestId('mj-ai-access-trigger').getAttribute('aria-pressed')).toBe('false');
  });

  test('the confirmed value survives closing and reopening the popover', async () => {
    apiFetch.mockImplementation(async (p, init) => {
      if (p === '/api/mind-journal/context' && init?.method === 'PATCH') return json({ contextEnabled: true });
      return json({ entries: [], contextEnabled: false });
    });
    renderFlow();
    await openPopover();
    await userEvent.click(screen.getByTestId('mj-ai-access-toggle'));
    await userEvent.click(screen.getByTestId('mj-ai-access-close'));

    expect(screen.getByTestId('mj-ai-access-trigger').getAttribute('aria-pressed')).toBe('true');
    await openPopover();
    expect(screen.getByTestId('mj-ai-access-toggle').checked).toBe(true);
    expect(screen.getByText('On')).toBeTruthy();
  });

  test('one write per interaction — a second tap while saving cannot start another', async () => {
    let patches = 0;
    apiFetch.mockImplementation(async (p, init) => {
      if (p === '/api/mind-journal/context' && init?.method === 'PATCH') {
        patches += 1;
        return json({ contextEnabled: true });
      }
      return json({ entries: [], contextEnabled: false });
    });
    renderFlow();
    await openPopover();
    const box = screen.getByTestId('mj-ai-access-toggle');
    await userEvent.click(box);
    await userEvent.click(box);
    // Two deliberate taps = on, then off: never two writes for one tap.
    expect(patches).toBe(2);
  });
});

// ── Arjun context screen ───────────────────────────────────────────────────
// The dedicated screen is untouched and still routed, so old deep links and
// bookmarks keep working alongside the new popover.

describe('Arjun context screen', () => {
  test('the deep link still resolves to the dedicated screen', async () => {
    renderFlow('/mind-journal/context');
    expect((await screen.findByTestId('pathname')).textContent).toBe('/mind-journal/context');
    expect(await screen.findByRole('checkbox')).toBeTruthy();
  });

  test('PATCHes the setting on, and reverts with an error when the server refuses', async () => {
    apiFetch.mockImplementation(async (p, init) => {
      if (p === '/api/mind-journal/context' && init?.method === 'PATCH') return json({ error: 'nope' }, 500);
      return json({ entries: [], contextEnabled: false });
    });
    renderFlow('/mind-journal/context');

    const box = await screen.findByRole('checkbox');
    expect(box.checked).toBe(false);
    await userEvent.click(box);

    const patch = apiFetch.mock.calls.find(([p, i]) => p === '/api/mind-journal/context' && i?.method === 'PATCH');
    expect(JSON.parse(patch[1].body)).toEqual({ enabled: true });
    expect((await screen.findByRole('checkbox')).checked).toBe(false);
    expect(screen.getByText('Could not save — please try again')).toBeTruthy();
  });

  test('keeps the setting on when the server confirms it', async () => {
    apiFetch.mockImplementation(async (p, init) => {
      if (p === '/api/mind-journal/context' && init?.method === 'PATCH') return json({ contextEnabled: true });
      return json({ entries: [], contextEnabled: false });
    });
    renderFlow('/mind-journal/context');

    await userEvent.click(await screen.findByRole('checkbox'));
    expect((await screen.findByRole('checkbox')).checked).toBe(true);
  });
});

// ── Saved screen ───────────────────────────────────────────────────────────

describe('Reflection saved screen', () => {
  test('a direct hit with no saved entry returns to the journal rather than claiming a save', async () => {
    renderFlow('/mind-journal/saved/whatever');
    expect((await screen.findByTestId('pathname')).textContent).toBe('/mind-journal');
  });
});

// ── Reflection details + delete ────────────────────────────────────────────

describe('Reflection details', () => {
  const DETAIL = {
    id: 'd1',
    entryType: 'GUIDED_REFLECTION',
    contextType: 'SOMETHING_ELSE',
    customContext: 'selection trial',
    states: ['nervous'],
    customState: 'match tension',
    note: null,
    whatHappened: 'lost the opener',
    whatNoticed: 'jaw tight',
    helpedOrGotInWay: 'slow breath helped',
    takeForward: 'breathe first',
    createdAt: '2026-08-01T10:00:00.000Z',
  };

  // A full new-format reflection, with everything Arjun stored for it.
  const REFLECTION = {
    id: 'rf1',
    entryType: 'REFLECTION',
    contextType: 'TRAINING',
    customContext: null,
    states: ['frustrated'],
    customState: null,
    eventTags: ['repeated_mistake'],
    customEvent: null,
    thoughtTags: ['stuck_on_a_mistake'],
    customThought: null,
    responseTags: ['kept_replaying_it'],
    customResponse: null,
    bodyTags: ['tense'],
    customBody: null,
    cueFeedback: null,
    note: null,
    arjunNoticed: 'You stayed with the mistake instead of the next ball.',
    arjunTakeaway: 'Name your next action out loud before you restart.',
    arjunPattern: 'This is the second time training mistakes stuck with you.',
    createdAt: '2026-08-22T14:58:00.000Z',
  };

  test('home recent row opens the detail page for that id', async () => {
    apiFetch.mockImplementation(async (p) => {
      if (p === '/api/mind-journal/d1') return json({ entry: DETAIL });
      return json({ entries: [DETAIL], contextEnabled: false });
    });
    renderFlow('/mind-journal');
    await userEvent.click(await screen.findByText('lost the opener'));
    expect((await screen.findByTestId('pathname')).textContent).toBe('/mind-journal/d1');
    expect(await screen.findByRole('heading', { level: 1, name: 'Reflection' })).toBeTruthy();
    // The context is the summary tag now, not a separate card.
    expect(screen.getByTestId('mj-context-tag').textContent).toContain('selection trial');
    expect(screen.getByText('match tension')).toBeTruthy();
    expect(screen.getByText('lost the opener')).toBeTruthy();
    expect(screen.getByText('breathe first')).toBeTruthy();
  });

  test('detail is insight-first: analysis and takeaway come before any raw answers', async () => {
    apiFetch.mockImplementation(async (p) => {
      if (p === '/api/mind-journal/rf1') return json({ entry: REFLECTION });
      return json({ entries: [], contextEnabled: false });
    });
    renderFlow('/mind-journal/rf1');

    const summary = await screen.findByTestId('mj-detail-summary');
    const analysis = screen.getByTestId('mj-detail-analysis');
    const takeaway = screen.getByTestId('mj-detail-takeaway');
    const pattern = screen.getByTestId('mj-detail-pattern');
    const snapshot = screen.getByTestId('mj-detail-snapshot');
    const answersToggle = screen.getByTestId('mj-answers-toggle');
    const del = screen.getByTestId('mj-delete-trigger');

    const order = [summary, analysis, takeaway, pattern, snapshot, answersToggle, del];
    for (let i = 1; i < order.length; i++) {
      expect(order[i - 1].compareDocumentPosition(order[i]) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    }

    // Stored strings, rendered verbatim.
    expect(within(analysis).getByText('You stayed with the mistake instead of the next ball.')).toBeTruthy();
    expect(within(takeaway).getByText('Name your next action out loud before you restart.')).toBeTruthy();
    expect(within(pattern).getByText('This is the second time training mistakes stuck with you.')).toBeTruthy();
    // Summary: one violet tag, the athlete's own title, the date and chips.
    expect(within(summary).getByTestId('mj-context-tag').textContent).toBe('Training');
    expect(within(summary).getByTestId('mj-detail-title').textContent).toBe('The same mistake again');
    expect(within(summary).getByTestId('mj-detail-date')).toBeTruthy();
    expect(within(summary).getByText('Frustrated')).toBeTruthy();
  });

  test('the snapshot replaces the five question cards with compact labelled rows', async () => {
    apiFetch.mockImplementation(async (p) => {
      if (p === '/api/mind-journal/rf1') return json({ entry: REFLECTION });
      return json({ entries: [], contextEnabled: false });
    });
    renderFlow('/mind-journal/rf1');

    const snapshot = await screen.findByTestId('mj-detail-snapshot');
    expect(within(snapshot).getByText('Reflection snapshot')).toBeTruthy();
    for (const [label, value] of [
      ['What happened', 'The same mistake again'],
      ['How you felt', 'Frustrated'],
      ['What was on your mind', 'I kept thinking about a mistake'],
      ['What you did', 'I kept replaying it in my head'],
      ['Body', 'Tense'],
    ]) {
      expect(within(snapshot).getByText(label)).toBeTruthy();
      expect(within(snapshot).getByText(value)).toBeTruthy();
    }
    // The full questionnaire wording is NOT replayed in the snapshot.
    expect(within(snapshot).queryByText('What was going through your mind when this happened?')).toBeNull();
    // A skipped question is absent, never a placeholder.
    expect(within(snapshot).queryByText('Focus word')).toBeNull();
    expect(snapshot.textContent).not.toMatch(/null|undefined/);
  });

  test('all answers are collapsed by default and expand in place', async () => {
    apiFetch.mockImplementation(async (p) => {
      if (p === '/api/mind-journal/rf1') return json({ entry: REFLECTION });
      return json({ entries: [], contextEnabled: false });
    });
    renderFlow('/mind-journal/rf1');

    const toggle = await screen.findByTestId('mj-answers-toggle');
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    expect(toggle.textContent).toContain('Show all answers');
    expect(screen.queryByTestId('mj-answers-panel')).toBeNull();
    expect(screen.queryByText('What was going through your mind when this happened?')).toBeNull();

    await userEvent.click(toggle);
    expect(toggle.getAttribute('aria-expanded')).toBe('true');
    expect(toggle.textContent).toContain('Hide answers');
    const panel = screen.getByTestId('mj-answers-panel');
    expect(toggle.getAttribute('aria-controls')).toBe(panel.getAttribute('id'));
    // The real questions, with their stored answers.
    expect(within(panel).getByText('What are you reflecting on?')).toBeTruthy();
    expect(within(panel).getByText('What happened in training?')).toBeTruthy();
    expect(within(panel).getByText('What was going through your mind when this happened?')).toBeTruthy();
    // Still the same page, not a new route.
    expect(screen.getByTestId('pathname').textContent).toBe('/mind-journal/rf1');

    await userEvent.click(toggle);
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    expect(screen.queryByTestId('mj-answers-panel')).toBeNull();
  });

  test('a review-failed reflection omits the analysis, takeaway and pattern gracefully', async () => {
    const noReview = { ...REFLECTION, id: 'rf2', arjunNoticed: null, arjunTakeaway: null, arjunPattern: null };
    apiFetch.mockImplementation(async (p) => {
      if (p === '/api/mind-journal/rf2') return json({ entry: noReview });
      return json({ entries: [], contextEnabled: false });
    });
    renderFlow('/mind-journal/rf2');

    await screen.findByTestId('mj-detail-summary');
    expect(screen.queryByTestId('mj-detail-analysis')).toBeNull();
    expect(screen.queryByTestId('mj-detail-takeaway')).toBeNull();
    expect(screen.queryByTestId('mj-detail-pattern')).toBeNull();
    // The athlete's own record still renders, and delete still works.
    expect(screen.getByTestId('mj-detail-snapshot')).toBeTruthy();
    expect(screen.getByTestId('mj-delete-trigger')).toBeTruthy();
  });

  test('a reflection with no stored pattern omits that section entirely', async () => {
    const noPattern = { ...REFLECTION, id: 'rf3', arjunPattern: null };
    apiFetch.mockImplementation(async (p) => {
      if (p === '/api/mind-journal/rf3') return json({ entry: noPattern });
      return json({ entries: [], contextEnabled: false });
    });
    renderFlow('/mind-journal/rf3');
    await screen.findByTestId('mj-detail-takeaway');
    expect(screen.queryByTestId('mj-detail-pattern')).toBeNull();
    expect(screen.queryByText('Pattern noticed')).toBeNull();
  });

  test('Quick Note details render type, states, and note without empty guided sections', async () => {
    const quick = {
      id: 'qn-d',
      entryType: 'QUICK_NOTE',
      contextType: null,
      states: ['calm'],
      customState: 'wired',
      note: 'steady today',
      whatHappened: null,
      whatNoticed: null,
      helpedOrGotInWay: null,
      takeForward: null,
      customContext: null,
      createdAt: '2026-08-02T10:00:00.000Z',
    };
    apiFetch.mockImplementation(async (p) => {
      if (p === '/api/mind-journal/qn-d') return json({ entry: quick });
      return json({ entries: [], contextEnabled: false });
    });
    renderFlow('/mind-journal/qn-d');
    // A legacy row degrades to its own simpler shape: the tag, its states and
    // its note — never forced into the new structured fields, and never
    // showing the same chips twice.
    expect((await screen.findByTestId('mj-context-tag')).textContent).toBe('Quick note');
    const summary = screen.getByTestId('mj-detail-summary');
    expect(within(summary).getByText('Calm')).toBeTruthy();
    expect(within(summary).getByText('wired')).toBeTruthy();
    expect(screen.getAllByText('Calm')).toHaveLength(1);
    expect(screen.getByText('steady today')).toBeTruthy();
    expect(screen.queryByText('What happened?')).toBeNull();
    expect(screen.queryByTestId('mj-detail-analysis')).toBeNull();
    expect(screen.queryByTestId('mj-detail-snapshot')).toBeNull();
    expect(screen.queryByTestId('mj-answers-toggle')).toBeNull();
    expect(screen.getByTestId('mj-delete-trigger')).toBeTruthy();
  });

  test('404 recovery offers a replace link back to the journal', async () => {
    apiFetch.mockImplementation(async () => json({ error: 'not_found' }, 404));
    renderFlow('/mind-journal/missing');
    expect(await screen.findByText('This reflection could not be found.')).toBeTruthy();
    const link = screen.getByTestId('mj-detail-back-journal');
    expect(link.getAttribute('href')).toBe('/mind-journal');
  });

  test('first Delete tap opens confirmation; Cancel does not DELETE', async () => {
    apiFetch.mockImplementation(async (p) => {
      if (p === '/api/mind-journal/d1') return json({ entry: DETAIL });
      return json({ entries: [], contextEnabled: false });
    });
    renderFlow('/mind-journal/d1');
    await screen.findByTestId('mj-delete-trigger');
    await userEvent.click(screen.getByRole('button', { name: 'Delete reflection' }));
    expect(screen.getByRole('dialog')).toBeTruthy();
    expect(screen.getByText('Delete this reflection?')).toBeTruthy();
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(apiFetch.mock.calls.some(([, init]) => init?.method === 'DELETE')).toBe(false);
  });

  test('confirm DELETE calls the endpoint and replace-navigates home; failure stays on detail', async () => {
    let deleted = false;
    apiFetch.mockImplementation(async (p, init) => {
      if (p === '/api/mind-journal/d1' && init?.method === 'DELETE') {
        deleted = true;
        return json({ success: true });
      }
      if (p === '/api/mind-journal/d1') return json({ entry: DETAIL });
      if (p === '/api/mind-journal') {
        return json({ entries: deleted ? [] : [DETAIL], contextEnabled: false });
      }
      return json({ entries: [], contextEnabled: false });
    });
    renderFlow(['/mind-journal', '/mind-journal/d1']);
    await screen.findByTestId('mj-delete-trigger');
    await userEvent.click(screen.getByRole('button', { name: 'Delete reflection' }));
    await userEvent.click(screen.getByTestId('mj-delete-confirm-btn'));
    expect((await screen.findByTestId('pathname')).textContent).toBe('/mind-journal');
    expect(apiFetch.mock.calls.some(([p, init]) => p === '/api/mind-journal/d1' && init?.method === 'DELETE')).toBe(true);

    cleanup();
    apiFetch.mockImplementation(async (p, init) => {
      if (p === '/api/mind-journal/d1' && init?.method === 'DELETE') return json({ error: 'server_error' }, 500);
      if (p === '/api/mind-journal/d1') return json({ entry: DETAIL });
      return json({ entries: [], contextEnabled: false });
    });
    renderFlow('/mind-journal/d1');
    await screen.findByTestId('mj-delete-trigger');
    await userEvent.click(screen.getByRole('button', { name: 'Delete reflection' }));
    await userEvent.click(screen.getByTestId('mj-delete-confirm-btn'));
    expect(await screen.findByTestId('mj-delete-error')).toBeTruthy();
    expect(screen.getByTestId('pathname').textContent).toBe('/mind-journal/d1');
    expect(screen.getByTestId('mj-delete-trigger')).toBeTruthy();
  });
});
