import { useCallback, useEffect, useRef, useState } from 'react';
import { apiFetch } from '../api';

// Starting Performance Profile (PR 3).
//
// One profile per completed onboarding attempt, created server-side on first
// read. This hook owns the three calls the page needs — load, confirm, start
// chat — and nothing else. It never interprets the athlete: every word shown
// comes from the server payload.

export function useStartingProfile(token) {
  const [phase, setPhase] = useState('loading'); // loading | ready | error | incomplete
  const [profile, setProfile] = useState(null);
  const [consent, setConsent] = useState({ pending: false, guardianEmailMasked: null });
  const [safetyGuidance, setSafetyGuidance] = useState(null);
  const mounted = useRef(true);

  useEffect(() => () => { mounted.current = false; }, []);

  const auth = useCallback(
    (init = {}) => ({ ...init, headers: { ...(init.headers || {}), Authorization: `Bearer ${token}` } }),
    [token]
  );

  const applyPayload = useCallback((data) => {
    if (!mounted.current) return;
    if (data?.profile) setProfile(data.profile);
    if (data?.consent) setConsent(data.consent);
    setSafetyGuidance(data?.safetyFlag ? data.guidance || null : null);
  }, []);

  const load = useCallback(async () => {
    if (!token) return;
    setPhase('loading');
    try {
      const res = await apiFetch('/api/profile/starting', auth());
      if (res.status === 422) { if (mounted.current) setPhase('incomplete'); return; }
      if (!res.ok) { if (mounted.current) setPhase('error'); return; }
      const data = await res.json();
      applyPayload(data);
      if (mounted.current) setPhase('ready');
    } catch {
      if (mounted.current) setPhase('error');
    }
  }, [token, auth, applyPayload]);

  useEffect(() => { load(); }, [load]);

  // fit: 'CONFIRMED' | 'PARTLY' | 'NOT_REALLY'
  const confirm = useCallback(async ({ fit, agreedPriorityId, correctionSelectedId, correctionText }) => {
    try {
      const res = await apiFetch('/api/profile/confirm', auth({
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fit, agreedPriorityId, correctionSelectedId, correctionText }),
      }));
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        return { ok: false, error: err.error || 'ERROR' };
      }
      const data = await res.json();
      applyPayload(data);
      return { ok: true, safetyFlag: data.safetyFlag || null };
    } catch {
      return { ok: false, error: 'NETWORK' };
    }
  }, [auth, applyPayload]);

  const startChat = useCallback(async () => {
    try {
      const res = await apiFetch('/api/profile/start-chat', auth({ method: 'POST' }));
      if (res.status === 403) {
        // Guardian consent landed as pending between load and tap.
        if (mounted.current) setConsent((c) => ({ ...c, pending: true }));
        return { ok: false, error: 'CONSENT_REQUIRED' };
      }
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        return { ok: false, error: err.error || 'ERROR' };
      }
      const data = await res.json();
      return { ok: true, chatSessionId: data.chatSessionId };
    } catch {
      return { ok: false, error: 'NETWORK' };
    }
  }, [auth]);

  return { phase, profile, consent, safetyGuidance, reload: load, confirm, startChat };
}

export default useStartingProfile;
