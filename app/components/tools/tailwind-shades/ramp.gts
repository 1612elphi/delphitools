import Component from '@glimmer/component';
import { htmlSafe } from '@ember/template';
import {
	oklch,
	parseHex,
	takesBlackInk,
	type Rgb,
} from 'delphicanon/lib/colour';
import {
	place,
	type Shade,
} from 'delphitools-v2/components/tools/tailwind-shades/shades';

interface RampSignature {
	Args: {
		shades: Shade[];
		base: Rgb;
		hex: string;
	};
}

export const rampHeight = 250;

const y = (l: number) => `${(1 - Math.min(Math.max(l, 0), 1)) * 100}%`;

export default class Ramp extends Component<RampSignature> {
	get count() {
		return this.args.shades.length;
	}

	x = (index: number) => `${((index + 0.5) / this.count) * 100}%`;

	get place() {
		return place(
			oklch(this.args.base)[0],
			this.args.shades.map((s) => s.oklch[0]),
		);
	}

	get columns() {
		const { nearest } = this.place;
		return this.args.shades.map((shade, index) => {
			const black = takesBlackInk(parseHex(shade.hex)!);
			return {
				level: shade.level,
				hex: shade.hex.toUpperCase(),
				plate: htmlSafe(
					index === nearest
						? `background: ${black ? 'black' : 'white'}; color: ${black ? 'white' : 'black'}`
						: '',
				),
				style: htmlSafe(
					`background: ${shade.hex}; color: ${black ? 'black' : 'white'}`,
				),
				dot: htmlSafe(
					`left: ${this.x(index)}; top: ${y(shade.oklch[0])}; background: ${shade.hex}`,
				),
			};
		});
	}

	get curve() {
		const count = this.count;
		return this.args.shades
			.map(
				(s, i) =>
					`${((i + 0.5) / count) * 100},${(1 - s.oklch[0]) * 100}`,
			)
			.join(' ');
	}

	get tag() {
		return `Base ≈ ${this.place.level}`;
	}

	get reading() {
		return `${this.tag}, ${this.args.hex}`;
	}

	get marker() {
		const { index } = this.place;
		const l = oklch(this.args.base)[0];
		const flips = (index + 0.5) / this.count > 0.7;
		return {
			flips,
			style: htmlSafe(
				`left: ${this.x(index)}; top: ${y(l)}; background: ${this.args.hex}`,
			),
			line: htmlSafe(`top: ${y(l)}`),
		};
	}

	<template>
		<div class="tw-ramp">
			<output
				class="tw-ramp-reading"
			>{{this.reading}}</output>
			<div class="tw-ramp-columns" aria-hidden="true">
				{{#each this.columns key="level" as |column|}}
					<div
						class="tw-ramp-column"
						style={{column.style}}
					>
						<span
							class="tw-ramp-level"
							style={{column.plate}}
						>{{column.level}}</span>
						<span
							class="tw-ramp-hex"
						>{{column.hex}}</span>
					</div>
				{{/each}}
			</div>
			<div class="tw-ramp-plot" aria-hidden="true">
				<span
					class="tw-ramp-line"
					style={{this.marker.line}}
				></span>
				<svg
					class="tw-ramp-curve"
					viewBox="0 0 100 100"
					preserveAspectRatio="none"
				>
					<polyline
						class="tw-ramp-halo"
						points={{this.curve}}
					/>
					<polyline
						class="tw-ramp-core"
						points={{this.curve}}
					/>
				</svg>
				{{#each this.columns key="level" as |column|}}
					<span
						class="tw-ramp-dot"
						style={{column.dot}}
					></span>
				{{/each}}
				<span
					class="tw-ramp-marker
						{{if
							this.marker.flips
							'tw-ramp-marker--flips'
						}}"
					style={{this.marker.style}}
				><span
						class="tw-ramp-tag"
					>{{this.tag}}</span></span>
			</div>
		</div>
	</template>
}
