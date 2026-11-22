// Learning path on Profile + chapter + lesson (docs/PATH-STRATEGY.md).
import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';

vi.mock('../src/contexts/AuthContext', () => ({
  useAuth: () => ({ user: { name: 'Rohan' }, token: 't', language: 'en' }),
}));
vi.mock('../src/api', () => ({ apiFetch: vi.fn() }));

const { apiFetch } = await import('../src/api');
const { default: PathSection } = await import('../src/components/path/PathSection');
const { default: PathChapterPage } = await import('../src/pages/PathChapterPage');
const { default: PathLessonPage } = await import('../src/pages/PathLessonPage');

const step = (done, outcome = null) => ({ done, outcome, at: done ? '2026-11-20T10:00:00Z' : null });
function makePath({ calmDone = true, focusSteps = { learn: true, practise: true, play: false, reflect: false } } = {}) {
  const focus = { key: 'focus', status: 'current', doneCount: 2, steps: Object.fromEntries(Object.entries(focusSteps).map(([k, v]) => [k, step(v)])) };
  const calm = { key: 'calm', status: calmDone ? 'done' : 'current', doneCount: 4, steps: { learn: step(true), practise: step(true), play: step(true, 'helped'), reflect: step(true) } };
  const locked = ['confidence', 'routine', 'bounce', 'picture'].map(key => ({ key, status: 'locked', doneCount: 0, steps: { learn: step(false), practise: step(false), play: step(false), reflect: step(false) } }));
  const nextStep = Object.entries(focusSteps).find(([, v]) => !v)?.[0];
  return { chapters: [calm, focus, ...locked], currentKey: 'focus', finished: false, next: { chapterKey: 'focus', stepKey: nextStep } };
}
const respond = (body) => ({ ok: true, json: async () => body });

beforeEach(() => apiFetch.mockReset());
afterEach(() => cleanup());

describe('Profile path section', () => {
  test('shows done, current and locked chapters and one Next button for the next step', async () => {
    apiFetch.mockResolvedValue(respond(makePath()));
    render(<MemoryRouter><PathSection /></MemoryRouter>);
    expect(await screen.findByText('Your path')).toBeTruthy();
    expect(screen.getByText('Chapter 2 of 6')).toBeTruthy();
    expect(screen.getByText('It helped')).toBeTruthy();
    expect(screen.getByTestId('path-current').getAttribute('href')).toBe('/path/focus');
    const next = screen.getByTestId('path-next');
    expect(next.textContent).toMatch(/use it in a match or training/);
    expect(next.getAttribute('href')).toBe('/path/focus');
  });

  test('the Next button goes to the lesson, the drill or the journal depending on the step', async () => {
    apiFetch.mockResolvedValue(respond(makePath({ focusSteps: { learn: false, practise: false, play: false, reflect: false } })));
    render(<MemoryRouter><PathSection /></MemoryRouter>);
    expect((await screen.findByTestId('path-next')).getAttribute('href')).toBe('/path/focus/learn');
    cleanup();
    apiFetch.mockResolvedValue(respond(makePath({ focusSteps: { learn: true, practise: false, play: false, reflect: false } })));
    render(<MemoryRouter><PathSection /></MemoryRouter>);
    expect((await screen.findByTestId('path-next')).getAttribute('href')).toBe('/mental-rep');
    cleanup();
    apiFetch.mockResolvedValue(respond(makePath({ focusSteps: { learn: true, practise: true, play: true, reflect: false } })));
    render(<MemoryRouter><PathSection /></MemoryRouter>);
    expect((await screen.findByTestId('path-next')).getAttribute('href')).toBe('/path/focus/reflect');
  });
});

describe('Chapter page', () => {
  test('marks "used it in play" with the chosen outcome', async () => {
    apiFetch.mockImplementation((url, init) => Promise.resolve(respond(
      init?.method === 'POST' ? makePath({ focusSteps: { learn: true, practise: true, play: true, reflect: false } }) : makePath(),
    )));
    render(<MemoryRouter initialEntries={['/path/focus']}><Routes><Route path="/path/:chapterKey" element={<PathChapterPage />} /></Routes></MemoryRouter>);
    fireEvent.click(await screen.findByRole('button', { name: 'Yes — it helped' }));
    await waitFor(() => {
      const post = apiFetch.mock.calls.find(([u, i]) => u === '/api/path/steps' && i.method === 'POST');
      expect(JSON.parse(post[1].body)).toEqual({ chapterKey: 'focus', stepKey: 'play', outcome: 'helped' });
    });
    expect(await screen.findByRole('link', { name: 'Write it now' })).toBeTruthy();
  });
});

describe('Lesson page', () => {
  test('walks the cards one by one and marks Learn at the end', async () => {
    apiFetch.mockImplementation((url, init) => Promise.resolve(respond(makePath())));
    render(<MemoryRouter initialEntries={['/path/calm/learn']}><Routes>
      <Route path="/path/:chapterKey/learn" element={<PathLessonPage />} />
      <Route path="/path/:chapterKey" element={<p>chapter page</p>} />
    </Routes></MemoryRouter>);
    expect(screen.getByText(/That is your body getting ready to play/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    expect(screen.getByText('Long breath out = calm body.')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Got it' }));
    expect(await screen.findByText('chapter page')).toBeTruthy();
    const post = apiFetch.mock.calls.find(([u, i]) => u === '/api/path/steps' && i?.method === 'POST');
    expect(JSON.parse(post[1].body)).toEqual({ chapterKey: 'calm', stepKey: 'learn' });
  });
});

describe('Hook fix 1: next step on Home + chapter unlocked', () => {
  test('takeNewlyFinished celebrates only chapters finished after the first look', async () => {
    const { takeNewlyFinished } = await import('../src/components/path/pathData');
    localStorage.removeItem('arjun_path_seen');
    const p1 = makePath();
    expect(takeNewlyFinished(p1)).toBe(null); // first run: calm already done, not celebrated
    const p2 = { ...p1, chapters: p1.chapters.map(c => (c.key === 'focus' ? { ...c, status: 'done' } : c)) };
    expect(takeNewlyFinished(p2)).toBe('focus');
    expect(takeNewlyFinished(p2)).toBe(null); // only once
  });

  test('Home shows the next step only when the Mind Challenge card is not showing', async () => {
    const { default: PathNextCard } = await import('../src/components/home/PathNextCard');
    localStorage.setItem('arjun_path_seen', JSON.stringify({ done: ['calm'] }));
    apiFetch.mockImplementation((url) => Promise.resolve(respond(url === '/api/path' ? makePath() : { latest: { mindLevel: 2 }, canTake: false })));
    render(<MemoryRouter><PathNextCard /></MemoryRouter>);
    const card = await screen.findByTestId('home-path-next');
    expect(card.textContent).toMatch(/Your next step · Focus 3\/4/);
    expect(card.getAttribute('href')).toBe('/path/focus');
    cleanup();
    apiFetch.mockImplementation((url) => Promise.resolve(respond(url === '/api/path' ? makePath() : { latest: null, canTake: true })));
    render(<MemoryRouter><PathNextCard /></MemoryRouter>);
    await new Promise(r => setTimeout(r, 0));
    expect(screen.queryByTestId('home-path-next')).toBeNull();
  });
});
