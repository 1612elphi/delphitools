import type {
	FreehandStrokeOptions,
	Layer,
	ShapeLayer,
	ShapeParams,
	Transform,
} from './doc-model';
import { identityTransform } from './doc-model';
import { update, updateTransient } from './doc-store';
import type { PiecesSettings } from './tool-settings';

export interface Pt {
	x: number;
	y: number;
}

const MIN_DRAG = 2;

export const SHAPE_NAMES: Record<ShapeParams['shape'], string> = {
	rectangle: 'Rectangle',
	ellipse: 'Ellipse',
	line: 'Line',
	polygon: 'Polygon',
	star: 'Star',
	symbol: 'Symbol',
};

export function buildDraggedShape(
	s: PiecesSettings,
	start: Pt,
	cur: Pt,
	shift: boolean,
): { params: ShapeParams; transform: Transform } | null {
	const dx = cur.x - start.x;
	const dy = cur.y - start.y;
	if (Math.max(Math.abs(dx), Math.abs(dy)) < MIN_DRAG) return null;

	const at = (x: number, y: number, angle = 0): Transform => ({
		...identityTransform(),
		x,
		y,
		angle,
	});
	const midX = start.x + dx / 2;
	const midY = start.y + dy / 2;

	switch (s.shape) {
		case 'rectangle':
		case 'symbol': {
			const w = shift
				? Math.max(Math.abs(dx), Math.abs(dy))
				: Math.abs(dx);
			const h = shift ? w : Math.abs(dy);
			// preserve start anchor
			const cx = shift
				? start.x + (Math.sign(dx) || 1) * (w / 2)
				: midX;
			const cy = shift
				? start.y + (Math.sign(dy) || 1) * (h / 2)
				: midY;
			return {
				params:
					s.shape === 'symbol'
						? {
								shape: 'symbol',
								symbolId: s.symbolId,
								width: w,
								height: h,
							}
						: {
								shape: 'rectangle',
								width: w,
								height: h,
								cornerRadius:
									s.cornerRadius,
							},
				transform: at(cx, cy),
			};
		}
		case 'ellipse': {
			const rx = shift
				? Math.max(Math.abs(dx), Math.abs(dy)) / 2
				: Math.abs(dx) / 2;
			const ry = shift ? rx : Math.abs(dy) / 2;
			const cx = shift
				? start.x + (Math.sign(dx) || 1) * rx
				: midX;
			const cy = shift
				? start.y + (Math.sign(dy) || 1) * ry
				: midY;
			return {
				params: { shape: 'ellipse', rx, ry },
				transform: at(cx, cy),
			};
		}
		case 'line': {
			let angle = (Math.atan2(dy, dx) * 180) / Math.PI;
			if (shift) angle = Math.round(angle / 45) * 45;
			const length = Math.hypot(dx, dy);
			const rad = (angle * Math.PI) / 180;
			// preserve start endpoint
			const cx = start.x + (Math.cos(rad) * length) / 2;
			const cy = start.y + (Math.sin(rad) * length) / 2;
			return {
				params: { shape: 'line', length },
				transform: at(cx, cy, angle),
			};
		}
		case 'polygon': {
			const radius = Math.hypot(dx, dy);
			return {
				params: {
					shape: 'polygon',
					sides: s.sides,
					radius,
				},
				transform: at(start.x, start.y),
			};
		}
		case 'star': {
			const outerRadius = Math.hypot(dx, dy);
			return {
				params: {
					shape: 'star',
					points: s.starPoints,
					outerRadius,
					innerRadius:
						outerRadius * s.starInnerRatio,
				},
				transform: at(start.x, start.y),
			};
		}
	}
}

export function strokeForNewShape(s: PiecesSettings): ShapeLayer['stroke'] {
	if (s.stroke) return { colour: s.stroke.colour, width: s.stroke.width };
	return s.shape === 'line' ? { colour: s.fill, width: 2 } : null;
}

export const FREEHAND_NAMES = { brush: 'Brush', pencil: 'Pencil' } as const;
export type FreehandSub = keyof typeof FREEHAND_NAMES;

export function freehandOptions(
	sub: FreehandSub,
	s: PiecesSettings,
	simulatePressure: boolean,
): FreehandStrokeOptions {
	return sub === 'brush'
		? {
				size: s.brushSize,
				thinning: 0.6,
				smoothing: 0.5,
				streamline: 0.5,
				simulatePressure,
			}
		: {
				size: s.pencilSize,
				thinning: 0.15,
				smoothing: 0.5,
				streamline: 0,
				simulatePressure,
			};
}

export function appendLayer(layer: Layer): void {
	update((doc) => ({
		...doc,
		layers: [...doc.layers, layer],
		updatedAt: Date.now(),
	}));
}

export function upsertLayerTransient(layer: Layer): void {
	updateTransient((doc) => {
		const exists = doc.layers.some((l) => l.id === layer.id);
		return {
			...doc,
			layers: exists
				? doc.layers.map((l) =>
						l.id === layer.id ? layer : l,
					)
				: [...doc.layers, layer],
			updatedAt: Date.now(),
		};
	});
}
