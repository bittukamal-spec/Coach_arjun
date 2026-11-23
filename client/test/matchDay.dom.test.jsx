// Hook fix 2 (docs/HOOK-AUDIT.md #2): next match on Home — the chip, the
// day-before prep card, and "How did it go?" which ticks the Play step.
import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

vi.mock('../src/contexts/AuthContext', () => ({
  useAuth: () => ({ user: { name: 'Rohan' }, token: 't', language: 'en' }),
}));
vi.mock('../src/api', () => ({ apiFetch: vi.fn() }));

const { apiFetch } = await import('../src/api');
const { default: HomePathArea } = await import('../src/components/home/HomePathArea');
const { default: ToolsPage } = await import('../src/pages/ToolsPage');
const { matchPhase, dayKey } = await import('../src/components/path/pathData');

const step = (done, outcome = null) => ({ done, outcome, at: done ? '2026-11-20T10:00:00Z' : null });
const shift = (n) => { const d = new Date(); return dayKey(new Date(d.getFullYear(), d.getMonth(), d.getDate() + n)); };
function makePath(nextDay, playDone = false) {
  const bounce = { key: 'bounce', status: 'current', doneCount: 2, steps: { learn: step(true), practise: step(true), play: step(playDone, playDone ? 'helped' : null), reflect: step(false) } };
  const rest = ['calm', 'focus', 'confidence', 'routine', 'picture'].map(key => ({ key, status: 'locked', doneCount: 0, steps: { learn: step(false), practise: step(false), play: step(false), reflect: step(false) } }));
  return { chapters: [bounce, ...rest], currentKey: 'bounce', finished: false, next: { chapterKey: 'bounce', stepKey: playDone ? 'reflect' : 'play' }, match: { nextDay, lastDay: null, lastFeel: null } };
}
const respond = (body) => ({ ok: true, json: async () => body });
function serve(path, cards = []) {
  apiFetch.mockImplementation((url, init) => {
    if (url === '/api/mind-challenge') return Promise.resolve(respond({ latest: { mindLevel: 2 }, canTake: false }));
    if (url === '/api/self-talk/cards') return Promise.resolve(respond(cards));
    if (url === '/api/path/match/review') return Promise.resolve(respond({ ...makePath(null, true), match: { nextDay: null, lastDay: path.match.nextDay, lastFeel: 'mixed' } }));
    if (url === '/api/path/match') return Promise.resolve(respond(makePath(JSON.parse(init.body).day)));
    return Promise.resolve(respond(path));
  });
}

beforeEach(() => { apiFetch.mockReset(); localStorage.clear(); });
afterEach(() => cleanup());

describe('next match on Home', () => {
  test('match phase follows the calendar day', () => {
    expect(matchPhase(null)).toBe('none');
    expect(matchPhase(shift(3))).toBe('ahead');
    expect(matchPhase(shift(1))).toBe('tomorrow');
    expect(matchPhase(shift(0))).toBe('today');
    expect(matchPhase(shift(-2))).toBe('review');
    expect(matchPhase(shift(-5))).toBe('stale');
  });

  test('no match yet: next step + "Add your next match" chip → the day picker saves the day', async () => {
    serve(makePath(null));
    render(<MemoryRouter><HomePathArea /></MemoryRouter>);
    fireEvent.click(await screen.findByTestId('match-chip'));
    expect(screen.getByTestId('match-sheet')).toBeTruthy();
    const tomorrow = shift(1);
    fireEvent.click(screen.getAllByRole('radio')[1]);
    // What kind of match (optional)
    fireEvent.click(screen.getByRole('radio', { name: 'Selection / trial' }));
    fireEvent.click(screen.getByTestId('match-save'));
    await waitFor(() => expect(apiFetch).toHaveBeenCalledWith('/api/path/match', expect.objectContaining({ method: 'PUT', body: JSON.stringify({ day: tomorrow, type: 'selection' }) })));
    expect(await screen.findByTestId('home-match-chip')).toBeTruthy();
    expect(screen.queryByTestId('match-prep')).toBeNull();
  });

  test('Home shows only a one-line chip that opens Tools', async () => {
    serve(makePath(shift(1)));
    render(<MemoryRouter><HomePathArea /></MemoryRouter>);
    const chip = await screen.findByTestId('home-match-chip');
    expect(chip.getAttribute('href')).toBe('/tools');
    expect(chip.textContent).toMatch(/Match tomorrow · Your prep/);
    expect(screen.queryByTestId('match-prep')).toBeNull();
  });

  test('the day before, on Tools: prep card with their Focus Card words, the chapter skill and Talk it through', async () => {
    serve(makePath(shift(1)), [{ focusWord: 'Next ball' }]);
    render(<MemoryRouter><ToolsPage /></MemoryRouter>);
    expect(await screen.findByText('Ready for tomorrow?')).toBeTruthy();
    expect(await screen.findByText('Read your card: “Next ball”')).toBeTruthy();
    expect(screen.getByText('Your plan: the 5-second reset').closest('a').getAttribute('href')).toBe('/path/bounce');
    expect(screen.getByText('Talk it through with Arjun').closest('a').getAttribute('href')).toBe('/coaching');
    expect(screen.getByTestId('tools-before')).toBeTruthy();
  });

  test('after the match, on Tools: "After you play" comes first; two taps — "It helped" ticks Play', async () => {
    serve(makePath(shift(-1)));
    render(<MemoryRouter><ToolsPage /></MemoryRouter>);
    const mixed = await screen.findByRole('radio', { name: 'Mixed' });
    const sections = screen.getAllByRole('heading', { level: 2 }).map(h => h.textContent);
    expect(sections[0]).toBe('After you play');
    fireEvent.click(mixed);
    fireEvent.click(screen.getByRole('button', { name: 'It helped' }));
    await waitFor(() => expect(apiFetch).toHaveBeenCalledWith('/api/path/match/review', expect.objectContaining({ body: JSON.stringify({ feel: 'mixed', used: 'helped' }) })));
    expect(await screen.findByText('✓ Done — you used Bounce back in a match.')).toBeTruthy();
    expect(screen.getByText('Tell Arjun more').closest('a').getAttribute('href')).toBe('/coaching');
    expect(screen.getByRole('button', { name: 'Next match?' })).toBeTruthy();
  });
});

describe('path Reflect step (founder feedback: no "What are you reflecting on?")', () => {
  test('one screen that knows the chapter: tap a feeling, optional line, saves a quick note and returns to Train', async () => {
    const { default: PathReflectPage } = await import('../src/pages/PathReflectPage');
    const { Routes, Route } = await import('react-router-dom');
    apiFetch.mockResolvedValue({ ok: true, json: async () => ({ entry: { id: 'e1' } }) });
    render(
      <MemoryRouter initialEntries={['/path/focus/reflect']}>
        <Routes>
          <Route path="/path/:chapterKey/reflect" element={<PathReflectPage />} />
          <Route path="/train" element={<p>train page</p>} />
        </Routes>
      </MemoryRouter>,
    );
    expect(screen.getByText('How did your focus word go?')).toBeTruthy();
    expect(screen.queryByText(/What are you reflecting on/)).toBeNull();
    expect(screen.getByTestId('reflect-save').disabled).toBe(true);
    fireEvent.click(screen.getByRole('radio', { name: 'Focused' }));
    fireEvent.change(screen.getByLabelText(/One line/), { target: { value: 'Said next ball every time' } });
    fireEvent.click(screen.getByTestId('reflect-save'));
    await waitFor(() => expect(apiFetch).toHaveBeenCalledWith('/api/mind-journal', expect.objectContaining({
      method: 'POST', body: JSON.stringify({ entryType: 'QUICK_NOTE', states: ['focused'], note: 'Said next ball every time' }),
    })));
    expect(await screen.findByText('train page')).toBeTruthy();
  });
});
