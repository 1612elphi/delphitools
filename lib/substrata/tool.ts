/**
 * Active-tool store (§8). The omnibar's five stacks: MOVE / SELECT / ADJUST /
 * TEXT / PIECES. Transient UI state (not document truth), mirrors the doc-store
 * shape for useSyncExternalStore. MOVE is the only behaviourally-wired tool for
 * now; the others set state (highlight + keyboard) and the tools that read this
 * are built in M2. ADJUST is a mode (surfaces the layer's effects), not a
 * pointer tool.
 */

export type ToolId = "move" | "select" | "adjust" | "text" | "pieces";

let active: ToolId = "move";
const listeners = new Set<() => void>();

export function getActiveTool(): ToolId {
  return active;
}

export function setActiveTool(tool: ToolId): void {
  if (tool === active) return;
  active = tool;
  for (const l of listeners) l();
}

export function subscribeTool(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
