/**
 * Blocking-modal store (§7) — which full-screen dialog is currently open. Unlike
 * the dock/rail modules (pinnable panels), these are transient blocking popups:
 * Export and Canvas size. One at a time; transient UI state (never document
 * truth), bound to React via useSyncExternalStore.
 */

type Listener = () => void;

export type ModalId = "export" | "canvas-size";

let open: ModalId | null = null;
const listeners = new Set<Listener>();

function emit(): void {
  for (const l of listeners) l();
}

export function getOpenModal(): ModalId | null {
  return open;
}

export function openModal(id: ModalId): void {
  if (open === id) return;
  open = id;
  emit();
}

export function closeModal(): void {
  if (open === null) return;
  open = null;
  emit();
}

export function subscribeModal(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
