export type ExportFormat = 'png' | 'jpeg' | 'webp' | 'jxl';
export type ExportScale = 1 | 2 | 3;
export type ExportScope = 'artboard' | 'layer';

export interface ExportOptions {
	format: ExportFormat;
	scale: ExportScale;
	quality: number;
	scope: ExportScope;
}

export interface FormatMeta {
	id: ExportFormat;
	label: string;
	mime: string;
	ext: string;
	lossy: boolean;
	alpha: boolean;
	decodable: boolean;
}

export const EXPORT_FORMATS: FormatMeta[] = [
	{
		id: 'png',
		label: 'PNG',
		mime: 'image/png',
		ext: 'png',
		lossy: false,
		alpha: true,
		decodable: true,
	},
	{
		id: 'jpeg',
		label: 'JPEG',
		mime: 'image/jpeg',
		ext: 'jpg',
		lossy: true,
		alpha: false,
		decodable: true,
	},
	{
		id: 'webp',
		label: 'WebP',
		mime: 'image/webp',
		ext: 'webp',
		lossy: true,
		alpha: true,
		decodable: true,
	},
	{
		id: 'jxl',
		label: 'JXL',
		mime: 'image/jxl',
		ext: 'jxl',
		lossy: true,
		alpha: true,
		decodable: false,
	},
];

export function formatMeta(id: ExportFormat): FormatMeta {
	return EXPORT_FORMATS.find((f) => f.id === id)!;
}

// safari canvas limit
const IOS_AREA_BUDGET = 16_777_216;
const DESKTOP_AREA_BUDGET = 268_435_456;

function isIOSLike(): boolean {
	if (typeof navigator === 'undefined') return false;
	// ipados reports macintel
	return (
		/iPhone|iPad|iPod/.test(navigator.userAgent) ||
		(navigator.platform === 'MacIntel' &&
			navigator.maxTouchPoints > 1)
	);
}

export function areaBudget(): number {
	return isIOSLike() ? IOS_AREA_BUDGET : DESKTOP_AREA_BUDGET;
}

export interface ResolvedDims {
	outW: number;
	outH: number;
	effectiveScale: number;
	downscaled: boolean;
}

export function resolveExportDims(
	width: number,
	height: number,
	scale: number,
	budget: number = areaBudget(),
): ResolvedDims {
	const area = width * height * scale * scale;
	const effectiveScale =
		area > budget ? Math.sqrt(budget / (width * height)) : scale;
	return {
		outW: Math.max(1, Math.round(width * effectiveScale)),
		outH: Math.max(1, Math.round(height * effectiveScale)),
		effectiveScale,
		downscaled: effectiveScale < scale - 1e-9,
	};
}

const MIN_PLAUSIBLE_BYTES = 100;

export async function verifyExportBlob(
	blob: Blob,
	expectContent: boolean,
): Promise<boolean> {
	if (blob.size < MIN_PLAUSIBLE_BYTES) return false;
	const meta = EXPORT_FORMATS.find((f) => f.mime === blob.type);
	if (!meta?.decodable || !expectContent) return true;
	try {
		const bitmap = await createImageBitmap(blob);
		const probe = document.createElement('canvas');
		probe.width = bitmap.width;
		probe.height = bitmap.height;
		const ctx = probe.getContext('2d', {
			willReadFrequently: true,
		})!;
		ctx.drawImage(bitmap, 0, 0);
		bitmap.close();
		const { data } = ctx.getImageData(
			0,
			0,
			probe.width,
			probe.height,
		);
		for (let i = 3; i < data.length; i += 4) {
			if (data[i]! > 0) return true;
		}
		return false;
	} catch {
		return false;
	}
}

export function estimateBytes(
	proxyBytes: number,
	proxyArea: number,
	fullArea: number,
): number {
	if (proxyArea <= 0) return 0;
	return Math.round(proxyBytes * (fullArea / proxyArea));
}

export function slugifySceneName(name: string): string {
	return (
		name
			.trim()
			.replace(/[^\w-]+/g, '-')
			.replace(/^-+|-+$/g, '') || 'substrata'
	);
}

export function exportFilename(
	sceneName: string,
	w: number,
	h: number,
	ext: string,
): string {
	return `${slugifySceneName(sceneName)}-${w}x${h}.${ext}`;
}
