/**
 * Onboarding seen-flag (Ruby 2026-07-12): the four-slide intro shows on first
 * visit — or every visit while browser localStorage is unavailable, which is
 * the point (those users need the storage pitch most). Lives in localStorage
 * like the layout prefs — UI ergonomics, not document content, so it is
 * deliberately NOT gated on the storage opt-in. Absorbs the storage-intro
 * card's job (slide 3 carries the opt-in button).
 */

import { getSnapshot } from "./doc-store";
import { closeModal, openModal } from "./modal";

const SEEN_KEY = "substrata:onboarding-seen";

type Listener = () => void;
const listeners = new Set<Listener>();

export function isOnboardingSeen(): boolean {
  try {
    return !!localStorage.getItem(SEEN_KEY);
  } catch {
    return false; // storage blocked entirely → treat every visit as the first
  }
}

export function markOnboardingSeen(): void {
  try {
    localStorage.setItem(SEEN_KEY, "1");
  } catch {
    // storage blocked — the flow will show again next visit, by design
  }
  for (const l of listeners) l();
}

export function subscribeOnboarding(l: Listener): () => void {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
}

/** End the flow (Done button, Esc, overlay click — every close path routes
 *  here): mark it seen and hand over to the New-scene dialog when the session
 *  is still a blank scene (the flow only auto-opens on fresh boots, where
 *  that dialog was deferred to it). Explicit call, NOT an unmount effect —
 *  StrictMode double-invokes effect cleanups in dev. */
export function finishOnboarding(): void {
  markOnboardingSeen();
  const doc = getSnapshot();
  closeModal();
  // fresh boots are doc-LESS until the New-scene dialog lands one — hand
  // over whenever the session hasn't got real content yet
  if (!doc || doc.layers.length === 0) openModal("new-scene");
}
