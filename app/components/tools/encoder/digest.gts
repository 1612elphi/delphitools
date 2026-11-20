import Component from '@glimmer/component';
import { tracked } from '@glimmer/tracking';
import { htmlSafe } from '@ember/template';
import { modifier } from 'ember-modifier';
import CanonFigure from 'delphicanon/components/canon-figure';
import { digestGrid } from 'delphitools-v2/components/tools/encoder/engine';

interface DigestSignature {
	Args: {
		name: string;
		bits: number;
		bytes?: Uint8Array;
		flipped?: number;
	};
}

const header = 44;
const padding = 16;
const flipMs = 320;
const staggerMs = 6;

const observe = modifier(
	(element: HTMLElement, [report]: [(w: number, h: number) => void]) => {
		const observer = new ResizeObserver(() =>
			report(element.clientWidth, element.clientHeight),
		);
		observer.observe(element);
		return () => observer.disconnect();
	},
);

const shown = new WeakMap<HTMLElement, string>();

const turn = modifier(
	(element: HTMLElement, [face, index]: [string, number]) => {
		const before = shown.get(element);
		shown.set(element, face);
		if (before === undefined || before === face) return;
		const [name] = before.split(':');
		if (!face.startsWith(`${name}:`) || before.endsWith(':'))
			return;
		if (
			window.matchMedia('(prefers-reduced-motion: reduce)')
				.matches
		)
			return;
		element.animate(
			[
				{ transform: 'scaleY(1)' },
				{ transform: 'scaleY(0.02)', offset: 0.5 },
				{ transform: 'scaleY(1)' },
			],
			{
				duration: flipMs,
				delay: index * staggerMs,
				easing: 'linear',
			},
		);
	},
);

export default class Digest extends Component<DigestSignature> {
	@tracked area = { width: 0, height: 0 };

	get caption() {
		return `${this.args.name} · ${this.args.bits} bits`;
	}

	get count() {
		return this.args.bits / 4;
	}

	get grid() {
		const { width, height } = this.area;
		return digestGrid(this.count, width, height);
	}

	get style() {
		const { columns, width, height } = this.grid;
		const font = Math.min(height * 0.62, width * 0.8, 17);
		return htmlSafe(
			`grid-template-columns: repeat(${columns}, ${width}px); grid-auto-rows: ${height}px; font-size: ${font}px`,
		);
	}

	get cells() {
		const { bytes, name } = this.args;
		return Array.from({ length: this.count }, (_, index) => {
			const byte = bytes?.[index >> 1];
			if (byte === undefined)
				return {
					index,
					digit: '',
					face: `${name}:`,
					style: undefined,
				};
			const value = index % 2 ? byte & 0xf : byte >> 4;
			return {
				index,
				digit: value.toString(16),
				face: `${name}:${value}`,
				style: htmlSafe(
					`background: color-mix(in srgb, var(--canon-primary) ${(6 + (50 * value) / 15).toFixed(1)}%, transparent)`,
				),
			};
		});
	}

	measured = (width: number, height: number) => {
		const area = {
			width: Math.max(0, width - padding * 2),
			height: Math.max(0, height - header - padding * 0.75),
		};
		if (
			area.width !== this.area.width ||
			area.height !== this.area.height
		)
			this.area = area;
	};

	<template>
		<figure
			class="enc-digest"
			aria-label={{@name}}
			{{observe this.measured}}
		>
			<div class="enc-digest-head">
				<span
					class="enc-digest-caption"
				>{{this.caption}}</span>
				{{#if @flipped}}
					<CanonFigure
						@text="{{@flipped}}"
						@unit="bits changed"
						@size={{24}}
					/>
				{{/if}}
			</div>
			<div class="enc-digest-grid" style={{this.style}}>
				{{#each this.cells as |cell|}}
					<span
						class="enc-digit
							{{unless
								cell.digit
								'enc-digit--empty'
							}}"
						style={{cell.style}}
						{{turn cell.face cell.index}}
					>{{cell.digit}}</span>
				{{/each}}
			</div>
		</figure>
	</template>
}
