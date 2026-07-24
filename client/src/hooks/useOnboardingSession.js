import { useCallback, useEffect, useRef, useState } from 'react';
import { apiFetch } from '../api';

// Server-authoritative onboarding session with a local recovery cache.
//
// Authority is the integer `revision`, never a timestamp. The server draft
// wins; localStorage is only a recovery cache for unsaved edits after a failed
// network save. On load we reconcile:
//   - no pending local edits            → hydrate from server
//   - pending edits, revisions match    → replay them via PATCH
//   - pending edits, server is newer    → surface a conflict choice
// A more recent valid local answer is never silently discarded.

const cacheKey = (userId) => `arjun_onboarding_v2_${userId}`;
const VERSION = 2;

function readCache(userId) {
  try {
    const raw = localStorage.getItem(cacheKey(userId));
    if (!raw) return null;
    const c = JSON.parse(raw);
    if (c.userId !== userId) return null;
    return c;
  } catch {
    return null;
  }
}
function writeCache(userId, data) {
  try {
    localStorage.setItem(cacheKey(userId), JSON.stringify({ userId, ...data }));
  } catch {
    /* private mode / quota — in-memory state still works this session */
  }
}
function clearCache(userId) {
  try { localStorage.removeItem(cacheKey(userId)); } catch { /* ignore */ }
}

function authHeaders(token) {
  return { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` };
}

export function useOnboardingSession(userId, token) {
  const [phase, setPhase] = useState('loading'); // loading | ready | error
  const [session, setSession] = useState(null);
  const [saveState, setSaveState] = useState('idle'); // idle | saving | error
  const [conflict, setConflict] = useState(null); // null | { serverSession, localAnswers, dirty }
  const lastSaveRef = useRef(null); // { answers, currentStepId } for retry

  const hydrate = useCallback((s) => {
    setSession(s);
    writeCache(userId, { baseRevision: s.revision, answers: s.answers || {}, dirty: [], currentStepId: s.currentStepId });
  }, [userId]);

  // ── Initial load + reconciliation ─────────────────────────────────────────
  // Extracted so Retry can re-run it in place, without a full page refresh.
  const runLoad = useCallback(async (isCancelled = () => false) => {
    try {
      const res = await apiFetch('/api/onboarding/session', { headers: authHeaders(token) });
      if (!res.ok) { if (!isCancelled()) setPhase('error'); return; }
      const { session: server } = await res.json();
      if (isCancelled()) return;

      const cache = readCache(userId);
      const hasPending = cache && Array.isArray(cache.dirty) && cache.dirty.length > 0;

      if (server.status === 'COMPLETED' || !hasPending) {
        hydrate(server);
        setPhase('ready');
        return;
      }
      if (cache.baseRevision === server.revision) {
        // Replay pending edits.
        const pending = {};
        for (const qid of cache.dirty) if (cache.answers[qid]) pending[qid] = cache.answers[qid];
        const r = await apiFetch('/api/onboarding/session', {
          method: 'PATCH',
          headers: authHeaders(token),
          body: JSON.stringify({ onboardingVersion: VERSION, expectedRevision: cache.baseRevision, currentStepId: cache.currentStepId, answers: pending }),
        });
        if (isCancelled()) return;
        if (r.ok) { const { session: fresh } = await r.json(); hydrate(fresh); }
        else if (r.status === 409) { const body = await r.json(); setSession(server); setConflict({ serverSession: body.session, localAnswers: cache.answers, dirty: cache.dirty }); }
        else { setSession(server); setSaveState('error'); }
        setPhase('ready');
        return;
      }
      // Server advanced beyond our base while we had unsaved edits → conflict.
      setSession(server);
      setConflict({ serverSession: server, localAnswers: cache.answers, dirty: cache.dirty });
      setPhase('ready');
    } catch {
      if (!isCancelled()) setPhase('error');
    }
  }, [userId, token, hydrate]);

  useEffect(() => {
    let cancelled = false;
    runLoad(() => cancelled);
    return () => { cancelled = true; };
  }, [runLoad]);

  // Retry the initial session request in place: reset to the loading state,
  // clear any stale conflict/save flags, and re-run the load. Recovers from a
  // failed initial GET without reloading the page.
  const reload = useCallback(() => {
    setPhase('loading');
    setConflict(null);
    setSaveState('idle');
    return runLoad();
  }, [runLoad]);

  // ── Save (PATCH) ──────────────────────────────────────────────────────────
  const save = useCallback(async (changedAnswers, nextStepId) => {
    if (!session) return { ok: false };
    lastSaveRef.current = { answers: changedAnswers, currentStepId: nextStepId };
    setSaveState('saving');
    try {
      const res = await apiFetch('/api/onboarding/session', {
        method: 'PATCH',
        headers: authHeaders(token),
        body: JSON.stringify({ onboardingVersion: VERSION, expectedRevision: session.revision, currentStepId: nextStepId, answers: changedAnswers }),
      });
      if (res.ok) {
        const { session: fresh, prunedQuestionIds } = await res.json();
        hydrate(fresh);
        setSaveState('idle');
        return { ok: true, prunedQuestionIds: prunedQuestionIds || [], session: fresh };
      }
      if (res.status === 409) {
        const body = await res.json();
        setSaveState('idle');
        setConflict({ serverSession: body.session, localAnswers: { ...(session.answers || {}), ...changedAnswers }, dirty: Object.keys(changedAnswers) });
        return { ok: false, conflict: true };
      }
      const body = await res.json().catch(() => ({}));
      // Persist pending locally so a refresh can recover / retry.
      const cache = readCache(userId) || { baseRevision: session.revision, answers: session.answers || {}, dirty: [], currentStepId: session.currentStepId };
      cache.answers = { ...cache.answers, ...changedAnswers };
      cache.dirty = Array.from(new Set([...(cache.dirty || []), ...Object.keys(changedAnswers)]));
      cache.currentStepId = nextStepId;
      writeCache(userId, cache);
      setSaveState('error');
      return { ok: false, error: body.error || 'SAVE_FAILED', code: body.error, questionId: body.questionId };
    } catch {
      const cache = readCache(userId) || { baseRevision: session.revision, answers: session.answers || {}, dirty: [], currentStepId: session.currentStepId };
      cache.answers = { ...cache.answers, ...changedAnswers };
      cache.dirty = Array.from(new Set([...(cache.dirty || []), ...Object.keys(changedAnswers)]));
      cache.currentStepId = nextStepId;
      writeCache(userId, cache);
      setSaveState('error');
      return { ok: false, error: 'NETWORK' };
    }
  }, [session, token, userId, hydrate]);

  const retryLast = useCallback(() => {
    if (!lastSaveRef.current) return Promise.resolve({ ok: false });
    return save(lastSaveRef.current.answers, lastSaveRef.current.currentStepId);
  }, [save]);

  // ── Complete ──────────────────────────────────────────────────────────────
  const complete = useCallback(async (expectedRevision) => {
    if (!session) return { ok: false };
    const rev = expectedRevision ?? session.revision;
    setSaveState('saving');
    try {
      const res = await apiFetch('/api/onboarding/session/complete', {
        method: 'POST',
        headers: authHeaders(token),
        body: JSON.stringify({ onboardingVersion: VERSION, expectedRevision: rev }),
      });
      const body = await res.json().catch(() => ({}));
      if (res.ok) { clearCache(userId); setSaveState('idle'); return { ok: true, user: body.user, session: body.session }; }
      if (res.status === 422) { setSaveState('idle'); return { ok: false, missing: body.missing || [] }; }
      if (res.status === 409) { setSaveState('idle'); setConflict({ serverSession: body.session, localAnswers: session.answers, dirty: [] }); return { ok: false, conflict: true }; }
      setSaveState('error');
      return { ok: false, error: body.error || 'COMPLETE_FAILED' };
    } catch {
      setSaveState('error');
      return { ok: false, error: 'NETWORK' };
    }
  }, [session, token, userId]);

  // ── Conflict resolution ───────────────────────────────────────────────────
  const resolveConflictUseServer = useCallback(() => {
    if (!conflict) return;
    hydrate(conflict.serverSession);
    setConflict(null);
    setSaveState('idle');
  }, [conflict, hydrate]);

  const resolveConflictReapplyLocal = useCallback(async () => {
    if (!conflict) return { ok: false };
    const server = conflict.serverSession;
    setSession(server);
    const pending = {};
    for (const qid of conflict.dirty) if (conflict.localAnswers[qid]) pending[qid] = conflict.localAnswers[qid];
    setConflict(null);
    return save(pending, server.currentStepId);
  }, [conflict, save]);

  return {
    phase, session, saveState, conflict,
    save, complete, retryLast, reload,
    resolveConflictUseServer, resolveConflictReapplyLocal,
  };
}

export default useOnboardingSession;
