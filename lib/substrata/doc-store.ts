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

/**
 * Coalesced (transient) edits for continuous gestures — an opacity slider drag,
 * a value scrubber, a colour drag. Such a gesture emits many intermediate values;
 * we want the canvas to update live but the whole gesture to be ONE undo step.
 *
 *   beginTransient()   captures the pre-gesture doc (no history change yet)
 *   updateTransient()  applies a live value + emits, WITHOUT recording history
 *   commitTransient()  records that single pre-gesture snapshot — only if the
 *                      doc actually changed during the gesture
 *
 * Assumes gestures are atomic (no unrelated `update()` runs mid-gesture).
 */
let transientBase: SubstrataDoc | null = null;

/** True while a coalesced gesture is in flight — consumers may swap to cheaper
 *  live rendering (e.g. the filter sync's preview downscale) until commit. */
export function isGestureActive(): boolean {
  return transientBase !== null;
}

export function beginTransient(): void {
  transientBase = state;
}

export function updateTransient(mutator: (doc: SubstrataDoc) => SubstrataDoc): void {
  if (!state) return;
  state = mutator(state);
  emit();
}

/** Abandon the open transient gesture: restore the pre-gesture doc and record
 *  nothing — the cancel counterpart to commitTransient. Used when two-finger
 *  navigation takes over a half-drawn gesture. */
export function rollbackTransient(): void {
  if (transientBase === null) return;
  state = transientBase;
  transientBase = null;
  emit();
}

export function commitTransient(): void {
  const base = transientBase;
  transientBase = null;
  // Always emit: subscribers rendering a cheaper live form during the gesture
  // (preview-downscaled filters) need one post-gesture pass to settle at full
  // quality, even when the value ends where it started.
  emit();
  if (!state || !base || state === base) return; // nothing actually changed
  undoStack.push(base);
  if (undoStack.length > HISTORY_LIMIT) undoStack.shift();
  redoStack.length = 0;
}

export function canUndo(): boolean {
  return undoStack.length > 0;
}

export function canRedo(): boolean {
  return redoStack.length > 0;
}

export function undo(): void {
  // The transient contract assumes gestures are atomic — an undo landing
  // MID-gesture (⌘Z reflex while a drag is down) pops history under the open
  // transient base, and the commit then pushes that stale base as a bogus
  // step (undo starts re-ADDING content). Ignore history jumps until commit.
  if (!state || undoStack.length === 0 || isGestureActive()) return;
  redoStack.push(state);
  state = undoStack.pop()!;
  emit();
}

export function redo(): void {
  if (!state || redoStack.length === 0 || isGestureActive()) return;
  undoStack.push(state);
  state = redoStack.pop()!;
  emit();
}
