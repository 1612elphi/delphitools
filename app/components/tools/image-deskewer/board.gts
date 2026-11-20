import Component from '@glimmer/component';
import { cached, tracked } from '@glimmer/tracking';
import { fn } from '@ember/helper';
import { on } from '@ember/modifier';
import { htmlSafe } from '@ember/template';
import { modifier } from 'ember-modifier';
import CanonLoupe from 'delphicanon/components/canon-loupe';
import { frame, type LoupeSides } from 'delphicanon/lib/loupe';
import grabPan from 'delphicanon/modifiers/canon-grab-pan';
import type { Rgb } from 'delphicanon/lib/colour';
import { IconSvg } from 'delphitools-v2/components/icon';
import Slot from 'delphitools-v2/components/tools/media/slot';
import type { Point, Quad, Size } from 'delphitools-v2/lib/deskew';
import {
	bracketPath,
	emptyPixels,
	emptyQuad,
	fitRect,
	grabAt,
	gridPath,
	hintSpot,
	moveGrab,
	polygon,
	type Grab,
	type Rect,
} from 'delphitools-v2/components/tools/image-deskewer/geometry';

export interface BoardSignature {
	Args: {
		canvas?: HTMLCanvasElement;
		quad: Quad;
		valid: boolean;
		over: boolean;
		held?: number;
		onChoose: () => void;
		onMove: (quad: Quad) => void;
		onSettle: () => void;
	};
}

export const corners = ['Top left', 'Top right', 'Bottom right', 'Bottom left'];

const padding = 16;
const bracketArm = 22;
const loupe = { radius: 8, side: 116, gap: 34 };

const keySteps: Record<string, Point> = {
	ArrowLeft: { x: -1, y: 0 },
	ArrowRight: { x: 1, y: 0 },
	ArrowUp: { x: 0, y: -1 },
	ArrowDown: { x: 0, y: 1 },
};

const px = (value: number) => `${Math.round(value * 100) / 100}px`;

const box = ({ x, y, width, height }: Rect) =>
	htmlSafe(
		`left: ${px(x)}; top: ${px(y)}; width: ${px(width)}; height: ${px(height)}`,
	);

interface Drag {
	grab: Grab;
	start: Quad;
	from: Point;
}

export default class Board extends Component<BoardSignature> {
	@tracked area: Size = { width: 0, height: 0 };
	@tracked hintSize: Size = { width: 0, height: 0 };
	@tracked drag?: Drag;
	#sides?: LoupeSides;

	get pixels(): Size {
		const { canvas } = this.args;
		return canvas
			? { width: canvas.width, height: canvas.height }
			: emptyPixels;
	}

	get quad(): Quad {
		return this.args.canvas ? this.args.quad : emptyQuad;
	}

	get frame(): Rect {
		const { width, height } = this.area;
		return fitRect(this.pixels, {
			x: padding,
			y: padding,
			width: width - padding * 2,
			height: height - padding * 2,
		});
	}

	get scale() {
		return this.frame.width / this.pixels.width;
	}

	shown = ({ x, y }: Point): Point => ({
		x: this.frame.x + x * this.scale,
		y: this.frame.y + y * this.scale,
	});

	get points() {
		return this.quad.map(this.shown) as Quad;
	}

	get valid() {
		return this.args.valid || !this.args.canvas;
	}

	get frameStyle() {
		return box(this.frame);
	}

	get shade() {
		const quad = polygon(this.points);
		if (!this.args.canvas) return quad;
		const { x, y, width, height } = this.frame;
		return `M${x} ${y}h${width}v${height}h${-width}Z${quad}`;
	}

	get outline() {
		return polygon(this.points);
	}

	get grid() {
		return this.valid ? gridPath(this.points) : '';
	}

	get brackets() {
		return bracketPath(this.points, bracketArm);
	}

	get handles() {
		const { width } = this.pixels;
		return this.points.map((point, index) => {
			const pixel = this.quad[index]!;
			const x = Math.round(pixel.x);
			const y = Math.round(pixel.y);
			return {
				index,
				label: corners[index],
				style: htmlSafe(
					`left: ${px(point.x)}; top: ${px(point.y)}`,
				),
				x,
				max: width,
				text: `${x}, ${y}`,
			};
		});
	}

	get hint() {
		if (!this.args.canvas || this.drag || !this.hintSize.width)
			return undefined;
		return hintSpot(this.frame, this.points, this.hintSize);
	}

	get hintStyle() {
		const spot = this.hint;
		return spot
			? htmlSafe(`left: ${px(spot.x)}; top: ${px(spot.y)}`)
			: undefined;
	}

	get loupeIndex() {
		const { drag } = this;
		if (drag)
			return drag.grab.kind === 'corner'
				? drag.grab.index
				: -1;
		return this.args.held ?? -1;
	}

	get loupeFrame() {
		const index = this.loupeIndex;
		if (!this.args.canvas || index < 0) return undefined;
		const side = Math.min(
			loupe.side,
			Math.max(72, this.area.height * 0.4),
		);
		const placed = frame(
			this.points[index]!,
			side,
			loupe.gap,
			this.area,
			8,
			this.#sides,
		);
		return placed;
	}

	get loupeStyle() {
		const placed = this.loupeFrame;
		if (!placed) return undefined;
		return htmlSafe(
			`translate: ${px(placed.x)} ${px(placed.y)}; --canon-loupe-side: ${px(placed.width)}`,
		);
	}

	@cached
	get loupeSample(): { pixels?: ImageData; colour: Rgb } {
		const { canvas } = this.args;
		const index = this.loupeIndex;
		const grey: Rgb = [0.5, 0.5, 0.5];
		if (!canvas || index < 0) return { colour: grey };
		const context = canvas.getContext('2d', {
			willReadFrequently: true,
		});
		if (!context) return { colour: grey };
		const corner = this.quad[index]!;
		const x = Math.min(Math.floor(corner.x), canvas.width - 1);
		const y = Math.min(Math.floor(corner.y), canvas.height - 1);
		const side = loupe.radius * 2 + 1;
		const pixels = context.getImageData(
			x - loupe.radius,
			y - loupe.radius,
			side,
			side,
		);
		const centre = (loupe.radius * side + loupe.radius) * 4;
		const { data } = pixels;
		return {
			pixels,
			colour: [
				data[centre]! / 255,
				data[centre + 1]! / 255,
				data[centre + 2]! / 255,
			],
		};
	}

	get rays() {
		const placed = this.loupeFrame;
		if (!placed) return '';
		const index = this.loupeIndex;
		const points = this.points;
		const corner = points[index]!;
		const centre = placed.width / 2;
		return [points[(index + 3) % 4]!, points[(index + 1) % 4]!]
			.map((end) => {
				const dx = end.x - corner.x;
				const dy = end.y - corner.y;
				const length = Math.max(
					Math.hypot(dx, dy),
					0.001,
				);
				const reach = placed.width / length;
				return `M${centre} ${centre}l${dx * reach} ${dy * reach}`;
			})
			.join('');
	}

	get raysBox() {
		const side = this.loupeFrame?.width ?? 0;
		return `0 0 ${side} ${side}`;
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

	show = modifier(
		(element: HTMLElement, [canvas]: [HTMLCanvasElement]) => {
			element.replaceChildren(canvas);
		},
	);

	#local(event: PointerEvent) {
		const rect = (
			event.currentTarget as HTMLElement
		).getBoundingClientRect();
		return {
			x: event.clientX - rect.left,
			y: event.clientY - rect.top,
		};
	}

	#pixelsAt({ x, y }: Point): Point {
		const { frame } = this;
		const scale = this.scale || 1;
		return { x: (x - frame.x) / scale, y: (y - frame.y) / scale };
	}

	grabs = (point: Point) =>
		!!this.args.canvas && !!grabAt(point, this.points);

	begin = (event: PointerEvent) => {
		const point = this.#local(event);
		const grab = grabAt(point, this.points);
		if (!grab) return;
		event.preventDefault();
		this.drag = {
			grab,
			start: this.quad,
			from: this.#pixelsAt(point),
		};
		this.#sides = undefined;
		const placed = this.loupeFrame;
		if (placed && grab.kind === 'corner') {
			const corner = this.points[grab.index]!;
			this.#sides = {
				left: placed.x + placed.width / 2 < corner.x,
				above: placed.y + placed.height / 2 < corner.y,
			};
		}
		const root = (event.currentTarget as HTMLElement).closest(
			'.deskew-board',
		);
		if (grab.kind === 'corner')
			root?.querySelectorAll<HTMLElement>('.deskew-handle')[
				grab.index
			]?.focus({ preventScroll: true });
	};

	move = (event: PointerEvent) => {
		const { drag } = this;
		if (!drag) return;
		const now = this.#pixelsAt(this.#local(event));
		this.args.onMove(
			moveGrab(
				drag.start,
				drag.grab,
				{
					x: now.x - drag.from.x,
					y: now.y - drag.from.y,
				},
				this.pixels,
			),
		);
	};

	end = () => {
		if (!this.drag) return;
		this.drag = undefined;
		this.#sides = undefined;
		this.args.onSettle();
	};

	key = (index: number, event: KeyboardEvent) => {
		const step = keySteps[event.key];
		if (!step) return;
		event.preventDefault();
		const by = event.shiftKey ? 10 : 1;
		this.args.onMove(
			moveGrab(
				this.quad,
				{ kind: 'corner', index },
				{ x: step.x * by, y: step.y * by },
				this.pixels,
			),
		);
		this.args.onSettle();
	};

	<template>
		<div
			class="deskew-board
				{{if @canvas 'deskew-board--loaded'}}
				{{unless this.valid 'deskew-board--crossed'}}
				{{if this.drag 'deskew-board--dragging'}}"
			{{this.measure}}
			{{grabPan
				grabs=this.grabs
				onBegin=this.begin
				onMove=this.move
				onEnd=this.end
			}}
		>
			{{#if this.area.width}}
				{{#if @canvas}}
					<div
						class="deskew-image"
						style={{this.frameStyle}}
						{{this.show @canvas}}
					></div>
				{{else}}
					<Slot
						class="deskew-slot"
						style={{this.frameStyle}}
						@prompt="Drop an image"
						@icon="vector-square"
						@dashed={{true}}
						@over={{@over}}
						@onChoose={{@onChoose}}
					/>
				{{/if}}
				<svg class="deskew-marks" aria-hidden="true">
					<path
						class="deskew-shade"
						d={{this.shade}}
						fill-rule="evenodd"
					/>
					<path
						class="deskew-grid"
						d={{this.grid}}
					/>
					<path
						class="deskew-outline"
						d={{this.outline}}
					/>
					<path
						class="deskew-brackets"
						d={{this.brackets}}
					/>
				</svg>
				{{#if @canvas}}
					{{#each this.handles as |handle|}}
						<span
							class="deskew-handle"
							style={{handle.style}}
							role="slider"
							tabindex="0"
							aria-label={{handle.label}}
							aria-valuenow={{handle.x}}
							aria-valuemin="0"
							aria-valuemax={{handle.max}}
							aria-valuetext={{handle.text}}
							aria-keyshortcuts="ArrowLeft ArrowRight ArrowUp ArrowDown"
							{{on
								"keydown"
								(fn
									this.key
									handle.index
								)
							}}
						></span>
					{{/each}}
					<span
						class="deskew-hint
							{{if
								this.hint
								'deskew-hint--shown'
							}}"
						style={{this.hintStyle}}
						aria-hidden="true"
						{{this.measureHint}}
					><IconSvg @name="move" />Drag the
						corners</span>
					{{#if this.loupeStyle}}
						<div
							class="deskew-loupe"
							style={{this.loupeStyle}}
						>
							<CanonLoupe
								@pixels={{this.loupeSample.pixels}}
								@colour={{this.loupeSample.colour}}
							/>
							<svg
								class="deskew-rays"
								viewBox={{this.raysBox}}
								aria-hidden="true"
							><path
									d={{this.rays}}
								/></svg>
						</div>
					{{/if}}
				{{/if}}
			{{/if}}
		</div>
	</template>
}
