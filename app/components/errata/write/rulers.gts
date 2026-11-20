import Component from '@glimmer/component';
import { tracked } from '@glimmer/tracking';
import { modifier } from 'ember-modifier';
import { htmlSafe } from '@ember/template';
import { MM_TO_POINTS } from 'delphitools-v2/lib/imposition';
import {
	caretRect,
	currentLayout,
	inner,
} from 'delphitools-v2/lib/errata/write/editor';
import {
	applyPara,
	clampMargins,
	setupAt,
	withSectionSetup,
} from 'delphitools-v2/lib/errata/write/model';
import { writeStore } from 'delphitools-v2/lib/errata/write/store';
import { resolvePara } from 'delphitools-v2/lib/errata/write/styles';
import type {
	PageBox,
	Setup,
	WriteDoc,
} from 'delphitools-v2/lib/errata/write/types';
import { TrackedExternal } from 'delphitools-v2/lib/tracked-external';

const CM = MM_TO_POINTS * 10;
const BAND = 18;
const MIN_TEXT = 36;

const px = (n: number) => `${Math.round(n * 100) / 100}px`;
const clamp = (lo: number, hi: number, n: number) =>
	Math.min(hi, Math.max(lo, n));
const mm = (pt: number) => Math.round((pt / MM_TO_POINTS) * 10) / 10;
const snapMm = (pt: number) => Math.round(pt / MM_TO_POINTS) * MM_TO_POINTS;

type Axis = 'x' | 'y';
type Kind = 'left' | 'right' | 'top' | 'bottom' | 'first' | 'hang' | 'indent';

interface Handle {
	kind: Kind;
	label: string;
	at: number;
	edit: (
		doc: WriteDoc,
		p: number,
		snap: (pt: number) => number,
	) => { doc: WriteDoc; value: number };
}

interface Drag {
	handle: Handle;
	doc: WriteDoc;
	offset: number;
	committed: boolean;
}

function scale(length: number, origin: number, z: number, across: boolean) {
	const d: string[] = [];
	const labels: { x: number; y: number; text: string }[] = [];
	const first = Math.ceil((-origin / CM) * 4);
	const last = Math.floor(((length - origin) / CM) * 4);
	for (let i = first; i <= last; i++) {
		const at = Math.round((origin + (i * CM) / 4) * z) + 0.5;
		if (i % 4 === 0) {
			if (i)
				labels.push({
					x: across ? at : BAND / 2,
					y: across ? BAND / 2 : at,
					text: String(Math.abs(i / 4)),
				});
			continue;
		}
		const len = i % 2 ? 2 : 6;
		const from = (BAND - len) / 2;
		d.push(
			across
				? `M${at} ${from}v${len}`
				: `M${from} ${at}h${len}`,
		);
	}
	return { d: d.join(''), labels };
}

function margin(
	page: PageBox,
	side: keyof Setup['margins'],
	label: string,
	at: number,
	extent: number,
): Handle {
	return {
		kind: side,
		label,
		at,
		edit(doc, p, snap) {
			const setup = setupAt(doc, page.sectionBlock);
			if (!setup) return { doc, value: 0 };
			const next = clampMargins({
				...setup,
				margins: {
					...setup.margins,
					[side]: snap(
						side === 'left' ||
							side === 'top'
							? p
							: extent - p,
					),
				},
			});
			return {
				doc: withSectionSetup(
					doc,
					page.sectionBlock,
					next,
				),
				value: next.margins[side],
			};
		},
	};
}

interface Signature {
	Args: { axis: Axis; page: PageBox; zoom: number };
}

export default class Ruler extends Component<Signature> {
	state = new TrackedExternal(writeStore.subscribe, writeStore.get);
	editing = new TrackedExternal(inner.subscribe, inner.get);
	@tracked tip: { at: number; text: string } | null = null;
	#drag: Drag | null = null;

	willDestroy() {
		super.willDestroy();
		this.state.unsubscribe();
		this.editing.unsubscribe();
	}

	get across() {
		return this.args.axis === 'x';
	}

	get length() {
		const { page } = this.args;
		return this.across ? page.width : page.height;
	}

	get origin() {
		const { content } = this.args.page;
		return this.across ? content.left : content.top;
	}

	get band() {
		const z = this.args.zoom;
		const { page } = this.args;
		const long = px(this.length * z);
		const spans: [number, number][] = this.across
			? page.cols.map((c) => [c.left, c.width])
			: [[page.content.top, page.content.height]];
		return {
			style: htmlSafe(
				this.across
					? `width:${long}`
					: `height:${long}`,
			),
			paper: spans.map(([at, size]) =>
				this.across
					? {
							x: at * z,
							y: 0,
							w: size * z,
							h: BAND,
						}
					: {
							x: 0,
							y: at * z,
							w: BAND,
							h: size * z,
						},
			),
			...scale(this.length, this.origin, z, this.across),
		};
	}

	get paragraph() {
		const s = this.state.current;
		if (!s || this.editing.current) return null;
		const block = s.doc.blocks[s.sel.focus.block];
		if (block?.kind !== 'para') return null;
		const para = resolvePara(block.style, block.props);
		if (para.list) return null;
		const layout = currentLayout(s.doc);
		if (!layout) return null;
		const caret = caretRect(
			layout,
			s.sel.focus,
			s.sel.focusAffinity,
		);
		const cols = layout.pages[caret.page]?.cols ?? [];
		const index = Math.max(
			0,
			cols.findIndex(
				(c) =>
					caret.x >= c.left - 1 &&
					caret.x <= c.left + c.width + 1,
			),
		);
		const col =
			this.args.page.cols[index] ?? this.args.page.cols[0];
		if (!col) return null;
		return {
			col,
			indent: para.indent,
			firstLine: para.firstLine,
			sel: s.sel,
		};
	}

	get handles(): Handle[] {
		const { page } = this.args;
		const { content } = page;
		if (!this.across)
			return [
				margin(
					page,
					'top',
					'Top margin',
					content.top,
					page.height,
				),
				margin(
					page,
					'bottom',
					'Bottom margin',
					content.top + content.height,
					page.height,
				),
			];
		const out = [
			margin(
				page,
				'left',
				'Left margin',
				content.left,
				page.width,
			),
			margin(
				page,
				'right',
				'Right margin',
				content.left + content.width,
				page.width,
			),
		];
		const para = this.paragraph;
		if (!para) return out;
		const { col, indent, firstLine, sel } = para;
		const most = Math.max(0, col.width - MIN_TEXT);
		const indents = (
			doc: WriteDoc,
			next: number,
			first: number,
		) => {
			const value = clamp(0, most, next);
			const line = clamp(-value, most - value, first);
			return {
				doc: applyPara(doc, sel, {
					indent: value,
					firstLine: line,
				}).doc,
				value,
				line,
			};
		};
		out.push(
			{
				kind: 'first',
				label: 'First line',
				at: col.left + indent + firstLine,
				edit: (doc, p, snap) => {
					const r = indents(
						doc,
						indent,
						snap(p - col.left - indent),
					);
					return { doc: r.doc, value: r.line };
				},
			},
			{
				kind: 'hang',
				label: 'Hanging indent',
				at: col.left + indent,
				edit: (doc, p, snap) =>
					indents(
						doc,
						snap(p - col.left),
						indent +
							firstLine -
							snap(p - col.left),
					),
			},
			{
				kind: 'indent',
				label: 'Left indent',
				at: col.left + indent,
				edit: (doc, p, snap) =>
					indents(
						doc,
						snap(p - col.left),
						firstLine,
					),
			},
		);
		return out;
	}

	get marks() {
		const z = this.args.zoom;
		return this.handles.map((h, i) => ({
			i,
			kind: h.kind,
			style: htmlSafe(
				this.across
					? `left:${px(h.at * z)}`
					: `top:${px(h.at * z)}`,
			),
		}));
	}

	get tipStyle() {
		const t = this.tip;
		if (!t) return null;
		return htmlSafe(
			this.across ? `left:${px(t.at)}` : `top:${px(t.at)}`,
		);
	}

	#point(event: PointerEvent, el: HTMLElement) {
		const r = el.getBoundingClientRect();
		const css = this.across
			? event.clientX - r.left
			: event.clientY - r.top;
		const pt = css / this.args.zoom;
		return { css, pt };
	}

	#ruler = (el: Element) => el.closest<HTMLElement>('.err-write-ruler')!;

	grab = (event: PointerEvent) => {
		const target = (event.target as Element).closest<HTMLElement>(
			'[data-ruler-handle]',
		);
		const s = writeStore.get();
		const handle =
			this.handles[Number(target?.dataset['rulerHandle'])];
		if (!target || !s || !handle || event.button !== 0) return;
		event.preventDefault();
		event.stopPropagation();
		target.setPointerCapture(event.pointerId);
		this.#drag = {
			handle,
			doc: s.doc,
			offset:
				this.#point(event, this.#ruler(target)).pt -
				handle.at,
			committed: false,
		};
	};

	move = (event: PointerEvent) => {
		const drag = this.#drag;
		const s = writeStore.get();
		if (!drag || !s) return;
		const el = event.currentTarget as HTMLElement;
		const { css, pt } = this.#point(event, el);
		const { doc, value } = drag.handle.edit(
			drag.doc,
			pt - drag.offset,
			event.altKey ? (n) => n : snapMm,
		);
		if (drag.committed) writeStore.amend({ doc, sel: s.sel });
		else writeStore.commit({ doc, sel: s.sel }, 'other');
		drag.committed = true;
		this.tip = {
			at: css,
			text: `${drag.handle.label} ${mm(value)} mm`,
		};
	};

	drop = () => {
		this.#drag = null;
		this.tip = null;
	};

	drag = modifier((el: HTMLElement) => {
		el.addEventListener('pointerdown', this.grab);
		el.addEventListener('pointermove', this.move);
		el.addEventListener('pointerup', this.drop);
		el.addEventListener('pointercancel', this.drop);
		el.addEventListener('lostpointercapture', this.drop);
		return () => {
			el.removeEventListener('pointerdown', this.grab);
			el.removeEventListener('pointermove', this.move);
			el.removeEventListener('pointerup', this.drop);
			el.removeEventListener('pointercancel', this.drop);
			el.removeEventListener('lostpointercapture', this.drop);
		};
	});

	<template>
		<div
			class="err-write-ruler"
			data-axis={{@axis}}
			style={{this.band.style}}
			{{this.drag}}
		>
			<svg aria-hidden="true">
				{{#each this.band.paper as |r|}}
					<rect
						class="err-write-ruler-paper"
						x={{r.x}}
						y={{r.y}}
						width={{r.w}}
						height={{r.h}}
					/>
				{{/each}}
				<path d={{this.band.d}} />
				{{#each this.band.labels as |l|}}
					<text
						x={{l.x}}
						y={{l.y}}
					>{{l.text}}</text>
				{{/each}}
			</svg>
			{{#each this.marks key="kind" as |m|}}
				<span
					class="err-write-ruler-handle"
					data-ruler-handle={{m.i}}
					data-kind={{m.kind}}
					style={{m.style}}
				></span>
			{{/each}}
			{{#if this.tip}}
				<span
					class="err-write-ruler-tip"
					role="status"
					style={{this.tipStyle}}
				>{{this.tip.text}}</span>
			{{/if}}
		</div>
	</template>
}
