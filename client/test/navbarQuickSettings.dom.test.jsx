// Home quick-settings discoverability — Navbar's avatar/chevron trigger
// and the new Notifications shortcut. Real component, mocked AuthContext
// + apiFetch, real react-router-dom MemoryRouter (so the navigation
// assertion reflects what actually happens, same pattern as
// dashboardShortcuts.dom.test.jsx / navigationIaCleanup.dom.test.jsx).

import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom';

const authState = {
  language: 'en',
  user: { name: 'Prabhanshu Kamal' },
  token: 'test-token',
  toggleLanguage: vi.fn(),
  avatarUrl: null,
};
vi.mock('../src/contexts/AuthContext', () => ({ useAuth: () => authState }));

function jsonResponse(body, ok = true) {
  return Promise.resolve({ ok, json: async () => body });
}
let apiFetchImpl = () => jsonResponse({ preference: { enabled: false, reminderTime: null, timezone: null } });
vi.mock('../src/api', () => ({ apiFetch: (...args) => apiFetchImpl(...args) }));

// usePushNotifications() only ever resolves `status` to 'enabled' when its
// `supported` check passes — that requires window.PushManager and
// navigator.serviceWorker to exist, which jsdom doesn't provide by default.
// Same stubbing pattern as usePushNotifications.dom.test.jsx /
// accountPagePushToggle.dom.test.jsx.
function defineServiceWorkerSupport() {
  window.PushManager = function () {};
  Object.defineProperty(window.navigator, 'serviceWorker', {
    value: { ready: new Promise(() => {}), getRegistration: async () => undefined },
    configurable: true,
    writable: true,
  });
}
function removeServiceWorkerSupport() {
  delete window.PushManager;
  Object.defineProperty(window.navigator, 'serviceWorker', { value: undefined, configurable: true, writable: true });
}

const { default: Navbar } = await import('../src/components/Navbar.jsx');

function RouteProbe() {
  const location = useLocation();
  return <p data-testid="route-probe">{location.pathname}{location.hash}</p>;
}

function App({ initialEntries = ['/dashboard'] }) {
  return (
    <MemoryRouter initialEntries={initialEntries}>
      <Routes>
        <Route path="/dashboard" element={<><RouteProbe /><Navbar /></>} />
        <Route path="/account" element={<><RouteProbe /><Navbar /></>} />
      </Routes>
    </MemoryRouter>
  );
}

beforeEach(() => {
  authState.user = { name: 'Prabhanshu Kamal' };
  authState.token = 'test-token';
  authState.language = 'en';
  authState.toggleLanguage.mockClear();
  apiFetchImpl = () => jsonResponse({ preference: { enabled: false, reminderTime: null, timezone: null } });
  // Baseline: push IS supported in this environment (real devices this
  // menu ships to), permission not yet decided — individual tests below
  // override global.Notification where the browser-permission state
  // itself is what's under test.
  defineServiceWorkerSupport();
  global.Notification = { permission: 'default', requestPermission: vi.fn() };
});
afterEach(() => {
  cleanup();
  removeServiceWorkerSupport();
  delete global.Notification;
});

async function openMenu() {
  const user = userEvent.setup();
  const trigger = screen.getByRole('button', { name: 'PK' });
  await user.click(trigger);
  return { user, trigger };
}

describe('Navbar — avatar/chevron discoverability', () => {
  test('a chevron indicator renders beside the avatar trigger', async () => {
    render(<App />);
    const trigger = await screen.findByRole('button', { name: 'PK' });
    // The avatar itself is text (initials), not an icon — the only <svg>
    // inside the button before opening is the chevron.
    expect(trigger.querySelectorAll('svg').length).toBe(1);
  });

  test('the avatar + chevron are one tap target — clicking anywhere on the button opens the menu', async () => {
    render(<App />);
    await openMenu();
    expect(await screen.findByText('Language')).toBeTruthy();
  });

  test('aria-expanded reflects open/closed state', async () => {
    render(<App />);
    const trigger = screen.getByRole('button', { name: 'PK' });
    expect(trigger.getAttribute('aria-expanded')).toBe('false');
    const { user } = await openMenu();
    expect(trigger.getAttribute('aria-expanded')).toBe('true');
    await user.click(trigger);
    expect(trigger.getAttribute('aria-expanded')).toBe('false');
  });

  test('existing avatar/menu behaviour (Settings) is unchanged', async () => {
    render(<App />);
    await openMenu();
    const settingsItem = await screen.findByRole('button', { name: 'Settings' });
    expect(settingsItem).toBeTruthy();
  });
});

describe('Navbar — Notifications quick-settings shortcut', () => {
  test('the menu contains Notifications positioned between Theme and Settings', async () => {
    render(<App />);
    const { trigger } = await openMenu();
    const menu = trigger.closest('div').querySelector('.absolute');
    const themeLabel = within(menu).getByText('Theme');
    const notificationsLabel = within(menu).getByText('Notifications');
    const settingsItem = within(menu).getByRole('button', { name: /Settings/ });

    expect(themeLabel.compareDocumentPosition(notificationsLabel) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(notificationsLabel.compareDocumentPosition(settingsItem) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  test('shows "Off" when the athlete\'s push preference is disabled', async () => {
    apiFetchImpl = () => jsonResponse({ preference: { enabled: false, reminderTime: null, timezone: null } });
    render(<App />);
    await openMenu();
    await screen.findByText('Notifications');
    expect(await screen.findByText('Off')).toBeTruthy();
    expect(screen.queryByText('On')).toBeNull();
  });

  test('shows "On" when the athlete\'s push preference is enabled', async () => {
    apiFetchImpl = () => jsonResponse({ preference: { enabled: true, reminderTime: '18:00', timezone: 'Asia/Kolkata' } });
    render(<App />);
    await openMenu();
    expect(await screen.findByText('On')).toBeTruthy();
    expect(screen.queryByText('Off')).toBeNull();
  });

  test('never infers On purely from browser permission when the server preference is disabled', async () => {
    global.Notification = { permission: 'granted' };
    apiFetchImpl = () => jsonResponse({ preference: { enabled: false, reminderTime: null, timezone: null } });
    render(<App />);
    await openMenu();
    expect(await screen.findByText('Off')).toBeTruthy();
    delete global.Notification;
  });

  test('a preference fetch failure falls back to a neutral "Off" state, never a scary error, and never breaks the menu', async () => {
    apiFetchImpl = () => Promise.reject(new Error('network down'));
    render(<App />);
    await openMenu();
    expect(await screen.findByText('Off')).toBeTruthy();
    // The rest of the menu still works.
    expect(screen.getByText('Language')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Settings' })).toBeTruthy();
  });

  test('clicking Notifications navigates to the Account Notifications section (/account#notifications)', async () => {
    render(<App />);
    const { user } = await openMenu();
    const notificationsItem = await screen.findByText('Notifications');
    await user.click(notificationsItem);

    const probe = await screen.findByTestId('route-probe');
    expect(probe.textContent).toBe('/account#notifications');
  });

  test('clicking Notifications never requests browser notification permission or touches pushManager', async () => {
    const requestPermission = vi.fn();
    global.Notification = { permission: 'default', requestPermission };
    render(<App />);
    const { user } = await openMenu();
    await user.click(await screen.findByText('Notifications'));
    expect(requestPermission).not.toHaveBeenCalled();
    delete global.Notification;
  });

  test('the supporting line "Occasional reminders" renders under the label', async () => {
    render(<App />);
    await openMenu();
    expect(await screen.findByText('Occasional reminders')).toBeTruthy();
  });
});

describe('Navbar — EN/HI parity for the Notifications shortcut', () => {
  test('Hindi: the shortcut shows सूचनाएं / चालू / बंद', async () => {
    authState.language = 'hi';
    apiFetchImpl = () => jsonResponse({ preference: { enabled: true, reminderTime: '18:00', timezone: 'Asia/Kolkata' } });
    render(<App />);
    await openMenu();
    expect(await screen.findByText('सूचनाएं')).toBeTruthy();
    expect(await screen.findByText('चालू')).toBeTruthy();
    expect(screen.getByText('कभी-कभी रिमाइंडर')).toBeTruthy();
  });

  test('existing Language/Theme translated labels remain correct in Hindi', async () => {
    authState.language = 'hi';
    render(<App />);
    await openMenu();
    expect(await screen.findByText('भाषा')).toBeTruthy();
    expect(screen.getByText('थीम')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'सेटिंग्स' })).toBeTruthy();
  });
});

describe('Navbar — existing Language/Theme behaviour regression', () => {
  test('language toggle still works', async () => {
    render(<App />);
    const { user } = await openMenu();
    await user.click(screen.getByRole('button', { name: 'हि' }));
    expect(authState.toggleLanguage).toHaveBeenCalledTimes(1);
  });

  test('theme buttons still render and are clickable', async () => {
    render(<App />);
    await openMenu();
    expect(screen.getByRole('button', { name: 'Auto' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Light' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Dark' })).toBeTruthy();
  });
});
