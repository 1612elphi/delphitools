/**
 * Selection store — which layer is active. TRANSIENT UI state, deliberately NOT
 * part of the document model (§6: selections aren't document truth). Mirrors the
 * doc-store shape so components bind via useSyncExternalStore. The Layers panel,
 * canvas (MOVE, M1-10), and Inspector (M2) all read from here.
 *
 * Single-select for now; multi-select is added additively when tools need it.
 */

type Listener = () => void;

let activeLayerId: string | null = null;
const listeners = new Set<Listener>();

export function getActiveLayerId(): string | null {
  return activeLayerId;
}

export function subscribeSelection(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function setActiveLayer(id: string | null): void {
  if (id === activeLayerId) return;
  activeLayerId = id;
  for (const l of listeners) l();
}
