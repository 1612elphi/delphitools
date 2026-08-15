/**
 * Placement + number-format maths for the PDF page numberer / stamper. Kept out
 * of the component so it is unit-testable without pdf-lib loaded.
 *
 * Coordinates are pdf-lib's: origin bottom-left, y increasing upward, which is
 * the PDF user space. `placeText` returns the baseline origin `drawText` wants.
 */

export type Anchor =
	| 'top-left'
	| 'top-center'
	| 'top-right'
	| 'middle-left'
	| 'middle-center'
	| 'middle-right'
	| 'bottom-left'
	| 'bottom-center'
	| 'bottom-right';

export const ANCHORS: Anchor[] = [
	'top-left',
	'top-center',
	'top-right',
	'middle-left',
	'middle-center',
	'middle-right',
	'bottom-left',
	'bottom-center',
	'bottom-right',
];

export interface Point {
	x: number;
	y: number;
}

/**
 * Baseline origin for a run of text of pixel width `textWidth` at `fontSize`,
 * anchored in a `pageW`×`pageH` page with `margin` from the edges.
 */
export function placeText(
	pageW: number,
	pageH: number,
	textWidth: number,
	fontSize: number,
	anchor: Anchor,
	margin: number,
): Point {
	const [v, h] = anchor.split('-') as [string, string];

	let x: number;
	if (h === 'left') x = margin;
	else if (h === 'right') x = pageW - textWidth - margin;
	else x = (pageW - textWidth) / 2;

	// Baseline y: for the top row, sit the text just under the top margin (so
	// the ascenders clear it); for the bottom row, the baseline is the margin.
	let y: number;
	if (v === 'top') y = pageH - margin - fontSize;
	else if (v === 'bottom') y = margin;
	else y = (pageH - fontSize) / 2;

	return { x, y };
}

/**
 * Expand a page-number template: `{n}` = this page's formatted number, `{N}` =
 * the document total. Both are pre-formatted strings so a section can render
 * roman while the total stays arabic. Unknown tokens are left as written; a
 * template with no token becomes a fixed stamp on every page.
 */
export function expandNumber(template: string, n: string, N: string): string {
	return template.replace(/\{n\}/g, n).replace(/\{N\}/g, N);
}

/** Numeral system a section counts in. */
export type NumeralStyle =
	| 'arabic'
	| 'roman-lower'
	| 'roman-upper'
	| 'alpha-lower'
	| 'alpha-upper';

const ROMAN: [number, string][] = [
	[1000, 'M'],
	[900, 'CM'],
	[500, 'D'],
	[400, 'CD'],
	[100, 'C'],
	[90, 'XC'],
	[50, 'L'],
	[40, 'XL'],
	[10, 'X'],
	[9, 'IX'],
	[5, 'V'],
	[4, 'IV'],
	[1, 'I'],
];

/** Roman numeral for 1–3999; anything outside that range has no clean roman
 *  form, so it falls back to the arabic digits. */
function toRoman(value: number): string {
	if (value <= 0 || value >= 4000) return String(value);
	let n = value;
	let out = '';
	for (const [amount, symbol] of ROMAN) {
		while (n >= amount) {
			out += symbol;
			n -= amount;
		}
	}
	return out;
}

/** Bijective base-26 letters: 1→a, 26→z, 27→aa. Non-positive falls back to
 *  the arabic digits. */
function toAlpha(value: number): string {
	if (value <= 0) return String(value);
	let n = value;
	let out = '';
	while (n > 0) {
		const rem = (n - 1) % 26;
		out = String.fromCharCode(97 + rem) + out;
		n = Math.floor((n - 1) / 26);
	}
	return out;
}

/** Render `value` in the given numeral system. */
export function formatNumeral(value: number, style: NumeralStyle): string {
	switch (style) {
		case 'arabic':
			return String(value);
		case 'roman-lower':
			return toRoman(value).toLowerCase();
		case 'roman-upper':
			return toRoman(value);
		case 'alpha-lower':
			return toAlpha(value);
		case 'alpha-upper':
			return toAlpha(value).toUpperCase();
	}
}

/**
 * One numbering run. `fromPage` is the 1-based page it starts on; `startAt` is
 * the value printed there, so a section restarts (or continues) the counter by
 * choice of `startAt`. Each section counts in its own `style`.
 */
export interface NumberSection {
	fromPage: number;
	style: NumeralStyle;
	startAt: number;
}

/**
 * The formatted label for every page (0-based array of `pageCount`). A page
 * before the first section's `fromPage` gets null — no number is drawn there.
 * Sections are applied in `fromPage` order regardless of input order; the
 * active section for a page is the latest one that has started.
 */
export function resolvePageNumbers(
	sections: NumberSection[],
	pageCount: number,
): (string | null)[] {
	const ordered = [...sections].sort((a, b) => a.fromPage - b.fromPage);
	const labels: (string | null)[] = [];
	for (let page = 1; page <= pageCount; page++) {
		let active: NumberSection | null = null;
		for (const section of ordered) {
			if (section.fromPage <= page) active = section;
			else break;
		}
		if (!active) {
			labels.push(null);
			continue;
		}
		const value = active.startAt + (page - active.fromPage);
		labels.push(formatNumeral(value, active.style));
	}
	return labels;
}
