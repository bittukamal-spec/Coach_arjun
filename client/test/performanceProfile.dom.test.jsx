// Behavioural tests for the redesigned Performance Profile and the
// athlete-controlled Current Focus flow. Real page, real router, real
// components; a small fake server backs apiFetch.

import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
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
  // Still sent (Coach reads the rule output), and deliberately still carries
  // the rule engine's phrasings — the profile must not show any of them.
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
  // What the athlete actually tapped — the only thing the page shows.
  pressure: {
    branchId: 'mistakes',
    stages: [
      { stage: 'situation', questionId: 'primary_priority', answerIds: ['after_mistake'], customText: null, status: 'set' },
      { stage: 'firstResponse', questionId: 'mistakes_first_response', answerIds: ['angry_self'], customText: null, status: 'set' },
      { stage: 'impact', questionId: 'mistakes_next', answerIds: ['lose_focus'], customText: null, status: 'set' },
      { stage: 'reset', questionId: 'mistakes_recovery', answerIds: ['few_minutes'], customText: null, status: 'set' },
    ],
  },
  selections: {
    supports: { questionId: 'supports', answerIds: ['pre_routine', 'remembering_success'], customText: null, status: 'set' },
    strengths: { questionId: 'strengths', answerIds: ['hard_working', 'supportive'], customText: null, status: 'set' },
    broadGoals: { questionId: 'broad_goals', answerIds: ['focus', 'confidence'], customText: null, status: 'set' },
    fourWeekOutcome: { questionId: 'four_week_outcome', answerIds: ['enjoy_competing'], customText: null, status: 'set' },
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

// Route probe for the Performance Check-in route: real navigation there is
// covered by performanceCheckin.dom.test.jsx; here we only need to confirm
// this page's own links/buttons navigate to the right path+query.
function CheckinRouteProbe() {
  const loc = useLocation();
  return <div data-testid="checkin-route">{loc.pathname}{loc.search}</div>;
}

function renderPage({ server = makeServer(), entryMode = 'saved-profile' } = {}) {
  install(server);
  const utils = render(
    <MemoryRouter initialEntries={[{ pathname: '/starting-profile', state: { entryMode } }]}>
      <Routes>
        <Route path="/starting-profile" element={<StartingProfilePage />} />
        <Route path="/starting-profile/check-in" element={<CheckinRouteProbe />} />
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

test('the saved profile renders the modernized compact visual structure (approved mockup)', async () => {
  renderPage();
  expect(await screen.findByRole('heading', { level: 1, name: 'Your Performance Profile' })).toBeTruthy();
  expect(screen.getByText('Current Focus')).toBeTruthy();
  expect(screen.getByText('Bounce back after mistakes')).toBeTruthy();
  expect(screen.getByText('My Game')).toBeTruthy();
  expect(screen.getByText('When Pressure Hits')).toBeTruthy();
  expect(screen.getByText('What Helps Me')).toBeTruthy();
  expect(screen.getByText('My Strengths')).toBeTruthy();
  // The abstract name is gone from the athlete's vocabulary entirely.
  expect(document.body.textContent).not.toMatch(/My Performance Pattern/);
  expect(document.body.textContent).not.toMatch(/Performance Check-in/);
  // No full-profile refresh: sections are edited one at a time.
  expect(screen.queryByText('Refresh my profile')).toBeNull();
  expect(screen.queryByText(/Take a Performance Check-in/)).toBeNull();
  expect(screen.queryByText(/5–7 minutes/)).toBeNull();
  // The old verbose report sections stay gone.
  expect(screen.queryByText('Your Starting Pattern')).toBeNull();
  expect(screen.queryByText('Where We Can Begin')).toBeNull();
  expect(screen.queryByText('A possible pattern')).toBeNull();
  expect(screen.queryByRole('button', { name: 'Continue coaching' })).toBeNull();
  expect(screen.queryByText(/not a doctor or therapist/i)).toBeNull();
});

test('the five sections are exactly Current Focus, My Game, When Pressure Hits, What Helps Me, My Strengths', async () => {
  renderPage();
  await screen.findByRole('heading', { level: 1, name: 'Your Performance Profile' });
  const headings = screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent.trim());
  expect(headings).toEqual(['Current Focus', 'My Game', 'When Pressure Hits', 'What Helps Me', 'My Strengths']);
});

test('there is no subtitle under "Your Performance Profile"', async () => {
  renderPage();
  await screen.findByRole('heading', { level: 1, name: 'Your Performance Profile' });
  expect(screen.queryByText(/starting point, not a verdict/i)).toBeNull();
  expect(screen.queryByText(/This is what Arjun picked up/i)).toBeNull();
});

// ── 3–4. Current Focus card ────────────────────────────────────────────────

test('the Current Focus card shows the action label, helper and date', async () => {
  renderPage();
  await screen.findByText('Current Focus');
  expect(screen.getByText("What you're working on with Arjun right now.")).toBeTruthy();
  expect(screen.getByText(/^Updated /)).toBeTruthy();
  // Never the mid-sentence technical phrase as the headline.
  const headline = screen.getByText('Bounce back after mistakes');
  expect(headline.textContent).not.toMatch(/what happens after a mistake/);
});

test('the Current Focus card shows NO profile fit-response metadata', async () => {
  // "Confirmed / Partly corrected / Corrected" is the athlete's answer to the
  // original Starting Profile. It says nothing about this mutable focus, and
  // showing it here implied the current focus had been vetted.
  renderPage();
  await screen.findByText('Current Focus');
  expect(screen.queryByText(/Current response/i)).toBeNull();
  expect(screen.queryByText('Confirmed')).toBeNull();
  expect(screen.queryByText('Partly corrected')).toBeNull();
  expect(screen.queryByText('Corrected')).toBeNull();
});

test('a corrected profile still shows no fit status on the focus card, and keeps its date', async () => {
  const s = makeServer({ profile: { fitResponse: 'NOT_REALLY' } });
  renderPage({ server: s });
  await screen.findByText('Current Focus');
  expect(screen.queryByText('Corrected')).toBeNull();
  expect(screen.queryByText(/Current response/i)).toBeNull();
  expect(screen.getByText(/^Updated /)).toBeTruthy();
});

test('the focus card component carries no fit-status prop at all', () => {
  const card = srcOf('components/profile/CurrentFocusCard.jsx');
  expect(card).not.toMatch(/fitStatusLabel|fitStatusTitle/);
  expect(page).not.toMatch(/FIT_STATUS_KEY/);
  expect(page).not.toMatch(/t\.currentResponse/);
});

test('Change focus is present in saved mode and opens the selector', async () => {
  renderPage();
  const btn = await screen.findByRole('button', { name: 'Change focus' });
  await userEvent.click(btn);
  expect(screen.getByRole('dialog')).toBeTruthy();
  expect(screen.getByText('What would you like to work on now?')).toBeTruthy();
});

// ── 5. Snapshot chips ──────────────────────────────────────────────────────

test('"My Game" is a real visible heading, not an sr-only label, with a Settings edit link', async () => {
  renderPage();
  const heading = await screen.findByRole('heading', { name: 'My Game' });
  expect(heading).toBeTruthy();
  // sr-only would take it out of the visual flow — this one is on the page.
  expect(heading.className).not.toMatch(/sr-only/);
  // Sport/role/level stay Settings-owned: displayed here, not editable here.
  const link = screen.getByRole('link', { name: /Edit sport, role or level in Settings/ });
  expect(link.getAttribute('href')).toBe('/account');
});

test('My Game chips render the athlete\'s factual answers, and omit what is missing', async () => {
  renderPage();
  const list = await screen.findByRole('list', { name: 'My Game' });
  const text = list.textContent;
  for (const chip of ['Cricket', 'Batter', 'State', 'Competitive']) {
    expect(text).toContain(chip);
  }
  // Goals are not sporting facts — they live with Current Focus, where the
  // athlete can act on them.
  expect(text).not.toMatch(/Goals:|4-week goal:/);
  cleanup();

  const sparse = makeServer();
  sparse.state.profile.displayProfile.snapshot = { sport: 'Cricket', role: null, playingContext: null, experience: null, goals: [], fourWeekOutcome: null };
  renderPage({ server: sparse });
  const list2 = await screen.findByRole('list', { name: 'My Game' });
  expect(list2.textContent).toContain('Cricket');
  expect(list2.textContent).not.toMatch(/Unknown|null|undefined/);
  expect(within(list2).getAllByRole('listitem')).toHaveLength(1);
});

// ── 6–7. When Pressure Hits — the athlete's own answers ───────────────────
// The whole point of this section: it repeats what the athlete tapped. The
// rule engine's phrasing is still in the payload (Coach uses it) and must
// never appear here.

test('the pressure sequence shows Situation → First response → Performance impact, plus reset time', async () => {
  renderPage();
  await screen.findByText('When Pressure Hits');
  const ol = await screen.findByRole('list', { name: 'When Pressure Hits' });
  const items = within(ol).getAllByRole('listitem');
  expect(items).toHaveLength(3);
  expect(ol.textContent).toContain('Situation');
  expect(ol.textContent).toContain('First response');
  expect(ol.textContent).toContain('Performance impact');
  // Plain stage names — no Trigger/Reaction/Effect/Duration jargon.
  expect(ol.textContent).not.toMatch(/Trigger|Reaction|Duration/);
  // Reset time sits under the sequence as one short line.
  expect(screen.getByText('Reset time · A few minutes')).toBeTruthy();
  // Connectors are decorative, never announced.
  for (const el of ol.querySelectorAll('[aria-hidden="true"]')) {
    expect(el.getAttribute('aria-hidden')).toBe('true');
  }
  expect(screen.getByRole('button', { name: 'Update' })).toBeTruthy();
});

test('each stage shows the athlete\'s own answer verbatim, never the rule engine\'s phrasing', async () => {
  renderPage();
  const ol = await screen.findByRole('list', { name: 'When Pressure Hits' });
  // Exactly the labels the questions themselves showed.
  expect(ol.textContent).toContain('After I make a mistake');
  expect(ol.textContent).toContain('I get angry with myself');
  expect(ol.textContent).toContain('I lose focus');
  // The paraphrases the payload still carries are nowhere on the page.
  expect(document.body.textContent).not.toContain('Frustration with yourself can rise');
  expect(document.body.textContent).not.toContain('Your focus may dip for a bit');
  expect(document.body.textContent).not.toContain('That feeling can stay with you through the session');
});

test('Update opens the pressure questions only', async () => {
  renderPage();
  await userEvent.click(await screen.findByRole('button', { name: 'Update' }));
  expect(await screen.findByTestId('checkin-route')).toHaveProperty('textContent', '/starting-profile/check-in?section=pressure');
});

test('a missing answer shows "Not set yet" — never an invented one', async () => {
  const s = makeServer();
  s.state.profile.displayProfile.pressure.stages = [
    { stage: 'situation', questionId: 'primary_priority', answerIds: ['after_mistake'], customText: null, status: 'set' },
    { stage: 'firstResponse', questionId: 'mistakes_first_response', answerIds: [], customText: null, status: 'unset' },
    { stage: 'impact', questionId: 'mistakes_next', answerIds: [], customText: null, status: 'unset' },
    { stage: 'reset', questionId: 'mistakes_recovery', answerIds: [], customText: null, status: 'unset' },
  ];
  renderPage({ server: s });
  const ol = await screen.findByRole('list', { name: 'When Pressure Hits' });
  expect(within(ol).getAllByRole('listitem')).toHaveLength(3);
  expect(ol.textContent).toContain('After I make a mistake');
  expect((ol.textContent.match(/Not set yet/g) || []).length).toBe(2);
  expect(screen.getByText('Reset time · Not set yet')).toBeTruthy();
});

test('an ambiguous historical answer shows "Needs update" — no value is silently chosen', async () => {
  const s = makeServer();
  s.state.profile.displayProfile.pressure.stages[1] = {
    stage: 'firstResponse', questionId: 'mistakes_first_response',
    answerIds: ['keep_thinking', 'angry_self'], customText: null, status: 'ambiguous',
  };
  renderPage({ server: s });
  const ol = await screen.findByRole('list', { name: 'When Pressure Hits' });
  expect(ol.textContent).toContain('Needs update');
  // Neither stored answer is presented as the athlete's choice.
  expect(ol.textContent).not.toContain('I keep thinking about it');
  expect(ol.textContent).not.toContain('I get angry with myself');
});

test('a custom answer displays verbatim, never relabelled "Something else"', async () => {
  const s = makeServer();
  s.state.profile.displayProfile.pressure.stages[1] = {
    stage: 'firstResponse', questionId: 'mistakes_first_response',
    answerIds: ['something_else'], customText: 'I go completely silent', status: 'set',
  };
  renderPage({ server: s });
  const ol = await screen.findByRole('list', { name: 'When Pressure Hits' });
  expect(ol.textContent).toContain('I go completely silent');
  expect(ol.textContent).not.toMatch(/something else/i);
});

test('custom athlete text is never translated', async () => {
  authState.language = 'hi';
  const s = makeServer();
  s.state.profile.displayProfile.pressure.stages[1] = {
    stage: 'firstResponse', questionId: 'mistakes_first_response',
    answerIds: ['something_else'], customText: 'I go completely silent', status: 'set',
  };
  renderPage({ server: s });
  const ol = await screen.findByRole('list', { name: 'जब दबाव आता है' });
  expect(ol.textContent).toContain('I go completely silent');
});

test('a stage the athlete\'s branch never asks is omitted, not shown permanently unset', async () => {
  const s = makeServer();
  // The injury branch has no performance-impact question of its own.
  s.state.profile.displayProfile.pressure = {
    branchId: 'injury',
    stages: [
      { stage: 'situation', questionId: 'primary_priority', answerIds: ['injury_return'], customText: null, status: 'set' },
      { stage: 'firstResponse', questionId: 'injury_concern', answerIds: ['re_injury_fear'], customText: null, status: 'set' },
      { stage: 'reset', questionId: 'injury_recovery', answerIds: ['few_minutes'], customText: null, status: 'set' },
    ],
  };
  renderPage({ server: s });
  const ol = await screen.findByRole('list', { name: 'When Pressure Hits' });
  expect(within(ol).getAllByRole('listitem')).toHaveLength(2);
  expect(ol.textContent).not.toContain('Performance impact');
  expect(ol.textContent).not.toContain('Not set yet');
});

test('a long custom answer wraps instead of overflowing', async () => {
  const s = makeServer();
  const long = 'A very long answer that a real athlete might genuinely write across several lines on a narrow 320px phone screen without breaking the layout';
  s.state.profile.displayProfile.pressure.stages[1] = {
    stage: 'firstResponse', questionId: 'mistakes_first_response',
    answerIds: ['something_else'], customText: long, status: 'set',
  };
  renderPage({ server: s });
  const ol = await screen.findByRole('list', { name: 'When Pressure Hits' });
  const value = within(ol).getByText(long);
  expect(value.className).toMatch(/break-words/);
  expect(value.className).not.toMatch(/whitespace-nowrap|truncate|line-clamp/);
});

// ── 8–9. Helps + Where we can begin ────────────────────────────────────────

test('What Helps Me and My Strengths are two separate labelled groups, never one merged list, each with its own Edit action', async () => {
  renderPage();
  const helps = await screen.findByRole('list', { name: 'What Helps Me' });
  const strengths = await screen.findByRole('list', { name: 'My Strengths' });
  expect(helps).not.toBe(strengths);

  for (const chip of ['A routine before performing', 'Remembering previous success']) {
    expect(helps.textContent).toContain(chip);
    expect(strengths.textContent).not.toContain(chip);
  }
  // The rule engine's own phrasing of the same answers never appears.
  expect(document.body.textContent).not.toContain('Routine before you perform');
  for (const chip of ['Hard-working', 'Supportive teammate']) {
    expect(strengths.textContent).toContain(chip);
    expect(helps.textContent).not.toContain(chip);
  }
  for (const text of [helps.textContent, strengths.textContent]) {
    expect(text).not.toMatch(/\d+\s*(%|\/|pts|score)/i);
  }
  const editButtons = screen.getAllByRole('button', { name: 'Edit' });
  expect(editButtons.length).toBeGreaterThanOrEqual(2);
});

test('"My Strengths" is a real heading, in English and in Hindi', async () => {
  renderPage();
  expect(await screen.findByRole('heading', { name: 'My Strengths' })).toBeTruthy();
  cleanup();
  authState.language = 'hi';
  renderPage();
  expect(await screen.findByRole('heading', { name: 'मेरी ताकतें' })).toBeTruthy();
});

test('an empty strengths group still renders its heading and Edit action, without a chip list', async () => {
  const s = makeServer();
  s.state.profile.displayProfile.selections.strengths = { questionId: 'strengths', answerIds: [], customText: null, status: 'unset' };
  renderPage({ server: s });
  expect(await screen.findByRole('heading', { name: 'My Strengths' })).toBeTruthy();
  expect(screen.queryByRole('list', { name: 'My Strengths' })).toBeNull();
  // Section stays present (with its Edit action) even when nothing is named
  // yet — it is always the athlete-editable entry point, not just a display.
  expect(screen.getAllByRole('button', { name: 'Edit' }).length).toBeGreaterThanOrEqual(1);
});

test('with nothing named, What Helps Me shows "Not set yet" instead of an empty list', async () => {
  const s = makeServer();
  s.state.profile.displayProfile.selections.supports = { questionId: 'supports', answerIds: [], customText: null, status: 'unset' };
  renderPage({ server: s });
  await screen.findByText('What Helps Me');
  expect(screen.queryByRole('list', { name: 'What Helps Me' })).toBeNull();
  expect(screen.getAllByText('Not set yet').length).toBeGreaterThanOrEqual(1);
});

test('What Helps Me and My Strengths each open only their own question', async () => {
  renderPage();
  await screen.findByText('What Helps Me');
  const [helpsEdit, strengthsEdit] = screen.getAllByRole('button', { name: 'Edit' });
  await userEvent.click(helpsEdit);
  expect(await screen.findByTestId('checkin-route')).toHaveProperty('textContent', '/starting-profile/check-in?section=helps');
  cleanup();
  renderPage();
  await screen.findByText('My Strengths');
  await userEvent.click(screen.getAllByRole('button', { name: 'Edit' })[1]);
  expect(await screen.findByTestId('checkin-route')).toHaveProperty('textContent', '/starting-profile/check-in?section=strengths');
});

// ── Goals stay reachable ───────────────────────────────────────────────────

test('the goals the athlete set are shown with Current Focus, with their own scoped edit', async () => {
  renderPage();
  await screen.findByText('Current Focus');
  const card = document.querySelector('[aria-labelledby="profile-focus-heading"]');
  expect(within(card).getByText('Working on')).toBeTruthy();
  expect(within(card).getByText('Focus & Concentration · Building Confidence')).toBeTruthy();
  expect(within(card).getByText('4-week goal')).toBeTruthy();
  expect(within(card).getByText('Enjoy competing more')).toBeTruthy();
  await userEvent.click(within(card).getByRole('button', { name: 'Update goals' }));
  expect(await screen.findByTestId('checkin-route')).toHaveProperty('textContent', '/starting-profile/check-in?section=goals');
});

test('an athlete with no goals still gets the block and the way to set them', async () => {
  const s = makeServer();
  s.state.profile.displayProfile.selections.broadGoals = { questionId: 'broad_goals', answerIds: [], customText: null, status: 'unset' };
  s.state.profile.displayProfile.selections.fourWeekOutcome = { questionId: 'four_week_outcome', answerIds: [], customText: null, status: 'unset' };
  renderPage({ server: s });
  await screen.findByText('Current Focus');
  const card = document.querySelector('[aria-labelledby="profile-focus-heading"]');
  expect(within(card).getAllByText('Not set yet')).toHaveLength(2);
  expect(within(card).getByRole('button', { name: 'Update goals' })).toBeTruthy();
});

// ── 10–13. Modes ───────────────────────────────────────────────────────────

test('nothing on the saved profile starts a full-profile refresh', async () => {
  renderPage();
  await screen.findByRole('heading', { level: 1, name: 'Your Performance Profile' });
  // Every edit entry point is section-scoped.
  const scoped = ['?section=pressure', '?section=helps', '?section=strengths', '?section=goals'];
  const pageSrc = srcOf('pages/StartingProfilePage.jsx');
  for (const q of scoped) expect(pageSrc).toContain(q.slice(1).split('=')[1]);
  expect(pageSrc).not.toMatch(/navigate\('\/starting-profile\/check-in'\)/);
});

test('saved mode has no onboarding-completion language', async () => {
  renderPage();
  await screen.findByRole('heading', { level: 1, name: 'Your Performance Profile' });
  for (const label of ['Looks right', 'Change something', 'Got it', 'Start with Arjun', 'Not now']) {
    expect(screen.queryByText(label)).toBeNull();
  }
});

test('first-time mode is a plain read-back of what the athlete told us', async () => {
  const s = makeServer({ profile: { fitResponse: null, agreedPriorityId: null } });
  renderPage({ server: s, entryMode: null });
  expect(await screen.findByRole('heading', { level: 1, name: 'Your starting profile' })).toBeTruthy();
  const headings = screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent.trim());
  expect(headings).toEqual(['Main focus', 'When pressure hits', 'What helps', 'Strengths']);
  expect(screen.getByText('Bounce back after mistakes')).toBeTruthy();
  expect(screen.getByText('After I make a mistake')).toBeTruthy();
  expect(screen.getByText('I get angry with myself')).toBeTruthy();
  expect(screen.getByText('I lose focus')).toBeTruthy();
  expect(screen.getByText('Reset time · A few minutes')).toBeTruthy();
  expect(screen.getByText('A routine before performing · Remembering previous success')).toBeTruthy();
  expect(screen.getByText('Hard-working · Supportive teammate')).toBeTruthy();
  // One clear confirmation, one way to change something.
  expect(screen.getByRole('button', { name: 'Looks right' })).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Change something' })).toBeTruthy();
});

test('the first-time summary shows no interpretive report of the athlete', async () => {
  const s = makeServer({ profile: { fitResponse: null, agreedPriorityId: null } });
  renderPage({ server: s, entryMode: null });
  await screen.findByRole('heading', { level: 1, name: 'Your starting profile' });
  // The AI wording sections and rule-engine prose are all absent.
  for (const gone of ['Does this fit?', 'A possible pattern', 'Where We Can Begin', 'Your Starting Pattern',
    'One possible pattern is that after a mistake, your focus may slip.', 'Frustration with yourself can rise']) {
    expect(document.body.textContent).not.toContain(gone);
  }
});

test('"Change something" opens the pressure edit rather than a correction note', async () => {
  const s = makeServer({ profile: { fitResponse: null, agreedPriorityId: null } });
  renderPage({ server: s, entryMode: null });
  await userEvent.click(await screen.findByRole('button', { name: 'Change something' }));
  expect(await screen.findByTestId('checkin-route')).toHaveProperty('textContent', '/starting-profile/check-in?section=pressure');
});

test('"Looks right" confirms with the same stored contract as before', async () => {
  const s = makeServer({ profile: { fitResponse: null, agreedPriorityId: null } });
  renderPage({ server: s, entryMode: null });
  await userEvent.click(await screen.findByRole('button', { name: 'Looks right' }));
  await waitFor(() => expect(s.state.calls.some((c) => c === 'POST /api/profile/confirm')).toBe(true));
  expect(s.state.profile.fitResponse).toBe('CONFIRMED');
});

test('first-time mode has no Change focus control at all', async () => {
  const s = makeServer({ profile: { fitResponse: null, agreedPriorityId: null } });
  renderPage({ server: s, entryMode: null });
  await screen.findByRole('heading', { level: 1, name: 'Your starting profile' });
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

test('an out-of-scope custom focus keeps the draft and shows the scope message', async () => {
  const server = makeServer({ focusStatus: 400, focusBody: { error: 'OUT_OF_SCOPE_FOCUS' } });
  await openDialog(server);
  await userEvent.click(screen.getByRole('radio', { name: 'Something else' }));
  await userEvent.type(screen.getByLabelText('What would you like to work on?'), 'help me with school mathematics');
  await userEvent.click(screen.getByRole('button', { name: 'Save focus' }));
  await confirmChange();

  // Dialog stays open, draft intact, correction possible.
  expect(screen.getByRole('dialog')).toBeTruthy();
  const alert = await screen.findByRole('alert');
  expect(alert.textContent).toBe('Choose something connected to your sport, training, competition, or mental performance.');
  expect(screen.getByLabelText('What would you like to work on?').value).toBe('help me with school mathematics');
  // The card behind is unchanged. Scoped to the card, because the same label
  // is also one of the dialog's radio options.
  const card = document.querySelector('[aria-labelledby="profile-focus-heading"]');
  expect(within(card).getByText('Bounce back after mistakes')).toBeTruthy();
  // No internals leak.
  expect(alert.textContent).not.toMatch(/OUT_OF_SCOPE|400|Prisma/);
});

test('after a scope rejection the athlete can correct the text and retry successfully', async () => {
  const server = makeServer({ focusStatus: 400, focusBody: { error: 'OUT_OF_SCOPE_FOCUS' } });
  await openDialog(server);
  await userEvent.click(screen.getByRole('radio', { name: 'Something else' }));
  const field = screen.getByLabelText('What would you like to work on?');
  await userEvent.type(field, 'plan my holiday');
  await userEvent.click(screen.getByRole('button', { name: 'Save focus' }));
  await confirmChange();
  await screen.findByRole('alert');

  // The server now accepts; the athlete edits and retries in place. The input
  // is re-queried because React replaced the node when the error rendered.
  server.state.focusStatus = 200;
  const retryField = screen.getByLabelText('What would you like to work on?');
  await userEvent.clear(retryField);
  await userEvent.type(retryField, 'stay calm before matches');
  await userEvent.click(screen.getByRole('button', { name: 'Save focus' }));
  await confirmChange();
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  expect(await screen.findByText('stay calm before matches')).toBeTruthy();
});

test('a scope rejection is rendered from local copy, not from the server message', () => {
  const dialog = srcOf('components/profile/ChangeFocusDialog.jsx');
  expect(dialog).toMatch(/res\?\.error === 'OUT_OF_SCOPE_FOCUS' \? t\.focusOutOfScope : t\.focusSaveError/);
  // No server-provided string is ever shown.
  expect(dialog).not.toMatch(/setError\(res\.(message|error)\)/);
});

test('the Hindi scope message is used when the athlete is in Hindi', async () => {
  authState.language = 'hi';
  const server = makeServer({ focusStatus: 400, focusBody: { error: 'OUT_OF_SCOPE_FOCUS' } });
  renderPage({ server });
  await userEvent.click(await screen.findByRole('button', { name: 'फोकस बदलो' }));
  await userEvent.click(screen.getByRole('radio', { name: 'कुछ और' }));
  await userEvent.type(screen.getByLabelText('तुम किस पर काम करना चाहोगे?'), 'ganit ka homework');
  await userEvent.click(screen.getByRole('button', { name: 'फोकस सेव करो' }));
  await userEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'फोकस बदलो' }));
  const alert = await screen.findByRole('alert');
  expect(alert.textContent).toBe('ऐसी चीज़ चुनें जो आपके खेल, ट्रेनिंग, प्रतियोगिता या मानसिक प्रदर्शन से जुड़ी हो।');
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

test('the saved-profile Current Focus still updates successfully after the metadata removal', async () => {
  const server = makeServer();
  await openDialog(server);
  await userEvent.click(screen.getByRole('radio', { name: /Rebuild confidence/ }));
  await userEvent.click(screen.getByRole('button', { name: 'Save focus' }));
  await confirmChange();
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  expect(await screen.findByText('Rebuild confidence')).toBeTruthy();
  expect(screen.getByText(/^Updated /)).toBeTruthy();
  expect(screen.queryByText(/Current response/i)).toBeNull();
});

// ── 21–22. Routing + consent ───────────────────────────────────────────────

test('a direct visit with no navigation state still lands in saved mode from stored data', async () => {
  renderPage({ entryMode: null });
  expect(await screen.findByRole('heading', { level: 1, name: 'Your Performance Profile' })).toBeTruthy();
  expect(screen.queryByRole('button', { name: 'Looks right' })).toBeNull();
});

test('consent-pending: the full profile is readable, resend works, and there is no route into coaching', async () => {
  const s = makeServer({ consent: { pending: true, guardianEmailMasked: 'p•••••@example.com' } });
  renderPage({ server: s });
  await screen.findByRole('heading', { level: 1, name: 'Your Performance Profile' });
  expect(screen.getByText('When Pressure Hits')).toBeTruthy();
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
  const list = screen.getByRole('list', { name: 'मेरा खेल' });
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
  'PressureSequence', 'ChangeFocusDialog', 'ProfileSkeleton', 'ConsentNotice',
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
  const sequence = srcOf('components/profile/PressureSequence.jsx');
  expect(sequence).not.toMatch(/<button/);
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

// ── Stage H: state-aware app navigation ────────────────────────────────────
// The bottom bar belongs to the SAVED profile — the destination "Profile"
// points at. Every first-time state is a linear flow the athlete should
// finish, so the bar stays out of it. Consent never decides the bar; it
// decides the coaching action.

const navBar = () => screen.queryByRole('navigation');

test('the saved profile mounts the app navigation, exactly once', async () => {
  renderPage();
  await screen.findByRole('heading', { level: 1, name: 'Your Performance Profile' });
  expect(screen.getAllByRole('navigation')).toHaveLength(1);
});

test('the Profile item is the active one while on /starting-profile', async () => {
  renderPage();
  await screen.findByRole('heading', { level: 1, name: 'Your Performance Profile' });
  const current = within(navBar()).getByRole('link', { current: 'page' });
  expect(current.getAttribute('href')).toBe('/starting-profile');
  expect(current.textContent).toContain('Profile');
});

test('the navigation keeps its five destinations, and Settings is not one of them', async () => {
  renderPage();
  await screen.findByRole('heading', { level: 1, name: 'Your Performance Profile' });
  const hrefs = within(navBar()).getAllByRole('link').map((a) => a.getAttribute('href'));
  expect(hrefs).toEqual(['/dashboard', '/train', '/coaching', '/playbook', '/starting-profile']);
  // Account/Settings stays in the avatar menu, never promoted into the bar.
  expect(hrefs).not.toContain('/account');
});

test('consent-pending keeps the navigation but drops the coaching action from the DOM', async () => {
  const s = makeServer({ consent: { pending: true, guardianEmailMasked: 'p•••••@example.com' } });
  renderPage({ server: s });
  await screen.findByText('Waiting for parent/guardian consent');
  // The bar is a property of being on a saved profile, not of consent.
  expect(navBar()).toBeTruthy();
  expect(within(navBar()).getByRole('link', { current: 'page' }).getAttribute('href')).toBe('/starting-profile');
  // No coaching route at all — absent, never a disabled control.
  expect(screen.queryByRole('button', { name: 'Continue coaching' })).toBeNull();
  expect(screen.queryByRole('button', { name: 'Start with Arjun' })).toBeNull();
  expect(document.body.textContent).not.toContain('Continue coaching');
});

test('loading renders no navigation, so the bar cannot flash before the mode is known', async () => {
  apiFetch.mockImplementation(() => new Promise(() => {})); // never resolves
  render(
    <MemoryRouter initialEntries={[{ pathname: '/starting-profile', state: { entryMode: 'saved-profile' } }]}>
      <Routes><Route path="/starting-profile" element={<StartingProfilePage />} /></Routes>
    </MemoryRouter>
  );
  expect(await screen.findByText('Putting this together…')).toBeTruthy();
  expect(navBar()).toBeNull();
});

test('the first-time summary renders no navigation', async () => {
  const s = makeServer({ profile: { fitResponse: null, agreedPriorityId: null } });
  renderPage({ server: s, entryMode: null });
  await screen.findByRole('heading', { level: 1, name: 'Your starting profile' });
  expect(navBar()).toBeNull();
});

test('the Got-it transition renders no navigation, and keeps its actions distinct', async () => {
  const s = makeServer({ profile: { fitResponse: null, agreedPriorityId: null } });
  renderPage({ server: s, entryMode: 'onboarding-completion' });
  await screen.findByRole('heading', { level: 1, name: 'Your starting profile' });

  await userEvent.click(screen.getByRole('button', { name: 'Looks right' }));

  // The Got it transition — a separate screen with its own actions.
  expect(await screen.findByText('Got it')).toBeTruthy();
  expect(navBar()).toBeNull();
  expect(screen.getByRole('button', { name: 'Start with Arjun' })).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Not now' })).toBeTruthy();
  expect(screen.queryByRole('button', { name: 'Looks right' })).toBeNull();
});

// ── Stage H (modernization pass 2): Continue coaching row removed ──────────

test('the saved profile carries no Continue coaching action at all — Coach stays reachable via the bottom nav', async () => {
  const s = makeServer();
  renderPage({ server: s });
  await screen.findByRole('heading', { level: 1, name: 'Your Performance Profile' });
  expect(screen.queryByRole('button', { name: /Continue coaching/ })).toBeNull();
  expect(screen.getByRole('link', { name: /Coach/ })).toBeTruthy();
});

test('merely loading the saved profile never starts a conversation', async () => {
  const s = makeServer();
  renderPage({ server: s });
  await screen.findByRole('heading', { level: 1, name: 'Your Performance Profile' });
  expect(s.state.calls.some((c) => c.includes('start-chat'))).toBe(false);
});

// ── Stage H: the warning surfaces must be readable in BOTH themes ──────────
// The consent notice and safety guidance previously used fixed Tailwind amber
// classes authored for the dark theme; in the light theme they measured
// ~1.2:1. Both now take the theme-branched warn tokens.

test('the consent notice and safety guidance use theme-branched warn tokens, not fixed amber', () => {
  const notice = stripComments(srcOf('components/profile/ConsentNotice.jsx'));
  const pageSrc = stripComments(page);
  for (const s of [notice, pageSrc]) {
    expect(s).not.toMatch(/amber-\d{2,3}/);
  }
  for (const token of ['--status-warn', '--surface-warn', '--border-warn']) {
    expect(notice).toContain(token);
  }
  // The safety block on the page shares the same tokens.
  expect(pageSrc).toContain('--surface-warn');
  expect(pageSrc).toContain('--status-warn');
});

test('every warn token is defined in the light block AND both dark blocks', () => {
  const css = readFileSync(path.join(__dirname, '../src/index.css'), 'utf8');
  // Three definitions each: :root (light), the prefers-color-scheme block and
  // the [data-theme="dark"] override. A token missing from a dark block is the
  // exact class of bug Stage A shipped with --border-hairline.
  for (const token of ['--status-warn', '--surface-warn', '--border-warn']) {
    const defs = css.match(new RegExp(`${token}:`, 'g')) || [];
    expect(defs.length).toBe(3);
  }
  const darkAttr = css.slice(css.indexOf('[data-theme="dark"]'));
  for (const token of ['--status-warn', '--surface-warn', '--border-warn']) {
    expect(darkAttr).toContain(`${token}:`);
  }
});
