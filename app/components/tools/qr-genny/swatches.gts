import Component from '@glimmer/component';
import { fn } from '@ember/helper';
import { on } from '@ember/modifier';
import { modifier } from 'ember-modifier';

export interface Swatch {
	title: string;
	paper?: string;
	draw: (context: CanvasRenderingContext2D, side: number) => void;
}

interface SwatchesSignature {
	Args: {
		items: Swatch[];
		selected?: number;
		label: string;
		onChange: (index: number) => void;
	};
	Element: HTMLDivElement;
}

const preview = 40;
const inset = 6;

const paint = modifier((canvas: HTMLCanvasElement, [item]: [Swatch]) => {
	const scale = window.devicePixelRatio || 1;
	canvas.width = preview * scale;
	canvas.height = preview * scale;
	const context = canvas.getContext('2d');
	if (!context) return;
	context.setTransform(scale, 0, 0, scale, 0, 0);
	context.clearRect(0, 0, preview, preview);
	if (item.paper) {
		context.fillStyle = item.paper;
		context.fillRect(0, 0, preview, preview);
	}
	context.translate(inset, inset);
	item.draw(context, preview - 2 * inset);
});

export default class Swatches extends Component<SwatchesSignature> {
	get cells() {
		return this.args.items.map((item, index) => ({
			item,
			index,
			selected: index === this.args.selected,
		}));
	}

	<template>
		<div
			class="qr-swatches"
			role="group"
			aria-label={{@label}}
			...attributes
		>
			{{#each this.cells as |cell|}}
				<button
					type="button"
					class="qr-swatch
						{{if
							cell.selected
							'qr-swatch--selected'
						}}"
					aria-pressed={{if
						cell.selected
						"true"
						"false"
					}}
					{{on "click" (fn @onChange cell.index)}}
				>
					{{! template-lint-disable no-nested-interactive }}
					<canvas
						class="qr-swatch-preview
							{{unless
								cell.item.paper
								'qr-swatch-preview--clear'
							}}"
						aria-hidden="true"
						{{paint cell.item}}
					></canvas>
					<span
						class="qr-swatch-title"
					>{{cell.item.title}}</span>
				</button>
			{{/each}}
		</div>
	</template>
}
