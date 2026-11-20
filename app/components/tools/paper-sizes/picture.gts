import Component from '@glimmer/component';
import { tracked } from '@glimmer/tracking';
import { on } from '@ember/modifier';
import { htmlSafe } from '@ember/template';
import { modifier } from 'ember-modifier';
import CanonFigure from 'delphicanon/components/canon-figure';
import { springEasing } from 'delphicanon/lib/motion';
import type { PaperSize } from 'delphitools-v2/components/tools/paper-sizes/data';
import {
	areaRatio,
	arrangementNames,
	arrangements,
	frames,
	ratio,
	type Arrangement,
	type Rect,
} from 'delphitools-v2/components/tools/paper-sizes/paper';

export interface PictureSignature {
	Args: {
		sizes: (PaperSize | undefined)[];
		legend: (string | undefined)[];
		arrangement?: number;
	};
	Element: HTMLButtonElement;
}

const spring = htmlSafe(`--paper-spring-easing: ${springEasing(0.82)}`);

const px = (value: number) => `${Math.round(value * 100) / 100}px`;

function box({ x, y, width, height }: Rect, opacity?: number) {
	const parts = [
		`inset-inline-start: ${px(x)}`,
		`inset-block-start: ${px(y)}`,
		`inline-size: ${px(width)}`,
		`block-size: ${px(height)}`,
	];
	if (opacity !== undefined) parts.push(`opacity: ${opacity}`);
	return htmlSafe(parts.join('; '));
}

export default class Picture extends Component<PictureSignature> {
	@tracked index = this.args.arrangement ?? 0;
	@tracked area: Rect = { x: 0, y: 0, width: 0, height: 0 };

	get arrangement(): Arrangement {
		return arrangements[this.index % arrangements.length]!;
	}

	get present() {
		return this.args.sizes.flatMap((size, slot) =>
			size ? [{ size, slot }] : [],
		);
	}

	get pair() {
		return this.present.length === 2;
	}

	get ratio() {
		const [a, b] = this.present;
		return a && b ? ratio(areaRatio(a.size, b.size)) : undefined;
	}

	get sheets() {
		if (this.area.width === 0) return [];
		const placed = frames(
			this.present.map(({ size }) => ({
				width: size.widthMM,
				height: size.heightMM,
			})),
			this.arrangement,
			this.area,
		);
		const area = (size: PaperSize) => size.widthMM * size.heightMM;
		const [first, second] = this.present;
		const firstBehind =
			!second ||
			!first ||
			area(first.size) >= area(second.size);
		const apart = this.pair && this.arrangement !== 'stacked';
		const down = this.arrangement === 'aboveBelow';
		return this.present.map(({ slot }, i) => {
			const frame = placed[i]!;
			const edge = frame.x + frame.width;
			return {
				slot: slot + 1,
				style: box(frame),
				behind: (i === 0) === firstBehind,
				across: box(
					{
						x: this.area.x,
						y: frame.y,
						width: this.area.width,
						height: 0,
					},
					apart && !down ? 0.22 : 0,
				),
				upright: box(
					{
						x: edge,
						y: this.area.y,
						width: 0,
						height: this.area.height,
					},
					apart && down ? 0.22 : 0,
				),
			};
		});
	}

	get label() {
		return [
			...this.args.legend.filter(Boolean),
			this.ratio && `${this.ratio}×`,
			this.pair &&
				arrangementNames[
					this.index % arrangements.length
				],
		]
			.filter(Boolean)
			.join(', ');
	}

	measure = modifier((element: HTMLElement) => {
		const observer = new ResizeObserver(() => {
			this.area = {
				x: element.offsetLeft,
				y: element.offsetTop,
				width: element.clientWidth,
				height: element.clientHeight,
			};
		});
		observer.observe(element);
		return () => observer.disconnect();
	});

	cycle = () => {
		if (this.pair)
			this.index = (this.index + 1) % arrangements.length;
	};

	<template>
		<button
			type="button"
			class="paper-picture"
			aria-label={{this.label}}
			data-arrangement={{this.arrangement}}
			style={{spring}}
			{{on "click" this.cycle}}
			...attributes
		>
			<span class="paper-legend" aria-hidden="true">
				{{#each @legend as |line index|}}
					{{#if line}}
						<span
							class="paper-legend-line paper-slot-{{add1
									index
								}}"
						>{{line}}</span>
					{{/if}}
				{{/each}}
			</span>
			{{#if this.ratio}}
				<CanonFigure
					class="paper-ratio"
					@text={{this.ratio}}
					@unit="×"
					@size={{34}}
					@halo="var(--canon-muted)"
				/>
			{{/if}}
			<span class="paper-area" {{this.measure}}></span>
			{{#each this.sheets key="slot" as |sheet|}}
				<span
					class="paper-guide paper-guide--across paper-slot-{{sheet.slot}}"
					style={{sheet.across}}
				></span>
				<span
					class="paper-guide paper-guide--upright paper-slot-{{sheet.slot}}"
					style={{sheet.upright}}
				></span>
			{{/each}}
			{{#each this.sheets key="slot" as |sheet|}}
				<span
					class="paper-sheet paper-slot-{{sheet.slot}}
						{{if
							sheet.behind
							'paper-sheet--behind'
						}}"
					style={{sheet.style}}
				></span>
			{{/each}}
		</button>
	</template>
}

function add1(index: number) {
	return index + 1;
}
