import Component from '@glimmer/component';
import { tracked } from '@glimmer/tracking';
import { on } from '@ember/modifier';
import { htmlSafe } from '@ember/template';
import { modifier } from 'ember-modifier';
import FxRows from './fx-rows';
import drag, { type Drag } from './fx-drag';
import {
	commit,
	labelOf,
	numberOf,
	preview,
	readoutOf,
	resetOnDouble,
	stringOf,
	write,
	type FxContext,
} from './fx-context';
import {
	rgbOf,
	vignetteMidpoint,
	vignettePixels,
	vignetteStretch,
	type VignetteShape,
} from './fx-maths';

const HEIGHT = 160;
const PAD_X = 16;
const PAD_Y = 12;

export default class FxVignette extends Component<{
	Args: { ctx: FxContext };
}> {
	@tracked room = 0;
	@tracked guide = false;
	#dragging = false;
	#fade?: number;

	get aspect() {
		const { naturalWidth: w, naturalHeight: h } =
			this.args.ctx.layer;
		return w > 0 && h > 0 ? w / h : 1;
	}

	get shape(): VignetteShape {
		const n = (k: string) => numberOf(this.args.ctx, k) / 100;
		return {
			amount: n('amount'),
			midpoint: n('midpoint'),
			roundness: n('roundness'),
			feather: n('feather'),
			colour: rgbOf(stringOf(this.args.ctx, 'colour')),
		};
	}

	get paper() {
		const w0 = Math.max(0, this.room - 2 * PAD_X);
		const h0 = HEIGHT - 2 * PAD_Y;
		const w = Math.round(Math.min(w0, h0 * this.aspect));
		return { w, h: Math.round(w / this.aspect) };
	}

	get stretch() {
		return vignetteStretch(this.shape.roundness, this.aspect);
	}

	get paperStyle() {
		const { w, h } = this.paper;
		return htmlSafe(`inline-size: ${w}px; block-size: ${h}px`);
	}

	get ringStyle() {
		const { w, h } = this.paper;
		const ring = this.shape.midpoint * 0.71;
		return htmlSafe(
			`inline-size: ${(2 * ring * w) / this.stretch}px; block-size: ${2 * ring * h}px`,
		);
	}

	get text() {
		return readoutOf(
			this.args.ctx,
			'midpoint',
		)(numberOf(this.args.ctx, 'midpoint'));
	}

	get reset() {
		return resetOnDouble(this.args.ctx, 'midpoint');
	}

	measure = modifier((el: HTMLElement) => {
		const ro = new ResizeObserver(() => {
			this.room = el.clientWidth;
		});
		ro.observe(el);
		return () => ro.disconnect();
	});

	draw = modifier(
		(
			canvas: HTMLCanvasElement,
			[shape, w, h]: [VignetteShape, number, number],
		) => {
			const dpr = Math.min(2, window.devicePixelRatio || 1);
			const pw = Math.max(1, Math.round(w * dpr));
			const ph = Math.max(1, Math.round(h * dpr));
			canvas.width = pw;
			canvas.height = ph;
			canvas.getContext('2d')?.putImageData(
				new ImageData(
					vignettePixels(pw, ph, shape),
					pw,
					ph,
				),
				0,
				0,
			);
		},
	);

	showGuide() {
		this.guide = true;
		window.clearTimeout(this.#fade);
		this.#fade = window.setTimeout(() => {
			if (!this.#dragging) this.guide = false;
		}, 1000);
	}

	dragSpec: Drag = {
		axis: 'any',
		move: (event) => {
			this.#dragging = true;
			const paper = (event.currentTarget as HTMLElement)
				.querySelector('canvas')
				?.getBoundingClientRect();
			if (!paper?.width || !paper.height) return;
			const px =
				(event.clientX - paper.left) / paper.width -
				0.5;
			const py =
				(event.clientY - paper.top) / paper.height -
				0.5;
			const next = vignetteMidpoint(px, py, this.stretch);
			this.showGuide();
			if (next !== numberOf(this.args.ctx, 'midpoint'))
				preview(this.args.ctx, { midpoint: next });
		},
		end: (dragged) => {
			this.#dragging = false;
			if (dragged) commit();
			this.showGuide();
		},
	};

	key = (event: KeyboardEvent) => {
		const dir = {
			ArrowRight: 1,
			ArrowUp: 1,
			ArrowLeft: -1,
			ArrowDown: -1,
		}[event.key];
		if (!dir) return;
		event.preventDefault();
		const at = numberOf(this.args.ctx, 'midpoint');
		const next = Math.min(100, Math.max(0, Math.round(at) + dir));
		if (next !== at) write(this.args.ctx, { midpoint: next });
		this.showGuide();
	};

	willDestroy() {
		super.willDestroy();
		window.clearTimeout(this.#fade);
		commit();
	}

	<template>
		<div
			class="sub-fxp-vignette {{if this.guide 'is-guided'}}"
			data-fx-param="vignette"
			{{this.measure}}
			{{drag this.dragSpec}}
		>
			<canvas
				style={{this.paperStyle}}
				{{this.draw
					this.shape
					this.paper.w
					this.paper.h
				}}
			></canvas>
			<span
				class="sub-fxp-vignette-ring"
				style={{this.ringStyle}}
			></span>
			<span
				class="sub-fxp-cover"
				role="slider"
				tabindex="0"
				aria-label={{labelOf @ctx "midpoint"}}
				aria-valuemin="0"
				aria-valuemax="100"
				aria-valuenow={{numberOf @ctx "midpoint"}}
				aria-valuetext={{this.text}}
				{{on "keydown" this.key}}
				{{on "dblclick" this.reset}}
			></span>
		</div>
		<FxRows @ctx={{@ctx}} />
	</template>
}
