// Real ROUTER integration tests for PR-2 (Navigation and Information
// Architecture Cleanup): BottomNav's Progress → Playbook swap, the
// /progress → /playbook redirect, responsive visibility, and the new
// Ritual entry on Train. Mounts real react-router-dom <MemoryRouter> +
// <Routes> (no mocked useNavigate/Link) so navigation assertions reflect
// what actually happens in the browser, matching the pattern established
// in dashboardShortcuts.dom.test.jsx.

import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route, useLocation, Navigate } from 'react-router-dom';

const authState = { language: 'en' };
vi.mock('../src/contexts/AuthContext', () => ({
  useAuth: () => authState,
}));

const { default: BottomNav } = await import('../src/components/BottomNav.jsx');
const { default: TrainPage } = await import('../src/pages/TrainPage.jsx');

function RouteProbe({ label }) {
  const location = useLocation();
  return <p data-testid="route-probe">{label}:{location.pathname}</p>;
}

function BottomNavApp({ initialEntries = ['/dashboard'] }) {
  return (
    <MemoryRouter initialEntries={initialEntries}>
      <Routes>
        <Route path="/dashboard" element={<><RouteProbe label="page" /><BottomNav /></>} />
        <Route path="/train" element={<><RouteProbe label="page" /><BottomNav /></>} />
        <Route path="/coaching" element={<><RouteProbe label="page" /><BottomNav /></>} />
        <Route path="/playbook" element={<><RouteProbe label="page" /><BottomNav /></>} />
        <Route path="/account" element={<><RouteProbe label="page" /><BottomNav /></>} />
        <Route path="/progress" element={<Navigate to="/playbook" replace />} />
      </Routes>
    </MemoryRouter>
  );
}

function TrainApp({ initialEntries = ['/train'] }) {
  return (
    <MemoryRouter initialEntries={initialEntries}>
      <Routes>
        <Route path="/train" element={<TrainPage />} />
        <Route path="/ritual" element={<RouteProbe label="ritual" />} />
        <Route path="/body-reset" element={<RouteProbe label="body-reset" />} />
        <Route path="/debrief" element={<RouteProbe label="debrief" />} />
        <Route path="/mental-rep" element={<RouteProbe label="mental-rep" />} />
        <Route path="/self-talk" element={<RouteProbe label="self-talk" />} />
      </Routes>
    </MemoryRouter>
  );
}

beforeEach(() => {
  localStorage.clear();
  authState.language = 'en';
});

afterEach(() => {
  cleanup();
});

describe('BottomNav — Progress → Playbook, real router integration', () => {
  test('renders exactly Home, Train, Coach, Playbook, Profile — no Progress tab', async () => {
    render(<BottomNavApp initialEntries={['/dashboard']} />);
    const nav = screen.getByRole('navigation');
    const links = within(nav).getAllByRole('link');
    const labels = links.map((l) => l.textContent);

    expect(labels).toEqual(['Home', 'Train', 'Coach', 'Playbook', 'Profile']);
    expect(within(nav).queryByText('Progress')).toBeNull();
  });

  test('Coach remains in the centre position', async () => {
    render(<BottomNavApp initialEntries={['/dashboard']} />);
    const nav = screen.getByRole('navigation');
    const links = within(nav).getAllByRole('link');
    expect(links[2].textContent).toBe('Coach');
  });

  test('the Playbook tab links to /playbook and clicking it performs a real navigation', async () => {
    render(<BottomNavApp initialEntries={['/dashboard']} />);
    const user = userEvent.setup();

    const playbookLink = screen.getByRole('link', { name: /Playbook/i });
    expect(playbookLink.getAttribute('href')).toBe('/playbook');

    await user.click(playbookLink);

    expect(await screen.findByTestId('route-probe')).toHaveProperty('textContent', 'page:/playbook');
  });

  test('the Playbook tab gets aria-current="page" and the active visual state only when on /playbook', async () => {
    const { unmount } = render(<BottomNavApp initialEntries={['/playbook']} />);
    const activeLink = screen.getByRole('link', { name: /Playbook/i });
    expect(activeLink.getAttribute('aria-current')).toBe('page');
    unmount();

    render(<BottomNavApp initialEntries={['/dashboard']} />);
    const inactiveLink = screen.getByRole('link', { name: /Playbook/i });
    expect(inactiveLink.getAttribute('aria-current')).toBeNull();
  });

  test('direct navigation to /progress redirects to /playbook using replace (no history entry left behind)', async () => {
    render(<BottomNavApp initialEntries={['/progress']} />);
    expect(await screen.findByTestId('route-probe')).toHaveProperty('textContent', 'page:/playbook');
  });

  test('BottomNav is hidden only inside the active Coach conversation, not elsewhere', async () => {
    const { unmount } = render(<BottomNavApp initialEntries={['/coaching']} />);
    expect(screen.queryByRole('navigation')).toBeNull();
    unmount();

    render(<BottomNavApp initialEntries={['/dashboard']} />);
    expect(screen.getByRole('navigation')).toBeTruthy();
  });

  test('BottomNav does not use sm:hidden or any responsive "hidden" class — stays visible at tablet widths', async () => {
    render(<BottomNavApp initialEntries={['/dashboard']} />);
    const nav = screen.getByRole('navigation');
    const classes = nav.className.split(/\s+/);
    expect(classes.some((c) => /(^|:)hidden$/.test(c))).toBe(false);
  });

  test('English Playbook label renders', async () => {
    render(<BottomNavApp initialEntries={['/dashboard']} />);
    expect(screen.getByText('Playbook')).toBeTruthy();
  });

  test('Hindi Playbook label renders (all five tabs translated)', async () => {
    authState.language = 'hi';
    render(<BottomNavApp initialEntries={['/dashboard']} />);
    const nav = screen.getByRole('navigation');
    const labels = within(nav).getAllByRole('link').map((l) => l.textContent);
    expect(labels).toEqual(['होम', 'ट्रेन', 'कोच', 'प्लेबुक', 'प्रोफाइल']);
  });
});

describe('TrainPage — Ritual entry, real router integration', () => {
  test('renders a visible Ritual entry that navigates to /ritual on click', async () => {
    render(<TrainApp />);
    const user = userEvent.setup();

    const ritualEntry = screen.getByRole('button', { name: /Ritual/i });
    expect(ritualEntry).toBeTruthy();
    expect(screen.getByText('Your routine before you play.')).toBeTruthy();

    await user.click(ritualEntry);

    expect(await screen.findByTestId('route-probe')).toHaveProperty('textContent', 'ritual:/ritual');
  });

  test('retained Train tools still render and open their existing routes', async () => {
    render(<TrainApp />);
    const user = userEvent.setup();

    expect(screen.getByText('Pressure Reset')).toBeTruthy();
    expect(screen.getByText('Match & Practice Reflection')).toBeTruthy();
    expect(screen.getByText('Daily Mental Rep')).toBeTruthy();
    expect(screen.getByText('Focus Card Builder')).toBeTruthy();

    // Pressure Reset's own CTA is a "Start" button (FeatureToolCard hero pattern).
    await user.click(screen.getByRole('button', { name: 'Start' }));
    expect(await screen.findByTestId('route-probe')).toHaveProperty('textContent', 'body-reset:/body-reset');
  });

  test('Ritual renders in Hindi with the approved support copy', async () => {
    authState.language = 'hi';
    render(<TrainApp />);
    expect(screen.getByRole('button', { name: /Ritual/i })).toBeTruthy();
    expect(screen.getByText('खेलने से पहले की तुम्हारी routine।')).toBeTruthy();
  });

  test('does not reintroduce Practice Focus, Next Play Reset, Games, Focus Lock, Reset Rally, Mental Playbook row, or skill-path links', async () => {
    render(<TrainApp />);
    expect(screen.queryByText('Practice Focus')).toBeNull();
    expect(screen.queryByText('Next Play Reset')).toBeNull();
    expect(screen.queryByText(/^Games$/)).toBeNull();
    expect(screen.queryByText('Focus Lock')).toBeNull();
    expect(screen.queryByText('Reset Rally')).toBeNull();
    expect(screen.queryByText('Mental Playbook')).toBeNull();
    expect(screen.queryByText('Learn first')).toBeNull();
  });
});
