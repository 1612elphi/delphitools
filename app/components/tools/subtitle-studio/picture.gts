import Component from '@glimmer/component';
import { tracked } from '@glimmer/tracking';
import { on } from '@ember/modifier';
import { guidFor } from '@ember/object/internals';
import { htmlSafe } from '@ember/template';
import { modifier } from 'ember-modifier';
import type { BurnStyle, TextBox } from 'delphitools-v2/lib/subtitle-burn';
import { snap } from 'delphitools-v2/components/tools/subtitle-studio/board';

export interface PictureSignature {
	Args: {
		aspect: number;
		box: TextBox | null;
		style: BurnStyle;
		disabled?: boolean;
		onMove: (x: number, y: number) => void;
	};
	Blocks: { default: [] };
}

interface Drag {
	pointerId: number;
	startX: number;
	startY: number;
	x0: number;
	y0: number;
	width: number;
	height: number;
}

const HINT = 'Drag around the subtitle to where you want it';
const STEP = 0.01;
const BIG_STEP = 0.05;

const percent = (share: number) => `${share * 100}%`;

export default class Picture extends Component<PictureSignature> {
	@tracked drag: Drag | null = null;

	hintId = `${guidFor(this)}-hint`;
	hint = HINT;

	get boardStyle() {
		return htmlSafe(`--ss-aspect: ${this.args.aspect}`);
	}

	get handle() {
		const { box, style } = this.args;
		if (!box) return null;
		return {
			x: 0.5 + style.x - style.width / 2,
			y: box.y,
			width: style.width,
			height: box.height,
		};
	}

	get handleStyle() {
		const handle = this.handle;
		if (!handle) return htmlSafe('');
		return htmlSafe(
			`inset-inline-start: ${percent(handle.x)}; inset-block-start: ${percent(handle.y)}; inline-size: ${percent(handle.width)}; block-size: ${percent(handle.height)}`,
		);
	}

	get hintAtTop() {
		const handle = this.handle;
		return !!handle && handle.y + handle.height / 2 >= 0.5;
	}

	get snapsX() {
		return this.args.style.x === 0;
	}

	get snapsY() {
		return this.args.style.y === 0;
	}

	moving = modifier((handle: HTMLElement) => {
		const down = (event: PointerEvent) => {
			if (this.args.disabled || event.button !== 0) return;
			const frame =
				handle.parentElement!.getBoundingClientRect();
			if (!frame.width || !frame.height) return;
			event.preventDefault();
			handle.setPointerCapture(event.pointerId);
			handle.focus({ preventScroll: true });
			this.drag = {
				pointerId: event.pointerId,
				startX: event.clientX,
				startY: event.clientY,
				x0: this.args.style.x,
				y0: this.args.style.y,
				width: frame.width,
				height: frame.height,
			};
		};
		const move = (event: PointerEvent) => {
			const drag = this.drag;
			if (!drag || event.pointerId !== drag.pointerId) return;
			const to = snap(
				drag.x0 +
					(event.clientX - drag.startX) /
						drag.width,
				drag.y0 +
					(event.clientY - drag.startY) /
						drag.height,
				drag.width,
				drag.height,
			);
			this.args.onMove(to.x, to.y);
		};
		const up = (event: PointerEvent) => {
			if (this.drag?.pointerId === event.pointerId)
				this.drag = null;
		};
		handle.addEventListener('pointerdown', down);
		handle.addEventListener('pointermove', move);
		handle.addEventListener('pointerup', up);
		handle.addEventListener('pointercancel', up);
		return () => {
			handle.removeEventListener('pointerdown', down);
			handle.removeEventListener('pointermove', move);
			handle.removeEventListener('pointerup', up);
			handle.removeEventListener('pointercancel', up);
		};
	});

	key = (event: KeyboardEvent) => {
		if (this.args.disabled) return;
		const by = event.shiftKey ? BIG_STEP : STEP;
		const rtl =
			getComputedStyle(event.target as Element).direction ===
			'rtl';
		const sideways = rtl ? -by : by;
		const moves: Record<string, [number, number]> = {
			ArrowLeft: [-sideways, 0],
			ArrowRight: [sideways, 0],
			ArrowUp: [0, -by],
			ArrowDown: [0, by],
		};
		const delta = moves[event.key];
		if (!delta) return;
		event.preventDefault();
		const round = (value: number) =>
			Math.round(value * 1000) / 1000;
		this.args.onMove(
			round(this.args.style.x + delta[0]),
			round(this.args.style.y + delta[1]),
		);
	};

	<template>
		<div class="ss-board" style={{this.boardStyle}}>
			<div class="ss-picture">
				{{yield}}
				<span class="ss-safe ss-safe--ts"></span>
				<span class="ss-safe ss-safe--te"></span>
				<span class="ss-safe ss-safe--bs"></span>
				<span class="ss-safe ss-safe--be"></span>
				{{#if this.drag}}
					<span
						class="ss-guide ss-guide--centre
							{{if
								this.snapsX
								'ss-guide--snapped'
							}}"
					></span>
					<span
						class="ss-guide ss-guide--baseline
							{{if
								this.snapsY
								'ss-guide--snapped'
							}}"
					></span>
				{{/if}}
				{{#if this.handle}}
					<button
						type="button"
						class="ss-handle
							{{if
								this.drag
								'ss-handle--dragging'
							}}"
						style={{this.handleStyle}}
						aria-label="Position"
						aria-describedby={{this.hintId}}
						disabled={{@disabled}}
						{{this.moving}}
						{{on "keydown" this.key}}
					>
						<span
							class="ss-grip ss-grip--start"
						></span>
						<span
							class="ss-grip ss-grip--end"
						></span>
					</button>
					<span
						id={{this.hintId}}
						class="ss-hint
							{{if
								this.hintAtTop
								'ss-hint--top'
							}}
							{{if
								this.drag
								'ss-hint--hidden'
							}}"
					>{{this.hint}}</span>
				{{/if}}
			</div>
		</div>
	</template>
}
