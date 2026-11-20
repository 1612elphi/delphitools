import {
	FIELD_CHAR,
	type Align,
	type Paragraph,
	type Run,
	type Setup,
} from './types';

/** Paragraph id of the page numbers line in a header or footer. */
export const PAGE_NUMBERS_ID = 'page-numbers';

export type NumbersPart = 'header' | 'footer';
export type NumbersFormat = 'n' | 'page-n' | 'n-of' | 'page-n-of';

export interface PageNumbers {
	part: NumbersPart;
	align: Align;
	format: NumbersFormat;
}

const WORDS = {
	en: { page: 'Page', of: 'of' },
	de: { page: 'Seite', of: 'von' },
};

const field = (kind: 'page' | 'pages'): Run => ({
	text: FIELD_CHAR,
	props: { field: kind },
});

function numbersPara(spec: PageNumbers, lang: 'en' | 'de'): Paragraph {
	const w = WORDS[lang];
	const prefix = spec.format.startsWith('page-');
	const total = spec.format.endsWith('-of');
	const runs: Run[] = [];
	if (prefix) runs.push({ text: `${w.page} `, props: {} });
	runs.push(field('page'));
	if (total) runs.push({ text: ` ${w.of} `, props: {} }, field('pages'));
	return {
		kind: 'para',
		id: PAGE_NUMBERS_ID,
		style: 'body',
		props: spec.align === 'left' ? {} : { align: spec.align },
		runs,
		dir: 'ltr',
	};
}

const blank = (p: Paragraph) => p.runs.every((r) => r.text === '');

/** The page numbers line the setup's header or footer holds, if any. */
export function pageNumbersOf(setup: Setup): PageNumbers | null {
	for (const part of ['header', 'footer'] as const) {
		const p = setup[part]?.find((q) => q.id === PAGE_NUMBERS_ID);
		if (!p) continue;
		const fields = p.runs.filter((r) => r.props.field);
		return {
			part,
			align: p.props.align ?? 'left',
			format: `${p.runs[0]?.props.field ? 'n' : 'page-n'}${
				fields.some((r) => r.props.field === 'pages')
					? '-of'
					: ''
			}` as NumbersFormat,
		};
	}
	return null;
}

/** The setup with its page numbers line replaced, or removed for null; other header and footer text stays. */
export function withPageNumbers(
	setup: Setup,
	spec: PageNumbers | null,
	lang: 'en' | 'de' = 'en',
): Setup {
	const next = { ...setup };
	for (const part of ['header', 'footer'] as const) {
		const kept = (setup[part] ?? []).filter(
			(p) => p.id !== PAGE_NUMBERS_ID,
		);
		const content = kept.filter((p) => !blank(p));
		if (spec?.part === part)
			next[part] = [...content, numbersPara(spec, lang)];
		else next[part] = content.length ? kept : undefined;
	}
	return next;
}

export const NUMBERS_FORMATS: NumbersFormat[] = [
	'n',
	'page-n',
	'n-of',
	'page-n-of',
];

/** the format as it reads on page one of nine */
export function formatLabel(format: NumbersFormat, lang: 'en' | 'de'): string {
	const w = WORDS[lang];
	const n = format.startsWith('page-') ? `${w.page} 1` : '1';
	return format.endsWith('-of') ? `${n} ${w.of} 9` : n;
}
