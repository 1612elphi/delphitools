import Component from '@glimmer/component';
import { modifier } from 'ember-modifier';
import { Knob } from 'delphitools-v2/components/substrata/modules/colour-picker-kit';
import { clamp01 } from 'delphitools-v2/modifiers/pointer-area';
import {
	beginTransient,
	commitTransient,
} from 'delphitools-v2/lib/substrata/doc-store';
import { hsvToRgb, wrapHue } from 'delphitools-v2/lib/substrata/colour-hsv';
import {
	setHsv,
	type ColourSnapshot,
} from 'delphitools-v2/lib/substrata/colour-store';

const RING_OUTER = 0.5;
const RING_KNOB_R = 0.45;
const TRI_R = 0.33;

const WHEEL_PX = 168;
const SS = 2;

const DEG = 180 / Math.PI;

interface Pt {
	x: number;
	y: number;
}

const hueToConic = (h: number): number => wrapHue(450 - h);

function pointToHue(nx: number, ny: number): number {
	const conic = Math.atan2(nx - 0.5, -(ny - 0.5)) * DEG;
	return wrapHue(450 - conic);
}

function triCorners(hue: number): { hueC: Pt; white: Pt; black: Pt } {
	const conic = hueToConic(hue);
	const at = (offset: number): Pt => {
		const t = (conic + offset) / DEG;
		return {
			x: 0.5 + TRI_R * Math.sin(t),
			y: 0.5 - TRI_R * Math.cos(t),
		};
	};
	return { hueC: at(0), white: at(120), black: at(240) };
}

function bary(p: Pt, a: Pt, b: Pt, c: Pt): [number, number, number] {
	const v0x = b.x - a.x;
	const v0y = b.y - a.y;
	const v1x = c.x - a.x;
	const v1y = c.y - a.y;
	const v2x = p.x - a.x;
	const v2y = p.y - a.y;
	const d00 = v0x * v0x + v0y * v0y;
	const d01 = v0x * v1x + v0y * v1y;
	const d11 = v1x * v1x + v1y * v1y;
	const d20 = v2x * v0x + v2y * v0y;
	const d21 = v2x * v1x + v2y * v1y;
	const inv = 1 / (d00 * d11 - d01 * d01 || 1);
	const wb = (d11 * d20 - d01 * d21) * inv;
	const wc = (d00 * d21 - d01 * d20) * inv;
	return [1 - wb - wc, wb, wc];
}

function closestOnSeg(p: Pt, a: Pt, b: Pt): Pt {
	const abx = b.x - a.x;
	const aby = b.y - a.y;
	const t = clamp01(
		((p.x - a.x) * abx + (p.y - a.y) * aby) /
			(abx * abx + aby * aby || 1),
	);
	return { x: a.x + abx * t, y: a.y + aby * t };
}

function clampToTri(p: Pt, a: Pt, b: Pt, c: Pt): Pt {
	const [wa, wb, wc] = bary(p, a, b, c);
	if (wa >= 0 && wb >= 0 && wc >= 0) return p;
	const cands = [
		closestOnSeg(p, a, b),
		closestOnSeg(p, b, c),
		closestOnSeg(p, c, a),
	];
	let best = cands[0] as Pt;
	let bd = Infinity;
	for (const q of cands) {
		const d = (q.x - p.x) ** 2 + (q.y - p.y) ** 2;
		if (d < bd) {
			bd = d;
			best = q;
		}
	}
	return best;
}

function pointToSV(p: Pt, hue: number): { s: number; v: number } {
	const { hueC, white, black } = triCorners(hue);
	const q = clampToTri(p, hueC, white, black);
	const weights = bary(q, hueC, white, black);
	const wa = Math.max(0, weights[0]);
	const wb = Math.max(0, weights[1]);
	const v = clamp01(wa + wb);
	const s = v > 1e-4 ? clamp01(wa / v) : 0;
	return { s, v };
}

const paintTriangle = modifier((canvas: HTMLCanvasElement, [hue]: [number]) => {
	const painted = canvas as HTMLCanvasElement & { _hue?: number };
	if (painted._hue === hue) return;
	painted._hue = hue;
	const ctx = canvas.getContext('2d');
	if (!ctx) return;

	const W = WHEEL_PX * SS;
	canvas.width = W;
	canvas.height = W;

	const { hueC, white, black } = triCorners(hue);
	const ax = hueC.x * W;
	const ay = hueC.y * W;
	const v0x = white.x * W - ax;
	const v0y = white.y * W - ay;
	const v1x = black.x * W - ax;
	const v1y = black.y * W - ay;
	const d00 = v0x * v0x + v0y * v0y;
	const d01 = v0x * v1x + v0y * v1y;
	const d11 = v1x * v1x + v1y * v1y;
	const inv = 1 / (d00 * d11 - d01 * d01 || 1);

	const { r: hr, g: hg, b: hb } = hsvToRgb({ h: hue, s: 1, v: 1 });

	const img = ctx.createImageData(W, W);
	const data = img.data;
	for (let py = 0; py < W; py++) {
		for (let px = 0; px < W; px++) {
			const v2x = px + 0.5 - ax;
			const v2y = py + 0.5 - ay;
			const d20 = v2x * v0x + v2y * v0y;
			const d21 = v2x * v1x + v2y * v1y;
			const wb = (d11 * d20 - d01 * d21) * inv;
			const wc = (d00 * d21 - d01 * d20) * inv;
			const wa = 1 - wb - wc;
			if (wa < 0 || wb < 0 || wc < 0) continue;
			const i = (py * W + px) * 4;
			data[i] = Math.round(wa * hr + wb * 255);
			data[i + 1] = Math.round(wa * hg + wb * 255);
			data[i + 2] = Math.round(wa * hb + wb * 255);
			data[i + 3] = 255;
		}
	}
	ctx.putImageData(img, 0, 0);
});

export interface TriangleModeSignature {
	Args: { colour: ColourSnapshot };
}

export default class TriangleMode extends Component<TriangleModeSignature> {
	#drag: 'ring' | 'tri' | null = null;

	get hue() {
		return this.args.colour.hsv.h;
	}

	#write(nx: number, ny: number) {
		if (this.#drag === 'ring') {
			setHsv({ h: pointToHue(nx, ny) });
		} else if (this.#drag === 'tri') {
			const { s, v } = pointToSV({ x: nx, y: ny }, this.hue);
			if (v <= 1e-4) setHsv({ v: 0 });
			else setHsv({ s, v });
		}
	}

	onPointerDown = (event: PointerEvent) => {
		const el = event.currentTarget as HTMLElement;
		const r = el.getBoundingClientRect();
		const nx = (event.clientX - r.left) / r.width;
		const ny = (event.clientY - r.top) / r.height;
		const { hueC, white, black } = triCorners(this.hue);
		const [wa, wb, wc] = bary({ x: nx, y: ny }, hueC, white, black);
		if (wa >= 0 && wb >= 0 && wc >= 0) this.#drag = 'tri';
		else if (Math.hypot(nx - 0.5, ny - 0.5) <= RING_OUTER)
			this.#drag = 'ring';
		else return;
		el.setPointerCapture(event.pointerId);
		// coalesce drag undo
		beginTransient();
		this.#write(nx, ny);
	};

	onPointerMove = (event: PointerEvent) => {
		if (!this.#drag) return;
		const el = event.currentTarget as HTMLElement;
		const r = el.getBoundingClientRect();
		this.#write(
			(event.clientX - r.left) / r.width,
			(event.clientY - r.top) / r.height,
		);
	};

	onPointerUp = (event: PointerEvent) => {
		if (!this.#drag) return;
		this.#drag = null;
		(event.currentTarget as HTMLElement).releasePointerCapture?.(
			event.pointerId,
		);
		commitTransient();
	};

	surface = modifier((element: HTMLElement) => {
		element.addEventListener('pointerdown', this.onPointerDown);
		element.addEventListener('pointermove', this.onPointerMove);
		element.addEventListener('pointerup', this.onPointerUp);
		element.addEventListener('pointercancel', this.onPointerUp);
		return () => {
			element.removeEventListener(
				'pointerdown',
				this.onPointerDown,
			);
			element.removeEventListener(
				'pointermove',
				this.onPointerMove,
			);
			element.removeEventListener(
				'pointerup',
				this.onPointerUp,
			);
			element.removeEventListener(
				'pointercancel',
				this.onPointerUp,
			);
		};
	});

	get ringKnob() {
		const conic = hueToConic(this.hue) / DEG;
		return {
			x: 0.5 + RING_KNOB_R * Math.sin(conic),
			y: 0.5 - RING_KNOB_R * Math.cos(conic),
		};
	}

	get triKnob() {
		const { hsv } = this.args.colour;
		const { hueC, white, black } = triCorners(this.hue);
		const wa = hsv.s * hsv.v;
		const wb = hsv.v * (1 - hsv.s);
		const wc = 1 - hsv.v;
		return {
			x: wa * hueC.x + wb * white.x + wc * black.x,
			y: wa * hueC.y + wb * white.y + wc * black.y,
		};
	}

	<template>
		<div class="sub-cp-wheelpad">
			<div
				class="sub-cp-wheelwrap"
				role="group"
				aria-label="HSV triangle"
				{{this.surface}}
			>
				<div
					class="sub-cp-ring"
					aria-hidden="true"
				></div>
				<canvas
					class="sub-cp-tri"
					aria-hidden="true"
					{{paintTriangle this.hue}}
				></canvas>
				<Knob
					@x={{this.ringKnob.x}}
					@y={{this.ringKnob.y}}
				/>
				<Knob
					@x={{this.triKnob.x}}
					@y={{this.triKnob.y}}
				/>
			</div>
		</div>
	</template>
}
