import { modifier } from 'ember-modifier';
import type { TOC } from '@ember/component/template-only';
import { normalised, type Histogram } from './render';

const INSET = 8;

function fill(
	ctx: CanvasRenderingContext2D,
	bins: number[],
	w: number,
	h: number,
) {
	const step = w / bins.length;
	ctx.beginPath();
	ctx.moveTo(0, h);
	bins.forEach((bin, i) => {
		const y = h * (1 - bin);
		ctx.lineTo(i * step, y);
		ctx.lineTo((i + 1) * step, y);
	});
	ctx.lineTo(w, h);
	ctx.closePath();
}

function draw(view: HTMLCanvasElement, histogram: Histogram) {
	const dpr = window.devicePixelRatio || 1;
	view.width = Math.round(view.clientWidth * dpr);
	view.height = Math.round(view.clientHeight * dpr);
	const ctx = view.getContext('2d')!;
	ctx.clearRect(0, 0, view.width, view.height);
	ctx.scale(dpr, dpr);
	ctx.translate(0, INSET);
	const w = view.clientWidth;
	const h = view.clientHeight - 2 * INSET;
	const dark = document.documentElement.classList.contains('dark');
	ctx.globalCompositeOperation = dark ? 'screen' : 'multiply';
	const inks: [Float32Array, string][] = [
		[histogram.red, 'rgb(255 59 48 / 55%)'],
		[histogram.green, 'rgb(52 199 89 / 55%)'],
		[histogram.blue, 'rgb(0 122 255 / 55%)'],
	];
	for (const [bins, ink] of inks) {
		fill(ctx, normalised(bins), w, h);
		ctx.fillStyle = ink;
		ctx.fill();
	}
	ctx.globalCompositeOperation = 'source-over';
	fill(ctx, normalised(histogram.luminance), w, h);
	ctx.globalAlpha = 0.6;
	ctx.strokeStyle =
		getComputedStyle(view).getPropertyValue('--canon-foreground');
	ctx.lineWidth = 1;
	ctx.stroke();
}

const paint = modifier(
	(view: HTMLCanvasElement, [histogram]: [Histogram | null]) => {
		if (!histogram) return;
		const redraw = () => draw(view, histogram);
		redraw();
		const theme = new MutationObserver(redraw);
		theme.observe(document.documentElement, {
			attributeFilter: ['class'],
		});
		const size = new ResizeObserver(redraw);
		size.observe(view);
		return () => {
			theme.disconnect();
			size.disconnect();
		};
	},
);

const DevelopHistogram: TOC<{ Args: { histogram: Histogram | null } }> =
	<template>
		<canvas
			class="sub-dev-histogram"
			aria-hidden="true"
			{{paint @histogram}}
		></canvas>
	</template>;

export default DevelopHistogram;
