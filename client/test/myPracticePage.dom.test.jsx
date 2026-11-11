// "My practice" — the simple look-back screen, reached from Train.

import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

vi.mock('../src/contexts/AuthContext', () => ({
  useAuth: () => ({ user: { name: 'Test Athlete' }, token: 'test-token', language: 'en' }),
}));
vi.mock('../src/api', () => ({ apiFetch: vi.fn() }));

const { apiFetch } = await import('../src/api');
const { default: MyPracticePage, collectCues } = await import('../src/pages/MyPracticePage.jsx');

const FULL = {
  weekRepCount: 2,
  weekResetCount: 1,
  focusCards: [{ id: 'c1', focusWord: 'Watch the ball', resetWord: 'Next ball' }],
  savedCues: [{ cue: 'next ball' }, { cue: 'Early eyes' }],
  practiceOutcomes: [{
    prescriptionId: 'p1', practiceKey: 'pressure_reset', situation: 'the first over',
    outcomeStatus: 'HELPED', lesson: 'Slow exhale settled my hands.', outcomeRecordedAt: '2026-11-08T10:00:00Z',
  }],
  reflections: [
    { id: 'j1', source: 'mind_journal', createdAt: '2026-11-07T10:00:00Z', takeaway: 'Start slower in warm-up.' },
    { id: 'j2', source: 'mind_journal', createdAt: '2026-11-06T10:00:00Z', takeaway: null },
  ],
  insight: { key: 'nervous_pattern' },
};

const respond = (body, ok = true) => apiFetch.mockResolvedValue({ ok, json: async () => body });
const renderPage = () => render(<MemoryRouter><MyPracticePage /></MemoryRouter>);

beforeEach(() => apiFetch.mockReset());
afterEach(() => cleanup());

describe('MyPracticePage', () => {
  test('shows practices with their result, cues, reflection takeaways and the weekly-reviews link', async () => {
    respond(FULL);
    renderPage();
    expect(await screen.findByText('Pressure Reset')).toBeTruthy();
    expect(screen.getByText('For: the first over')).toBeTruthy();
    expect(screen.getByText('It helped')).toBeTruthy();
    expect(screen.getByText('Slow exhale settled my hands.')).toBeTruthy();
    expect(screen.getByText('2 Quick Reps · 1 Pressure Reset')).toBeTruthy();
    expect(screen.getByText('Watch the ball')).toBeTruthy();
    expect(screen.getByText('Early eyes')).toBeTruthy();
    expect(screen.getByText('Start slower in warm-up.')).toBeTruthy();
    expect(screen.getByRole('link', { name: /Weekly reviews/ }).getAttribute('href')).toBe('/weekly-reviews');
  });

  test('reads one endpoint and writes nothing', async () => {
    respond(FULL);
    renderPage();
    await screen.findByText('Pressure Reset');
    expect(apiFetch.mock.calls.map(([p, init = {}]) => `${init.method || 'GET'} ${p}`)).toEqual(['GET /api/playbook']);
  });

  test('never shows a score, streak or a pattern noticed about the athlete', async () => {
    respond(FULL);
    const { container } = renderPage();
    await screen.findByText('Pressure Reset');
    expect(container.textContent).not.toMatch(/score|streak|xp\b|pattern|\/\s*100|%/i);
  });

  test('an athlete with nothing yet gets a plain empty state and a way to Coach', async () => {
    respond({ practiceOutcomes: [], focusCards: [], savedCues: [], reflections: [], weekRepCount: 0, weekResetCount: 0 });
    renderPage();
    expect(await screen.findByText('Nothing here yet')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Talk to Arjun' }).getAttribute('href')).toBe('/coaching');
  });

  test('a failed load shows an error, not an empty state', async () => {
    respond({}, false);
    renderPage();
    expect(await screen.findByText(/Could not load/)).toBeTruthy();
    expect(screen.queryByText('Nothing here yet')).toBeNull();
  });

  test('collectCues de-duplicates across Focus Cards and saved cues', () => {
    expect(collectCues(FULL)).toEqual(['Watch the ball', 'Next ball', 'Early eyes']);
    expect(collectCues(null)).toEqual([]);
  });
});
