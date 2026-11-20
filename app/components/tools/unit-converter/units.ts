import { formatDecimal } from 'delphicanon/lib/number';
import {
	niceStep,
	subdivisions,
} from 'delphitools-v2/components/tools/typo-calc/units';

/** A unit as a linear map to its category's base unit: base = value × factor + offset. */
export interface Unit {
	symbol: string;
	label: string;
	factor: number;
	offset?: number;
}

export function toBase(unit: Unit, value: number) {
	return value * unit.factor + (unit.offset ?? 0);
}

export function fromBase(unit: Unit, base: number) {
	return (base - (unit.offset ?? 0)) / unit.factor;
}

export function convert(value: number, from: Unit, to: Unit) {
	return fromBase(to, toBase(from, value));
}

const u = (symbol: string, label: string, factor: number, offset = 0) => ({
	symbol,
	label,
	factor,
	offset,
});

const kib = 1024;

/**
 * UnitConverterViewModel's categories and units with the web tool's units
 * added (nautical miles, petabytes, gigabits, feet per second, square yards,
 * cubic metres, UK gallons). Data keeps the web's binary prefixes.
 */
export const categories: { name: string; units: Unit[] }[] = [
	{
		name: 'Length',
		units: [
			u('m', 'Metres', 1),
			u('km', 'Kilometres', 1000),
			u('cm', 'Centimetres', 0.01),
			u('mm', 'Millimetres', 0.001),
			u('mi', 'Miles', 1609.344),
			u('yd', 'Yards', 0.9144),
			u('ft', 'Feet', 0.3048),
			u('in', 'Inches', 0.0254),
			u('nmi', 'Nautical Miles', 1852),
		],
	},
	{
		name: 'Weight',
		units: [
			u('kg', 'Kilograms', 1),
			u('g', 'Grams', 0.001),
			u('mg', 'Milligrams', 1e-6),
			u('lb', 'Pounds', 0.45359237),
			u('oz', 'Ounces', 0.028349523125),
			u('st', 'Stones', 6.35029318),
			u('t', 'Tonnes', 1000),
		],
	},
	{
		name: 'Temperature',
		units: [
			u('°C', 'Celsius', 1, 273.15),
			u('°F', 'Fahrenheit', 5 / 9, 273.15 - (32 * 5) / 9),
			u('K', 'Kelvin', 1),
		],
	},
	{
		name: 'Data',
		units: [
			u('B', 'Bytes', 1),
			u('KB', 'Kilobytes', kib),
			u('MB', 'Megabytes', kib ** 2),
			u('GB', 'Gigabytes', kib ** 3),
			u('TB', 'Terabytes', kib ** 4),
			u('PB', 'Petabytes', kib ** 5),
			u('b', 'Bits', 1 / 8),
			u('Kb', 'Kilobits', kib / 8),
			u('Mb', 'Megabits', kib ** 2 / 8),
			u('Gb', 'Gigabits', kib ** 3 / 8),
		],
	},
	{
		name: 'Speed',
		units: [
			u('m/s', 'Metres/sec', 1),
			u('km/h', 'Kilometres/hr', 1 / 3.6),
			u('mph', 'Miles/hr', 0.44704),
			u('kn', 'Knots', 1852 / 3600),
			u('ft/s', 'Feet/sec', 0.3048),
		],
	},
	{
		name: 'Volume',
		units: [
			u('L', 'Litres', 1),
			u('mL', 'Millilitres', 0.001),
			u('m³', 'Cubic Metres', 1000),
			u('gal', 'Gallons (US)', 3.785411784),
			u('gal UK', 'Gallons (UK)', 4.54609),
			u('qt', 'Quarts (US)', 0.946352946),
			u('pt', 'Pints (US)', 0.473176473),
			u('cup', 'Cups (US)', 0.2365882365),
			u('fl oz', 'Fluid Ounces (US)', 0.0295735295625),
			u('tbsp', 'Tablespoons', 0.01478676478125),
			u('tsp', 'Teaspoons', 0.00492892159375),
		],
	},
	{
		name: 'Area',
		units: [
			u('m²', 'Square Metres', 1),
			u('km²', 'Square Kilometres', 1e6),
			u('ft²', 'Square Feet', 0.09290304),
			u('yd²', 'Square Yards', 0.83612736),
			u('mi²', 'Square Miles', 2589988.110336),
			u('ha', 'Hectares', 1e4),
			u('ac', 'Acres', 4046.8564224),
		],
	},
	{
		name: 'Time',
		units: [
			u('s', 'Seconds', 1),
			u('ms', 'Milliseconds', 0.001),
			u('µs', 'Microseconds', 1e-6),
			u('ns', 'Nanoseconds', 1e-9),
			u('min', 'Minutes', 60),
			u('hr', 'Hours', 3600),
			u('d', 'Days', 86_400),
			u('wk', 'Weeks', 604_800),
			u('ftn', 'Fortnights', 1_209_600),
			// gregorian mean: 365.2425 days
			u('mo', 'Months', 2_629_746),
			u('yr', 'Years', 31_556_952),
		],
	},
	{
		name: 'Pressure',
		units: [
			u('Pa', 'Pascals', 1),
			u('hPa', 'Hectopascals', 100),
			u('bar', 'Bars', 1e5),
			u('mbar', 'Millibars', 100),
			u('psi', 'PSI', 6894.757293168),
			u('inHg', 'Inches of Mercury', 3386.389),
			u('mmHg', 'mmHg', 133.322387415),
		],
	},
];

/** Pixels at `ppi` pixels (or dots) per inch, a Length unit. */
export const pixels = (ppi: number) => u('px', 'Pixels', 0.0254 / ppi);

/** The pair a category opens on, by symbol: from, to. */
export const openingPairs: Record<string, [string, string]> = {
	Length: ['km', 'mi'],
	Weight: ['kg', 'lb'],
	Temperature: ['°C', '°F'],
	Data: ['GB', 'MB'],
	Speed: ['km/h', 'mph'],
	Volume: ['L', 'gal'],
	Area: ['m²', 'ft²'],
	Time: ['hr', 'min'],
	Pressure: ['bar', 'psi'],
};

export type Instrument =
	| 'tape'
	| 'thermometer'
	| 'speedometer'
	| 'manometer'
	| 'balance'
	| 'jug'
	| 'squares';

export function instrumentFor(category: string): Instrument {
	return (
		(
			{
				Temperature: 'thermometer',
				Weight: 'balance',
				Speed: 'speedometer',
				Pressure: 'manometer',
				Volume: 'jug',
				Area: 'squares',
			} as Record<string, Instrument>
		)[category] ?? 'tape'
	);
}

const superscripts = '⁰¹²³⁴⁵⁶⁷⁸⁹';

/** Up to four decimals; a value that needs more, and one from a billion up, is a mantissa times a power of ten. */
export function format(value: number): string {
	if (!Number.isFinite(value)) return '—';
	const magnitude = Math.abs(value);
	if (magnitude === 0) return '0';
	const decimal = formatDecimal(value, 4);
	// 0.00062 would lose digits
	if (
		magnitude < 1e9 &&
		(magnitude >= 0.01 ||
			(magnitude >= 1e-4 &&
				Math.abs(Number(decimal) - value) <=
					magnitude * 1e-9))
	)
		return decimal;
	let exponent = Math.floor(Math.log10(magnitude));
	let mantissa = value / 10 ** exponent;
	// 9.99996 rounds to 10
	if (Math.abs(Math.round(mantissa * 1e4)) >= 1e5) {
		mantissa /= 10;
		exponent += 1;
	}
	const digits = [...String(exponent)]
		.map((c) => (c === '-' ? '⁻' : superscripts[Number(c)]))
		.join('');
	return `${formatDecimal(mantissa, 4)}×10${digits}`;
}

/** Scale numbers: plain decimals from 0.0001 up to ten million. */
export function tickLabel(value: number): string {
	const magnitude = Math.abs(value);
	if (magnitude !== 0 && (magnitude < 1e-4 || magnitude >= 1e7))
		return format(value);
	return String(Number((value + 0).toPrecision(6)) + 0);
}

/** The right side of `to = from × m + c`, or of `to = (from − a) ÷ k` when the slope is below one. */
export function formula(from: Unit, to: Unit): string {
	const offset = convert(0, from, to);
	const slope = convert(1, from, to) - offset;
	const number = (v: number) => formatDecimal(Math.abs(v), 4);
	const signed = (v: number) =>
		v < 0 ? ` − ${number(v)}` : ` + ${number(v)}`;
	const shows = (v: number) => Math.abs(v) >= 0.00005;
	if (Math.abs(slope) >= 1 - 1e-9) {
		const scaled =
			Math.abs(slope - 1) < 1e-9
				? from.symbol
				: `${from.symbol} × ${number(slope)}`;
		return scaled + (shows(offset) ? signed(offset) : '');
	}
	const shift = -offset / slope;
	const inner = shows(shift)
		? `(${from.symbol}${signed(-shift)})`
		: from.symbol;
	return `${inner} ÷ ${number(1 / slope)}`;
}

/** In base units. `span` is the scale's length; for squares it is the area of one result unit. */
export interface Pose {
	value: number;
	lo: number;
	span: number;
}

/** The settle curve, 0 to 1: a cubic ease-out that never passes 1. */
export function easeOutCubic(progress: number): number {
	return 1 - (1 - Math.min(1, Math.max(0, progress))) ** 3;
}

/** Where the scale runs: the value sits between 36 % and 90 % of a 1-2-5 length; a thermometer shows a window around it. */
export function pose(
	instrument: Instrument,
	value: number,
	from: Unit,
	to: Unit,
): Pose {
	if (instrument === 'thermometer') {
		const span = niceStep(Math.max(Math.abs(value) * 1.2, 50));
		const grid = span / 5;
		const lo = Math.floor((value - span * 0.55) / grid) * grid;
		return {
			value: toBase(from, value),
			lo: toBase(from, lo),
			span: toBase(from, lo + span) - toBase(from, lo),
		};
	}
	if (instrument === 'squares')
		return {
			value: toBase(from, Math.max(0, value)),
			lo: 0,
			span: toBase(to, 1),
		};
	const v = Math.max(0, value);
	const span = v > 0 ? niceStep(v / 0.9) : 1;
	return { value: toBase(from, v), lo: 0, span: toBase(from, span) };
}

export interface Tick {
	/** Px from the start of the scale. */
	offset: number;
	major: boolean;
	label?: string;
}

/** Width of a label in Iosevka, half an em a character. */
export function labelWidth(text: string, size: number) {
	return [...text].length * size * 0.5;
}

/**
 * Graduations of `unit` over `lo … lo + span` (base units) laid along
 * `length` px: 1-2-5 majors at least `spacing` apart and wide enough for
 * their labels, minors where they are 4 px apart.
 */
export function ticks(
	unit: Unit,
	lo: number,
	span: number,
	length: number,
	spacing: number,
	fontSize: number,
): Tick[] {
	const a = fromBase(unit, lo);
	const b = fromBase(unit, lo + span);
	if (!(length > 0) || !(b > a) || !Number.isFinite(b - a)) return [];
	const perUnit = length / (b - a);
	let major = niceStep(spacing / perUnit);
	for (let i = 0; i < 6; i++) {
		const widest = Math.max(
			...[a, b].map((end) =>
				labelWidth(
					tickLabel(
						Math.round(end / major) * major,
					),
					fontSize,
				),
			),
		);
		if (major * perUnit >= widest + 10) break;
		major = niceStep(major * 1.5);
	}
	const minor = major / subdivisions(major);
	const step = minor * perUnit >= 4 ? minor : major;
	const first = Math.ceil(a / step - 1e-9);
	const last = Math.floor(b / step + 1e-9);
	if (last < first || last - first >= 1000) return [];
	const out: Tick[] = [];
	for (let index = first; index <= last; index++) {
		const value = index * step;
		const isMajor =
			Math.abs(Math.round(value / major) * major - value) <
			step * 1e-6;
		out.push({
			offset: (value - a) * perUnit,
			major: isMajor,
			label: isMajor ? tickLabel(value) : undefined,
		});
	}
	return out;
}

/** Weights for one side of the pan: `full` blocks of `denomination` units and a cut block of `part`. */
export interface Weights {
	denomination: number;
	full: number;
	part: number;
}

/** A power of ten per block, so a stack holds one to ten of them. */
export function weightsOf(value: number): Weights | undefined {
	if (!(value > 0) || !Number.isFinite(value)) return undefined;
	const denomination = 10 ** Math.floor(Math.log10(value));
	let count = value / denomination;
	// 9.99999 becomes next size
	if (count > 9.995)
		return { denomination: denomination * 10, full: 1, part: 0 };
	count = Math.round(count * 100) / 100;
	const full = Math.floor(count);
	const part = count - full;
	return { denomination, full, part: part < 0.02 ? 0 : part };
}

export interface Rect {
	x: number;
	y: number;
	width: number;
	height: number;
}

/**
 * Block frames of one stack, bottom layer first, centred on `midX` and
 * standing on `floor`; an upper layer is centred on the one below.
 */
export function stackFrames(
	shape: { width: number; height: number; blocks: number },
	perLayer: number,
	unit: number,
	midX: number,
	floor: number,
): Rect[] {
	const stackWidth =
		shape.width * unit * Math.min(perLayer, shape.blocks);
	const x = midX - stackWidth / 2;
	const width = shape.width * unit;
	const height = shape.height * unit;
	return Array.from({ length: shape.blocks }, (_, index) => {
		const layer = Math.floor(index / perLayer);
		const place = index % perLayer;
		const inLayer = Math.min(
			perLayer,
			shape.blocks - layer * perLayer,
		);
		const left =
			x + (stackWidth - width * inLayer) / 2 + width * place;
		return {
			x: left + 1,
			y: floor - height * (layer + 1) + 1,
			width: width - 2,
			height: height - 1,
		};
	});
}
