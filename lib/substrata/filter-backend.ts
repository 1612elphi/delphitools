/**
 * Fabric filter-backend setup (M1-7 scaffold). Two §5 guard rails, installed
 * once after the canvas mounts:
 *   1. Clamp config.textureSize to our working cap so oversize textures can't
 *      silently render ~30% of pixels (Fabric #6805).
 *   2. On webglcontextlost, swap the WebGL backend for the Canvas2D one so a lost
 *      GPU context degrades instead of crashing.
 *
 * No filters run here — the Tier-0/Tier-1 effect chain is M3. Preview-downscale
 * (1–2 MP proxy on slider drag, rAF-coalesced applyFilters) also lands with the
 * real effects.
 *
 * ⚠️ Imports Fabric — only ever import this module behind the ssr:false dynamic
 * boundary (i.e. from the canvas client code), never from a server-evaluated
 * module, or Fabric leaks into the static-export prerender.
 */

import {
  config,
  getFilterBackend,
  setFilterBackend,
  WebGLFilterBackend,
  Canvas2dFilterBackend,
} from "fabric";
import { workingRasterCap } from "./webgl-limits";

let installed = false;

export function initSubstrataFilterBackend(): void {
  if (installed || typeof document === "undefined") return;
  installed = true;

  // (1) Set the GPU working texture size to MATCH the import cap. Imports are
  // clamped to workingRasterCap() (M1-5, up to 8192), but Fabric's default
  // textureSize is 4096 — min() could only ever lower it, so a 4097–8192px
  // raster survived import intact and then square-cropped to 4096×4096 the
  // first time a filter (a look) ran over it (#6805 again, past the guard).
  config.textureSize = workingRasterCap();

  // (2) Context-loss fallback. getFilterBackend(false) returns the lazily-init'd
  // backend without forcing WebGL; only wire the listener if WebGL is actually
  // in use.
  try {
    const backend = getFilterBackend(false);
    if (backend instanceof WebGLFilterBackend && backend.canvas) {
      backend.canvas.addEventListener(
        "webglcontextlost",
        (e) => {
          e.preventDefault();
          setFilterBackend(new Canvas2dFilterBackend());
        },
        { once: true },
      );
    }
  } catch {
    // No backend / no WebGL yet — Fabric will lazily fall back to Canvas2D.
  }
}
