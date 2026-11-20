import Component from '@glimmer/component';
import { tracked } from '@glimmer/tracking';
import { on } from '@ember/modifier';
import { htmlSafe } from '@ember/template';
import { clamp, dragSpeed, snap } from 'delphicanon/lib/number';
import drag, { type Drag } from './fx-drag';
import { fillSpan } from './fx-maths';

interface Signature {
	Args: {
		value: number;
		min: number;
		max: number;
		step: number;
		origin: number;
		stops?: string[] | null;
		fill?: string;
		readout: (v: number) => string;
		labelledBy?: string;
		label?: string;
		onChange: (v: number, dragging: boolean) => void;
		onEnd?: () => void;
	};
	Element: HTMLDivElement;
}

export default class FxColourSlider extends Component<Signature> {
	@tracked active = false;
	#dragged = 0;
	#lastX = 0;

	get span() {
		return this.args.max - this.args.min;
	}

	fraction(v: number) {
		return this.span > 0 ? (v - this.args.min) / this.span : 0;
	}

	get value() {
		return clamp(this.args.value, this.args.min, this.args.max);
	}

	get up() {
		return this.value > this.args.origin;
	}

	get style() {
		const [from, to] = fillSpan(
			this.fraction(this.args.origin),
			this.fraction(this.value),
		);
		const stops = this.args.stops;
		const track = stops
			? `--sub-cs-track: linear-gradient(to right, ${stops.join(', ')});`
			: `--sub-cs-fill: ${this.args.fill ?? 'var(--canon-primary)'};`;
		return htmlSafe(
			`${track} --sub-cs-from: ${from}; --sub-cs-to: ${to}; --sub-cs-at: ${this.fraction(this.value)}; --sub-cs-origin: ${this.fraction(this.args.origin)}`,
		);
	}

	get text() {
		return this.args.readout(this.value);
	}

	apply(raw: number, dragging: boolean) {
		const next = snap(
			raw,
			this.args.min,
			this.args.max,
			this.args.step,
		);
		if (next !== this.value) this.args.onChange(next, dragging);
	}

	track(event: PointerEvent) {
		const el = (event.currentTarget as HTMLElement).querySelector(
			'.sub-fxp-cslider-track',
		);
		return el?.getBoundingClientRect();
	}

	at(event: PointerEvent): number | undefined {
		const box = this.track(event);
		if (!box || box.width <= 0) return undefined;
		const unit = clamp(
			(event.clientX - box.left) / box.width,
			0,
			1,
		);
		return this.args.min + unit * this.span;
	}

	dragSpec: Drag = {
		axis: 'x',
		start: () => {
			this.active = true;
		},
		move: (event, first) => {
			if (first) {
				this.#dragged = this.at(event) ?? this.value;
				this.#lastX = event.clientX;
				this.apply(this.#dragged, true);
				return;
			}
			const box = (
				event.currentTarget as HTMLElement
			).getBoundingClientRect();
			const width = Math.max(
				1,
				this.track(event)?.width ?? 1,
			);
			const speed = dragSpeed(
				Math.abs(
					event.clientY -
						(box.top + box.height / 2),
				),
			);
			this.#dragged = clamp(
				this.#dragged +
					((event.clientX - this.#lastX) /
						width) *
						this.span *
						speed,
				this.args.min,
				this.args.max,
			);
			this.#lastX = event.clientX;
			this.apply(this.#dragged, true);
		},
		end: (dragged, event) => {
			this.active = false;
			if (!dragged && event) {
				const box = this.track(event);
				const inside =
					box &&
					event.clientX >= box.left &&
					event.clientX <= box.right;
				const v = inside ? this.at(event) : undefined;
				if (v !== undefined) this.apply(v, false);
			}
			this.args.onEnd?.();
		},
	};

	get keyStep() {
		const step = Math.max(this.args.step, 1e-9);
		return Math.max(step, Math.round(this.span / 20 / step) * step);
	}

	key = (event: KeyboardEvent) => {
		const next = {
			ArrowRight: this.value + this.keyStep,
			ArrowUp: this.value + this.keyStep,
			ArrowLeft: this.value - this.keyStep,
			ArrowDown: this.value - this.keyStep,
			Home: this.args.min,
			End: this.args.max,
		}[event.key];
		if (next === undefined) return;
		event.preventDefault();
		this.apply(next, false);
	};

	<template>
		<div
			class="sub-fxp-cslider
				{{if @stops 'is-gradient'}}
				{{if this.up 'is-up'}}
				{{if this.active 'is-active'}}"
			role="slider"
			tabindex="0"
			aria-labelledby={{@labelledBy}}
			aria-label={{@label}}
			aria-valuemin={{@min}}
			aria-valuemax={{@max}}
			aria-valuenow={{this.value}}
			aria-valuetext={{this.text}}
			style={{this.style}}
			...attributes
			{{on "keydown" this.key}}
			{{drag this.dragSpec}}
		>
			<div class="sub-fxp-cslider-track">
				<span class="sub-fxp-cslider-span"></span>
				<span class="sub-fxp-cslider-zero"></span>
				<span class="sub-fxp-cslider-marker"></span>
			</div>
			<div
				class="sub-fxp-cslider-readout"
				aria-hidden="true"
			>{{this.text}}</div>
		</div>
	</template>
}
