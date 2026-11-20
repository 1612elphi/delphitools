import Component from '@glimmer/component';
import { tracked } from '@glimmer/tracking';
import { guidFor } from '@ember/object/internals';
import { htmlSafe } from '@ember/template';
import type Owner from '@ember/owner';
import { modifier } from 'ember-modifier';
import CanonFigure from 'delphicanon/components/canon-figure';
import { loadLand } from 'delphitools-v2/lib/world-map';
import {
	draw,
	pose,
	reach,
	type Pose,
	type Scene,
} from 'delphitools-v2/components/tools/time-calc/draw';
import {
	breakdown,
	difference,
	offsetSeconds,
	signed,
	span as largestUnit,
} from 'delphitools-v2/components/tools/time-calc/time';

interface PictureSignature {
	Args: {
		scene: Scene;
		now: Date;
		onWidth: (width: number) => void;
	};
}

const settleMs = 600;

let context: CanvasRenderingContext2D | null | undefined;

function still() {
	return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

const observe = modifier(
	(element: HTMLElement, [report]: [(box: DOMRect) => void]) => {
		const observer = new ResizeObserver(() =>
			report(element.getBoundingClientRect()),
		);
		observer.observe(element);
		return () => observer.disconnect();
	},
);

export default class Picture extends Component<PictureSignature> {
	@tracked size = { width: 0, height: 0 };
	@tracked shown?: Pose;
	@tracked land = '';
	id = guidFor(this);
	fonts = { sans: 'sans-serif', mono: 'monospace' };
	#frame = 0;
	#kind?: Scene['kind'];
	#target?: string;

	constructor(owner: Owner, args: PictureSignature['Args']) {
		super(owner, args);
		void loadLand().then((path) => {
			if (!this.isDestroying) this.land = path;
		});
	}

	willDestroy() {
		super.willDestroy();
		cancelAnimationFrame(this.#frame);
	}

	get target() {
		return pose(this.args.scene, this.args.now);
	}

	measure = (
		value: string,
		size: number,
		weight: number,
		isMono = false,
	) => {
		context ??= document.createElement('canvas').getContext('2d');
		if (!context) return value.length * size * 0.55;
		context.font = `${weight} ${size}px ${isMono ? this.fonts.mono : this.fonts.sans}`;
		return context.measureText(value).width;
	};

	get svg() {
		const { width, height } = this.size;
		if (!width || !height) return htmlSafe('');
		const { target } = this;
		return htmlSafe(
			draw({
				width,
				height,
				windowHeight: window.innerHeight,
				scene: this.args.scene,
				shown: this.shown ?? target,
				target,
				now: this.args.now,
				measure: this.measure,
				land: this.land,
				id: this.id,
			}),
		);
	}

	get figure(): { number?: string; unit: string; note?: string } {
		const { scene, now } = this.args;
		if (scene.kind === 'epoch') {
			const { date } = scene;
			if (!date || Math.abs(date.getTime() / 1000) >= reach)
				return { unit: '' };
			const distance =
				(date.getTime() - now.getTime()) / 1000;
			const [number, unit] = largestUnit(Math.abs(distance));
			const note =
				Math.abs(distance) < 1
					? 'Now'
					: distance < 0
						? 'ago'
						: 'from now';
			return { number, unit, note };
		}
		if (scene.kind === 'span') {
			if (scene.blank) return { unit: '' };
			const distance =
				(scene.b.getTime() - scene.a.getTime()) / 1000;
			const parts = difference(scene.a, scene.b);
			const values = [
				parts.days,
				parts.hours,
				parts.minutes,
				parts.seconds,
			];
			const found = values.findIndex((value) => value > 0);
			const first = found < 0 ? 3 : found;
			const unit = ['d', 'h', 'm', 's'][first]!;
			const number =
				(distance <= -1 ? '−' : '') +
				values[first]!.toLocaleString();
			const exact = breakdown(parts);
			const lead = `${values[first]!.toLocaleString()}${unit}`;
			return {
				number,
				unit,
				note: exact === lead ? undefined : exact,
			};
		}
		const { instant, from, to } = scene;
		return {
			number: signed(
				offsetSeconds(instant, to) -
					offsetSeconds(instant, from),
			),
			unit: 'h',
		};
	}

	get name() {
		const { kind } = this.args.scene;
		return kind === 'epoch'
			? 'Timestamp'
			: kind === 'span'
				? 'Difference'
				: 'Offset';
	}

	get label() {
		const { number, unit, note } = this.figure;
		return number === undefined
			? this.name
			: [this.name, number + unit, note]
					.filter(Boolean)
					.join(' ');
	}

	settle = modifier((element: HTMLElement) => {
		const target = this.target;
		const key = JSON.stringify(target);
		const kind = this.args.scene.kind;
		const turned = kind !== this.#kind;
		this.#kind = kind;
		if (turned && this.shown && !still())
			for (const layer of element.querySelectorAll(
				'.tc-drawing, .tc-readout',
			))
				layer.animate(
					{ opacity: [0, 1] },
					{ duration: 250, easing: 'ease-out' },
				);
		if (key === this.#target) return;
		this.#target = key;
		cancelAnimationFrame(this.#frame);
		const start = this.shown;
		const ticked =
			start && start.a === target.a && start.b === target.b;
		if (!start || turned || ticked || still()) {
			this.#frame = requestAnimationFrame(
				() => (this.shown = target),
			);
			return;
		}
		const began = performance.now();
		const step = (now: number) => {
			const progress = Math.min(1, (now - began) / settleMs);
			const eased =
				progress === 1
					? 1
					: 1 -
						Math.exp(-7 * progress) *
							Math.cos(9 * progress);
			const mix = (a: number, b: number) =>
				a + (b - a) * eased;
			const from = Math.log(Math.max(start.hi - start.lo, 1));
			const to = Math.log(Math.max(target.hi - target.lo, 1));
			const width = Math.exp(
				from + (to - from) * Math.min(1, eased),
			);
			const centre = mix(
				(start.lo + start.hi) / 2,
				(target.lo + target.hi) / 2,
			);
			this.shown =
				progress === 1
					? target
					: {
							lo: centre - width / 2,
							hi: centre + width / 2,
							a: mix(
								start.a,
								target.a,
							),
							b: mix(
								start.b,
								target.b,
							),
						};
			if (progress < 1)
				this.#frame = requestAnimationFrame(step);
		};
		this.#frame = requestAnimationFrame(step);
	});

	resize = (box: DOMRect) => {
		if (
			box.width === this.size.width &&
			box.height === this.size.height
		)
			return;
		const style = getComputedStyle(document.documentElement);
		this.fonts = {
			sans:
				style.getPropertyValue('--canon-font') ||
				'sans-serif',
			mono:
				style.getPropertyValue('--canon-mono-font') ||
				'monospace',
		};
		this.size = { width: box.width, height: box.height };
		this.args.onWidth(box.width);
	};

	<template>
		<div
			class="tc-picture"
			{{observe this.resize}}
			{{this.settle @scene @now}}
		>
			<span
				class="tc-picture-label"
				role="img"
				aria-label={{this.label}}
			></span>
			<svg
				class="tc-drawing"
				width={{this.size.width}}
				height={{this.size.height}}
				aria-hidden="true"
			>{{this.svg}}</svg>
			<div class="tc-readout" aria-hidden="true">
				{{#if this.figure.number}}
					<CanonFigure
						class="tc-figure"
						@text={{this.figure.number}}
						@unit={{this.figure.unit}}
						@size={{30}}
						@halo="var(--canon-card)"
					/>
				{{/if}}
				{{#if this.figure.note}}
					<span
						class="tc-word"
					>{{this.figure.note}}</span>
				{{/if}}
			</div>
		</div>
	</template>
}
