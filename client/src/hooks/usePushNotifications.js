import { useState, useEffect, useCallback, useMemo } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { apiFetch } from '../api';

// Push Notifications v1 — capability detection and the ON/OFF subscribe/
// disable flow for the Account settings "Notifications" toggle. Never
// requests browser permission on its own; `enable()` only ever runs from an
// athlete's explicit tap (see AccountPage.jsx).
//
// The athlete does not choose a reminder time — v1 uses one fixed,
// system-defined local reminder window (see DEFAULT_REMINDER_TIME) for
// every athlete, computed against their own IANA timezone (captured here,
// automatically, only at enable time — never asked of the athlete). The
// server/schema still have a per-row `reminderTime` column (kept, unused
// by any UI) purely so this can become configurable again later without a
// schema change — see routes/pushNotifications.js and
// services/pushScheduler.js for the read side of that.
export const DEFAULT_REMINDER_TIME = '18:00';

// Standard VAPID-key conversion (browser applicationServerKey wants a
// Uint8Array, the env var is the usual URL-safe base64 string).
function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; i++) outputArray[i] = rawData.charCodeAt(i);
  return outputArray;
}

export function isIOSDevice() {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent || '';
  // iPadOS 13+ reports as "Macintosh" but exposes touch — the standard
  // sniff for telling it apart from real desktop Safari.
  return /iPad|iPhone|iPod/.test(ua) || (ua.includes('Macintosh') && typeof document !== 'undefined' && 'ontouchend' in document);
}

function ageFromDob(dob) {
  const birth = new Date(dob);
  const now = new Date();
  let years = now.getFullYear() - birth.getFullYear();
  const m = now.getMonth() - birth.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < birth.getDate())) years -= 1;
  return years;
}

// One of: 'unsupported' | 'ios-unsupported' | 'consent-required' |
// 'loading' | 'denied' | 'default' | 'enabled'
export function usePushNotifications() {
  const { user, token } = useAuth();

  const [preference, setPreference] = useState(null);
  const [preferenceLoaded, setPreferenceLoaded] = useState(!token);
  const [permission, setPermission] = useState(() =>
    (typeof Notification !== 'undefined') ? Notification.permission : 'default'
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const supported =
    typeof window !== 'undefined' &&
    typeof navigator !== 'undefined' &&
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    typeof Notification !== 'undefined';

  const guardianBlocked = useMemo(() => {
    if (!user?.dateOfBirth) return false;
    if (user.guardianConsentAt) return false;
    return ageFromDob(user.dateOfBirth) < 18;
  }, [user?.dateOfBirth, user?.guardianConsentAt]);

  useEffect(() => {
    if (!token) { setPreferenceLoaded(true); return; }
    let cancelled = false;
    apiFetch('/api/push-notifications/preferences', { headers: { Authorization: `Bearer ${token}` } })
      .then(r => (r.ok ? r.json() : null))
      .then(data => { if (!cancelled && data) setPreference(data.preference); })
      .catch(() => {})
      .finally(() => { if (!cancelled) setPreferenceLoaded(true); });
    return () => { cancelled = true; };
  }, [token]);

  const status = useMemo(() => {
    if (!supported) return isIOSDevice() ? 'ios-unsupported' : 'unsupported';
    if (guardianBlocked) return 'consent-required';
    if (permission === 'denied') return 'denied';
    if (!preferenceLoaded) return 'loading';
    if (preference?.enabled) return 'enabled';
    return 'default';
  }, [supported, guardianBlocked, permission, preferenceLoaded, preference]);

  // Steps 3-10 of the subscribe flow (support + guardian-consent checks
  // are steps 1-2, already covered by `status` above — enable() is only
  // ever called from a UI state where status is 'default'). Always uses
  // the one fixed system reminder time — the athlete never supplies one.
  const enable = useCallback(async () => {
    if (!supported || guardianBlocked || busy) return;
    setError('');
    setBusy(true);
    try {
      const perm = await Notification.requestPermission();
      setPermission(perm);
      if (perm !== 'granted') return; // 'denied' or 'default' — status reflects it, nothing more to do

      const reg = await navigator.serviceWorker.ready;
      let sub = await reg.pushManager.getSubscription();
      if (!sub) {
        const vapidKey = import.meta.env.VITE_VAPID_PUBLIC_KEY;
        if (!vapidKey) {
          setError('config');
          return;
        }
        sub = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(vapidKey),
        });
      }

      // IANA timezone is captured here automatically — the athlete is
      // never asked to configure it. This is the only place it's read.
      const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
      const res = await apiFetch('/api/push-notifications/subscribe', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ subscription: sub.toJSON(), reminderTime: DEFAULT_REMINDER_TIME, timezone }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        setPreference(data.preference);
      } else {
        setError(data.error || 'error');
      }
    } catch {
      setError('error');
    } finally {
      setBusy(false);
    }
  }, [supported, guardianBlocked, busy, token]);

  // "Turn off notifications": disables the preference globally AND
  // disables + unsubscribes THIS browser's own device — see
  // routes/pushNotifications.js POST /unsubscribe. Other devices, if any,
  // are left alone; the disabled preference stops them from ever being
  // sent to regardless.
  const disable = useCallback(async () => {
    if (!token || busy) return;
    setError('');
    setBusy(true);
    try {
      const res = await apiFetch('/api/push-notifications/preferences', {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: false }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) setPreference(data.preference);
      else setError(data.error || 'error');

      if (supported) {
        try {
          const reg = await navigator.serviceWorker.ready;
          const sub = await reg.pushManager.getSubscription();
          if (sub) {
            await apiFetch('/api/push-notifications/unsubscribe', {
              method: 'POST',
              headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
              body: JSON.stringify({ endpoint: sub.endpoint }),
            }).catch(() => {});
            await sub.unsubscribe().catch(() => {});
          }
        } catch {
          // best-effort only — the server-side preference disable above
          // already stops any further sends regardless of this outcome
        }
      }
    } finally {
      setBusy(false);
    }
  }, [token, busy, supported]);

  return { status, preference, busy, error, enable, disable };
}
