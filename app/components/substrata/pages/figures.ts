// web canvas-size-modal presets
const SIDE_MAX = 20_000;

// whole pixels, 1-20000
export function clampSide(side: number): number {
	if (!Number.isFinite(side)) return 1;
	return Math.min(Math.max(Math.round(side), 1), SIDE_MAX);
}

export const EXPORT_PRESET_SCALES = [0.5, 1, 2] as const;
export const CUSTOM_SCALE = { min: 0.1, max: 8, start: 1.5 } as const;

export function scaleLabel(scale: number, locale?: string): string {
	return `${scale.toLocaleString(locale)}×`;
}

// ios bytefigure, decimal units
export function byteFigure(bytes: number, locale?: string): [string, string] {
	const units = ['B', 'KB', 'MB', 'GB'];
	let value = bytes;
	let unit = 0;
	while (value >= 1000 && unit < units.length - 1) {
		value /= 1000;
		unit += 1;
	}
	const digits = unit === 0 || value >= 100 ? 0 : 1;
	return [
		value.toLocaleString(locale, {
			minimumFractionDigits: digits,
			maximumFractionDigits: digits,
			useGrouping: false,
		}),
		units[unit]!,
	];
}
