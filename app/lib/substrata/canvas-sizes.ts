export interface CanvasSize {
	id: string;
	name: string;
	width: number;
	height: number;
}

export interface CanvasSeries {
	id: string;
	name: string;
	sizes: CanvasSize[];
}

const series = (
	id: string,
	name: string,
	sizes: [string, number, number][],
): CanvasSeries => ({
	id,
	name,
	sizes: sizes.map(([size, width, height]) => ({
		id: `${id}-${size.toLowerCase().replace(/\W+/g, '-')}`,
		name: size,
		width,
		height,
	})),
});

export const CANVAS_SERIES: CanvasSeries[] = [
	series('general', 'General', [
		['Standard', 2000, 1500],
		['Square', 1080, 1080],
		['HD', 1920, 1080],
		['4K UHD', 3840, 2160],
		['Widescreen', 1600, 900],
		['Open Graph', 1200, 630],
	]),
	series('instagram', 'Instagram', [
		['Square', 1080, 1080],
		['Portrait', 1080, 1350],
		['Grid', 1080, 1440],
		['Landscape', 1080, 566],
		['Story', 1080, 1920],
	]),
	series('tiktok', 'TikTok', [['Video', 1080, 1920]]),
	series('youtube', 'YouTube', [
		['Thumbnail', 1280, 720],
		['Shorts', 1080, 1920],
		['Channel Art', 2560, 1440],
	]),
	series('x', 'X', [
		['Post', 1600, 900],
		['Header', 1500, 500],
	]),
	series('facebook', 'Facebook', [
		['Post', 1080, 1350],
		['Link', 1200, 630],
		['Cover', 1640, 624],
		['Event Cover', 1920, 1005],
		['Story', 1080, 1920],
	]),
	series('linkedin', 'LinkedIn', [
		['Post', 1200, 1200],
		['Link', 1200, 627],
		['Banner', 1584, 396],
	]),
	series('pinterest', 'Pinterest', [
		['Pin', 1000, 1500],
		['Long Pin', 1000, 2100],
	]),
	series('threads', 'Threads', [['Post', 1080, 1350]]),
	series('bluesky', 'Bluesky', [
		['Post', 1200, 675],
		['Banner', 3000, 1000],
	]),
];

export const CANVAS_SIZES = CANVAS_SERIES.flatMap((s) =>
	s.sizes.map((size) => ({ ...size, series: s.name })),
);

export const sizeTitle = (size: { series: string; name: string }) =>
	size.series === 'General' ? size.name : `${size.series} ${size.name}`;

/** Series with the sizes whose name, platform or WxH hold every word of `query`. */
export function findSizes(query: string): CanvasSeries[] {
	const words = query
		.toLowerCase()
		.replace(/(\d)\s*[x×*]\s*(\d)/g, '$1x$2')
		.split(/\s+/)
		.filter(Boolean);
	return CANVAS_SERIES.flatMap((s) => {
		const sizes = s.sizes.filter((size) => {
			const text =
				`${s.name} ${size.name} ${size.width}x${size.height}`.toLowerCase();
			return words.every((word) => text.includes(word));
		});
		return sizes.length ? [{ ...s, sizes }] : [];
	});
}

/** The picked size while it still matches, else the first with these sides. */
export function sizeFor(width: number, height: number, picked?: string) {
	const fits = (size: CanvasSize) =>
		size.width === width && size.height === height;
	const chosen = CANVAS_SIZES.find((size) => size.id === picked);
	return chosen && fits(chosen) ? chosen : CANVAS_SIZES.find(fits);
}
