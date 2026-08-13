// The omnibox's reading of typed, pasted, or dropped input: tool search,
// file→tool routing over the registry's `accepts` field, and microtool
// answers. Detection guards are cheap and synchronous; the answer bodies that
// need real logic import the owning tool's module on demand, so the front
// page never carries a tool chunk (or mathjs) it has not been asked for.

import { allTools, getToolById, type Tool } from './tools';
import { detectColour } from './colour-parse';
import {
	contrastRatio,
	hslToRgb,
	rgbToHex,
	rgbToHsl,
	rgbToOklch,
} from './colour-maths';
import { colourToQuery } from './colour-query';
import { simulateHex, type SimulationType } from './colour-vision';
import { formatScientific } from './math-constants';
import { matchesAccept } from 'delphitools-v2/modifiers/file-paste';
import type { CategoryKey } from 'delphitools-v2/components/tools/unit-converter';

export interface OmniAnswer {
	toolId: string;
	/** monospace answer text; empty when the row is only swatches */
	value: string;
	swatches?: string[];
	/** a small image preview (QR code, etc.) */
	image?: string;
	/** query params the row's arrow carries into the tool */
	query?: Record<string, string>;
}

export interface OmniReading {
	answers: OmniAnswer[];
	/** tools that take the value without an inline answer */
	carry: Tool[];
	carryQuery: Record<string, string>;
}

const MAX_ANSWERS = 6;

/** Case-insensitive substring match over names and descriptions. */
export function searchTools(query: string): Tool[] {
	const q = query.trim().toLowerCase();
	if (!q) return [];
	return allTools.filter(
		(tool) =>
			tool.name.toLowerCase().includes(q) ||
			tool.description.toLowerCase().includes(q),
	);
}

/** Every tool whose `accepts` matches the dropped file, in catalogue order. */
export function toolsForFile(file: File): Tool[] {
	return allTools.filter((tool) =>
		tool.accepts
			? matchesAccept(file, tool.accepts.join(','))
			: false,
	);
}

/**
 * A bare digit run reads as a number (bases, timestamp), not as prefixless
 * hex — `123456` is far more often a count than a colour.
 */
function readColourHex(input: string): string | null {
	if (/^\d+$/.test(input)) return null;
	const rgb = detectColour(input);
	return rgb ? rgbToHex(...rgb) : null;
}

function push(
	answers: OmniAnswer[],
	toolId: string,
	answer: Omit<OmniAnswer, 'toolId'>,
) {
	// A tool absent from the registry must not produce a ghost row.
	if (getToolById(toolId)) answers.push({ toolId, ...answer });
}

async function colourAnswers(hex: string): Promise<OmniAnswer[]> {
	const answers: OmniAnswer[] = [];
	const query = { color: colourToQuery(hex) };
	const rgb = detectColour(hex)!;
	const [r, g, b] = rgb;

	// color-name-list (~176 kB) loads only when a colour is actually read, so it
	// stays out of the eager front-page bundle. Same on-demand rule as the rest
	// of this module's answer bodies.
	const { getColourName } = await import('./colour-names');
	push(answers, 'colour-atlas', {
		value: `${getColourName(hex)} · ${hex}`,
		query,
	});

	const [h, s, l] = rgbToHsl(r, g, b);
	const [ol, oc, oh] = rgbToOklch(r, g, b);
	push(answers, 'colour-converter', {
		value:
			`rgb(${r} ${g} ${b}) · ` +
			`hsl(${Math.round(h)} ${Math.round(s)}% ${Math.round(l)}%) · ` +
			`oklch(${ol.toFixed(2)} ${oc.toFixed(2)} ${Math.round(oh)})`,
		query,
	});

	const onWhite = contrastRatio(hex, '#ffffff');
	const onBlack = contrastRatio(hex, '#000000');
	if (onWhite !== null && onBlack !== null)
		push(answers, 'contrast-checker', {
			value: `${onWhite.toFixed(1)}:1 on white · ${onBlack.toFixed(1)}:1 on black`,
			query,
		});

	const { generateShades } =
		await import('delphitools-v2/components/tools/tailwind-shades');
	const shades = generateShades(hex, 'classic');
	if (shades)
		push(answers, 'tailwind-shades', {
			value: '',
			swatches: shades.map((shade) => shade.hex),
			query,
		});

	const rotate = (deg: number) =>
		rgbToHex(...hslToRgb((h + deg) % 360, s, l));
	push(answers, 'harmony-genny', {
		value: '',
		swatches: [hex, rotate(180), rotate(120), rotate(240)],
		query,
	});

	const sim = (type: SimulationType) => simulateHex(hex, type) ?? hex;
	push(answers, 'colorblind-sim', {
		value: '',
		swatches: [
			hex,
			sim('protanopia'),
			sim('deuteranopia'),
			sim('tritanopia'),
		],
		query,
	});

	return answers;
}

const UNIT_INPUT = /^(\d+(?:\.\d+)?)\s*(px|pt|em|rem)$/i;
const UNIT_ANY = /^(\d+(?:\.\d+)?)\s*(.+)$/;

async function unitAnswers(input: string): Promise<OmniAnswer[]> {
	const typoMatch = UNIT_INPUT.exec(input);
	if (typoMatch) {
		const value = parseFloat(typoMatch[1]!);
		const unit = typoMatch[2]!.toLowerCase();

		const { UNITS } =
			await import('delphitools-v2/components/tools/typo-calc');
		const info = UNITS[unit as keyof typeof UNITS];
		if (!info) return [];
		const px = info.toPx(value, 16);

		// typo-calc's formatValue pads to fixed decimals for its table; a row
		// wants `1.125`, not `1.12500`.
		const trim = (n: number) => String(parseFloat(n.toFixed(4)));

		const answers: OmniAnswer[] = [];
		push(answers, 'px-to-rem', {
			value: `${trim(UNITS.rem.fromPx(px, 16))}rem @ 16px base`,
		});
		push(answers, 'typo-calc', {
			value:
				`${trim(UNITS.pt.fromPx(px, 16))}pt · ` +
				`${trim(UNITS.em.fromPx(px, 16))}em · ` +
				`${trim(px)}px`,
		});
		return answers;
	}

	const generalMatch = UNIT_ANY.exec(input);
	if (!generalMatch) return [];
	const value = parseFloat(generalMatch[1]!);
	const symbol = generalMatch[2]!.trim();

	const { UNIT_CATEGORIES, convertUnit, formatNumber } =
		await import('delphitools-v2/components/tools/unit-converter');

	for (const category of Object.keys(UNIT_CATEGORIES) as CategoryKey[]) {
		const units = UNIT_CATEGORIES[category].units;
		const baseKey = UNIT_CATEGORIES[category].baseUnit;
		for (const key of Object.keys(units)) {
			if (
				units[key]!.symbol.toLowerCase() !==
				symbol.toLowerCase()
			)
				continue;

			const baseValue = units[key]!.toBase(value);
			const targetKeys = Object.keys(units).filter(
				(k) => k !== key && k !== baseKey,
			);
			const extras = targetKeys.slice(0, 2);
			const parts = [
				`${formatNumber(baseValue)} ${units[baseKey]!.symbol}`,
			];
			for (const target of extras) {
				parts.push(
					`${formatNumber(
						convertUnit(
							category,
							value,
							key,
							target,
						),
					)} ${units[target]!.symbol}`,
				);
			}

			const answers: OmniAnswer[] = [];
			push(answers, 'unit-converter', {
				value: parts.join(' · '),
			});
			return answers;
		}
	}

	return [];
}

const INTEGER_INPUT = /^(0x[0-9a-f]+|0b[01]+|0o[0-7]+|\d{1,15})$/i;

async function integerAnswers(input: string): Promise<OmniAnswer[]> {
	if (!INTEGER_INPUT.test(input)) return [];
	const num = Number(input);
	if (!Number.isSafeInteger(num) || num < 0) return [];

	const { convertAll } =
		await import('delphitools-v2/components/tools/base-converter');
	const bases = convertAll(num);
	const answers: OmniAnswer[] = [];
	push(answers, 'base-converter', {
		value: `${bases.dec} · 0x${bases.hex} · 0b${bases.bin} · 0o${bases.oct}`,
	});
	return answers;
}

const UNIX_S = /^\d{10}$/;
const UNIX_MS = /^\d{13}$/;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}([T ]|$)/;

function timeAnswers(input: string): OmniAnswer[] {
	let date: Date | null = null;
	let value = '';

	if (UNIX_S.test(input)) date = new Date(Number(input) * 1000);
	else if (UNIX_MS.test(input)) date = new Date(Number(input));
	else if (ISO_DATE.test(input)) {
		const parsed = new Date(input);
		if (!Number.isNaN(parsed.getTime())) {
			date = parsed;
			value = `unix ${Math.floor(parsed.getTime() / 1000)}`;
		}
	}
	if (!date || Number.isNaN(date.getTime())) return [];
	if (!value) value = date.toISOString();

	const answers: OmniAnswer[] = [];
	push(answers, 'time-calc', { value });
	return answers;
}

// Digits, operators and grouping only — and at least one infix operator, so a
// plain number is a number, not an expression.
const EXPRESSION_SHAPE = /^[\d\s+\-*/^().,%!]+$/;
const HAS_OPERATOR = /\d\s*[+\-*/^%]/;

async function expressionAnswers(input: string): Promise<OmniAnswer[]> {
	if (!EXPRESSION_SHAPE.test(input) || !HAS_OPERATOR.test(input))
		return [];

	try {
		const { evaluate } = await import('mathjs');
		const result: unknown = evaluate(input);
		if (typeof result !== 'number' || !Number.isFinite(result))
			return [];
		const answers: OmniAnswer[] = [];
		push(answers, 'sci-calc', { value: formatScientific(result) });
		return answers;
	} catch {
		return [];
	}
}

const ALGEBRA_SHAPE = /^[a-zA-Z0-9\s+\-*/^().,=]+$/;
const HAS_VARIABLE = /[a-zA-Z]/;
const HAS_ALGEBRA_OPERATOR = /[+\-*/^=]/;

async function algebraAnswers(input: string): Promise<OmniAnswer[]> {
	if (
		!ALGEBRA_SHAPE.test(input) ||
		!HAS_VARIABLE.test(input) ||
		!HAS_ALGEBRA_OPERATOR.test(input)
	)
		return [];

	const { compute } =
		await import('delphitools-v2/components/tools/algebra-calc');
	const math = await import('mathjs');
	// solve is variable-agnostic; this label is the first letter and only
	// mislabels non-polynomial input (which mathjs then rejects anyway).
	const variable = /[a-zA-Z]/.exec(input)?.[0] ?? 'x';
	try {
		const output = compute(math, 'solve', input, variable);
		const answers: OmniAnswer[] = [];
		push(answers, 'algebra-calc', {
			value: `${variable} = ${output}`,
		});
		return answers;
	} catch {
		return [];
	}
}

const SVG_LIKE = /^\s*<(?:\?xml|svg)/i;

async function svgAnswers(input: string): Promise<OmniAnswer[]> {
	if (!SVG_LIKE.test(input)) return [];

	const { optimiseSvg, formatBytes } =
		await import('delphitools-v2/components/tools/svg-optimiser');
	const stats = await optimiseSvg(input);
	if (!stats) return [];

	const answers: OmniAnswer[] = [];
	push(answers, 'svg-optimiser', {
		value: `${formatBytes(stats.original)} → ${formatBytes(
			stats.optimised,
		)} · ${stats.percent}% saved`,
	});
	return answers;
}

const URL_LIKE = /^https?:\/\/.+/i;

async function qrAnswers(input: string): Promise<OmniAnswer[]> {
	if (!URL_LIKE.test(input)) return [];

	const { qrDataUrl } =
		await import('delphitools-v2/components/tools/qr-genny');
	const image = await qrDataUrl(input, 80);
	if (!image) return [];

	const answers: OmniAnswer[] = [];
	push(answers, 'qr-genny', {
		value: 'QR preview',
		image,
	});
	return answers;
}

async function glyphAnswers(input: string): Promise<OmniAnswer[]> {
	const { describeGlyph } =
		await import('delphitools-v2/components/tools/glyph-browser');
	const info = describeGlyph(input);
	if (!info) return [];

	const answers: OmniAnswer[] = [];
	push(answers, 'glyph-browser', {
		value: `${info.char} · ${info.label} · ${info.category}`,
	});
	return answers;
}

async function paperSizeAnswers(input: string): Promise<OmniAnswer[]> {
	const { findPaperSize, formatDimensions } =
		await import('delphitools-v2/lib/paper-sizes');
	const size = findPaperSize(input.trim().toLowerCase());
	if (!size) return [];

	const answers: OmniAnswer[] = [];
	push(answers, 'paper-sizes', {
		value: `${formatDimensions(size, 'mm')} · ${formatDimensions(
			size,
			'in',
		)}`,
	});
	return answers;
}

async function tailwindAnswers(input: string): Promise<OmniAnswer[]> {
	const { lookupTailwindClass } =
		await import('delphitools-v2/components/tools/tailwind-cheatsheet');
	const item = lookupTailwindClass(input);
	if (!item) return [];

	const answers: OmniAnswer[] = [];
	push(answers, 'tailwind-cheatsheet', { value: item.css });
	return answers;
}

const BASE64_SHAPE = /^[A-Za-z0-9+/=]+$/;
const BASE64_MIN_LEN = 8;
const BASE64_PRINTABLE_FLOOR = 0.8;

const URL_ENCODED_SHAPE = /%[0-9A-Fa-f]{2}/;

async function encodingAnswers(input: string): Promise<OmniAnswer[]> {
	const { encodeBase64, decodeBase64, convertUrl, tryDecodeUrl } =
		await import('delphitools-v2/components/tools/encoder');

	let decoded: string | null = null;
	let mode: 'base64' | 'url' | null = null;

	// Requiring a length multiple of 4 skips unpadded Base64; that is the noise
	// floor, not an oversight.
	if (
		input.length >= BASE64_MIN_LEN &&
		input.length % 4 === 0 &&
		BASE64_SHAPE.test(input)
	) {
		try {
			const d = decodeBase64(input);
			if (printableRatio(d) >= BASE64_PRINTABLE_FLOOR) {
				decoded = d;
				mode = 'base64';
			}
		} catch {
			// Not valid Base64; keep looking.
		}
	}

	if (decoded === null && URL_ENCODED_SHAPE.test(input)) {
		const d = tryDecodeUrl(input);
		if (d !== null && d !== input) {
			decoded = d;
			mode = 'url';
		}
	}

	if (decoded === null || !mode) return [];

	const truncate = (text: string) =>
		text.length > 40 ? `${text.slice(0, 40)}…` : text;

	const answers: OmniAnswer[] = [];
	if (mode === 'base64') {
		push(answers, 'encoder', {
			value: `base64 decoded · ${truncate(decoded)} · url · ${truncate(
				convertUrl('encode', decoded),
			)}`,
		});
	} else {
		push(answers, 'encoder', {
			value: `url decoded · ${truncate(decoded)} · base64 · ${truncate(
				encodeBase64(decoded),
			)}`,
		});
	}
	return answers;
}

const SHAVIAN_MIN_WORDS = 2;
const SHAVIAN_WORD = /^[a-zA-Z']+$/;

let shavianCoreReady: Promise<void> | null = null;

async function ensureShavianCore(): Promise<void> {
	shavianCoreReady ??= (async () => {
		const { parseDictJson } =
			await import('delphitools-v2/components/tools/shavian-transliterator');
		const { setCoreDictionary } =
			await import('delphitools-v2/lib/shavian/transliterate');
		const core =
			await import('delphitools-v2/lib/shavian/dictionary-core.json?raw');
		setCoreDictionary(
			parseDictJson(
				JSON.parse(core.default) as Record<
					string,
					string[]
				>,
			),
		);
	})();
	return shavianCoreReady;
}

async function shavianAnswers(input: string): Promise<OmniAnswer[]> {
	const words = input.split(/\s+/).filter(Boolean);
	if (words.length < SHAVIAN_MIN_WORDS) return [];
	if (!words.every((word) => SHAVIAN_WORD.test(word))) return [];

	const { glossToText } =
		await import('delphitools-v2/components/tools/shavian-transliterator');
	const { tokenise } =
		await import('delphitools-v2/lib/shavian/transliterate');
	await ensureShavianCore();

	const shavian = glossToText(tokenise(input));
	const answers: OmniAnswer[] = [];
	push(answers, 'shavian-transliterator', {
		value:
			shavian.length > 60
				? `${shavian.slice(0, 60)}…`
				: shavian,
	});
	return answers;
}

const MIN_TEXT_WORDS = 4;
const MIN_CIPHER_CHARS = 12;
const CIPHER_PREVIEW_CHARS = 40;
// classifyAndDecode ranks by shape confidence, not readability — a Base32
// decode of plain ciphertext outranks the Caesar decode, and englishLikeness
// alone cannot veto it: on a mostly-non-letter string the chi-squared half
// scores near-perfect (0.89 for binary garbage), while an ALL-CAPS true
// decode manages only 0.40 (the common-word half misses uppercase). So:
// binary garbage dies on the printable-ASCII gate, and the likeness floor
// sits below the all-caps case.
const CIPHER_CONFIDENCE = 1.2;
const CIPHER_FLOOR = 0.35;
const CIPHER_PRINTABLE_FLOOR = 0.9;

function printableRatio(text: string): number {
	if (!text) return 0;
	const chars = [...text];
	const printable = chars.filter((ch) => /[ -~\n\t]/.test(ch)).length;
	return printable / chars.length;
}

async function textAnswers(input: string): Promise<OmniAnswer[]> {
	const words = input.split(/\s+/).filter(Boolean).length;
	if (words < MIN_TEXT_WORDS && input.length < MIN_CIPHER_CHARS)
		return [];
	const answers: OmniAnswer[] = [];

	if (input.length >= MIN_CIPHER_CHARS) {
		const { classifyAndDecode, englishLikeness } =
			await import('delphitools-v2/components/tools/decoder');
		let best = null;
		let bestScore = 0;
		for (const candidate of classifyAndDecode(input)) {
			if (
				printableRatio(candidate.output) <
				CIPHER_PRINTABLE_FLOOR
			)
				continue;
			const score = englishLikeness(candidate.output);
			if (score > bestScore) {
				best = candidate;
				bestScore = score;
			}
		}
		if (
			best &&
			bestScore >= CIPHER_FLOOR &&
			bestScore > englishLikeness(input) * CIPHER_CONFIDENCE
		) {
			const preview =
				best.output.length > CIPHER_PREVIEW_CHARS
					? `${best.output.slice(0, CIPHER_PREVIEW_CHARS)}…`
					: best.output;
			push(answers, 'decoder', {
				value: `${best.cipher} · "${preview}"`,
			});
		}
	}

	if (words >= MIN_TEXT_WORDS) {
		const { countText } =
			await import('delphitools-v2/components/tools/word-counter');
		const stats = countText(input);
		push(answers, 'word-counter', {
			value: `${stats.words} words · ${stats.characters} chars`,
		});
	}

	return answers;
}

/**
 * Every microtool answer for the input, or null when nothing reads it and
 * the omnibox should fall back to plain search. Async because answer bodies
 * load their tool's chunk on demand — callers guard staleness themselves.
 */
export async function readInput(raw: string): Promise<OmniReading | null> {
	const input = raw.trim();
	if (!input) return null;

	const hex = readColourHex(input);
	if (hex) {
		const answers = await colourAnswers(hex);
		const answered = new Set(answers.map((a) => a.toolId));
		return {
			answers,
			carry: allTools.filter(
				(tool) =>
					tool.carryColour &&
					!answered.has(tool.id),
			),
			carryQuery: { color: colourToQuery(hex) },
		};
	}

	const settled = await Promise.allSettled([
		svgAnswers(input),
		qrAnswers(input),
		glyphAnswers(input),
		paperSizeAnswers(input),
		tailwindAnswers(input),
		unitAnswers(input),
		integerAnswers(input),
		Promise.resolve(timeAnswers(input)),
		expressionAnswers(input),
		algebraAnswers(input),
		encodingAnswers(input),
		shavianAnswers(input),
		textAnswers(input),
	]);
	const answers = settled
		.flatMap((r) => (r.status === 'fulfilled' ? r.value : []))
		.slice(0, MAX_ANSWERS);

	if (answers.length === 0) return null;
	return { answers, carry: [], carryQuery: {} };
}
