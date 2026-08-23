// Real ROUTER integration tests for navigation and information architecture:
// BottomNav's four destinations, the /playbook and /progress compatibility
// redirects, responsive visibility, and the Ritual entry on Train. Mounts
// real react-router-dom <MemoryRouter> + <Routes> (no mocked
// useNavigate/Link) so navigation assertions reflect what actually happens in
// the browser, matching the pattern established in
// dashboardShortcuts.dom.test.jsx.

import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route, useLocation, useNavigate, Navigate } from 'react-router-dom';

const authState = { language: 'en' };
vi.mock('../src/contexts/AuthContext', () => ({
  useAuth: () => authState,
}));

const { default: BottomNav } = await import('../src/components/BottomNav.jsx');
const { default: Navbar } = await import('../src/components/Navbar.jsx');
const { default: TrainPage } = await import('../src/pages/TrainPage.jsx');

function RouteProbe({ label }) {
  const location = useLocation();
  const navigate = useNavigate();
  return (
    <>
      <p data-testid="route-probe">{label}:{location.pathname}</p>
      {/* Real history back, so a redirect that left an entry behind would
          show up as a bounce rather than as a silent pass. */}
      <button type="button" onClick={() => navigate(-1)}>go back</button>
    </>
  );
}

function BottomNavApp({ initialEntries = ['/dashboard'] }) {
  return (
    <MemoryRouter initialEntries={initialEntries}>
      <Routes>
        <Route path="/dashboard" element={<><RouteProbe label="page" /><BottomNav /></>} />
        <Route path="/train" element={<><RouteProbe label="page" /><BottomNav /></>} />
        <Route path="/coaching" element={<><RouteProbe label="page" /><BottomNav /></>} />
        <Route path="/account" element={<><RouteProbe label="page" /><BottomNav /></>} />
        <Route path="/starting-profile" element={<><RouteProbe label="page" /><BottomNav /></>} />
        {/* Mirrors App.jsx: both retired surfaces resolve to Home. */}
        <Route path="/playbook" element={<Navigate to="/dashboard" replace />} />
        <Route path="/progress" element={<Navigate to="/dashboard" replace />} />
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
        <Route path="/body-reset/history" element={<RouteProbe label="reset-history" />} />
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
  authState.user = undefined;
});

afterEach(() => {
  cleanup();
});

describe('BottomNav — four destinations, real router integration', () => {
  test('renders exactly Home, Train, Coach, Profile — no Playbook or Progress tab', async () => {
    render(<BottomNavApp initialEntries={['/dashboard']} />);
    const nav = screen.getByRole('navigation');
    const links = within(nav).getAllByRole('link');
    const labels = links.map((l) => l.textContent);

    expect(labels).toEqual(['Home', 'Train', 'Coach', 'Profile']);
    expect(within(nav).queryByText('Playbook')).toBeNull();
    expect(within(nav).queryByText('Progress')).toBeNull();
    expect(nav.innerHTML).not.toMatch(/\/playbook/);
  });

  test('Coach keeps its position, and the four items each take an equal share of the bar', async () => {
    render(<BottomNavApp initialEntries={['/dashboard']} />);
    const nav = screen.getByRole('navigation');
    const links = within(nav).getAllByRole('link');
    expect(links[2].textContent).toBe('Coach');
    // Equal distribution comes from flex-1 per item, so dropping the fifth
    // item cannot leave a gap or an off-centre row at any width.
    for (const link of links) expect(link.className).toMatch(/(^|\s)flex-1(\s|$)/);
    expect(nav.querySelector('div').className).toMatch(/(^|\s)flex(\s|$)/);
  });

  test('every remaining tab links to its own destination and clicking it performs a real navigation', async () => {
    const cases = [
      [/Home/i, '/dashboard'],
      [/Train/i, '/train'],
      [/Coach/i, '/coaching'],
      [/Profile/i, '/starting-profile'],
    ];
    for (const [name, href] of cases) {
      const { unmount } = render(<BottomNavApp initialEntries={['/dashboard']} />);
      const user = userEvent.setup();
      const link = screen.getByRole('link', { name });
      expect(link.getAttribute('href')).toBe(href);
      await user.click(link);
      // Coach hides the bar, so only assert the landing route.
      expect(await screen.findByTestId('route-probe')).toHaveProperty('textContent', `page:${href}`);
      unmount();
    }
  });

  test('aria-current="page" marks exactly the tab whose route is open', async () => {
    for (const [route, activeName] of [
      ['/dashboard', /Home/i],
      ['/train', /Train/i],
      ['/starting-profile', /Profile/i],
    ]) {
      const { unmount } = render(<BottomNavApp initialEntries={[route]} />);
      const nav = screen.getByRole('navigation');
      const current = within(nav).getAllByRole('link').filter((l) => l.getAttribute('aria-current') === 'page');
      expect(current).toHaveLength(1);
      expect(within(nav).getByRole('link', { name: activeName }).getAttribute('aria-current')).toBe('page');
      unmount();
    }
  });

  test('direct navigation to /playbook redirects to Home using replace (no history entry left behind)', async () => {
    render(<BottomNavApp initialEntries={['/playbook']} />);
    expect(await screen.findByTestId('route-probe')).toHaveProperty('textContent', 'page:/dashboard');
  });

  test('direct navigation to /progress redirects to Home using replace (no history entry left behind)', async () => {
    render(<BottomNavApp initialEntries={['/progress']} />);
    expect(await screen.findByTestId('route-probe')).toHaveProperty('textContent', 'page:/dashboard');
  });

  test('neither redirect loops: Back from Home leaves the retired route behind entirely', async () => {
    for (const retired of ['/playbook', '/progress']) {
      // Two real history entries — an earlier page, then the retired link.
      const { unmount } = render(<BottomNavApp initialEntries={['/train', retired]} />);
      const user = userEvent.setup();
      expect(await screen.findByTestId('route-probe')).toHaveProperty('textContent', 'page:/dashboard');

      // `replace` means the retired entry was overwritten by Home, so going
      // back lands on the page before it rather than bouncing through the
      // redirect again.
      await user.click(screen.getByRole('button', { name: 'go back' }));
      expect(screen.getByTestId('route-probe').textContent).toBe('page:/train');
      unmount();
    }
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

  test('Hindi: all four tabs are translated', async () => {
    authState.language = 'hi';
    render(<BottomNavApp initialEntries={['/dashboard']} />);
    const nav = screen.getByRole('navigation');
    const labels = within(nav).getAllByRole('link').map((l) => l.textContent);
    expect(labels).toEqual(['होम', 'ट्रेन', 'कोच', 'प्रोफाइल']);
    expect(within(nav).queryByText('प्लेबुक')).toBeNull();
  });
});

// ─── Stage B: app shell ──────────────────────────────────────────────────────
// The last destination is the athlete's Performance Profile, not
// Account/Settings, and the bar keeps the approved near-black surface.

describe('BottomNav — Stage B shell', () => {
  test('the Profile tab points at /starting-profile, not /account', async () => {
    render(<BottomNavApp initialEntries={['/dashboard']} />);
    const profileLink = screen.getByRole('link', { name: /Profile/i });
    expect(profileLink.getAttribute('href')).toBe('/starting-profile');
  });

  test('tapping Profile performs a real navigation to the Performance Profile', async () => {
    render(<BottomNavApp initialEntries={['/dashboard']} />);
    const user = userEvent.setup();

    await user.click(screen.getByRole('link', { name: /Profile/i }));

    expect(await screen.findByTestId('route-probe'))
      .toHaveProperty('textContent', 'page:/starting-profile');
  });

  test('Profile is active on /starting-profile and inactive on /account', async () => {
    const { unmount } = render(<BottomNavApp initialEntries={['/starting-profile']} />);
    expect(screen.getByRole('link', { name: /Profile/i }).getAttribute('aria-current')).toBe('page');
    unmount();

    // /account still resolves and still renders the shell — it simply is no
    // longer the Profile tab's destination, so nothing is marked active.
    render(<BottomNavApp initialEntries={['/account']} />);
    expect(screen.getByRole('link', { name: /Profile/i }).getAttribute('aria-current')).toBeNull();
  });

  test('the four destinations are exactly Home, Train, Coach and the Performance Profile', async () => {
    render(<BottomNavApp initialEntries={['/dashboard']} />);
    const hrefs = within(screen.getByRole('navigation'))
      .getAllByRole('link')
      .map((l) => l.getAttribute('href'));
    expect(hrefs).toEqual(['/dashboard', '/train', '/coaching', '/starting-profile']);
  });

  test('the bar uses the near-black nav surface and a safe-area inset, not a theme-specific page colour', async () => {
    render(<BottomNavApp initialEntries={['/dashboard']} />);
    const nav = screen.getByRole('navigation');
    expect(nav.style.background).toContain('--nav-bar');
    // Asserted as a class, not an inline style: jsdom drops `env()` from
    // inline styles, so the utility class is the reliable signal here.
    expect(nav.className).toMatch(/pb-\[env\(safe-area-inset-bottom\)\]/);
    // The old theme-following page background must be gone.
    expect(nav.className).not.toMatch(/bg-dark-900/);
  });

  test('active and inactive items use the on-dark token family, never the light-theme brand blue', async () => {
    render(<BottomNavApp initialEntries={['/train']} />);
    const nav = screen.getByRole('navigation');

    const active = within(nav).getByRole('link', { name: /Train/i });
    expect(active.querySelector('span').style.color).toContain('--nav-fg-active');

    const inactive = within(nav).getByRole('link', { name: /Home/i });
    expect(inactive.querySelector('span').style.color).toContain('--nav-fg-inactive');

    // navy-bright was the old active colour and is not an approved token.
    expect(nav.innerHTML).not.toMatch(/navy-bright/);
  });

  test('every destination keeps a >=48px tap target and a 10px label', async () => {
    render(<BottomNavApp initialEntries={['/dashboard']} />);
    const links = within(screen.getByRole('navigation')).getAllByRole('link');
    expect(links).toHaveLength(4);
    for (const link of links) {
      expect(link.className).toMatch(/min-h-\[48px\]/);
      expect(link.querySelector('span').className).toMatch(/text-\[10px\]/);
    }
  });

  test('nav destinations remain keyboard-focusable with a visible focus ring', async () => {
    render(<BottomNavApp initialEntries={['/dashboard']} />);
    for (const link of within(screen.getByRole('navigation')).getAllByRole('link')) {
      expect(link.className).toMatch(/focus-visible:ring-2/);
    }
  });

  test('no gradient or glow is introduced on the nav surface', async () => {
    render(<BottomNavApp initialEntries={['/dashboard']} />);
    const nav = screen.getByRole('navigation');
    expect(nav.outerHTML).not.toMatch(/gradient|glow/i);
  });
});

// ─── Profile vs. Settings — the two menus must never collide ───────────────
// The bottom nav's Profile tab (/starting-profile) and the avatar menu's
// item that opens /account are two different destinations. Renders BOTH
// shells together, exactly as App.jsx composes them on every persistent
// screen, and drives real navigation rather than just reading hrefs.

function ShellApp({ initialEntries = ['/dashboard'] }) {
  return (
    <MemoryRouter initialEntries={initialEntries}>
      <Routes>
        <Route path="/dashboard" element={<><RouteProbe label="page" /><Navbar /><BottomNav /></>} />
        <Route path="/starting-profile" element={<><RouteProbe label="page" /><Navbar /><BottomNav /></>} />
        <Route path="/account" element={<><RouteProbe label="page" /><Navbar /><BottomNav /></>} />
      </Routes>
    </MemoryRouter>
  );
}

describe('Profile (bottom nav) vs. Settings (avatar menu) — distinct destinations', () => {
  beforeEach(() => {
    authState.user = { name: 'Test Athlete' };
  });

  test('bottom-nav Profile points to /starting-profile', async () => {
    render(<ShellApp initialEntries={['/dashboard']} />);
    const profileTab = screen.getByRole('link', { name: /Profile/i });
    expect(profileTab.getAttribute('href')).toBe('/starting-profile');
  });

  test('avatar-menu item is labelled Settings, not Profile, and opens /account', async () => {
    render(<ShellApp initialEntries={['/dashboard']} />);
    const user = userEvent.setup();

    // Open the avatar menu.
    await user.click(screen.getByRole('button', { name: 'TA' }));

    const settingsItem = await screen.findByRole('button', { name: 'Settings' });
    expect(settingsItem).toBeTruthy();
    // The old "Profile" wording must be gone from the menu — only the
    // bottom-nav tab may say Profile now.
    expect(screen.queryByRole('button', { name: 'Profile' })).toBeNull();

    await user.click(settingsItem);
    expect(await screen.findByTestId('route-probe')).toHaveProperty('textContent', 'page:/account');
  });

  test('the two destinations remain distinct — Settings never points at /starting-profile and Profile never points at /account', async () => {
    render(<ShellApp initialEntries={['/dashboard']} />);
    const profileTab = screen.getByRole('link', { name: /Profile/i });
    expect(profileTab.getAttribute('href')).not.toBe('/account');

    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'TA' }));
    const settingsItem = await screen.findByRole('button', { name: 'Settings' });
    await user.click(settingsItem);
    expect(await screen.findByTestId('route-probe')).not.toHaveProperty('textContent', 'page:/starting-profile');
  });

  test('the /account route still exists and still renders the shell', async () => {
    render(<ShellApp initialEntries={['/account']} />);
    expect(await screen.findByTestId('route-probe')).toHaveProperty('textContent', 'page:/account');
    // Landing directly on /account is not the Profile tab's active state —
    // the two are different destinations, not aliases of each other.
    expect(screen.getByRole('link', { name: /Profile/i }).getAttribute('aria-current')).toBeNull();
  });

  test('Hindi: avatar menu shows सेटिंग्स (Settings), not प्रोफाइल (Profile)', async () => {
    authState.language = 'hi';
    render(<ShellApp initialEntries={['/dashboard']} />);
    const user = userEvent.setup();

    await user.click(screen.getByRole('button', { name: 'TA' }));

    expect(await screen.findByRole('button', { name: 'सेटिंग्स' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'प्रोफाइल' })).toBeNull();
    // The bottom-nav tab still says Profile (प्रोफाइल) in Hindi — only the
    // avatar-menu item changed.
    expect(screen.getByRole('link', { name: /प्रोफाइल/i })).toBeTruthy();
  });

  test('no other navigation destination changed by this correction', async () => {
    render(<ShellApp initialEntries={['/dashboard']} />);
    // Navbar (avatar menu) also has role="navigation" — the bottom bar is
    // the one with four links, so disambiguate by that shape.
    const bottomBar = screen.getAllByRole('navigation').find(
      (nav) => within(nav).queryAllByRole('link').length === 4
    );
    const hrefs = within(bottomBar).getAllByRole('link').map((l) => l.getAttribute('href'));
    expect(hrefs).toEqual(['/dashboard', '/train', '/coaching', '/starting-profile']);
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
    // PR 2 cutover: the separate reflection tool is gone from Train — and is
    // not replaced by a duplicate Mind Journal tile.
    expect(screen.queryByText('Match & Practice Reflection')).toBeNull();
    expect(screen.queryByText(/Mind Journal/i)).toBeNull();
    expect(screen.getByText('Quick Rep')).toBeTruthy();
    expect(screen.queryByText('Daily Mental Rep')).toBeNull();
    expect(screen.getByText('Focus Card Builder')).toBeTruthy();

    // Stage E: the whole tile is the control, so it is named by its
    // practice rather than by a separate "Start" CTA. Clicking the tile
    // must still land on the practice's existing route.
    await user.click(screen.getByRole('button', { name: /Pressure Reset/ }));
    expect(await screen.findByTestId('route-probe')).toHaveProperty('textContent', 'body-reset:/body-reset');
  });

  test('every one of the four remaining practice tiles opens its existing route', async () => {
    const cases = [
      [/Ritual/, 'ritual:/ritual'],
      [/Pressure Reset/, 'body-reset:/body-reset'],
      [/Quick Rep/, 'mental-rep:/mental-rep'],
      [/Focus Card Builder/, 'self-talk:/self-talk'],
    ];
    for (const [name, expected] of cases) {
      const { unmount } = render(<TrainApp />);
      const user = userEvent.setup();
      await user.click(screen.getByRole('button', { name }));
      expect(await screen.findByTestId('route-probe')).toHaveProperty('textContent', expected);
      unmount();
    }
  });

  // Visual refresh: "View history" was relocated OFF the Train page onto the
  // Pressure Reset intro screen itself — it is no longer reachable from
  // here at all. Its survival on BodyResetPage's intro is proven in
  // pressureResetShell.dom.test.jsx ("the intro 'View history' secondary
  // action still navigates to /body-reset/history"), which this change does
  // not touch.
  test('Train no longer exposes a "View history" control — it moved to the Pressure Reset intro screen', async () => {
    render(<TrainApp />);
    expect(screen.queryByRole('button', { name: /View history/i })).toBeNull();
    expect(screen.queryByText(/View history/i)).toBeNull();
  });

  test('Ritual renders in Hindi with the approved support copy', async () => {
    authState.language = 'hi';
    render(<TrainApp />);
    expect(screen.getByRole('button', { name: /Ritual/i })).toBeTruthy();
    expect(screen.getByText('खेलने से पहले की अपनी रूटीन।')).toBeTruthy();
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
