import Component from '@glimmer/component';
import { tracked } from '@glimmer/tracking';
import { on } from '@ember/modifier';
import { modifier } from 'ember-modifier';
import { clamp, dragSpeed, snap } from 'delphicanon/lib/number';
import type { SliderParam } from 'delphitools-v2/lib/substrata/param-spec';
import drag, { type Drag } from './fx-drag';
import {
	commit,
	numberOf,
	preview,
	resetOnDouble,
	specOf,
	write,
	type FxContext,
} from './fx-context';
import { formatValue, hueBand, rotation, signed } from './fx-maths';

const paint = modifier((canvas: HTMLCanvasElement, [deg]: [number]) => {
	canvas.getContext('2d')?.putImageData(
		new ImageData(hueBand(deg), 256, 1),
		0,
		0,
	);
});

export default class FxHue extends Component<{ Args: { ctx: FxContext } }> {
	@tracked active = false;
	#dragged = 0;
	#lastX = 0;

	get spec() {
		return specOf(this.args.ctx, 'angle') as SliderParam;
	}

	get angle() {
		return numberOf(this.args.ctx, 'angle');
	}

	get text() {
		return signed(formatValue(this.angle, this.spec), this.angle);
	}

	get reset() {
		return resetOnDouble(this.args.ctx, 'angle');
	}

	apply(raw: number, dragging: boolean) {
		const next = snap(
			raw,
			this.spec.min,
			this.spec.max,
			this.spec.step,
		);
		if (next === this.angle) return;
		if (dragging) preview(this.args.ctx, { angle: next });
		else write(this.args.ctx, { angle: next });
	}

	dragSpec: Drag = {
		axis: 'x',
		start: () => {
			this.active = true;
		},
		move: (event, first) => {
			if (first) {
				this.#dragged = this.angle;
				this.#lastX = event.clientX;
				return;
			}
			const el = event.currentTarget as HTMLElement;
			const box = el.getBoundingClientRect();
			const band =
				el.querySelector('canvas')?.clientWidth ?? 1;
			const speed = dragSpeed(
				Math.abs(
					event.clientY -
						(box.top + box.height / 2),
				),
			);
			this.#dragged = clamp(
				rotation(
					this.#dragged,
					(event.clientX - this.#lastX) * speed,
					band,
				),
				this.spec.min,
				this.spec.max,
			);
			this.#lastX = event.clientX;
			this.apply(this.#dragged, true);
		},
		end: () => {
			this.active = false;
			commit();
		},
	};

	key = (event: KeyboardEvent) => {
		const next = {
			ArrowRight: this.angle + 15,
			ArrowUp: this.angle + 15,
			ArrowLeft: this.angle - 15,
			ArrowDown: this.angle - 15,
			Home: this.spec.min,
			End: this.spec.max,
		}[event.key];
		if (next === undefined) return;
		event.preventDefault();
		this.apply(next, false);
	};

	willDestroy() {
		super.willDestroy();
		commit();
	}

	<template>
		<div
			class="sub-fxp-hue {{if this.active 'is-active'}}"
			data-fx-param="angle"
			{{drag this.dragSpec}}
		>
			<div class="sub-fxp-hue-bands">
				<canvas
					width="256"
					height="1"
					{{paint 0}}
				></canvas>
				<canvas
					width="256"
					height="1"
					{{paint this.angle}}
				></canvas>
				<span class="sub-fxp-hue-seam"></span>
			</div>
			<div
				class="sub-fxp-hue-readout"
				aria-hidden="true"
			>{{this.text}}</div>
			<span
				class="sub-fxp-cover"
				role="slider"
				tabindex="0"
				aria-label={{@ctx.def.label}}
				aria-valuemin={{this.spec.min}}
				aria-valuemax={{this.spec.max}}
				aria-valuenow={{this.angle}}
				aria-valuetext={{this.text}}
				{{on "keydown" this.key}}
				{{on "dblclick" this.reset}}
			></span>
		</div>
	</template>
}
