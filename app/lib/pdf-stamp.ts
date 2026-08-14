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
 * Expand a page-number template: `{n}` = this page (after the start offset),
 * `{N}` = total pages. Unknown tokens are left as written. A bare template with
 * no token still renders (it becomes a fixed stamp on every page).
 */
export function expandNumber(
	template: string,
	pageNumber: number,
	total: number,
): string {
	return template
		.replace(/\{n\}/g, String(pageNumber))
		.replace(/\{N\}/g, String(total));
}

/**
 * The 1-based label to print on the `index`-th page (0-based) given a start
 * number and whether the first page is skipped. Returns null for a skipped
 * page, so the caller draws nothing there.
 */
export function pageLabelNumber(
	index: number,
	startAt: number,
	skipFirst: boolean,
): number | null {
	if (skipFirst && index === 0) return null;
	return startAt + index - (skipFirst ? 1 : 0);
}
