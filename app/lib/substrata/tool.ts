export type ToolId = 'move' | 'select' | 'adjust' | 'text' | 'pieces';

let active: ToolId = 'move';
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
