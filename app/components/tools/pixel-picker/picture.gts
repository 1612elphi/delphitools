import Component from '@glimmer/component';
import { tracked } from '@glimmer/tracking';
import { on } from '@ember/modifier';
import { htmlSafe } from '@ember/template';
import { modifier } from 'ember-modifier';
import CanonLoupe from 'delphicanon/components/canon-loupe';
import grabPan from 'delphicanon/modifiers/canon-grab-pan';
import type { Rgb } from 'delphicanon/lib/colour';
import Slot from 'delphitools-v2/components/tools/media/slot';
import {
	clampPixel,
	contains,
	fitRect,
	lensLayout,
	pixelAt,
	place,
	type Point,
	type Size,
} from 'delphitools-v2/components/tools/pixel-picker/geometry';

export type Move = 'drag' | 'tap' | 'key';

interface PixelPictureSignature {
	Args: {
		canvas?: HTMLCanvasElement;
		pixel: Point;
		loupe?: ImageData;
		colour: Rgb;
		value: string;
		reading: string;
		onMove: (pixel: Point, how: Move) => void;
		onPick: () => void;
		onChoose: () => void;
	};
}

const loupeRadius = 7;
const loupeSides = { min: 84, max: 128 };
const keySteps: Record<string, Point> = {
	ArrowLeft: { x: -1, y: 0 },
	ArrowRight: { x: 1, y: 0 },
	ArrowUp: { x: 0, y: -1 },
	ArrowDown: { x: 0, y: 1 },
};

type Grab = { kind: 'image' | 'lens'; from: Point; at: Point };

export default class PixelPicture extends Component<PixelPictureSignature> {
	@tracked area: Size = { width: 0, height: 0 };
	@tracked eases = false;
	@tracked dragging = false;
	#grab?: Grab;
	#dragged = false;

	get image(): Size {
		const { canvas } = this.args;
		return canvas
			? { width: canvas.width, height: canvas.height }
			: { width: 0, height: 0 };
	}

	get fit() {
		return fitRect(this.area, this.image);
	}

	get centre() {
		return place(this.args.pixel, this.fit, this.image);
	}

	get layout() {
		const side = Math.min(
			Math.max(this.area.height * 0.5, loupeSides.min),
			loupeSides.max,
		);
		return lensLayout(this.centre, side, this.area);
	}

	get imageStyle() {
		const { x, y, width, height } = this.fit;
		return htmlSafe(
			`left: ${x}px; top: ${y}px; width: ${width}px; height: ${height}px`,
		);
	}

	get magnified() {
		return this.fit.width > this.image.width;
	}

	get reticleShown() {
		const { lens } = this.layout;
		const { x, y } = this.centre;
		return (
			Math.hypot(
				lens.x + lens.width / 2 - x,
				lens.y + lens.height / 2 - y,
			) >
			lens.width / 6
		);
	}

	get reticleStyle() {
		const { x, y } = this.centre;
		return htmlSafe(`translate: ${x}px ${y}px`);
	}

	get loupeStyle() {
		const { x, y, width } = this.layout.lens;
		return htmlSafe(
			`translate: ${x}px ${y}px; --canon-loupe-side: ${width}px`,
		);
	}

	get pickStyle() {
		const { x, y } = this.layout.pick;
		return htmlSafe(`translate: ${x}px ${y}px`);
	}

	get detailStyle() {
		const { x, y } = this.layout.detail;
		return htmlSafe(`translate: calc(${x}px - 50%) ${y}px`);
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

	show = modifier((box: HTMLElement, [canvas]: [HTMLCanvasElement]) => {
		box.replaceChildren(canvas);
	});

	#local(event: PointerEvent | MouseEvent, element: HTMLElement): Point {
		const box = element.getBoundingClientRect();
		return {
			x: event.clientX - box.left,
			y: event.clientY - box.top,
		};
	}

	#move(pixel: Point, how: Move) {
		this.eases = how === 'tap';
		this.args.onMove(clampPixel(pixel, this.image), how);
	}

	#onPick(point: Point) {
		return !this.dragging && contains(this.layout.pick, point);
	}

	grabs = (point: Point) =>
		Boolean(this.args.canvas) &&
		!this.#onPick(point) &&
		(contains(this.fit, point) ||
			contains(this.layout.lens, point));

	begin = (event: PointerEvent) => {
		const point = this.#local(
			event,
			event.currentTarget as HTMLElement,
		);
		this.#grab = {
			kind: contains(this.layout.lens, point)
				? 'lens'
				: 'image',
			from: this.args.pixel,
			at: point,
		};
		this.#dragged = false;
	};

	drag = (event: PointerEvent) => {
		const grab = this.#grab;
		if (!grab) return;
		const point = this.#local(
			event,
			event.currentTarget as HTMLElement,
		);
		const dx = point.x - grab.at.x;
		const dy = point.y - grab.at.y;
		if (!this.#dragged && Math.hypot(dx, dy) < 3) return;
		this.#dragged = true;
		this.dragging = true;
		if (grab.kind === 'image') {
			const from = place(grab.from, this.fit, this.image);
			this.#move(
				pixelAt(
					{ x: from.x + dx, y: from.y + dy },
					this.fit,
					this.image,
				),
				'drag',
			);
			return;
		}
		const cell = this.layout.lens.width / (loupeRadius * 2 + 1);
		this.#move(
			{
				x: grab.from.x + Math.round(dx / cell),
				y: grab.from.y + Math.round(dy / cell),
			},
			'drag',
		);
	};

	end = (event: PointerEvent) => {
		const grab = this.#grab;
		this.#grab = undefined;
		this.dragging = false;
		if (grab && !this.#dragged)
			this.#tap(
				this.#local(
					event,
					event.currentTarget as HTMLElement,
				),
			);
	};

	#tap(point: Point) {
		if (
			this.#onPick(point) ||
			!contains(this.fit, point) ||
			contains(this.layout.lens, point)
		)
			return;
		this.#move(pixelAt(point, this.fit, this.image), 'tap');
	}

	key = (event: KeyboardEvent) => {
		if (event.target !== event.currentTarget) return;
		if (event.key === 'Enter' || event.key === ' ') {
			event.preventDefault();
			this.args.onPick();
			return;
		}
		const step = keySteps[event.key];
		if (!step) return;
		event.preventDefault();
		const by = event.shiftKey ? 10 : 1;
		const { pixel } = this.args;
		this.#move(
			{ x: pixel.x + step.x * by, y: pixel.y + step.y * by },
			'key',
		);
	};

	<template>
		<div class="pp-picture">
			{{#if @canvas}}
				{{! template-lint-disable no-invalid-interactive }}
				<div
					class="pp-area
						{{if
							this.eases
							'pp-area--eases'
						}}
						{{if
							this.dragging
							'pp-area--dragging'
						}}"
					tabindex="0"
					role="group"
					aria-label="Image"
					aria-keyshortcuts="ArrowLeft ArrowRight ArrowUp ArrowDown Enter"
					{{this.measure}}
					{{grabPan
						grabs=this.grabs
						onBegin=this.begin
						onMove=this.drag
						onEnd=this.end
					}}
					{{on "keydown" this.key}}
				>
					<div
						class="pp-image
							{{if
								this.magnified
								'pp-image--magnified'
							}}"
						style={{this.imageStyle}}
						{{this.show @canvas}}
					></div>
					<div
						class="pp-loupe"
						style={{this.loupeStyle}}
					>
						<CanonLoupe
							@pixels={{@loupe}}
							@colour={{@colour}}
						/>
					</div>
					{{#if this.reticleShown}}
						<svg
							class="pp-reticle"
							style={{this.reticleStyle}}
							viewBox="0 0 40 40"
							aria-hidden="true"
						><path
								d="M25 20H35M15 20H5M20 25V35M20 15V5"
							/></svg>
					{{/if}}
					{{#unless this.dragging}}
						<span
							class="pp-lens-detail"
							style={{this.detailStyle}}
							aria-hidden="true"
						>{{@value}}</span>
						<button
							type="button"
							class="pp-lens-pick"
							style={{this.pickStyle}}
							{{on "click" @onPick}}
						>Pick</button>
					{{/unless}}
					<output
						class="pp-reading"
						aria-live="polite"
					>{{@reading}}</output>
				</div>
			{{else}}
				<Slot
					class="pp-slot"
					@prompt="Drop an image"
					@icon="pipette"
					@dashed={{true}}
					@fills={{true}}
					@onChoose={{@onChoose}}
				/>
			{{/if}}
		</div>
	</template>
}
