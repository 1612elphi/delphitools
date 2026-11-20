import Component from '@glimmer/component';
import { tracked } from '@glimmer/tracking';
import { guidFor } from '@ember/object/internals';
import { htmlSafe } from '@ember/template';
import { modifier } from 'ember-modifier';
import CanonFigure from 'delphicanon/components/canon-figure';
import {
	draw,
	innerArea,
	instrumentWidth,
	isStrip,
} from 'delphitools-v2/components/tools/unit-converter/draw';
import {
	convert,
	format,
	pose,
	easeOutCubic,
	type Instrument,
	type Pose,
	type Unit,
} from 'delphitools-v2/components/tools/unit-converter/units';

interface PictureSignature {
	Args: {
		instrument: Instrument;
		value?: number;
		from: Unit;
		to: Unit;
	};
}

export const pictureHeight = 204;
const settleMs = 600;

const observe = modifier(
	(element: HTMLElement, [report]: [(box: DOMRect) => void]) => {
		const observer = new ResizeObserver(() =>
			report(element.getBoundingClientRect()),
		);
		observer.observe(element);
		return () => observer.disconnect();
	},
);

function still() {
	return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

export default class Picture extends Component<PictureSignature> {
	@tracked size = { width: 0, height: 0 };
	@tracked readoutSize = { width: 0, height: 0 };
	@tracked shown?: Pose;
	id = guidFor(this);
	#frame = 0;
	#shownFor?: Instrument;
	#target?: string;

	willDestroy() {
		super.willDestroy();
		cancelAnimationFrame(this.#frame);
	}

	get target() {
		const { instrument, value, from, to } = this.args;
		return pose(instrument, value ?? 0, from, to);
	}

	get result() {
		const { value, from, to } = this.args;
		return value === undefined
			? undefined
			: convert(value, from, to);
	}

	get input() {
		const { value, from } = this.args;
		return value === undefined
			? { text: '—', unit: '' }
			: { text: format(value), unit: ` ${from.symbol}` };
	}

	get figure() {
		const { result } = this;
		return result === undefined
			? { text: '—', unit: '' }
			: {
					text: format(result),
					unit: ` ${this.args.to.symbol}`,
				};
	}

	get readout() {
		const { width, height } = this.readoutSize;
		return { x: this.size.width - 16 - width, y: 6, width, height };
	}

	get readoutStyle() {
		const { instrument } = this.args;
		const area = innerArea(this.size.width, this.size.height);
		const lead =
			isStrip(instrument) || instrument === 'balance'
				? 16
				: 16 + instrumentWidth(instrument, area) + 12;
		return htmlSafe(`inset-inline-start: ${lead}px`);
	}

	get svg() {
		const { width, height } = this.size;
		if (!width || !height) return htmlSafe('');
		return htmlSafe(
			draw({
				width,
				height,
				instrument: this.args.instrument,
				from: this.args.from,
				to: this.args.to,
				hasValue: this.args.value !== undefined,
				shown: this.shown ?? this.target,
				readout: this.readout,
				id: this.id,
			}),
		);
	}

	settle = modifier(() => {
		const target = this.target;
		const key = JSON.stringify(target);
		if (key === this.#target) return;
		this.#target = key;
		cancelAnimationFrame(this.#frame);
		const start = this.shown;
		const same = this.#shownFor === this.args.instrument;
		this.#shownFor = this.args.instrument;
		if (!start || !same || still()) {
			this.#frame = requestAnimationFrame(
				() => (this.shown = target),
			);
			return;
		}
		const began = performance.now();
		const step = (now: number) => {
			const progress = Math.min(1, (now - began) / settleMs);
			const eased = easeOutCubic(progress);
			this.shown = {
				value:
					start.value +
					(target.value - start.value) * eased,
				lo: start.lo + (target.lo - start.lo) * eased,
				span: Math.exp(
					Math.log(start.span) +
						(Math.log(target.span) -
							Math.log(start.span)) *
							eased,
				),
			};
			if (progress < 1)
				this.#frame = requestAnimationFrame(step);
		};
		this.#frame = requestAnimationFrame(step);
	});

	measure = (box: DOMRect) => {
		if (
			box.width !== this.size.width ||
			box.height !== this.size.height
		)
			this.size = { width: box.width, height: box.height };
	};

	measureReadout = (box: DOMRect) => {
		const { width, height } = box;
		if (
			width !== this.readoutSize.width ||
			height !== this.readoutSize.height
		)
			this.readoutSize = { width, height };
	};

	<template>
		<div
			class="uc-picture"
			{{observe this.measure}}
			{{this.settle @instrument @value @from @to}}
		>
			<svg
				class="uc-drawing"
				width={{this.size.width}}
				height={{this.size.height}}
				aria-hidden="true"
			>{{this.svg}}</svg>
			<div
				class="uc-readout"
				style={{this.readoutStyle}}
				{{observe this.measureReadout}}
			>
				<CanonFigure
					class="uc-input"
					@text={{this.input.text}}
					@unit={{this.input.unit}}
					@size={{18}}
					@colour="var(--canon-muted-foreground)"
					@halo="var(--canon-card)"
				/>
				<CanonFigure
					class="uc-result"
					@text={{this.figure.text}}
					@unit={{this.figure.unit}}
					@size={{38}}
					@halo="var(--canon-card)"
				/>
			</div>
		</div>
	</template>
}
