import Component from '@glimmer/component';
import { tracked } from '@glimmer/tracking';
import { fn } from '@ember/helper';
import { on } from '@ember/modifier';
import { htmlSafe } from '@ember/template';
import drag, { type Drag } from './fx-drag';
import { histogramPath } from './fx-maths';

export interface TonesHandle {
	key: string;
	label: string;
	track: 0 | 1;
	position: number;
	fill: 'black' | 'grey' | 'white';
	text: string;
}

interface Signature {
	Args: {
		bins: number[] | null;
		handles: TonesHandle[];
		split: number | null;
		barTrack: 0 | 1;
		shadeBelow?: number;
		shadeAbove?: number;
		onDrag: (key: string, travel: number) => void;
		onEnd: () => void;
		onStep: (key: string, direction: 1 | -1) => void;
		onReset: (key: string) => void;
	};
}

const INSET = 22;
const TOP = 12;
const PLOT = 80;
const BAR = 12;
const SIZE = 44;
const TIP = 10;

const at = (level: number) =>
	`calc(${INSET}px + (100% - ${2 * INSET}px) * ${Math.min(255, Math.max(0, level)) / 255})`;

export default class FxTonesGraph extends Component<Signature> {
	@tracked shades = false;
	#fade?: number;
	#key?: string;
	#startX = 0;

	line(track: number) {
		const plotBottom = TOP + PLOT;
		if (track < this.args.barTrack) return plotBottom;
		return plotBottom + (this.args.barTrack === 0 ? 0 : 14) + BAR;
	}

	get height() {
		const deepest = Math.max(
			0,
			...this.args.handles.map((h) => h.track),
		);
		return this.line(deepest) - TIP + SIZE;
	}

	get style() {
		return htmlSafe(`block-size: ${this.height}px`);
	}

	get path() {
		return this.args.bins
			? histogramPath(this.args.bins, 256, PLOT)
			: null;
	}

	get barStyle() {
		const top = this.line(this.args.barTrack) - BAR;
		const split = this.args.split;
		const paint =
			split === null
				? 'linear-gradient(to right, #000, #fff)'
				: `linear-gradient(to right, #000 ${(split / 255) * 100}%, #fff ${(split / 255) * 100}%)`;
		return htmlSafe(
			`inset-block-start: ${top}px; --sub-tones-bar: ${paint}`,
		);
	}

	get belowStyle() {
		return htmlSafe(
			`inline-size: calc(${at(this.args.shadeBelow ?? 0)} - ${INSET}px)`,
		);
	}

	get aboveStyle() {
		return htmlSafe(
			`inset-inline-start: ${at(this.args.shadeAbove ?? 255)}`,
		);
	}

	handleStyle = (h: TonesHandle) =>
		htmlSafe(
			`inset-inline-start: calc(${at(h.position)} - ${SIZE / 2}px); inset-block-start: ${this.line(h.track) - TIP}px`,
		);

	showShades() {
		this.shades = true;
		window.clearTimeout(this.#fade);
		this.#fade = window.setTimeout(() => {
			if (!this.#key) this.shades = false;
		}, 1000);
	}

	nearest(event: PointerEvent): string | undefined {
		const graph = event.currentTarget as HTMLElement;
		let best: { key: string; d: number } | undefined;
		for (const el of graph.querySelectorAll<HTMLElement>(
			'.sub-fxp-tones-handle',
		)) {
			const box = el.getBoundingClientRect();
			if (
				event.clientX < box.left ||
				event.clientX > box.right ||
				event.clientY < box.top ||
				event.clientY > box.bottom
			)
				continue;
			const d = Math.hypot(
				box.left + box.width / 2 - event.clientX,
				box.top + TIP + 6 - event.clientY,
			);
			if (!best || d < best.d)
				best = { key: el.dataset['key']!, d };
		}
		return best?.key;
	}

	dragSpec: Drag = {
		axis: 'any',
		start: (event) => {
			this.#key = this.nearest(event);
			this.#startX = event.clientX;
		},
		move: (event) => {
			const key = this.#key;
			if (!key) return;
			const graph = event.currentTarget as HTMLElement;
			const width = Math.max(
				1,
				graph.clientWidth - 2 * INSET,
			);
			this.args.onDrag(
				key,
				((event.clientX - this.#startX) / width) * 255,
			);
			this.showShades();
		},
		end: (dragged) => {
			const key = this.#key;
			this.#key = undefined;
			if (key && dragged) this.args.onEnd();
			this.showShades();
		},
	};

	key = (k: string, event: KeyboardEvent) => {
		const dir = {
			ArrowRight: 1,
			ArrowUp: 1,
			ArrowLeft: -1,
			ArrowDown: -1,
		}[event.key] as 1 | -1 | undefined;
		if (!dir) return;
		event.preventDefault();
		this.args.onStep(k, dir);
		this.showShades();
	};

	willDestroy() {
		super.willDestroy();
		window.clearTimeout(this.#fade);
	}

	<template>
		<div
			class="sub-fxp-tones {{if this.shades 'is-shaded'}}"
			style={{this.style}}
			{{drag this.dragSpec}}
		>
			<svg
				class="sub-fxp-tones-plot"
				viewBox="0 0 256 80"
				preserveAspectRatio="none"
				aria-hidden="true"
			>
				{{#if this.path}}<path d={{this.path}} />{{/if}}
			</svg>
			<span
				class="sub-fxp-tones-shade"
				style={{this.belowStyle}}
			></span>
			<span
				class="sub-fxp-tones-shade is-above"
				style={{this.aboveStyle}}
			></span>
			<span
				class="sub-fxp-tones-bar"
				style={{this.barStyle}}
			></span>
			{{#each @handles key="key" as |h|}}
				<span
					class="sub-fxp-tones-handle is-{{h.fill}}"
					role="slider"
					tabindex="0"
					aria-label={{h.label}}
					aria-valuemin="0"
					aria-valuemax="255"
					aria-valuenow={{h.position}}
					aria-valuetext={{h.text}}
					data-key={{h.key}}
					style={{this.handleStyle h}}
					{{on "keydown" (fn this.key h.key)}}
					{{on "dblclick" (fn @onReset h.key)}}
				></span>
			{{/each}}
		</div>
	</template>
}
