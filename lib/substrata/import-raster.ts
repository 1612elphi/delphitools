/**
 * Raster import (M1-5). Decode an image file, clamp the working raster to the GPU
 * texture cap on the way in (the #1 §5 guard — Fabric #6805: oversize sources
 * silently render ~30% of pixels), cache it content-addressed, and append a
 * RasterLayer to the document (object-making = layer-making, §6). One-way: this
 * only mutates the doc model; the reconciler renders the result.
 */

import { clampToCap } from "./webgl-limits";
import { createRasterLayer } from "./doc-model";
import type { Artboard, Transform } from "./doc-model";
import { getSnapshot, update } from "./doc-store";
import { setActiveLayer } from "./selection";
import { getRaster, putRaster, sha256Hex } from "./raster-cache";
import { persistRaster } from "./blobs";

/** Centre the layer on the artboard, scaled down to fit if it's larger. */
function placeOnArtboard(artboard: Artboard, w: number, h: number): Transform {
  const fit = Math.min(1, artboard.width / w, artboard.height / h);
  return {
    x: artboard.width / 2,
    y: artboard.height / 2,
    scaleX: fit,
    scaleY: fit,
    angle: 0,
    flipX: false,
    flipY: false,
  };
}

export async function importImageFile(file: File): Promise<void> {
  if (!file.type.startsWith("image/")) return;

  const buf = await file.arrayBuffer();
  const hash = await sha256Hex(buf);

  let raster = getRaster(hash);
  if (!raster) {
    const blob = new Blob([buf], { type: file.type });
    const probe = await createImageBitmap(blob);
    const { width, height, scale } = clampToCap(probe.width, probe.height);

    let bitmap = probe;
    if (scale < 1) {
      probe.close();
      bitmap = await createImageBitmap(blob, {
        resizeWidth: width,
        resizeHeight: height,
        resizeQuality: "high",
      });
    }

    raster = document.createElement("canvas");
    raster.width = width;
    raster.height = height;
    const ctx = raster.getContext("2d");
    if (!ctx) {
      bitmap.close();
      return;
    }
    ctx.drawImage(bitmap, 0, 0);
    bitmap.close();
    putRaster(hash, raster);
    void persistRaster(hash); // persist to IndexedDB for reload (best-effort)
  }

  const w = raster.width;
  const h = raster.height;
  const artboard = getSnapshot()?.artboard;
  if (!artboard) return;

  const layer = createRasterLayer({
    name: file.name,
    blobHash: hash,
    naturalWidth: w,
    naturalHeight: h,
    transform: placeOnArtboard(artboard, w, h),
  });
  // Select first so the reconcile triggered by `update` applies it the moment the
  // layer's Fabric object is created (avoids the post-update selection race).
  setActiveLayer(layer.id);
  update((doc) => ({ ...doc, layers: [...doc.layers, layer], updatedAt: Date.now() }));
}
