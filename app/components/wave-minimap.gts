import Component from '@glimmer/component';
import { on } from '@ember/modifier';
import { modifier } from 'ember-modifier';
import { drawWaveform, type WaveformPeaks } from 'delphitools-v2/lib/audio';

export interface WaveMinimapSignature {
	Element: HTMLCanvasElement;
	Args: {
		/** full-file peaks — the overview never zooms */
		peaks: WaveformPeaks;
		duration: number;
		viewStart: number;
		viewEnd: number;
		onView: (start: number, end: number) => void;
	};
}

// A press-and-release narrower than this reads as a click: pan the current
// window there instead of collapsing it.
const DRAG_THRESHOLD_S = 0.02;

/**
 * The overview strip over a zoomable waveform: the full clip with the
 * visible window marked. Drag selects a new window, a click pans the
 * window's centre, a double click resets to the whole clip. The Audio
 * Atlas and Audio Trimmer both mount one.
 */
export default class WaveMinimap extends Component<WaveMinimapSignature> {
	#dragging = false;
	#anchorS = 0;

	draw = modifier(
		(
			canvas: HTMLCanvasElement,
			_positional: [],
			named: { start: number; end: number },
		) => {
			const render = () => {
				const dpr = window.devicePixelRatio || 1;
				const width = canvas.clientWidth * dpr;
				const height = canvas.clientHeight * dpr;
				canvas.width = width;
				canvas.height = height;
				const ctx = canvas.getContext('2d');
				if (!ctx) return;

				const styles = getComputedStyle(canvas);
				ctx.fillStyle =
					styles.getPropertyValue(
						'--muted-foreground',
					);
				drawWaveform(
					ctx,
					this.args.peaks,
					width,
					height,
				);

				const duration = this.args.duration || 1;
				const from = (named.start / duration) * width;
				const to = (named.end / duration) * width;
				ctx.fillStyle =
					styles.getPropertyValue('--primary');
				ctx.globalAlpha = 0.25;
				ctx.fillRect(from, 0, to - from, height);
				ctx.globalAlpha = 1;
				ctx.fillRect(from, 0, Math.max(1, dpr), height);
				ctx.fillRect(
					to - Math.max(1, dpr),
					0,
					Math.max(1, dpr),
					height,
				);
			};

			render();
			const observer = new ResizeObserver(render);
			observer.observe(canvas);
			return () => observer.disconnect();
		},
	);

	#timeAt(canvas: HTMLCanvasElement, clientX: number): number {
		const rect = canvas.getBoundingClientRect();
		const x = Math.min(
			rect.width,
			Math.max(0, clientX - rect.left),
		);
		return (x / rect.width) * this.args.duration;
	}

	pointerDown = (event: PointerEvent) => {
		const canvas = event.currentTarget as HTMLCanvasElement;
		canvas.setPointerCapture(event.pointerId);
		this.#dragging = true;
		this.#anchorS = this.#timeAt(canvas, event.clientX);
	};

	pointerMove = (event: PointerEvent) => {
		if (!this.#dragging) return;
		const canvas = event.currentTarget as HTMLCanvasElement;
		const now = this.#timeAt(canvas, event.clientX);
		if (Math.abs(now - this.#anchorS) < DRAG_THRESHOLD_S) return;
		this.args.onView(
			Math.min(this.#anchorS, now),
			Math.max(this.#anchorS, now),
		);
	};

	pointerUp = (event: PointerEvent) => {
		if (!this.#dragging) return;
		this.#dragging = false;
		const canvas = event.currentTarget as HTMLCanvasElement;
		const now = this.#timeAt(canvas, event.clientX);
		if (Math.abs(now - this.#anchorS) >= DRAG_THRESHOLD_S) return;

		// A click: keep the window width, recentre it.
		const width = this.args.viewEnd - this.args.viewStart;
		if (width >= this.args.duration) return;
		let from = now - width / 2;
		from = Math.max(0, Math.min(this.args.duration - width, from));
		this.args.onView(from, from + width);
	};

	reset = () => {
		this.args.onView(0, this.args.duration);
	};

	<template>
		{{! drag selects the zoom window; zoom buttons are the keyboard path }}
		{{! template-lint-disable no-pointer-down-event-binding }}
		<canvas
			class="dt-wmm"
			...attributes
			{{this.draw start=@viewStart end=@viewEnd}}
			{{on "pointerdown" this.pointerDown}}
			{{on "pointermove" this.pointerMove}}
			{{on "pointerup" this.pointerUp}}
			{{on "dblclick" this.reset}}
		></canvas>
	</template>
}
