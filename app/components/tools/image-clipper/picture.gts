import Component from '@glimmer/component';
import { tracked } from '@glimmer/tracking';
import { htmlSafe } from '@ember/template';
import { modifier } from 'ember-modifier';
import CanonDimensionLine from 'delphicanon/components/canon-dimension-line';
import {
	dimensionLines,
	sheet,
	type Rect,
	type Size,
} from 'delphicanon/lib/dimension-line';
import Slot from 'delphitools-v2/components/tools/media/slot';
import { margins } from 'delphitools-v2/components/tools/image-clipper/engine';

export interface PictureSignature {
	Args: {
		url?: string;
		pixels: Size;
		kept: Rect | null;
		springs: boolean;
		over: boolean;
		onChoose: () => void;
	};
}

// ponytail: Iosevka 11 px is 0.5 em a glyph at 13 px line height; measure if the font changes
const labelSize = (text: string): Size => ({
	width: text.length * 5.5 + 4,
	height: 17,
});

const px = (value: number) => `${Math.round(value * 100) / 100}px`;

function box({ x, y, width, height }: Rect) {
	return htmlSafe(
		`inset-inline-start: ${px(x)}; inset-block-start: ${px(y)}; inline-size: ${px(width)}; block-size: ${px(height)}`,
	);
}

export default class Picture extends Component<PictureSignature> {
	@tracked area: Rect = { x: 0, y: 0, width: 0, height: 0 };

	get frame() {
		return sheet(this.args.pixels, this.area);
	}

	get inner(): Rect | null {
		const { kept, pixels } = this.args;
		if (!kept) return null;
		const { frame } = this;
		const scale = frame.width / Math.max(pixels.width, 1);
		return {
			x: frame.x + kept.x * scale,
			y: frame.y + kept.y * scale,
			width: kept.width * scale,
			height: kept.height * scale,
		};
	}

	get frameStyle() {
		return box(this.frame);
	}

	get innerStyle() {
		return box(this.inner ?? this.frame);
	}

	get hatchStyle() {
		const { frame, inner } = this;
		const style = box(frame).toString();
		if (!inner) return htmlSafe(style);
		const { width, height } = frame;
		const x = inner.x - frame.x;
		const y = inner.y - frame.y;
		const points = [
			[0, 0],
			[width, 0],
			[width, height],
			[0, height],
			[0, 0],
			[x, y],
			[x + inner.width, y],
			[x + inner.width, y + inner.height],
			[x, y + inner.height],
			[x, y],
		]
			.map(([a, b]) => `${px(a!)} ${px(b!)}`)
			.join(', ');
		return htmlSafe(
			`${style}; clip-path: polygon(evenodd, ${points})`,
		);
	}

	get lines() {
		const inner = this.inner;
		if (!inner) return undefined;
		const { across, down } = dimensionLines(inner, this.frame);
		return { across: box(across), down: box(down) };
	}

	get labels() {
		const { kept, pixels, url } = this.args;
		const { frame: image, inner } = this;
		if (!url || !kept || !inner) return [];
		const m = margins(kept, pixels);
		const bands: Rect[] = [
			{
				x: image.x,
				y: image.y,
				width: image.width,
				height: inner.y - image.y,
			},
			{
				x: inner.x + inner.width,
				y: inner.y,
				width:
					image.x +
					image.width -
					inner.x -
					inner.width,
				height: inner.height,
			},
			{
				x: image.x,
				y: inner.y + inner.height,
				width: image.width,
				height:
					image.y +
					image.height -
					inner.y -
					inner.height,
			},
			{
				x: image.x,
				y: inner.y,
				width: inner.x - image.x,
				height: inner.height,
			},
		];
		const centres = [
			[
				inner.x + inner.width / 2,
				bands[0]!.y + bands[0]!.height / 2,
			],
			[
				bands[1]!.x + bands[1]!.width / 2,
				inner.y + inner.height / 2,
			],
			[
				inner.x + inner.width / 2,
				bands[2]!.y + bands[2]!.height / 2,
			],
			[
				bands[3]!.x + bands[3]!.width / 2,
				inner.y + inner.height / 2,
			],
		];
		return [m.top, m.right, m.bottom, m.left].map(
			(value, index) => {
				const text = `${value} px`;
				const size = labelSize(text);
				const band = bands[index]!;
				const [cx, cy] = centres[index]!;
				return {
					text,
					shown:
						value > 0 &&
						band.width >= size.width + 4 &&
						band.height >= size.height + 4,
					style: box({
						x: cx! - size.width / 2,
						y: cy! - size.height / 2,
						...size,
					}),
				};
			},
		);
	}

	get label() {
		const { kept } = this.args;
		return kept ? `${kept.width} × ${kept.height} px` : undefined;
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
		<div
			class="clip-picture
				{{if @url 'clip-picture--loaded'}}
				{{if @springs 'clip-picture--springs'}}"
		>
			<span class="clip-area" {{this.measure}}></span>
			{{#if this.area.width}}
				<span
					class="clip-checks"
					style={{this.frameStyle}}
				></span>
				{{#if @url}}
					<img
						class="clip-image"
						src={{@url}}
						alt=""
						draggable="false"
						style={{this.frameStyle}}
					/>
				{{else}}
					<Slot
						class="clip-slot"
						style={{this.frameStyle}}
						@prompt="Drop a PNG here or click to upload"
						@icon="image"
						@dashed={{true}}
						@over={{@over}}
						@onChoose={{@onChoose}}
					/>
				{{/if}}
				<span
					class="clip-hatch"
					style={{this.hatchStyle}}
				></span>
				{{#if this.inner}}
					<span
						class="clip-box"
						style={{this.innerStyle}}
					></span>
				{{/if}}
				{{#if this.lines}}
					<CanonDimensionLine
						class="clip-dimension"
						@pixels={{if
							@kept.width
							@kept.width
							0
						}}
						@blank={{if @url false true}}
						style={{this.lines.across}}
					/>
					<CanonDimensionLine
						class="clip-dimension"
						@pixels={{if
							@kept.height
							@kept.height
							0
						}}
						@blank={{if @url false true}}
						@down={{true}}
						style={{this.lines.down}}
					/>
				{{/if}}
				{{#each this.labels as |label|}}
					<span
						class="clip-margin
							{{if
								label.shown
								'clip-margin--shown'
							}}"
						style={{label.style}}
						aria-hidden="true"
					>{{label.text}}</span>
				{{/each}}
				{{#if @url}}
					<span
						class="clip-name"
						role="img"
						aria-label={{if
							this.label
							this.label
							"Fully transparent"
						}}
						style={{this.frameStyle}}
					></span>
				{{/if}}
			{{/if}}
		</div>
	</template>
}
