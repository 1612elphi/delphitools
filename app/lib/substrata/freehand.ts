import { getStroke } from 'perfect-freehand';
import type { FreehandStrokeOptions } from './doc-model';

export type RawPoint = [number, number, number];

export function strokeOutline(
	rawPoints: readonly RawPoint[],
	options: FreehandStrokeOptions,
): number[][] {
	return getStroke(rawPoints as RawPoint[], { ...options, last: true });
}

export function outlineToPathD(outline: number[][]): string {
	if (outline.length < 3) return '';
	let d = `M ${outline[0]![0]} ${outline[0]![1]} Q`;
	for (let i = 1; i < outline.length; i++) {
		const p = outline[i]!;
		const n = outline[(i + 1) % outline.length]!;
		d += ` ${p[0]!} ${p[1]!} ${(p[0]! + n[0]!) / 2} ${(p[1]! + n[1]!) / 2}`;
	}
	return d + ' Z';
}

function outlineBounds(outline: number[][]): {
	minX: number;
	minY: number;
	maxX: number;
	maxY: number;
} {
	let minX = Infinity;
	let minY = Infinity;
	let maxX = -Infinity;
	let maxY = -Infinity;
	for (const [x, y] of outline) {
		minX = Math.min(minX, x!);
		minY = Math.min(minY, y!);
		maxX = Math.max(maxX, x!);
		maxY = Math.max(maxY, y!);
	}
	return { minX, minY, maxX, maxY };
}

export function freehandDims(
	rawPoints: readonly RawPoint[],
	options: FreehandStrokeOptions,
): { width: number; height: number } {
	if (rawPoints.length === 0) return { width: 0, height: 0 };
	const b = outlineBounds(strokeOutline(rawPoints, options));
	return { width: b.maxX - b.minX, height: b.maxY - b.minY };
}

export function centreRawPoints(
	rawPoints: readonly RawPoint[],
	options: FreehandStrokeOptions,
): { points: RawPoint[]; cx: number; cy: number } {
	const b = outlineBounds(strokeOutline(rawPoints, options));
	const cx = (b.minX + b.maxX) / 2;
	const cy = (b.minY + b.maxY) / 2;
	return {
		points: rawPoints.map(([x, y, p]) => [x - cx, y - cy, p]),
		cx,
		cy,
	};
}
