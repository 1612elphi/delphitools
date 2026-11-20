import Component from '@glimmer/component';
import { cached } from '@glimmer/tracking';
import { fn } from '@ember/helper';
import { on } from '@ember/modifier';
import { modifier } from 'ember-modifier';
import CanonEmptyRow from 'delphicanon/components/canon-empty-row';
import CanonSegmented from 'delphicanon/components/canon-segmented';
import { Cell } from 'delphitools-v2/components/substrata/editor/cells';

import { marksReady, paintMarks } from 'delphitools-v2/lib/errata/write/markup';
import { paintPage } from 'delphitools-v2/lib/errata/write/paint';
import {
	currentLayout,
	editLayout,
	editState,
	fontsLoaded,
	inner,
	selectRange,
} from 'delphitools-v2/lib/errata/write/editor';
import { lineAt } from 'delphitools-v2/lib/errata/write/geometry';
import {
	blockLength,
	caret,
	outlineOf,
	paraText,
	parasOf,
	sectionIndex,
	wordSegmenter,
	type OutlineEntry,
} from 'delphitools-v2/lib/errata/write/model';
import { focusEditor, railTab } from 'delphitools-v2/lib/errata/write/view';
import { writeStore } from 'delphitools-v2/lib/errata/write/store';
import type {
	PageBox,
	Paragraph,
	WriteDoc,
} from 'delphitools-v2/lib/errata/write/types';
import { TrackedExternal } from 'delphitools-v2/lib/tracked-external';

interface Count {
	words: number;
	chars: number;
	solid: number;
	paras: number;
	sentences: number;
}

const sentenceSegmenter = new Intl.Segmenter(undefined, {
	granularity: 'sentence',
});
const counts = new WeakMap<Paragraph, Count>();

function paraCount(p: Paragraph): Count {
	let c = counts.get(p);
	if (!c) {
		const text = paraText(p);
		let words = 0;
		for (const s of wordSegmenter.segment(text))
			if (s.isWordLike) words++;
		let sentences = 0;
		for (const s of sentenceSegmenter.segment(text))
			if (s.segment.trim()) sentences++;
		c = {
			words,
			chars: [...text.replace(/\uFFFC/gu, '')].length,
			solid: [...text.replace(/[\s\uFFFC]/gu, '')].length,
			paras: text.trim() ? 1 : 0,
			sentences,
		};
		counts.set(p, c);
	}
	return c;
}

const WPM = 238;
const figure = new Intl.NumberFormat();

const ROWS: [keyof Count, string][] = [
	['words', 'Words'],
	['chars', 'Characters'],
	['solid', 'No spaces'],
	['paras', 'Paragraphs'],
	['sentences', 'Sentences'],
];
type Row = { key: string; label: string; value: string };
const totals = new WeakMap<WriteDoc['blocks'], Row[]>();

function countOf(doc: WriteDoc): Row[] {
	let rows = totals.get(doc.blocks);
	if (rows) return rows;
	const sum: Count = {
		words: 0,
		chars: 0,
		solid: 0,
		paras: 0,
		sentences: 0,
	};
	for (const p of parasOf(doc.blocks)) {
		const c = paraCount(p);
		for (const [k] of ROWS) sum[k] += c[k];
	}
	const min = Math.round(sum.words / WPM);
	rows = [
		...ROWS.map(([key, label]) => ({
			key,
			label,
			value: figure.format(sum[key]),
		})),
		{
			key: 'time',
			label: 'Reading time',
			value:
				min < 1
					? '< 1 min'
					: min < 60
						? `${min} min`
						: `${Math.floor(min / 60)} h ${min % 60} min`,
		},
	];
	totals.set(doc.blocks, rows);
	return rows;
}

const inc = (n: number) => n + 1;

const THUMB = 112;
const thumbs = new WeakMap<HTMLCanvasElement, [PageBox, unknown, number]>();

const thumb = modifier(
	(
		canvas: HTMLCanvasElement,
		[page, doc, marked]: [PageBox, WriteDoc | undefined, number],
	) => {
		canvas.style.aspectRatio = `${page.width} / ${page.height}`;
		const marks = doc?.overlays?.[page.index];
		const was = thumbs.get(canvas);
		if (
			!doc ||
			(was?.[0] === page &&
				was[1] === marks &&
				was[2] === marked)
		)
			return;
		const paint = () => {
			thumbs.set(canvas, [page, marks, marked]);
			const k = (THUMB * devicePixelRatio) / page.width;
			canvas.width = Math.round(page.width * k);
			canvas.height = Math.round(page.height * k);
			const ctx = canvas.getContext('2d');
			if (!ctx) return;
			ctx.setTransform(k, 0, 0, k, 0, 0);
			paintPage(ctx, page, {
				scale: k,
				invisibles: false,
				ink: '#000',
				paraEnd: (i) => blockLength(doc.blocks[i]),
				images: doc.images,
			});
			if (marks) paintMarks(ctx, marks);
		};
		const seen = new IntersectionObserver(
			(entries) => {
				if (!entries.some((e) => e.isIntersecting))
					return;
				seen.disconnect();
				paint();
			},
			{ rootMargin: '400px' },
		);
		seen.observe(canvas);
		return () => seen.disconnect();
	},
);

const TABS = ['Pages', 'Outline'];

export default class WriteRail extends Component<{
	Args: { onClose: () => void };
	Element: HTMLElement;
}> {
	state = new TrackedExternal(writeStore.subscribe, writeStore.get);
	tab = new TrackedExternal(railTab.subscribe, railTab.get);
	editing = new TrackedExternal(inner.subscribe, inner.get);
	fonts = new TrackedExternal(fontsLoaded.subscribe, fontsLoaded.get);
	marked = new TrackedExternal(marksReady.subscribe, marksReady.get);

	willDestroy() {
		super.willDestroy();
		this.state.unsubscribe();
		this.tab.unsubscribe();
		this.editing.unsubscribe();
		this.fonts.unsubscribe();
		this.marked.unsubscribe();
	}

	get tabIndex() {
		return this.tab.current === 'outline' ? 1 : 0;
	}

	get outlined() {
		return this.tab.current === 'outline';
	}

	pickTab = (index: number) =>
		railTab.set(index === 1 ? 'outline' : 'pages');

	get outline(): OutlineEntry[] {
		const s = this.state.current;
		return s ? outlineOf(s.doc) : [];
	}

	@cached
	get currentEntry(): OutlineEntry | undefined {
		const s = this.state.current;
		return s
			? this.outline.findLast(
					(e) => e.block <= s.sel.focus.block,
				)
			: undefined;
	}

	isCurrent = (e: OutlineEntry) => e === this.currentEntry;

	goTo = (block: number) => {
		selectRange(caret({ block, offset: 0 }));
		focusEditor();
		const page = this.pages.find((p) =>
			p.lines.some((l) => l.block === block),
		);
		if (page) this.jump(page.index);
		let tries = 10;
		const top = () => {
			const el = document.querySelector('.err-write-caret');
			if (el) el.scrollIntoView({ block: 'start' });
			else if (tries--) requestAnimationFrame(top);
		};
		requestAnimationFrame(top);
	};

	@cached
	get status() {
		void this.fonts.current;
		const s = this.state.current;
		const layout = s ? currentLayout(s.doc) : null;
		if (!s || !layout) return null;
		const inCell =
			this.editing.current?.kind === 'cell'
				? editState()
				: null;
		const lines = inCell ? editLayout(layout) : layout;
		const { focus, focusAffinity } = (inCell ?? s).sel;
		const at = lineAt(lines, focus, focusAffinity);
		const page = at?.page ?? 0;
		const ln = at
			? inCell
				? lines.pages
						.flatMap((p) => p.lines)
						.indexOf(at.line)
				: layout.pages[page]!.lines.indexOf(at.line)
			: 0;
		return {
			page,
			total: layout.pages.length,
			ln: ln + 1,
			col: at ? focus.offset - at.line.start + 1 : 1,
			count: countOf(s.doc),
			section: sectionIndex(s.doc, s.sel.focus.block),
		};
	}

	jump = (index: number) => {
		document.querySelectorAll('.err-write-page')[
			index
		]?.scrollIntoView({ block: 'start' });
	};

	isPage = (index: number) => this.status?.page === index;

	get doc() {
		return this.state.current?.doc;
	}

	get pages(): readonly PageBox[] {
		void this.fonts.current;
		const doc = this.doc;
		return (doc && currentLayout(doc)?.pages) ?? [];
	}

	<template>
		<section
			class="err-pages err-write-rail"
			aria-label="Pages"
			...attributes
		>
			<div class="sub-panel-header err-write-head">
				<CanonSegmented
					class="err-write-tabs"
					@items={{TABS}}
					@selected={{this.tabIndex}}
					@onChange={{this.pickTab}}
					aria-label="Rail"
				/>
				<Cell
					@label="Close"
					@icon="x"
					@onClick={{@onClose}}
				/>
			</div>
			{{#if this.outlined}}
				<ul class="err-write-outline">
					{{#each this.outline as |e|}}
						<li>
							<button
								type="button"
								class={{if
									(this.isCurrent
										e
									)
									"is-on"
								}}
								data-level={{e.level}}
								data-outline={{e.block}}
								{{on
									"click"
									(fn
										this.goTo
										e.block
									)
								}}
							>{{e.text}}</button>
						</li>
					{{else}}
						<li>
							<CanonEmptyRow
								@text="No headings"
							/>
						</li>
					{{/each}}
				</ul>
			{{/if}}
			{{#if this.status}}
				<div
					class="err-pages-list"
					hidden={{this.outlined}}
				>
					{{#each this.pages as |p|}}
						<div
							class="err-page-cell
								{{if
									(this.isPage
										p.index
									)
									'is-current'
								}}"
						>
							<button
								type="button"
								class="err-page-pick"
								aria-label="Page {{inc
									p.index
								}}"
								{{on
									"click"
									(fn
										this.jump
										p.index
									)
								}}
							>
								<canvas
									class="err-page-thumb"
									{{thumb
										p
										this.doc
										this.marked.current
									}}
								></canvas>
								<span
									class="err-page-num"
								>{{inc
										p.index
									}}</span>
							</button>
						</div>
					{{/each}}
				</div>
				<dl class="err-write-status" data-write-status>
					<div>
						<dt>Page</dt>
						<dd>{{inc this.status.page}}
							/
							{{this.status.total}}</dd>
					</div>
					<div>
						<dt>Section</dt>
						<dd data-status="sec">{{inc
								this.status.section
							}}</dd>
					</div>
					<div>
						<dt>Line</dt>
						<dd
							data-status="ln"
						>{{this.status.ln}}</dd>
					</div>
					<div>
						<dt>Column</dt>
						<dd
							data-status="col"
						>{{this.status.col}}</dd>
					</div>
				</dl>
				<dl class="err-write-count" data-write-count>
					{{#each
						this.status.count key="key"
						as |c|
					}}
						<div>
							<dt>{{c.label}}</dt>
							<dd
								data-status={{c.key}}
							>{{c.value}}</dd>
						</div>
					{{/each}}
				</dl>
			{{/if}}
		</section>
	</template>
}
