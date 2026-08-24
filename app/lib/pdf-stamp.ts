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

	// top baseline clears margin
	let y: number;
	if (v === 'top') y = pageH - margin - fontSize;
	else if (v === 'bottom') y = margin;
	else y = (pageH - fontSize) / 2;

	return { x, y };
}

export function expandNumber(template: string, n: string, N: string): string {
	return template.replace(/\{n\}/g, n).replace(/\{N\}/g, N);
}

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

export interface NumberSection {
	fromPage: number;
	style: NumeralStyle;
	startAt: number;
}

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
