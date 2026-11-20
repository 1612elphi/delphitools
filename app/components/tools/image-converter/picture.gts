import Component from '@glimmer/component';
import { tracked } from '@glimmer/tracking';
import { fn } from '@ember/helper';
import { on } from '@ember/modifier';
import { htmlSafe } from '@ember/template';
import { modifier } from 'ember-modifier';
import CanonDimensionLine from 'delphicanon/components/canon-dimension-line';
import CanonFigure from 'delphicanon/components/canon-figure';
import CanonLoader from 'delphicanon/components/canon-loader';
import {
	dimensionLines,
	sheet,
	type Rect,
	type Size,
} from 'delphicanon/lib/dimension-line';
import { reducedMotion, springEasing } from 'delphicanon/lib/motion';
import Slot from 'delphitools-v2/components/tools/media/slot';
import { figureOf } from 'delphitools-v2/components/tools/image-converter/encode';
import { formatBytes } from 'delphitools-v2/lib/image-compress';

export interface PictureSignature {
	Args: {
		source?: string;
		result?: string;
		sourceSize?: Size;
		outputSize?: Size;
		bytes?: number;
		working: boolean;
		failed: boolean;
		lamps: boolean[];
		over: boolean;
		thumbs: Thumb[];
		arrival: number;
		onChoose: () => void;
		onPick: (index: number) => void;
	};
}

export interface Thumb {
	url: string;
	name: string;
	current: boolean;
}

const lampNames = ['Alpha', 'Lossy', '256 Colours'];
const placeholder: Size = { width: 3, height: 2 };
const springMs = 550;
const spring = htmlSafe(`--conv-spring: ${springEasing(0.82)}`);

const px = (value: number) => `${Math.round(value * 100) / 100}px`;

function box({ x, y, width, height }: Rect) {
	return htmlSafe(
		`inset-inline-start: ${px(x)}; inset-block-start: ${px(y)}; inline-size: ${px(width)}; block-size: ${px(height)}`,
	);
}

const same = (a?: Size, b?: Size) =>
	a?.width === b?.width && a?.height === b?.height;

const springs = modifier((element: HTMLElement, [key]: [string]) => {
	const last = element.dataset['key'];
	element.dataset['key'] = key;
	if (last === undefined || last === key || reducedMotion()) return;
	element.classList.add('conv-picture--springs');
	const timer = window.setTimeout(
		() => element.classList.remove('conv-picture--springs'),
		springMs,
	);
	return () => window.clearTimeout(timer);
});

const arriveMs = 450;

const arrives = modifier((element: HTMLElement, [count]: [number]) => {
	if (!count || reducedMotion()) return;
	element.classList.remove('conv-picture--arrives');
	void element.offsetWidth;
	element.classList.add('conv-picture--arrives');
	const timer = window.setTimeout(
		() => element.classList.remove('conv-picture--arrives'),
		arriveMs,
	);
	return () => window.clearTimeout(timer);
});

const showsCurrent = modifier((strip: HTMLElement, [index]: [number]) => {
	const thumb = strip.children[index] as HTMLElement | undefined;
	if (!thumb) return;
	const start = thumb.offsetLeft - strip.offsetLeft;
	const end = start + thumb.offsetWidth;
	if (start < strip.scrollLeft) strip.scrollLeft = start;
	else if (end > strip.scrollLeft + strip.clientWidth)
		strip.scrollLeft = end - strip.clientWidth;
});

export default class Picture extends Component<PictureSignature> {
	@tracked area: Rect = { x: 0, y: 0, width: 0, height: 0 };
	@tracked broken?: string;

	get output() {
		return this.args.outputSize ?? placeholder;
	}

	get sourceSize() {
		return this.args.sourceSize ?? this.output;
	}

	get frames() {
		const output = this.output;
		const source = this.sourceSize;
		const group = {
			width: Math.max(source.width, output.width),
			height: Math.max(source.height, output.height),
		};
		const frame = sheet(group, this.area);
		const scale = frame.width / group.width;
		const centred = (size: Size): Rect => {
			const width = Math.max(1, size.width * scale);
			const height = Math.max(1, size.height * scale);
			return {
				x: frame.x + (frame.width - width) / 2,
				y: frame.y + (frame.height - height) / 2,
				width,
				height,
			};
		};
		return { output: centred(output), source: centred(source) };
	}

	get outputStyle() {
		return box(this.frames.output);
	}

	get sourceStyle() {
		return box(this.frames.source);
	}

	get resized() {
		return (
			!!this.args.sourceSize &&
			!same(this.args.sourceSize, this.args.outputSize)
		);
	}

	get lines() {
		const { across, down } = dimensionLines(this.frames.output);
		return { across: box(across), down: box(down) };
	}

	get isResult() {
		const { result } = this.args;
		return !!result && result !== this.broken;
	}

	get shown() {
		return this.isResult ? this.args.result : this.args.source;
	}

	get sourceTag() {
		const { sourceSize } = this.args;
		return sourceSize
			? `${sourceSize.width} × ${sourceSize.height}`
			: '';
	}

	get figure() {
		const { bytes } = this.args;
		return bytes === undefined
			? { text: '—', unit: '' }
			: (([text, unit]) => ({ text, unit }))(
					figureOf(formatBytes(bytes)),
				);
	}

	get figureColour() {
		return this.args.failed
			? 'var(--canon-destructive)'
			: 'var(--canon-primary)';
	}

	get label() {
		const size = this.args.outputSize;
		return size ? `${size.width} × ${size.height}` : 'Result';
	}

	get springKey() {
		const { output, sourceSize } = this;
		return `${output.width}x${output.height}/${sourceSize.width}x${sourceSize.height}`;
	}

	get lamps() {
		return lampNames.map((name, index) => ({
			name,
			on: this.args.lamps[index] ?? false,
		}));
	}

	get currentThumb() {
		return this.args.thumbs.findIndex((thumb) => thumb.current);
	}

	failedToShow = (event: Event) => {
		this.broken = (event.target as HTMLImageElement).src;
	};

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
			class="conv-picture
				{{if @source 'conv-picture--loaded'}}
				{{if @thumbs.length 'conv-picture--film'}}"
			style={{spring}}
			{{springs this.springKey}}
			{{arrives @arrival}}
		>
			<span class="conv-area" {{this.measure}}></span>
			{{#if this.area.width}}
				{{#if @source}}
					<span
						class="conv-edge"
						style={{this.outputStyle}}
					></span>
					<span
						class="conv-checks"
						style={{this.outputStyle}}
					></span>
					<img
						class="conv-image
							{{unless
								this.isResult
								'conv-image--source'
							}}"
						src={{this.shown}}
						alt=""
						draggable="false"
						style={{this.outputStyle}}
						{{on "error" this.failedToShow}}
					/>
					{{#if this.resized}}
						<span
							class="conv-outline"
							style={{this.sourceStyle}}
						><span
								class="conv-source-tag"
							>{{this.sourceTag}}</span></span>
					{{/if}}
					<span
						class="conv-name"
						role="img"
						aria-label={{this.label}}
						style={{this.outputStyle}}
					></span>
				{{else}}
					<Slot
						class="conv-slot"
						style={{this.outputStyle}}
						@prompt="Drop images here"
						@icon="image"
						@dashed={{true}}
						@over={{@over}}
						@onChoose={{@onChoose}}
					/>
				{{/if}}
				<CanonDimensionLine
					class="conv-dimension"
					@pixels={{this.output.width}}
					@blank={{if @outputSize false true}}
					style={{this.lines.across}}
				/>
				<CanonDimensionLine
					class="conv-dimension"
					@pixels={{this.output.height}}
					@blank={{if @outputSize false true}}
					@down={{true}}
					style={{this.lines.down}}
				/>
			{{/if}}
			{{#if @thumbs.length}}
				<div
					class="conv-film"
					{{showsCurrent this.currentThumb}}
				>
					{{#each @thumbs as |thumb index|}}
						<button
							type="button"
							class="conv-thumb
								{{if
									thumb.current
									'conv-thumb--current'
								}}"
							aria-label={{thumb.name}}
							aria-pressed={{if
								thumb.current
								"true"
								"false"
							}}
							{{on
								"click"
								(fn
									@onPick
									index
								)
							}}
						><img
								src={{thumb.url}}
								alt=""
								draggable="false"
							/></button>
					{{/each}}
				</div>
			{{/if}}
			<div class="conv-footer">
				<ul class="conv-lamps" aria-hidden="true">
					{{#each this.lamps as |lamp|}}
						<li
							class="conv-lamp
								{{if
									lamp.on
									'conv-lamp--on'
								}}"
						>
							<span
								class="conv-lamp-light"
							></span>
							<span
								class="conv-lamp-name"
							>{{lamp.name}}</span>
						</li>
					{{/each}}
				</ul>
				<span class="conv-reading">
					{{#if @working}}
						<CanonLoader
							class="conv-loader"
							@cell={{5}}
							@gap={{1}}
						/>
					{{/if}}
					<CanonFigure
						class="conv-bytes"
						@text={{this.figure.text}}
						@unit={{this.figure.unit}}
						@size={{28}}
						@colour={{this.figureColour}}
						@halo="var(--canon-muted)"
					/>
				</span>
			</div>
		</div>
	</template>
}
