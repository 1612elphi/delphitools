import type Owner from '@ember/owner';
import Component from '@glimmer/component';
import { tracked } from '@glimmer/tracking';
import { fn } from '@ember/helper';
import { on } from '@ember/modifier';
import { htmlSafe } from '@ember/template';
import { modifier } from 'ember-modifier';
import { fromHsb, hsb } from 'delphicanon/lib/colour';
import {
	hexOf,
	wheelHue,
	type RingColour,
} from 'delphitools-v2/lib/substrata/colour-ring/model';

interface Signature {
	Args: {
		colour: RingColour;
		onChange: (colour: RingColour, final: boolean) => void;
	};
	Element: HTMLDivElement;
}

export const WHEEL_SIDE = 248;
const BAND = 26;
const CHIP = 32;
const OUTER = WHEEL_SIDE / 2 - 12;
const INNER = OUTER - BAND;
const HALF = (INNER - 8) / Math.SQRT2;
const CENTRE = WHEEL_SIDE / 2;
const SQUARE = { x: CENTRE - HALF, y: CENTRE - HALF, side: HALF * 2 };

type Part = 'ring' | 'square';
type Channel = 'hue' | 'saturation' | 'brightness';

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
const px = (v: number) => `${v.toFixed(2)}px`;

export default class HueWheel extends Component<Signature> {
	@tracked hue = 0;
	@tracked saturation = 1;
	@tracked brightness = 1;
	@tracked dragging: Part | null = null;
	alphaKept = 1;
	before: RingColour;

	constructor(owner: Owner, args: Signature['Args']) {
		super(owner, args);
		this.before = args.colour;
		this.show(args.colour);
	}

	show(colour: RingColour) {
		const [h, s, b] = hsb([colour.r, colour.g, colour.b]);
		if (s > 0) this.hue = h / 360;
		this.saturation = s;
		this.brightness = b;
		this.alphaKept = colour.alpha;
	}

	get colour(): RingColour {
		const [r, g, b] = fromHsb(
			this.hue * 360,
			this.saturation,
			this.brightness,
		);
		return { r, g, b, alpha: this.alphaKept };
	}

	get pure() {
		const [r, g, b] = fromHsb(this.hue * 360, 1, 1);
		return hexOf({ r, g, b, alpha: 1 });
	}

	get style() {
		const t = this.hue * 2 * Math.PI;
		const middle = (OUTER + INNER) / 2;
		const grow = this.dragging ? 1.25 : 1;
		return htmlSafe(
			[
				`--sub-hw-pure: ${this.pure}`,
				`--sub-hw-now: ${hexOf(this.colour, false)}`,
				`--sub-hw-then: ${hexOf(this.before, false)}`,
				`--sub-hw-hue-x: ${px(CENTRE + Math.sin(t) * middle)}`,
				`--sub-hw-hue-y: ${px(CENTRE - Math.cos(t) * middle)}`,
				`--sub-hw-point-x: ${px(SQUARE.x + this.saturation * SQUARE.side)}`,
				`--sub-hw-point-y: ${px(SQUARE.y + (1 - this.brightness) * SQUARE.side)}`,
				`--sub-hw-grow: ${grow}`,
				`--sub-hw-square: ${px(SQUARE.side)}`,
				`--sub-hw-square-at: ${px(SQUARE.x)}`,
				`--sub-hw-inner: ${px(INNER)}`,
				`--sub-hw-outer: ${px(OUTER)}`,
				`--sub-hw-chip: ${px(CHIP)}`,
			].join('; '),
		);
	}

	get hexText() {
		return hexOf(this.colour, false).toUpperCase();
	}

	percent = (v: number) => `${Math.round(v * 100)} %`;

	#move(x: number, y: number) {
		if (this.dragging === 'ring')
			this.hue = wheelHue(x - CENTRE, y - CENTRE);
		else if (this.dragging === 'square') {
			this.saturation = clamp01((x - SQUARE.x) / SQUARE.side);
			this.brightness = clamp01(
				(SQUARE.y + SQUARE.side - y) / SQUARE.side,
			);
		} else return;
		this.args.onChange(this.colour, false);
	}

	pointer = modifier((wheel: HTMLElement) => {
		let id: number | null = null;
		const local = (e: PointerEvent) => {
			const box = wheel.getBoundingClientRect();
			return {
				x:
					((e.clientX - box.left) * WHEEL_SIDE) /
					box.width,
				y:
					((e.clientY - box.top) * WHEEL_SIDE) /
					box.height,
			};
		};
		const down = (e: PointerEvent) => {
			if (e.button !== 0) return;
			const { x, y } = local(e);
			if (
				x <= 10 + CHIP + 6 &&
				y <= 10 + CHIP + 6 &&
				x >= 4 &&
				y >= 4
			) {
				const kept = this.before;
				this.show(kept);
				this.args.onChange(kept, true);
				return;
			}
			const r = Math.hypot(x - CENTRE, y - CENTRE);
			const inSquare =
				x >= SQUARE.x - 10 &&
				x <= SQUARE.x + SQUARE.side + 10 &&
				y >= SQUARE.y - 10 &&
				y <= SQUARE.y + SQUARE.side + 10;
			this.dragging = inSquare
				? 'square'
				: r >= INNER - 10 && r <= OUTER + 12
					? 'ring'
					: null;
			if (!this.dragging) return;
			id = e.pointerId;
			wheel.setPointerCapture(id);
			e.preventDefault();
			this.#move(x, y);
		};
		const move = (e: PointerEvent) => {
			if (e.pointerId !== id) return;
			const { x, y } = local(e);
			this.#move(x, y);
		};
		const up = (e: PointerEvent) => {
			if (e.pointerId !== id) return;
			id = null;
			if (this.dragging)
				this.args.onChange(this.colour, true);
			this.dragging = null;
		};
		wheel.addEventListener('pointerdown', down);
		wheel.addEventListener('pointermove', move);
		wheel.addEventListener('pointerup', up);
		wheel.addEventListener('pointercancel', up);
		return () => {
			wheel.removeEventListener('pointerdown', down);
			wheel.removeEventListener('pointermove', move);
			wheel.removeEventListener('pointerup', up);
			wheel.removeEventListener('pointercancel', up);
		};
	});

	key = (channel: Channel, e: KeyboardEvent) => {
		const step = {
			ArrowUp: 0.05,
			ArrowRight: 0.05,
			ArrowDown: -0.05,
			ArrowLeft: -0.05,
		}[e.key];
		if (step === undefined) return;
		e.preventDefault();
		if (channel === 'hue') this.hue = (this.hue + step + 1) % 1;
		else if (channel === 'saturation')
			this.saturation = clamp01(this.saturation + step);
		else this.brightness = clamp01(this.brightness + step);
		this.args.onChange(this.colour, true);
	};

	<template>
		<div
			class="sub-hw {{if this.dragging 'is-dragging'}}"
			role="group"
			aria-label="Colour Wheel"
			style={{this.style}}
			...attributes
			{{this.pointer}}
		>
			<span class="sub-hw-ring"></span>
			<span class="sub-hw-square"></span>
			<span class="sub-hw-chip"></span>
			<span class="sub-hw-mark is-hue"></span>
			<span class="sub-hw-mark is-point"></span>
			<span
				class="sub-hw-hex"
				aria-hidden="true"
			>{{this.hexText}}</span>
			<span
				class="sub-hw-a11y"
				role="slider"
				tabindex="0"
				aria-label="Hue"
				aria-valuemin="0"
				aria-valuemax="1"
				aria-valuenow={{this.hue}}
				aria-valuetext={{this.percent this.hue}}
				{{on "keydown" (fn this.key "hue")}}
			></span>
			<span
				class="sub-hw-a11y"
				role="slider"
				tabindex="0"
				aria-label="Saturation"
				aria-valuemin="0"
				aria-valuemax="1"
				aria-valuenow={{this.saturation}}
				aria-valuetext={{this.percent this.saturation}}
				{{on "keydown" (fn this.key "saturation")}}
			></span>
			<span
				class="sub-hw-a11y"
				role="slider"
				tabindex="0"
				aria-label="Brightness"
				aria-valuemin="0"
				aria-valuemax="1"
				aria-valuenow={{this.brightness}}
				aria-valuetext={{this.percent this.brightness}}
				{{on "keydown" (fn this.key "brightness")}}
			></span>
		</div>
	</template>
}
