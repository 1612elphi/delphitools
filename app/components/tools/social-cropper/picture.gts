import Component from '@glimmer/component';
import { tracked } from '@glimmer/tracking';
import { on } from '@ember/modifier';
import { htmlSafe } from '@ember/template';
import { modifier } from 'ember-modifier';
import CanonLoader from 'delphicanon/components/canon-loader';
import grabPan from 'delphicanon/modifiers/canon-grab-pan';
import { IconSvg } from 'delphitools-v2/components/icon';
import Slot from 'delphitools-v2/components/tools/media/slot';
import {
	resized,
	type Point,
	type Rect,
	type Size,
} from 'delphitools-v2/components/tools/social-cropper/crop';

export interface Outline {
	label: string;
	rect: Rect;
}

export interface PictureSignature {
	Args: {
		url?: string;
		pixels: Size;
		crop: Rect;
		aspect: number;
		zoom: number;
		label: string;
		others: Outline[];
		springs: boolean;
		busy: boolean;
		over: boolean;
		onChoose: () => void;
		onMove: (delta: Point) => void;
		onResize: (fraction: number, centre: Point) => void;
		onZoom: (zoom: number) => void;
	};
}

const reach = 8;
const handleReach = 22;
export const maxZoom = 8;
// ponytail: Iosevka 11 px is 0.5 em a glyph at 13 px line height; measure if the font changes
const labelSize = (text: string): Size => ({
	width: text.length * 5.5,
	height: 13,
});
const tagPadding = { width: 10, height: 4 };

const px = (value: number) => `${Math.round(value * 100) / 100}px`;

function box({ x, y, width, height }: Rect) {
	return htmlSafe(
		`left: ${px(x)}; top: ${px(y)}; width: ${px(width)}; height: ${px(height)}`,
	);
}

const meets = (a: Rect, b: Rect) =>
	a.x < b.x + b.width &&
	b.x < a.x + a.width &&
	a.y < b.y + b.height &&
	b.y < a.y + a.height;

const grown = ({ x, y, width, height }: Rect, dx: number, dy: number) => ({
	x: x - dx,
	y: y - dy,
	width: width + dx * 2,
	height: height + dy * 2,
});

export default class Picture extends Component<PictureSignature> {
	@tracked area: Size = { width: 0, height: 0 };
	@tracked hintSize: Size = { width: 0, height: 0 };
	@tracked dragging = false;
	@tracked focus?: Point;
	#last?: Point;
	#resizing = false;

	get frame(): Rect {
		const { pixels, crop } = this.args;
		const { width, height } = this.area;
		const scale =
			(Math.min(
				width / pixels.width,
				height / pixels.height,
			) || 0) *
			(this.args.url ? Math.max(this.args.zoom, 1) : 1);
		const focus = this.focus ?? {
			x: pixels.width / 2,
			y: pixels.height / 2,
		};
		const place = (
			view: number,
			side: number,
			at: number,
			start: number,
			length: number,
		) => {
			const shown = side * scale;
			if (shown <= view) return (view - shown) / 2;
			let offset = Math.min(
				Math.max(view / 2 - at * scale, view - shown),
				0,
			);
			const lead = offset + start * scale;
			const tail = lead + length * scale;
			if (length * scale <= view) {
				if (lead < 0) offset -= lead;
				else if (tail > view) offset -= tail - view;
			}
			return offset;
		};
		return {
			x: place(
				width,
				pixels.width,
				focus.x,
				crop.x,
				crop.width,
			),
			y: place(
				height,
				pixels.height,
				focus.y,
				crop.y,
				crop.height,
			),
			width: pixels.width * scale,
			height: pixels.height * scale,
		};
	}

	pixelAt({ x, y }: Point): Point {
		const { frame } = this;
		const scale = this.scale || 1;
		return { x: (x - frame.x) / scale, y: (y - frame.y) / scale };
	}

	get handleStyle() {
		const { frame } = this;
		const crop = this.shownCrop;
		return htmlSafe(
			`left: ${px(frame.x + crop.x + crop.width)}; top: ${px(frame.y + crop.y + crop.height)}`,
		);
	}

	#onHandle(point: Point) {
		const { frame } = this;
		const crop = this.shownCrop;
		return (
			Math.abs(point.x - (frame.x + crop.x + crop.width)) <
				handleReach &&
			Math.abs(point.y - (frame.y + crop.y + crop.height)) <
				handleReach
		);
	}

	get scale() {
		return this.frame.width / Math.max(this.args.pixels.width, 1);
	}

	shown({ x, y, width, height }: Rect): Rect {
		const { scale } = this;
		return {
			x: x * scale,
			y: y * scale,
			width: width * scale,
			height: height * scale,
		};
	}

	get shownCrop() {
		return this.shown(this.args.crop);
	}

	get movable() {
		const { url, crop, pixels } = this.args;
		return (
			!!url &&
			(crop.width < pixels.width - 0.5 ||
				crop.height < pixels.height - 0.5)
		);
	}

	get frameStyle() {
		return box(this.frame);
	}

	get cropStyle() {
		return box(this.shownCrop);
	}

	get tag(): Rect {
		const { x, y } = this.shownCrop;
		const size = labelSize(this.args.label);
		return {
			x,
			y,
			width: size.width + tagPadding.width,
			height: size.height + tagPadding.height,
		};
	}

	get tagStyle() {
		return box(this.tag);
	}

	get sideways() {
		return this.shownCrop.width < this.frame.width - 1;
	}

	get upDown() {
		return this.shownCrop.height < this.frame.height - 1;
	}

	get hintIcon() {
		if (this.sideways && this.upDown) return 'move';
		return this.sideways ? 'arrow-left-right' : 'arrow-up-down';
	}

	get hintShown() {
		return (
			this.movable &&
			!this.dragging &&
			this.hintSize.width > 0 &&
			this.frame.width > this.hintSize.width + 16
		);
	}

	get hint(): Rect {
		const { frame } = this;
		const crop = this.shownCrop;
		const size = this.hintSize;
		const right = crop.x + crop.width;
		const bottom = crop.y + crop.height;
		const left = Math.max(0, -frame.x);
		const top = Math.max(0, -frame.y);
		const end = Math.min(frame.width, this.area.width - frame.x);
		const foot = Math.min(frame.height, this.area.height - frame.y);
		const width = end - left;
		const height = foot - top;
		const strips = [
			{ x: left, y: top, width: crop.x - left, height },
			{ x: right, y: top, width: end - right, height },
			{ x: left, y: top, width, height: crop.y - top },
			{ x: left, y: bottom, width, height: foot - bottom },
		].filter(
			(strip) =>
				strip.width >= size.width + 8 &&
				strip.height >= size.height + 8,
		);
		const room = strips.sort(
			(a, b) => b.width * b.height - a.width * a.height,
		)[0];
		const centre = room
			? {
					x: room.x + room.width / 2,
					y: room.y + room.height / 2,
				}
			: {
					x: crop.x + crop.width / 2,
					y: bottom - size.height / 2 - 12,
				};
		return {
			x: centre.x - size.width / 2,
			y: centre.y - size.height / 2,
			...size,
		};
	}

	get hintStyle() {
		const { x, y } = this.hint;
		return htmlSafe(`left: ${px(x)}; top: ${px(y)}`);
	}

	get outlines() {
		const taken = [
			this.tag,
			...(this.hintShown ? [this.hint] : []),
		];
		return this.args.others.map(({ label, rect }) => {
			const shown = this.shown(rect);
			const size = labelSize(label);
			const left = shown.x + 6;
			const right = shown.x + shown.width - size.width - 6;
			const top = shown.y + 4;
			const bottom = shown.y + shown.height - size.height - 4;
			const corners = [
				[right, bottom],
				[right, top],
				[left, bottom],
				[left, top],
			].map(([x, y]) => ({ x: x!, y: y!, ...size }));
			const spot =
				shown.width < size.width + 12
					? undefined
					: corners.find(
							(corner) =>
								!taken.some(
									(
										rect,
									) =>
										meets(
											grown(
												rect,
												3,
												2,
											),
											corner,
										),
								),
						);
			if (spot) taken.push(spot);
			return {
				label,
				style: box(shown),
				labelStyle: box(spot ?? corners[0]!),
				labelled: !!spot,
			};
		});
	}

	get valueText() {
		const { x, y } = this.args.crop;
		return `${x}, ${y}`;
	}

	get maxX() {
		return this.args.pixels.width - this.args.crop.width;
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

	measureHint = modifier((element: HTMLElement) => {
		const observer = new ResizeObserver(() => {
			this.hintSize = {
				width: element.offsetWidth,
				height: element.offsetHeight,
			};
		});
		observer.observe(element);
		return () => observer.disconnect();
	});

	grabs = (point: Point) => {
		if (this.args.url && this.#onHandle(point)) return true;
		if (!this.movable) return false;
		const { frame } = this;
		const crop = grown(this.shownCrop, reach, reach);
		return meets(
			{ ...crop, x: crop.x + frame.x, y: crop.y + frame.y },
			{ ...point, width: 0.01, height: 0.01 },
		);
	};

	#local(event: { clientX: number; clientY: number }, element: Element) {
		const box = element.getBoundingClientRect();
		return {
			x: event.clientX - box.left,
			y: event.clientY - box.top,
		};
	}

	begin = (event: PointerEvent) => {
		this.#last = { x: event.clientX, y: event.clientY };
		this.#resizing = this.#onHandle(
			this.#local(event, event.currentTarget as Element),
		);
		this.dragging = true;
	};

	drag = (event: PointerEvent) => {
		const last = this.#last;
		if (!last) return;
		if (this.#resizing) {
			const { aspect, pixels, crop } = this.args;
			const to = this.pixelAt(
				this.#local(
					event,
					event.currentTarget as Element,
				),
			);
			const next = resized(aspect, pixels, crop, to);
			this.args.onResize(next.fraction, next.centre);
			return;
		}
		this.#last = { x: event.clientX, y: event.clientY };
		const scale = this.scale || 1;
		this.args.onMove({
			x: (event.clientX - last.x) / scale,
			y: (event.clientY - last.y) / scale,
		});
	};

	end = () => {
		this.#last = undefined;
		this.#resizing = false;
		this.dragging = false;
	};

	wheel = modifier((element: HTMLElement) => {
		const zoom = (event: WheelEvent) => {
			if (!(event.ctrlKey || event.metaKey) || !this.args.url)
				return;
			event.preventDefault();
			const point = this.#local(event, element);
			const under = this.pixelAt(point);
			const next = Math.min(
				Math.max(
					this.args.zoom *
						Math.exp(-event.deltaY / 200),
					1,
				),
				maxZoom,
			);
			const fitted = (this.scale || 1) / this.args.zoom;
			const scale = fitted * next;
			this.focus = {
				x:
					under.x -
					(point.x - this.area.width / 2) / scale,
				y:
					under.y -
					(point.y - this.area.height / 2) /
						scale,
			};
			this.args.onZoom(next);
		};
		element.addEventListener('wheel', zoom, { passive: false });
		return () => element.removeEventListener('wheel', zoom);
	});

	key = (event: KeyboardEvent) => {
		const arrows: Record<string, Point> = {
			ArrowLeft: { x: -1, y: 0 },
			ArrowRight: { x: 1, y: 0 },
			ArrowUp: { x: 0, y: -1 },
			ArrowDown: { x: 0, y: 1 },
		};
		const arrow = arrows[event.key];
		if (!arrow) return;
		event.preventDefault();
		const share = event.shiftKey ? 0.1 : 0.01;
		const { pixels } = this.args;
		this.args.onMove({
			x:
				arrow.x *
				Math.max(1, Math.round(pixels.width * share)),
			y:
				arrow.y *
				Math.max(1, Math.round(pixels.height * share)),
		});
	};

	<template>
		<div
			class="social-picture
				{{if @springs 'social-picture--springs'}}
				{{if this.dragging 'social-picture--dragging'}}"
		>
			<div
				class="social-area"
				{{this.measure}}
				{{this.wheel}}
				{{grabPan
					grabs=this.grabs
					onBegin=this.begin
					onMove=this.drag
					onEnd=this.end
				}}
			>
				{{#if this.area.width}}
					{{#if @url}}
						<img
							class="social-image"
							src={{@url}}
							alt="Source"
							draggable="false"
							style={{this.frameStyle}}
						/>
					{{else}}
						<Slot
							class="social-slot"
							style={{this.frameStyle}}
							@prompt="Drop an image to crop"
							@icon="image"
							@dashed={{true}}
							@over={{@over}}
							@onChoose={{@onChoose}}
						/>
					{{/if}}
					<div
						class="social-sheet
							{{if
								@url
								'social-sheet--image'
							}}"
						style={{this.frameStyle}}
					>
						<span
							class="social-shade"
							style={{this.cropStyle}}
						></span>
						{{#each
							this.outlines
							as |outline|
						}}
							<span
								class="social-ghost"
								style={{outline.style}}
							></span>
							<span
								class="social-ghost-label
									{{if
										outline.labelled
										'social-ghost-label--shown'
									}}"
								style={{outline.labelStyle}}
								aria-hidden="true"
							>{{outline.label}}</span>
						{{/each}}
						{{#if @url}}
							<span
								class="social-crop"
								style={{this.cropStyle}}
								role="slider"
								tabindex="0"
								aria-label="Crop"
								aria-valuenow={{@crop.x}}
								aria-valuemin="0"
								aria-valuemax={{this.maxX}}
								aria-valuetext={{this.valueText}}
								aria-keyshortcuts="ArrowLeft ArrowRight ArrowUp ArrowDown"
								{{on
									"keydown"
									this.key
								}}
							></span>
						{{else}}
							<span
								class="social-crop"
								style={{this.cropStyle}}
							></span>
						{{/if}}
						<span
							class="social-tag"
							style={{this.tagStyle}}
							aria-hidden="true"
						>{{@label}}</span>
						<span
							class="social-hint
								{{if
									this.hintShown
									'social-hint--shown'
								}}"
							style={{this.hintStyle}}
							aria-hidden="true"
							{{this.measureHint}}
						><IconSvg
								@name={{this.hintIcon}}
							/>Drag to reposition</span>
					</div>
					{{#if @url}}
						<span
							class="social-handle"
							style={{this.handleStyle}}
							aria-hidden="true"
						></span>
					{{/if}}
				{{/if}}
			</div>
			{{#if @busy}}
				<CanonLoader class="social-loader" />
			{{/if}}
		</div>
	</template>
}
