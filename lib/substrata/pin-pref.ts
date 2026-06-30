/**
 * Pinned-modules store (§8 rail). A module is either peeked (hover-bloom from its
 * omnibar trigger) or pinned (rendered in the rail at uniform height). The same
 * content renders in one place or the other based on this state. Ordered array =
 * rail order. Transient/in-memory; layout persistence rides the opt-in later.
 */

export type ModuleId =
  | "effects"
  | "layers"
  | "inspector"
  | "colour"
  | "export"
  | "csize"
  | "align"
  | "rotate";

let pinned: ModuleId[] = [];
const listeners = new Set<() => void>();

export function getPinned(): readonly ModuleId[] {
  return pinned;
}

export function isPinned(id: ModuleId): boolean {
  return pinned.includes(id);
}

export function togglePin(id: ModuleId): void {
  pinned = pinned.includes(id) ? pinned.filter((x) => x !== id) : [...pinned, id];
  for (const l of listeners) l();
}

/** Force a module open (pinned) or closed. */
export function setPinned(id: ModuleId, open: boolean): void {
  if (pinned.includes(id) === open) return;
  pinned = open ? [...pinned, id] : pinned.filter((x) => x !== id);
  for (const l of listeners) l();
}

export function subscribePins(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
