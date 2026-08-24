import type { PieceShape, TextAlign } from './doc-model';
import type { TextStylePreset } from './text-style';

export interface MoveSettings {
	nudge: number;
}

export interface SelectSettings {
	mode: 'touch' | 'cover';
	sensitivity: number;
	tolerance: number;
	magnetic: boolean;
	wandMode: 'flood' | 'global';
}

export interface TextSettings {
	fontFamily: string;
	fontSize: number;
	style: TextStylePreset;
	align: TextAlign;
}

export type { PieceShape } from './doc-model';

export interface PiecesSettings {
	shape: PieceShape;
	symbolId: string;
	fill: string;
	stroke: { colour: string; width: number } | null;
	cornerRadius: number;
	sides: number;
	starPoints: number;
	starInnerRatio: number;
	brushSize: number;
	pencilSize: number;
}

export interface ToolSettings {
	transformAsGroup: boolean;
	move: MoveSettings;
	select: SelectSettings;
	text: TextSettings;
	pieces: PiecesSettings;
}

const DEFAULTS: ToolSettings = {
	transformAsGroup: true,
	move: { nudge: 1 },
	select: {
		mode: 'touch',
		sensitivity: 50,
		tolerance: 32,
		magnetic: false,
		wandMode: 'flood',
	},
	text: {
		fontFamily: 'sans',
		fontSize: 64,
		style: 'regular',
		align: 'left',
	},
	pieces: {
		shape: 'rectangle',
		symbolId: 'arrow-right',
		fill: '#3e6b33',
		stroke: null,
		cornerRadius: 0,
		sides: 6,
		starPoints: 5,
		starInnerRatio: 0.5,
		brushSize: 24,
		pencilSize: 6,
	},
};

let settings: ToolSettings = DEFAULTS;
const listeners = new Set<() => void>();

export function getToolSettings(): ToolSettings {
	return settings;
}

export function subscribeToolSettings(listener: () => void): () => void {
	listeners.add(listener);
	return () => {
		listeners.delete(listener);
	};
}

export function updateToolSettings<
	K extends 'move' | 'select' | 'text' | 'pieces',
>(tool: K, patch: Partial<ToolSettings[K]>): void {
	settings = { ...settings, [tool]: { ...settings[tool], ...patch } };
	for (const l of listeners) l();
}

export function setTransformAsGroup(transformAsGroup: boolean): void {
	if (settings.transformAsGroup === transformAsGroup) return;
	settings = { ...settings, transformAsGroup };
	for (const l of listeners) l();
}
