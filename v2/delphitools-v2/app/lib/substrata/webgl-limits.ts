/**
 * WebGL working-size guard rails (M1-7). The #1 must-do from §5: oversize source
 * rasters do NOT throw — Fabric (#6805) silently renders only ~30% of pixels. So
 * every working raster must be clamped to min(our ceiling, gl.MAX_TEXTURE_SIZE)
 * on import (M1-5) and the filter backend's textureSize set to match (M1-7).
 *
 * SSR-safe: returns a conservative fallback when no WebGL context exists.
 */

/** Used when no GL context is available (server / blocked WebGL). */
const FALLBACK_MAX_TEXTURE = 4096;

/** Our own ceiling regardless of how large the GPU claims it can go — keeps
 *  memory/perf sane on huge imports. The effective cap is min(this, GPU max). */
const HARD_CAP = 8192;

let cachedMax: number | null = null;

/** gl.MAX_TEXTURE_SIZE, probed once and memoised. */
export function maxTextureSize(): number {
	if (cachedMax != null) return cachedMax;
	if (typeof document === 'undefined')
		return (cachedMax = FALLBACK_MAX_TEXTURE);
	try {
		const canvas = document.createElement('canvas');
		const gl =
			canvas.getContext('webgl2') ??
			canvas.getContext('webgl');
		if (!gl) return (cachedMax = FALLBACK_MAX_TEXTURE);
		const max = gl.getParameter(gl.MAX_TEXTURE_SIZE) as number;
		cachedMax =
			typeof max === 'number' && max > 0
				? max
				: FALLBACK_MAX_TEXTURE;
	} catch {
		cachedMax = FALLBACK_MAX_TEXTURE;
	}
	return cachedMax;
}

/** The effective ceiling for any working raster / filter texture. */
export function workingRasterCap(): number {
	return Math.min(HARD_CAP, maxTextureSize());
}

export interface ClampResult {
	width: number;
	height: number;
	/** scale applied to the original (1 = unchanged) */
	scale: number;
}

/**
 * Fit (w, h) within the working cap, preserving aspect ratio. `scale < 1` means
 * the source was downscaled on import.
 */
export function clampToCap(
	width: number,
	height: number,
	cap = workingRasterCap(),
): ClampResult {
	const longest = Math.max(width, height);
	if (longest <= cap) return { width, height, scale: 1 };
	const scale = cap / longest;
	return {
		width: Math.max(1, Math.round(width * scale)),
		height: Math.max(1, Math.round(height * scale)),
		scale,
	};
}
