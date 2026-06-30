/**
 * Dock layout preference (§7 Workspace) — the modular docking system: which edge
 * the omnibar docks to, where the rail sits, and each module's dock target
 * (left/right sidebar or the rail). One store, one listener set; components read
 * what they need. Transient/in-memory for now — layout persistence is opt-in and
 * rides the persistence preference when it lands.
 */

import type { ModuleId } from "./pin-pref";

export type Edge = "top" | "bottom" | "left" | "right";
/** Rail position: "follow" = attached to the omnibar's edge; else its own edge. */
export type RailEdge = "follow" | Edge;
/** Where a pinned module renders. */
export type DockTarget = "rail" | "left" | "right";

let omnibarEdge: Edge = "bottom";
let railEdge: RailEdge = "follow";
let moduleDock: Record<ModuleId, DockTarget> = {
  layers: "left",
  effects: "rail",
  inspector: "right",
  colour: "rail",
  export: "rail",
  csize: "rail",
  align: "rail",
  rotate: "rail",
};

const listeners = new Set<() => void>();
function emit() {
  for (const l of listeners) l();
}

export function getOmnibarEdge(): Edge {
  return omnibarEdge;
}
export function setOmnibarEdge(edge: Edge): void {
  if (edge === omnibarEdge) return;
  omnibarEdge = edge;
  emit();
}

export function getRailEdge(): RailEdge {
  return railEdge;
}
export function setRailEdge(edge: RailEdge): void {
  if (edge === railEdge) return;
  railEdge = edge;
  emit();
}

/** Stable map ref (reassigned on change) for useSyncExternalStore. */
export function getModuleDockAll(): Readonly<Record<ModuleId, DockTarget>> {
  return moduleDock;
}
export function getModuleDock(id: ModuleId): DockTarget {
  return moduleDock[id];
}
export function setModuleDock(id: ModuleId, target: DockTarget): void {
  if (moduleDock[id] === target) return;
  moduleDock = { ...moduleDock, [id]: target };
  emit();
}

export function subscribeDock(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
