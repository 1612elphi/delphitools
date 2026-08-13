/**
 * Page maths shared by the PDF tools (pdf-organiser, image-to-pdf).
 *
 * Pure TypeScript, no pdf-lib / pdf.js imports — the components own document
 * I/O; this owns parsing and geometry so it can be unit-tested without either
 * library loaded.
 */

import { MM_TO_POINTS, PAPER_SIZES } from 'delphitools-v2/lib/imposition';

export type FitMode = 'contain' | 'cover' | 'stretch';
export type PageOrientation = 'auto' | 'portrait' | 'landscape';

export interface Placement {
	x: number;
	y: number;
	width: number;
	height: number;
}

export interface PageSetup {
	width: number;
	height: number;
}

/** Page-size option that sizes every page to its own image. */
export const MATCH_IMAGE_SIZE = 'match';

/** Selectable fixed page sizes, portrait-first, plus the match option. */
export const PAGE_SIZE_OPTIONS: { id: string; label: string }[] = [
	{ id: MATCH_IMAGE_SIZE, label: 'Match image' },
	...PAPER_SIZES.map((size) => ({ id: size.id, label: size.label })),
];

/** CSS pixels are 96/inch, PDF points 72/inch, so a pixel is 0.75 pt. */
export const PX_TO_POINTS = 72 / 96;

/**
 * Parse a range spec like "1-3, 5, 8-6" into groups of 0-based page indices:
 * "1-3, 5" → [[0, 1, 2], [4]]. Input is 1-based and inclusive, matching how
 * people quote page ranges. Throws with a terse message on empty groups,
 * non-numbers, page 0, pages past the document, and reversed ranges.
 */
export function parsePageRanges(spec: string, pageCount: number): number[][] {
	const groups: number[][] = [];
	for (const part of spec.split(',')) {
		const trimmed = part.trim();
		if (!trimmed) throw new Error('empty range');

		const bounds = /^(\d+)(?:\s*-\s*(\d+))?$/.exec(trimmed);
		if (!bounds) throw new Error(`bad range "${trimmed}"`);

		const lo = parseInt(bounds[1]!, 10);
		const hi =
			bounds[2] === undefined ? lo : parseInt(bounds[2], 10);
		if (lo < 1 || hi > pageCount) throw new Error('out of range');
		if (hi < lo) throw new Error('reversed range');

		const group: number[] = [];
		for (let page = lo; page <= hi; page++) group.push(page - 1);
		groups.push(group);
	}
	if (groups.length === 0) throw new Error('empty range');
	return groups;
}

/** One group per page — the "one file per page" split. */
export function everyPageAlone(pageCount: number): number[][] {
	return Array.from({ length: pageCount }, (_, index) => [index]);
}

/** Snap an angle to the nearest quarter-turn, normalised to 0/90/180/270. */
export function normaliseRotation(degrees: number): number {
	return (((Math.round(degrees / 90) * 90) % 360) + 360) % 360;
}

/**
 * Place an image of imgW × imgH inside an area of areaW × areaH.
 * contain: largest size that fits, centred. cover: smallest size that fills,
 * centred (overflow crops). stretch: the area exactly. All in the caller's
 * coordinate space — the caller adds its margin offset.
 */
export function fitPlacement(
	imgW: number,
	imgH: number,
	areaW: number,
	areaH: number,
	mode: FitMode,
): Placement {
	if (mode === 'stretch') {
		return { x: 0, y: 0, width: areaW, height: areaH };
	}
	const scale =
		mode === 'cover'
			? Math.max(areaW / imgW, areaH / imgH)
			: Math.min(areaW / imgW, areaH / imgH);
	const width = imgW * scale;
	const height = imgH * scale;
	return {
		x: (areaW - width) / 2,
		y: (areaH - height) / 2,
		width,
		height,
	};
}

/**
 * Full page dimensions in points for one image. A fixed size comes from
 * PAPER_SIZES, oriented to match the image when orientation is 'auto'.
 * MATCH_IMAGE_SIZE pages are the image at CSS-pixel scale plus the margin on
 * every side — fitPlacement then lands the image back at its natural size.
 */
export function pageSetupPt(
	sizeId: string,
	orientation: PageOrientation,
	imgW: number,
	imgH: number,
	marginPt: number,
): PageSetup {
	if (sizeId === MATCH_IMAGE_SIZE) {
		return {
			width: imgW * PX_TO_POINTS + marginPt * 2,
			height: imgH * PX_TO_POINTS + marginPt * 2,
		};
	}

	const size = PAPER_SIZES.find((entry) => entry.id === sizeId);
	if (!size) throw new Error(`unknown size "${sizeId}"`);

	const landscape =
		orientation === 'landscape' ||
		(orientation === 'auto' && imgW > imgH);
	const widthMm = landscape
		? Math.max(size.widthMm, size.heightMm)
		: Math.min(size.widthMm, size.heightMm);
	const heightMm = landscape
		? Math.min(size.widthMm, size.heightMm)
		: Math.max(size.widthMm, size.heightMm);
	return {
		width: widthMm * MM_TO_POINTS,
		height: heightMm * MM_TO_POINTS,
	};
}
