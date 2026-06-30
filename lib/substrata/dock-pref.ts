/**
 * Dock layout preference (§7 Workspace). Which edge the omnibar docks to. The
 * first slice of the modular docking system; rail position + per-module docking
 * join later. Transient/in-memory for now — layout persistence is opt-in and
 * rides the persistence preference when it lands.
 */

export type Edge = "top" | "bottom" | "left" | "right";

let omnibarEdge: Edge = "bottom";
const listeners = new Set<() => void>();

export function getOmnibarEdge(): Edge {
  return omnibarEdge;
}

export function setOmnibarEdge(edge: Edge): void {
  if (edge === omnibarEdge) return;
  omnibarEdge = edge;
  for (const l of listeners) l();
}

export function subscribeDock(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
