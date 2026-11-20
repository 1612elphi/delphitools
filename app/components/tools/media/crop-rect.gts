import Component from '@glimmer/component';
import { tracked } from '@glimmer/tracking';
import { on } from '@ember/modifier';
import { htmlSafe } from '@ember/template';
import { modifier } from 'ember-modifier';
import grabPan from 'delphicanon/modifiers/canon-grab-pan';
import {
	dragEdges,
	edgesAt,
	fit,
	moved,
	nudged,
	reach,
	type Edges,
	type Point,
	type Rect,
	type Size,
} from 'delphitools-v2/lib/crop-rect';
import './crop-rect.css';

export interface CropRectSignature {
	Args: {
		url?: string;
		alt: string;
		size: Size;
		crop: Rect;
		valueText: string;
		thirds?: boolean;
		onCrop: (crop: Rect) => void;
		onSettle: () => void;
	};
	Blocks: {
		default: [frame: Rect, area: Size];
	};
	Element: HTMLDivElement;
}

const px = (value: number) => `${Math.round(value * 100) / 100}px`;

export const box = ({ x, y, width, height }: Rect) =>
	htmlSafe(
		`left: ${px(x)}; top: ${px(y)}; width: ${px(width)}; height: ${px(height)}`,
	);

export default class CropRect extends Component<CropRectSignature> {
	@tracked area: Size = { width: 0, height: 0 };
	#grabbed?: Edges;
	#offset?: Point;

	get frame(): Rect {
		const { width, height } = this.area;
		return fit(this.args.size, {
			x: reach,
			y: reach,
			width: width - reach * 2,
			height: height - reach * 2,
		});
	}

	get scale() {
		return this.frame.width / Math.max(this.args.size.width, 1);
	}

	get shownCrop(): Rect {
		const { frame, scale } = this;
		const { x, y, width, height } = this.args.crop;
		return {
			x: frame.x + x * scale,
			y: frame.y + y * scale,
			width: width * scale,
			height: height * scale,
		};
	}

	get whole() {
		const { crop, size } = this.args;
		return (
			crop.width >= size.width - 1 &&
			crop.height >= size.height - 1
		);
	}

	get frameStyle() {
		return box(this.frame);
	}

	get cropStyle() {
		return box(this.shownCrop);
	}

	get shadeStyle() {
		const { frame } = this;
		const crop = this.shownCrop;
		return box({
			...crop,
			x: crop.x - frame.x,
			y: crop.y - frame.y,
		});
	}

	measure = modifier((element: HTMLElement) => {
		const observer = new ResizeObserver(() => {
			this.area = {
				width: element.clientWidth,
				height: element.clientHeight,
			};
		});
		observer.observe(element);
		return () => observer.disconnect();
	});

	#point(event: PointerEvent): Point {
		const bounds = (
			event.currentTarget as HTMLElement
		).getBoundingClientRect();
		const { frame } = this;
		const { size } = this.args;
		const scale = this.scale || 1;
		const clamp = (value: number, most: number) =>
			Math.min(Math.max(value, 0), most);
		return {
			x: clamp(
				(event.clientX - bounds.left - frame.x) / scale,
				size.width,
			),
			y: clamp(
				(event.clientY - bounds.top - frame.y) / scale,
				size.height,
			),
		};
	}

	grabs = (point: Point) => {
		if (!this.args.url) return false;
		const shown = this.shownCrop;
		const inside =
			point.x >= shown.x &&
			point.x <= shown.x + shown.width &&
			point.y >= shown.y &&
			point.y <= shown.y + shown.height;
		return !!edgesAt(point, shown) || (inside && !this.whole);
	};

	begin = (event: PointerEvent) => {
		const bounds = (
			event.currentTarget as HTMLElement
		).getBoundingClientRect();
		this.#grabbed = edgesAt(
			{
				x: event.clientX - bounds.left,
				y: event.clientY - bounds.top,
			},
			this.shownCrop,
		);
		if (this.#grabbed) return;
		const point = this.#point(event);
		const { crop } = this.args;
		this.#offset = { x: point.x - crop.x, y: point.y - crop.y };
	};

	drag = (event: PointerEvent) => {
		const point = this.#point(event);
		const { crop, size } = this.args;
		const offset = this.#offset;
		if (offset)
			this.args.onCrop(
				moved(
					crop,
					{
						x: point.x - offset.x,
						y: point.y - offset.y,
					},
					size,
				),
			);
		else if (this.#grabbed)
			this.args.onCrop(dragEdges(crop, this.#grabbed, point));
	};

	end = () => {
		this.#grabbed = undefined;
		this.#offset = undefined;
		this.args.onSettle();
	};

	key = (event: KeyboardEvent) => {
		const next = nudged(this.args.crop, this.args.size, event);
		if (!next) return;
		event.preventDefault();
		this.args.onCrop(next);
		this.args.onSettle();
	};

	<template>
		<div
			class="media-crop"
			{{this.measure}}
			{{grabPan
				grabs=this.grabs
				onBegin=this.begin
				onMove=this.drag
				onEnd=this.end
			}}
			...attributes
		>
			{{#if this.area.width}}
				{{#if @url}}
					<img
						class="media-crop-image"
						src={{@url}}
						alt={{@alt}}
						draggable="false"
						style={{this.frameStyle}}
					/>
					<div
						class="media-crop-sheet"
						style={{this.frameStyle}}
					>
						<span
							class="media-crop-shade
								{{if
									@thirds
									'media-crop-shade--thirds'
								}}"
							style={{this.shadeStyle}}
						></span>
					</div>
					<span
						class="media-crop-rect"
						style={{this.cropStyle}}
						role="slider"
						tabindex="0"
						aria-label="Crop"
						aria-valuenow={{@crop.x}}
						aria-valuemin="0"
						aria-valuemax={{@size.width}}
						aria-valuetext={{@valueText}}
						aria-keyshortcuts="ArrowLeft ArrowRight ArrowUp ArrowDown Alt+ArrowLeft Alt+ArrowRight Alt+ArrowUp Alt+ArrowDown"
						{{on "keydown" this.key}}
					>
						<span
							class="media-crop-corner media-crop-corner--nw"
						></span>
						<span
							class="media-crop-corner media-crop-corner--ne"
						></span>
						<span
							class="media-crop-corner media-crop-corner--sw"
						></span>
						<span
							class="media-crop-corner media-crop-corner--se"
						></span>
					</span>
				{{/if}}
				{{yield this.frame this.area}}
			{{/if}}
		</div>
	</template>
}
