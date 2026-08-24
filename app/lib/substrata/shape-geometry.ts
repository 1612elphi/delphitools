import type { Layer, ShapeParams } from './doc-model';
import { freehandDims } from './freehand';

export interface Pt {
	x: number;
	y: number;
}

const MIN_SIDES = 3;

export function polygonPoints(sides: number, radius: number): Pt[] {
	const n = Math.max(MIN_SIDES, Math.round(sides));
	return Array.from({ length: n }, (_, i) => {
		const a = (i / n) * 2 * Math.PI - Math.PI / 2;
		return { x: Math.cos(a) * radius, y: Math.sin(a) * radius };
	});
}

export function starPoints(
	points: number,
	outerRadius: number,
	innerRadius: number,
): Pt[] {
	const n = Math.max(MIN_SIDES, Math.round(points));
	return Array.from({ length: n * 2 }, (_, i) => {
		const a = (i / (n * 2)) * 2 * Math.PI - Math.PI / 2;
		const r = i % 2 === 0 ? outerRadius : innerRadius;
		return { x: Math.cos(a) * r, y: Math.sin(a) * r };
	});
}

function pointsBounds(pts: Pt[]): { width: number; height: number } {
	let minX = Infinity;
	let minY = Infinity;
	let maxX = -Infinity;
	let maxY = -Infinity;
	for (const p of pts) {
		minX = Math.min(minX, p.x);
		minY = Math.min(minY, p.y);
		maxX = Math.max(maxX, p.x);
		maxY = Math.max(maxY, p.y);
	}
	return { width: maxX - minX, height: maxY - minY };
}

export function shapeDims(params: ShapeParams): {
	width: number;
	height: number;
} {
	switch (params.shape) {
		case 'rectangle':
			return { width: params.width, height: params.height };
		case 'ellipse':
			return { width: params.rx * 2, height: params.ry * 2 };
		case 'line':
			return { width: params.length, height: 0 };
		case 'polygon':
			return pointsBounds(
				polygonPoints(params.sides, params.radius),
			);
		case 'star':
			return pointsBounds(
				starPoints(
					params.points,
					params.outerRadius,
					params.innerRadius,
				),
			);
		case 'symbol':
			return { width: params.width, height: params.height };
	}
}

export function layerDims(
	layer: Layer,
): { width: number; height: number } | null {
	if (layer.kind === 'raster')
		return {
			width: layer.naturalWidth,
			height: layer.naturalHeight,
		};
	if (layer.kind === 'shape') return shapeDims(layer.params);
	if (layer.kind === 'freehand')
		return freehandDims(layer.rawPoints, layer.strokeOptions);
	return null;
}
