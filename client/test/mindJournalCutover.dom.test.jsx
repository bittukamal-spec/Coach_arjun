// Unified Mind Journal PR 2 — the product cutover, as real DOM behaviour.
//
// Three things are proven here rather than by source text:
//   1. /debrief is a compatibility redirect with exactly two destinations,
//      and no loop.
//   2. A reflection started from a prescribed post_performance_reflection
//      card completes that exact prescription, once.
//   3. An ordinary self-started reflection completes nothing at all.

import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom';

vi.mock('../src/contexts/AuthContext', () => ({
  useAuth: () => ({ user: { name: 'Test Athlete' }, token: 't', language: 'en' }),
}));
vi.mock('../src/api', () => ({ apiFetch: vi.fn() }));

const { apiFetch } = await import('../src/api');
const { default: DebriefRedirect } = await import('../src/pages/DebriefRedirect.jsx');
const { default: ReflectionWizard } = await import('../src/pages/mindJournal/ReflectionWizard.jsx');

const json = (body, ok = true) => ({ ok, status: ok ? 200 : 400, json: async () => body });

function Probe() {
  const loc = useLocation();
  return (
    <>
      <p data-testid="pathname">{loc.pathname}</p>
      <p data-testid="state">{JSON.stringify(loc.state ?? null)}</p>
    </>
  );
}

function renderApp(initialEntries) {
  return render(
    <MemoryRouter initialEntries={initialEntries}>
      <Probe />
      <Routes>
        <Route path="/debrief" element={<DebriefRedirect />} />
        <Route path="/mind-journal" element={<p data-testid="journal">journal</p>} />
        <Route path="/mind-journal/new" element={<ReflectionWizard />} />
        <Route path="/mind-journal/saved/:id" element={<p data-testid="saved">saved</p>} />
      </Routes>
    </MemoryRouter>
  );
}

function mockApi({ focusWord = null, saveResponse } = {}) {
  apiFetch.mockImplementation(async (path, init) => {
    if (path === '/api/mind-journal' && init?.method === 'POST') {
      return json(saveResponse || { entry: { id: 'r1', entryType: 'REFLECTION' } });
    }
    if (path.startsWith('/api/prescriptions/')) return json({ ok: true });
    return json({ entries: [], contextEnabled: false, focusWord });
  });
}

const completionCalls = () =>
  apiFetch.mock.calls.filter(([p]) => typeof p === 'string' && p.startsWith('/api/prescriptions/'));

// Answer whichever question is on screen with its first real option, then
// advance. Chips only — a reflection never requires typing.
async function answerAndAdvance() {
  const radios = screen.queryAllByRole('radio');
  if (radios.length) {
    await userEvent.click(radios[0]);
  } else {
    const chips = Array.from(document.querySelectorAll('button[aria-pressed]'))
      .filter((b) => !/Write my own/.test(b.textContent));
    await userEvent.click(chips[0]);
  }
  const btn = screen.queryByRole('button', { name: 'Next' })
    || screen.queryByRole('button', { name: 'Save reflection' });
  if (btn) await userEvent.click(btn);
}

async function completeReflection() {
  for (let i = 0; i < 7; i++) {
    if (screen.queryByTestId('pathname')?.textContent !== '/mind-journal/new') break;
    if (!screen.queryByRole('button', { name: 'Next' })
      && !screen.queryByRole('button', { name: 'Save reflection' })) break;
    await answerAndAdvance();
  }
}

beforeEach(() => { apiFetch.mockReset(); mockApi(); });
afterEach(() => { cleanup(); vi.useRealTimers(); });

describe('/debrief compatibility redirect', () => {
  test('a plain /debrief bookmark lands on the Mind Journal, not a 404 and not the retired screen', async () => {
    renderApp(['/debrief']);
    expect(await screen.findByTestId('journal')).toBeTruthy();
    expect(screen.getByTestId('pathname').textContent).toBe('/mind-journal');
  });

  test('a prescribed reflection link lands on the reflection flow with its prescription intact', async () => {
    renderApp([{
      pathname: '/debrief',
      state: { prescriptionId: 'presc-1', practiceKey: 'post_performance_reflection' },
    }]);
    expect(await screen.findByRole('heading', { level: 2, name: 'What are you reflecting on?' })).toBeTruthy();
    expect(screen.getByTestId('pathname').textContent).toBe('/mind-journal/new');
    expect(JSON.parse(screen.getByTestId('state').textContent)).toEqual({
      prescriptionId: 'presc-1',
      practiceKey: 'post_performance_reflection',
    });
  });

  test('a prescription carried as query params is preserved too', async () => {
    renderApp(['/debrief?prescriptionId=presc-q&practiceKey=post_performance_reflection']);
    await screen.findByRole('heading', { level: 2, name: 'What are you reflecting on?' });
    expect(JSON.parse(screen.getByTestId('state').textContent)).toEqual({
      prescriptionId: 'presc-q',
      practiceKey: 'post_performance_reflection',
    });
  });

  test('a mismatched practiceKey is dropped rather than trusted — it falls back to the journal', async () => {
    renderApp([{
      pathname: '/debrief',
      state: { prescriptionId: 'presc-1', practiceKey: 'pressure_reset' },
    }]);
    expect(await screen.findByTestId('journal')).toBeTruthy();
  });

  test('the redirect never returns to /debrief — no loop', async () => {
    renderApp(['/debrief']);
    await screen.findByTestId('journal');
    expect(screen.getByTestId('pathname').textContent).not.toBe('/debrief');
  });
});

describe('prescribed reflection completion', () => {
  test('completing a prescribed reflection completes that exact prescription, once', async () => {
    renderApp([{
      pathname: '/mind-journal/new',
      state: { prescriptionId: 'presc-42', practiceKey: 'post_performance_reflection' },
    }]);
    await completeReflection();
    expect(await screen.findByTestId('saved')).toBeTruthy();

    const calls = completionCalls();
    expect(calls).toHaveLength(1);
    expect(calls[0][0]).toBe('/api/prescriptions/presc-42/complete');
    expect(calls[0][1].method).toBe('POST');
    expect(JSON.parse(calls[0][1].body)).toEqual({ practiceKey: 'post_performance_reflection' });
  });

  test('an ordinary self-started reflection never completes a prescription', async () => {
    renderApp(['/mind-journal/new']);
    await completeReflection();
    expect(await screen.findByTestId('saved')).toBeTruthy();
    expect(completionCalls()).toHaveLength(0);
  });

  test('a prescription for a different practice is never completed from here', async () => {
    renderApp([{
      pathname: '/mind-journal/new',
      state: { prescriptionId: 'presc-9', practiceKey: 'pressure_reset' },
    }]);
    await completeReflection();
    expect(await screen.findByTestId('saved')).toBeTruthy();
    expect(completionCalls()).toHaveLength(0);
  });

  test('a safety-flagged submission saves nothing and completes nothing', async () => {
    mockApi({ saveResponse: { safetyFlag: 'needs_support', guidance: 'Please talk to someone you trust.' } });
    renderApp([{
      pathname: '/mind-journal/new',
      state: { prescriptionId: 'presc-7', practiceKey: 'post_performance_reflection' },
    }]);
    await completeReflection();
    expect(screen.queryByTestId('saved')).toBeNull();
    expect(completionCalls()).toHaveLength(0);
  });

  test('a failed save completes nothing', async () => {
    apiFetch.mockImplementation(async (path, init) => {
      if (path === '/api/mind-journal' && init?.method === 'POST') return json({ error: 'nope' }, false);
      if (path.startsWith('/api/prescriptions/')) return json({ ok: true });
      return json({ entries: [], contextEnabled: false, focusWord: null });
    });
    renderApp([{
      pathname: '/mind-journal/new',
      state: { prescriptionId: 'presc-8', practiceKey: 'post_performance_reflection' },
    }]);
    await completeReflection();
    expect(screen.queryByTestId('saved')).toBeNull();
    expect(completionCalls()).toHaveLength(0);
  });
});
