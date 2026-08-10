/**
 * Gradient geometry (M4 tail, pure) — the CSS-gradient angle convention over
 * the doc model's relative 0-1 coords. Lifted out of gradient-row.tsx so the
 * maths lives beside the other pure geometry modules (shape-geometry,
 * snap-engine) and stays importable without React.
 */

import type { Gradient } from './doc-model';

/**
 * Linear coords from an angle through the unit box: 0° = left→right,
 * 90° = top→bottom (clockwise, y-down screen space). The line passes through
 * the centre (0.5, 0.5) along (cos θ, sin θ) and spans the box's full
 * projection onto it (len = |cos| + |sin|, the CSS-gradient convention), so
 * 45° runs corner to corner instead of stopping short. Endpoints poke ≤ ~0.11
 * outside 0–1 at oblique angles — canvas/fabric gradients accept that (the
 * 0–1 coords are a relative basis, not a clamp).
 * Mirrored by the scratch check .check-gradient-coords.mjs — keep in step.
 */
export function angleToCoords(deg: number): Gradient['coords'] {
	const t = (deg * Math.PI) / 180;
	const dx = Math.cos(t);
	const dy = Math.sin(t);
	const half = (Math.abs(dx) + Math.abs(dy)) / 2;
	const r = (v: number) => Math.round(v * 1000) / 1000 + 0; // + 0 folds −0 → 0
	return {
		x1: r(0.5 - dx * half),
		y1: r(0.5 - dy * half),
		x2: r(0.5 + dx * half),
		y2: r(0.5 + dy * half),
	};
}

/** Inverse for display: the stored line's direction, degrees 0–359. */
export function coordsToAngle(c: Gradient['coords']): number {
	const deg = (Math.atan2(c.y2 - c.y1, c.x2 - c.x1) * 180) / Math.PI;
	return Math.round((deg + 360) % 360) % 360;
}
