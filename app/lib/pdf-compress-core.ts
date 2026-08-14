/**
 * Pure helpers and types shared by the pdf-compressor client (pdf-compress.ts)
 * and its worker (pdf-compress.worker.ts). No DOM, no wasm, no Worker — safe to
 * import from either thread and unit-testable on its own.
 */

import { formatBytes, savingsPercent } from './image-compress';

export { formatBytes, savingsPercent };

/** MuPDF pdf_write_options for the always-on structural pass. */
export const STRUCTURAL_OPTIONS: Record<string, unknown> = {
	compress: true,
	'compress-images': true,
	'compress-fonts': true,
	garbage: 'deduplicate',
};

export interface CompressOptions {
	/** Re-encode images as JPEG (lossy). Off = structural pass only. */
	recompressImages: boolean;
	/** JPEG quality, 1–100, used when recompressImages is true. */
	quality: number;
	/** Longest-edge cap in pixels; 0 keeps every image at full resolution. */
	maxEdge: number;
}

export interface CompressResult {
	bytes: Uint8Array<ArrayBuffer>;
	pageCount: number;
	/** Images re-encoded as JPEG (0 when recompressImages is off). */
	imagesTouched: number;
}

/**
 * New pixel dimensions to fit `w`×`h` inside a `maxEdge` longest edge, or null
 * when the image is already within the cap (or the cap is off).
 */
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
