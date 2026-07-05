/**
 * EffectsImage — the FabricImage the reconciler instantiates. Hooks the effect
 * compositor (effect-render.ts) into Fabric's own object-cache pipeline:
 *
 * - `_getCacheCanvasDimensions` pads the cache canvas by the stack's reach so
 *   outer effects (shadow/glow/stroke) can draw OUTSIDE the layer bounds —
 *   Fabric's cacheTranslation centring absorbs the padding, and the blit
 *   (`drawCacheOnCanvas`) needs no change. Selection bbox stays the content's.
 * - `drawObject` renders the content (the filtered element — filters compose
 *   BEFORE effects) into a device-space scratch sharing the cache transform,
 *   then lets paintEffects composite outer → content → inner into the cache.
 *   Layer opacity/blendMode apply at the cache blit (render()), so the whole
 *   composite fades/blends as one — the ratified order's final step.
 *
 * Performance rides on Fabric's caching: the composite re-runs only when the
 * cache is dirty (effect edits via filter-sync's signature diff, zoom changes
 * via Fabric's own zoomChanged check), pans just re-blit. The cache-size cap
 * (_limitCacheSize) bounds the composite cost, so no preview proxy is needed.
 *
 * ⚠️ Imports Fabric — client-only, keep behind the ssr:false dynamic boundary.
 */

import { FabricImage } from "fabric";
import type { Effect } from "./doc-model";
import { effectsReach, getScratch, paintEffects } from "./effect-render";

type DrawContext = Parameters<FabricImage["drawObject"]>[2];

export class EffectsImage extends FabricImage {
  /** ENABLED effects only, in apply order — set by filter-sync's
   *  syncImageEffects (which also dirties the cache on change). */
  effects: Effect[] = [];

  /** Effects composite ON the cache, so an effect-laden image must always own
   *  one, even where Fabric would normally skip (e.g. inside a cached parent). */
  override needsItsOwnCache(): boolean {
    return this.effects.length > 0 || super.needsItsOwnCache();
  }

  override _getCacheCanvasDimensions() {
    const dims = super._getCacheCanvasDimensions();
    const reach = effectsReach(this.effects);
    if (reach > 0) {
      // Scene px → device px via the uncapped zoom; if _limitCacheSize later
      // caps the zoom the pad merely overshoots (a slightly larger canvas).
      dims.width += 2 * Math.ceil((reach * dims.zoomX) / (Math.abs(this.scaleX) || 1));
      dims.height += 2 * Math.ceil((reach * dims.zoomY) / (Math.abs(this.scaleY) || 1));
    }
    return dims;
  }

  override drawObject(
    ctx: CanvasRenderingContext2D,
    forClipping: boolean | undefined,
    context: DrawContext,
  ): void {
    if (forClipping || this.effects.length === 0) {
      super.drawObject(ctx, forClipping, context);
      return;
    }
    // Content into a scratch sharing the cache's transform, then composite in
    // device space. Params are SCENE px: k strips the object's own scale from
    // the cache zoom (t.a = scale × viewportZoom × retina, capped), so effects
    // keep their size while the layer scales — the Photoshop convention.
    const t = ctx.getTransform();
    const content = getScratch(0, ctx.canvas.width, ctx.canvas.height);
    content.setTransform(t);
    super.drawObject(content, forClipping, context);
    paintEffects(ctx, content.canvas, this.effects, {
      kx: t.a / (Math.abs(this.scaleX) || 1),
      ky: t.d / (Math.abs(this.scaleY) || 1),
      angle: this.getTotalAngle(),
      flipX: this.flipX,
      flipY: this.flipY,
    });
  }
}
