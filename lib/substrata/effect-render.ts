/**
 * Effect compositor (M3 effects engine) — pure Canvas2D, fabric-free. Paints a
 * layer's `effects[]` around its rendered content inside the object's cache
 * canvas, in the ratified composite order:
 *
 *   outer effects (behind) → content (+filters) → inner effects (in front,
 *   clipped to the content's alpha) → [opacity/blend apply at the cache blit].
 *
 * Everything works in DEVICE space (the cache canvas' pixels) under an identity
 * transform. The one primitive is the canvas shadow trick: painting a source
 * far off-canvas with shadowOffsetX pulled back leaves only its (optionally
 * blurred, colour-tinted) silhouette — blur, tint, dilation and erosion all
 * compose from it, so there is no per-pixel work and no ctx.filter dependency
 * (Safari lacks it; shadow* is universal, and it's what Fabric itself uses).
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

import type { Effect } from "./doc-model";

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

const num = (v: unknown, d: number): number =>
  typeof v === "number" && Number.isFinite(v) ? v : d;
const str = (v: unknown, d: string): string => (typeof v === "string" ? v : d);

/**
 * Max distance (scene px) the stack reaches OUTSIDE the layer bounds — the
 * cache-canvas padding. 0 when nothing overflows. Canvas shadowBlur `b` has a
 * visible tail of ≈ b (σ = b/2), so blur counts at face value; +2px slack.
 */
export function effectsReach(effects: readonly Effect[]): number {
  let r = 0;
  for (const e of effects) {
    const p = e.params;
    switch (e.type) {
      case "drop-shadow":
        r = Math.max(r, Math.hypot(num(p.offsetX, 8), num(p.offsetY, 8)) + num(p.blur, 24) + num(p.spread, 0));
        break;
      case "outer-glow":
        r = Math.max(r, num(p.blur, 40));
        break;
      case "stroke": {
        const pos = str(p.position, "outer");
        if (pos !== "inner") r = Math.max(r, num(p.width, 2) * (pos === "centre" ? 0.5 : 1));
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
export function getScratch(i: number, w: number, h: number): CanvasRenderingContext2D {
  const c = pool[i] ?? (pool[i] = document.createElement("canvas"));
  if (c.width !== w || c.height !== h) {
    c.width = w;
    c.height = h;
  }
  const ctx = c.getContext("2d")!;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalCompositeOperation = "source-over";
  ctx.globalAlpha = 1;
  ctx.clearRect(0, 0, w, h);
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
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalAlpha = alpha;
  ctx.shadowColor = colour;
  ctx.shadowBlur = blur;
  ctx.shadowOffsetX = OFF + dx;
  ctx.shadowOffsetY = dy;
  ctx.drawImage(src, -OFF, 0);
  ctx.restore();
}

const RING = 24;
function ringOffsets(r: number): Array<readonly [number, number]> {
  return Array.from({ length: RING }, (_, i) => {
    const a = (i / RING) * 2 * Math.PI;
    return [Math.cos(a) * r, Math.sin(a) * r] as const;
  });
}

/** Morphological dilation by r: the source's silhouette unioned across a ring
 *  of offsets (sharp stamps — blur 0 shadow = hard tinted silhouette). */
function dilate(
  dst: CanvasRenderingContext2D,
  src: CanvasImageSource,
  r: number,
  colour: string,
): void {
  stampShadow(dst, src, colour, 0, 0, 0, 1);
  for (const [dx, dy] of ringOffsets(r)) stampShadow(dst, src, colour, 0, dx, dy, 1);
}

/** Morphological erosion by r, in place: intersect dst with shifted copies of
 *  src (dst must already hold src's silhouette at the origin). */
function erode(dst: CanvasRenderingContext2D, src: CanvasImageSource, r: number): void {
  dst.save();
  dst.setTransform(1, 0, 0, 1, 0, 0);
  dst.globalCompositeOperation = "destination-in";
  for (const [dx, dy] of ringOffsets(r)) dst.drawImage(src, dx, dy);
  dst.restore();
}

/** Scene-space offset → cache-local device px: the cache blit re-applies the
 *  object's rotation + flips, so bake their inverse (rotate first, then flip —
 *  the inverse composition order of fabric's rotate∘flip transform). */
function bakedOffset(ox: number, oy: number, g: EffectGeom): { dx: number; dy: number } {
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
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  for (const e of effects) paintBehind(ctx, content, e, geom);
  ctx.drawImage(content, 0, 0);
  for (const e of effects) paintInFront(ctx, content, e, geom);
  ctx.restore();
}

/** Outer phase — painted before (so behind) the content. Registry `phase` is
 *  the panel taxonomy; stroke routes by its `position` param instead (an inner
 *  stroke must paint in front, a centre stroke half-and-half). */
function paintBehind(
  ctx: CanvasRenderingContext2D,
  content: HTMLCanvasElement,
  e: Effect,
  g: EffectGeom,
): void {
  const p = e.params;
  const k = (g.kx + g.ky) / 2;
  switch (e.type) {
    case "drop-shadow": {
      const colour = str(p.colour, "#000000");
      const spread = num(p.spread, 0) * k;
      const { dx, dy } = bakedOffset(num(p.offsetX, 8), num(p.offsetY, 8), g);
      let src: CanvasImageSource = content;
      if (spread >= 0.5) {
        const b = getScratch(1, content.width, content.height);
        dilate(b, content, spread, colour);
        src = b.canvas;
      }
      stampShadow(ctx, src, colour, num(p.blur, 24) * k, dx, dy, num(p.opacity, 35) / 100);
      break;
    }
    case "outer-glow": {
      const a = num(p.intensity, 50) / 100;
      if (a === 0) break;
      const colour = str(p.colour, "#ffffff");
      const blur = num(p.blur, 40) * k;
      // Two stamps: combined alpha 2a−a², so intensity ramps softly to solid.
      stampShadow(ctx, content, colour, blur, 0, 0, a);
      stampShadow(ctx, content, colour, blur, 0, 0, a);
      break;
    }
    case "stroke": {
      const pos = str(p.position, "outer");
      if (pos === "inner") break;
      const w = num(p.width, 2) * k * (pos === "centre" ? 0.5 : 1);
      // Dilated silhouette straight onto the cache; the content re-covers the
      // interior. ponytail: semi-transparent content shows the stroke beneath —
      // subtract the eroded interior first if that ever reads wrong.
      dilate(ctx, content, w, str(p.colour, "#000000"));
      break;
    }
  }
}

/** Inner phase — painted after the content, every result masked to its alpha. */
function paintInFront(
  ctx: CanvasRenderingContext2D,
  content: HTMLCanvasElement,
  e: Effect,
  g: EffectGeom,
): void {
  const p = e.params;
  const k = (g.kx + g.ky) / 2;
  const w = content.width;
  const h = content.height;

  /** colour everywhere EXCEPT a blurred/offset silhouette, masked to content —
   *  the classic inner-shadow/glow field. */
  const carve = (colour: string, blur: number, dx: number, dy: number): HTMLCanvasElement => {
    const b = getScratch(1, w, h);
    b.fillStyle = colour;
    b.fillRect(0, 0, w, h);
    b.globalCompositeOperation = "destination-out";
    stampShadow(b, content, "#000", blur, dx, dy, 1);
    b.globalCompositeOperation = "destination-in";
    b.drawImage(content, 0, 0);
    return b.canvas;
  };

  switch (e.type) {
    case "inner-shadow": {
      const { dx, dy } = bakedOffset(num(p.offsetX, 6), num(p.offsetY, 6), g);
      const field = carve(str(p.colour, "#000000"), num(p.blur, 18) * k, dx, dy);
      ctx.globalAlpha = num(p.opacity, 35) / 100;
      ctx.drawImage(field, 0, 0);
      ctx.globalAlpha = 1;
      break;
    }
    case "inner-glow": {
      const a = num(p.intensity, 50) / 100;
      if (a === 0) break;
      const field = carve(str(p.colour, "#ffffff"), num(p.blur, 24) * k, 0, 0);
      ctx.globalAlpha = a;
      ctx.drawImage(field, 0, 0);
      ctx.drawImage(field, 0, 0);
      ctx.globalAlpha = 1;
      break;
    }
    case "colour-overlay": {
      const b = getScratch(1, w, h);
      b.fillStyle = str(p.colour, "#000000");
      b.fillRect(0, 0, w, h);
      b.globalCompositeOperation = "destination-in";
      b.drawImage(content, 0, 0);
      ctx.globalAlpha = num(p.opacity, 100) / 100;
      ctx.drawImage(b.canvas, 0, 0);
      ctx.globalAlpha = 1;
      break;
    }
    case "stroke": {
      const pos = str(p.position, "outer");
      if (pos === "outer") break;
      const r = num(p.width, 2) * k * (pos === "centre" ? 0.5 : 1);
      // Ring = silhouette minus its erosion.
      const b = getScratch(1, w, h);
      stampShadow(b, content, str(p.colour, "#000000"), 0, 0, 0, 1);
      const c = getScratch(2, w, h);
      c.drawImage(content, 0, 0);
      erode(c, content, r);
      b.globalCompositeOperation = "destination-out";
      b.drawImage(c.canvas, 0, 0);
      ctx.drawImage(b.canvas, 0, 0);
      break;
    }
  }
}
