// Hook fix 6: one thing the athlete made comes back on Home, changing by day.
import { describe, test, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

vi.mock('../src/contexts/AuthContext', () => ({ useAuth: () => ({ token: 't', language: 'en' }) }));
vi.mock('../src/api', () => ({ apiFetch: vi.fn() }));
const { apiFetch } = await import('../src/api');
const { default: YourWordsCard, pickWords } = await import('../src/components/home/YourWordsCard');
afterEach(() => { cleanup(); apiFetch.mockReset(); });

const data = {
  focusCards: [{ focusWord: 'Next ball' }],
  savedCues: [{ cue: 'Watch it' }],
  takeForwards: [{ id: 'j1', text: 'Start slower in warm-up', createdAt: '2026-11-12T10:00:00Z' }],
  practiceOutcomes: [{ lesson: 'Breathing helped before batting' }],
};

describe('your words come back', () => {
  test('rotates through the athlete’s own things by day (variable, not random)', () => {
    const d = (n) => new Date(2026, 10, n, 12);
    const kinds = [20, 21, 22, 23].map(n => pickWords(data, d(n)).kind);
    expect(new Set(kinds)).toEqual(new Set(['card', 'cue', 'journal', 'lesson']));
    expect(pickWords(data, d(20))).toEqual(pickWords(data, d(20)));
    expect(pickWords({ focusCards: [], savedCues: [], takeForwards: [], practiceOutcomes: [] })).toBeNull();
    expect(pickWords(null)).toBeNull();
  });

  test('the journal line links to that entry; nothing saved → no card', async () => {
    apiFetch.mockResolvedValue({ ok: true, json: async () => ({ takeForwards: data.takeForwards }) });
    render(<MemoryRouter><YourWordsCard /></MemoryRouter>);
    const card = await screen.findByTestId('your-words');
    expect(card.getAttribute('href')).toBe('/mind-journal/j1');
    expect(card.textContent).toMatch(/You wrote/);
    expect(card.textContent).toMatch(/“Start slower in warm-up”/);
    cleanup();
    apiFetch.mockResolvedValue({ ok: true, json: async () => ({}) });
    render(<MemoryRouter><YourWordsCard /></MemoryRouter>);
    await new Promise(r => setTimeout(r, 20));
    expect(screen.queryByTestId('your-words')).toBeNull();
  });
});
