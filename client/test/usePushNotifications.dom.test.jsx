// Push Notifications v1 — usePushNotifications hook. Real hook, mocked
// AuthContext + apiFetch + browser Notification/ServiceWorker/PushManager
// APIs — no real network, no real service worker, no real permission
// prompt. Same mocking technique as appUpdatePrompt.dom.test.jsx /
// performanceCheckin.dom.test.jsx.

import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

let mockUser = null;
let mockToken = 'test-token';
vi.mock('../src/contexts/AuthContext', () => ({
  useAuth: () => ({ user: mockUser, token: mockToken }),
}));

vi.mock('../src/api', () => ({ apiFetch: vi.fn() }));

const { apiFetch } = await import('../src/api');
const { usePushNotifications, DEFAULT_REMINDER_TIME } = await import('../src/hooks/usePushNotifications.js');

function adultUser(overrides = {}) {
  return { id: 'u1', dateOfBirth: null, guardianConsentAt: null, ...overrides };
}
function unconsentedMinorUser() {
  const now = new Date();
  return { id: 'minor1', dateOfBirth: new Date(now.getFullYear() - 15, now.getMonth(), now.getDate()), guardianConsentAt: null };
}

function jsonResponse(body, ok = true) {
  return Promise.resolve({ ok, json: async () => body });
}

function Harness() {
  const push = usePushNotifications();
  return (
    <div>
      <div data-testid="status">{push.status}</div>
      <div data-testid="busy">{push.busy ? 'busy' : 'idle'}</div>
      <div data-testid="error">{push.error}</div>
      <div data-testid="reminderTime">{push.preference?.reminderTime ?? ''}</div>
      <input
        type="checkbox"
        role="switch"
        aria-label="Push notifications"
        checked={push.status === 'enabled'}
        disabled={push.busy}
        onChange={() => (push.status === 'enabled' ? push.disable() : push.enable())}
      />
    </div>
  );
}

function defineServiceWorkerSupport({ registration } = {}) {
  window.PushManager = function () {};
  Object.defineProperty(window.navigator, 'serviceWorker', {
    value: {
      ready: Promise.resolve(registration),
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

// `initialPermission` is what Notification.permission reads as BEFORE any
// tap (drives the initial `status`); `requestResult` is what the browser's
// permission prompt resolves to once the athlete actually taps "Enable" —
// realistically 'granted' even though the pre-tap permission was 'default'.
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

beforeEach(() => {
  mockUser = adultUser();
  mockToken = 'test-token';
  apiFetch.mockReset();
  apiFetch.mockImplementation((path) => {
    if (path === '/api/push-notifications/preferences') {
      return jsonResponse({ preference: { enabled: false, reminderTime: null, timezone: null } });
    }
    return jsonResponse({});
  });
  // A real VAPID public key is a base64url-encoded 65-byte EC point (~87
  // chars) — atob() is strict about padding length, so an arbitrary short
  // test string (e.g. with hyphens) can decode as "invalid character".
  // 87 'A's is the right shape without needing to be a real key.
  vi.stubEnv('VITE_VAPID_PUBLIC_KEY', 'A'.repeat(87));
});

afterEach(() => {
  cleanup();
  removeServiceWorkerSupport();
  removeNotification();
  vi.unstubAllEnvs();
});

describe('usePushNotifications — capability / status derivation', () => {
  test('unsupported: no serviceWorker/PushManager/Notification in this browser', async () => {
    // jsdom provides none of these by default — nothing to define.
    render(<Harness />);
    await waitFor(() => expect(screen.getByTestId('status').textContent).toBe('unsupported'));
  });

  test('ios-unsupported: an iOS device without push support gets the distinct iOS status', async () => {
    const original = navigator.userAgent;
    Object.defineProperty(window.navigator, 'userAgent', {
      value: 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X)',
      configurable: true,
    });
    render(<Harness />);
    await waitFor(() => expect(screen.getByTestId('status').textContent).toBe('ios-unsupported'));
    Object.defineProperty(window.navigator, 'userAgent', { value: original, configurable: true });
  });

  test('consent-required: an unconsented minor is blocked regardless of browser support', async () => {
    mockUser = unconsentedMinorUser();
    defineServiceWorkerSupport({ registration: fakeRegistration() });
    defineNotification('default');
    render(<Harness />);
    await waitFor(() => expect(screen.getByTestId('status').textContent).toBe('consent-required'));
  });

  test('denied: browser permission previously denied', async () => {
    defineServiceWorkerSupport({ registration: fakeRegistration() });
    defineNotification('denied');
    render(<Harness />);
    await waitFor(() => expect(screen.getByTestId('status').textContent).toBe('denied'));
  });

  test('default: supported, consent OK, permission not yet requested, no existing preference', async () => {
    defineServiceWorkerSupport({ registration: fakeRegistration() });
    defineNotification('default');
    render(<Harness />);
    await waitFor(() => expect(screen.getByTestId('status').textContent).toBe('default'));
  });

  test('enabled: an existing enabled preference is reflected once loaded', async () => {
    apiFetch.mockImplementation((path) => {
      if (path === '/api/push-notifications/preferences') {
        return jsonResponse({ preference: { enabled: true, reminderTime: '18:00', timezone: 'Asia/Kolkata' } });
      }
      return jsonResponse({});
    });
    defineServiceWorkerSupport({ registration: fakeRegistration() });
    defineNotification('granted');
    render(<Harness />);
    await waitFor(() => expect(screen.getByTestId('status').textContent).toBe('enabled'));
    expect(screen.getByTestId('reminderTime').textContent).toBe('18:00');
  });
});

describe('usePushNotifications — enable flow (toggle OFF -> ON)', () => {
  test('enable(): requests permission only on explicit toggle, subscribes, and POSTs the fixed reminder time + IANA timezone to /subscribe', async () => {
    const sub = fakeSubscription();
    const registration = fakeRegistration({ existingSubscription: null, newSubscription: sub });
    defineServiceWorkerSupport({ registration });
    defineNotification('default');

    apiFetch.mockImplementation((path, init) => {
      if (path === '/api/push-notifications/preferences') {
        return jsonResponse({ preference: { enabled: false, reminderTime: null, timezone: null } });
      }
      if (path === '/api/push-notifications/subscribe') {
        const body = JSON.parse(init.body);
        expect(body.subscription).toEqual({ endpoint: sub.endpoint, keys: { p256dh: 'p256dh-value', auth: 'auth-value' } });
        // The athlete never supplies a time — it's always the fixed system default.
        expect(body.reminderTime).toBe(DEFAULT_REMINDER_TIME);
        expect(typeof body.timezone).toBe('string');
        expect(body.timezone.length).toBeGreaterThan(0);
        return jsonResponse({ preference: { enabled: true, reminderTime: body.reminderTime, timezone: body.timezone } });
      }
      return jsonResponse({});
    });

    // Permission requested only AFTER this explicit toggle — never on mount.
    expect(global.Notification.requestPermission).not.toHaveBeenCalled();

    render(<Harness />);
    await waitFor(() => expect(screen.getByTestId('status').textContent).toBe('default'));
    const toggle = screen.getByRole('switch');
    expect(toggle.checked).toBe(false);

    await userEvent.click(toggle);

    expect(global.Notification.requestPermission).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(registration.pushManager.subscribe).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(screen.getByTestId('status').textContent).toBe('enabled'));
    expect(screen.getByTestId('reminderTime').textContent).toBe(DEFAULT_REMINDER_TIME);
    expect(screen.getByRole('switch').checked).toBe(true);
  });

  test('enable(): a denied permission never subscribes and never calls /subscribe', async () => {
    const registration = fakeRegistration();
    defineServiceWorkerSupport({ registration });
    global.Notification = { permission: 'default', requestPermission: vi.fn().mockResolvedValue('denied') };

    render(<Harness />);
    await waitFor(() => expect(screen.getByTestId('status').textContent).toBe('default'));
    await userEvent.click(screen.getByRole('switch'));

    await waitFor(() => expect(screen.getByTestId('status').textContent).toBe('denied'));
    expect(registration.pushManager.subscribe).not.toHaveBeenCalled();
    expect(apiFetch).not.toHaveBeenCalledWith('/api/push-notifications/subscribe', expect.anything());
  });

  test('enable(): a rejected /subscribe call surfaces an error state without crashing, and the toggle stays off', async () => {
    const sub = fakeSubscription();
    const registration = fakeRegistration({ newSubscription: sub });
    defineServiceWorkerSupport({ registration });
    defineNotification('default');
    apiFetch.mockImplementation((path) => {
      if (path === '/api/push-notifications/preferences') return jsonResponse({ preference: { enabled: false, reminderTime: null, timezone: null } });
      if (path === '/api/push-notifications/subscribe') return jsonResponse({ error: 'Server error' }, false);
      return jsonResponse({});
    });

    render(<Harness />);
    await waitFor(() => expect(screen.getByTestId('status').textContent).toBe('default'));
    await userEvent.click(screen.getByRole('switch'));

    await waitFor(() => expect(screen.getByTestId('error').textContent).not.toBe(''));
    expect(screen.getByTestId('status').textContent).toBe('default'); // never flips to enabled on failure
    expect(screen.getByRole('switch').checked).toBe(false);
  });
});

describe('usePushNotifications — disable flow (toggle ON -> OFF)', () => {
  test('disable(): PATCHes enabled:false, unsubscribes THIS device, and never touches other devices', async () => {
    const sub = fakeSubscription('https://push.example/this-device');
    const registration = fakeRegistration({ existingSubscription: sub });
    defineServiceWorkerSupport({ registration });
    defineNotification('granted');

    let patchedEnabled = null;
    let unsubscribedEndpoint = null;
    apiFetch.mockImplementation((path, init) => {
      if (path === '/api/push-notifications/preferences' && (!init || !init.method)) {
        return jsonResponse({ preference: { enabled: true, reminderTime: '18:00', timezone: 'Asia/Kolkata' } });
      }
      if (path === '/api/push-notifications/preferences' && init.method === 'PATCH') {
        const body = JSON.parse(init.body);
        patchedEnabled = body.enabled;
        return jsonResponse({ preference: { enabled: false, reminderTime: '18:00', timezone: 'Asia/Kolkata' } });
      }
      if (path === '/api/push-notifications/unsubscribe') {
        unsubscribedEndpoint = JSON.parse(init.body).endpoint;
        return jsonResponse({ ok: true });
      }
      return jsonResponse({});
    });

    render(<Harness />);
    await waitFor(() => expect(screen.getByTestId('status').textContent).toBe('enabled'));
    const toggle = screen.getByRole('switch');
    expect(toggle.checked).toBe(true);
    await userEvent.click(toggle);

    await waitFor(() => expect(patchedEnabled).toBe(false));
    await waitFor(() => expect(unsubscribedEndpoint).toBe('https://push.example/this-device'));
    await waitFor(() => expect(sub.unsubscribe).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(screen.getByRole('switch').checked).toBe(false));
    // Browser notification permission itself is never touched by disable.
  });
});
