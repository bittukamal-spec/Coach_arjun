// RitualPage save outcomes under a real <MemoryRouter>: a save flagged by
// the server's safety screen shows the standard safety guidance (never a
// save confirmation), and any other failure keeps the existing generic
// "Could not save" error. Only useAuth and apiFetch are mocked.

import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';

const authState = { user: { id: 'u1', onboardingDone: true }, token: 'test-token', language: 'en', updateUser: vi.fn() };
vi.mock('../src/contexts/AuthContext', () => ({ useAuth: () => authState }));
vi.mock('../src/api', () => ({ apiFetch: vi.fn() }));

const { apiFetch } = await import('../src/api');
const { default: RitualPage } = await import('../src/pages/RitualPage.jsx');
const { translations } = await import('../src/i18n/translations');

const json = (body, status = 200) => ({ ok: status >= 200 && status < 300, status, json: async () => body });
const GUIDANCE = "What you're describing is bigger than sport. Please talk to a trusted adult right now.";

function mockApi(saveResponse) {
  apiFetch.mockImplementation(async (path, init = {}) => {
    // The classic page is only reachable with an existing legacy ritual
    // (Routine Builder PR 3 redirects everyone else to the /ritual hub).
    if (path === '/api/ritual/me' && !init.method) return json({ ritualName: 'Match', steps: [{ type: 'breathe', label: 'Slow' }] });
    if (path === '/api/ritual/me' && init.method === 'POST') return saveResponse;
    throw new Error(`unexpected ${init.method || 'GET'} ${path}`);
  });
}

async function fillAndSave(user) {
  const t = translations.en.ritual;
  await user.click(await screen.findByRole('button', { name: t.editRitual }));
  await user.type(await screen.findByDisplayValue('Match'), ' day');
  await user.type(screen.getByDisplayValue('Slow'), ' breath');
  await user.click(screen.getByRole('button', { name: t.save }));
}

describe('RitualPage — save error handling', () => {
  beforeEach(() => { authState.language = 'en'; apiFetch.mockReset(); });
  afterEach(() => cleanup());

  test('a safety-flagged save shows the returned guidance and helplines, not a save or generic error', async () => {
    mockApi(json({ error: 'needs_support', safetyFlag: 'needs_support', guidance: GUIDANCE }, 422));
    const user = userEvent.setup();
    render(<MemoryRouter><RitualPage /></MemoryRouter>);
    await fillAndSave(user);

    expect(await screen.findByText(GUIDANCE)).toBeTruthy();
    expect(screen.getByText(translations.en.mindJournal.safety.heading)).toBeTruthy();
    expect(screen.getByText('1800-599-0019')).toBeTruthy();
    expect(screen.queryByText(new RegExp(translations.en.ritual.errSave))).toBeNull();
    expect(screen.queryByText(new RegExp(translations.en.ritual.saved))).toBeNull();
    // Still in the builder with the athlete's text, so it can be changed.
    expect(screen.getByDisplayValue('Match day')).toBeTruthy();

    await user.click(screen.getByRole('button', { name: translations.en.mindJournal.safety.okBtn }));
    expect(screen.queryByText(GUIDANCE)).toBeNull();
  });

  test('any other failed save keeps the existing generic error', async () => {
    mockApi(json({ error: 'Server error' }, 500));
    const user = userEvent.setup();
    render(<MemoryRouter><RitualPage /></MemoryRouter>);
    await fillAndSave(user);

    expect(await screen.findByText(new RegExp(translations.en.ritual.errSave))).toBeTruthy();
    expect(screen.queryByText(translations.en.mindJournal.safety.heading)).toBeNull();
  });
});
