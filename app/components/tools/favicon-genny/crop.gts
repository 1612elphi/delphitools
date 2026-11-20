import Component from '@glimmer/component';
import { tracked } from '@glimmer/tracking';
import { on } from '@ember/modifier';
import { htmlSafe } from '@ember/template';
import { modifier } from 'ember-modifier';
import {
	clamp,
	type Square,
} from 'delphitools-v2/components/tools/favicon-genny/favicon';

interface FaviconCropSignature {
	Args: {
		url: string;
		width: number;
		height: number;
		square: Square;
		onChange: (square: Square) => void;
	};
}

const reach = 22;
const nudge = 1.1;

export default class FaviconCrop extends Component<FaviconCropSignature> {
	@tracked bounds = { width: 0, height: 0 };
	#grab?: { resizing: boolean; dx: number; dy: number };

	get frame() {
		const { width, height } = this.args;
		const area = {
			width: Math.max(0, this.bounds.width - reach * 2),
			height: Math.max(0, this.bounds.height - reach * 2),
		};
		const scale =
			Math.min(area.width / width, area.height / height) || 0;
		return {
			x: (this.bounds.width - width * scale) / 2,
			y: (this.bounds.height - height * scale) / 2,
			width: width * scale,
			height: height * scale,
			scale,
		};
	}

	get pictureStyle() {
		const { x, y, width, height } = this.frame;
		return htmlSafe(
			`left: ${x}px; top: ${y}px; width: ${width}px; height: ${height}px; background-image: url("${this.args.url}")`,
		);
	}

	get squareStyle() {
		const { x, y, scale } = this.frame;
		const { square } = this.args;
		return htmlSafe(
			`left: ${x + square.x * scale}px; top: ${y + square.y * scale}px; width: ${square.side * scale}px; height: ${square.side * scale}px`,
		);
	}

	get shadeStyle() {
		const { scale } = this.frame;
		const { square } = this.args;
		return htmlSafe(
			`left: ${square.x * scale}px; top: ${square.y * scale}px; width: ${square.side * scale}px; height: ${square.side * scale}px`,
		);
	}

	get valueText() {
		return `${this.args.square.side} px`;
	}

	measure = modifier((element: HTMLElement) => {
		const observer = new ResizeObserver(() => {
			this.bounds = {
				width: element.clientWidth,
				height: element.clientHeight,
			};
		});
		observer.observe(element);
		return () => observer.disconnect();
	});

	#at(event: PointerEvent) {
		const box = (
			event.currentTarget as HTMLElement
		).getBoundingClientRect();
		const { x, y, scale } = this.frame;
		const pointX = event.clientX - box.left;
		const pointY = event.clientY - box.top;
		return {
			point: { x: pointX, y: pointY },
			pixel: {
				x: (pointX - x) / Math.max(scale, 0.0001),
				y: (pointY - y) / Math.max(scale, 0.0001),
			},
		};
	}

	down = (event: PointerEvent) => {
		const { point, pixel } = this.#at(event);
		const { x, y, scale } = this.frame;
		const { square } = this.args;
		const corner = {
			x: x + (square.x + square.side) * scale,
			y: y + (square.y + square.side) * scale,
		};
		const resizing =
			Math.abs(point.x - corner.x) < reach &&
			Math.abs(point.y - corner.y) < reach;
		const inside =
			pixel.x >= square.x &&
			pixel.x <= square.x + square.side &&
			pixel.y >= square.y &&
			pixel.y <= square.y + square.side;
		if (!resizing && !inside) return;
		event.preventDefault();
		(event.currentTarget as HTMLElement).setPointerCapture(
			event.pointerId,
		);
		this.#grab = {
			resizing,
			dx: pixel.x - square.x,
			dy: pixel.y - square.y,
		};
	};

	move = (event: PointerEvent) => {
		const grab = this.#grab;
		if (!grab) return;
		const { pixel } = this.#at(event);
		const { square, width, height } = this.args;
		let next: Square;
		if (grab.resizing) {
			const side = Math.max(
				pixel.x - square.x,
				pixel.y - square.y,
			);
			const room = Math.min(
				width - square.x,
				height - square.y,
			);
			next = { ...square, side: Math.min(side, room) };
		} else {
			next = {
				...square,
				x: pixel.x - grab.dx,
				y: pixel.y - grab.dy,
			};
		}
		next = clamp(next, width, height);
		if (
			next.x !== square.x ||
			next.y !== square.y ||
			next.side !== square.side
		)
			this.args.onChange(next);
	};

	up = () => {
		this.#grab = undefined;
	};

	key = (event: KeyboardEvent) => {
		const grow = ['ArrowUp', 'ArrowRight'].includes(event.key);
		const shrink = ['ArrowDown', 'ArrowLeft'].includes(event.key);
		if (!grow && !shrink) return;
		event.preventDefault();
		const { square, width, height } = this.args;
		const side = Math.round(
			square.side * (grow ? nudge : 1 / nudge),
		);
		const centre = square.side / 2;
		this.args.onChange(
			clamp(
				{
					x: square.x + centre - side / 2,
					y: square.y + centre - side / 2,
					side,
				},
				width,
				height,
			),
		);
	};

	<template>
		{{! template-lint-disable no-pointer-down-event-binding }}
		<div
			class="favicon-crop"
			role="slider"
			tabindex="0"
			aria-label="Crop"
			aria-valuenow={{@square.side}}
			aria-valuemin="1"
			aria-valuemax={{if
				(isWide @width @height)
				@height
				@width
			}}
			aria-valuetext={{this.valueText}}
			{{this.measure}}
			{{on "pointerdown" this.down}}
			{{on "pointermove" this.move}}
			{{on "pointerup" this.up}}
			{{on "pointercancel" this.up}}
			{{on "keydown" this.key}}
		>
			{{#if this.bounds.width}}
				<div
					class="favicon-crop-picture"
					style={{this.pictureStyle}}
				>
					<span
						class="favicon-crop-shade"
						style={{this.shadeStyle}}
					></span>
				</div>
				<div
					class="favicon-crop-square"
					style={{this.squareStyle}}
				>
					<span
						class="favicon-crop-handle"
					></span>
				</div>
			{{/if}}
		</div>
	</template>
}

function isWide(width: number, height: number) {
	return width > height;
}
