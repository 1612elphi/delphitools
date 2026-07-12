/**
 * Export core (M6) — pure, fabric-free: format metadata, output-dimension
 * resolution under the canvas area budget, blob verification (the SPEC §5
 * guard against Safari's silent transparent-canvas export failure), and the
 * size-estimate/filename helpers. Everything here is deterministic maths the
 * modal, orchestrator and headless harness share.
 */

export type ExportFormat = "png" | "jpeg" | "webp" | "jxl";
export type ExportScale = 1 | 2 | 3;
export type ExportScope = "artboard" | "layer";

export interface ExportOptions {
  format: ExportFormat;
  scale: ExportScale;
  /** 1–100, lossy formats only (png ignores it). */
  quality: number;
  scope: ExportScope;
}

export interface FormatMeta {
  id: ExportFormat;
  label: string; // format acronym = factual data, not copy
  mime: string;
  ext: string;
  lossy: boolean;
  /** carries an alpha channel — gates layer-solo export + background flatten */
  alpha: boolean;
  /** browsers can decode it back — gates the pixel-probe in verify */
  decodable: boolean;
}

export const EXPORT_FORMATS: FormatMeta[] = [
  { id: "png", label: "PNG", mime: "image/png", ext: "png", lossy: false, alpha: true, decodable: true },
  { id: "jpeg", label: "JPEG", mime: "image/jpeg", ext: "jpg", lossy: true, alpha: false, decodable: true },
  { id: "webp", label: "WebP", mime: "image/webp", ext: "webp", lossy: true, alpha: true, decodable: true },
  // JXL replaces AVIF (Ruby 2026-07-06, mirroring the image-converter swap on
  // main). Encoded via the vendored libjxl WASM; no browser decodes it back,
  // so verify is size-only for jxl.
  { id: "jxl", label: "JXL", mime: "image/jxl", ext: "jxl", lossy: true, alpha: true, decodable: false },
];

export function formatMeta(id: ExportFormat): FormatMeta {
  return EXPORT_FORMATS.find((f) => f.id === id)!;
}

// ── output dimensions ────────────────────────────────────────────────────────

/**
 * Canvas AREA budgets (w·h in px). iOS Safari silently corrupts/blanks
 * canvases past ~16.7M px (SPEC §5 — area-based, not per-axis); desktop
 * engines cap out far higher (Chrome/Firefox ≥ 16384², Safari macOS similar).
 * ponytail: two constants + a UA sniff, no tiling — an over-budget export
 * downscales to fit and reports it. Tile+stitch is the upgrade path if
 * full-res oversize exports are ever demanded (SPEC allows either).
 */
const IOS_AREA_BUDGET = 16_777_216;
const DESKTOP_AREA_BUDGET = 268_435_456; // 16384², the common engine cap

function isIOSLike(): boolean {
  if (typeof navigator === "undefined") return false;
  // iPadOS masquerades as macOS but is the only "Mac" with multi-touch.
  return (
    /iPhone|iPad|iPod/.test(navigator.userAgent) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1)
  );
}

export function areaBudget(): number {
  return isIOSLike() ? IOS_AREA_BUDGET : DESKTOP_AREA_BUDGET;
}

export interface ResolvedDims {
  outW: number;
  outH: number;
  /** actual render multiplier — < requested scale when the budget clamped it */
  effectiveScale: number;
  downscaled: boolean;
}

/**
 * Resolve the real output size for an artboard at a requested scale under an
 * area budget. When the scaled area exceeds the budget the export shrinks
 * uniformly to fit (never upscales past the request).
 */
export function resolveExportDims(
  width: number,
  height: number,
  scale: number,
  budget: number = areaBudget()
): ResolvedDims {
  const area = width * height * scale * scale;
  const effectiveScale = area > budget ? Math.sqrt(budget / (width * height)) : scale;
  return {
    outW: Math.max(1, Math.round(width * effectiveScale)),
    outH: Math.max(1, Math.round(height * effectiveScale)),
    effectiveScale,
    downscaled: effectiveScale < scale - 1e-9,
  };
}

// ── output verification (SPEC §5) ────────────────────────────────────────────

/** A blob smaller than this is a header, not an image. */
const MIN_PLAUSIBLE_BYTES = 100;

/**
 * Catch Safari's silent transparent-canvas export failure: the encode
 * "succeeds" but the blob is empty/header-only or decodes to all-transparent
 * pixels. For formats the browser can decode we re-decode at NATURAL size and
 * scan the alpha channel — a downsampled probe point-samples and misses
 * content smaller than its stride (a logo-sized layer solo'd on a big
 * artboard would false-fail). Early-exits on the first opaque pixel; the
 * all-transparent worst case scans ≤ the area budget once, at export time
 * only. For JXL (encode-only) the size check is all we have. Returns true
 * when the blob looks like a real image.
 */
export async function verifyExportBlob(blob: Blob, expectContent: boolean): Promise<boolean> {
  if (blob.size < MIN_PLAUSIBLE_BYTES) return false;
  const meta = EXPORT_FORMATS.find((f) => f.mime === blob.type);
  if (!meta?.decodable || !expectContent) return true;
  try {
    const bitmap = await createImageBitmap(blob);
    const probe = document.createElement("canvas");
    probe.width = bitmap.width;
    probe.height = bitmap.height;
    const ctx = probe.getContext("2d", { willReadFrequently: true })!;
    ctx.drawImage(bitmap, 0, 0);
    bitmap.close();
    const { data } = ctx.getImageData(0, 0, probe.width, probe.height);
    for (let i = 3; i < data.length; i += 4) {
      if (data[i] > 0) return true; // any non-transparent pixel = content
    }
    return false;
  } catch {
    return false; // undecodable claimed-decodable blob = corrupt
  }
}

// ── estimate + filename ──────────────────────────────────────────────────────

/** Scale a proxy encode's byte count up to the full output area (approximate —
 *  compression isn't linear in area, hence the "~" the UI shows). */
export function estimateBytes(proxyBytes: number, proxyArea: number, fullArea: number): number {
  if (proxyArea <= 0) return 0;
  return Math.round(proxyBytes * (fullArea / proxyArea));
}

/** Scene name → filesystem-safe slug (shared with .substrata saves). */
export function slugifySceneName(name: string): string {
  return name.trim().replace(/[^\w-]+/g, "-").replace(/^-+|-+$/g, "") || "substrata";
}

/** `<scene>-1080x1350.png` — scene name + dims + extension, all factual. */
export function exportFilename(sceneName: string, w: number, h: number, ext: string): string {
  return `${slugifySceneName(sceneName)}-${w}x${h}.${ext}`;
}
