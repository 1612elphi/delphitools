import Component from '@glimmer/component';
import { on } from '@ember/modifier';
import { htmlSafe } from '@ember/template';
import { modifier } from 'ember-modifier';
import CanonFigure from 'delphicanon/components/canon-figure';
import { IconSvg } from 'delphitools-v2/components/icon';
import {
	paint,
	type PaintOptions,
	type PrintSheet,
} from 'delphitools-v2/components/tools/imposer/sheet';

let canonFont: string | undefined;

function font(element: Element) {
	canonFont ??=
		getComputedStyle(element)
			.getPropertyValue('--canon-font')
			.trim() || 'sans-serif';
	return canonFont;
}

const draw = modifier(
	(
		canvas: HTMLCanvasElement,
		[sheet, options]: [
			PrintSheet | undefined,
			PaintOptions,
			number,
		],
	) => {
		const redraw = () => {
			const [width, height] = [
				canvas.clientWidth,
				canvas.clientHeight,
			];
			const density = window.devicePixelRatio || 1;
			canvas.width = Math.round(width * density);
			canvas.height = Math.round(height * density);
			const context = canvas.getContext('2d');
			if (!context || !sheet || !width) return;
			context.setTransform(density, 0, 0, density, 0, 0);
			paint(
				context,
				sheet,
				{ x: 0, y: 0, w: width, h: height },
				{ ...options, font: font(canvas) },
			);
		};
		redraw();
		const observer = new ResizeObserver(redraw);
		observer.observe(canvas);
		return () => observer.disconnect();
	},
);

export interface SheetPictureSignature {
	Args: {
		front?: PrintSheet;
		back?: PrintSheet;
		options: PaintOptions;
		version: number;
		legend: string;
		detail: string;
		total: string;
		unit: string;
		showsBack: boolean;
		axis: 'x' | 'y';
		onFlip: () => void;
	};
	Element: HTMLDivElement;
}

export default class SheetPicture extends Component<SheetPictureSignature> {
	get style() {
		const sheet = this.args.front;
		const aspect = sheet
			? sheet.width / Math.max(sheet.height, 1)
			: 1.414;
		return htmlSafe(`--imp-aspect: ${aspect}`);
	}

	get name() {
		return [this.args.legend, this.args.detail]
			.filter(Boolean)
			.join(', ');
	}

	<template>
		<div class="imp-picture" style={{this.style}} ...attributes>
			<div class="imp-picture-head">
				<div class="imp-picture-text">
					<p class="imp-legend">{{@legend}}</p>
					<p class="imp-detail">{{@detail}}</p>
				</div>
				<CanonFigure
					class="imp-total"
					@text={{@total}}
					@unit={{@unit}}
					@size={{30}}
					@halo="var(--canon-muted)"
				/>
			</div>
			<div class="imp-paper">
				<span
					class="imp-faces imp-faces--{{@axis}}
						{{if
							@showsBack
							'imp-faces--back'
						}}"
				>
					<canvas
						class="imp-face"
						aria-hidden="true"
						{{draw
							@front
							@options
							@version
						}}
					></canvas>
					<canvas
						class="imp-face imp-face--back"
						aria-hidden="true"
						{{draw @back @options @version}}
					></canvas>
				</span>
				<button
					type="button"
					class="imp-paper-press"
					aria-label={{this.name}}
					{{on "click" @onFlip}}
				></button>
			</div>
			<p class="imp-hint" aria-hidden="true">
				<IconSvg @name="pointer" />
				Tap to flip
			</p>
		</div>
	</template>
}
