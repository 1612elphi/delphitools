/**
 * SubstrataText — the IText the reconciler instantiates for text layers.
 * Adds the style PLATE (pill/rectangle behind the glyphs, Ruby's 2026-07-06
 * text styles): `_getCacheCanvasDimensions` pads the cache by the plate's
 * padding (the EffectsImage precedent — cacheTranslation centring absorbs it)
 * and `drawObject` paints the rounded plate in object-local space before the
 * text renders. Selection bbox stays the TEXT's — the plate is dressing, like
 * an effect (clicking its overhang doesn't hit; accepted v1).
 *
 * In-canvas editing is native IText; the doc catches up on editing:exited
 * (fabric-canvas wires it). ⚠️ Imports Fabric — keep behind ssr:false.
 */

import { IText } from "fabric";
import type { TextPlate } from "./doc-model";

export class SubstrataText extends IText {
  /** set by sync (which also dirties the cache on change) */
  plate: TextPlate | null = null;

  override _getCacheCanvasDimensions() {
    const dims = super._getCacheCanvasDimensions();
    const pad = this.plate?.padding ?? 0;
    if (pad > 0) {
      dims.width += 2 * Math.ceil((pad * dims.zoomX) / (Math.abs(this.scaleX) || 1));
      dims.height += 2 * Math.ceil((pad * dims.zoomY) / (Math.abs(this.scaleY) || 1));
    }
    return dims;
  }

  override drawObject(
    ctx: CanvasRenderingContext2D,
    forClipping: boolean | undefined,
    context: Parameters<IText["drawObject"]>[2],
  ): void {
    const plate = this.plate;
    if (plate && !forClipping) {
      const w = this.width + plate.padding * 2;
      const h = this.height + plate.padding * 2;
      const r = plate.shape === "pill" ? h / 2 : Math.min(12, plate.padding);
      ctx.save();
      ctx.fillStyle = plate.colour;
      ctx.beginPath();
      ctx.roundRect(-w / 2, -h / 2, w, h, r);
      ctx.fill();
      ctx.restore();
    }
    super.drawObject(ctx, forClipping, context);
  }
}
