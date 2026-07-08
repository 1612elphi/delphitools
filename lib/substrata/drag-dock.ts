/**
 * Drag-to-dock (workspace polish, Ruby 2026-07-08): direct manipulation
 * replaces the old Workspace-menu dock rows. The drag itself runs on dnd-kit —
 * module grips and the omnibar grip are useDraggable sources, dock-zones.tsx
 * renders useDroppable targets, and the shell's DndContext dispatches the
 * drop into dock-pref/pin-pref (which already persist). This store only
 * broadcasts "what is being dragged" so the zones overlay (a different React
 * subtree) knows to render.
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
