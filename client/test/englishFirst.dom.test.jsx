// English-first (Nov 2026): Hindi is switched off in i18n/languages.js. The
// app renders English even for an account still saved as Hindi, moves that
// account back to English on the server, and the toggle does nothing.

import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, waitFor } from '@testing-library/react';

vi.mock('../src/api', () => ({ apiFetch: vi.fn() }));
const { apiFetch } = await import('../src/api');
const { AuthProvider, useAuth } = await import('../src/contexts/AuthContext.jsx');
const { HINDI_ENABLED } = await import('../src/i18n/languages.js');

function Probe() {
  const { language, toggleLanguage } = useAuth();
  return <button type="button" onClick={toggleLanguage}>{`lang:${language}`}</button>;
}

const json = (body, status = 200) => ({ ok: status < 300, status, json: async () => body });

describe('English-first', () => {
  beforeEach(() => {
    localStorage.clear();
    apiFetch.mockReset();
  });
  afterEach(() => cleanup());

  test('Hindi is switched off', () => {
    expect(HINDI_ENABLED).toBe(false);
  });

  test('an account saved as Hindi renders English and is moved back to English', async () => {
    localStorage.setItem('mg_token', 't');
    localStorage.setItem('mg_language', 'hi');
    apiFetch.mockImplementation(async (path, init = {}) => {
      if (path === '/api/auth/me' && !init.method) return json({ user: { id: 'u1', language: 'hi', onboardingDone: true } });
      if (path === '/api/auth/me/language' && init.method === 'PATCH') return json({ success: true });
      throw new Error(`unexpected ${init.method || 'GET'} ${path}`);
    });
    render(<AuthProvider><Probe /></AuthProvider>);
    expect(await screen.findByText('lang:en')).toBeTruthy();
    await waitFor(() => {
      const patch = apiFetch.mock.calls.find(([p, i = {}]) => p === '/api/auth/me/language' && i.method === 'PATCH');
      expect(patch && JSON.parse(patch[1].body)).toEqual({ language: 'en' });
    });
    expect(localStorage.getItem('mg_language')).toBe('en');
  });

  test('the language toggle is a no-op', async () => {
    apiFetch.mockResolvedValue(json({}));
    render(<AuthProvider><Probe /></AuthProvider>);
    screen.getByText('lang:en').click();
    await new Promise(r => setTimeout(r, 0));
    expect(screen.getByText('lang:en')).toBeTruthy();
    expect(apiFetch.mock.calls.some(([p]) => p === '/api/auth/me/language')).toBe(false);
  });
});
