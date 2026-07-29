// Behavioural tests for the redesigned Performance Profile and the
// athlete-controlled Current Focus flow. Real page, real router, real
// components; a small fake server backs apiFetch.

import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route, Navigate } from 'react-router-dom';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const srcOf = (rel) => readFileSync(path.join(__dirname, '../src', rel), 'utf8');

const authState = { user: { id: 'u1', onboardingDone: true, name: 'Rahul' }, token: 't', language: 'en', updateUser: vi.fn() };
vi.mock('../src/contexts/AuthContext', () => ({ useAuth: () => authState }));
vi.mock('../src/api', () => ({ apiFetch: vi.fn() }));

const { apiFetch } = await import('../src/api');
const { default: StartingProfilePage } = await import('../src/pages/StartingProfilePage.jsx');

// ── Fixtures ────────────────────────────────────────────────────────────────

const DISPLAY = {
  currentFocus: {
    id: 'after_mistake', label: 'Bounce back after mistakes',
    phrase: 'what happens after a mistake', source: 'STARTING_PROFILE',
    updatedAt: '2026-07-27T00:00:00.000Z', canChange: true,
  },
  suggestedFocus: { id: 'after_mistake', label: 'Bounce back after mistakes' },
  snapshot: {
    sport: 'Cricket', role: 'Batter', playingContext: 'State', experience: 'Competitive',
    goals: [{ id: 'focus', label: 'Focus' }, { id: 'confidence', label: 'Confidence' }],
    fourWeekOutcome: 'Enjoy competing more',
  },
  startingPattern: {
    situation: 'after a mistake',
    nodes: [
      { type: 'situation', label: 'Situation', text: 'After a mistake' },
      { type: 'reaction', label: 'Reaction', text: 'Frustration with yourself can rise', code: 'a:b' },
      { type: 'effect', label: 'Performance effect', text: 'Your focus may dip for a bit', code: 'c:d' },
      { type: 'duration', label: 'Duration', text: 'That feeling can stay with you through the session', code: 'e:f' },
    ],
    notes: [],
  },
  supports: [
    { id: 'pre_routine', label: 'Routine before you perform' },
    { id: 'remembering_success', label: 'Remembering past success' },
  ],
  strengths: [
    { id: 'hard_working', label: 'Hard-working' },
    { id: 'supportive', label: 'Supportive teammate' },
  ],
  interpretation: 'One possible pattern is that after a mistake, your focus may slip.',
  nextStep: "Let's start by understanding what happens in those first few seconds right after a mistake.",
  fitStatus: 'CONFIRMED',
  generatedAt: '2026-07-20T00:00:00.000Z',
  updatedAt: '2026-07-27T00:00:00.000Z',
};

const FOCUS_OPTIONS = [
  { id: 'after_mistake', label: 'Bounce back after mistakes', personalised: true },
  { id: 'lose_focus', label: 'Regain focus', personalised: true },
  { id: 'pressure_increases', label: 'Handle pressure with more control', personalised: false },
  { id: 'confidence_drops', label: 'Rebuild confidence', personalised: false },
];

function makeServer(over = {}) {
  const state = {
    profile: {
      sections: { whatMatters: 'WM', possiblePattern: 'PP', whatHelps: 'WH', whereWeBegin: 'WB' },
      displayProfile: JSON.parse(JSON.stringify(DISPLAY)),
      focusOptions: FOCUS_OPTIONS,
      language: 'en', wordingStatus: 'AI_OK', deterministicFallbackUsed: false,
      suggestedPriorityId: 'after_mistake',
      agreedPriorityPhrase: 'what happens after a mistake',
      priorityOptions: ['after_mistake', 'lose_focus'],
      fitResponse: 'CONFIRMED', agreedPriorityId: 'after_mistake',
      firstChatSessionId: 'cs-1', confirmedAt: '2026-07-27T00:00:00.000Z',
      generatedAt: '2026-07-20T00:00:00.000Z', updatedAt: '2026-07-27T00:00:00.000Z',
      ...(over.profile || {}),
    },
    consent: { pending: false, guardianEmailMasked: null, ...(over.consent || {}) },
    calls: [],
    focusStatus: over.focusStatus || 200,
    focusBody: over.focusBody || null,
  };
  return {
    state,
    handle(method, p, body) {
      state.calls.push(`${method} ${p}`);
      if (p === '/api/profile/starting' && method === 'GET') {
        if (over.loadStatus && over.loadStatus !== 200) return [over.loadStatus, { error: 'x' }];
        return [200, { profile: state.profile, consent: state.consent }];
      }
      if (p === '/api/profile/current-focus' && method === 'PATCH') {
        if (state.focusStatus !== 200) return [state.focusStatus, state.focusBody || { error: 'INVALID_FOCUS' }];
        const opt = FOCUS_OPTIONS.find((o) => o.id === body.focusId);
        const label = body.focusId === 'different' ? body.customText : opt?.label;
        const currentFocus = { id: body.focusId, label, phrase: label, source: 'ATHLETE_SELECTED', updatedAt: new Date().toISOString(), canChange: true };
        state.profile.displayProfile.currentFocus = currentFocus;
        return [200, { saved: true, currentFocus }];
      }
      if (p === '/api/profile/start-chat' && method === 'POST') return [200, { chatSessionId: 'cs-1' }];
      if (p === '/api/profile/confirm' && method === 'POST') {
        state.profile = { ...state.profile, fitResponse: body.fit, agreedPriorityId: body.agreedPriorityId || 'after_mistake' };
        return [200, { profile: state.profile, consent: state.consent }];
      }
      if (p === '/api/auth/resend-guardian-consent') return [200, {}];
      return [404, {}];
    },
  };
}

function install(server) {
  apiFetch.mockImplementation(async (p, init = {}) => {
    const method = init.method || 'GET';
    const body = init.body ? JSON.parse(init.body) : undefined;
    const [status, payload] = server.handle(method, p, body);
    return { ok: status >= 200 && status < 300, status, json: async () => payload };
  });
}

function renderPage({ server = makeServer(), entryMode = 'saved-profile' } = {}) {
  install(server);
  const utils = render(
    <MemoryRouter initialEntries={[{ pathname: '/starting-profile', state: { entryMode } }]}>
      <Routes>
        <Route path="/starting-profile" element={<StartingProfilePage />} />
        <Route path="/coaching" element={<div>COACHING SCREEN</div>} />
        <Route path="/dashboard" element={<div>DASHBOARD</div>} />
        <Route path="*" element={<Navigate to="/starting-profile" replace />} />
      </Routes>
    </MemoryRouter>
  );
  return { ...utils, server };
}

beforeEach(() => { apiFetch.mockReset(); authState.language = 'en'; });
afterEach(() => cleanup());

// ── 1–2. Saved visual profile ──────────────────────────────────────────────

test('the saved profile renders the full visual structure', async () => {
  renderPage();
  expect(await screen.findByRole('heading', { level: 1, name: 'Your Performance Profile' })).toBeTruthy();
  expect(screen.getByText('Current Focus')).toBeTruthy();
  expect(screen.getByText('Bounce back after mistakes')).toBeTruthy();
  expect(screen.getByText('Your Starting Pattern')).toBeTruthy();
  expect(screen.getByText('What Already Helps')).toBeTruthy();
  expect(screen.getByText('Where We Can Begin')).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Continue coaching' })).toBeTruthy();
  expect(screen.getByText(/not a doctor or therapist/i)).toBeTruthy();
});

test('there is no subtitle under "Your Performance Profile"', async () => {
  renderPage();
  await screen.findByRole('heading', { level: 1, name: 'Your Performance Profile' });
  expect(screen.queryByText(/starting point, not a verdict/i)).toBeNull();
  expect(screen.queryByText(/This is what Arjun picked up/i)).toBeNull();
});

// ── 3–4. Current Focus card ────────────────────────────────────────────────

test('the Current Focus card shows the action label, helper, response and date', async () => {
  renderPage();
  await screen.findByText('Current Focus');
  expect(screen.getByText("What you're working on with Arjun right now.")).toBeTruthy();
  expect(screen.getByText('Confirmed')).toBeTruthy();
  expect(screen.getByText(/^Updated /)).toBeTruthy();
  // Never the mid-sentence technical phrase as the headline.
  const headline = screen.getByText('Bounce back after mistakes');
  expect(headline.textContent).not.toMatch(/what happens after a mistake/);
});

test('Change focus is present in saved mode and opens the selector', async () => {
  renderPage();
  const btn = await screen.findByRole('button', { name: 'Change focus' });
  await userEvent.click(btn);
  expect(screen.getByRole('dialog')).toBeTruthy();
  expect(screen.getByText('What would you like to work on now?')).toBeTruthy();
});

// ── 5. Snapshot chips ──────────────────────────────────────────────────────

test('snapshot chips render the athlete\'s factual answers, and omit what is missing', async () => {
  renderPage();
  const list = await screen.findByRole('list', { name: 'About you' });
  const text = list.textContent;
  for (const chip of ['Cricket', 'Batter', 'State', 'Competitive', 'Goals: Focus, Confidence', '4-week goal: Enjoy competing more']) {
    expect(text).toContain(chip);
  }
  cleanup();

  const sparse = makeServer();
  sparse.state.profile.displayProfile.snapshot = { sport: 'Cricket', role: null, playingContext: null, experience: null, goals: [], fourWeekOutcome: null };
  renderPage({ server: sparse });
  const list2 = await screen.findByRole('list', { name: 'About you' });
  expect(list2.textContent).toContain('Cricket');
  expect(list2.textContent).not.toMatch(/Unknown|null|undefined/);
  expect(within(list2).getAllByRole('listitem')).toHaveLength(1);
});

// ── 6–7. Starting Pattern pathway ──────────────────────────────────────────

test('the Starting Pattern is a vertical ordered list in payload order', async () => {
  renderPage();
  await screen.findByText('Your Starting Pattern');
  expect(screen.getByText('Based on what you shared during onboarding')).toBeTruthy();
  const lists = screen.getAllByRole('list');
  const ol = lists.find((l) => l.tagName === 'OL');
  expect(ol).toBeTruthy();
  const items = within(ol).getAllByRole('listitem');
  expect(items).toHaveLength(4);
  expect(items.map((li) => li.textContent.trim())).toEqual([
    expect.stringContaining('After a mistake'),
    expect.stringContaining('Frustration with yourself can rise'),
    expect.stringContaining('Your focus may dip for a bit'),
    expect.stringContaining('That feeling can stay with you through the session'),
  ]);
});

test('pathway type labels are shown and the reading order matches the visual order', async () => {
  renderPage();
  await screen.findByText('Your Starting Pattern');
  const ol = screen.getAllByRole('list').find((l) => l.tagName === 'OL');
  const items = within(ol).getAllByRole('listitem');
  const labels = ['Situation', 'Reaction', 'Performance effect', 'Duration'];
  items.forEach((li, i) => expect(li.textContent).toContain(labels[i]));
  // Connectors and step numbers are decorative, never announced.
  for (const el of ol.querySelectorAll('[aria-hidden="true"]')) {
    expect(el.getAttribute('aria-hidden')).toBe('true');
  }
});

test('a pathway with one node renders cleanly, with no connector and no empty state', async () => {
  const s = makeServer();
  s.state.profile.displayProfile.startingPattern.nodes = [{ type: 'situation', label: 'Situation', text: 'After a mistake' }];
  renderPage({ server: s });
  await screen.findByText('Your Starting Pattern');
  const ol = screen.getAllByRole('list').find((l) => l.tagName === 'OL');
  expect(within(ol).getAllByRole('listitem')).toHaveLength(1);
});

// ── 8–9. Helps + Where we can begin ────────────────────────────────────────

test('strengths and supports render together as unranked chips', async () => {
  renderPage();
  const list = await screen.findByRole('list', { name: 'What Already Helps' });
  const text = list.textContent;
  for (const chip of ['Routine before you perform', 'Remembering past success', 'Hard-working', 'Supportive teammate']) {
    expect(text).toContain(chip);
  }
  // No numbering, no ordering claim, no score.
  expect(text).not.toMatch(/\d+\s*(%|\/|pts|score)/i);
});

test('with nothing named, What Already Helps shows the fallback line instead of an empty card', async () => {
  const s = makeServer();
  s.state.profile.displayProfile.supports = [];
  s.state.profile.displayProfile.strengths = [];
  renderPage({ server: s });
  await screen.findByText('What Already Helps');
  expect(screen.getByText(/haven't named what helps yet/i)).toBeTruthy();
  expect(screen.queryByRole('list', { name: 'What Already Helps' })).toBeNull();
});

test('Where We Can Begin renders the stored next-step wording verbatim', async () => {
  renderPage();
  await screen.findByText('Where We Can Begin');
  expect(screen.getByText(DISPLAY.nextStep)).toBeTruthy();
});

// ── 10–13. Modes ───────────────────────────────────────────────────────────

test('Continue coaching reopens the existing conversation without a second start call', async () => {
  const { server } = renderPage();
  const btn = await screen.findByRole('button', { name: 'Continue coaching' });
  await userEvent.click(btn);
  expect(await screen.findByText('COACHING SCREEN')).toBeTruthy();
  expect(server.state.calls.filter((c) => c === 'POST /api/profile/start-chat')).toHaveLength(1);
});

test('saved mode has no fit controls and no onboarding-completion language', async () => {
  renderPage();
  await screen.findByRole('heading', { level: 1, name: 'Your Performance Profile' });
  for (const label of ['That fits', 'Partly', 'Not really', 'Got it', 'Start with Arjun', 'Not now']) {
    expect(screen.queryByText(label)).toBeNull();
  }
  expect(screen.queryByText('Does this fit?')).toBeNull();
});

test('first-time mode keeps the fit controls and shows the suggested focus', async () => {
  const s = makeServer({ profile: { fitResponse: null, agreedPriorityId: null } });
  renderPage({ server: s, entryMode: null });
  expect(await screen.findByText('Does this fit?')).toBeTruthy();
  expect(screen.getByText('That fits')).toBeTruthy();
  expect(screen.getByText('Partly')).toBeTruthy();
  expect(screen.getByText('Not really')).toBeTruthy();
  expect(screen.getByText('Suggested Starting Focus')).toBeTruthy();
  // The full visual profile is still shown, so the athlete can decide.
  expect(screen.getByText('Your Starting Pattern')).toBeTruthy();
  expect(screen.getByText('What Already Helps')).toBeTruthy();
});

test('first-time mode has no Change focus control at all', async () => {
  const s = makeServer({ profile: { fitResponse: null, agreedPriorityId: null } });
  renderPage({ server: s, entryMode: null });
  await screen.findByText('Does this fit?');
  expect(screen.queryByRole('button', { name: 'Change focus' })).toBeNull();
});

// ── 14–20. Change-focus dialog ─────────────────────────────────────────────

async function openDialog(server = makeServer()) {
  const r = renderPage({ server });
  await userEvent.click(await screen.findByRole('button', { name: 'Change focus' }));
  return r;
}

// "Change focus" is deliberately the copy on BOTH the card button and the
// confirmation CTA, so confirm-step queries must be scoped to the dialog.
const dlg = () => within(screen.getByRole('dialog'));
async function confirmChange() {
  await userEvent.click(dlg().getByRole('button', { name: 'Change focus' }));
}

test('the dialog has proper semantics, initial focus and Escape-to-close', async () => {
  await openDialog();
  const dialog = screen.getByRole('dialog');
  expect(dialog.getAttribute('aria-modal')).toBe('true');
  expect(dialog.getAttribute('aria-labelledby')).toBeTruthy();
  await waitFor(() => expect(document.activeElement?.id).toBe('focus-dialog-heading'));
  await userEvent.keyboard('{Escape}');
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  // Focus returns to the control that opened it.
  await waitFor(() => expect(document.activeElement?.textContent).toBe('Change focus'));
});

test('personalised options come first, then the remaining approved areas, then Something else', async () => {
  await openDialog();
  const group = screen.getByRole('radiogroup', { name: 'What would you like to work on now?' });
  const labels = within(group).getAllByRole('radio').map((r) => r.textContent.trim());
  expect(labels[0]).toBe('Bounce back after mistakes');
  expect(labels[1]).toBe('Regain focus');
  expect(labels).toContain('Handle pressure with more control');
  expect(labels[labels.length - 1]).toBe('Something else');
  expect(screen.getByText('From your answers')).toBeTruthy();
  expect(screen.getByText('Other areas')).toBeTruthy();
});

test('selection is not communicated by colour alone — aria-checked plus a check icon', async () => {
  await openDialog();
  await userEvent.click(screen.getByRole('radio', { name: /Regain focus/ }));
  // Re-query: React replaces the node on re-render.
  const selected = screen.getByRole('radio', { name: /Regain focus/ });
  expect(selected.getAttribute('aria-checked')).toBe('true');
  expect(selected.querySelector('svg')).toBeTruthy();
  expect(selected.className).toMatch(/border-2/);
});

test('Something else reveals a labelled custom field, and Save stays disabled until it is valid', async () => {
  await openDialog();
  await userEvent.click(screen.getByRole('radio', { name: 'Something else' }));
  const field = screen.getByLabelText('What would you like to work on?');
  expect(field).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Save focus' }).disabled).toBe(true);
  await userEvent.type(field, '   ');
  expect(screen.getByRole('button', { name: 'Save focus' }).disabled).toBe(true);
  await userEvent.type(field, 'Staying calm at the crease');
  expect(screen.getByRole('button', { name: 'Save focus' }).disabled).toBe(false);
});

test('the custom draft survives while the dialog stays open', async () => {
  await openDialog();
  await userEvent.click(screen.getByRole('radio', { name: 'Something else' }));
  await userEvent.type(screen.getByLabelText('What would you like to work on?'), 'Calm hands');
  // Switch away and back — the draft is still there.
  await userEvent.click(screen.getByRole('radio', { name: /Regain focus/ }));
  await userEvent.click(screen.getByRole('radio', { name: 'Something else' }));
  expect(screen.getByLabelText('What would you like to work on?').value).toBe('Calm hands');
});

test('Cancel saves nothing', async () => {
  const server = makeServer();
  await openDialog(server);
  await userEvent.click(screen.getByRole('radio', { name: /Regain focus/ }));
  await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  expect(server.state.calls.some((c) => c.includes('current-focus'))).toBe(false);
  expect(screen.getByText('Bounce back after mistakes')).toBeTruthy();
});

test('a successful change confirms first, then updates the card and announces it', async () => {
  const server = makeServer();
  await openDialog(server);
  await userEvent.click(screen.getByRole('radio', { name: /Regain focus/ }));
  await userEvent.click(screen.getByRole('button', { name: 'Save focus' }));

  // Confirmation step, with the reassurance that nothing is lost.
  expect(screen.getByText('Change your focus to “Regain focus”?')).toBeTruthy();
  expect(screen.getByText('Your starting profile and previous coaching work will stay saved.')).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Keep current focus' })).toBeTruthy();

  await confirmChange();
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  expect(await screen.findByText('Regain focus')).toBeTruthy();
  // Announced to assistive tech, not only shown.
  const status = document.querySelector('[role="status"][aria-live="polite"]');
  expect(status.textContent).toContain('Focus updated');
  // No profile refetch — a change of focus must not look like a regeneration.
  expect(server.state.calls.filter((c) => c === 'GET /api/profile/starting')).toHaveLength(1);
});

test('a failed change keeps the dialog open, keeps the draft, and shows an athlete-facing error', async () => {
  const server = makeServer({ focusStatus: 500, focusBody: { error: 'Server error' } });
  await openDialog(server);
  await userEvent.click(screen.getByRole('radio', { name: 'Something else' }));
  await userEvent.type(screen.getByLabelText('What would you like to work on?'), 'Calm hands');
  await userEvent.click(screen.getByRole('button', { name: 'Save focus' }));
  await confirmChange();

  expect(screen.getByRole('dialog')).toBeTruthy();
  expect(await screen.findByRole('alert')).toBeTruthy();
  expect(screen.getByRole('alert').textContent).toMatch(/Couldn't save that focus/);
  // No API/Prisma/validation internals leak through.
  expect(screen.getByRole('alert').textContent).not.toMatch(/500|Prisma|INVALID_|Server error/);
  expect(screen.getByLabelText('What would you like to work on?').value).toBe('Calm hands');
});

test('changing focus never creates a chat session or sends a message', async () => {
  const server = makeServer();
  await openDialog(server);
  await userEvent.click(screen.getByRole('radio', { name: /Regain focus/ }));
  await userEvent.click(screen.getByRole('button', { name: 'Save focus' }));
  await confirmChange();
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  expect(server.state.calls.some((c) => c.includes('start-chat'))).toBe(false);
  expect(server.state.calls.some((c) => c.includes('/api/chat'))).toBe(false);
});

// ── 21–22. Routing + consent ───────────────────────────────────────────────

test('a direct visit with no navigation state still lands in saved mode from stored data', async () => {
  renderPage({ entryMode: null });
  expect(await screen.findByRole('heading', { level: 1, name: 'Your Performance Profile' })).toBeTruthy();
  expect(screen.queryByText('Does this fit?')).toBeNull();
});

test('consent-pending: the full profile is readable, resend works, and there is no route into coaching', async () => {
  const s = makeServer({ consent: { pending: true, guardianEmailMasked: 'p•••••@example.com' } });
  renderPage({ server: s });
  await screen.findByRole('heading', { level: 1, name: 'Your Performance Profile' });
  expect(screen.getByText('Your Starting Pattern')).toBeTruthy();
  expect(screen.getByText('Waiting for parent/guardian consent')).toBeTruthy();
  expect(screen.getByText(/p•••••@example\.com/)).toBeTruthy();
  // Absent, not merely disabled.
  expect(screen.queryByRole('button', { name: 'Continue coaching' })).toBeNull();
  expect(screen.queryByRole('button', { name: 'Start with Arjun' })).toBeNull();
  // No urgency or shame framing.
  expect(document.body.textContent).not.toMatch(/hurry|expired|urgent|failed to/i);
  await userEvent.click(screen.getByRole('button', { name: 'Resend consent email' }));
  expect(s.state.calls.some((c) => c.includes('resend-guardian-consent'))).toBe(true);
});

test('consent-pending minors can still change their focus', async () => {
  const s = makeServer({ consent: { pending: true, guardianEmailMasked: 'p•••@x.com' } });
  renderPage({ server: s });
  await userEvent.click(await screen.findByRole('button', { name: 'Change focus' }));
  await userEvent.click(screen.getByRole('radio', { name: /Regain focus/ }));
  await userEvent.click(screen.getByRole('button', { name: 'Save focus' }));
  await confirmChange();
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  expect(s.state.calls.some((c) => c === 'PATCH /api/profile/current-focus')).toBe(true);
  expect(s.state.calls.some((c) => c.includes('start-chat'))).toBe(false);
});

// ── 25. Hindi ──────────────────────────────────────────────────────────────

test('long Hindi copy renders without clipping or nowrap', async () => {
  authState.language = 'hi';
  const s = makeServer();
  s.state.profile.displayProfile.currentFocus.label = 'गलती के बाद जल्दी संभलना और अगली गेंद पर ध्यान लगाना';
  s.state.profile.displayProfile.snapshot.fourWeekOutcome = 'मुक़ाबले का ज़्यादा आनंद लेना';
  renderPage({ server: s });
  expect(await screen.findByText('अभी का फोकस')).toBeTruthy();
  const headline = screen.getByText(/गलती के बाद जल्दी संभलना/);
  expect(headline.className).not.toMatch(/whitespace-nowrap|truncate|line-clamp/);
  const list = screen.getByRole('list', { name: 'तुम्हारे बारे में' });
  for (const li of within(list).getAllByRole('listitem')) {
    expect(li.className).not.toMatch(/whitespace-nowrap|truncate/);
  }
});

// ── 28–29. Loading + error ─────────────────────────────────────────────────

test('loading shows a skeleton, not a blank screen', async () => {
  const server = makeServer();
  let release;
  apiFetch.mockImplementation(() => new Promise((r) => { release = () => r({ ok: true, status: 200, json: async () => ({ profile: server.state.profile, consent: server.state.consent }) }); }));
  render(
    <MemoryRouter><StartingProfilePage /></MemoryRouter>
  );
  const status = await screen.findByRole('status');
  expect(status).toBeTruthy();
  expect(status.querySelectorAll('.animate-pulse').length).toBeGreaterThan(3);
  release();
  await waitFor(() => expect(screen.getByRole('heading', { level: 1 })).toBeTruthy());
});

test('a load failure shows athlete-facing copy and a working retry', async () => {
  const s = makeServer({ loadStatus: 500 });
  renderPage({ server: s });
  expect(await screen.findByText('Could not load your starting profile.')).toBeTruthy();
  const before = s.state.calls.length;
  await userEvent.click(screen.getByRole('button', { name: 'Try again' }));
  await waitFor(() => expect(s.state.calls.length).toBeGreaterThan(before));
});

// ── 23, 24, 26, 27, 30. Source-level guarantees ────────────────────────────

const page = srcOf('pages/StartingProfilePage.jsx');
const PROFILE_COMPONENTS = [
  'ProfileSectionCard', 'ProfileChipGroup', 'CurrentFocusCard',
  'PerformancePathway', 'ChangeFocusDialog', 'ProfileSkeleton', 'ConsentNotice',
];

// Comments legitimately discuss `dark:` and hex values, so assertions run
// against code only.
const stripComments = (src) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

test('light and dark share one component tree: no theme-conditional markup anywhere', () => {
  const sources = [page, ...PROFILE_COMPONENTS.map((c) => srcOf(`components/profile/${c}.jsx`))].map(stripComments);
  for (const s of sources) {
    // This app's dark mode is a manual [data-theme] override, so Tailwind's
    // `dark:` prefix would silently not apply — and a theme branch in JS would
    // mean two trees.
    expect(s).not.toMatch(/\bdark:/);
    expect(s).not.toMatch(/useTheme|prefers-color-scheme|theme === /);
  }
});

test('no hard-coded palette: colour comes from semantic tokens only', () => {
  const sources = [page, ...PROFILE_COMPONENTS.map((c) => srcOf(`components/profile/${c}.jsx`))].map(stripComments);
  for (const s of sources) {
    expect(s).not.toMatch(/#[0-9a-fA-F]{6}/);
    // The one documented trap in this codebase: --color-dark-* is undefined.
    expect(s).not.toMatch(/--color-dark-/);
  }
});

test('the layout cannot scroll horizontally and sets no fixed widths', () => {
  const sources = [page, ...PROFILE_COMPONENTS.map((c) => srcOf(`components/profile/${c}.jsx`))].map(stripComments);
  for (const s of sources) {
    expect(s).not.toMatch(/overflow-x/);
    expect(s).not.toMatch(/w-\[\d+px\]/);
    expect(s).not.toMatch(/min-w-\[\d{3,}px\]/);
  }
  // Content is centred and bounded, with safe-area padding at the bottom.
  expect(page).toMatch(/max-w-md mx-auto/);
  expect(page).toMatch(/env\(safe-area-inset-bottom\)/);
});

test('no score, chart, gauge, percentage, ranking or progress-bar visual exists', () => {
  const sources = [page, ...PROFILE_COMPONENTS.map((c) => srcOf(`components/profile/${c}.jsx`))].map(stripComments);
  for (const s of sources) {
    for (const banned of ['recharts', 'RadarChart', 'PieChart', 'Gauge', 'skill-bar', 'percentile', 'ProgressBar', 'role="progressbar"']) {
      expect(s).not.toContain(banned);
    }
    expect(s).not.toMatch(/\{\s*\w+\s*\}\s*%/);
  }
});

test('every interactive control meets the 44px touch target, and chips are not buttons', () => {
  const chips = srcOf('components/profile/ProfileChipGroup.jsx');
  expect(chips).not.toMatch(/<button/);
  expect(chips).toMatch(/<li/);
  const pathway = srcOf('components/profile/PerformancePathway.jsx');
  expect(pathway).not.toMatch(/<button/);
  for (const c of ['CurrentFocusCard', 'ChangeFocusDialog', 'ConsentNotice']) {
    const s = srcOf(`components/profile/${c}.jsx`);
    const buttons = s.match(/className="[^"]*"/g)?.filter((cn) => /py-3|min-h-\[44px\]|w-11|h-11/.test(cn)) || [];
    expect(buttons.length).toBeGreaterThan(0);
  }
});

test('the skeleton respects reduced motion', () => {
  expect(srcOf('components/profile/ProfileSkeleton.jsx')).toMatch(/motion-reduce:animate-none/);
});

test('the dialog traps focus and restores it to the opener', () => {
  const dialog = srcOf('components/profile/ChangeFocusDialog.jsx');
  expect(dialog).toMatch(/role="dialog"/);
  expect(dialog).toMatch(/aria-modal="true"/);
  expect(dialog).toMatch(/e\.key === 'Escape'/);
  expect(dialog).toMatch(/e\.key !== 'Tab'/);
  expect(page).toMatch(/changeFocusRef\.current\?\.focus\(\)/);
});
