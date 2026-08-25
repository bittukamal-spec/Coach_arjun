// Smallest possible client-only coordination primitive so two unrelated
// full-screen overlays never compete for the screen at once: the App
// Update Prompt (PWA) and the Pilot Communication popup (product/feedback
// channel). This file knows about NEITHER domain — it is a single boolean
// signal ("is the higher-priority overlay currently active"), nothing
// more. It is not a generic notification platform, not a queue, not a
// priority registry for arbitrary future overlays — just the one flag the
// current two participants need.
//
// AppUpdatePrompt is the ONLY writer (via setUpdatePromptActive). Anything
// that must defer to it — today, only PilotCommunicationPopup — is a
// reader via useIsUpdatePromptActive(). Neither side imports the other's
// file; both only import this one neutral module. No React Context/
// Provider is needed: useSyncExternalStore (built into React 18, no new
// dependency) makes a plain module-level value reactive on its own.

import { useSyncExternalStore } from 'react';

let active = false;
const listeners = new Set();

// Called only by AppUpdatePrompt, whenever its own needRefresh state
// changes (true while the update prompt is on screen, false once
// dismissed via Later or once a reload is underway).
export function setUpdatePromptActive(value) {
  if (active === value) return;
  active = value;
  listeners.forEach((l) => l());
}

function subscribe(onStoreChange) {
  listeners.add(onStoreChange);
  return () => listeners.delete(onStoreChange);
}

function getSnapshot() {
  return active;
}

// Called only by PilotCommunicationPopup, to suppress its own render
// while the update prompt is active — reactive, so it also hides itself
// immediately if the update prompt becomes active after it was already
// showing, and reappears immediately once the update prompt is dismissed
// (Later) within the same app load.
export function useIsUpdatePromptActive() {
  return useSyncExternalStore(subscribe, getSnapshot);
}

// Test-only seam — resets the shared flag between test cases. Never
// called from app code.
export function __resetOverlayPriorityForTests() {
  active = false;
  listeners.clear();
}
