import Component from '@glimmer/component';
import { tracked } from '@glimmer/tracking';
import { modifier } from 'ember-modifier';
import { reducedMotion } from 'delphicanon/lib/motion';
import {
	UNITS,
	formatValue,
	niceStep,
	span,
	subdivisions,
	type Unit,
} from 'delphitools-v2/components/tools/typo-calc/units';

const scales: Unit[] = ['px', 'pt', 'pc', 'ag', 'cc', 'mm', 'in', 'em'];
const rowHeight = 22;
const labelWidth = 36;
const padding = 16;
const top = 12;
const settleMs = 200;

export const gaugeHeight = rowHeight * scales.length + padding + 12;

interface Pose {
	px: number;
	span: number;
}

export interface GaugeSignature {
	Args: { px: number; base: number; ppi: number; unit: Unit };
	Element: HTMLDivElement;
}

let context: CanvasRenderingContext2D | null | undefined;
function measure(text: string, font: string): number {
	context ??= document.createElement('canvas').getContext('2d');
	if (!context) return text.length * 7;
	context.font = font;
	return context.measureText(text).width;
}

export default class Gauge extends Component<GaugeSignature> {
	@tracked width = 0;
	@tracked tick = 0;
	mono = 'monospace';

	#from?: Pose;
	#to?: Pose;
	#started = 0;
	#frame = 0;

	#at(now: number): Pose {
		const to = this.#to!;
		const from = this.#from;
		const progress = Math.min(1, (now - this.#started) / settleMs);
		if (!from || progress >= 1) return to;
		const eased = 1 - (1 - progress) ** 3;
		const shownSpan = from.span * (to.span / from.span) ** eased;
		const fromAt = from.px / from.span;
		const toAt = to.px / to.span;
		return {
			px: shownSpan * (fromAt + (toAt - fromAt) * eased),
			span: shownSpan,
		};
	}

	#step = () => {
		this.tick++;
		if (performance.now() - this.#started < settleMs)
			this.#frame = requestAnimationFrame(this.#step);
	};

	#retarget(to: Pose, now: number) {
		this.#from =
			this.#to && !reducedMotion()
				? this.#at(now)
				: undefined;
		this.#to = to;
		this.#started = now;
		cancelAnimationFrame(this.#frame);
		if (this.#from) this.#frame = requestAnimationFrame(this.#step);
	}

	get shown(): Pose {
		void this.tick;
		const now = performance.now();
		const to = {
			px: Math.max(0, this.args.px),
			span: span(this.args.px),
		};
		if (to.px !== this.#to?.px) this.#retarget(to, now);
		return this.#at(now);
	}

	willDestroy() {
		super.willDestroy();
		cancelAnimationFrame(this.#frame);
	}

	get input(): Unit {
		const { unit } = this.args;
		return unit === 'cm' ? 'mm' : unit === 'rem' ? 'em' : unit;
	}

	reading(px: number, unit: Unit) {
		const { base, ppi } = this.args;
		return `${formatValue(UNITS[unit].fromPx(px, base, ppi))} ${unit}`;
	}

	get label() {
		return scales
			.map((unit) => this.reading(this.args.px, unit))
			.join(', ');
	}

	get frame() {
		const { width } = this;
		const { shown } = this;
		const zero = padding + labelWidth + 8;
		const length = width - padding - zero;
		if (length <= 0 || !(shown.span > 0)) return undefined;
		const scale = length / shown.span;
		const cursor = zero + shown.px * scale;
		const end = width - padding + 0.5;
		const readingFont = `600 12px ${this.mono}`;
		const tickFont = `9px ${this.mono}`;
		const readings = scales.map((unit) =>
			this.reading(shown.px, unit),
		);
		const widest = Math.max(
			...readings.map((text) => measure(text, readingFont)),
		);
		const flips = cursor + 4 + widest + 6 > width - padding;
		const { base, ppi } = this.args;

		const rows = scales.map((unit, index) => {
			const y = top + index * rowHeight;
			const bottom = y + rowHeight;
			const perUnit = UNITS[unit].toPx(1, base, ppi) * scale;
			const major = niceStep(44 / perUnit);
			const minor = major / subdivisions(major);
			const ticks =
				Number.isFinite(major * perUnit) &&
				major * perUnit > 1;
			let minorPath = '';
			if (ticks && minor * perUnit >= 4)
				for (
					let v = 0;
					zero + v * perUnit <= end;
					v += minor
				)
					minorPath += `M${(zero + v * perUnit).toFixed(2)} ${bottom - 5}v5`;
			let majorPath = '';
			const numbers: { x: number; text: string }[] = [];
			if (ticks)
				for (
					let v = 0;
					zero + v * perUnit <= end;
					v += major
				) {
					const x = zero + v * perUnit;
					majorPath += `M${x.toFixed(2)} ${bottom - 11}v11`;
					const text = formatValue(v);
					if (
						x +
							2 +
							measure(
								text,
								tickFont,
							) <=
						width
					)
						numbers.push({
							x: x + 2,
							text,
						});
				}
			const text = readings[index]!;
			const size = measure(text, readingFont);
			const boxX = flips ? cursor - size - 10 : cursor + 2;
			return {
				unit,
				input: unit === this.input,
				y,
				bottom,
				plateY: y + 2,
				plateHeight: rowHeight - 4,
				symbolX: padding + labelWidth / 2,
				symbolY: y + rowHeight / 2,
				minorPath,
				majorPath,
				numbers,
				numberY: y + 10,
				box: {
					x: boxX,
					y: y + 2,
					width: size + 8,
					height: rowHeight - 5,
				},
				textX: boxX + 4,
				textY: y + 2 + (rowHeight - 5) / 2,
				text,
			};
		});
		return {
			zero,
			shade: Math.max(0, cursor - zero),
			rowsHeight: rowHeight * scales.length,
			cursorX: cursor - 1,
			rows,
		};
	}

	get viewBox() {
		return `0 0 ${this.width} ${gaugeHeight}`;
	}

	track = modifier((element: HTMLElement) => {
		this.mono =
			getComputedStyle(element)
				.getPropertyValue('--canon-mono-font')
				.trim() || 'monospace';
		const observer = new ResizeObserver(([entry]) => {
			this.width = entry?.contentRect.width ?? 0;
		});
		observer.observe(element);
		return () => observer.disconnect();
	});

	<template>
		<div class="typo-gauge" {{this.track}} ...attributes>
			<svg
				class="typo-gauge-svg"
				viewBox={{this.viewBox}}
				role="img"
				aria-label={{this.label}}
			>
				{{#let this.frame as |f|}}
					{{#if f}}
						<rect
							class="typo-gauge-shade"
							x={{f.zero}}
							y={{top}}
							width={{f.shade}}
							height={{f.rowsHeight}}
						/>
						{{#each
							f.rows key="unit"
							as |row|
						}}
							<g
								class="typo-gauge-row
									{{if
										row.input
										'typo-gauge-row--input'
									}}"
							>
								<rect
									class="typo-gauge-rule"
									x="0"
									y={{row.bottom}}
									width={{this.width}}
									height="1"
									transform="translate(0 -1)"
								/>
								<rect
									class="typo-gauge-plate"
									x={{padding}}
									y={{row.plateY}}
									width={{labelWidth}}
									height={{row.plateHeight}}
								/>
								<text
									class="typo-gauge-symbol"
									x={{row.symbolX}}
									y={{row.symbolY}}
								>{{row.unit}}</text>
								<path
									class="typo-gauge-ticks"
									d={{row.minorPath}}
								/>
								<path
									class="typo-gauge-ticks"
									d={{row.majorPath}}
								/>
								{{#each
									row.numbers
									as |n|
								}}
									<text
										class="typo-gauge-number"
										x={{n.x}}
										y={{row.numberY}}
									>{{n.text}}</text>
								{{/each}}
								<rect
									class="typo-gauge-box"
									x={{row.box.x}}
									y={{row.box.y}}
									width={{row.box.width}}
									height={{row.box.height}}
								/>
								<text
									class="typo-gauge-reading"
									x={{row.textX}}
									y={{row.textY}}
								>{{row.text}}</text>
							</g>
						{{/each}}
						<rect
							class="typo-gauge-cursor"
							x={{f.cursorX}}
							y={{cursorTop}}
							width="2"
							height={{cursorHeight
								f.rowsHeight
							}}
						/>
					{{/if}}
				{{/let}}
			</svg>
		</div>
	</template>
}

const cursorTop = top - 4;

function cursorHeight(rows: number) {
	return rows + 4;
}
