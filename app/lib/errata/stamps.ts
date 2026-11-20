import { StandardFontEmbedder, StandardFonts } from 'pdf-lib';
import { parsePageRanges } from '../pdf-pages';
import { expandNumber, placeText, type Anchor } from '../pdf-stamp';
import {
	ITEXT,
	boxAt,
	pageSize,
	type ErrataDoc,
	type ErrataPage,
	type Stamped,
	type TextObject,
} from './doc-model';
import { store } from './store';

export type PageScope = 'all' | 'current' | 'range';

const { mult: LINE, baseline: BASELINE } = ITEXT;
const MARGIN = 24;

/** page indices the scope covers; null when the range does not parse */
export function scopePages(
	scope: PageScope,
	range: string,
	count: number,
	current: number,
): number[] | null {
	if (scope === 'all') return [...Array(count).keys()];
	// count may shrink
	if (scope === 'current') return current < count ? [current] : [];
	try {
		const pages = new Set(parsePageRanges(range, count).flat());
		return [...pages].sort((a, b) => a - b);
	} catch {
		return null;
	}
}

const embedders = new Map<boolean, StandardFontEmbedder>();

// export uses helvetica widths
export function textWidth(text: string, size: number, bold = false): number {
	let font = embedders.get(bold);
	if (!font) {
		font = StandardFontEmbedder.for(
			// same strings, cast safe
			(bold
				? StandardFonts.HelveticaBold
				: StandardFonts.Helvetica) as unknown as Parameters<
				typeof StandardFontEmbedder.for
			>[0],
		);
		embedders.set(bold, font);
	}
	let width = 0;
	for (const ch of text) {
		try {
			width += font.widthOfTextAtSize(ch, size);
		} catch {
			width += font.widthOfTextAtSize('?', size);
		}
	}
	return width;
}

export function textObject(
	text: string,
	size: number,
	colour: string,
	cx: number,
	cy: number,
	extra: Partial<TextObject> = {},
	w = textWidth(text, size),
): TextObject {
	const h = size * LINE;
	return {
		...boxAt({ x: cx - w / 2, y: cy - h / 2, width: w, height: h }),
		kind: 'text',
		text,
		fontSize: size,
		colour,
		...extra,
	};
}

// pdf y-up to canvas
function anchored(
	page: ErrataPage,
	text: string,
	size: number,
	anchor: Anchor,
	colour: string,
	bold = false,
): TextObject {
	const { width, height } = pageSize(page);
	const w = textWidth(text, size, bold);
	const { x, y } = placeText(width, height, w, size, anchor, MARGIN);
	const top = height - y - size * LINE * BASELINE;
	return textObject(
		text,
		size,
		colour,
		x + w / 2,
		top + (size * LINE) / 2,
		bold ? { bold } : {},
		w,
	);
}

export function pageNumberObjects(
	doc: ErrataDoc,
	indices: number[],
	format: string,
	anchor: Anchor,
	size: number,
): Stamped[] {
	const total = String(doc.pages.length);
	return indices.flatMap((index) => {
		const text = expandNumber(format, String(index + 1), total);
		if (text.trim() === '') return [];
		return [
			{
				index,
				object: anchored(
					doc.pages[index]!,
					text,
					size,
					anchor,
					'#000000',
				),
			},
		];
	});
}

/** centred, sized so the rotated line spans 80% of the page either way */
export function watermarkObjects(
	doc: ErrataDoc,
	indices: number[],
	text: string,
	opacity: number,
	angle: number,
): Stamped[] {
	if (text.trim() === '') return [];
	const t = (Math.abs(angle) * Math.PI) / 180;
	const cos = Math.cos(t);
	const sin = Math.sin(t);
	const w1 = textWidth(text, 1);
	return indices.map((index) => {
		const { width, height } = pageSize(doc.pages[index]!);
		const size = Math.min(
			(0.8 * width) / (w1 * cos + LINE * sin),
			(0.8 * height) / (w1 * sin + LINE * cos),
		);
		return {
			index,
			object: textObject(
				text,
				size,
				'#000000',
				width / 2,
				height / 2,
				{ angle, opacity },
			),
		};
	});
}

export const STAMP_RED = '#d1242f';

export function stampObjects(
	doc: ErrataDoc,
	indices: number[],
	label: string,
	anchor: Anchor,
	size: number,
	colour = STAMP_RED,
	bold = false,
): Stamped[] {
	if (label.trim() === '') return [];
	return indices.map((index) => ({
		index,
		object: anchored(
			doc.pages[index]!,
			label,
			size,
			anchor,
			colour,
			bold,
		),
	}));
}

/** one undo step for the lot */
export function addStamped(items: Stamped[]): void {
	if (items.length === 0) return;
	const byPage = Map.groupBy(items, (s) => s.index);
	store.update((doc) => ({
		...doc,
		pages: doc.pages.map((page, i) => {
			const add = byPage.get(i)?.map((s) => s.object);
			return add
				? {
						...page,
						objects: [
							...page.objects,
							...add,
						],
					}
				: page;
		}),
	}));
}
