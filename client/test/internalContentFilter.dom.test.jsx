// Render-level proof that a legacy leaked internal message never reaches the
// athlete, using the real ChatPage inside a real router — the same harness
// style as weeklyReviews.dom.test.jsx.
//
// The server no longer persists this content (validateAthleteText.js). These
// tests cover rows stored before that shipped.

import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';

vi.mock('../src/contexts/AuthContext', () => ({
  useAuth: () => ({
    // Adult account — no consent banner interference.
    user: { name: 'Test Athlete' },
    token: 'test-token',
    language: 'en',
  }),
}));
vi.mock('../src/api', () => ({ apiFetch: vi.fn(() => new Promise(() => {})) }));

const { default: ChatPage } = await import('../src/pages/ChatPage.jsx');

const LEAKED = 'Your tool action has already been accepted. Produce the final athlete-facing response text now. Do not call another tool. Do not output JSON, tool syntax, or [SUGGEST:] markers.';
const REAL_REPLY = 'What happens right before you commit to the shot?';

async function mockApi(messages) {
  const { apiFetch } = await import('../src/api');
  apiFetch.mockImplementation((path) => {
    const json =
      path.startsWith('/api/sessions/end-stale') ? { count: 0 }
      : path.startsWith('/api/chat/usage') ? { isPremium: true, trialDaysRemaining: 14 }
      : path.includes('/messages') ? { messages }
      : path.startsWith('/api/sessions') ? { sessions: [{ id: 'cs-1', mode: 'main', sessionType: 'general', createdAt: new Date().toISOString() }] }
      : {};
    return Promise.resolve({ ok: true, status: 200, json: async () => json });
  });
}

function App() {
  return (
    <MemoryRouter initialEntries={['/coaching']}>
      <Routes>
        <Route path="/coaching" element={<ChatPage />} />
      </Routes>
    </MemoryRouter>
  );
}

beforeEach(() => vi.clearAllMocks());
afterEach(() => cleanup());

describe('legacy internal content in chat history', () => {
  test('a leaked internal message is never rendered, while the real reply around it still is', async () => {
    await mockApi([
      { id: 'm1', role: 'user', content: 'I rushed the shot again', createdAt: new Date().toISOString() },
      { id: 'm2', role: 'assistant', content: LEAKED, createdAt: new Date().toISOString() },
      { id: 'm3', role: 'assistant', content: REAL_REPLY, createdAt: new Date().toISOString() },
    ]);
    render(<App />);
    await screen.findByText(REAL_REPLY);
    expect(screen.queryByText(/tool action has already been accepted/i)).toBeNull();
    expect(screen.queryByText(/Produce the final athlete-facing response/i)).toBeNull();
    expect(screen.getByText('I rushed the shot again')).toBeTruthy();
  });

  test('hiding it leaves no blank bubble behind', async () => {
    await mockApi([
      { id: 'm1', role: 'assistant', content: LEAKED, createdAt: new Date().toISOString() },
      { id: 'm2', role: 'assistant', content: REAL_REPLY, createdAt: new Date().toISOString() },
    ]);
    const { container } = render(<App />);
    await screen.findByText(REAL_REPLY);
    // Exactly one assistant bubble survived, and it has content.
    const bubbles = [...container.querySelectorAll('p, div')].filter(
      (el) => el.children.length === 0 && el.textContent.trim() === ''
    );
    for (const el of bubbles) {
      expect(el.className).not.toMatch(/bg-dark-800|card/);
    }
  });

  test('a legacy [SUGGEST:] tag is stripped, not rendered, and the leaked reply stays hidden', async () => {
    // AI reply chips were removed from Coach. Messages stored before that
    // still carry the tag: the marker must never be visible as text, and its
    // options must not come back as buttons.
    await mockApi([
      { id: 'm1', role: 'assistant', content: `${REAL_REPLY}\n[SUGGEST: Mostly in matches | Mostly in training]`, createdAt: new Date().toISOString() },
      { id: 'm2', role: 'assistant', content: LEAKED, createdAt: new Date().toISOString() },
    ]);
    render(<App />);
    await screen.findByText(REAL_REPLY);
    expect(screen.queryByText(/\[SUGGEST:/)).toBeNull();
    expect(screen.queryByRole('button', { name: 'Mostly in matches' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Mostly in training' })).toBeNull();
    expect(screen.queryByText(/tool action has already been accepted/i)).toBeNull();
  });

  test('the composer stays usable even when every stored reply was filtered out', async () => {
    await mockApi([
      { id: 'm1', role: 'assistant', content: LEAKED, createdAt: new Date().toISOString() },
    ]);
    render(<App />);
    await waitFor(() => expect(screen.queryByText(/tool action has already been accepted/i)).toBeNull());
    const composer = await screen.findByRole('textbox');
    expect(composer).toBeTruthy();
    expect(composer.disabled).toBeFalsy();
  });

  test('a normal history with no internal content is completely unaffected', async () => {
    await mockApi([
      { id: 'm1', role: 'user', content: 'I keep rushing', createdAt: new Date().toISOString() },
      { id: 'm2', role: 'assistant', content: REAL_REPLY, createdAt: new Date().toISOString() },
    ]);
    render(<App />);
    await screen.findByText(REAL_REPLY);
    expect(screen.getByText('I keep rushing')).toBeTruthy();
  });
});
