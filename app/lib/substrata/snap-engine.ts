export interface SnapBox {
	x: number;
	y: number;
	w: number;
	h: number;
}

export interface SnapField {
	/** vertical lines */
	v: number[];
	/** horizontal lines */
	h: number[];
}

export function buildSnapField(
	artboard: { width: number; height: number },
	others: readonly SnapBox[],
): SnapField {
	const v = [0, artboard.width / 2, artboard.width];
	const h = [0, artboard.height / 2, artboard.height];
	for (const b of others) {
		v.push(b.x - b.w / 2, b.x, b.x + b.w / 2);
		h.push(b.y - b.h / 2, b.y, b.y + b.h / 2);
	}
	return { v, h };
}

interface AxisSnap {
	d: number;
	line: number;
}

function snapAxis(
	probes: readonly number[],
	lines: readonly number[],
	grid: number | null,
	threshold: number,
): AxisSnap | null {
	let best: AxisSnap | null = null;
	const consider = (line: number, probe: number) => {
		const d = line - probe;
		if (
			Math.abs(d) <= threshold &&
			(!best || Math.abs(d) < Math.abs(best.d))
		) {
			best = { d, line };
		}
	};
	for (const p of probes) {
		for (const line of lines) consider(line, p);
		if (grid && grid > 0) consider(Math.round(p / grid) * grid, p);
	}
	return best;
}

export interface SnapResult {
	dx: number;
	dy: number;
	/** guide lines */
	v: number[];
	h: number[];
}

export function computeSnap(
	box: SnapBox,
	field: SnapField,
	grid: number | null,
	threshold: number,
): SnapResult {
	const xs = snapAxis(
		[box.x - box.w / 2, box.x, box.x + box.w / 2],
		field.v,
		grid,
		threshold,
	);
	const ys = snapAxis(
		[box.y - box.h / 2, box.y, box.y + box.h / 2],
		field.h,
		grid,
		threshold,
	);
	return {
		dx: xs?.d ?? 0,
		dy: ys?.d ?? 0,
		v: xs ? [xs.line] : [],
		h: ys ? [ys.line] : [],
	};
}
