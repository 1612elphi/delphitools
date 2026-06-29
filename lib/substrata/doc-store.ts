/**
 * DRAFT observable document store (M1-2). A tiny external store designed to bind
 * to React via useSyncExternalStore (no new state dependency). Holds the single
 * authoritative SubstrataDoc; the reconciler (M1-3) subscribes and re-syncs
 * Fabric on change.
 *
 * ⚠️ DRAFT — mutations here are placeholders. Real action creators must route
 * through the command/patch history (M1-8) so undo/redo works; do NOT build
 * features on top of `update()` directly until that lands.
 *
 * SSR-safe: module evaluation only sets `state = null` and touches no browser
 * API.
 */

import type { SubstrataDoc } from "./doc-model";

type Listener = () => void;

let state: SubstrataDoc | null = null;
const listeners = new Set<Listener>();

function emit(): void {
  for (const l of listeners) l();
}

/** useSyncExternalStore-compatible reader. */
export function getSnapshot(): SubstrataDoc | null {
  return state;
}

/** useSyncExternalStore-compatible subscriber; returns an unsubscribe fn. */
export function subscribe(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Replace the whole document (e.g. on open/new). */
export function setDoc(next: SubstrataDoc | null): void {
  state = next;
  emit();
}

/**
 * Apply an immutable update. DRAFT: bypasses history — every real edit must go
 * through M1-8 instead. The mutator must return a NEW doc (no in-place
 * mutation) so future structural sharing / patching stays correct.
 */
export function update(mutator: (doc: SubstrataDoc) => SubstrataDoc): void {
  if (!state) return;
  state = mutator(state);
  emit();
}
