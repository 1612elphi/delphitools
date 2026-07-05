/**
 * Doc→Fabric filter-stack sync (M3-10). The reconciler calls syncImageFilters
 * on every pass; this diffs a per-image signature of the ENABLED stack so
 * applyFilters (a full GPU chain + canvas readback) only re-runs when the
 * stack actually changed, and coalesces the re-runs into one rAF.
 *
 * Preview downscale: while a slider gesture is in flight (doc-store transient
 * active) and the source is large, the chain runs on a cached ≤1.5 MP proxy of
 * the original instead — the result is handed to Fabric via _element +
 * _filterScaling (the exact mechanism its own resize filters use), so it
 * renders at full object size. The gesture's commit emits, the signature flips
 * preview→full, and the full-res chain re-runs once. Proxy passes use their
 * own texture cacheKey (the WebGL backend caches source textures BY KEY,
 * ignoring source identity) and evict it on settle.
 *
 * ⚠️ Imports Fabric — client-only, keep behind the ssr:false dynamic boundary.
 */

import { getFilterBackend, WebGLFilterBackend } from "fabric";
import type { FabricImage, StaticCanvas } from "fabric";
import type { Filter } from "./doc-model";
import { buildFabricFilters } from "./filter-factory";
import { isGestureActive } from "./doc-store";
import { isLutLook, lutEpoch } from "./lut-data";

/** Proxy budget — ~1.5 MP keeps drag-time chains cheap even on the Canvas2D
 *  fallback backend; sources at or under it just filter at full res. */
const PREVIEW_PIXELS = 1_500_000;

/** The handful of FabricImage internals the preview pass drives (public on the
 *  class except _filterScalingX/Y, which are `protected`). */
interface ImageInternals {
  _element: CanvasImageSource;
  _originalElement: CanvasImageSource & { width: number; height: number; naturalWidth?: number; naturalHeight?: number };
  _filterScalingX: number;
  _filterScalingY: number;
}
const internals = (img: FabricImage) => img as unknown as ImageInternals;

const appliedSig = new WeakMap<FabricImage, string>();
const proxies = new WeakMap<FabricImage, HTMLCanvasElement>();
const previewTargets = new WeakMap<FabricImage, HTMLCanvasElement>();

/** image → wants-preview, drained once per frame */
const pending = new Map<FabricImage, boolean>();
let rafId: number | null = null;

const previewKey = (img: FabricImage) => `${img.cacheKey}_sspreview`;

function sourceSize(img: FabricImage): { width: number; height: number } {
  const el = internals(img)._originalElement;
  return { width: el.naturalWidth || el.width, height: el.naturalHeight || el.height };
}

/**
 * Reconciler entry point: bring the Fabric image's filter chain in line with
 * the layer's doc stack. Cheap when nothing changed (one JSON signature).
 */
export function syncImageFilters(img: FabricImage, stack: readonly Filter[]): void {
  const size = sourceSize(img);
  const preview = isGestureActive() && size.width * size.height > PREVIEW_PIXELS;
  const enabled = stack.filter((f) => f.enabled);
  // LUT looks load async — mixing the epoch in makes the signature change when
  // a strip arrives, so the pending look re-applies without a doc edit.
  const hasLut = enabled.some((f) => f.type === "film-sim" && isLutLook(String(f.params.preset)));
  const sig =
    (preview ? "p|" : "f|") +
    (hasLut ? `L${lutEpoch()}|` : "") +
    JSON.stringify(enabled.map((f) => [f.type, f.params]));
  if (appliedSig.get(img) === sig) return;
  appliedSig.set(img, sig);

  img.filters = buildFabricFilters(stack, size);
  pending.set(img, preview);
  rafId ??= requestAnimationFrame(flush);
}

function flush(): void {
  rafId = null;
  const canvases = new Set<StaticCanvas>();
  for (const [img, preview] of pending) {
    if (preview) applyPreview(img);
    else applyFull(img);
    if (img.canvas) canvases.add(img.canvas);
  }
  pending.clear();
  for (const c of canvases) c.requestRenderAll();
}

function applyFull(img: FabricImage): void {
  const inner = internals(img);
  const target = previewTargets.get(img);
  if (target && inner._element === target) {
    // Hand the element back before Fabric's own applyFilters state machine
    // runs — it only knows about _originalElement/_filteredEl.
    inner._element = inner._originalElement;
    inner._filterScalingX = 1;
    inner._filterScalingY = 1;
  }
  img.applyFilters();
  const backend = getFilterBackend(false);
  if (backend instanceof WebGLFilterBackend) backend.evictCachesForKey(previewKey(img));
}

function applyPreview(img: FabricImage): void {
  // Mirror applyFilters' own neutral-state pruning; an all-neutral chain must
  // reset _element to the original, which applyFull already does correctly.
  const chain = img.filters.filter((f) => f && !f.isNeutralState());
  if (chain.length === 0) {
    applyFull(img);
    return;
  }
  const proxy = getProxy(img);
  let target = previewTargets.get(img);
  if (!target) previewTargets.set(img, (target = document.createElement("canvas")));
  // Re-sizing also clears — both backends expect a target sized to the output.
  target.width = proxy.width;
  target.height = proxy.height;

  const backend = getFilterBackend();
  if (backend instanceof WebGLFilterBackend) {
    backend.applyFilters(chain, proxy, proxy.width, proxy.height, target, previewKey(img));
  } else {
    backend.applyFilters(chain, proxy, proxy.width, proxy.height, target);
  }

  const inner = internals(img);
  const { width, height } = sourceSize(img);
  inner._element = target;
  inner._filterScalingX = proxy.width / width;
  inner._filterScalingY = proxy.height / height;
  img.set("dirty", true);
}

/** Downscaled copy of the original, built once per image (the source raster is
 *  content-addressed and never swapped on a live object — sync.ts contract). */
function getProxy(img: FabricImage): HTMLCanvasElement {
  let proxy = proxies.get(img);
  if (!proxy) {
    const el = internals(img)._originalElement;
    const { width, height } = sourceSize(img);
    const scale = Math.sqrt(PREVIEW_PIXELS / (width * height));
    proxy = document.createElement("canvas");
    proxy.width = Math.max(1, Math.round(width * scale));
    proxy.height = Math.max(1, Math.round(height * scale));
    proxy.getContext("2d")!.drawImage(el, 0, 0, proxy.width, proxy.height);
    proxies.set(img, proxy);
  }
  return proxy;
}
