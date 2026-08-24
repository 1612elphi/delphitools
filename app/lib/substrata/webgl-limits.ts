// fabric texture size workaround
const FALLBACK_MAX_TEXTURE = 4096;

const HARD_CAP = 8192;

let cachedMax: number | null = null;

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

export function workingRasterCap(): number {
	return Math.min(HARD_CAP, maxTextureSize());
}

export interface ClampResult {
	width: number;
	height: number;
	scale: number;
}

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
