/**
 * Observable document store + history (M1-2 / M1-8). A tiny external store that
 * binds to React via useSyncExternalStore (no new state dependency). Holds the
 * single authoritative SubstrataDoc; the reconciler (M1-3) subscribes and
 * re-syncs Fabric on change.
 *
 * History is snapshot-based over the immutable doc. Because every edit returns a
 * NEW doc that structurally shares unchanged layers, snapshots are cheap
 * reference copies; raster pixels live in the content-addressed blob cache (by
 * hash), so they're never duplicated into history. Every user edit goes through
 * `update()`, which is the single choke point history records — so any action
 * built on `update()` is undoable for free. `setDoc()` (load/new) resets history.
 *
 * SSR-safe: module evaluation only sets `state = null` and touches no browser API.
 */

import type { SubstrataDoc } from "./doc-model";

type Listener = () => void;

const HISTORY_LIMIT = 100;

let state: SubstrataDoc | null = null;
const undoStack: SubstrataDoc[] = [];
const redoStack: SubstrataDoc[] = [];
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

/** Replace the whole document (open/new). Resets history — a loaded document
 *  starts with a clean undo stack. */
export function setDoc(next: SubstrataDoc | null): void {
  state = next;
  undoStack.length = 0;
  redoStack.length = 0;
  emit();
}

/**
 * Apply an immutable, undoable edit. Pushes the prior doc onto the undo stack
 * (capped) and clears the redo stack. The mutator MUST return a NEW doc (no
 * in-place mutation) so snapshots and structural sharing stay correct.
 */
export function update(mutator: (doc: SubstrataDoc) => SubstrataDoc): void {
  if (!state) return;
  undoStack.push(state);
  if (undoStack.length > HISTORY_LIMIT) undoStack.shift();
  redoStack.length = 0;
  state = mutator(state);
  emit();
}

export function canUndo(): boolean {
  return undoStack.length > 0;
}

export function canRedo(): boolean {
  return redoStack.length > 0;
}

export function undo(): void {
  if (!state || undoStack.length === 0) return;
  redoStack.push(state);
  state = undoStack.pop()!;
  emit();
}

export function redo(): void {
  if (!state || redoStack.length === 0) return;
  undoStack.push(state);
  state = redoStack.pop()!;
  emit();
}
