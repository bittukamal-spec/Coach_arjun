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

// ── 4. Scroll after reveal + composer remount ───────────────────────────────
//
// The bug this covers: the auto-scroll effect keyed only on
// [messages, waitingForFirst], neither of which changes while a reply reveals
// or when the composer returns — so the last scroll ran while the message was
// still empty and the finished reply sat under the composer.

describe('Coach — scroll settles after the reveal and the composer returns', () => {
  // jsdom has no layout, so scrollIntoView is asserted via a spy: the point is
  // that a scroll is REQUESTED after the reveal ends and the composer mounts.
  function spyScroll() {
    const calls = [];
    Element.prototype.scrollIntoView = function scrollIntoViewSpy(opts) {
      calls.push({ composerMounted: !!document.querySelector('textarea'), opts });
    };
    return calls;
  }

  let originalScrollIntoView;
  beforeEach(() => { originalScrollIntoView = Element.prototype.scrollIntoView; });
  afterEach(() => { Element.prototype.scrollIntoView = originalScrollIntoView; });

  test('a scroll is requested after the reveal completes AND the composer has remounted', async () => {
    const stream = makeStream();
    mockApi({ stream, history: historyTurns() });
    render(<App />);
    await sendAndHold(stream);
    await waitFor(() => expect(composer()).toBeNull());

    const calls = spyScroll();
    stream.push({ t: 'd', c: NEW_REPLY });
    stream.push({ t: 'end', id: 'm3' });
    stream.finish();

    await waitFor(() => expect(visibleReplyText()).toContain(NEW_REPLY), { timeout: 4000 });
    await waitFor(() => expect(composer()).not.toBeNull(), { timeout: 4000 });

    // The final scroll must happen with the composer already in the DOM —
    // otherwise it is measuring a layout that is about to change.
    await waitFor(
      () => expect(calls.some((c) => c.composerMounted)).toBe(true),
      { timeout: 4000 }
    );
  });

  test('the reserved composer footprint sits above the bottom sentinel, so scrolling to it clears the composer', async () => {
    mockApi({ stream: makeStream(), history: historyTurns() });
    render(<App />);
    await screen.findByText(HISTORY_REPLY);

    // The spacer is the sentinel's immediate previous sibling. If it were page
    // padding BELOW the sentinel (the original bug), scrolling the sentinel
    // into view would stop short and leave the reply behind the composer.
    const scroller = document.querySelector('.overflow-y-auto');
    const wrapper = scroller.firstElementChild;
    const sentinel = wrapper.lastElementChild;
    const spacer = sentinel.previousElementSibling;
    expect(spacer.getAttribute('aria-hidden')).toBe('true');
    expect(spacer.style.height).toContain('safe-area-inset-bottom');
    // And the wrapper itself carries no bottom padding doing the same job.
    expect(wrapper.style.paddingBottom || '').toBe('');
  });

  test('reduced motion still ends with a scroll to the latest response', async () => {
    setReducedMotion(true);
    const stream = makeStream();
    mockApi({ stream, history: historyTurns() });
    render(<App />);
    await sendAndHold(stream);
    await waitFor(() => expect(composer()).toBeNull());

    const calls = spyScroll();
    stream.push({ t: 'd', c: NEW_REPLY });
    stream.push({ t: 'end', id: 'm3' });
    stream.finish();

    await waitFor(() => expect(visibleReplyText()).toContain(NEW_REPLY));
    await waitFor(() => expect(composer()).not.toBeNull());
    await waitFor(
      () => expect(calls.some((c) => c.composerMounted)).toBe(true),
      { timeout: 4000 }
    );
  });

  test('a deliberate scroll away from the bottom is not overridden by the reply', async () => {
    const stream = makeStream();
    mockApi({ stream, history: historyTurns() });
    render(<App />);
    await sendAndHold(stream);
    await waitFor(() => expect(composer()).toBeNull());

    // jsdom reports 0 for all layout metrics, so drive the component's own
    // near-bottom maths directly: a large scrollHeight with scrollTop at the
    // top is unambiguously "scrolled up".
    const scroller = document.querySelector('.overflow-y-auto');
    Object.defineProperty(scroller, 'scrollHeight', { value: 5000, configurable: true });
    Object.defineProperty(scroller, 'clientHeight', { value: 700, configurable: true });
    scroller.scrollTop = 0;
    scroller.dispatchEvent(new Event('scroll', { bubbles: true }));

    const calls = spyScroll();
    stream.push({ t: 'd', c: NEW_REPLY });
    stream.push({ t: 'end', id: 'm3' });
    stream.finish();

    await waitFor(() => expect(visibleReplyText()).toContain(NEW_REPLY), { timeout: 4000 });
    await waitFor(() => expect(composer()).not.toBeNull(), { timeout: 4000 });
    // Give any stray frame a chance to fire before asserting none did.
    await new Promise((r) => setTimeout(r, 120));
    expect(calls).toHaveLength(0);
  });

  test('sending re-attaches to the bottom even after scrolling up to re-read', async () => {
    const stream = makeStream();
    mockApi({ stream, history: historyTurns() });
    render(<App />);
    const user = await sendAndHold(stream);
    stream.push({ t: 'd', c: NEW_REPLY });
    stream.push({ t: 'end', id: 'm3' });
    stream.finish();
    await waitFor(() => expect(composer()).not.toBeNull(), { timeout: 4000 });

    // Scroll up, then send again: the athlete's own action re-attaches them.
    const scroller = document.querySelector('.overflow-y-auto');
    Object.defineProperty(scroller, 'scrollHeight', { value: 5000, configurable: true });
    Object.defineProperty(scroller, 'clientHeight', { value: 700, configurable: true });
    scroller.scrollTop = 0;
    scroller.dispatchEvent(new Event('scroll', { bubbles: true }));

    const calls = spyScroll();
    const stream2 = makeStream();
    mockApi({ stream: stream2, history: historyTurns() });
    await user.type(composer(), 'again');
    await user.click(screen.getByLabelText(/send/i));

    await waitFor(() => expect(calls.length).toBeGreaterThan(0), { timeout: 4000 });
  });
});
