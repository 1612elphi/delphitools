import { ensureFonts, mupdfFont } from 'delphitools-v2/lib/errata/write/fonts';
import type {
	Layout,
	Line,
	PageBox,
	Paragraph,
	StyleId,
	WriteDoc,
} from 'delphitools-v2/lib/errata/write/types';

export const FILE = 'cmu-serif-400-normal.otf';

const CHAR = {
	font: 'cmu-serif',
	size: 12,
	bold: false,
	italic: false,
	underline: false,
	strike: false,
	colour: '#000000',
} as const;

export function para(id: string, text: string, style: StyleId = 'body') {
	return {
		kind: 'para',
		id,
		style,
		props: {},
		runs: [{ text, props: {} }],
		dir: 'ltr',
	} satisfies Paragraph;
}

export function line(block: number, text: string, top: number): Line {
	const font = mupdfFont(FILE);
	const xs = [72];
	for (const ch of text)
		for (let k = 0; k < ch.length; k++)
			xs.push(
				xs.at(-1)! +
					(k
						? 0
						: font.advanceGlyph(
								font.encodeCharacter(
									ch,
								),
							) * 12),
			);
	return {
		block,
		start: 0,
		end: text.length,
		top,
		baseline: top + 10,
		height: 14,
		left: 72,
		width: 451,
		spans: [
			{
				text,
				start: 0,
				xs,
				file: FILE,
				size: 12,
				rise: 0,
				char: {
					...CHAR,
					underline: true,
					highlight: '#ffff00',
				},
			},
		],
	};
}

/** two pages of different size; page 1 has a title and an h1 */
export async function sample(): Promise<{ doc: WriteDoc; layout: Layout }> {
	await ensureFonts([FILE]);
	const doc: WriteDoc = {
		version: 1,
		name: 'Sample',
		setup: {
			width: 595,
			height: 842,
			margins: { top: 72, right: 72, bottom: 72, left: 72 },
		},
		blocks: [
			para('a', 'Heading', 'title'),
			para('b', 'First line a😀b'),
			{ kind: 'break', id: 'c' },
			para('d', 'Chapter', 'h1'),
			para('e', 'Second page', 'h2'),
		],
	};
	const layout: Layout = {
		pages: [
			{
				index: 0,
				width: 595,
				height: 842,
				lines: [
					line(0, 'Heading', 72),
					line(1, 'First line a😀b', 100),
					{
						kind: 'break',
						block: 2,
						start: 0,
						end: 0,
						top: 114,
						baseline: 124,
						height: 14,
						left: 72,
						width: 451,
						spans: [],
					},
				],
				content: {
					left: 72,
					top: 72,
					width: 451,
					height: 698,
				},
				...pageExtras(451),
			},
			{
				index: 1,
				width: 300,
				height: 400,
				lines: [
					line(3, 'Chapter', 72),
					line(4, 'Second page', 100),
				],
				content: {
					left: 72,
					top: 72,
					width: 156,
					height: 256,
				},
				...pageExtras(156),
			},
		],
	};
	return { doc, layout };
}

/** PageBox fields a single-column page without header or footer has. */
export function pageExtras(
	width: number,
): Omit<PageBox, 'index' | 'width' | 'height' | 'lines' | 'content'> {
	return {
		section: 0,
		sectionBlock: -1,
		cols: [{ left: 72, width }],
		boxes: [],
		cells: [],
		floats: [],
		header: [],
		footer: [],
		notes: [],
		toc: [],
		headerPart: 'header',
		footerPart: 'footer',
		label: '1',
	};
}
