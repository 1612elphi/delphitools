/**
 * Pure freehand-stroke geometry (M2-2) — perfect-freehand wrapped for the doc
 * model. DOM- and fabric-free. The doc persists RAW input points + stroke
 * options (ratified M2-1); everything renderable derives here: outline
 * polygon → SVG path d (the reconciler's fabric.Path, the layers-panel thumb,
 * the live draw preview).
 */

import { getStroke } from 'perfect-freehand';
import type { FreehandStrokeOptions } from './doc-model';

export type RawPoint = [number, number, number];

/** Outline polygon (closed) for a finished stroke. */
export function strokeOutline(
	rawPoints: readonly RawPoint[],
	options: FreehandStrokeOptions,
): number[][] {
	return getStroke(rawPoints as RawPoint[], { ...options, last: true });
}

/**
 * Outline → SVG path d — perfect-freehand's canonical average-quadratic
 * smoothing (each segment curves to the midpoint of the next), closed.
 */
export function outlineToPathD(outline: number[][]): string {
	if (outline.length < 3) return '';
	// getStroke yields [x, y] pairs, so both components of every point exist
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
	// getStroke yields [x, y] pairs, so both components of every point exist
	for (const [x, y] of outline) {
		minX = Math.min(minX, x!);
		minY = Math.min(minY, y!);
		maxX = Math.max(maxX, x!);
		maxY = Math.max(maxY, y!);
	}
	return { minX, minY, maxX, maxY };
}

/** Intrinsic dims of what renders — the OUTLINE's bbox (pressure widening
 *  included), not the raw input's. */
export function freehandDims(
	rawPoints: readonly RawPoint[],
	options: FreehandStrokeOptions,
): { width: number; height: number } {
	if (rawPoints.length === 0) return { width: 0, height: 0 };
	const b = outlineBounds(strokeOutline(rawPoints, options));
	return { width: b.maxX - b.minX, height: b.maxY - b.minY };
}

/**
 * Commit-time normalisation: recentre scene-space raw points on their
 * OUTLINE bbox centre so the layer follows the centre-origin convention
 * (transform.x/y = that centre; points become layer-local).
 */
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
