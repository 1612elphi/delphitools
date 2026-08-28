import { formatBytes, savingsPercent } from './image-compress';

export { formatBytes, savingsPercent };

// preserves object streams
export const STRUCTURAL_OPTIONS: Record<string, unknown> = {
	compress: true,
	'compress-images': true,
	'compress-fonts': true,
	objstms: true,
	'compression-effort': 100,
	garbage: 'deduplicate',
};

export interface CompressOptions {
	recompressImages: boolean;
	quality: number;
	maxEdge: number;
}

export interface CompressResult {
	bytes: Uint8Array<ArrayBuffer>;
	pageCount: number;
	imagesTouched: number;
}

export function resizeTo(
	w: number,
	h: number,
	maxEdge: number,
): { w: number; h: number } | null {
	const longest = Math.max(w, h);
	if (!maxEdge || longest <= maxEdge) return null;
	const scale = maxEdge / longest;
	return {
		w: Math.max(1, Math.round(w * scale)),
		h: Math.max(1, Math.round(h * scale)),
	};
}
