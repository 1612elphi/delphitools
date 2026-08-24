import type { Effect } from './doc-model';

export interface EffectGeom {
	kx: number;
	ky: number;
	angle: number;
	flipX: boolean;
	flipY: boolean;
}

const num = (v: number | string | undefined): number =>
	typeof v === 'number' ? v : 0;
const str = (v: number | string | undefined): string =>
	typeof v === 'string' ? v : '';

const strokeGeom = (p: Effect['params']): { pos: string; r: number } => {
	const pos = str(p.position);
	return { pos, r: num(p.width) * (pos === 'centre' ? 0.5 : 1) };
};

const BLUR_REACH = 1.2;
export function effectsReach(effects: readonly Effect[]): number {
	let r = 0;
	for (const e of effects) {
		const p = e.params;
		switch (e.type) {
			case 'drop-shadow':
				r = Math.max(
					r,
					Math.hypot(
						num(p.offsetX),
						num(p.offsetY),
					) +
						num(p.blur) * BLUR_REACH +
						num(p.spread),
				);
				break;
			case 'outer-glow':
				r = Math.max(r, num(p.blur) * BLUR_REACH);
				break;
			case 'stroke': {
				const { pos, r: w } = strokeGeom(p);
				if (pos !== 'inner') r = Math.max(r, w);
				break;
			}
		}
	}
	return r === 0 ? 0 : Math.ceil(r) + 2;
}

const pool: HTMLCanvasElement[] = [];
export function getScratch(
	i: number,
	w: number,
	h: number,
): CanvasRenderingContext2D {
	const c = pool[i] ?? (pool[i] = document.createElement('canvas'));
	const resized = c.width !== w || c.height !== h;
	if (resized) {
		// canvas resize resets state
		c.width = w;
		c.height = h;
	}
	const ctx = c.getContext('2d')!;
	ctx.setTransform(1, 0, 0, 1, 0, 0);
	ctx.globalCompositeOperation = 'source-over';
	ctx.globalAlpha = 1;
	if (!resized) ctx.clearRect(0, 0, w, h);
	return ctx;
}

const OFF = 1e5;
function stampShadow(
	ctx: CanvasRenderingContext2D,
	src: CanvasImageSource,
	colour: string,
	blur: number,
	dx: number,
	dy: number,
	alpha: number,
): void {
	ctx.save();
	ctx.globalAlpha = alpha;
	ctx.shadowColor = colour;
	ctx.shadowBlur = blur;
	ctx.shadowOffsetX = OFF + dx;
	ctx.shadowOffsetY = dy;
	ctx.drawImage(src, -OFF, 0);
	ctx.restore();
}

function blit(
	ctx: CanvasRenderingContext2D,
	src: HTMLCanvasElement,
	alpha: number,
	times = 1,
): void {
	ctx.globalAlpha = alpha;
	for (let i = 0; i < times; i++) ctx.drawImage(src, 0, 0);
	ctx.globalAlpha = 1;
}

const RING = 24;
const UNIT_RING = Array.from({ length: RING }, (_, i) => {
	const a = (i / RING) * 2 * Math.PI;
	return [Math.cos(a), Math.sin(a)] as const;
});

function dilate(
	dst: CanvasRenderingContext2D,
	src: CanvasImageSource,
	r: number,
	colour: string,
	tmp: CanvasRenderingContext2D,
): void {
	stampShadow(tmp, src, colour, 0, 0, 0, 1);
	dst.drawImage(tmp.canvas, 0, 0);
	for (const [ux, uy] of UNIT_RING)
		dst.drawImage(tmp.canvas, ux * r, uy * r);
}

function erode(
	dst: CanvasRenderingContext2D,
	src: CanvasImageSource,
	r: number,
): void {
	dst.drawImage(src, 0, 0);
	dst.globalCompositeOperation = 'destination-in';
	for (const [ux, uy] of UNIT_RING) dst.drawImage(src, ux * r, uy * r);
	dst.globalCompositeOperation = 'source-over';
}

function tintContent(
	colour: string,
	content: HTMLCanvasElement,
): CanvasRenderingContext2D {
	const b = getScratch(1, content.width, content.height);
	b.fillStyle = colour;
	b.fillRect(0, 0, content.width, content.height);
	b.globalCompositeOperation = 'destination-in';
	b.drawImage(content, 0, 0);
	b.globalCompositeOperation = 'source-over';
	return b;
}

function carve(
	colour: string,
	content: HTMLCanvasElement,
	blur: number,
	dx: number,
	dy: number,
): HTMLCanvasElement {
	const b = tintContent(colour, content);
	b.globalCompositeOperation = 'destination-out';
	stampShadow(b, content, '#000', blur, dx, dy, 1);
	b.globalCompositeOperation = 'source-over';
	return b.canvas;
}

function bakedOffset(
	ox: number,
	oy: number,
	g: EffectGeom,
): { dx: number; dy: number } {
	const rad = (-g.angle * Math.PI) / 180;
	let dx = ox * Math.cos(rad) - oy * Math.sin(rad);
	let dy = ox * Math.sin(rad) + oy * Math.cos(rad);
	if (g.flipX) dx = -dx;
	if (g.flipY) dy = -dy;
	return { dx: dx * g.kx, dy: dy * g.ky };
}

export function paintEffects(
	ctx: CanvasRenderingContext2D,
	content: HTMLCanvasElement,
	effects: readonly Effect[],
	geom: EffectGeom,
): void {
	const k = (geom.kx + geom.ky) / 2;
	ctx.save();
	ctx.setTransform(1, 0, 0, 1, 0, 0);
	for (const e of effects) paintBehind(ctx, content, e, geom, k);
	ctx.drawImage(content, 0, 0);
	for (const e of effects) paintInFront(ctx, content, e, geom, k);
	ctx.restore();
}

function paintBehind(
	ctx: CanvasRenderingContext2D,
	content: HTMLCanvasElement,
	e: Effect,
	g: EffectGeom,
	k: number,
): void {
	const p = e.params;
	switch (e.type) {
		case 'drop-shadow': {
			const colour = str(p.colour);
			const spread = num(p.spread) * k;
			const { dx, dy } = bakedOffset(
				num(p.offsetX),
				num(p.offsetY),
				g,
			);
			let src: CanvasImageSource = content;
			if (spread >= 0.5) {
				const b = getScratch(
					1,
					content.width,
					content.height,
				);
				dilate(
					b,
					content,
					spread,
					colour,
					getScratch(
						2,
						content.width,
						content.height,
					),
				);
				src = b.canvas;
			}
			stampShadow(
				ctx,
				src,
				colour,
				num(p.blur) * k,
				dx,
				dy,
				num(p.opacity) / 100,
			);
			break;
		}
		case 'outer-glow': {
			const a = num(p.intensity) / 100;
			if (a === 0) break;
			const b = getScratch(1, content.width, content.height);
			stampShadow(
				b,
				content,
				str(p.colour),
				num(p.blur) * k,
				0,
				0,
				1,
			);
			// increase glow opacity
			blit(ctx, b.canvas, a, 2);
			break;
		}
		case 'stroke': {
			const { pos, r } = strokeGeom(p);
			if (pos === 'inner') break;
			dilate(
				ctx,
				content,
				r * k,
				str(p.colour),
				getScratch(1, content.width, content.height),
			);
			break;
		}
	}
}

function paintInFront(
	ctx: CanvasRenderingContext2D,
	content: HTMLCanvasElement,
	e: Effect,
	g: EffectGeom,
	k: number,
): void {
	const p = e.params;
	switch (e.type) {
		case 'inner-shadow': {
			const { dx, dy } = bakedOffset(
				num(p.offsetX),
				num(p.offsetY),
				g,
			);
			blit(
				ctx,
				carve(
					str(p.colour),
					content,
					num(p.blur) * k,
					dx,
					dy,
				),
				num(p.opacity) / 100,
			);
			break;
		}
		case 'inner-glow': {
			const a = num(p.intensity) / 100;
			if (a > 0)
				blit(
					ctx,
					carve(
						str(p.colour),
						content,
						num(p.blur) * k,
						0,
						0,
					),
					a,
					2,
				);
			break;
		}
		case 'colour-overlay':
			blit(
				ctx,
				tintContent(str(p.colour), content).canvas,
				num(p.opacity) / 100,
			);
			break;
		case 'stroke': {
			const { pos, r } = strokeGeom(p);
			if (pos === 'outer') break;
			const b = getScratch(1, content.width, content.height);
			stampShadow(b, content, str(p.colour), 0, 0, 0, 1);
			const c = getScratch(2, content.width, content.height);
			erode(c, content, r * k);
			b.globalCompositeOperation = 'destination-out';
			b.drawImage(c.canvas, 0, 0);
			blit(ctx, b.canvas, 1);
			break;
		}
	}
}
