import Component from '@glimmer/component';
import { on } from '@ember/modifier';
import { modifier } from 'ember-modifier';
import { hex, rgb255, type Rgb } from 'delphicanon/lib/colour';
import {
	baseIndex,
	colourIn,
	maxRadius,
	modes,
	monochromatic,
	ringColour,
	wrapped,
	type Parts,
	type WheelSpace,
} from 'delphitools-v2/components/tools/harmony-genny/harmony';

interface WheelSignature {
	Args: {
		space: WheelSpace;
		parts: Parts;
		mode: number;
		colours: Rgb[];
		onTurn: (hue: number, radius: number) => void;
	};
}

const planeShare = 0.86;
const ringFrom = planeShare + 0.012;
const notch = 15;
const baseBead = 0.08;
const partnerBead = baseBead * 0.82;
const ladderSpacing = 0.2;

const point = (hue: number, distance: number) => {
	const radians = (hue * Math.PI) / 180;
	return [
		distance * Math.sin(radians),
		-distance * Math.cos(radians),
	] as const;
};

function ladder(base: number, rung: number) {
	const low = base - 2 * ladderSpacing;
	const high = base + 2 * ladderSpacing;
	let shift = 0;
	if (low < ladderSpacing * 0.8) shift = ladderSpacing * 0.8 - low;
	if (high + shift > 0.96) shift = 0.96 - high;
	return base + rung * ladderSpacing + shift;
}

function paintPlane(
	canvas: HTMLCanvasElement,
	space: WheelSpace,
	l: number,
	size: number,
) {
	canvas.width = size;
	canvas.height = size;
	const context = canvas.getContext('2d');
	if (!context) return;
	const image = context.createImageData(size, size);
	const data = image.data;
	const bins = Math.max(720, Math.ceil(Math.PI * size));
	const most = Array.from({ length: bins }, (_, i) =>
		maxRadius(space, l, (i * 360) / bins),
	);
	const ring = Array.from({ length: bins }, (_, i) =>
		rgb255(ringColour(space, (i * 360) / bins)),
	);
	const half = size / 2;
	const pixel = 1 / (planeShare * half);
	for (let y = 0; y < size; y++) {
		for (let x = 0; x < size; x++) {
			const dx = x + 0.5 - half;
			const dy = y + 0.5 - half;
			const r = Math.hypot(dx, dy) / half;
			if (r > 1) continue;
			const hue = wrapped(
				(Math.atan2(dx, -dy) * 180) / Math.PI,
			);
			const bin = Math.min(
				Math.floor((hue / 360) * bins),
				bins - 1,
			);
			let rgb: readonly number[];
			let alpha: number;
			if (r <= planeShare) {
				const radius = r / planeShare;
				alpha = Math.min(
					1,
					(most[bin]! - radius) / pixel + 0.5,
					(planeShare - r) * half + 0.5,
				);
				if (alpha <= 0) continue;
				rgb = rgb255(
					colourIn(
						space,
						l,
						Math.min(radius, most[bin]!),
						hue,
					),
				);
			} else if (r >= ringFrom) {
				rgb = ring[bin]!;
				alpha = Math.min(1, (1 - r) * half);
			} else continue;
			const at = (y * size + x) * 4;
			data[at] = rgb[0]!;
			data[at + 1] = rgb[1]!;
			data[at + 2] = rgb[2]!;
			data[at + 3] = Math.round(alpha * 255);
		}
	}
	context.putImageData(image, 0, 0);
}

const ticks = Array.from({ length: 360 / notch }, (_, i) => {
	const ringInner = planeShare + (1 - planeShare) * 0.3;
	const from = point(i * notch, i % 2 ? (ringInner + 1) / 2 : ringInner);
	const to = point(i * notch, 1.01);
	return `M${from[0]} ${from[1]}L${to[0]} ${to[1]}`;
}).join('');

const keySteps: Record<string, number> = {
	ArrowRight: 1,
	ArrowUp: 1,
	ArrowLeft: -1,
	ArrowDown: -1,
	PageUp: notch,
	PageDown: -notch,
};

export default class Wheel extends Component<WheelSignature> {
	ticks = ticks;

	get hue() {
		return Math.round(wrapped(this.args.parts.h)) % 360;
	}

	get slots() {
		const { parts, mode } = this.args;
		if (mode === monochromatic)
			return this.args.colours.map((_, i) => ({
				offset: 0,
				distance: ladder(parts.r, 2 - i),
			}));
		return modes[mode]!.angles.map((offset) => ({
			offset,
			distance: parts.r,
		}));
	}

	get beads() {
		const { parts, colours } = this.args;
		return this.slots
			.map(({ offset, distance }, i) => {
				const [x, y] = point(
					parts.h + offset,
					distance * planeShare,
				);
				const base = i === baseIndex(this.args.mode);
				return {
					x,
					y,
					angle: wrapped(parts.h + offset),
					fill: hex(colours[i] ?? [0, 0, 0]),
					base,
					size: base ? baseBead : partnerBead,
				};
			})
			.sort((a, b) => Number(a.base) - Number(b.base));
	}

	get spokes() {
		return this.beads.map(({ x, y }) => `M0 0L${x} ${y}`).join('');
	}

	get shape() {
		if (this.args.mode === monochromatic) return '';
		return [...this.beads]
			.sort((a, b) => a.angle - b.angle)
			.map(({ x, y }) => `${x},${y}`)
			.join(' ');
	}

	paint = modifier(
		(
			canvas: HTMLCanvasElement,
			[space, l]: [WheelSpace, number],
		) => {
			let frame = 0;
			let sharpen = 0;
			const paintAt = (scale: number) => {
				const size = Math.round(
					canvas.clientWidth * scale,
				);
				if (size) paintPlane(canvas, space, l, size);
			};
			// ponytail: a full-ratio paint takes 70-120 ms at DPR 2, so changes paint at CSS size and sharpen once they stop
			const draw = () => {
				cancelAnimationFrame(frame);
				clearTimeout(sharpen);
				frame = requestAnimationFrame(() => {
					paintAt(1);
					if (window.devicePixelRatio !== 1)
						sharpen = window.setTimeout(
							() =>
								paintAt(
									window.devicePixelRatio,
								),
							150,
						);
				});
			};
			let ratio: MediaQueryList | undefined;
			const watchRatio = () => {
				ratio?.removeEventListener('change', onRatio);
				ratio = window.matchMedia(
					`(resolution: ${window.devicePixelRatio}dppx)`,
				);
				ratio.addEventListener('change', onRatio);
			};
			const onRatio = () => {
				watchRatio();
				draw();
			};
			watchRatio();
			const observer = new ResizeObserver(draw);
			observer.observe(canvas);
			return () => {
				cancelAnimationFrame(frame);
				clearTimeout(sharpen);
				observer.disconnect();
				ratio?.removeEventListener('change', onRatio);
			};
		},
	);

	#polar(disc: HTMLElement, event: PointerEvent) {
		const box = disc.getBoundingClientRect();
		const dx = (event.clientX - box.left) / (box.width / 2) - 1;
		const dy = (event.clientY - box.top) / (box.height / 2) - 1;
		return {
			hue: wrapped((Math.atan2(dx, -dy) * 180) / Math.PI),
			radius: Math.hypot(dx, dy) / planeShare,
		};
	}

	turn = modifier((disc: HTMLElement) => {
		let grab:
			| { offset: number; radial: boolean; from: number }
			| undefined;
		const down = (event: PointerEvent) => {
			const { hue, radius } = this.#polar(disc, event);
			if (radius * planeShare > 1.02) return;
			const [x, y] = point(hue, radius * planeShare);
			const near = this.slots.findIndex(
				({ offset, distance }) => {
					const [bx, by] = point(
						this.args.parts.h + offset,
						distance * planeShare,
					);
					return (
						Math.hypot(x - bx, y - by) <
						baseBead * 1.4
					);
				},
			);
			const radial =
				near >= 0 && this.args.mode !== monochromatic;
			grab = {
				offset: radial ? this.slots[near]!.offset : 0,
				radial,
				from: hue - this.args.parts.h,
			};
			disc.setPointerCapture(event.pointerId);
			disc.focus();
			event.preventDefault();
		};
		const move = (event: PointerEvent) => {
			if (!grab || !disc.hasPointerCapture(event.pointerId))
				return;
			const { hue, radius } = this.#polar(disc, event);
			if (grab.radial)
				this.args.onTurn(
					wrapped(hue - grab.offset),
					Math.min(radius, 1),
				);
			else
				this.args.onTurn(
					wrapped(hue - grab.from),
					this.args.parts.r,
				);
		};
		const up = () => (grab = undefined);
		disc.addEventListener('pointerdown', down);
		disc.addEventListener('pointermove', move);
		disc.addEventListener('pointerup', up);
		disc.addEventListener('pointercancel', up);
		return () => {
			disc.removeEventListener('pointerdown', down);
			disc.removeEventListener('pointermove', move);
			disc.removeEventListener('pointerup', up);
			disc.removeEventListener('pointercancel', up);
		};
	});

	key = (event: KeyboardEvent) => {
		const step = keySteps[event.key];
		if (step === undefined) return;
		event.preventDefault();
		const { h, r } = this.args.parts;
		const next =
			Math.abs(step) === notch
				? Math.round(h / notch) * notch + step
				: Math.round(h) + step;
		this.args.onTurn(wrapped(next), r);
	};

	<template>
		<div class="hg-wheel">
			<output class="hg-wheel-figure">{{this.hue}}°</output>
			<div class="hg-wheel-disc">
				<svg
					class="hg-wheel-under"
					viewBox="-1 -1 2 2"
					aria-hidden="true"
				>
					<circle
						class="hg-wheel-well"
						r="0.86"
					/>
				</svg>
				<canvas
					class="hg-wheel-plane"
					{{this.paint @space @parts.l}}
				></canvas>
				<svg
					class="hg-wheel-over"
					viewBox="-1 -1 2 2"
					aria-hidden="true"
				>
					<path
						class="hg-wheel-ticks"
						d={{this.ticks}}
					/>
					{{#if this.shape}}
						<polygon
							class="hg-wheel-shape"
							points={{this.shape}}
						/>
					{{/if}}
					<path
						class="hg-wheel-spokes"
						d={{this.spokes}}
					/>
					<circle
						class="hg-wheel-hub"
						r="0.018"
					/>
					{{#each this.beads as |bead|}}
						<circle
							class="hg-wheel-bead
								{{if
									bead.base
									'hg-wheel-bead--base'
								}}"
							cx={{bead.x}}
							cy={{bead.y}}
							r={{bead.size}}
							fill={{bead.fill}}
						/>
					{{/each}}
				</svg>
				<div
					class="hg-wheel-control"
					role="slider"
					tabindex="0"
					aria-label="Hue"
					aria-valuemin="0"
					aria-valuemax="360"
					aria-valuenow={{this.hue}}
					aria-valuetext="{{this.hue}}°"
					{{this.turn}}
					{{on "keydown" this.key}}
				></div>
			</div>
		</div>
	</template>
}
