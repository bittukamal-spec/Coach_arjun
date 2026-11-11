// "Your practice from Arjun" on Home — real component, real router.

import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom';

vi.mock('../src/contexts/AuthContext', () => ({
  useAuth: () => ({ user: { name: 'Test Athlete' }, token: 'test-token', language: 'en' }),
}));
vi.mock('../src/api', () => ({ apiFetch: vi.fn() }));

const { apiFetch } = await import('../src/api');
const { default: CurrentPracticeCard, isPracticeOpen } =
  await import('../src/components/home/CurrentPracticeCard.jsx');

const BASE = {
  prescriptionId: 'presc-1',
  practiceKey: 'pressure_reset',
  situation: 'the first over of a match',
  cardContent: 'Breathe in for 4, out for 6. Three rounds.',
  cueWord: 'Settle',
  status: 'ACTIVE',
  completedAt: null,
  outcomeStatus: null,
};

function respondWith(prescription, ok = true) {
  apiFetch.mockResolvedValue({ ok, json: async () => ({ prescription }) });
}

function Probe() {
  const location = useLocation();
  return <p data-testid="probe">{location.pathname}|{JSON.stringify(location.state ?? null)}</p>;
}

function App() {
  return (
    <MemoryRouter initialEntries={['/dashboard']}>
      <Routes>
        <Route path="/dashboard" element={<CurrentPracticeCard />} />
        <Route path="/body-reset" element={<Probe />} />
        <Route path="/coaching" element={<Probe />} />
      </Routes>
    </MemoryRouter>
  );
}

beforeEach(() => { apiFetch.mockReset(); });
afterEach(() => cleanup());

describe('CurrentPracticeCard', () => {
  test('shows the practice Coach gave, with its situation and cue', async () => {
    respondWith(BASE);
    render(<App />);
    expect(await screen.findByText('Your practice from Arjun')).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Pressure Reset' })).toBeTruthy();
    expect(screen.getByText('For: the first over of a match')).toBeTruthy();
    expect(screen.getByText('Settle')).toBeTruthy();
    expect(apiFetch.mock.calls.map(c => c[0])).toEqual(['/api/prescriptions/active']);
  });

  test('the steps are hidden until the athlete asks for them', async () => {
    respondWith(BASE);
    render(<App />);
    const toggle = await screen.findByRole('button', { name: /Show the steps/ });
    expect(screen.queryByText(/Breathe in for 4/)).toBeNull();
    await userEvent.click(toggle);
    expect(screen.getByText(/Breathe in for 4/)).toBeTruthy();
  });

  test('Start practice opens the tool carrying the exact prescription link', async () => {
    respondWith(BASE);
    render(<App />);
    await userEvent.click(await screen.findByRole('button', { name: 'Start practice' }));
    expect(screen.getByTestId('probe').textContent)
      .toBe('/body-reset|{"prescriptionId":"presc-1","practiceKey":"pressure_reset"}');
  });

  test('a practice with no in-app flow offers only "Tell Arjun how it went"', async () => {
    respondWith({ ...BASE, practiceKey: 'acclimatization_homework' });
    render(<App />);
    await screen.findByText('Pressure practice in training');
    expect(screen.queryByRole('button', { name: 'Start practice' })).toBeNull();
    await userEvent.click(screen.getByRole('link', { name: 'Tell Arjun how it went' }));
    expect(screen.getByTestId('probe').textContent).toBe('/coaching|null');
  });

  test('a practice already done in the app asks only for the follow-up', async () => {
    respondWith({ ...BASE, status: 'COMPLETED' });
    render(<App />);
    expect(await screen.findByText('Practice done')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Start practice' })).toBeNull();
    expect(screen.getByRole('link', { name: 'Tell Arjun how it went' })).toBeTruthy();
  });

  test('renders nothing with no practice, a final result, or a failed request', async () => {
    for (const setup of [
      () => respondWith(null),
      () => respondWith({ ...BASE, outcomeStatus: 'HELPED' }),
      () => respondWith(BASE, false),
      () => apiFetch.mockRejectedValue(new Error('offline')),
    ]) {
      setup();
      const { container } = render(<App />);
      await new Promise(r => setTimeout(r, 0));
      expect(container.textContent).toBe('');
      cleanup();
    }
  });

  test('isPracticeOpen keeps replaceable results open and closes final ones', () => {
    expect(isPracticeOpen(BASE)).toBe(true);
    expect(isPracticeOpen({ ...BASE, outcomeStatus: 'NOT_TRIED' })).toBe(true);
    expect(isPracticeOpen({ ...BASE, outcomeStatus: 'HELPED_A_LITTLE' })).toBe(true);
    expect(isPracticeOpen({ ...BASE, outcomeStatus: 'DID_NOT_HELP' })).toBe(false);
    expect(isPracticeOpen({ ...BASE, status: 'SUPERSEDED' })).toBe(false);
    expect(isPracticeOpen(null)).toBe(false);
  });
});
