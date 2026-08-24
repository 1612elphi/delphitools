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

export const MATCH_IMAGE_SIZE = 'match';

export const PAGE_SIZE_OPTIONS: { id: string; label: string }[] = [
	{ id: MATCH_IMAGE_SIZE, label: 'Match image' },
	...PAPER_SIZES.map((size) => ({ id: size.id, label: size.label })),
];

export const PX_TO_POINTS = 72 / 96;

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

export function everyPageAlone(pageCount: number): number[][] {
	return Array.from({ length: pageCount }, (_, index) => [index]);
}

export function normaliseRotation(degrees: number): number {
	return (((Math.round(degrees / 90) * 90) % 360) + 360) % 360;
}

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
