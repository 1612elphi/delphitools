import Component from '@glimmer/component';
import { tracked } from '@glimmer/tracking';
import { on } from '@ember/modifier';
import { htmlSafe } from '@ember/template';
import { modifier } from 'ember-modifier';
import CanonDimensionLine from 'delphicanon/components/canon-dimension-line';
import CanonLoader from 'delphicanon/components/canon-loader';
import {
	dimensionLines,
	sheet,
	type Rect,
	type Size,
} from 'delphicanon/lib/dimension-line';
import Slot from 'delphitools-v2/components/tools/media/slot';
import { caption } from 'delphitools-v2/components/tools/image-atlas/report';

export interface PictureSignature {
	Args: {
		url: string | null;
		pixels: Size | null;
		transparent: boolean;
		busy: boolean;
		over: boolean;
		onChoose: () => void;
		onLoad: (event: Event) => void;
		onError: () => void;
	};
}

export const emptyPixels: Size = { width: 1600, height: 1200 };

const px = (value: number) => `${Math.round(value * 100) / 100}px`;
const box = ({ x, y, width, height }: Rect) =>
	htmlSafe(
		`inset-inline-start: ${px(x)}; inset-block-start: ${px(y)}; inline-size: ${px(width)}; block-size: ${px(height)}`,
	);

export default class Picture extends Component<PictureSignature> {
	@tracked area: Rect = { x: 0, y: 0, width: 0, height: 0 };

	get loaded() {
		return this.args.url !== null && this.args.pixels !== null;
	}

	get frame() {
		return sheet(this.args.pixels ?? emptyPixels, this.area);
	}

	get frameStyle() {
		return box(this.frame);
	}

	get lines() {
		const { across, down } = dimensionLines(this.frame);
		return { across: box(across), down: box(down) };
	}

	get captionStyle() {
		const { x, y, width, height } = this.frame;
		return box({ x, y: y + height + 6, width, height: 16 });
	}

	get caption() {
		const { pixels } = this.args;
		return pixels ? caption(pixels.width, pixels.height) : '';
	}

	get label() {
		const { pixels } = this.args;
		return pixels ? `${pixels.width} × ${pixels.height}` : 'Image';
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

	<template>
		<div class="ia-picture {{if this.loaded 'ia-picture--loaded'}}">
			<span class="ia-area" {{this.measure}}></span>
			{{#if this.area.width}}
				{{#if @url}}
					{{#if @transparent}}
						<span
							class="ia-checks"
							style={{this.frameStyle}}
						></span>
					{{/if}}
					<img
						class="ia-image
							{{if
								@transparent
								'ia-image--clear'
							}}"
						src={{@url}}
						alt=""
						draggable="false"
						style={{this.frameStyle}}
						{{on "load" @onLoad}}
						{{on "error" @onError}}
					/>
					<span
						class="ia-name"
						role="img"
						aria-label={{this.label}}
						style={{this.frameStyle}}
					></span>
				{{else}}
					<Slot
						class="ia-slot"
						style={{this.frameStyle}}
						@prompt="Drop an image here"
						@icon="image"
						@dashed={{true}}
						@over={{@over}}
						@onChoose={{@onChoose}}
					/>
				{{/if}}
				<CanonDimensionLine
					class="ia-dimension"
					@pixels={{if
						@pixels.width
						@pixels.width
						0
					}}
					@blank={{if this.loaded false true}}
					style={{this.lines.across}}
				/>
				<CanonDimensionLine
					class="ia-dimension"
					@pixels={{if
						@pixels.height
						@pixels.height
						0
					}}
					@blank={{if this.loaded false true}}
					@down={{true}}
					style={{this.lines.down}}
				/>
				<span
					class="ia-caption"
					style={{this.captionStyle}}
					aria-hidden="true"
				>{{this.caption}}</span>
			{{/if}}
			{{#if @busy}}
				<CanonLoader class="ia-loader" />
			{{/if}}
		</div>
	</template>
}
