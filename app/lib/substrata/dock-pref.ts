import { loadLayout, saveLayout } from './layout-storage';
import { MODULE_IDS, hydratePins, type ModuleId } from './pin-pref';

export type Edge = 'top' | 'bottom' | 'left' | 'right';
export type RailEdge = 'follow' | Edge;
export type DockTarget = 'rail' | 'float';
export interface FloatPos {
	x: number;
	y: number;
}

const EDGES: readonly Edge[] = ['top', 'bottom', 'left', 'right'];
const isEdge = (v: unknown): v is Edge =>
	typeof v === 'string' && (EDGES as readonly string[]).includes(v);
const isRailEdge = (v: unknown): v is RailEdge => v === 'follow' || isEdge(v);
const isFloatPos = (v: unknown): v is FloatPos =>
	!!v &&
	typeof v === 'object' &&
	typeof (v as FloatPos).x === 'number' &&
	typeof (v as FloatPos).y === 'number';

const DEFAULT_OMNIBAR_EDGE: Edge = 'bottom';
const DEFAULT_RAIL_EDGE: RailEdge = 'follow';
const DEFAULT_MODULE_DOCK: Record<ModuleId, DockTarget> = Object.fromEntries(
	MODULE_IDS.map((id) => [id, 'rail']),
) as Record<ModuleId, DockTarget>;
const DEFAULT_FLOAT_POS: Record<ModuleId, FloatPos | null> = Object.fromEntries(
	MODULE_IDS.map((id) => [id, null]),
) as Record<ModuleId, FloatPos | null>;
const DEFAULT_CLAMPED: Record<ModuleId, boolean> = Object.fromEntries(
	MODULE_IDS.map((id) => [id, false]),
) as Record<ModuleId, boolean>;

const OMNIBAR_KEY = 'omnibarEdge';
const RAIL_KEY = 'railEdge';
const MODULE_KEY = 'moduleDock';
const FLOAT_KEY = 'moduleFloat';
const CLAMP_KEY = 'moduleClamp';

// defer storage until mount
let omnibarEdge: Edge = DEFAULT_OMNIBAR_EDGE;
let railEdge: RailEdge = DEFAULT_RAIL_EDGE;
let moduleDock: Record<ModuleId, DockTarget> = { ...DEFAULT_MODULE_DOCK };
let floatPos: Record<ModuleId, FloatPos | null> = { ...DEFAULT_FLOAT_POS };
let clamped: Record<ModuleId, boolean> = { ...DEFAULT_CLAMPED };

const listeners = new Set<() => void>();
function emit() {
	for (const l of listeners) l();
}

export function hydrateLayoutPrefs(): void {
	const loadedOmnibar = loadLayout<unknown>(OMNIBAR_KEY, null);
	const loadedRail = loadLayout<unknown>(RAIL_KEY, null);
	if (isEdge(loadedOmnibar)) omnibarEdge = loadedOmnibar;
	if (isRailEdge(loadedRail)) railEdge = loadedRail;

	const rawDock = loadLayout<Record<string, unknown>>(MODULE_KEY, {});
	if (rawDock && typeof rawDock === 'object') {
		const merged = { ...DEFAULT_MODULE_DOCK };
		for (const id of MODULE_IDS) {
			if (rawDock[id] === 'float') merged[id] = 'float';
		}
		moduleDock = merged;
	}

	const rawFloat = loadLayout<Record<string, unknown>>(FLOAT_KEY, {});
	if (rawFloat && typeof rawFloat === 'object') {
		const merged = { ...DEFAULT_FLOAT_POS };
		for (const id of MODULE_IDS)
			if (isFloatPos(rawFloat[id])) merged[id] = rawFloat[id];
		floatPos = merged;
	}

	const rawClamp = loadLayout<Record<string, unknown>>(CLAMP_KEY, {});
	if (rawClamp && typeof rawClamp === 'object') {
		const merged = { ...DEFAULT_CLAMPED };
		for (const id of MODULE_IDS)
			if (typeof rawClamp[id] === 'boolean')
				merged[id] = rawClamp[id];
		clamped = merged;
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

export function getModuleDockAll(): Readonly<Record<ModuleId, DockTarget>> {
	return moduleDock;
}
export function getFloatPosAll(): Readonly<Record<ModuleId, FloatPos | null>> {
	return floatPos;
}
export function getClampedAll(): Readonly<Record<ModuleId, boolean>> {
	return clamped;
}

export function floatModule(id: ModuleId, pos: FloatPos): void {
	moduleDock = { ...moduleDock, [id]: 'float' };
	floatPos = {
		...floatPos,
		[id]: { x: Math.round(pos.x), y: Math.round(pos.y) },
	};
	saveLayout(MODULE_KEY, moduleDock);
	saveLayout(FLOAT_KEY, floatPos);
	emit();
}

export function dockToRail(id: ModuleId): void {
	if (moduleDock[id] === 'rail') return;
	moduleDock = { ...moduleDock, [id]: 'rail' };
	saveLayout(MODULE_KEY, moduleDock);
	emit();
}

export function setClamped(id: ModuleId, v: boolean): void {
	if (clamped[id] === v) return;
	clamped = { ...clamped, [id]: v };
	saveLayout(CLAMP_KEY, clamped);
	emit();
}

export function subscribeDock(listener: () => void): () => void {
	listeners.add(listener);
	return () => {
		listeners.delete(listener);
	};
}
