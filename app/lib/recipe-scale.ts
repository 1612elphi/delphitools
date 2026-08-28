export type System = 'metric' | 'imperial';
export type Display = 'written' | System;

type Kind = 'volume' | 'mass' | 'length';

interface UnitDef {
	kind: Kind;
	system: System;
	factor: number;
	label: string;
	plural?: string;
}

// factor: ml, g, cm
const UNITS: Record<string, UnitDef> = {
	tsp: { kind: 'volume', system: 'imperial', factor: 5, label: 'tsp' },
	tbsp: { kind: 'volume', system: 'imperial', factor: 15, label: 'Tbsp' },
	cup: {
		kind: 'volume',
		system: 'imperial',
		factor: 240,
		label: 'cup',
		plural: 'cups',
	},
	floz: {
		kind: 'volume',
		system: 'imperial',
		factor: 30,
		label: 'fl oz',
	},
	pint: {
		kind: 'volume',
		system: 'imperial',
		factor: 473,
		label: 'pint',
		plural: 'pints',
	},
	quart: {
		kind: 'volume',
		system: 'imperial',
		factor: 946,
		label: 'quart',
		plural: 'quarts',
	},
	gallon: {
		kind: 'volume',
		system: 'imperial',
		factor: 3785,
		label: 'gallon',
		plural: 'gallons',
	},
	ml: { kind: 'volume', system: 'metric', factor: 1, label: 'ml' },
	dl: { kind: 'volume', system: 'metric', factor: 100, label: 'dl' },
	l: { kind: 'volume', system: 'metric', factor: 1000, label: 'l' },
	oz: { kind: 'mass', system: 'imperial', factor: 28.35, label: 'oz' },
	lb: { kind: 'mass', system: 'imperial', factor: 453.6, label: 'lb' },
	g: { kind: 'mass', system: 'metric', factor: 1, label: 'g' },
	kg: { kind: 'mass', system: 'metric', factor: 1000, label: 'kg' },
	in: { kind: 'length', system: 'imperial', factor: 2.54, label: 'in' },
	cm: { kind: 'length', system: 'metric', factor: 1, label: 'cm' },
	mm: { kind: 'length', system: 'metric', factor: 0.1, label: 'mm' },
};

const ALIASES: Record<string, string> = {
	teaspoon: 'tsp',
	teaspoons: 'tsp',
	tsp: 'tsp',
	tablespoon: 'tbsp',
	tablespoons: 'tbsp',
	tbsp: 'tbsp',
	tbs: 'tbsp',
	tb: 'tbsp',
	cup: 'cup',
	cups: 'cup',
	'fl oz': 'floz',
	'fl. oz': 'floz',
	'fluid ounce': 'floz',
	'fluid ounces': 'floz',
	pint: 'pint',
	pints: 'pint',
	pt: 'pint',
	quart: 'quart',
	quarts: 'quart',
	qt: 'quart',
	gallon: 'gallon',
	gallons: 'gallon',
	gal: 'gallon',
	ml: 'ml',
	millilitre: 'ml',
	millilitres: 'ml',
	milliliter: 'ml',
	milliliters: 'ml',
	dl: 'dl',
	l: 'l',
	litre: 'l',
	litres: 'l',
	liter: 'l',
	liters: 'l',
	oz: 'oz',
	ounce: 'oz',
	ounces: 'oz',
	lb: 'lb',
	lbs: 'lb',
	pound: 'lb',
	pounds: 'lb',
	g: 'g',
	gram: 'g',
	grams: 'g',
	gramme: 'g',
	grammes: 'g',
	kg: 'kg',
	kilo: 'kg',
	kilos: 'kg',
	kilogram: 'kg',
	kilograms: 'kg',
	in: 'in',
	inch: 'in',
	inches: 'in',
	'"': 'in',
	cm: 'cm',
	centimetre: 'cm',
	centimetres: 'cm',
	centimeter: 'cm',
	centimeters: 'cm',
	mm: 'mm',
	millimetre: 'mm',
	millimetres: 'mm',
};

const VULGAR: Record<string, number> = {
	'½': 1 / 2,
	'⅓': 1 / 3,
	'⅔': 2 / 3,
	'¼': 1 / 4,
	'¾': 3 / 4,
	'⅛': 1 / 8,
	'⅜': 3 / 8,
	'⅝': 5 / 8,
	'⅞': 7 / 8,
	'⅕': 1 / 5,
	'⅖': 2 / 5,
	'⅗': 3 / 5,
	'⅘': 4 / 5,
	'⅙': 1 / 6,
	'⅚': 5 / 6,
};
const VULGAR_CHARS = Object.keys(VULGAR).join('');
const NUM = `(?:\\d+\\s+[${VULGAR_CHARS}]|\\d+\\s+\\d+/\\d+|\\d+/\\d+|\\d+(?:[.,]\\d+)?[${VULGAR_CHARS}]?|[${VULGAR_CHARS}])`;
const UNIT = `(?:fl\\.? oz|fluid ounces?|[a-zA-Z]+\\.?|")`;
const QUANTITY = new RegExp(
	`^\\s*(${NUM})(?:\\s*(?:-|–|to)\\s*(${NUM}))?\\s*(${UNIT})?(?=\\s|$)(.*)$`,
);

export interface Quantity {
	amount: number;
	upper?: number;
	unit?: string;
	rest: string;
}

export function parseNumber(token: string): number {
	const t = token
		.trim()
		.replace(/^(\d{1,3})(,\d{3})+$/, (m) => m.replaceAll(',', ''));
	const spaced = t.match(/^(\d+)\s+(.)$/);
	if (spaced && VULGAR[spaced[2]!] !== undefined)
		return Number(spaced[1]) + VULGAR[spaced[2]!]!;
	const mixed = t.match(/^(\d+)\s+(\d+)\/(\d+)$/);
	if (mixed)
		return Number(mixed[1]) + Number(mixed[2]) / Number(mixed[3]);
	const frac = t.match(/^(\d+)\/(\d+)$/);
	if (frac) return Number(frac[1]) / Number(frac[2]);
	const glued = t.match(/^(\d*)(?:[.,](\d+))?(.)?$/);
	if (glued && glued[3] && VULGAR[glued[3]] !== undefined)
		return Number(glued[1] || 0) + VULGAR[glued[3]]!;
	return Number(t.replace(',', '.'));
}

const CASED: Record<string, string> = { T: 'tbsp', t: 'tsp', gr: 'g' };

function unitKey(token: string | undefined): string | undefined {
	if (!token) return undefined;
	const bare = token.replace(/\.$/, '');
	return CASED[bare] ?? ALIASES[bare.toLowerCase()];
}

export function parseQuantity(text: string): Quantity | null {
	const m = text.match(QUANTITY);
	if (!m) return null;
	const [, low, high, unitToken, rest] = m;
	const unit = unitKey(unitToken);
	const q: Quantity = {
		amount: parseNumber(low!),
		rest: (unit ? rest! : `${unitToken ?? ''}${rest!}`).trim(),
	};
	if (high) q.upper = parseNumber(high);
	if (unit) q.unit = unit;
	return q;
}

const FRACTIONS: [number, string][] = [
	[1 / 8, '⅛'],
	[1 / 4, '¼'],
	[1 / 3, '⅓'],
	[3 / 8, '⅜'],
	[1 / 2, '½'],
	[5 / 8, '⅝'],
	[2 / 3, '⅔'],
	[3 / 4, '¾'],
	[7 / 8, '⅞'],
];

export function formatAmount(value: number): string {
	if (!Number.isFinite(value) || value <= 0) return '0';
	const whole = Math.floor(value);
	const part = value - whole;
	if (part < 0.02) return String(whole);
	for (const [fraction, glyph] of FRACTIONS)
		if (Math.abs(part - fraction) < 0.02)
			return whole ? `${whole}${glyph}` : glyph;
	return String(Number(value.toFixed(value < 10 ? 2 : 1)));
}

const roundTo = (value: number, step: number) => {
	let rounded = Math.round(value / step) * step;
	// never round to zero
	while (rounded === 0 && value > 0 && step > 1e-6) {
		step /= 2;
		rounded = Math.round(value / step) * step;
	}
	return rounded;
};

// customary unit and rounding
function present(base: number, kind: Kind, system: System): [number, string] {
	if (kind === 'volume') {
		if (system === 'metric') {
			if (base >= 1000)
				return [roundTo(base / 1000, 0.1), 'l'];
			if (base < 10) return [roundTo(base, 0.25), 'ml'];
			return [roundTo(base, base < 100 ? 1 : 5), 'ml'];
		}
		if (base < 15) return [roundTo(base / 5, 0.125), 'tsp'];
		if (base < 60) return [roundTo(base / 15, 0.5), 'tbsp'];
		if (base < 946) return [roundTo(base / 240, 0.125), 'cup'];
		if (base < 3785) return [roundTo(base / 946, 0.25), 'quart'];
		return [roundTo(base / 3785, 0.25), 'gallon'];
	}
	if (kind === 'mass') {
		if (system === 'metric') {
			if (base >= 1000)
				return [roundTo(base / 1000, 0.05), 'kg'];
			return [roundTo(base, base < 100 ? 1 : 5), 'g'];
		}
		if (base < 454) return [roundTo(base / 28.35, 0.25), 'oz'];
		return [roundTo(base / 453.6, 0.125), 'lb'];
	}
	if (system === 'metric') return [roundTo(base, 0.5), 'cm'];
	return [roundTo(base / 2.54, 0.25), 'in'];
}

function unitLabel(key: string, amount: number): string {
	const def = UNITS[key]!;
	return amount > 1 && def.plural ? def.plural : def.label;
}

// counts snap to halves
const countable = (value: number) => (value >= 1 ? roundTo(value, 0.5) : value);

function scaleTerm(text: string, factor: number, display: Display): string {
	const q = parseQuantity(text);
	if (!q) return text;
	let amount = q.amount * factor;
	let upper = q.upper === undefined ? undefined : q.upper * factor;
	let unit = q.unit;
	const def = unit ? UNITS[unit] : undefined;
	if (def && display !== 'written' && def.system !== display) {
		[amount, unit] = present(
			amount * def.factor,
			def.kind,
			display,
		);
		if (upper !== undefined)
			[upper] = present(
				upper * def.factor,
				def.kind,
				display,
			);
	} else if (!unit) {
		amount = countable(amount);
		if (upper !== undefined) upper = countable(upper);
	}
	const range =
		upper === undefined
			? formatAmount(amount)
			: `${formatAmount(amount)}–${formatAmount(upper)}`;
	const label = unit ? ` ${unitLabel(unit, upper ?? amount)}` : '';
	return `${range}${label} ${q.rest}`.trim();
}

export function scaleIngredient(
	text: string,
	factor: number,
	display: Display,
): string {
	return text
		.split(' + ')
		.map((term) => scaleTerm(term, factor, display))
		.join(' + ');
}

interface Bucket {
	key: string;
	base: number;
	count: number;
	kind?: Kind;
	unit?: string;
	rest: string;
}

// unparsed terms pass through
export function addQuantities(
	terms: string[],
	factor: number,
	display: Display,
): string {
	const buckets: Bucket[] = [];
	const loose: string[] = [];
	for (const term of terms) {
		const q = parseQuantity(term);
		if (!q) {
			if (term.trim()) loose.push(term.trim());
			continue;
		}
		const def = q.unit ? UNITS[q.unit] : undefined;
		const key = `${def ? def.kind : 'count'}|${q.rest}`;
		const base = def ? q.amount * def.factor : q.amount;
		const found = buckets.find((b) => b.key === key);
		if (found) {
			found.base += base;
			found.count += 1;
		} else
			buckets.push({
				key,
				base,
				count: 1,
				kind: def?.kind,
				unit: q.unit,
				rest: q.rest,
			});
	}
	const summed = buckets.map((b) => {
		if (!b.kind)
			return `${formatAmount(countable(b.base * factor))} ${b.rest}`.trim();
		// single term keeps unit
		if (display === 'written' && b.count === 1) {
			const own = UNITS[b.unit!]!;
			const amount = (b.base / own.factor) * factor;
			return `${formatAmount(amount)} ${unitLabel(b.unit!, amount)} ${b.rest}`.trim();
		}
		const system =
			display === 'written'
				? UNITS[b.unit!]!.system
				: display;
		const [amount, unit] = present(b.base * factor, b.kind, system);
		return `${formatAmount(amount)} ${unitLabel(unit, amount)} ${b.rest}`.trim();
	});
	return [...summed, ...loose].join(' + ');
}

const TEMP = /(\d{2,3})\s*°?\s*([CF])\b/g;
const SIZE = `(?:\\d+\\s+\\d+/\\d+|\\d+/\\d+|\\d+(?:\\.\\d+)?[${VULGAR_CHARS}]?|[${VULGAR_CHARS}])`;
const INCHES = new RegExp(
	`(${SIZE})(?:\\s*[x×]\\s*(${SIZE}))?[\\s-]*(?:inch(?:es)?|in\\.|")(?=\\s|$|[,.;)])`,
	'g',
);
const METRIC_LENGTH = new RegExp(
	`(${SIZE})(?:\\s*[x×]\\s*(${SIZE}))?\\s*(cm|mm)\\b`,
	'g',
);

// converts temps, pan sizes
export function convertProse(text: string, display: Display): string {
	if (display === 'written') return text;
	// dual-scale text left alone
	const both = /°\s*F/.test(text) && /°\s*C/.test(text);
	let out = both
		? text
		: text.replace(TEMP, (match, deg: string, scale: string) => {
				if (scale === 'F' && display === 'metric')
					return `${roundTo(((Number(deg) - 32) * 5) / 9, 5)}°C`;
				if (scale === 'C' && display === 'imperial')
					return `${roundTo((Number(deg) * 9) / 5 + 32, 5)}°F`;
				return match;
			});
	if (display === 'metric')
		out = out.replace(INCHES, (_, a: string, b?: string) => {
			const size = (v: string) => {
				const cm = parseNumber(v) * 2.54;
				return cm < 2
					? formatAmount(roundTo(cm, 0.5))
					: String(Math.round(cm));
			};
			return b ? `${size(a)}×${size(b)} cm` : `${size(a)} cm`;
		});
	else
		out = out.replace(
			METRIC_LENGTH,
			(_, a: string, b: string | undefined, unit: string) => {
				const scale = unit === 'mm' ? 0.1 : 1;
				const size = (v: string) =>
					formatAmount(
						roundTo(
							(parseNumber(v) *
								scale) /
								2.54,
							0.25,
						),
					);
				return b
					? `${size(a)}×${size(b)} in`
					: `${size(a)} in`;
			},
		);
	return out;
}
