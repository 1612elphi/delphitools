/**
 * Effect compositor (M3 effects engine) — pure Canvas2D, fabric-free. Paints a
 * layer's `effects[]` around its rendered content inside the object's cache
 * canvas, in the ratified composite order:
 *
 *   outer effects (behind) → content (+filters) → inner effects (in front,
 *   clipped to the content's alpha) → [opacity/blend apply at the cache blit].
 *
 * Everything works in DEVICE space (the cache canvas' pixels) under an identity
 * transform — a file-wide contract: paintEffects sets it on the cache ctx, and
 * getScratch hands out reset contexts. The one primitive is the canvas shadow
 * trick: painting a source far off-canvas with shadowOffsetX pulled back leaves
 * only its (optionally blurred, colour-tinted) silhouette — blur, tint,
 * dilation and erosion all compose from it, so there is no per-pixel work and
 * no ctx.filter dependency (Safari lacks it; shadow* is universal, and it's
 * what Fabric itself uses).
 *
 * Params arrive COMPLETE: syncImageEffects merges registry defaults before the
 * stack reaches an EffectsImage (the filter-factory convention — the renderer
 * never guesses its own), so painters read them bare. The registry's `phase`
 * field is descriptive taxonomy; the renderer routes per type, with stroke
 * split across both passes by its `position` param.
 *
 * Array order = apply order = paint order (the filters-stack convention,
 * ratified 2026-07-03): the panel's TOP effect paints first, so an outer
 * effect at the top sits deepest behind the content.
 *
 * Approximations (all deliberate, all bounded by the cache-size cap):
 * ponytail: dilation/erosion = a fixed 24-stamp ring — facets on very large
 * width×zoom; upgrade = multi-ring or an SDF pass if Ruby's QA minds.
 * ponytail: scalar blur uses the mean of kx/ky — non-uniform layer scale makes
 * a blur that should be elliptical render round.
 */

import type { Effect } from './doc-model';

/** Scene-px → device-px factors + the blit transform the offsets must undo. */
export interface EffectGeom {
	kx: number;
	ky: number;
	/** object's total rotation (deg) — baked offsets counter-rotate so shadow
	 *  direction stays scene-absolute (light doesn't rotate with the layer) */
	angle: number;
	flipX: boolean;
	flipY: boolean;
}

/** Type narrowing only — params are default-merged upstream, never absent. */
const num = (v: number | string | undefined): number =>
	typeof v === 'number' ? v : 0;
const str = (v: number | string | undefined): string =>
	typeof v === 'string' ? v : '';

/** Stroke position + effective ring radius (centre straddles the edge). */
const strokeGeom = (p: Effect['params']): { pos: string; r: number } => {
	const pos = str(p.position);
	return { pos, r: num(p.width) * (pos === 'centre' ? 0.5 : 1) };
};

/**
 * Max distance (scene px) the stack reaches OUTSIDE the layer bounds — the
 * cache-canvas padding. 0 when nothing overflows. Canvas shadowBlur `b` is
 * σ = b/2, still ~2% alpha at distance b — count it at 1.2× so a max-blur
 * shadow fades out inside the pad instead of clipping to a hard seam.
 */
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

/**
 * Pooled scratch canvases (0 = the content layer the EffectsImage renders,
 * 1/2 = the painters' working surfaces). Returned reset: identity transform,
 * source-over, alpha 1, cleared. ponytail: the pool holds its high-water size
 * (bounded by Fabric's cache cap, ~2 MP each); shrink-on-idle if memory matters.
 */
const pool: HTMLCanvasElement[] = [];
export function getScratch(
	i: number,
	w: number,
	h: number,
): CanvasRenderingContext2D {
	const c = pool[i] ?? (pool[i] = document.createElement('canvas'));
	const resized = c.width !== w || c.height !== h;
	if (resized) {
		c.width = w; // resizing also resets all context state, clear included
		c.height = h;
	}
	const ctx = c.getContext('2d')!;
	ctx.setTransform(1, 0, 0, 1, 0, 0);
	ctx.globalCompositeOperation = 'source-over';
	ctx.globalAlpha = 1;
	if (!resized) ctx.clearRect(0, 0, w, h);
	return ctx;
}

/** Paint src far off-canvas so only its shadow — a colour-tinted, blurred
 *  silhouette at (dx, dy) — lands on ctx. Honours the caller's compositeOp. */
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

/** Draw src onto ctx at a given alpha, optionally stacked (n blits of alpha a
 *  composite to 1−(1−a)ⁿ — the glow intensity ramp). */
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

/** Morphological dilation by r: tint the silhouette ONCE into tmp, then union
 *  it across the ring — the shadow render is paid once, the stamps are blits.
 *  ponytail: repeated stamps treat alpha as near-binary — 50%-alpha content
 *  dilates to ~opaque and erodes to ~nothing (stroke on translucent pixels
 *  degrades); a threshold pass on tmp if that ever matters. */
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

/** Morphological erosion by r, onto a fresh scratch: copy src, then intersect
 *  with ring-shifted copies of it. */
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

/** The content's silhouette filled flat: colour ∧ content alpha. */
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

/** tintContent minus a blurred/offset silhouette of the content — the classic
 *  inner-shadow/glow field (the alpha ops commute, so mask-then-subtract). */
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

/** Scene-space offset → cache-local device px: the cache blit re-applies the
 *  object's rotation + flips, so bake their inverse (rotate first, then flip —
 *  the inverse composition order of fabric's rotate∘flip transform). */
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

/**
 * The engine: paint the enabled stack around `content` (the layer rendered to
 * a device-space scratch matching ctx's canvas) onto the cache ctx.
 */
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

/** Outer pass — painted before (so behind) the content. */
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
			// Double blit: combined alpha 2a−a², so intensity ramps softly to solid.
			blit(ctx, b.canvas, a, 2);
			break;
		}
		case 'stroke': {
			const { pos, r } = strokeGeom(p);
			if (pos === 'inner') break;
			// Dilated silhouette straight onto the cache; the content re-covers the
			// interior. ponytail: semi-transparent content shows the stroke beneath —
			// subtract the eroded interior first if that ever reads wrong.
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

/** Inner pass — painted after the content, every result masked to its alpha. */
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
			// Ring = silhouette minus its erosion.
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
