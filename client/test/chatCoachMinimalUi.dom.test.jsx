// Coach chat minimal-UI polish: the generating state, the progressive reveal
// of an already-approved reply, and the overflow menu.
//
// The reveal is PRESENTATION ONLY. These tests pin the property that matters
// most: nothing from the stream is painted until the existing `end`-event
// content checks have run, so a raw delta can never reach the athlete.
//
// Behavioural guardrails (persistence, prescription linkage, safety
// classification, internal-content filtering) live in their own suites and are
// deliberately not duplicated or relaxed here.

import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route } from 'react-router-dom';

vi.mock('../src/contexts/AuthContext', () => ({
  useAuth: () => ({ user: { name: 'Test Athlete' }, token: 'test-token', language: 'en' }),
}));
vi.mock('../src/api', () => ({ apiFetch: vi.fn(() => new Promise(() => {})) }));

const { apiFetch } = await import('../src/api');
const { default: ChatPage } = await import('../src/pages/ChatPage.jsx');

const HISTORY_REPLY = 'Earlier reply from Arjun.';
const NEW_REPLY = 'Take one breath and play the next ball on its own merit.';

// ── SSE plumbing ────────────────────────────────────────────────────────────
// A controllable stream so a test can hold the connection open and assert what
// the UI shows mid-generation.
function makeStream() {
  const chunks = [];
  let resolveNext = null;
  let done = false;
  const encoder = new TextEncoder();

  const push = (obj) => {
    const line = encoder.encode(`data: ${JSON.stringify(obj)}\n`);
    if (resolveNext) { const r = resolveNext; resolveNext = null; r({ value: line, done: false }); }
    else chunks.push(line);
  };

  return {
    push,
    finish() {
      done = true;
      if (resolveNext) { const r = resolveNext; resolveNext = null; r({ value: undefined, done: true }); }
    },
    body: {
      getReader: () => ({
        read: () => {
          if (chunks.length) return Promise.resolve({ value: chunks.shift(), done: false });
          if (done) return Promise.resolve({ value: undefined, done: true });
          return new Promise((res) => { resolveNext = res; });
        },
      }),
    },
  };
}

function mockApi({ stream, history = [] } = {}) {
  apiFetch.mockImplementation((path, init = {}) => {
    if (path === '/api/chat/message' && init.method === 'POST') {
      return Promise.resolve({ ok: true, status: 200, body: stream.body });
    }
    const json =
      path.startsWith('/api/sessions/end-stale') ? { count: 0 }
      : path.startsWith('/api/chat/usage') ? { isPremium: true, trialDaysRemaining: 14 }
      : path.includes('/messages') ? { messages: history }
      : path.startsWith('/api/sessions') ? { sessions: [{ id: 'cs-1', mode: 'main', sessionType: 'general', createdAt: new Date().toISOString() }] }
      : {};
    return Promise.resolve({ ok: true, status: 200, json: async () => json });
  });
}

const historyTurns = () => ([
  { id: 'm1', role: 'user', content: 'I rushed the shot again', createdAt: new Date().toISOString() },
  { id: 'm2', role: 'assistant', content: HISTORY_REPLY, createdAt: new Date().toISOString() },
]);

function App() {
  return (
    <MemoryRouter initialEntries={['/coaching']}>
      <Routes>
        <Route path="/coaching" element={<ChatPage />} />
        <Route path="/weekly-reviews" element={<div>WEEKLY REVIEWS PAGE</div>} />
      </Routes>
    </MemoryRouter>
  );
}

const composer = () => screen.queryByRole('textbox');
const thinking = () => document.querySelectorAll('.animate-bounce');
// The reply text legitimately appears twice once complete: in the conversation
// and in the single polite live region. These helpers keep assertions precise
// about which one they mean.
const liveRegion = () => document.querySelector('[aria-live="polite"][role="status"]');
const visibleReplyText = () =>
  [...document.querySelectorAll('.text-sm.leading-relaxed.text-ink')]
    .map((el) => el.textContent).join(' ');

function setReducedMotion(on) {
  window.matchMedia = vi.fn().mockImplementation((q) => ({
    matches: on && q.includes('prefers-reduced-motion'),
    media: q, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {},
  }));
}

async function sendAndHold(stream) {
  const user = userEvent.setup();
  await screen.findByText(HISTORY_REPLY);
  await user.type(composer(), 'help');
  await user.click(screen.getByLabelText(/send/i));
  return user;
}

beforeEach(() => {
  vi.clearAllMocks();
  setReducedMotion(false);
});
afterEach(() => cleanup());

// ── 1. Generating state ─────────────────────────────────────────────────────

describe('Coach — generating state', () => {
  test('the composer is hidden and a thinking indicator shows while Arjun generates', async () => {
    const stream = makeStream();
    mockApi({ stream, history: historyTurns() });
    render(<App />);
    await sendAndHold(stream);

    await waitFor(() => expect(composer()).toBeNull());
    expect(thinking().length).toBeGreaterThan(0);
  });

  test('raw stream deltas are never painted before the approval checks run', async () => {
    const stream = makeStream();
    mockApi({ stream, history: historyTurns() });
    render(<App />);
    await sendAndHold(stream);
    await waitFor(() => expect(composer()).toBeNull());

    // Deltas arrive but no `end` event yet — nothing may be on screen.
    stream.push({ t: 'd', c: 'unchecked ' });
    stream.push({ t: 'd', c: 'model text' });
    await new Promise((r) => setTimeout(r, 60));

    expect(screen.queryByText(/unchecked/)).toBeNull();
    expect(document.body.textContent).not.toContain('unchecked');
    // Still generating.
    expect(composer()).toBeNull();
  });

  test('the composer returns once the approved reply has fully revealed', async () => {
    const stream = makeStream();
    mockApi({ stream, history: historyTurns() });
    render(<App />);
    await sendAndHold(stream);
    await waitFor(() => expect(composer()).toBeNull());

    stream.push({ t: 'd', c: NEW_REPLY });
    stream.push({ t: 'end', id: 'm3' });
    stream.finish();

    await waitFor(() => expect(screen.getByText(new RegExp(NEW_REPLY.slice(0, 20)))).toBeTruthy(), { timeout: 4000 });
    await waitFor(() => expect(composer()).not.toBeNull(), { timeout: 4000 });
  });

  test('a generation error restores the composer and keeps the existing retry copy', async () => {
    const stream = makeStream();
    mockApi({ stream, history: historyTurns() });
    render(<App />);
    await sendAndHold(stream);
    await waitFor(() => expect(composer()).toBeNull());

    stream.push({ t: 'error', message: 'Something went wrong' });
    stream.finish();

    await waitFor(() => expect(screen.getByText(/Something went wrong/)).toBeTruthy());
    await waitFor(() => expect(composer()).not.toBeNull());
  });
});

// ── 2. Progressive reveal ───────────────────────────────────────────────────

describe('Coach — progressive reveal', () => {
  test('the approved reply reveals progressively and ends complete', async () => {
    const stream = makeStream();
    mockApi({ stream, history: historyTurns() });
    render(<App />);
    await sendAndHold(stream);
    await waitFor(() => expect(composer()).toBeNull());

    stream.push({ t: 'd', c: NEW_REPLY });
    stream.push({ t: 'end', id: 'm3' });
    stream.finish();

    // Ends with the whole approved reply present in the conversation.
    await waitFor(() => expect(visibleReplyText()).toContain(NEW_REPLY), { timeout: 4000 });
  });

  test('with prefers-reduced-motion the complete reply appears immediately', async () => {
    setReducedMotion(true);
    const stream = makeStream();
    mockApi({ stream, history: historyTurns() });
    render(<App />);
    await sendAndHold(stream);
    await waitFor(() => expect(composer()).toBeNull());

    stream.push({ t: 'd', c: NEW_REPLY });
    stream.push({ t: 'end', id: 'm3' });
    stream.finish();

    // No reveal animation: the full text is present as soon as it is approved.
    await waitFor(() => expect(visibleReplyText()).toContain(NEW_REPLY));
    // And the composer is back without waiting out a reveal.
    await waitFor(() => expect(composer()).not.toBeNull());
  });

  test('the complete reply is announced once, not word by word', async () => {
    const stream = makeStream();
    mockApi({ stream, history: historyTurns() });
    render(<App />);
    await sendAndHold(stream);
    await waitFor(() => expect(composer()).toBeNull());

    stream.push({ t: 'd', c: NEW_REPLY });
    stream.push({ t: 'end', id: 'm3' });
    stream.finish();

    await waitFor(() => expect(visibleReplyText()).toContain(NEW_REPLY), { timeout: 4000 });

    // Exactly one polite live region in the conversation, carrying the whole
    // message — never a fragment.
    expect(document.querySelectorAll('[aria-live="polite"][role="status"]').length).toBe(1);
    await waitFor(() => expect(liveRegion().textContent).toBe(NEW_REPLY), { timeout: 4000 });
  });
});

// ── 3. Overflow menu ────────────────────────────────────────────────────────

describe('Coach — header overflow menu', () => {
  test('History and Info live in an accessible menu and keep their behaviour', async () => {
    mockApi({ stream: makeStream(), history: historyTurns() });
    render(<App />);
    await screen.findByText(HISTORY_REPLY);
    const user = userEvent.setup();

    const trigger = screen.getByLabelText('More options');
    expect(trigger.getAttribute('aria-haspopup')).toBe('true');
    expect(trigger.getAttribute('aria-expanded')).toBe('false');
    // Nothing is exposed until it is opened.
    expect(screen.queryByRole('link', { name: 'Weekly Reviews' })).toBeNull();

    await user.click(trigger);
    expect(trigger.getAttribute('aria-expanded')).toBe('true');

    // The actions keep their NATIVE roles — a real link and a real button —
    // rather than being flattened into menuitems.
    const history = screen.getByRole('link', { name: 'Weekly Reviews' });
    expect(history.getAttribute('href')).toBe('/weekly-reviews');
    expect(screen.getByRole('button', { name: 'Safety info' })).toBeTruthy();
  });

  test('Info still opens the existing safety note and helplines', async () => {
    mockApi({ stream: makeStream(), history: historyTurns() });
    render(<App />);
    await screen.findByText(HISTORY_REPLY);
    const user = userEvent.setup();

    await user.click(screen.getByLabelText('More options'));
    await user.click(screen.getByLabelText('Safety info'));

    expect(screen.getByText(/not a medical or crisis service/i)).toBeTruthy();
    expect(screen.getByText(/iCall: 9152987821/)).toBeTruthy();
    expect(screen.getByText(/KIRAN: 1800-599-0019/)).toBeTruthy();
  });

  test('Escape closes the menu and returns focus to its trigger', async () => {
    mockApi({ stream: makeStream(), history: historyTurns() });
    render(<App />);
    await screen.findByText(HISTORY_REPLY);
    const user = userEvent.setup();

    const trigger = screen.getByLabelText('More options');
    await user.click(trigger);
    expect(screen.getByRole('link', { name: 'Weekly Reviews' })).toBeTruthy();

    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('link', { name: 'Weekly Reviews' })).toBeNull());
    expect(document.activeElement).toBe(trigger);
  });
});
