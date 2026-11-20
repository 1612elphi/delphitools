import Component from '@glimmer/component';
import { tracked } from '@glimmer/tracking';
import { htmlSafe } from '@ember/template';
import { modifier } from 'ember-modifier';
import CanonLoader from 'delphicanon/components/canon-loader';
import CanonDimensionLine from 'delphicanon/components/canon-dimension-line';
import { dimensionLines, sheet } from 'delphicanon/lib/dimension-line';
import Slot from 'delphitools-v2/components/tools/media/slot';
import {
	blur,
	blurred,
	cover,
	fit,
	gradient,
	gradientCss,
	heightOf,
	overscan,
	rgbCss,
	solid,
	type MatteSpec,
	type Rect,
	type Size,
} from 'delphitools-v2/components/tools/matte-genny/matte';

export interface PictureSignature {
	Args: {
		spec: MatteSpec;
		photo?: string;
		pixels?: Size;
		guides: boolean;
		busy: boolean;
		onChoose: () => void;
		over: boolean;
	};
}

const placeholder = { width: 3, height: 2 };

const px = (value: number) => `${Math.round(value * 100) / 100}px`;

function box({ x, y, width, height }: Rect, ...more: string[]) {
	return htmlSafe(
		[
			`inset-inline-start: ${px(x)}`,
			`inset-block-start: ${px(y)}`,
			`inline-size: ${px(width)}`,
			`block-size: ${px(height)}`,
			...more,
		].join('; '),
	);
}

export default class Picture extends Component<PictureSignature> {
	@tracked area: Rect = { x: 0, y: 0, width: 0, height: 0 };
	@tracked still = false;
	#settle = 0;

	get size(): Size {
		const { width, ratioW, ratioH } = this.args.spec;
		return { width, height: heightOf(width, ratioW, ratioH) };
	}

	get frame() {
		return sheet(this.size, this.area);
	}

	get scale() {
		return this.frame.width / this.size.width;
	}

	get shape() {
		return this.args.photo && this.args.pixels
			? this.args.pixels
			: placeholder;
	}

	scaled({ x, y, width, height }: Rect): Rect {
		const { scale } = this;
		return {
			x: x * scale,
			y: y * scale,
			width: width * scale,
			height: height * scale,
		};
	}

	get sheetStyle() {
		const { spec } = this.args;
		return box(
			this.frame,
			`background-color: ${spec.style === solid ? rgbCss(spec.colour) : 'var(--canon-card)'}`,
		);
	}

	get gradientStyle() {
		const { angle, stops, style } = this.args.spec;
		return htmlSafe(
			`background: ${gradientCss(angle, stops)}; opacity: ${style === gradient ? 1 : 0}`,
		);
	}

	get backdropStyle() {
		const back = this.scaled(
			cover(this.shape, this.size, overscan),
		);
		return box(
			back,
			`filter: blur(${px(blur * this.scale)})`,
			`opacity: ${this.args.spec.style === blurred && this.args.photo ? 1 : 0}`,
		);
	}

	get photoStyle() {
		return box(
			this.scaled(
				fit(
					this.shape,
					this.size,
					this.args.spec.padding,
				),
			),
		);
	}

	get guides() {
		const inset = this.args.spec.padding * this.scale;
		const { width, height } = this.frame;
		const line = 1;
		return [
			{ x: inset, y: 0, width: line, height },
			{ x: width - inset - line, y: 0, width: line, height },
			{ x: 0, y: inset, width, height: line },
			{ x: 0, y: height - inset - line, width, height: line },
		].map((rect) => box(rect));
	}

	get lines() {
		const { across, down } = dimensionLines(this.frame);
		return { across: box(across), down: box(down) };
	}

	get label() {
		return `${this.size.width} × ${this.size.height}`;
	}

	measure = modifier((element: HTMLElement) => {
		const observer = new ResizeObserver(() => {
			this.still = true;
			cancelAnimationFrame(this.#settle);
			this.#settle = requestAnimationFrame(() => {
				this.#settle = requestAnimationFrame(
					() => (this.still = false),
				);
			});
			this.area = {
				x: element.offsetLeft,
				y: element.offsetTop,
				width: element.clientWidth,
				height: element.clientHeight,
			};
		});
		observer.observe(element);
		return () => {
			observer.disconnect();
			cancelAnimationFrame(this.#settle);
		};
	});

	<template>
		<div
			class="matte-picture
				{{if this.area.width 'matte-picture--placed'}}
				{{if this.still 'matte-picture--still'}}"
		>
			<span
				class="matte-area"
				role="img"
				aria-label={{this.label}}
				{{this.measure}}
			></span>
			{{#if this.area.width}}
				<span
					class="matte-sheet"
					style={{this.sheetStyle}}
				>
					<span
						class="matte-gradient"
						style={{this.gradientStyle}}
					></span>
					{{#if @photo}}
						<img
							class="matte-backdrop"
							src={{@photo}}
							alt=""
							decoding="async"
							style={{this.backdropStyle}}
						/>
						<img
							class="matte-photo"
							src={{@photo}}
							alt=""
							decoding="async"
							style={{this.photoStyle}}
						/>
					{{else}}
						<Slot
							class="matte-slot"
							style={{this.photoStyle}}
							@prompt="Drop an image"
							@icon="image"
							@over={{@over}}
							@onChoose={{@onChoose}}
						/>
					{{/if}}
					{{#each this.guides as |guide|}}
						<span
							class="matte-guide
								{{if
									@guides
									'matte-guide--shown'
								}}"
							style={{guide}}
						></span>
					{{/each}}
				</span>
				<CanonDimensionLine
					class="matte-dimension"
					@pixels={{this.size.width}}
					style={{this.lines.across}}
				/>
				<CanonDimensionLine
					class="matte-dimension"
					@pixels={{this.size.height}}
					@down={{true}}
					style={{this.lines.down}}
				/>
			{{/if}}
			{{#if @busy}}
				<CanonLoader class="matte-loader" />
			{{/if}}
		</div>
	</template>
}
