/**
 * Export orchestrator (M6) — the one entry the UI calls:
 * resolve dims (area clamp) → render (via the export-source bridge) → encode →
 * verify (SPEC §5 silent-failure guard) → bounded shrink-retry → download.
 * Fabric-free; the fabric side lives behind renderForExport.
 */

import {
  areaBudget,
  estimateBytes,
  exportFilename,
  formatMeta,
  resolveExportDims,
  verifyExportBlob,
  type ExportOptions,
} from "./export-core";
import { encodeCanvas } from "./export-encode";
import { exportRendererReady, renderForExport } from "./export-source";
import { getSnapshot } from "./doc-store";
import { getActiveLayerId } from "./selection";
import { leafRenderList } from "./layer-tree";
import { downloadBlob } from "@/lib/download";

/** JPEG can't carry alpha — a null artboard background flattens to white. */
const JPEG_FLATTEN = "#ffffff";
/** Verify failed → re-render this much smaller, at most twice (SPEC §5). */
const SHRINK_FACTOR = 0.7;
const MAX_ATTEMPTS = 3;

export type ExportOutcome =
  | {
      ok: true;
      blob: Blob;
      width: number;
      height: number;
      effectiveScale: number;
      downscaled: boolean;
      filename: string;
    }
  | { ok: false; reason: "not-ready" | "encode-failed" | "verify-failed" };

function currentRenderPlan(options: ExportOptions) {
  const doc = getSnapshot();
  if (!doc || !exportRendererReady()) return null;
  const soloLayerId = options.scope === "layer" ? getActiveLayerId() : null;
  if (options.scope === "layer" && !soloLayerId) return null;
  return {
    doc,
    soloLayerId,
    transparent: options.scope === "layer",
    flattenBackground: options.format === "jpeg" ? JPEG_FLATTEN : undefined,
  };
}

export async function runExport(
  options: ExportOptions,
  { download = true }: { download?: boolean } = {}
): Promise<ExportOutcome> {
  const plan = currentRenderPlan(options);
  if (!plan) return { ok: false, reason: "not-ready" };
  const { doc } = plan;

  const dims = resolveExportDims(doc.artboard.width, doc.artboard.height, options.scale);
  // An artboard with no visible content AND no background legitimately exports
  // all-transparent — don't let verify call that a Safari failure.
  const expectContent =
    plan.soloLayerId !== null ||
    doc.artboard.background !== null ||
    leafRenderList(doc.layers).some((e) => e.visible);

  let scale = dims.effectiveScale;
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const canvas = renderForExport({
      scale,
      soloLayerId: plan.soloLayerId,
      transparent: plan.transparent,
      flattenBackground: plan.flattenBackground,
    });
    if (!canvas) return { ok: false, reason: "not-ready" };

    let blob: Blob;
    try {
      blob = await encodeCanvas(canvas, options.format, options.quality);
    } catch {
      return { ok: false, reason: "encode-failed" };
    }

    if (await verifyExportBlob(blob, expectContent)) {
      const filename = exportFilename(doc.name, canvas.width, canvas.height, formatMeta(options.format).ext);
      if (download) downloadBlob(blob, filename);
      return {
        ok: true,
        blob,
        width: canvas.width,
        height: canvas.height,
        effectiveScale: scale,
        downscaled: dims.downscaled || attempt > 0,
        filename,
      };
    }
    scale *= SHRINK_FACTOR;
  }
  return { ok: false, reason: "verify-failed" };
}

// ── live size estimate ───────────────────────────────────────────────────────

/** Proxy renders aim for ~0.26 MP (512²) — cheap to render + encode, big
 *  enough that byte-per-pixel extrapolation is in the right ballpark. */
const PROXY_AREA = 262_144;

/** Approximate the output byte size by encoding a small proxy render with the
 *  live options and scaling by area. Null when the canvas isn't ready. */
export async function estimateExportBytes(options: ExportOptions): Promise<number | null> {
  const plan = currentRenderPlan(options);
  if (!plan) return null;
  const { doc } = plan;

  const dims = resolveExportDims(doc.artboard.width, doc.artboard.height, options.scale, areaBudget());
  const proxyScale = Math.min(
    dims.effectiveScale,
    Math.sqrt(PROXY_AREA / (doc.artboard.width * doc.artboard.height))
  );
  const canvas = renderForExport({
    scale: proxyScale,
    soloLayerId: plan.soloLayerId,
    transparent: plan.transparent,
    flattenBackground: plan.flattenBackground,
  });
  if (!canvas) return null;
  try {
    const blob = await encodeCanvas(canvas, options.format, options.quality);
    return estimateBytes(blob.size, canvas.width * canvas.height, dims.outW * dims.outH);
  } catch {
    return null;
  }
}
