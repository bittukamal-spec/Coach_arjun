// Onboarding v2 (Nov 2026): what the athlete told Arjun changes the app —
// a "Start here" tool on Tools and "What Arjun knows" on the profile.
import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

vi.mock('../src/contexts/AuthContext', () => ({
  useAuth: () => ({ user: { name: 'Rohan', sport: 'cricket' }, token: 't', language: 'en' }),
}));
vi.mock('../src/api', () => ({ apiFetch: vi.fn() }));
const { apiFetch } = await import('../src/api');
const { default: ToolsPage } = await import('../src/pages/ToolsPage');
const { default: ArjunKnows } = await import('../src/components/path/ArjunKnows');

const step = () => ({ done: false, outcome: null, at: null });
const path = (personal) => ({
  chapters: [{ key: 'bounce', status: 'current', doneCount: 0, steps: { learn: step(), practise: step(), play: step(), reflect: step() } }],
  currentKey: 'bounce', finished: false, next: { chapterKey: 'bounce', stepKey: 'learn' },
  match: { nextDay: null }, plan: null, personal,
});
const serve = (p) => apiFetch.mockImplementation(() => Promise.resolve({ ok: true, json: async () => p }));

beforeEach(() => apiFetch.mockReset());
afterEach(() => cleanup());

describe('personalised from onboarding', () => {
  test('Tools explains the best tool to start with (thoughts → Self-Talk Cards)', async () => {
    serve(path({ firstSignal: 'thoughts', pressures: [], helps: [], trainingTime: null }));
    render(<MemoryRouter><ToolsPage /></MemoryRouter>);
    const best = await screen.findByTestId('tools-best');
    expect(best.getAttribute('href')).toBe('/self-talk');
    expect(best.textContent).toMatch(/Best for you/);
    expect(best.textContent).toMatch(/You said pressure shows up first in your thoughts/);
  });

  test('no first signal → no badge', async () => {
    serve(path({ firstSignal: null, pressures: [], helps: [], trainingTime: null }));
    render(<MemoryRouter><ToolsPage /></MemoryRouter>);
    await screen.findByTestId('tools-before');
    expect(screen.queryByTestId('tools-best')).toBeNull();
  });

  test('profile shows each answer and what it changes, with Change links', async () => {
    serve(path({ firstSignal: 'body', pressures: ['family_expectations', 'selection_pressure'], helps: ['music', 'slow_breathing'], trainingTime: 'evening' }));
    render(<MemoryRouter><ArjunKnows /></MemoryRouter>);
    expect(await screen.findByText('What Arjun knows — and what it does with it')).toBeTruthy();
    expect(screen.getByText('Bounce back')).toBeTruthy();
    expect(screen.getByText('My body')).toBeTruthy();
    expect(screen.getByText('→ Pressure Reset comes first')).toBeTruthy();
    expect(screen.getByText('Family expectations · Selection pressure')).toBeTruthy();
    expect(screen.getByText('Music · Slow breathing')).toBeTruthy();
    expect(screen.getByText(/Reminders around 4 pm/)).toBeTruthy();
    const links = screen.getAllByRole('link', { name: 'Change' }).map(a => a.getAttribute('href'));
    expect(links[0]).toBe('/starting-profile/check-in?section=pressure');
    expect(links[1]).toBe('/starting-profile/check-in?section=personal');
  });
});
