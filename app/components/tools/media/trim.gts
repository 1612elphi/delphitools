import Component from '@glimmer/component';
import { on } from '@ember/modifier';
import { htmlSafe } from '@ember/template';
import { modifier } from 'ember-modifier';
import { IconSvg } from 'delphitools-v2/components/icon';
import { formatTimestamp } from 'delphitools-v2/lib/subtitles';
import {
	clampSpan,
	dragTo,
	minimumSpan,
	nudgeStep,
	roundMs,
	share,
} from 'delphitools-v2/components/tools/media/trim-span';
import './media.css';
import './trim.css';

export type TrimEdge = 'start' | 'end';

export interface TrimSignature {
	Args: {
		duration: number;
		start: number;
		end: number;
		disabled?: boolean;
		step?: number;
		origin?: number;
		onChange: (start: number, end: number, moved: TrimEdge) => void;
	};
	Blocks: { default: [] };
	Element: HTMLDivElement;
}

const tc = (seconds: number) => formatTimestamp(seconds * 1000, '.');

export default class Trim extends Component<TrimSignature> {
	#origin = 0;
	#x = 0;

	get shows() {
		return !this.args.disabled && this.args.duration > 0;
	}

	get style() {
		const { start, end, duration } = this.args;
		return htmlSafe(
			`--trim-start: ${share(start, duration) * 100}%; --trim-end: ${share(end, duration) * 100}%`,
		);
	}

	get step() {
		return this.args.step ?? nudgeStep(this.args.duration);
	}

	get origin() {
		return this.args.origin ?? 0;
	}

	#shift(seconds: number) {
		return this.origin ? roundMs(seconds + this.origin) : seconds;
	}

	get startNow() {
		return this.#shift(this.args.start);
	}

	get endNow() {
		return this.#shift(this.args.end);
	}

	get startText() {
		return tc(this.startNow);
	}

	get endText() {
		return tc(this.endNow);
	}

	get startMax() {
		return this.#shift(Math.max(0, this.args.end - minimumSpan));
	}

	get endMax() {
		return this.#shift(this.args.duration);
	}

	get endMin() {
		return this.#shift(
			Math.min(
				this.args.duration,
				this.args.start + minimumSpan,
			),
		);
	}

	#move(edge: TrimEdge, seconds: number) {
		const { start, end, duration } = this.args;
		const at = roundMs(seconds);
		const [from, to] =
			edge === 'start'
				? clampSpan(at, end, duration)
				: clampSpan(start, at, duration, 'end');
		if (from !== start || to !== end)
			this.args.onChange(from, to, edge);
	}

	drags = modifier((grip: HTMLElement, [edge]: [TrimEdge]) => {
		const down = (event: PointerEvent) => {
			if (!this.shows || event.button !== 0) return;
			event.preventDefault();
			grip.setPointerCapture(event.pointerId);
			grip.focus();
			this.#origin = this.args[edge];
			this.#x = event.clientX;
		};
		const move = (event: PointerEvent) => {
			if (!grip.hasPointerCapture(event.pointerId)) return;
			const track = grip.parentElement!;
			this.#move(
				edge,
				dragTo(
					this.#origin,
					event.clientX - this.#x,
					track.clientWidth,
					this.args.duration,
					getComputedStyle(track).direction ===
						'rtl',
				),
			);
		};
		grip.addEventListener('pointerdown', down);
		grip.addEventListener('pointermove', move);
		return () => {
			grip.removeEventListener('pointerdown', down);
			grip.removeEventListener('pointermove', move);
		};
	});

	#key(edge: TrimEdge, event: KeyboardEvent) {
		const at = this.args[edge];
		const by = event.shiftKey ? this.step * 10 : this.step;
		const moves: Record<string, number> = {
			ArrowLeft: at - by,
			ArrowDown: at - by,
			ArrowRight: at + by,
			ArrowUp: at + by,
			PageDown: at - this.step * 10,
			PageUp: at + this.step * 10,
			Home: 0,
			End: this.args.duration,
		};
		const to = moves[event.key];
		if (to === undefined) return;
		event.preventDefault();
		this.#move(edge, to);
	}

	keyStart = (event: KeyboardEvent) => this.#key('start', event);
	keyEnd = (event: KeyboardEvent) => this.#key('end', event);

	<template>
		<div
			class="media-trim {{if this.shows 'media-trim--on'}}"
			style={{this.style}}
			...attributes
		>
			<div class="media-trim-track">
				<div class="media-trim-strip">{{yield}}</div>
				{{#if this.shows}}
					<span
						class="media-shade media-shade--before"
					></span>
					<span
						class="media-shade media-shade--after"
					></span>
					<span class="media-trim-frame"></span>
					<span
						class="media-trim-bar media-trim-bar--start"
						aria-hidden="true"
					><IconSvg @name="chevron-left" /></span>
					<span
						class="media-trim-bar media-trim-bar--end"
						aria-hidden="true"
					><IconSvg
							@name="chevron-right"
						/></span>
					<span
						class="media-trim-grip media-trim-grip--start"
						role="slider"
						tabindex="0"
						aria-label="Start"
						aria-valuemin={{this.origin}}
						aria-valuemax={{this.startMax}}
						aria-valuenow={{this.startNow}}
						aria-valuetext={{this.startText}}
						{{this.drags "start"}}
						{{on "keydown" this.keyStart}}
					></span>
					<span
						class="media-trim-grip media-trim-grip--end"
						role="slider"
						tabindex="0"
						aria-label="End"
						aria-valuemin={{this.endMin}}
						aria-valuemax={{this.endMax}}
						aria-valuenow={{this.endNow}}
						aria-valuetext={{this.endText}}
						{{this.drags "end"}}
						{{on "keydown" this.keyEnd}}
					></span>
				{{/if}}
			</div>
		</div>
	</template>
}
