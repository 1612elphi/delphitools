export type PaletteCategory =
	'random' | 'color-theory' | 'mood' | 'era' | 'nature' | 'cultural';

export type PaletteStrategy =
	| 'true-random'
	| 'random-cohesive'
	| 'analogous'
	| 'complementary'
	| 'triadic'
	| 'split-complementary'
	| 'tetradic'
	| 'monochromatic'
	| 'thermos'
	| 'specimen'
	| 'souvenir'
	| 'curfew'
	| 'telegraph'
	| '70s'
	| '80s'
	| '90s'
	| 'y2k'
	| 'ocean-sunset'
	| 'forest-morning'
	| 'desert-dusk'
	| 'arctic'
	| 'volcanic'
	| 'meadow'
	| 'bauhaus'
	| 'art-deco'
	| 'japanese'
	| 'scandinavian'
	| 'mexican';

export interface StrategyInfo {
	name: string;
	description: string;
	category: PaletteCategory;
}

export const STRATEGY_CATEGORIES: Record<PaletteCategory, string> = {
	random: 'Random',
	'color-theory': 'Color Theory',
	mood: 'Moods',
	era: 'Decades & Eras',
	nature: 'Nature & Scenes',
	cultural: 'Art & Culture',
};

export const STRATEGY_INFO: Record<PaletteStrategy, StrategyInfo> = {
	'true-random': {
		name: 'Chaos',
		description: 'Completely random, no rules',
		category: 'random',
	},
	'random-cohesive': {
		name: 'Random',
		description: 'Random cohesive palette',
		category: 'random',
	},
	analogous: {
		name: 'Analogous',
		description: 'Adjacent hues on the colour wheel',
		category: 'color-theory',
	},
	complementary: {
		name: 'Complementary',
		description: 'Opposite hues for high contrast',
		category: 'color-theory',
	},
	triadic: {
		name: 'Triadic',
		description: 'Three evenly spaced hues',
		category: 'color-theory',
	},
	'split-complementary': {
		name: 'Split-Comp',
		description: 'Base + two adjacent to complement',
		category: 'color-theory',
	},
	tetradic: {
		name: 'Tetradic',
		description: 'Four evenly spaced hues',
		category: 'color-theory',
	},
	monochromatic: {
		name: 'Mono',
		description: 'Single hue, varied lightness',
		category: 'color-theory',
	},
	thermos: {
		name: 'Thermos',
		description: 'Warm, cozy, retro tones',
		category: 'mood',
	},
	specimen: {
		name: 'Specimen',
		description: 'Cool, clinical, preserved',
		category: 'mood',
	},
	souvenir: {
		name: 'Souvenir',
		description: 'Soft, faded pastels',
		category: 'mood',
	},
	curfew: {
		name: 'Curfew',
		description: 'Dark, moody depths',
		category: 'mood',
	},
	telegraph: {
		name: 'Telegraph',
		description: 'Muted vintage sepia',
		category: 'mood',
	},
	'70s': {
		name: '1970s',
		description: 'Earth tones, burnt orange, avocado',
		category: 'era',
	},
	'80s': {
		name: '1980s',
		description: 'Neon pink, electric blue, hot purple',
		category: 'era',
	},
	'90s': {
		name: '1990s',
		description: 'Grunge, forest green, burgundy',
		category: 'era',
	},
	y2k: {
		name: 'Y2K',
		description: 'Chrome, cyan, magenta',
		category: 'era',
	},
	'ocean-sunset': {
		name: 'Ocean Sunset',
		description: 'Coral, rose, ocean blue, dusk',
		category: 'nature',
	},
	'forest-morning': {
		name: 'Forest Morning',
		description: 'Fresh greens, mist, golden light',
		category: 'nature',
	},
	'desert-dusk': {
		name: 'Desert Dusk',
		description: 'Terracotta, sand, dusty rose',
		category: 'nature',
	},
	arctic: {
		name: 'Arctic',
		description: 'Ice blue, white, pale cyan',
		category: 'nature',
	},
	volcanic: {
		name: 'Volcanic',
		description: 'Black, deep red, orange, ash',
		category: 'nature',
	},
	meadow: {
		name: 'Meadow',
		description: 'Grass green, wildflowers, sky blue',
		category: 'nature',
	},
	bauhaus: {
		name: 'Bauhaus',
		description: 'Primary colors, geometric, bold',
		category: 'cultural',
	},
	'art-deco': {
		name: 'Art Deco',
		description: 'Gold, black, cream, emerald',
		category: 'cultural',
	},
	japanese: {
		name: 'Japanese',
		description: 'Indigo, vermillion, gold, cream',
		category: 'cultural',
	},
	scandinavian: {
		name: 'Scandinavian',
		description: 'White, pale grey, muted pastels',
		category: 'cultural',
	},
	mexican: {
		name: 'Mexican',
		description: 'Hot pink, orange, turquoise, yellow',
		category: 'cultural',
	},
};

function rgbToHex(r: number, g: number, b: number): string {
	return (
		'#' +
		[r, g, b]
			.map((x) =>
				Math.round(Math.max(0, Math.min(255, x)))
					.toString(16)
					.padStart(2, '0'),
			)
			.join('')
	);
}

function linearToSrgb(c: number): number {
	const v =
		c <= 0.0031308
			? 12.92 * c
			: 1.055 * Math.pow(c, 1 / 2.4) - 0.055;
	return Math.max(0, Math.min(255, v * 255));
}

function oklchToRgb(L: number, c: number, h: number): [number, number, number] {
	const hRad = (h * Math.PI) / 180;
	const a = c * Math.cos(hRad);
	const b = c * Math.sin(hRad);

	const l = Math.pow(L + 0.3963377774 * a + 0.2158037573 * b, 3);
	const m = Math.pow(L - 0.1055613458 * a - 0.0638541728 * b, 3);
	const s = Math.pow(L - 0.0894841775 * a - 1.291485548 * b, 3);

	const lr = 4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s;
	const lg = -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s;
	const lb = -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s;

	return [linearToSrgb(lr), linearToSrgb(lg), linearToSrgb(lb)];
}

function clampOklch(L: number, c: number, h: number): [number, number, number] {
	L = Math.max(0, Math.min(1, L));
	c = Math.max(0, Math.min(0.4, c));
	h = ((h % 360) + 360) % 360;
	return [L, c, h];
}

function oklchToHex(L: number, c: number, h: number): string {
	const [cL, cC, cH] = clampOklch(L, c, h);
	const rgb = oklchToRgb(cL, cC, cH);
	return rgbToHex(
		Math.round(Math.max(0, Math.min(255, rgb[0]))),
		Math.round(Math.max(0, Math.min(255, rgb[1]))),
		Math.round(Math.max(0, Math.min(255, rgb[2]))),
	);
}

function randomInRange(min: number, max: number): number {
	return Math.random() * (max - min) + min;
}

function generateRandomBase(): [number, number, number] {
	const L = randomInRange(0.4, 0.75);
	const c = randomInRange(0.08, 0.2);
	const h = randomInRange(0, 360);
	return [L, c, h];
}

interface HueRange {
	h: [number, number];
	weight: number;
	L?: [number, number];
	c?: [number, number];
}

function pickFromHueRanges(
	ranges: HueRange[],
	defaultL: [number, number],
	defaultC: [number, number],
): string {
	const totalWeight = ranges.reduce((sum, r) => sum + r.weight, 0);
	let random = Math.random() * totalWeight;

	let selectedRange = ranges[0]!;
	for (const range of ranges) {
		random -= range.weight;
		if (random <= 0) {
			selectedRange = range;
			break;
		}
	}

	const h = randomInRange(selectedRange.h[0], selectedRange.h[1]);
	const L = randomInRange(...(selectedRange.L || defaultL));
	const c = randomInRange(...(selectedRange.c || defaultC));

	return oklchToHex(L, c, h);
}

function generateTrueRandomPalette(count: number): string[] {
	return Array.from({ length: count }, () => {
		const r = Math.floor(Math.random() * 256);
		const g = Math.floor(Math.random() * 256);
		const b = Math.floor(Math.random() * 256);
		return rgbToHex(r, g, b);
	});
}

function generateAnalogousPalette(count: number): string[] {
	const [baseL, baseC, baseH] = generateRandomBase();
	const spread = 40;
	const step = spread / (count - 1);
	const startH = baseH - spread / 2;

	return Array.from({ length: count }, (_, i) => {
		const h = startH + step * i;
		const L = baseL + randomInRange(-0.1, 0.1);
		const c = baseC + randomInRange(-0.05, 0.05);
		return oklchToHex(L, c, h);
	});
}

function generateComplementaryPalette(count: number): string[] {
	const [baseL, baseC, baseH] = generateRandomBase();
	const complementH = (baseH + 180) % 360;

	const colours: string[] = [];
	const halfCount = Math.ceil(count / 2);

	for (let i = 0; i < halfCount; i++) {
		const hVariation = randomInRange(-15, 15);
		const L = baseL + randomInRange(-0.15, 0.15);
		const c = baseC + randomInRange(-0.05, 0.05);
		colours.push(oklchToHex(L, c, baseH + hVariation));
	}

	for (let i = halfCount; i < count; i++) {
		const hVariation = randomInRange(-15, 15);
		const L = baseL + randomInRange(-0.15, 0.15);
		const c = baseC + randomInRange(-0.05, 0.05);
		colours.push(oklchToHex(L, c, complementH + hVariation));
	}

	return colours;
}

function generateTriadicPalette(count: number): string[] {
	const [baseL, baseC, baseH] = generateRandomBase();
	const angles = [baseH, (baseH + 120) % 360, (baseH + 240) % 360];

	return Array.from({ length: count }, (_, i) => {
		const angleIndex = i % 3;
		const h = angles[angleIndex]! + randomInRange(-10, 10);
		const L = baseL + randomInRange(-0.15, 0.15);
		const c = baseC + randomInRange(-0.05, 0.05);
		return oklchToHex(L, c, h);
	});
}

function generateSplitComplementaryPalette(count: number): string[] {
	const [baseL, baseC, baseH] = generateRandomBase();
	const split1 = (baseH + 150) % 360;
	const split2 = (baseH + 210) % 360;
	const angles = [baseH, split1, split2];

	return Array.from({ length: count }, (_, i) => {
		const angleIndex = i % 3;
		const h = angles[angleIndex]! + randomInRange(-10, 10);
		const L = baseL + randomInRange(-0.15, 0.15);
		const c = baseC + randomInRange(-0.05, 0.05);
		return oklchToHex(L, c, h);
	});
}

function generateTetradicPalette(count: number): string[] {
	const [baseL, baseC, baseH] = generateRandomBase();
	const angles = [
		baseH,
		(baseH + 90) % 360,
		(baseH + 180) % 360,
		(baseH + 270) % 360,
	];

	return Array.from({ length: count }, (_, i) => {
		const angleIndex = i % 4;
		const h = angles[angleIndex]! + randomInRange(-10, 10);
		const L = baseL + randomInRange(-0.15, 0.15);
		const c = baseC + randomInRange(-0.05, 0.05);
		return oklchToHex(L, c, h);
	});
}

function generateMonochromaticPalette(count: number): string[] {
	const h = randomInRange(0, 360);
	const baseC = randomInRange(0.1, 0.2);
	const lMin = 0.3;
	const lMax = 0.85;
	const lStep = (lMax - lMin) / (count - 1);

	return Array.from({ length: count }, (_, i) => {
		const L = lMax - lStep * i;
		const cMod = L < 0.4 || L > 0.75 ? 0.7 : 1;
		return oklchToHex(L, baseC * cMod, h);
	});
}

function generateRandomCohesivePalette(count: number): string[] {
	const strategies = [
		generateAnalogousPalette,
		generateComplementaryPalette,
		generateTriadicPalette,
		generateSplitComplementaryPalette,
		generateTetradicPalette,
		generateMonochromaticPalette,
	];
	const strategy =
		strategies[Math.floor(Math.random() * strategies.length)]!;
	return strategy(count);
}

function generateThermosPalette(count: number): string[] {
	return Array.from({ length: count }, () => {
		const h = randomInRange(15, 55);
		const L = randomInRange(0.45, 0.75);
		const c = randomInRange(0.08, 0.18);
		return oklchToHex(L, c, h);
	});
}

function generateSpecimenPalette(count: number): string[] {
	return Array.from({ length: count }, () => {
		const h = randomInRange(170, 220);
		const L = randomInRange(0.6, 0.9);
		const c = randomInRange(0.03, 0.12);
		return oklchToHex(L, c, h);
	});
}

function generateSouvenirPalette(count: number): string[] {
	return Array.from({ length: count }, () => {
		const h = randomInRange(0, 360);
		const L = randomInRange(0.75, 0.92);
		const c = randomInRange(0.04, 0.1);
		return oklchToHex(L, c, h);
	});
}

function generateCurfewPalette(count: number): string[] {
	return Array.from({ length: count }, () => {
		const h = randomInRange(0, 360);
		const L = randomInRange(0.15, 0.35);
		const c = randomInRange(0.05, 0.15);
		return oklchToHex(L, c, h);
	});
}

function generateTelegraphPalette(count: number): string[] {
	return Array.from({ length: count }, () => {
		const h = randomInRange(30, 60);
		const L = randomInRange(0.4, 0.7);
		const c = randomInRange(0.02, 0.08);
		return oklchToHex(L, c, h);
	});
}

function generate70sPalette(count: number): string[] {
	const ranges: HueRange[] = [
		{ h: [25, 45], weight: 3 },
		{ h: [75, 100], weight: 2 },
		{ h: [15, 30], weight: 2 },
		{ h: [45, 65], weight: 1 },
	];

	return Array.from({ length: count }, () =>
		pickFromHueRanges(ranges, [0.35, 0.65], [0.08, 0.18]),
	);
}

function generate80sPalette(count: number): string[] {
	const colours: string[] = [];

	for (let i = 0; i < count; i++) {
		if (Math.random() < 0.2) {
			const h = randomInRange(0, 360);
			colours.push(
				oklchToHex(
					randomInRange(0.12, 0.22),
					randomInRange(0.02, 0.08),
					h,
				),
			);
		} else {
			const ranges: HueRange[] = [
				{ h: [320, 350], weight: 3 },
				{ h: [220, 270], weight: 2 },
				{ h: [280, 320], weight: 2 },
				{ h: [170, 200], weight: 1 },
			];
			colours.push(
				pickFromHueRanges(
					ranges,
					[0.55, 0.75],
					[0.18, 0.3],
				),
			);
		}
	}

	return colours;
}

function generate90sPalette(count: number): string[] {
	const ranges: HueRange[] = [
		{ h: [140, 170], weight: 2 },
		{ h: [350, 20], weight: 2 },
		{ h: [220, 250], weight: 2 },
		{ h: [30, 50], weight: 1 },
	];

	return Array.from({ length: count }, () =>
		pickFromHueRanges(ranges, [0.3, 0.55], [0.05, 0.14]),
	);
}

function generateY2KPalette(count: number): string[] {
	const colours: string[] = [];

	for (let i = 0; i < count; i++) {
		if (Math.random() < 0.3) {
			const h = randomInRange(200, 280);
			colours.push(
				oklchToHex(
					randomInRange(0.7, 0.88),
					randomInRange(0.01, 0.04),
					h,
				),
			);
		} else {
			const ranges: HueRange[] = [
				{ h: [180, 200], weight: 2 },
				{ h: [310, 340], weight: 2 },
				{ h: [260, 290], weight: 1 },
				{ h: [50, 70], weight: 1 },
			];
			colours.push(
				pickFromHueRanges(
					ranges,
					[0.55, 0.75],
					[0.15, 0.28],
				),
			);
		}
	}

	return colours;
}

function generateOceanSunsetPalette(count: number): string[] {
	const ranges: HueRange[] = [
		{ h: [15, 40], weight: 2, L: [0.6, 0.75] },
		{ h: [340, 360], weight: 2, L: [0.55, 0.7] },
		{ h: [200, 230], weight: 2, L: [0.35, 0.55] },
		{ h: [260, 290], weight: 1, L: [0.25, 0.45] },
	];

	return Array.from({ length: count }, () =>
		pickFromHueRanges(ranges, [0.45, 0.7], [0.1, 0.2]),
	);
}

function generateForestMorningPalette(count: number): string[] {
	const colours: string[] = [];

	for (let i = 0; i < count; i++) {
		if (Math.random() < 0.25) {
			const h = randomInRange(90, 150);
			colours.push(
				oklchToHex(
					randomInRange(0.8, 0.92),
					randomInRange(0.02, 0.06),
					h,
				),
			);
		} else {
			const ranges: HueRange[] = [
				{ h: [100, 140], weight: 3 },
				{ h: [75, 100], weight: 2 },
				{ h: [45, 60], weight: 1 },
				{ h: [25, 40], weight: 1 },
			];
			colours.push(
				pickFromHueRanges(
					ranges,
					[0.4, 0.7],
					[0.08, 0.18],
				),
			);
		}
	}

	return colours;
}

function generateDesertDuskPalette(count: number): string[] {
	const ranges: HueRange[] = [
		{ h: [15, 35], weight: 3, L: [0.45, 0.65] },
		{ h: [40, 55], weight: 2, L: [0.7, 0.85] },
		{ h: [350, 15], weight: 2, L: [0.55, 0.7] },
		{ h: [280, 310], weight: 1, L: [0.25, 0.4] },
	];

	return Array.from({ length: count }, () =>
		pickFromHueRanges(ranges, [0.45, 0.7], [0.06, 0.16]),
	);
}

function generateArcticPalette(count: number): string[] {
	const colours: string[] = [];

	for (let i = 0; i < count; i++) {
		if (Math.random() < 0.3) {
			const h = randomInRange(200, 220);
			colours.push(
				oklchToHex(
					randomInRange(0.92, 0.98),
					randomInRange(0.005, 0.02),
					h,
				),
			);
		} else {
			const ranges: HueRange[] = [
				{ h: [200, 220], weight: 3 },
				{ h: [180, 200], weight: 2 },
				{ h: [220, 250], weight: 1 },
			];
			colours.push(
				pickFromHueRanges(
					ranges,
					[0.7, 0.9],
					[0.02, 0.08],
				),
			);
		}
	}

	return colours;
}

function generateVolcanicPalette(count: number): string[] {
	const colours: string[] = [];

	for (let i = 0; i < count; i++) {
		const roll = Math.random();
		if (roll < 0.25) {
			colours.push(
				oklchToHex(
					randomInRange(0.12, 0.22),
					randomInRange(0.01, 0.03),
					randomInRange(0, 360),
				),
			);
		} else if (roll < 0.4) {
			colours.push(
				oklchToHex(
					randomInRange(0.5, 0.65),
					randomInRange(0.01, 0.03),
					randomInRange(20, 40),
				),
			);
		} else {
			const ranges: HueRange[] = [
				{ h: [0, 20], weight: 2 },
				{ h: [20, 45], weight: 2 },
				{ h: [45, 60], weight: 1 },
			];
			colours.push(
				pickFromHueRanges(
					ranges,
					[0.4, 0.65],
					[0.15, 0.25],
				),
			);
		}
	}

	return colours;
}

function generateMeadowPalette(count: number): string[] {
	const ranges: HueRange[] = [
		{ h: [100, 135], weight: 3 },
		{ h: [280, 320], weight: 2 },
		{ h: [55, 75], weight: 2 },
		{ h: [200, 220], weight: 1 },
	];

	return Array.from({ length: count }, () =>
		pickFromHueRanges(ranges, [0.55, 0.75], [0.12, 0.22]),
	);
}

function generateBauhausPalette(count: number): string[] {
	const colours: string[] = [];

	for (let i = 0; i < count; i++) {
		const roll = Math.random();

		if (roll < 0.2) {
			colours.push(
				oklchToHex(
					randomInRange(0.08, 0.18),
					randomInRange(0.0, 0.02),
					randomInRange(0, 360),
				),
			);
		} else if (roll < 0.3) {
			colours.push(
				oklchToHex(
					randomInRange(0.92, 0.97),
					randomInRange(0.01, 0.025),
					randomInRange(80, 100),
				),
			);
		} else {
			const ranges: HueRange[] = [
				{
					h: [15, 35],
					weight: 3,
					L: [0.5, 0.62],
					c: [0.18, 0.26],
				},
				{
					h: [85, 105],
					weight: 3,
					L: [0.8, 0.88],
					c: [0.14, 0.2],
				},
				{
					h: [240, 265],
					weight: 3,
					L: [0.4, 0.52],
					c: [0.12, 0.18],
				},
				{
					h: [35, 55],
					weight: 1,
					L: [0.65, 0.75],
					c: [0.15, 0.2],
				},
				{
					h: [140, 160],
					weight: 1,
					L: [0.45, 0.55],
					c: [0.1, 0.15],
				},
				{
					h: [0, 15],
					weight: 1,
					L: [0.45, 0.55],
					c: [0.2, 0.26],
				},
			];
			colours.push(
				pickFromHueRanges(
					ranges,
					[0.5, 0.7],
					[0.15, 0.22],
				),
			);
		}
	}

	return colours;
}

function generateArtDecoPalette(count: number): string[] {
	const colours: string[] = [];

	for (let i = 0; i < count; i++) {
		const roll = Math.random();
		if (roll < 0.25) {
			colours.push(
				oklchToHex(
					randomInRange(0.7, 0.8),
					randomInRange(0.12, 0.18),
					randomInRange(85, 100),
				),
			);
		} else if (roll < 0.4) {
			colours.push(
				oklchToHex(
					randomInRange(0.12, 0.2),
					randomInRange(0.01, 0.03),
					randomInRange(0, 360),
				),
			);
		} else if (roll < 0.55) {
			colours.push(
				oklchToHex(
					randomInRange(0.9, 0.96),
					randomInRange(0.015, 0.03),
					randomInRange(80, 100),
				),
			);
		} else {
			const ranges: HueRange[] = [
				{ h: [155, 175], weight: 2 },
				{ h: [180, 200], weight: 1 },
				{ h: [0, 15], weight: 1 },
			];
			colours.push(
				pickFromHueRanges(
					ranges,
					[0.35, 0.55],
					[0.1, 0.18],
				),
			);
		}
	}

	return colours;
}

function generateJapanesePalette(count: number): string[] {
	const colours: string[] = [];

	for (let i = 0; i < count; i++) {
		const roll = Math.random();

		if (roll < 0.15) {
			colours.push(
				oklchToHex(
					randomInRange(0.88, 0.95),
					randomInRange(0.01, 0.03),
					randomInRange(70, 100),
				),
			);
		} else if (roll < 0.25) {
			colours.push(
				oklchToHex(
					randomInRange(0.4, 0.55),
					randomInRange(0.05, 0.1),
					randomInRange(35, 60),
				),
			);
		} else {
			const ranges: HueRange[] = [
				{
					h: [245, 270],
					weight: 3,
					L: [0.25, 0.45],
					c: [0.06, 0.14],
				},
				{
					h: [18, 35],
					weight: 2,
					L: [0.45, 0.58],
					c: [0.14, 0.22],
				},
				{
					h: [0, 18],
					weight: 1,
					L: [0.35, 0.48],
					c: [0.12, 0.18],
				},
				{
					h: [75, 95],
					weight: 2,
					L: [0.7, 0.82],
					c: [0.1, 0.16],
				},
				{
					h: [120, 145],
					weight: 2,
					L: [0.35, 0.5],
					c: [0.06, 0.12],
				},
				{
					h: [290, 320],
					weight: 1,
					L: [0.5, 0.7],
					c: [0.08, 0.14],
				},
				{
					h: [340, 360],
					weight: 1,
					L: [0.75, 0.88],
					c: [0.06, 0.12],
				},
				{
					h: [35, 50],
					weight: 1,
					L: [0.55, 0.68],
					c: [0.12, 0.18],
				},
			];
			colours.push(
				pickFromHueRanges(
					ranges,
					[0.4, 0.6],
					[0.08, 0.15],
				),
			);
		}
	}

	return colours;
}

function generateScandinavianPalette(count: number): string[] {
	const colours: string[] = [];

	for (let i = 0; i < count; i++) {
		const roll = Math.random();
		if (roll < 0.35) {
			colours.push(
				oklchToHex(
					randomInRange(0.93, 0.98),
					randomInRange(0.005, 0.015),
					randomInRange(80, 110),
				),
			);
		} else if (roll < 0.55) {
			colours.push(
				oklchToHex(
					randomInRange(0.8, 0.9),
					randomInRange(0.005, 0.015),
					randomInRange(200, 260),
				),
			);
		} else if (roll < 0.75) {
			colours.push(
				oklchToHex(
					randomInRange(0.8, 0.9),
					randomInRange(0.02, 0.05),
					randomInRange(0, 360),
				),
			);
		} else {
			colours.push(
				oklchToHex(
					randomInRange(0.55, 0.7),
					randomInRange(0.04, 0.08),
					randomInRange(50, 80),
				),
			);
		}
	}

	return colours;
}

function generateMexicanPalette(count: number): string[] {
	const ranges: HueRange[] = [
		{ h: [330, 350], weight: 2 },
		{ h: [20, 40], weight: 2 },
		{ h: [175, 195], weight: 2 },
		{ h: [55, 70], weight: 2 },
		{ h: [280, 310], weight: 1 },
	];

	return Array.from({ length: count }, () =>
		pickFromHueRanges(ranges, [0.55, 0.72], [0.18, 0.28]),
	);
}

export function generatePalette(
	count: number,
	strategy: PaletteStrategy,
): string[] {
	switch (strategy) {
		case 'true-random':
			return generateTrueRandomPalette(count);
		case 'random-cohesive':
			return generateRandomCohesivePalette(count);
		case 'analogous':
			return generateAnalogousPalette(count);
		case 'complementary':
			return generateComplementaryPalette(count);
		case 'triadic':
			return generateTriadicPalette(count);
		case 'split-complementary':
			return generateSplitComplementaryPalette(count);
		case 'tetradic':
			return generateTetradicPalette(count);
		case 'monochromatic':
			return generateMonochromaticPalette(count);
		case 'thermos':
			return generateThermosPalette(count);
		case 'specimen':
			return generateSpecimenPalette(count);
		case 'souvenir':
			return generateSouvenirPalette(count);
		case 'curfew':
			return generateCurfewPalette(count);
		case 'telegraph':
			return generateTelegraphPalette(count);
		case '70s':
			return generate70sPalette(count);
		case '80s':
			return generate80sPalette(count);
		case '90s':
			return generate90sPalette(count);
		case 'y2k':
			return generateY2KPalette(count);
		case 'ocean-sunset':
			return generateOceanSunsetPalette(count);
		case 'forest-morning':
			return generateForestMorningPalette(count);
		case 'desert-dusk':
			return generateDesertDuskPalette(count);
		case 'arctic':
			return generateArcticPalette(count);
		case 'volcanic':
			return generateVolcanicPalette(count);
		case 'meadow':
			return generateMeadowPalette(count);
		case 'bauhaus':
			return generateBauhausPalette(count);
		case 'art-deco':
			return generateArtDecoPalette(count);
		case 'japanese':
			return generateJapanesePalette(count);
		case 'scandinavian':
			return generateScandinavianPalette(count);
		case 'mexican':
			return generateMexicanPalette(count);
		default:
			return generateRandomCohesivePalette(count);
	}
}

export function getStrategiesByCategory(): Record<
	PaletteCategory,
	{ key: PaletteStrategy; info: StrategyInfo }[]
> {
	const result: Record<
		PaletteCategory,
		{ key: PaletteStrategy; info: StrategyInfo }[]
	> = {
		random: [],
		'color-theory': [],
		mood: [],
		era: [],
		nature: [],
		cultural: [],
	};

	for (const [key, info] of Object.entries(STRATEGY_INFO)) {
		result[info.category].push({
			key: key as PaletteStrategy,
			info,
		});
	}

	return result;
}
