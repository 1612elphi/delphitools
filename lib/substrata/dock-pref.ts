/**
 * Dock layout preference (§7 Workspace) — the modular docking system: which edge
 * the omnibar docks to, where the rail sits, and each module's dock target
 * (left/right sidebar or the rail). One store, one listener set; components read
 * what they need. Persisted to localStorage (UI ergonomics, not document content
 * — see layout-storage), so a layout survives reloads.
 */

import { loadLayout, saveLayout } from "./layout-storage";
import { MODULE_IDS, hydratePins, type ModuleId } from "./pin-pref";

export type Edge = "top" | "bottom" | "left" | "right";
/** Rail position: "follow" = attached to the omnibar's edge; else its own edge. */
export type RailEdge = "follow" | Edge;
/** Where a pinned module renders. */
export type DockTarget = "rail" | "left" | "right";

const EDGES: readonly Edge[] = ["top", "bottom", "left", "right"];
const DOCK_TARGETS: readonly DockTarget[] = ["rail", "left", "right"];
const isEdge = (v: unknown): v is Edge => typeof v === "string" && (EDGES as readonly string[]).includes(v);
const isRailEdge = (v: unknown): v is RailEdge => v === "follow" || isEdge(v);
const isDockTarget = (v: unknown): v is DockTarget =>
  typeof v === "string" && (DOCK_TARGETS as readonly string[]).includes(v);

const DEFAULT_OMNIBAR_EDGE: Edge = "bottom";
const DEFAULT_RAIL_EDGE: RailEdge = "follow";
/** Every module docks to the rail by default (Ruby's call). */
const DEFAULT_MODULE_DOCK: Record<ModuleId, DockTarget> = Object.fromEntries(
  MODULE_IDS.map((id) => [id, "rail"]),
) as Record<ModuleId, DockTarget>;

const OMNIBAR_KEY = "omnibarEdge";
const RAIL_KEY = "railEdge";
const MODULE_KEY = "moduleDock";

// Start from defaults so the first client render matches the prerendered HTML;
// the persisted layout is loaded post-mount by hydrateLayoutPrefs() to avoid an
// SSR/hydration mismatch (getModuleDockAll is used as a server snapshot).
let omnibarEdge: Edge = DEFAULT_OMNIBAR_EDGE;
let railEdge: RailEdge = DEFAULT_RAIL_EDGE;
let moduleDock: Record<ModuleId, DockTarget> = { ...DEFAULT_MODULE_DOCK };

const listeners = new Set<() => void>();
function emit() {
  for (const l of listeners) l();
}

/**
 * Load the persisted layout from localStorage and apply it, once, after the
 * client has mounted. Call from a top-level editor effect. Idempotent-ish:
 * safe to call again (it just re-reads storage). Also hydrates the pin store so
 * a single call restores the whole layout.
 */
export function hydrateLayoutPrefs(): void {
  const loadedOmnibar = loadLayout<unknown>(OMNIBAR_KEY, null);
  const loadedRail = loadLayout<unknown>(RAIL_KEY, null);
  if (isEdge(loadedOmnibar)) omnibarEdge = loadedOmnibar;
  if (isRailEdge(loadedRail)) railEdge = loadedRail;

  const rawDock = loadLayout<Record<string, unknown>>(MODULE_KEY, {});
  if (rawDock && typeof rawDock === "object") {
    const merged = { ...DEFAULT_MODULE_DOCK };
    for (const id of MODULE_IDS) if (isDockTarget(rawDock[id])) merged[id] = rawDock[id];
    moduleDock = merged;
  }

  emit();
  hydratePins();
}

export function getOmnibarEdge(): Edge {
  return omnibarEdge;
}
export function setOmnibarEdge(edge: Edge): void {
  if (edge === omnibarEdge) return;
  omnibarEdge = edge;
  saveLayout(OMNIBAR_KEY, omnibarEdge);
  emit();
}

export function getRailEdge(): RailEdge {
  return railEdge;
}
export function setRailEdge(edge: RailEdge): void {
  if (edge === railEdge) return;
  railEdge = edge;
  saveLayout(RAIL_KEY, railEdge);
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
  saveLayout(MODULE_KEY, moduleDock);
  emit();
}

export function subscribeDock(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
