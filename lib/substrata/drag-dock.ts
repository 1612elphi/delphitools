/**
 * Drag-to-dock (workspace polish, Ruby 2026-07-08): direct manipulation
 * replaces the old Workspace-menu dock rows — module headers and the omnibar
 * grip are drag SOURCES; the DockZones overlay renders the targets, tracks the
 * pointer, and performs the drop. This store is only the transient "what is
 * being dragged" state between them. Not persisted, not undoable — the drop
 * lands in dock-pref/pin-pref, which already persist.
 */

import type { ModuleId } from "./pin-pref";

export type DockDrag = { kind: "module"; id: ModuleId } | { kind: "omnibar" };

let active: DockDrag | null = null;
const listeners = new Set<() => void>();

export function getDockDrag(): DockDrag | null {
  return active;
}

export function subscribeDockDrag(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function startDockDrag(drag: DockDrag): void {
  active = drag;
  for (const l of listeners) l();
}

export function endDockDrag(): void {
  if (!active) return;
  active = null;
  for (const l of listeners) l();
}

/** How far the pointer must travel before a press becomes a drag. */
const THRESHOLD = 4;

/**
 * Source-side helper: call from a grip's pointerdown. The drag only starts
 * once the pointer moves past the threshold, so plain clicks stay clicks;
 * from there the DockZones overlay owns tracking and the drop.
 */
export function beginDockDragFromPointer(
  e: { clientX: number; clientY: number },
  drag: DockDrag,
): void {
  const sx = e.clientX;
  const sy = e.clientY;
  const cleanup = () => {
    window.removeEventListener("pointermove", onMove);
    window.removeEventListener("pointerup", onUp);
  };
  const onMove = (me: PointerEvent) => {
    if (Math.hypot(me.clientX - sx, me.clientY - sy) < THRESHOLD) return;
    cleanup();
    startDockDrag(drag);
  };
  const onUp = () => cleanup();
  window.addEventListener("pointermove", onMove);
  window.addEventListener("pointerup", onUp);
}
