/**
 * Crop-box maths for pdf-rotate-crop, kept free of pdf.js/pdf-lib so the
 * conversions stay unit-testable. A CropBox is in PDF user-space points:
 * pdf.js `viewport.convertToPdfPoint` produces corners in that space and
 * pdf-lib `page.setCropBox` consumes it, so boxes survive page rotation
 * unchanged.
 */

export interface CropBox {
	x: number;
	y: number;
	width: number;
	height: number;
}

/** Normalise a pointer drag into a rect clamped inside maxW × maxH px. */
export function dragRect(
	x1: number,
	y1: number,
	x2: number,
	y2: number,
	maxW: number,
	maxH: number,
): CropBox {
	const ax = Math.min(maxW, Math.max(0, x1));
	const ay = Math.min(maxH, Math.max(0, y1));
	const bx = Math.min(maxW, Math.max(0, x2));
	const by = Math.min(maxH, Math.max(0, y2));
	return {
		x: Math.min(ax, bx),
		y: Math.min(ay, by),
		width: Math.abs(ax - bx),
		height: Math.abs(ay - by),
	};
}

/** Bounding box of two opposite corners, order-independent. */
export function boxFromPoints(
	ax: number,
	ay: number,
	bx: number,
	by: number,
): CropBox {
	return {
		x: Math.min(ax, bx),
		y: Math.min(ay, by),
		width: Math.abs(ax - bx),
		height: Math.abs(ay - by),
	};
}

/**
 * Overlap of two boxes, or null when they do not. Touching edges count as
 * disjoint: a zero-area CropBox is invalid PDF.
 */
export function intersectBox(a: CropBox, b: CropBox): CropBox | null {
	const x = Math.max(a.x, b.x);
	const y = Math.max(a.y, b.y);
	const right = Math.min(a.x + a.width, b.x + b.width);
	const bottom = Math.min(a.y + a.height, b.y + b.height);
	if (right - x <= 0 || bottom - y <= 0) return null;
	return { x, y, width: right - x, height: bottom - y };
}
