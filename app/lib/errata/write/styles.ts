import type {
	CharProps,
	ParaProps,
	ResolvedChar,
	ResolvedPara,
	Style,
	StyleId,
} from './types';

const BASE_CHAR: ResolvedChar = {
	font: 'source-serif-4',
	size: 11,
	bold: false,
	italic: false,
	underline: false,
	strike: false,
	colour: '#000000',
};

const BASE_PARA: ResolvedPara = {
	align: 'left',
	lineSpacing: 1,
	spaceBefore: 0,
	spaceAfter: 6,
	indent: 0,
	firstLine: 0,
	widow: true,
};

function style(
	id: StyleId,
	next: StyleId,
	char: Partial<ResolvedChar>,
	para: Partial<ResolvedPara>,
): Style {
	return {
		id,
		next,
		char: { ...BASE_CHAR, ...char },
		para: { ...BASE_PARA, ...para },
	};
}

export const STYLES: Record<StyleId, Style> = {
	title: style(
		'title',
		'body',
		{ size: 26, bold: true },
		{ spaceAfter: 12, keepNext: true },
	),
	h1: style(
		'h1',
		'body',
		{ size: 20, bold: true },
		{ spaceBefore: 18, keepNext: true },
	),
	h2: style(
		'h2',
		'body',
		{ size: 15, bold: true },
		{ spaceBefore: 12, keepNext: true },
	),
	h3: style(
		'h3',
		'body',
		{ size: 12, bold: true, italic: true },
		{ spaceBefore: 10, spaceAfter: 4, keepNext: true },
	),
	body: style('body', 'body', {}, {}),
	quote: style(
		'quote',
		'quote',
		{ italic: true },
		{ indent: 24, spaceBefore: 6, spaceAfter: 6 },
	),
	caption: style('caption', 'caption', { size: 9, italic: true }, {}),
	note: style('note', 'note', { size: 9 }, { spaceAfter: 2 }),
};

/** Run overrides over the paragraph style; the model never stores undefined values. */
export function resolveChar(id: StyleId, props: CharProps): ResolvedChar {
	return { ...STYLES[id].char, ...props };
}

export function resolvePara(id: StyleId, props: ParaProps): ResolvedPara {
	return { ...STYLES[id].para, ...props };
}
