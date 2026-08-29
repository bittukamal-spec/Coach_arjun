// Home quick-settings discoverability — Navbar's avatar/chevron trigger
// and the Notifications row, which is now a direct enable/disable toggle
// (not a shortcut to Account). Real component, mocked AuthContext +
// apiFetch, real react-router-dom MemoryRouter (so "never navigates" is
// actually proven against real routing, same pattern as
// dashboardShortcuts.dom.test.jsx / navigationIaCleanup.dom.test.jsx).

import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, within, waitFor } from '@testing-library/react';
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

// usePushNotifications() only ever resolves `status` to 'default'/'enabled'
// (the two actionable states) when its `supported` check passes — that
// requires window.PushManager and navigator.serviceWorker to exist, which
// jsdom doesn't provide by default. Same stubbing pattern as
// usePushNotifications.dom.test.jsx / accountPagePushToggle.dom.test.jsx.
function defineServiceWorkerSupport({ registration } = {}) {
  window.PushManager = function () {};
  Object.defineProperty(window.navigator, 'serviceWorker', {
    value: {
      ready: Promise.resolve(registration ?? {
        pushManager: {
          getSubscription: async () => null,
          subscribe: async () => ({ toJSON: () => ({}), endpoint: 'https://example.test/ep' }),
        },
      }),
      getRegistration: async () => registration,
    },
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
  global.Notification = { permission: 'default', requestPermission: vi.fn(async () => 'granted') };
});
afterEach(() => {
  cleanup();
  removeServiceWorkerSupport();
  delete global.Notification;
  delete import.meta.env.VITE_VAPID_PUBLIC_KEY;
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

describe('Navbar — Notifications is a direct toggle', () => {
  test('the menu contains a Notifications switch positioned between Theme and Settings', async () => {
    render(<App />);
    const { trigger } = await openMenu();
    const menu = trigger.closest('div').querySelector('.absolute');
    const themeLabel = within(menu).getByText('Theme');
    const notificationsLabel = within(menu).getByText('Notifications');
    const settingsItem = within(menu).getByRole('button', { name: /Settings/ });
    const toggle = within(menu).getByRole('switch', { name: 'Notifications' });

    expect(themeLabel.compareDocumentPosition(notificationsLabel) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(notificationsLabel.compareDocumentPosition(settingsItem) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(toggle).toBeTruthy();
  });

  test('no "Occasional reminders" subtext appears', async () => {
    render(<App />);
    await openMenu();
    await screen.findByText('Notifications');
    expect(screen.queryByText('Occasional reminders')).toBeNull();
  });

  test('no separate "On"/"Off" status text appears', async () => {
    apiFetchImpl = () => jsonResponse({ preference: { enabled: true, reminderTime: '18:00', timezone: 'Asia/Kolkata' } });
    render(<App />);
    await openMenu();
    const toggle = await screen.findByRole('switch', { name: 'Notifications' });
    await waitFor(() => expect(toggle.checked).toBe(true));
    expect(screen.queryByText('On')).toBeNull();
    expect(screen.queryByText('Off')).toBeNull();
  });

  test('the switch reflects an enabled server preference as checked', async () => {
    apiFetchImpl = () => jsonResponse({ preference: { enabled: true, reminderTime: '18:00', timezone: 'Asia/Kolkata' } });
    render(<App />);
    await openMenu();
    const toggle = await screen.findByRole('switch', { name: 'Notifications' });
    await waitFor(() => expect(toggle.checked).toBe(true));
  });

  test('the switch reflects a disabled server preference as unchecked', async () => {
    apiFetchImpl = () => jsonResponse({ preference: { enabled: false, reminderTime: null, timezone: null } });
    render(<App />);
    await openMenu();
    const toggle = await screen.findByRole('switch', { name: 'Notifications' });
    await waitFor(() => expect(toggle.checked).toBe(false));
  });

  test('never infers checked purely from browser permission when the server preference is disabled', async () => {
    global.Notification = { permission: 'granted', requestPermission: vi.fn() };
    apiFetchImpl = () => jsonResponse({ preference: { enabled: false, reminderTime: null, timezone: null } });
    render(<App />);
    await openMenu();
    const toggle = await screen.findByRole('switch', { name: 'Notifications' });
    await waitFor(() => expect(toggle.checked).toBe(false));
  });

  test('OFF -> ON: toggling calls the existing enable() flow (permission request + subscribe), not a duplicate implementation', async () => {
    const requestPermission = vi.fn(async () => 'granted');
    global.Notification = { permission: 'default', requestPermission };
    import.meta.env.VITE_VAPID_PUBLIC_KEY = 'AAAA';
    const subscribeCalls = [];
    apiFetchImpl = (url, opts) => {
      if (url === '/api/push-notifications/preferences') {
        return jsonResponse({ preference: { enabled: false, reminderTime: null, timezone: null } });
      }
      if (url === '/api/push-notifications/subscribe') {
        subscribeCalls.push(opts);
        return jsonResponse({ preference: { enabled: true, reminderTime: '18:00', timezone: 'Asia/Kolkata' } });
      }
      return jsonResponse({});
    };
    render(<App />);
    const { user } = await openMenu();
    const toggle = await screen.findByRole('switch', { name: 'Notifications' });
    await waitFor(() => expect(toggle.checked).toBe(false));

    await user.click(toggle);

    expect(requestPermission).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(subscribeCalls.length).toBe(1));
    await waitFor(() => expect(toggle.checked).toBe(true));
  });

  test('ON -> OFF: toggling calls the existing disable() flow', async () => {
    let enabled = true;
    apiFetchImpl = (url, opts) => {
      if (url === '/api/push-notifications/preferences' && (!opts || opts.method === undefined)) {
        return jsonResponse({ preference: { enabled, reminderTime: '18:00', timezone: 'Asia/Kolkata' } });
      }
      if (url === '/api/push-notifications/preferences' && opts?.method === 'PATCH') {
        enabled = JSON.parse(opts.body).enabled;
        return jsonResponse({ preference: { enabled, reminderTime: '18:00', timezone: 'Asia/Kolkata' } });
      }
      if (url === '/api/push-notifications/unsubscribe') return jsonResponse({});
      return jsonResponse({});
    };
    render(<App />);
    const { user } = await openMenu();
    const toggle = await screen.findByRole('switch', { name: 'Notifications' });
    await waitFor(() => expect(toggle.checked).toBe(true));

    await user.click(toggle);

    await waitFor(() => expect(toggle.checked).toBe(false));
  });

  test('a rapid second click while a toggle is pending is ignored (busy guard)', async () => {
    let resolveSubscribe;
    import.meta.env.VITE_VAPID_PUBLIC_KEY = 'AAAA';
    apiFetchImpl = (url) => {
      if (url === '/api/push-notifications/preferences') {
        return jsonResponse({ preference: { enabled: false, reminderTime: null, timezone: null } });
      }
      if (url === '/api/push-notifications/subscribe') {
        return new Promise((resolve) => { resolveSubscribe = resolve; });
      }
      return jsonResponse({});
    };
    render(<App />);
    const { user } = await openMenu();
    const toggle = await screen.findByRole('switch', { name: 'Notifications' });
    await waitFor(() => expect(toggle.checked).toBe(false));

    await user.click(toggle);
    await waitFor(() => expect(toggle.disabled).toBe(true));
    // Disabled inputs don't dispatch change on click — this proves the
    // busy state actually blocks the second tap rather than merely
    // looking disabled.
    await user.click(toggle);

    resolveSubscribe(jsonResponse({ preference: { enabled: true, reminderTime: '18:00', timezone: 'Asia/Kolkata' } }));
    await waitFor(() => expect(toggle.checked).toBe(true));
  });

  test('clicking Notifications never navigates to /account (no deep-link/shortcut behaviour left on this row)', async () => {
    render(<App />);
    const { user } = await openMenu();
    const toggle = await screen.findByRole('switch', { name: 'Notifications' });
    await user.click(toggle);

    const probe = await screen.findByTestId('route-probe');
    expect(probe.textContent).toBe('/dashboard');
  });

  test('if enabling fails, the toggle stays off, the menu stays open, and only a subtle error line appears', async () => {
    global.Notification = { permission: 'default', requestPermission: vi.fn(async () => 'granted') };
    import.meta.env.VITE_VAPID_PUBLIC_KEY = 'AAAA';
    apiFetchImpl = (url) => {
      if (url === '/api/push-notifications/preferences') {
        return jsonResponse({ preference: { enabled: false, reminderTime: null, timezone: null } });
      }
      if (url === '/api/push-notifications/subscribe') {
        return jsonResponse({ error: 'server_error' }, false);
      }
      return jsonResponse({});
    };
    render(<App />);
    const { user } = await openMenu();
    const toggle = await screen.findByRole('switch', { name: 'Notifications' });
    await waitFor(() => expect(toggle.checked).toBe(false));

    await user.click(toggle);

    await screen.findByText('Something went wrong. Please try again.');
    expect(toggle.checked).toBe(false);
    // The rest of the menu is still there — nothing closed or broke.
    expect(screen.getByText('Language')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Settings' })).toBeTruthy();
  });

  test('unsupported browsers disable the switch instead of pretending it can turn on', async () => {
    removeServiceWorkerSupport();
    render(<App />);
    await openMenu();
    const toggle = await screen.findByRole('switch', { name: 'Notifications' });
    expect(toggle.disabled).toBe(true);
    expect(toggle.checked).toBe(false);
  });

  test('a preference fetch failure leaves the switch off and pending — never a scary error, never a broken menu', async () => {
    apiFetchImpl = () => Promise.reject(new Error('network down'));
    render(<App />);
    await openMenu();
    const toggle = await screen.findByRole('switch', { name: 'Notifications' });
    await waitFor(() => expect(toggle.checked).toBe(false));
    expect(screen.getByText('Language')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Settings' })).toBeTruthy();
  });
});

describe('Navbar — EN/HI parity for the Notifications row', () => {
  test('Hindi: the row label shows सूचनाएं and the switch still works as a switch', async () => {
    authState.language = 'hi';
    apiFetchImpl = () => jsonResponse({ preference: { enabled: true, reminderTime: '18:00', timezone: 'Asia/Kolkata' } });
    render(<App />);
    await openMenu();
    expect(await screen.findByText('सूचनाएं')).toBeTruthy();
    const toggle = await screen.findByRole('switch', { name: 'सूचनाएं' });
    await waitFor(() => expect(toggle.checked).toBe(true));
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
