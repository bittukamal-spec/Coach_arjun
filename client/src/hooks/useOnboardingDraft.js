import { useCallback, useEffect, useRef, useState } from 'react';

// Local-only draft recovery for onboarding (PR 1).
//
// This is a UX convenience, NOT the structured, versioned, server-side
// progress store — that is explicitly PR 2's job and will replace this. It
// keeps the athlete's in-progress answers and current screen in
// localStorage, keyed by the authenticated user id, so a refresh or an
// accidental back-navigation mid-flow doesn't wipe everything.
//
// Contract:
//   - restore the saved draft for THIS user on mount (ignore drafts written
//     by a different user id on a shared device)
//   - persist on every change
//   - clearDraft() on successful submit, or when the caller detects a stale
//     draft (e.g. onboarding already complete)
//   - a submit FAILURE must NOT clear the draft (caller simply doesn't call
//     clearDraft), so the athlete can retry without re-answering
//
// Storage shape: { v, userId, data } where `data` is the caller's opaque
// draft object. `v` lets a future change invalidate incompatible drafts
// without throwing.

const DRAFT_VERSION = 1;
const keyFor = (userId) => `arjun_onboarding_draft_${userId}`;

function readDraft(userId) {
  if (!userId) return null;
  try {
    const raw = localStorage.getItem(keyFor(userId));
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || parsed.v !== DRAFT_VERSION || parsed.userId !== userId) return null;
    return parsed.data ?? null;
  } catch {
    return null;
  }
}

// useOnboardingDraft(userId, initialData)
//   returns { data, setData, clearDraft, restored }
// `restored` is true when a saved draft was loaded on mount (useful for an
// optional "we kept your answers" affordance and for tests).
export function useOnboardingDraft(userId, initialData) {
  const restoredRef = useRef(false);
  const [data, setData] = useState(() => {
    const saved = readDraft(userId);
    if (saved) {
      restoredRef.current = true;
      return { ...initialData, ...saved };
    }
    return initialData;
  });

  // Persist on every change (once we have a user id to key by).
  useEffect(() => {
    if (!userId) return;
    try {
      localStorage.setItem(
        keyFor(userId),
        JSON.stringify({ v: DRAFT_VERSION, userId, data })
      );
    } catch {
      // localStorage full / unavailable (private mode) — in-memory state
      // still works for the current session; draft recovery just no-ops.
    }
  }, [userId, data]);

  const clearDraft = useCallback(() => {
    if (!userId) return;
    try {
      localStorage.removeItem(keyFor(userId));
    } catch {
      // ignore — nothing else depends on the removal succeeding
    }
  }, [userId]);

  return { data, setData, clearDraft, restored: restoredRef.current };
}

export default useOnboardingDraft;
