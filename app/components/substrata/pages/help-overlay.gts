import Component from '@glimmer/component';
import { tracked } from '@glimmer/tracking';
import { on } from '@ember/modifier';
import { htmlSafe } from '@ember/template';
import { modifier } from 'ember-modifier';
import { editorUi } from 'delphitools-v2/lib/substrata/editor-ui';
import {
	arrowPath,
	pages,
	place,
	spot,
	type Measure,
	type Rect,
	type Side,
	type Target,
} from './help-layout';
import './pages.css';

const NOTES: Record<string, string> = {
	Help: 'Hide this button in General Settings',
	Settings: 'Project, canvas and Substrata settings',
	Undo: 'Steps back through the undo chain by one',
	Redo: 'Steps forward through the undo chain by one',
	Share: 'Export as image or share directly',
	Tools: 'Opens the tool selector',
	Layers: 'See all layers, reorganise them and set their blend modes',
	Inspector: 'Position, size and look of the currently selected object',
	FX: 'Real-time filters and effects on the selected layer',
	'Tool Settings': 'Settings for the currently active tool',
	Move: 'Select, move, scale or rotate the selected object',
	Crop: 'Crop the canvas or the selected object',
	Image: 'Add a photo or a file as a layer',
	Text: 'Tap the canvas to add editable text',
	Shape: 'Drag on the canvas to draw a shape object',
	Select: 'Pick pixels to move, copy or clear',
	Draw: 'Freehand brush and pencil strokes as a layer',
	Colour: 'Pick the colour for new text, shapes and strokes',
};

const HINT = 'Tap anywhere to close...';
const NEXT = 'Tap for the rest...';
const PAD = 16;
const GAP = 8;

interface Found {
	el: HTMLElement;
	title: string;
	side: Side;
}

interface Shown {
	title: string;
	text: string;
	style: ReturnType<typeof htmlSafe>;
	trailing: boolean;
	index: number;
}

const box = (r: DOMRect, root: DOMRect): Rect => ({
	x: r.left - root.left,
	y: r.top - root.top,
	w: r.width,
	h: r.height,
});

function findTargets(root: HTMLElement): Found[] {
	const own = root.getBoundingClientRect();
	const found: Found[] = [];
	const add = (el: Element | null, title: string, side: Side) => {
		if (el instanceof HTMLElement && el.offsetWidth)
			found.push({ el, title, side });
	};
	const across = (el: Element) => {
		const r = el.getBoundingClientRect();
		return r.left + r.width / 2 > own.left + own.width / 2
			? 'right'
			: 'left';
	};
	add(root.querySelector('.sub-ed-help .sub-cell'), 'Help', 'top');
	for (const cell of root.querySelectorAll<HTMLElement>(
		'.sub-ed-column .sub-cell, .sub-ed-phone-stack .sub-cell, .sub-ed-row .sub-cell',
	)) {
		const label =
			cell.getAttribute('title') ??
			cell.getAttribute('aria-label') ??
			'';
		if (/^(Hide|Show) Tools$/.test(label)) continue;
		const title = label === 'Menu' ? 'Settings' : label;
		const toolKey =
			(cell.closest('.sub-ed-tools') &&
				cell.hasAttribute('aria-expanded')) ||
			cell.matches(
				'.sub-ed-row > .sub-cells:first-child > .sub-cell',
			);
		if (cell.closest('.sub-ed-bloom')) continue;
		const name = toolKey ? 'Tools' : title;
		if (!NOTES[name]) continue;
		const side: Side = cell.closest('.sub-ed-phone-stack')
			? 'top'
			: cell.closest('.sub-ed-row')
				? 'bottom'
				: across(cell);
		add(cell, name, side);
	}
	const bar = root.querySelector('.sub-ed-bar');
	if (bar instanceof HTMLElement && bar.offsetWidth) {
		const r = bar.getBoundingClientRect();
		const vertical = r.height > r.width;
		const side: Side = vertical
			? across(bar)
			: r.top + r.height / 2 < own.top + own.height / 2
				? 'top'
				: 'bottom';
		add(bar, 'Tool Settings', side);
	}
	return found;
}

export default class HelpOverlay extends Component<{
	Args: { phone: boolean };
}> {
	@tracked found: Found[] = [];
	@tracked page = 0;
	@tracked shown: Shown[] = [];
	@tracked arrows: string[] = [];
	@tracked dim = '';
	@tracked hint = HINT;
	@tracked hintStyle = htmlSafe('');
	#pages: number[][] = [];

	get open() {
		return editorUi.helpOpen;
	}

	close = () => {
		editorUi.helpOpen = false;
		this.page = 0;
		this.shown = [];
		this.found = [];
	};

	advance = () => {
		if (this.page < this.#pages.length - 1) this.page += 1;
		else this.close();
	};

	key = (e: KeyboardEvent) => {
		if (e.key === 'Escape') this.close();
		else if (e.key === 'Enter' || e.key === ' ') {
			e.preventDefault();
			this.advance();
		}
	};

	watch = modifier((layer: HTMLElement) => {
		const root = layer.parentElement;
		if (!root) return;
		layer.focus();
		let frame = 0;
		const find = () => {
			cancelAnimationFrame(frame);
			frame = requestAnimationFrame(() => {
				this.found = findTargets(root);
			});
		};
		const ro = new ResizeObserver(find);
		ro.observe(root);
		return () => {
			ro.disconnect();
			cancelAnimationFrame(frame);
		};
	});

	layout = modifier(
		(sizer: HTMLElement, [found, page]: [Found[], number]) => {
			const layer = sizer.parentElement!;
			const own = layer.getBoundingClientRect();
			if (!found.length || !own.width) return;
			const notes = [...sizer.children] as HTMLElement[];
			const measure: Measure = (i, w) => {
				const note = notes[i]!;
				note.style.maxInlineSize = `${Math.max(0, w)}px`;
				const r = note.getBoundingClientRect();
				return {
					w: Math.ceil(r.width) + 1,
					h: Math.ceil(r.height),
				};
			};
			const holes = found.map((f) =>
				box(f.el.getBoundingClientRect(), own),
			);
			const targets: Target[] = found.map((f, i) => ({
				frame: holes[i]!,
				side: f.side,
			}));
			const area: Rect = {
				x: PAD,
				y: GAP,
				w: own.width - 2 * PAD,
				h: own.height - 2 * GAP,
			};
			this.#pages = pages(targets, area, holes, measure);
			const at = Math.min(page, this.#pages.length - 1);
			const members = this.#pages[at] ?? [];
			const placed =
				place(
					members.map((i) => targets[i]!),
					area,
					holes,
					(k, w) => measure(members[k]!, w),
				) ?? [];
			const shown = placed.map((p, k) => {
				const f = found[members[k]!]!;
				return {
					title: f.title,
					text: NOTES[f.title] ?? '',
					trailing: p.trailing,
					index: k,
					style: htmlSafe(
						`inset-inline-start: ${p.note.x}px; inset-block-start: ${p.note.y}px; inline-size: ${p.note.w}px; --sub-help-i: ${k}`,
					),
				};
			});
			const hint = at < this.#pages.length - 1 ? NEXT : HINT;
			const centre = spot(
				{ w: Math.min(360, area.w), h: 40 },
				area,
				[
					...placed.map((p) => ({
						x: p.note.x - 12,
						y: p.note.y - 12,
						w: p.note.w + 24,
						h: p.note.h + 24,
					})),
					...holes,
				],
			);
			const cut = holes
				.map(
					(h) =>
						`M${h.x} ${h.y}h${h.w}v${h.h}h${-h.w}z`,
				)
				.join('');
			requestAnimationFrame(() => {
				this.shown = shown;
				this.arrows = placed.map((p, k) =>
					arrowPath(
						p.points,
						k % 2 ? -0.22 : 0.22,
					),
				);
				this.dim = `M0 0H${own.width}V${own.height}H0z${cut}`;
				this.hint = hint;
				this.hintStyle = htmlSafe(
					`inset-inline-start: ${centre.x}px; inset-block-start: ${centre.y}px; inline-size: ${centre.w}px`,
				);
			});
		},
	);

	<template>
		{{#if this.open}}
			{{! template-lint-disable no-invalid-interactive }}
			<div
				class="sub-help"
				role="dialog"
				aria-modal="true"
				aria-label="Help"
				tabindex="-1"
				{{this.watch}}
				{{on "click" this.advance}}
				{{on "keydown" this.key}}
			>
				<svg class="sub-help-dim" aria-hidden="true">
					<path
						d={{this.dim}}
						fill-rule="evenodd"
					/>
				</svg>
				<svg class="sub-help-arrows" aria-hidden="true">
					{{#each this.arrows as |d i|}}
						<path
							d={{d}}
							style={{arrowDelay i}}
						/>
					{{/each}}
				</svg>
				<div
					class="sub-help-sizer"
					aria-hidden="true"
					{{this.layout this.found this.page}}
				>
					{{#each this.found as |f|}}
						<div class="sub-help-note">
							<strong
							>{{f.title}}</strong>
							<span>{{noteText
									f.title
								}}</span>
						</div>
					{{/each}}
				</div>
				<ul class="sub-help-notes">
					{{#each this.shown as |n|}}
						<li
							class="sub-help-note
								{{if
									n.trailing
									'is-trailing'
								}}"
							style={{n.style}}
						>
							<strong
							>{{n.title}}</strong>
							<span>{{n.text}}</span>
						</li>
					{{/each}}
				</ul>
				<p
					class="sub-help-hint"
					style={{this.hintStyle}}
				>{{this.hint}}</p>
			</div>
		{{/if}}
	</template>
}

function noteText(title: string): string {
	return NOTES[title] ?? '';
}

function arrowDelay(index: number) {
	return htmlSafe(`--sub-help-i: ${index}`);
}
