import Component from '@glimmer/component';
import { tracked } from '@glimmer/tracking';
import { on } from '@ember/modifier';
import { htmlSafe } from '@ember/template';
import { modifier } from 'ember-modifier';
import { readoutBandHeight } from 'delphicanon/components/canon-readout-band';
import { drawWaveform, type WaveformPeaks } from 'delphitools-v2/lib/audio';
import { formatTimestamp } from 'delphitools-v2/lib/subtitles';
import { spread } from 'delphitools-v2/components/tools/media/frames';
import { share } from 'delphitools-v2/components/tools/media/trim-span';

export const bandHeight = readoutBandHeight(96);

export interface StripsSignature {
	Args: {
		thumbnails: string[];
		aspect?: number;
		waveform?: boolean;
		peaks?: WaveformPeaks | null;
		audioRemoved?: boolean;
		duration: number;
		playhead?: number | null;
		onScrub?: (seconds: number) => void;
		selection?: [number, number] | null;
		blank?: boolean;
	};
	Element: HTMLDivElement;
}

const step = 1;
const bigStep = 10;

export default class Strips extends Component<StripsSignature> {
	@tracked cells = 0;

	get duration() {
		return this.args.duration;
	}

	get frames() {
		const { thumbnails } = this.args;
		return spread(this.cells, thumbnails.length).map(
			(index) => thumbnails[index]!,
		);
	}

	get blanks() {
		return this.args.blank
			? Array.from({ length: this.cells })
			: [];
	}

	get framesStyle() {
		return htmlSafe(
			`grid-template-columns: repeat(${Math.max(1, this.frames.length || this.blanks.length)},minmax(0, 1fr))`,
		);
	}

	get headStyle() {
		const { playhead } = this.args;
		const share =
			this.duration > 0
				? Math.min(
						Math.max(
							(playhead ?? 0) /
								this.duration,
							0,
						),
						1,
					)
				: 0;
		return htmlSafe(`inset-inline-start: ${share * 100}%`);
	}

	get shades() {
		const { selection } = this.args;
		if (!selection || !(this.duration > 0)) return null;
		const [start, end] = selection.map(
			(s) => share(s, this.duration) * 100,
		);
		return {
			before: htmlSafe(`--trim-start: ${start}%`),
			after: htmlSafe(`--trim-end: ${end}%`),
		};
	}

	get showsHead() {
		return (
			this.duration > 0 &&
			typeof this.args.playhead === 'number'
		);
	}

	get value() {
		return this.args.playhead ?? 0;
	}

	get valueText() {
		return formatTimestamp(this.value * 1000, '.');
	}

	get scrubs() {
		return !!this.args.onScrub && this.duration > 0;
	}

	measure = modifier((element: HTMLElement) => {
		const observer = new ResizeObserver(() => {
			const aspect = this.args.aspect ?? 16 / 9;
			const cell = element.clientHeight * aspect;
			const count =
				cell > 0
					? Math.max(
							1,
							Math.ceil(
								element.clientWidth /
									cell,
							),
						)
					: 0;
			if (count !== this.cells) this.cells = count;
		});
		observer.observe(element);
		return () => observer.disconnect();
	});

	draw = modifier(
		(
			canvas: HTMLCanvasElement,
			[peaks]: [WaveformPeaks | null | undefined],
		) => {
			const render = () => {
				const ratio = window.devicePixelRatio || 1;
				const width = Math.round(
					canvas.clientWidth * ratio,
				);
				const height = Math.round(
					canvas.clientHeight * ratio,
				);
				canvas.width = width;
				canvas.height = height;
				const context = canvas.getContext('2d');
				if (!context || !peaks) return;
				context.fillStyle =
					getComputedStyle(canvas).color;
				drawWaveform(context, peaks, width, height);
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

	#scrubAt(element: HTMLElement, clientX: number) {
		const box = element.getBoundingClientRect();
		let share = (clientX - box.left) / Math.max(1, box.width);
		if (getComputedStyle(element).direction === 'rtl')
			share = 1 - share;
		this.args.onScrub?.(
			Math.min(Math.max(share, 0), 1) * this.duration,
		);
	}

	scrubbing = modifier((element: HTMLElement) => {
		const down = (event: PointerEvent) => {
			if (!this.scrubs || event.button !== 0) return;
			element.setPointerCapture(event.pointerId);
			this.#scrubAt(element, event.clientX);
		};
		const move = (event: PointerEvent) => {
			if (element.hasPointerCapture(event.pointerId))
				this.#scrubAt(element, event.clientX);
		};
		element.addEventListener('pointerdown', down);
		element.addEventListener('pointermove', move);
		return () => {
			element.removeEventListener('pointerdown', down);
			element.removeEventListener('pointermove', move);
		};
	});

	key = (event: KeyboardEvent) => {
		if (!this.scrubs) return;
		const by = event.shiftKey ? bigStep : step;
		const moves: Record<string, number> = {
			ArrowLeft: this.value - by,
			ArrowDown: this.value - by,
			ArrowRight: this.value + by,
			ArrowUp: this.value + by,
			Home: 0,
			End: this.duration,
		};
		const to = moves[event.key];
		if (to === undefined) return;
		event.preventDefault();
		this.args.onScrub?.(Math.min(Math.max(to, 0), this.duration));
	};

	<template>
		<div
			class="media-strips
				{{if @waveform 'media-strips--waveform'}}
				{{if @blank 'media-strips--blank'}}
				{{if @audioRemoved 'media-strips--removed'}}
				{{if this.scrubs 'media-strips--scrubs'}}"
			{{this.scrubbing}}
			...attributes
		>
			<div
				class="media-frames"
				style={{this.framesStyle}}
				{{this.measure}}
			>
				{{#each this.blanks}}
					<span
						class="media-frame media-frame--blank"
					></span>
				{{/each}}
				{{#each this.frames as |url|}}
					<img
						class="media-frame"
						src={{url}}
						alt=""
						draggable="false"
					/>
				{{/each}}
			</div>
			{{#if @waveform}}
				<div class="media-wave">
					<canvas
						class="media-wave-canvas"
						aria-hidden="true"
						{{this.draw @peaks}}
					></canvas>
					<span class="media-wave-strike"></span>
				</div>
			{{/if}}
			{{#if this.shades}}
				<span
					class="media-shade media-shade--before"
					style={{this.shades.before}}
				></span>
				<span
					class="media-shade media-shade--after"
					style={{this.shades.after}}
				></span>
			{{/if}}
			{{#if this.showsHead}}
				<span
					class="media-head"
					style={{this.headStyle}}
				></span>
			{{/if}}
			<span
				class="media-scrub"
				role="slider"
				tabindex={{if this.scrubs "0" "-1"}}
				aria-label="Position"
				aria-valuemin="0"
				aria-valuemax={{this.duration}}
				aria-valuenow={{this.value}}
				aria-valuetext={{this.valueText}}
				aria-disabled={{if this.scrubs "false" "true"}}
				{{on "keydown" this.key}}
			></span>
		</div>
	</template>
}
