import type { Gradient } from './doc-model';

export function angleToCoords(deg: number): Gradient['coords'] {
	const t = (deg * Math.PI) / 180;
	const dx = Math.cos(t);
	const dy = Math.sin(t);
	const half = (Math.abs(dx) + Math.abs(dy)) / 2;
	// normalize negative zero
	const r = (v: number) => Math.round(v * 1000) / 1000 + 0;
	return {
		x1: r(0.5 - dx * half),
		y1: r(0.5 - dy * half),
		x2: r(0.5 + dx * half),
		y2: r(0.5 + dy * half),
	};
}

export function coordsToAngle(c: Gradient['coords']): number {
	const deg = (Math.atan2(c.y2 - c.y1, c.x2 - c.x1) * 180) / Math.PI;
	return Math.round((deg + 360) % 360) % 360;
}
