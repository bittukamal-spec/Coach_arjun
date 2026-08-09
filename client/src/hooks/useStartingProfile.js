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
  // Monotonic id for the newest in-flight load. Only the newest one is allowed
  // to write state, so a slow earlier response can never overwrite a newer one.
  const loadSeq = useRef(0);

  // The effect body MUST re-arm `mounted` — a cleanup-only effect is a latent
  // bug under React 18 StrictMode, which in development mounts, cleans up, then
  // remounts. The cleanup set the ref to false and nothing ever set it back, so
  // every later `if (mounted.current)` guard failed and the profile stayed on
  // its loading skeleton forever in `npm run dev`. Production ran effects once
  // and was unaffected, which is why this survived to here.
  //
  // This effect is declared BEFORE the load effect below, so on the StrictMode
  // remount `mounted` is already true again by the time `load()` runs.
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

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
    // Claim this load. `fresh()` is false once the component unmounts OR once a
    // newer load starts, so the StrictMode double-invoke (and a Retry tapped
    // mid-flight) settle on the newest response instead of racing.
    const seq = ++loadSeq.current;
    const fresh = () => mounted.current && seq === loadSeq.current;
    setPhase('loading');
    try {
      const res = await apiFetch('/api/profile/starting', auth());
      if (res.status === 422) { if (fresh()) setPhase('incomplete'); return; }
      if (!res.ok) { if (fresh()) setPhase('error'); return; }
      const data = await res.json();
      if (!fresh()) return;
      applyPayload(data);
      setPhase('ready');
    } catch {
      if (fresh()) setPhase('error');
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

  // Changes the athlete's CURRENT focus. Writes only the focus row server-side
  // — the starting profile stays frozen, and no coaching cycle, prescription,
  // chat session or message is created. On success the local profile is patched
  // in place so the card updates immediately without a refetch (which would
  // otherwise look like the profile had been regenerated).
  const changeFocus = useCallback(async ({ focusId, customText }) => {
    try {
      const res = await apiFetch('/api/profile/current-focus', auth({
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ focusId, customText }),
      }));
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        return { ok: false, error: err.error || 'ERROR' };
      }
      const data = await res.json();
      if (!data.saved) {
        // Safety-flagged custom text: nothing was stored.
        if (mounted.current) setSafetyGuidance(data.guidance || null);
        return { ok: false, error: 'NEEDS_SUPPORT' };
      }
      if (mounted.current && data.currentFocus) {
        setProfile((p) => (p ? {
          ...p,
          displayProfile: { ...(p.displayProfile || {}), currentFocus: data.currentFocus },
        } : p));
      }
      return { ok: true, currentFocus: data.currentFocus };
    } catch {
      return { ok: false, error: 'NETWORK' };
    }
  }, [auth]);

  // Performance Check-in save. Writes only the narrow, server-whitelisted set
  // of question ids (goals/supports/strengths/the athlete's own pattern
  // branch) — see profileService.updateProfileAnswers on the server for the
  // full safety contract. On success the local profile is replaced with the
  // server's fresh response so the page reflects the recomputed pattern/
  // chips immediately, without a second round-trip.
  const updateAnswers = useCallback(async (answers) => {
    try {
      const res = await apiFetch('/api/profile/answers', auth({
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ answers }),
      }));
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        return { ok: false, error: err.error || 'ERROR', questionId: err.questionId };
      }
      const data = await res.json();
      applyPayload(data);
      return { ok: true };
    } catch {
      return { ok: false, error: 'NETWORK' };
    }
  }, [auth, applyPayload]);

  return { phase, profile, consent, safetyGuidance, reload: load, confirm, startChat, changeFocus, updateAnswers };
}

export default useStartingProfile;
