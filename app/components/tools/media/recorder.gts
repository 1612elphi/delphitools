import Component from '@glimmer/component';
import { htmlSafe } from '@ember/template';
import { modifier } from 'ember-modifier';
import CanonButton from 'delphicanon/components/canon-button';
import CanonReadoutBand, {
	type CanonTransport,
} from 'delphicanon/components/canon-readout-band';
import type { CanonLamp } from 'delphicanon/components/canon-lamps';
import { IconSvg } from 'delphitools-v2/components/icon';
import {
	peakInterval,
	stripLayout,
	type Capture,
	type StripLayout,
} from 'delphitools-v2/components/tools/media/capture';
import type Playback from 'delphitools-v2/components/tools/media/playback';
import './recorder.css';

export interface RecorderTake {
	peaks: number[];
	duration: number;
}

const lamps: CanonLamp[] = ['record', 'play', 'pause'];
const none: number[] = [];

const platterSpeed = 2 / peakInterval;
const hatch = 10;

interface Shown {
	peaks: number[];
	position: number;
	ahead: boolean;
	head: boolean;
}

function paint(
	canvas: HTMLCanvasElement,
	shown: Shown,
	unit: number,
	fitted: boolean,
) {
	const context = canvas.getContext('2d');
	if (!context) return;
	const { width, height } = canvas;
	const style = getComputedStyle(canvas);
	const colour = (name: string) => style.getPropertyValue(name).trim();
	const layout: StripLayout = stripLayout(
		shown.peaks.length,
		shown.position,
		width,
		unit,
		fitted,
	);
	const mid = Math.round(height / 2);
	const half = Math.max(1, Math.round(height / 2 - 8 * unit));
	const column = (index: number) => {
		const extent = Math.max(
			unit,
			Math.round((shown.peaks[index] ?? 0) * half) * 2,
		);
		const x =
			layout.head +
			(index - layout.index) * layout.step -
			layout.slip;
		context.fillRect(x, mid - extent / 2, layout.step, extent);
	};
	context.clearRect(0, 0, width, height);
	context.fillStyle = colour('--canon-primary');
	context.fillRect(0, mid - unit / 2, layout.head, unit);
	for (let index = layout.from; index < layout.index; index++)
		column(index);
	context.globalAlpha = 0.45;
	context.fillStyle = colour('--canon-muted-foreground');
	context.fillRect(
		layout.head,
		mid - unit / 2,
		width - layout.head,
		unit,
	);
	if (shown.ahead)
		for (let index = layout.index; index < layout.to; index++)
			column(index);
	context.globalAlpha = 1;
	if (!shown.head) return;
	context.fillStyle = colour('--canon-foreground');
	const rule = 2 * unit;
	context.fillRect(
		Math.min(Math.max(0, layout.head - unit), width - rule),
		0,
		rule,
		height,
	);
}

export interface RecorderBandSignature {
	Args: {
		capture: Capture;
		playback?: Playback;
		take?: RecorderTake | null;
	};
	Element: HTMLDivElement;
}

export class RecorderBand extends Component<RecorderBandSignature> {
	get transport(): CanonTransport {
		const { capture, playback } = this.args;
		if (capture.active)
			return {
				playhead: capture.elapsed,
				recording: true,
				paused: capture.state === 'paused',
			};
		if (playback?.active) return playback.transport;
		return { playhead: null };
	}

	get idle() {
		return this.args.take?.duration ?? null;
	}

	#shown(): Shown {
		const { capture, playback, take } = this.args;
		if (capture.active)
			return {
				peaks: capture.peaks,
				position: capture.elapsed,
				ahead: false,
				head: true,
			};
		if (playback?.active && take)
			return {
				peaks: take.peaks,
				position: playback.playhead ?? 0,
				ahead: true,
				head: true,
			};
		return { peaks: none, position: 0, ahead: false, head: false };
	}

	// ponytail: one rAF loop while mounted, drawing only when what it shows changed
	run = modifier((element: HTMLElement) => {
		const canvas = element.querySelector('canvas')!;
		const reduced = matchMedia('(prefers-reduced-motion: reduce)');
		let last: unknown[] = [];
		let frame = 0;
		const loop = () => {
			frame = requestAnimationFrame(loop);
			const meter = element.querySelector<HTMLElement>(
				'.media-recorder-meter',
			);
			if (meter) {
				const level = String(
					Math.round(
						this.args.capture.level * 100,
					),
				);
				if (meter.ariaValueNow !== level) {
					meter.ariaValueNow = level;
					meter.style.setProperty(
						'--media-recorder-level',
						`${level}%`,
					);
				}
			}
			const unit = window.devicePixelRatio || 1;
			const width = Math.round(canvas.clientWidth * unit);
			const height = Math.round(canvas.clientHeight * unit);
			const shown = this.#shown();
			const key = [
				shown.peaks,
				shown.peaks.length,
				shown.position,
				shown.head,
				width,
				height,
				document.documentElement.className,
				reduced.matches,
			];
			if (key.every((value, index) => value === last[index]))
				return;
			last = key;
			canvas.width = width;
			canvas.height = height;
			paint(canvas, shown, unit, reduced.matches);
		};
		loop();
		return () => cancelAnimationFrame(frame);
	});

	<template>
		<CanonReadoutBand
			class="media-recorder"
			@transport={{this.transport}}
			@idle={{this.idle}}
			@lamps={{lamps}}
			...attributes
		>
			<div class="media-recorder-strip" {{this.run}}>
				<canvas
					class="media-recorder-wave"
					role="img"
					aria-label="Waveform"
				></canvas>
				{{#if @capture.active}}
					<span
						class="media-recorder-meter"
						role="meter"
						aria-label="Input level"
						aria-valuemin="0"
						aria-valuemax="100"
						aria-valuenow="0"
					></span>
				{{/if}}
			</div>
		</CanonReadoutBand>
	</template>
}

export interface RecorderTransportSignature {
	Args: {
		capture: Capture;
		playback?: Playback;
		duration?: number;
		onRecord: () => void;
		onStop: () => void;
		onPause: () => void;
		disabled?: boolean;
		recordText?: string;
	};
}

const RecordIcon = <template><IconSvg @name="circle-dot" /></template>;
const StopIcon = <template><IconSvg @name="square" /></template>;
const PauseIcon = <template><IconSvg @name="pause" /></template>;
const ResumeIcon = <template><IconSvg @name="play" /></template>;

export class RecorderTransport extends Component<RecorderTransportSignature> {
	get active() {
		return this.args.capture.active || !!this.args.playback?.active;
	}

	get held() {
		const { capture, playback } = this.args;
		return capture.active
			? capture.state === 'paused'
			: !!playback?.paused;
	}

	get position() {
		const { capture, playback } = this.args;
		return capture.active
			? capture.elapsed
			: (playback?.playhead ?? 0);
	}

	get platterStyle() {
		const offset = (this.position * platterSpeed) % hatch;
		return htmlSafe(
			`--media-recorder-offset: ${(-offset).toFixed(1)}px`,
		);
	}

	stop = () => {
		if (this.args.capture.active) this.args.onStop();
		else this.args.playback?.stop();
	};

	pause = () => {
		if (this.args.capture.active) this.args.onPause();
		else this.args.playback?.toggle();
	};

	platter = modifier((element: HTMLElement) => {
		let lastX = 0;
		let pausedHere = false;
		const down = (event: PointerEvent) => {
			if (event.button !== 0 || !this.active) return;
			element.setPointerCapture(event.pointerId);
			lastX = event.clientX;
			pausedHere = !this.held;
			if (pausedHere) this.pause();
		};
		const move = (event: PointerEvent) => {
			if (!element.hasPointerCapture(event.pointerId)) return;
			let dx = event.clientX - lastX;
			lastX = event.clientX;
			const { capture, playback, duration } = this.args;
			if (capture.active || !playback?.active) return;
			if (getComputedStyle(element).direction === 'rtl')
				dx = -dx;
			const to = this.position - dx / platterSpeed;
			playback.scrub(
				Math.min(Math.max(0, to), duration ?? Infinity),
			);
		};
		const up = () => {
			if (pausedHere && this.held) this.pause();
			pausedHere = false;
		};
		element.addEventListener('pointerdown', down);
		element.addEventListener('pointermove', move);
		element.addEventListener('lostpointercapture', up);
		return () => {
			element.removeEventListener('pointerdown', down);
			element.removeEventListener('pointermove', move);
			element.removeEventListener('lostpointercapture', up);
		};
	});

	<template>
		<div
			class="media-recorder-transport
				{{if
					this.active
					'media-recorder-transport--active'
				}}"
		>
			{{#if this.active}}
				<CanonButton
					class="media-recorder-stop"
					@label="Stop"
					@icon={{StopIcon}}
					@onClick={{this.stop}}
				/>
				<span
					class="media-recorder-platter
						{{unless
							this.held
							'media-recorder-platter--running'
						}}"
					style={{this.platterStyle}}
					aria-hidden="true"
					{{this.platter}}
				></span>
				<CanonButton
					class="media-recorder-pause"
					@label={{if this.held "Resume" "Pause"}}
					@icon={{if
						this.held
						ResumeIcon
						PauseIcon
					}}
					@onClick={{this.pause}}
				/>
			{{else}}
				<CanonButton
					class="media-recorder-record"
					@kind="primary"
					@text={{if
						@recordText
						@recordText
						"Record"
					}}
					@icon={{RecordIcon}}
					@disabled={{@disabled}}
					@onClick={{@onRecord}}
				/>
			{{/if}}
		</div>
	</template>
}
