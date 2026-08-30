// Pilot Access (temporary beta entitlement override) — frontend behavior.
//
// Backend is authoritative: GET /api/chat/usage now reports an extra
// `hasPilotAccess` boolean alongside isPremium/trialDaysRemaining, computed
// server-side from User.pilotAccessUntil (see server/src/routes/chat.js's
// hasPilotAccess()/isEntitled()). ChatPage must fold that boolean into
// `atLimit` and must NEVER re-derive pilot expiry from a raw date itself.
//
// Same rendering/mocking conventions as chatCoachMinimalUi.dom.test.jsx:
// full ChatPage render, apiFetch mocked at the module boundary, no real
// network or SSE stream needed since these tests only exercise the
// idle/loaded composer state.

import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';

vi.mock('../src/contexts/AuthContext', () => ({
  useAuth: () => ({ user: { name: 'Test Athlete' }, token: 'test-token', language: 'en' }),
}));
vi.mock('../src/api', () => ({ apiFetch: vi.fn() }));

const { apiFetch } = await import('../src/api');
const { default: ChatPage } = await import('../src/pages/ChatPage.jsx');

const HISTORY_REPLY = 'Earlier reply from Arjun.';

function mockApi(usageResponse) {
  apiFetch.mockImplementation((path) => {
    const json =
      path.startsWith('/api/sessions/end-stale') ? { count: 0 }
      : path.startsWith('/api/chat/usage') ? usageResponse
      : path.includes('/messages') ? { messages: [
          { id: 'm1', role: 'user', content: 'I rushed the shot again', createdAt: new Date().toISOString() },
          { id: 'm2', role: 'assistant', content: HISTORY_REPLY, createdAt: new Date().toISOString() },
        ] }
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

const composer = () => screen.queryByRole('textbox');

beforeEach(() => { vi.clearAllMocks(); });
afterEach(() => cleanup());

describe('Pilot Access — Coach composer', () => {
  test('an expired-trial, non-pilot athlete is locked out (regression guard for the existing paywall)', async () => {
    mockApi({ isPremium: false, trialDaysRemaining: 0, hasPilotAccess: false });
    render(<App />);
    await screen.findByText(HISTORY_REPLY);

    await waitFor(() => expect(composer()).not.toBeNull());
    expect(composer().disabled).toBe(true);
    expect(screen.getByText(/Your 14-day free trial has ended\./)).toBeTruthy();
  });

  test('an expired-trial athlete WITH active pilot access keeps the composer enabled and shows no paywall banner', async () => {
    mockApi({ isPremium: false, trialDaysRemaining: 0, hasPilotAccess: true });
    render(<App />);
    await screen.findByText(HISTORY_REPLY);

    await waitFor(() => expect(composer()).not.toBeNull());
    expect(composer().disabled).toBe(false);
    expect(screen.queryByText(/Your 14-day free trial has ended\./)).toBeNull();
  });

  test('an active-trial athlete (trialDaysRemaining > 0) is unaffected by hasPilotAccess being false', async () => {
    mockApi({ isPremium: false, trialDaysRemaining: 5, hasPilotAccess: false });
    render(<App />);
    await screen.findByText(HISTORY_REPLY);

    await waitFor(() => expect(composer()).not.toBeNull());
    expect(composer().disabled).toBe(false);
  });

  test('a premium athlete is unaffected by hasPilotAccess being false', async () => {
    mockApi({ isPremium: true, trialDaysRemaining: null, hasPilotAccess: false });
    render(<App />);
    await screen.findByText(HISTORY_REPLY);

    await waitFor(() => expect(composer()).not.toBeNull());
    expect(composer().disabled).toBe(false);
  });
});
