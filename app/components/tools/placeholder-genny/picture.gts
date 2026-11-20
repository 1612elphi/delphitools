import Component from '@glimmer/component';
import { tracked } from '@glimmer/tracking';
import { htmlSafe } from '@ember/template';
import { modifier } from 'ember-modifier';
import type Owner from '@ember/owner';
import CanonDimensionLine from 'delphicanon/components/canon-dimension-line';
import {
	dimensionLines,
	sheet,
	type Rect,
} from 'delphicanon/lib/dimension-line';
import {
	drawPlaceholder,
	monoFont,
	placeholderLabel,
	type PlaceholderSpec,
} from 'delphitools-v2/components/tools/placeholder-genny/placeholder';

interface PlaceholderPictureSignature {
	Args: {
		spec: PlaceholderSpec;
		onCanvas: (canvas: HTMLCanvasElement) => void;
	};
}

const px = (value: number) => `${Math.round(value * 100) / 100}px`;

function box({ x, y, width, height }: Rect) {
	return htmlSafe(
		`inset-inline-start: ${px(x)}; inset-block-start: ${px(y)}; inline-size: ${px(width)}; block-size: ${px(height)}`,
	);
}

export default class PlaceholderPicture extends Component<PlaceholderPictureSignature> {
	@tracked area: Rect = { x: 0, y: 0, width: 0, height: 0 };
	@tracked fontReady = false;

	font = monoFont();

	constructor(owner: Owner, args: PlaceholderPictureSignature['Args']) {
		super(owner, args);
		void document.fonts
			.load(`bold 16px ${this.font}`)
			.finally(() => {
				if (!this.isDestroying) this.fontReady = true;
			});
	}

	get frame() {
		const { width, height } = this.args.spec;
		return sheet({ width, height }, this.area);
	}

	get sheetStyle() {
		return box(this.frame);
	}

	get lines() {
		const { across, down } = dimensionLines(this.frame);
		return { across: box(across), down: box(down) };
	}

	get label() {
		const { text, width, height } = this.args.spec;
		return placeholderLabel(text, width, height);
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

	paint = modifier((canvas: HTMLCanvasElement) => {
		if (!this.fontReady) return;
		drawPlaceholder(canvas, this.args.spec, this.font);
		this.args.onCanvas(canvas);
	});

	<template>
		<div
			class="ph-picture
				{{if this.area.width 'ph-picture--placed'}}"
		>
			<span class="ph-area" {{this.measure}}></span>
			<canvas
				class="ph-sheet"
				role="img"
				aria-label={{this.label}}
				style={{this.sheetStyle}}
				{{this.paint}}
			></canvas>
			{{#if this.area.width}}
				<CanonDimensionLine
					class="ph-dimension"
					@pixels={{@spec.width}}
					style={{this.lines.across}}
				/>
				<CanonDimensionLine
					class="ph-dimension"
					@pixels={{@spec.height}}
					@down={{true}}
					style={{this.lines.down}}
				/>
			{{/if}}
		</div>
	</template>
}
