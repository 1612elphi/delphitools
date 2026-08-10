/**
 * Active-tool store (§8). The omnibar's five stacks: MOVE / SELECT / ADJUST /
 * TEXT / PIECES, each with SUBTOOLS (the hover-fan icons — selectable modes,
 * Ruby's call: they select/highlight like main tools and a non-default subtool
 * keeps its fan expanded). Transient UI state (not document truth), mirrors the
 * doc-store shape for useSyncExternalStore. MOVE is the only behaviourally-
 * wired tool for now; the others set state (highlight + keyboard) and the
 * tools that read this are built in M2. ADJUST is a mode (surfaces the layer's
 * effects), not a pointer tool.
 */

export type ToolId = 'move' | 'select' | 'adjust' | 'text' | 'pieces';

let active: ToolId = 'move';
/** Active subtool per stack — remembered when you switch away and back. Sub
 *  ids are declared by the omnibar's TOOLS def; index 0 = the stack head. */
let activeSubs: Readonly<Record<ToolId, string>> = {
	move: 'move',
	select: 'select',
	adjust: 'adjust',
	text: 'text',
	pieces: 'pieces',
};
const listeners = new Set<() => void>();

function emit(): void {
	for (const l of listeners) l();
}

export function getActiveTool(): ToolId {
	return active;
}

export function getActiveSubs(): Readonly<Record<ToolId, string>> {
	return activeSubs;
}

export function setActiveTool(tool: ToolId): void {
	if (tool === active) return;
	active = tool;
	emit();
}

/** Select a subtool (and its stack — picking a sub always activates the tool). */
export function setActiveSub(tool: ToolId, sub: string): void {
	if (tool === active && activeSubs[tool] === sub) return;
	active = tool;
	activeSubs = { ...activeSubs, [tool]: sub };
	emit();
}

export function subscribeTool(listener: () => void): () => void {
	listeners.add(listener);
	return () => {
		listeners.delete(listener);
	};
}
