// Smallest possible client-only coordination primitive so two unrelated
// full-screen overlays never compete for the screen at once: the App
// Update Prompt (PWA) and the Pilot Communication popup (product/feedback
// channel). This file knows about NEITHER domain — it is a single
// one-way boolean latch ("has a genuine update been detected at any
// point during this app load"), nothing more. It is not a generic
// notification platform, not a queue, not a priority registry for
// arbitrary future overlays — just the one flag the current two
// participants need.
//
// Deliberately a LATCH, not a live mirror of "is the update prompt
// currently visible": once a real update is detected, Pilot
// Communication must stay suppressed for the REST of this app load —
// including after the athlete dismisses the update prompt via Later, so
// there is never a moment where the athlete, having just been told their
// client is stale, is handed a different overlay to interact with
// instead. Only a genuine new app load (a fresh JS module instance) ever
// clears this — never a click, never a timer.
//
// AppUpdatePrompt is the ONLY writer (via markUpdateDetected, called once
// needRefresh is ever true — never unset by Later or by the prompt
// closing). Anything that must defer to it — today, only
// PilotCommunicationPopup — is a reader via useIsUpdateDetected(). Neither
// side imports the other's file; both only import this one neutral
// module. No React Context/Provider is needed: useSyncExternalStore
// (built into React 18, no new dependency) makes a plain module-level
// value reactive on its own. In-memory only — no localStorage/
// sessionStorage — so this never persists across a real reload/reopen.

import { useSyncExternalStore } from 'react';

let updateDetected = false;
const listeners = new Set();

// Called only by AppUpdatePrompt, the first (and only the first) time
// needRefresh becomes true during this app load. Idempotent — a later
// call (or Later, or the prompt closing) never unsets it.
export function markUpdateDetected() {
  if (updateDetected) return;
  updateDetected = true;
  listeners.forEach((l) => l());
}

function subscribe(onStoreChange) {
  listeners.add(onStoreChange);
  return () => listeners.delete(onStoreChange);
}

function getSnapshot() {
  return updateDetected;
}

// Called only by PilotCommunicationPopup, to suppress its own render for
// the rest of this app load once a genuine update has ever been
// detected — reactive, so it also hides itself immediately if an update
// is detected after it was already showing, and stays hidden even after
// the athlete taps Later on the update prompt.
export function useIsUpdateDetected() {
  return useSyncExternalStore(subscribe, getSnapshot);
}

// Test-only seam — resets the shared latch between test cases. Never
// called from app code.
export function __resetOverlayPriorityForTests() {
  updateDetected = false;
  listeners.clear();
}
