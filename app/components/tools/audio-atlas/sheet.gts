import Component from '@glimmer/component';
import { cached, tracked } from '@glimmer/tracking';
import { on } from '@ember/modifier';
import { htmlSafe } from '@ember/template';
import { modifier } from 'ember-modifier';
import CanonLoader from 'delphicanon/components/canon-loader';
import { drawWaveform, type WaveformPeaks } from 'delphitools-v2/lib/audio';
import {
	frequencies,
	label,
	ticks,
} from 'delphitools-v2/components/tools/audio-atlas/ruler';
import {
	coverage,
	paint,
} from 'delphitools-v2/components/tools/audio-atlas/spectrogram';

export interface SheetSignature {
	Args: {
		buffer: AudioBuffer;
		peaks: WaveformPeaks | null;
		start: number;
		end: number;
		playhead: number | null;
		onSeek: (seconds: number) => void;
		onWindow: (start: number, span: number) => void;
		onNudge: (direction: number) => void;
		onFit: () => void;
	};
}

const settle = 200;
const slop = 4;

interface Grab {
	start: number;
	span: number;
	share: number;
	x: number;
	apart: number;
	moved: boolean;
}

export default class Sheet extends Component<SheetSignature> {
	@tracked width = 0;
	@tracked covered: [number, number] | null = null;
	@tracked rendering = false;

	#painted = false;
	#pointers = new Map<number, number>();
	#grab: Grab | null = null;

	get span() {
		return Math.max(this.args.end - this.args.start, 0);
	}

	get zoomed() {
		return (
			this.args.start > 0 ||
			this.args.end < this.args.buffer.duration - 1e-6
		);
	}

	#share(seconds: number) {
		return this.span > 0
			? (seconds - this.args.start) / this.span
			: 0;
	}

	@cached
	get ticks() {
		return ticks(this.args.start, this.args.end, this.width).map(
			(tick) => ({
				text: tick.text,
				style: htmlSafe(
					`inset-inline-start: ${tick.at * 100}%`,
				),
			}),
		);
	}

	get frequencies() {
		return frequencies(this.args.buffer.sampleRate).map(
			(text, i) => ({
				text,
				style: htmlSafe(
					`inset-block-start: ${75 - i * 25}%`,
				),
			}),
		);
	}

	get headStyle() {
		const { playhead, start, end } = this.args;
		if (playhead === null || playhead < start || playhead > end)
			return null;
		return htmlSafe(
			`inset-inline-start: ${this.#share(playhead) * 100}%`,
		);
	}

	get plateStyle() {
		const covered = this.covered;
		if (!covered || !(this.span > 0)) return null;
		const from = this.#share(covered[0]);
		const to = this.#share(covered[1]);
		return htmlSafe(
			`inset-inline-start: ${from * 100}%; inline-size: ${(to - from) * 100}%`,
		);
	}

	get value() {
		return this.args.playhead ?? this.args.start;
	}

	get windowText() {
		return `${label(this.args.start, 0.01)} – ${label(this.args.end, 0.01)}`;
	}

	measure = modifier((element: HTMLElement) => {
		const observer = new ResizeObserver(([entry]) => {
			const width = Math.round(entry?.contentRect.width ?? 0);
			if (width !== this.width)
				requestAnimationFrame(
					() => (this.width = width),
				);
		});
		observer.observe(element);
		return () => observer.disconnect();
	});

	drawWave = modifier(
		(
			canvas: HTMLCanvasElement,
			[peaks]: [WaveformPeaks | null],
		) => {
			const render = () => {
				const ratio = window.devicePixelRatio || 1;
				canvas.width = Math.round(
					canvas.clientWidth * ratio,
				);
				canvas.height = Math.round(
					canvas.clientHeight * ratio,
				);
				const context = canvas.getContext('2d');
				if (!context || !peaks) return;
				context.fillStyle =
					getComputedStyle(canvas).color;
				drawWaveform(
					context,
					peaks,
					canvas.width,
					canvas.height,
				);
			};
			render();
			const observer = new ResizeObserver(render);
			observer.observe(canvas);
			const theme = new MutationObserver(render);
			theme.observe(document.documentElement, {
				attributeFilter: ['class'],
			});
			return () => {
				observer.disconnect();
				theme.disconnect();
			};
		},
	);

	drawSpectrogram = modifier(
		(
			canvas: HTMLCanvasElement,
			[buffer, start, end]: [AudioBuffer, number, number],
		) => {
			let live = true;
			const range = coverage(buffer, start, end);
			const run = async () => {
				this.rendering = true;
				const next = document.createElement('canvas');
				const done = await paint(
					next,
					buffer,
					range,
					() => live,
				);
				if (!done) return;
				canvas.width = next.width;
				canvas.height = next.height;
				canvas.getContext('2d')?.drawImage(next, 0, 0);
				this.covered = range;
				this.rendering = false;
				this.#painted = true;
			};
			const timer = setTimeout(
				() => void run(),
				this.#painted ? settle : 0,
			);
			return () => {
				live = false;
				clearTimeout(timer);
			};
		},
	);

	#flipped(element: HTMLElement) {
		return getComputedStyle(element).direction === 'rtl';
	}

	#shareAt(element: HTMLElement, clientX: number) {
		const box = element.getBoundingClientRect();
		const share = Math.min(
			Math.max(
				(clientX - box.left) / Math.max(1, box.width),
				0,
			),
			1,
		);
		return this.#flipped(element) ? 1 - share : share;
	}

	#grabAt(element: HTMLElement) {
		const xs = [...this.#pointers.values()];
		const x = xs.reduce((a, b) => a + b, 0) / xs.length;
		this.#grab = {
			start: this.args.start,
			span: this.span,
			share: this.#shareAt(element, x),
			x,
			apart: xs.length > 1 ? Math.abs(xs[0]! - xs[1]!) : 0,
			moved: this.#grab?.moved ?? false,
		};
	}

	gestures = modifier((element: HTMLElement) => {
		const down = (event: PointerEvent) => {
			if (event.button !== 0 || !(this.span > 0)) return;
			element.setPointerCapture(event.pointerId);
			if (this.#pointers.size === 0) this.#grab = null;
			this.#pointers.set(event.pointerId, event.clientX);
			this.#grabAt(element);
		};
		const move = (event: PointerEvent) => {
			const grab = this.#grab;
			if (!grab || !this.#pointers.has(event.pointerId))
				return;
			this.#pointers.set(event.pointerId, event.clientX);
			const width = Math.max(1, element.clientWidth);
			if (this.#pointers.size > 1) {
				const xs = [...this.#pointers.values()];
				const apart = Math.abs(xs[0]! - xs[1]!);
				if (!(grab.apart > 0) || !(apart > 0)) return;
				grab.moved = true;
				const anchor =
					grab.start + grab.share * grab.span;
				const next = grab.span / (apart / grab.apart);
				this.args.onWindow(
					anchor - grab.share * next,
					next,
				);
				return;
			}
			const dx = event.clientX - grab.x;
			if (!grab.moved && Math.abs(dx) < slop) return;
			grab.moved = true;
			if (!this.zoomed) return;
			const moved = (dx / width) * grab.span;
			this.args.onWindow(
				grab.start +
					(this.#flipped(element)
						? moved
						: -moved),
				grab.span,
			);
		};
		const up = (event: PointerEvent) => {
			if (!this.#pointers.delete(event.pointerId)) return;
			const grab = this.#grab;
			if (this.#pointers.size > 0)
				return this.#grabAt(element);
			this.#grab = null;
			if (grab && !grab.moved && event.type === 'pointerup')
				this.args.onSeek(
					this.args.start +
						this.#shareAt(
							element,
							event.clientX,
						) *
							this.span,
				);
		};
		const wheel = (event: WheelEvent) => {
			if (!(this.span > 0)) return;
			const share = this.#shareAt(element, event.clientX);
			if (event.ctrlKey) {
				event.preventDefault();
				const next =
					this.span *
					Math.exp(event.deltaY * 0.01);
				const anchor =
					this.args.start + share * this.span;
				this.args.onWindow(anchor - share * next, next);
				return;
			}
			if (
				!this.zoomed ||
				Math.abs(event.deltaX) <= Math.abs(event.deltaY)
			)
				return;
			event.preventDefault();
			const moved =
				(event.deltaX /
					Math.max(1, element.clientWidth)) *
				this.span;
			this.args.onWindow(
				this.args.start +
					(this.#flipped(element)
						? -moved
						: moved),
				this.span,
			);
		};
		element.addEventListener('pointerdown', down);
		element.addEventListener('pointermove', move);
		element.addEventListener('pointerup', up);
		element.addEventListener('pointercancel', up);
		element.addEventListener('wheel', wheel, { passive: false });
		return () => {
			element.removeEventListener('pointerdown', down);
			element.removeEventListener('pointermove', move);
			element.removeEventListener('pointerup', up);
			element.removeEventListener('pointercancel', up);
			element.removeEventListener('wheel', wheel);
		};
	});

	key = (event: KeyboardEvent) => {
		const moves: Record<string, number> = {
			ArrowLeft: -1,
			ArrowDown: -1,
			ArrowRight: 1,
			ArrowUp: 1,
		};
		const direction = moves[event.key];
		if (direction === undefined) return;
		event.preventDefault();
		this.args.onNudge(direction);
	};

	<template>
		<div
			class="aa-sheet {{if this.zoomed 'aa-sheet--pans'}}"
			{{this.gestures}}
			{{this.measure}}
		>
			<canvas
				class="aa-wave aa-flip"
				aria-hidden="true"
				{{this.drawWave @peaks}}
			></canvas>
			<div class="aa-ruler" aria-hidden="true">
				{{#each this.ticks as |tick|}}
					<span
						class="aa-tick
							{{if
								tick.text
								'aa-tick--major'
							}}"
						style={{tick.style}}
					>{{#if tick.text}}<span
								class="aa-tick-label"
							>{{tick.text}}</span>{{/if}}</span>
				{{/each}}
			</div>
			<div class="aa-plate" aria-hidden="true">
				<canvas
					class="aa-spectro aa-flip"
					style={{this.plateStyle}}
					{{this.drawSpectrogram
						@buffer
						@start
						@end
					}}
				></canvas>
				{{#each this.frequencies as |frequency|}}
					<span
						class="aa-hz"
						style={{frequency.style}}
					>{{frequency.text}}</span>
				{{/each}}
				{{#if this.rendering}}
					<CanonLoader
						class="aa-loader"
						@cell={{5}}
						@gap={{1}}
					/>
				{{/if}}
			</div>
			{{#if this.headStyle}}
				<span
					class="aa-head"
					style={{this.headStyle}}
				></span>
			{{/if}}
			<span
				class="aa-scrub"
				role="slider"
				tabindex="0"
				aria-label="Waveform"
				aria-valuemin="0"
				aria-valuemax={{@buffer.duration}}
				aria-valuenow={{this.value}}
				aria-valuetext={{this.windowText}}
				{{on "keydown" this.key}}
				{{on "dblclick" @onFit}}
			></span>
		</div>
	</template>
}
