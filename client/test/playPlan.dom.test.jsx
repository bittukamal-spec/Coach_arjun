// Hook fix 3 (docs/HOOK-AUDIT.md #3): "Take it into play" — an if–then plan
// at the end of a practice that comes back before and after the match.
import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

vi.mock('../src/contexts/AuthContext', () => ({
  useAuth: () => ({ user: { name: 'Rohan', sport: 'cricket' }, token: 't', language: 'en' }),
}));
vi.mock('../src/api', () => ({ apiFetch: vi.fn() }));

const { apiFetch } = await import('../src/api');
const { default: PlayPlanCard } = await import('../src/components/path/PlayPlanCard');
const { default: MatchReviewCard } = await import('../src/components/match/MatchReviewCard');
const respond = (body) => ({ ok: true, json: async () => body });

beforeEach(() => apiFetch.mockReset());
afterEach(() => cleanup());

describe('PlayPlanCard', () => {
  test('Quick Rep: sport-aware moments, plan preview, one tap saves the plan', async () => {
    apiFetch.mockResolvedValue(respond({ match: { nextDay: null }, plan: { tool: 'rep', moment: 'before_each', cue: 'Next ball' } }));
    render(<PlayPlanCard tool="rep" cue="Next ball" />);
    expect(screen.getByText('When will you say your word?')).toBeTruthy();
    fireEvent.click(screen.getByRole('radio', { name: 'Before each ball' }));
    expect(screen.getByText('Before each ball → say “Next ball”.')).toBeTruthy();
    fireEvent.click(screen.getByTestId('plan-save'));
    await waitFor(() => expect(apiFetch).toHaveBeenCalledWith('/api/path/plan', expect.objectContaining({
      method: 'PUT', body: JSON.stringify({ tool: 'rep', moment: 'before_each', cue: 'Next ball' }),
    })));
    expect(await screen.findByText(/Plan saved/)).toBeTruthy();
    expect(screen.getByRole('button', { name: /Add your match day/ })).toBeTruthy();
  });

  test('Pressure Reset sends no cue; Not now hides the card and saves nothing', () => {
    render(<PlayPlanCard tool="reset" />);
    expect(screen.getByText('Before I start → 3 slow breaths, long breath out.')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Not now' }));
    expect(screen.queryByTestId('play-plan')).toBeNull();
    expect(apiFetch).not.toHaveBeenCalled();
  });

  test('a cue plan without a cue is not offered', () => {
    render(<PlayPlanCard tool="rep" cue="" />);
    expect(screen.queryByTestId('play-plan')).toBeNull();
  });
});

describe('the plan comes back after the match', () => {
  test('"How did it go?" asks about the plan itself', () => {
    const path = { finished: false, currentKey: 'focus', chapters: [], match: { nextDay: '2026-11-21' }, plan: { tool: 'rep', moment: 'after_miss', cue: 'Next ball' } };
    render(<MemoryRouter><MatchReviewCard path={path} reviewMatch={vi.fn()} onNextMatch={vi.fn()} /></MemoryRouter>);
    fireEvent.click(screen.getByRole('radio', { name: 'Went well' }));
    expect(screen.getByText('Did you use your plan?')).toBeTruthy();
    expect(screen.getByTestId('review-plan').textContent).toBe('After a miss → say “Next ball”, then focus on the next ball.');
  });
});
