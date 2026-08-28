// Push Notifications v1 simplification — Account settings "Notifications"
// section as a real rendered AccountPage: mocked useAuth/apiFetch (same
// pattern as contactEntryPoints.dom.test.jsx) PLUS mocked browser
// Notification/ServiceWorker/PushManager APIs (same pattern as
// usePushNotifications.dom.test.jsx) — no real service worker, no real
// permission prompt, no real network.

import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route } from 'react-router-dom';

const authState = {
  user: null,
  token: 't',
  language: 'en',
  toggleLanguage: vi.fn(),
  logout: vi.fn(),
  updateUser: vi.fn(),
  avatarUrl: null,
  updateAvatar: vi.fn(),
};

vi.mock('../src/contexts/AuthContext', () => ({
  useAuth: () => authState,
}));

let apiFetchImpl = defaultApiFetchImpl;
vi.mock('../src/api', () => ({
  apiFetch: (...args) => apiFetchImpl(...args),
}));

function jsonResponse(body, ok = true) {
  return Promise.resolve({ ok, json: async () => body });
}

function defaultApiFetchImpl(path) {
  if (path === '/api/achievements/me') return jsonResponse({ achievements: [] });
  if (path === '/api/push-notifications/preferences') {
    return jsonResponse({ preference: { enabled: false, reminderTime: null, timezone: null } });
  }
  return jsonResponse({});
}

const { default: AccountPage } = await import('../src/pages/AccountPage.jsx');

function adultUser(overrides = {}) {
  return {
    id: 'u1', name: 'Rahul', email: 'rahul@example.com', tier: 'trial',
    trialStarted: new Date().toISOString(), createdAt: new Date().toISOString(), goals: [],
    dateOfBirth: null, guardianConsentAt: null,
    ...overrides,
  };
}
function unconsentedMinorUser() {
  const now = new Date();
  return adultUser({ dateOfBirth: new Date(now.getFullYear() - 15, now.getMonth(), now.getDate()), guardianConsentAt: null });
}

function defineServiceWorkerSupport({ registration } = {}) {
  window.PushManager = function () {};
  Object.defineProperty(window.navigator, 'serviceWorker', {
    value: { ready: Promise.resolve(registration), getRegistration: async () => registration },
    configurable: true,
    writable: true,
  });
}
function removeServiceWorkerSupport() {
  delete window.PushManager;
  Object.defineProperty(window.navigator, 'serviceWorker', { value: undefined, configurable: true, writable: true });
}
function defineNotification(initialPermission = 'default', requestResult = 'granted') {
  global.Notification = {
    permission: initialPermission,
    requestPermission: vi.fn().mockResolvedValue(requestResult),
  };
}
function removeNotification() {
  delete global.Notification;
}
function fakeRegistration({ existingSubscription = null, newSubscription = null } = {}) {
  return {
    pushManager: {
      getSubscription: vi.fn().mockResolvedValue(existingSubscription),
      subscribe: vi.fn().mockResolvedValue(newSubscription),
    },
  };
}
function fakeSubscription(endpoint = 'https://push.example/device-1') {
  return {
    endpoint,
    toJSON: () => ({ endpoint, keys: { p256dh: 'p256dh-value', auth: 'auth-value' } }),
    unsubscribe: vi.fn().mockResolvedValue(true),
  };
}

function renderAccount() {
  return render(
    <MemoryRouter initialEntries={['/account']}>
      <Routes>
        <Route path="/account" element={<AccountPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  authState.user = adultUser();
  authState.token = 't';
  authState.language = 'en';
  apiFetchImpl = defaultApiFetchImpl;
  vi.stubEnv('VITE_VAPID_PUBLIC_KEY', 'A'.repeat(87));
});

afterEach(() => {
  cleanup();
  removeServiceWorkerSupport();
  removeNotification();
  vi.unstubAllEnvs();
});

describe('AccountPage — Push notifications toggle', () => {
  test('no reminder-time picker is rendered anywhere on the page', async () => {
    defineServiceWorkerSupport({ registration: fakeRegistration() });
    defineNotification('default');
    renderAccount();
    await screen.findByText('Push notifications');
    expect(document.querySelector('input[type="time"]')).toBeNull();
  });

  test('the Push notifications toggle and supporting copy render, off by default', async () => {
    defineServiceWorkerSupport({ registration: fakeRegistration() });
    defineNotification('default');
    renderAccount();

    await screen.findByText('Push notifications');
    expect(screen.getByText('Occasional reminders to support your mental training.')).toBeTruthy();
    const toggle = screen.getByRole('switch', { name: 'Push notifications' });
    expect(toggle.checked).toBe(false);
    expect(screen.getByText('Off')).toBeTruthy();
  });

  test('OFF -> tapping the toggle initiates the enable/permission flow, permission requested only after the tap', async () => {
    const sub = fakeSubscription();
    const registration = fakeRegistration({ newSubscription: sub });
    defineServiceWorkerSupport({ registration });
    defineNotification('default');
    let subscribeBody = null;
    apiFetchImpl = (path, init) => {
      if (path === '/api/achievements/me') return jsonResponse({ achievements: [] });
      if (path === '/api/push-notifications/preferences') return jsonResponse({ preference: { enabled: false, reminderTime: null, timezone: null } });
      if (path === '/api/push-notifications/subscribe') {
        subscribeBody = JSON.parse(init.body);
        return jsonResponse({ preference: { enabled: true, reminderTime: subscribeBody.reminderTime, timezone: subscribeBody.timezone } });
      }
      return jsonResponse({});
    };

    renderAccount();
    await screen.findByText('Push notifications');
    expect(global.Notification.requestPermission).not.toHaveBeenCalled();

    const toggle = screen.getByRole('switch', { name: 'Push notifications' });
    await userEvent.click(toggle);

    expect(global.Notification.requestPermission).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(registration.pushManager.subscribe).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(screen.getByRole('switch', { name: 'Push notifications' }).checked).toBe(true));
    expect(screen.getByText('On')).toBeTruthy();
    expect(subscribeBody.reminderTime).toBe('18:00'); // fixed system time, never athlete-supplied
    expect(document.querySelector('input[type="time"]')).toBeNull(); // still no picker after enabling
  });

  test('ON -> tapping the toggle off uses the existing disable flow', async () => {
    const sub = fakeSubscription('https://push.example/current-device');
    const registration = fakeRegistration({ existingSubscription: sub });
    defineServiceWorkerSupport({ registration });
    defineNotification('granted');
    let patchedEnabled = null;
    apiFetchImpl = (path, init) => {
      if (path === '/api/achievements/me') return jsonResponse({ achievements: [] });
      if (path === '/api/push-notifications/preferences' && (!init || !init.method)) {
        return jsonResponse({ preference: { enabled: true, reminderTime: '18:00', timezone: 'Asia/Kolkata' } });
      }
      if (path === '/api/push-notifications/preferences' && init.method === 'PATCH') {
        patchedEnabled = JSON.parse(init.body).enabled;
        return jsonResponse({ preference: { enabled: false, reminderTime: '18:00', timezone: 'Asia/Kolkata' } });
      }
      if (path === '/api/push-notifications/unsubscribe') return jsonResponse({ ok: true });
      return jsonResponse({});
    };

    renderAccount();
    const toggle = await screen.findByRole('switch', { name: 'Push notifications' });
    await waitFor(() => expect(toggle.checked).toBe(true));

    await userEvent.click(toggle);

    await waitFor(() => expect(patchedEnabled).toBe(false));
    await waitFor(() => expect(sub.unsubscribe).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(screen.getByRole('switch', { name: 'Push notifications' }).checked).toBe(false));
  });

  test('unsupported browser: explanatory text only, no toggle rendered', async () => {
    // Nothing defined — jsdom has no serviceWorker/PushManager/Notification.
    renderAccount();
    await screen.findByText("Notifications aren't supported in this browser.");
    expect(screen.queryByRole('switch', { name: 'Push notifications' })).toBeNull();
  });

  test('iOS without push support: distinct Home Screen explanation, no toggle', async () => {
    Object.defineProperty(window.navigator, 'userAgent', {
      value: 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X)',
      configurable: true,
    });
    renderAccount();
    await screen.findByText('Notifications are available when Arjun is added to your Home Screen.');
    expect(screen.queryByRole('switch', { name: 'Push notifications' })).toBeNull();
  });

  test('under-18 without guardian consent: consent-required copy, no toggle, browser permission never requested', async () => {
    authState.user = unconsentedMinorUser();
    defineServiceWorkerSupport({ registration: fakeRegistration() });
    defineNotification('default');
    renderAccount();
    await screen.findByText("Notifications aren't available yet");
    expect(screen.queryByRole('switch', { name: 'Push notifications' })).toBeNull();
    expect(global.Notification.requestPermission).not.toHaveBeenCalled();
  });

  test('permission denied: calm explanatory copy, no toggle, no repeated permission requests', async () => {
    defineServiceWorkerSupport({ registration: fakeRegistration() });
    defineNotification('denied');
    renderAccount();
    await screen.findByText('Notifications are off in your browser settings');
    expect(screen.queryByRole('switch', { name: 'Push notifications' })).toBeNull();
    expect(global.Notification.requestPermission).not.toHaveBeenCalled();
  });

  test('Hindi: the toggle row copy is translated', async () => {
    authState.language = 'hi';
    defineServiceWorkerSupport({ registration: fakeRegistration() });
    defineNotification('default');
    renderAccount();
    await screen.findByText('पुश सूचनाएं');
    expect(screen.getByText('आपकी मानसिक ट्रेनिंग में मदद के लिए कभी-कभी रिमाइंडर।')).toBeTruthy();
    const toggle = screen.getByRole('switch', { name: 'पुश सूचनाएं' });
    expect(toggle.checked).toBe(false);
    expect(screen.getByText('बंद')).toBeTruthy();
  });

  test('accessible switch semantics: role="switch", reflects checked state, has an accessible name', async () => {
    defineServiceWorkerSupport({ registration: fakeRegistration() });
    defineNotification('default');
    renderAccount();
    await screen.findByText('Push notifications');
    const toggle = screen.getByRole('switch', { name: 'Push notifications' });
    expect(toggle.getAttribute('type')).toBe('checkbox');
    expect(toggle.getAttribute('aria-label') || toggle.getAttribute('aria-labelledby')).toBeTruthy();
    expect(toggle.checked).toBe(false);
  });
});
