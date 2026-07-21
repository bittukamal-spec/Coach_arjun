// Real ROUTER integration tests for Weekly Reviews outside the chat.
// Like dashboardShortcuts.dom.test.jsx, this file runs under vitest +
// jsdom + React Testing Library with a real <MemoryRouter> and real
// <Routes> — clicking the header icon has to travel through the actual
// react-router-dom machinery, and the Weekly Reviews page renders real
// report data through the real component tree.

import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom';

vi.mock('../src/contexts/AuthContext', () => ({
  useAuth: () => ({
    // Adult account — no dateOfBirth, so no consent banner interference.
    user: { name: 'Test Athlete' },
    token: 'test-token',
    language: 'en',
  }),
}));

vi.mock('../src/api', () => ({
  apiFetch: vi.fn(() => new Promise(() => {})),
}));

const { default: ChatPage } = await import('../src/pages/ChatPage.jsx');
const { default: WeeklyReviewsPage } = await import('../src/pages/WeeklyReviewsPage.jsx');

function PathProbe() {
  const location = useLocation();
  return <p data-testid="pathname">{location.pathname}</p>;
}

// URL-routed apiFetch mock. ChatPage's mount sequence calls end-stale,
// usage, sessions, and (when a session exists) that session's messages.
async function mockApi({ sessions = [], messages = [], reports = [] } = {}) {
  const { apiFetch } = await import('../src/api');
  apiFetch.mockImplementation((path) => {
    const json =
      path.startsWith('/api/sessions/end-stale') ? { count: 0 }
      : path.startsWith('/api/chat/usage') ? { isPremium: true, trialDaysRemaining: 14 }
      : path.includes('/messages') ? { messages }
      : path.startsWith('/api/sessions') ? { sessions }
      : path.startsWith('/api/weekly-reports') ? reports
      : {};
    return Promise.resolve({ ok: true, json: async () => json });
  });
}

beforeEach(() => {
  sessionStorage.clear();
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

const SESSION = { id: 's1', mode: 'main', sessionType: 'general', status: 'active', createdAt: new Date().toISOString(), summary: 'SUMMARY SENTINEL SENTENCE.' };

describe('Chat header — Weekly Reviews entry', () => {
  test('the header contains an accessible Weekly Reviews link that really navigates to /weekly-reviews', async () => {
    await mockApi({ sessions: [] });
    render(
      <MemoryRouter initialEntries={['/coaching']}>
        <Routes>
          <Route path="/coaching" element={<ChatPage />} />
          <Route path="/weekly-reviews" element={<PathProbe />} />
        </Routes>
      </MemoryRouter>
    );

    const link = await screen.findByRole('link', { name: 'Weekly Reviews' });
    expect(link.getAttribute('href')).toBe('/weekly-reviews');
    // The existing info control is untouched beside it.
    expect(screen.getByRole('button', { name: 'Safety info' })).toBeTruthy();

    await userEvent.setup().click(link);
    expect((await screen.findByTestId('pathname')).textContent).toBe('/weekly-reviews');
  });

  test('no weekly report or summary card renders inside the live chat stream anymore', async () => {
    await mockApi({
      sessions: [SESSION],
      messages: [{ id: 'm1', role: 'assistant', content: 'Hello athlete', createdAt: new Date().toISOString() }],
    });
    render(
      <MemoryRouter initialEntries={['/coaching']}>
        <Routes>
          <Route path="/coaching" element={<ChatPage />} />
        </Routes>
      </MemoryRouter>
    );

    // The real conversation renders…
    expect(await screen.findByText('Hello athlete')).toBeTruthy();
    // …but the session summary that used to sit at the top of the stream
    // does not, and no Weekly-Review content is injected into it.
    expect(screen.queryByText(/SUMMARY SENTINEL/)).toBeNull();
    expect(screen.queryByText(/Weekly Report/i)).toBeNull();
  });

  test('the composer still works: typing stays in the box, nothing sends on its own', async () => {
    await mockApi({
      sessions: [SESSION],
      messages: [{ id: 'm1', role: 'assistant', content: 'Hello athlete', createdAt: new Date().toISOString() }],
    });
    const { apiFetch } = await import('../src/api');
    render(
      <MemoryRouter initialEntries={['/coaching']}>
        <Routes>
          <Route path="/coaching" element={<ChatPage />} />
        </Routes>
      </MemoryRouter>
    );
    await screen.findByText('Hello athlete');

    const box = screen.getByPlaceholderText("What's on your mind?");
    await userEvent.setup().type(box, 'ready for the match');
    expect(box.value).toBe('ready for the match');
    expect(screen.getByRole('button', { name: 'Send' })).toBeTruthy();
    // No /api/chat/message call happened without pressing send.
    const sent = apiFetch.mock.calls.filter(([p]) => p.startsWith('/api/chat/message'));
    expect(sent.length).toBe(0);
  });
});

const REPORTS = [
  {
    id: 'r-new', weekStart: '2026-07-13T00:00:00.000Z', weekEnd: '2026-07-19T23:59:59.999Z',
    content: '**What you worked on** NEWEST-WEEK-BODY staying calm under pressure.',
    createdAt: '2026-07-20T00:00:00.000Z',
  },
  {
    id: 'r-old', weekStart: '2026-07-06T00:00:00.000Z', weekEnd: '2026-07-12T23:59:59.999Z',
    content: '**What you worked on** OLDER-WEEK-BODY first coaching week.',
    createdAt: '2026-07-13T00:00:00.000Z',
  },
];

describe('Weekly Reviews page', () => {
  function renderPage() {
    return render(
      <MemoryRouter initialEntries={['/weekly-reviews']}>
        <Routes>
          <Route path="/weekly-reviews" element={<WeeklyReviewsPage />} />
          <Route path="/coaching" element={<PathProbe />} />
        </Routes>
      </MemoryRouter>
    );
  }

  test('renders newest report first, expanded and readable; older reports collapsed below', async () => {
    await mockApi({ reports: REPORTS });
    renderPage();

    // Newest report: expanded, marked as latest, body visible.
    expect(await screen.findByText('Latest review')).toBeTruthy();
    const newestBody = await screen.findByText(/NEWEST-WEEK-BODY/);
    expect(newestBody).toBeTruthy();
    // Bold section heading is rendered as a real <strong>.
    expect(screen.getAllByText('What you worked on')[0].tagName).toBe('STRONG');

    // Older report: present but collapsed…
    expect(screen.queryByText(/OLDER-WEEK-BODY/)).toBeNull();
    const olderToggle = screen.getByRole('button', { expanded: false });
    // …and the newest report appears ABOVE it in the DOM.
    expect(newestBody.compareDocumentPosition(olderToggle) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();

    // Expanding reveals the older body.
    await userEvent.setup().click(olderToggle);
    expect(await screen.findByText(/OLDER-WEEK-BODY/)).toBeTruthy();
  });

  test('shows the empty state when no completed weekly review exists', async () => {
    await mockApi({ reports: [] });
    renderPage();

    expect(await screen.findByText('No weekly reviews yet.')).toBeTruthy();
    expect(screen.getByText('Your first review will appear after a completed coaching week.')).toBeTruthy();
  });

  test('back control returns to Coach', async () => {
    await mockApi({ reports: [] });
    renderPage();
    await screen.findByText('No weekly reviews yet.');

    const header = screen.getByText('Weekly Reviews').closest('header');
    const back = within(header).getByRole('link');
    expect(back.getAttribute('href')).toBe('/coaching');
  });
});

// ─── Coaching continuity in the FRESH cycle after a seven-day rollover ───────
// Server-side, GET /api/sessions archives the completed cycle and stops
// listing it — from the client's point of view "after rollover" IS an
// empty session list. These tests drive the real entry flow from there:
// Continue with Arjun → new session created → the deterministic follow-up
// opener is claimed and displayed in the NEW cycle → outcome chips work →
// normal sending and server quick replies keep working.

// A minimal real-shaped SSE body: one chunk carrying all events, then done.
function sseResponse(events) {
  const encoder = new TextEncoder();
  const payload = events.map(e => `data: ${JSON.stringify(e)}\n`).join('');
  let consumed = false;
  return {
    ok: true,
    body: {
      getReader: () => ({
        read: async () => {
          if (consumed) return { done: true, value: undefined };
          consumed = true;
          return { done: false, value: encoder.encode(payload) };
        },
      }),
    },
  };
}

const OPENER_TEXT = 'Last time you planned to try Pressure Reset in the last over of a tight chase. How did it go?';

async function mockFreshCycleApi() {
  const { apiFetch } = await import('../src/api');
  const state = { sessionCreated: false };
  apiFetch.mockImplementation((path, init = {}) => {
    if (path.startsWith('/api/sessions/end-stale')) {
      return Promise.resolve({ ok: true, json: async () => ({ count: 0 }) });
    }
    if (path.startsWith('/api/chat/usage')) {
      return Promise.resolve({ ok: true, json: async () => ({ isPremium: true, trialDaysRemaining: 14 }) });
    }
    if (path.startsWith('/api/chat/message')) {
      return Promise.resolve(sseResponse([
        { t: 'd', c: 'Good to hear. ' },
        { t: 'd', c: 'What made the difference?' },
        { t: 'quick_replies', replies: [
          { id: 'breath', label: 'The breathing part' },
          { id: 'cue', label: 'My cue word' },
        ] },
        { t: 'end', id: 'm-reply-1' },
      ]));
    }
    if (path.startsWith('/api/prescriptions/claim-opener')) {
      return Promise.resolve({ ok: true, json: async () => ({
        claimed: true,
        outcomePending: true,
        outcomeChoices: [
          { id: 'helped', label: 'It helped' },
          { id: 'helped_a_little', label: 'It helped a little' },
          { id: 'did_not_help', label: 'It did not help' },
          { id: 'not_tried', label: 'I did not try it' },
        ],
      }) });
    }
    if (path.includes('/messages')) {
      // After the claim, the opener exists as a REAL persisted message in
      // the new session — the client refetches and renders it from there.
      const messages = state.sessionCreated
        ? [{ id: 'msg-opener', role: 'assistant', content: OPENER_TEXT, createdAt: new Date().toISOString() }]
        : [];
      return Promise.resolve({ ok: true, json: async () => ({ messages }) });
    }
    if (path.startsWith('/api/sessions') && init.method === 'POST') {
      state.sessionCreated = true;
      return Promise.resolve({ ok: true, json: async () => ({ session: { id: 'cs-new', mode: 'main', sessionType: 'general' } }) });
    }
    if (path.startsWith('/api/sessions')) {
      // Post-rollover: the archived cycle is excluded — nothing to resume.
      return Promise.resolve({ ok: true, json: async () => ({ sessions: [] }) });
    }
    return Promise.resolve({ ok: true, json: async () => ({}) });
  });
  return apiFetch;
}

function renderCoach() {
  return render(
    <MemoryRouter initialEntries={['/coaching']}>
      <Routes>
        <Route path="/coaching" element={<ChatPage />} />
      </Routes>
    </MemoryRouter>
  );
}

describe('Fresh cycle after rollover — coaching continuity', () => {
  test('entering the new cycle claims the follow-up opener, displays it, and offers the outcome chips', async () => {
    const apiFetch = await mockFreshCycleApi();
    renderCoach();
    const user = userEvent.setup();

    // Post-rollover entry screen (no active session listed).
    await user.click(await screen.findByRole('button', { name: 'Continue with Arjun' }));

    // The opener renders from the refetched, persisted message — in the
    // NEW session — and the deterministic outcome chips are offered.
    expect(await screen.findByText(OPENER_TEXT)).toBeTruthy();
    expect(await screen.findByRole('button', { name: 'It helped' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'I did not try it' })).toBeTruthy();

    // Exactly one claim request, addressed to the new session.
    const claims = apiFetch.mock.calls.filter(([p]) => p.startsWith('/api/prescriptions/claim-opener'));
    expect(claims.length).toBe(1);
    expect(JSON.parse(claims[0][1].body).chatSessionId).toBe('cs-new');
  });

  test('normal sending and structured quick replies still work in the new cycle', async () => {
    const apiFetch = await mockFreshCycleApi();
    renderCoach();
    const user = userEvent.setup();

    await user.click(await screen.findByRole('button', { name: 'Continue with Arjun' }));
    await screen.findByText(OPENER_TEXT);

    // Tapping an outcome chip sends ONLY its label through the normal
    // message path…
    await user.click(await screen.findByRole('button', { name: 'It helped' }));
    const sends = () => apiFetch.mock.calls.filter(([p]) => p.startsWith('/api/chat/message'));
    expect(sends().length).toBe(1);
    expect(JSON.parse(sends()[0][1].body).content).toBe('It helped');
    expect(JSON.parse(sends()[0][1].body).chatSessionId).toBe('cs-new');

    // …the streamed reply renders, and the server-offered quick replies
    // appear as chips.
    expect(await screen.findByText(/What made the difference\?/)).toBeTruthy();
    const chip = await screen.findByRole('button', { name: 'My cue word' });

    // Tapping a quick reply sends its label too — composer path intact.
    await user.click(chip);
    expect(sends().length).toBe(2);
    expect(JSON.parse(sends()[1][1].body).content).toBe('My cue word');
  });
});
