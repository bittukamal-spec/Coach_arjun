// Mind Challenge (Hook Model): Home trigger, rounds with a reveal, the card.
import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

vi.mock('../src/contexts/AuthContext', () => ({
  useAuth: () => ({ user: { name: 'Rohan Sharma', sport: 'cricket' }, token: 't', language: 'en' }),
}));
vi.mock('../src/api', () => ({ apiFetch: vi.fn() }));

const { apiFetch } = await import('../src/api');
const { default: MindChallengePage } = await import('../src/pages/MindChallengePage');
const { default: MindChallengeHomeCard } = await import('../src/components/home/MindChallengeHomeCard');
const { levelFromPoints } = await import('../src/components/path/mindChallengeData');
const { focusGamePoints } = await import('../src/components/path/FocusGame');

const respond = (body) => Promise.resolve({ ok: true, json: async () => body });
const LATEST = { id: 'r1', levels: { calm: 2, focus: 5, confidence: 3, routine: 1, bounce: 3, picture: 2 }, mindLevel: 3, strongest: 'focus', growFirst: 'routine', focusSkill: null, createdAt: '2026-11-20T10:00:00Z' };

beforeEach(() => apiFetch.mockReset());
afterEach(() => cleanup());

test('scoring helpers match the server and the mini-game', () => {
  expect([0, 1, 2, 3, 4, 5, 6].map(levelFromPoints)).toEqual([1, 1, 2, 3, 3, 4, 5]);
  expect([focusGamePoints(9, 0), focusGamePoints(6, 1), focusGamePoints(3, 1), focusGamePoints(1, 2)]).toEqual([3, 2, 1, 0]);
});

describe('Home trigger card', () => {
  test('shows "New" before the first challenge and hides when none can be played', async () => {
    apiFetch.mockImplementation(() => respond({ latest: null, previous: null, nextAt: null, canTake: true }));
    render(<MemoryRouter><MindChallengeHomeCard /></MemoryRouter>);
    expect((await screen.findByTestId('home-mind-challenge')).textContent).toMatch(/Find out how strong your mind game is/);
    // Plain language for someone new to mental training: no jargon tag.
    expect(screen.getByTestId('home-mind-challenge').textContent).not.toMatch(/New ·/);
    cleanup();
    apiFetch.mockImplementation(() => respond({ latest: LATEST, previous: null, nextAt: '2099-01-01T00:00:00Z', canTake: false }));
    render(<MemoryRouter><MindChallengeHomeCard /></MemoryRouter>);
    await new Promise(r => setTimeout(r, 0));
    expect(screen.queryByTestId('home-mind-challenge')).toBeNull();
  });

  test('turns into the rematch card when the rematch is ready', async () => {
    apiFetch.mockImplementation(() => respond({ latest: LATEST, previous: null, nextAt: '2026-01-01T00:00:00Z', canTake: true }));
    render(<MemoryRouter><MindChallengeHomeCard /></MemoryRouter>);
    expect((await screen.findByTestId('home-mind-challenge')).textContent).toMatch(/Take the Mind Challenge again/);
  });
});

describe('Challenge page', () => {
  test('one tap to start, then each round ends with a skill reveal', async () => {
    apiFetch.mockImplementation(() => respond({ latest: null, previous: null, nextAt: null, canTake: true }));
    render(<MemoryRouter><MindChallengePage /></MemoryRouter>);
    fireEvent.click(await screen.findByRole('button', { name: 'Start the challenge' }));
    expect(screen.getByText('Round 1 / 6')).toBeTruthy();
    const lockIn = screen.getByRole('button', { name: 'Next' });
    expect(lockIn.disabled).toBe(true);
    fireEvent.click(screen.getByRole('radio', { name: /I sleep well/ }));
    fireEvent.click(lockIn);
    fireEvent.click(screen.getByRole('radio', { name: /I take a slow breath/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    const reveal = screen.getByTestId('skill-reveal');
    expect(reveal.textContent).toMatch(/Calm/);
    expect(reveal.textContent).toMatch(/Level 5 of 5/);
    expect(screen.getByText('5 rounds to go')).toBeTruthy();
  });

  test('when the rematch is not open yet, the card shows with the days left', async () => {
    const nextAt = new Date(Date.now() + 5 * 86400000).toISOString();
    apiFetch.mockImplementation(() => respond({ latest: LATEST, previous: null, nextAt, canTake: false }));
    render(<MemoryRouter><MindChallengePage /></MemoryRouter>);
    expect(await screen.findByTestId('mind-stats-card')).toBeTruthy();
    expect(screen.getByText('Next challenge in 5 days')).toBeTruthy();
    expect(screen.getByText('Focus', { selector: 'p' })).toBeTruthy();
  });
});
