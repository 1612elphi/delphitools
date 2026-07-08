/**
 * Remove Background (M7) — an async, non-destructive bake. BiRefNet-lite
 * (MIT, onnx-community/BiRefNet_lite-ONNX) via @huggingface/transformers v4
 * produces a grayscale matte per raster SOURCE, keyed by the layer's content
 * blobHash: same pixels ⇒ same matte, a destructive edit repoints the hash
 * and re-bakes automatically, and undo snapshots keep rendering off the old
 * cached matte. The matte lives in a canvas's ALPHA channel so EffectsImage
 * can `destination-in` it onto the layer content at composite time — the
 * original RGBA is never touched and the header switch restores instantly.
 *
 * Hosting is Ruby's ratified call (2026-07-08): reuse the background-remover
 * tool's system — runtime fetch from the HF hub through the browser HTTP
 * cache (no self-hosted weights; Cache API off, it's unreliable on iOS
 * Safari). The v3→v4 transformers bump is pinned SEPARATELY as the npm alias
 * `@huggingface/transformers-v4`, so /tools/background-remover keeps v3
 * untouched. WebGPU fp16 first, single-thread WASM fp32 fallback.
 *
 * Store shape follows lut-data.ts: matteEpoch() bumps only when a matte
 * ARRIVES (EffectsImage mixes it into its cache-dirty check so cutouts pop
 * in); listeners fire on every status change (the FX panel shows progress).
 * Fabric-free on purpose — the panel imports this outside the canvas
 * boundary.
 *
 * ponytail: inference runs serially on the main thread (the WebGPU path is
 * async anyway; the WASM fallback janks) — a dedicated worker is the upgrade
 * path if fallback jank matters.
 */

import { getDB } from "./db";
import { getRaster } from "./raster-cache";
import { canvasToBlob } from "./blobs";
import { getPersistenceEnabled } from "./persistence-pref";

const MODEL_ID = "onnx-community/BiRefNet_lite-ONNX";

export type MatteDevice = "webgpu" | "wasm";

export interface MatteStatus {
  state: "queued" | "downloading" | "processing" | "done" | "error";
  /** model download %, only while downloading */
  progress?: number;
  device?: MatteDevice;
  /** technical error detail (Error.message) — data, not authored copy */
  detail?: string;
}

const mattes = new Map<string, HTMLCanvasElement>();
const status = new Map<string, MatteStatus>();
let epoch = 0;
const listeners = new Set<() => void>();

/** hashes whose bake is waiting on the shared model download */
const waitingDownload = new Set<string>();
let lastProgress = -1;

function notify(): void {
  for (const l of listeners) l();
}

function setStatus(hash: string, s: MatteStatus): void {
  status.set(hash, s);
  notify();
}

/** Bumped only when a matte finishes — EffectsImage compares it in
 *  isCacheDirty so the cutout recomposites exactly once per arrival. */
export function matteEpoch(): number {
  return epoch;
}

export function subscribeMattes(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function getMatte(hash: string): HTMLCanvasElement | undefined {
  return mattes.get(hash);
}

export function getMatteStatus(hash: string): MatteStatus | undefined {
  return status.get(hash);
}

/** Inject a finished matte directly (the bake path lands here; also the dev
 *  rig's test seam — the verify harness composites without running the model). */
export function putMatte(hash: string, matte: HTMLCanvasElement, device?: MatteDevice): void {
  mattes.set(hash, matte);
  setStatus(hash, { state: "done", device });
  epoch++;
  notify();
}

/**
 * Kick off (idempotent) the async bake of one source's matte. Errors are
 * sticky — a failed hash does NOT auto-retry (drawObject kicks every
 * composite; looping a failed 90 MB model fetch would be hostile). The FX
 * panel's retry goes through retryMatte.
 */
export function ensureMatte(hash: string): void {
  if (!hash || typeof document === "undefined") return;
  if (mattes.has(hash) || status.has(hash)) return;
  setStatus(hash, { state: "queued" });
  // serial queue — one inference at a time keeps peak memory sane
  chain = chain.then(() => bake(hash)).catch(() => undefined);
}

/** Clear a sticky error and re-kick. */
export function retryMatte(hash: string): void {
  if (status.get(hash)?.state !== "error") return;
  status.delete(hash);
  ensureMatte(hash);
}

let chain: Promise<void> = Promise.resolve();

// The pipeline singleton — module-lifetime so re-bakes skip the load. `any`
// mirrors the background-remover precedent (transformers' pipeline types are
// unwieldy across dtype/device unions).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let pipePromise: Promise<{ pipe: any; device: MatteDevice }> | null = null;

function loadPipeline(): NonNullable<typeof pipePromise> {
  if (!pipePromise) {
    pipePromise = (async () => {
      const { pipeline, env } = await import("@huggingface/transformers-v4");
      env.allowLocalModels = false;
      // Browser HTTP cache instead of the Cache API — unreliable on iOS
      // Safari (the background-remover call, carried over).
      env.useBrowserCache = false;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const onProgress = (e: any) => {
        if (e.status !== "progress" || e.progress === undefined) return;
        const pct = Math.round(e.progress);
        if (pct === lastProgress) return; // don't flood renders per byte-tick
        lastProgress = pct;
        for (const h of waitingDownload) setStatus(h, { state: "downloading", progress: pct });
      };
      try {
        const pipe = await pipeline("image-segmentation", MODEL_ID, {
          device: "webgpu",
          dtype: "fp16",
          progress_callback: onProgress,
        });
        return { pipe, device: "webgpu" as const };
      } catch {
        const pipe = await pipeline("image-segmentation", MODEL_ID, {
          device: "wasm",
          dtype: "fp32",
          progress_callback: onProgress,
        });
        return { pipe, device: "wasm" as const };
      }
    })().catch((err) => {
      pipePromise = null; // a failed load may be transient (offline) — retry can rebuild
      throw err;
    });
  }
  return pipePromise;
}

async function bake(hash: string): Promise<void> {
  try {
    // persisted matte from an earlier session?
    if (await hydrateMatte(hash)) {
      putMatte(hash, mattes.get(hash)!);
      return;
    }
    const src = getRaster(hash);
    if (!src) {
      // source not decoded yet — drop the marker so a later kick retries
      status.delete(hash);
      notify();
      return;
    }
    waitingDownload.add(hash);
    setStatus(hash, { state: "downloading", progress: 0 });
    const { pipe, device } = await loadPipeline();
    waitingDownload.delete(hash);
    setStatus(hash, { state: "processing", device });
    const url = URL.createObjectURL(await canvasToBlob(src));
    let result: unknown;
    try {
      result = await pipe(url);
    } finally {
      URL.revokeObjectURL(url);
    }
    const mask = (result as { mask?: unknown }[] | undefined)?.[0]?.mask;
    if (!mask) throw new Error("segmentation returned no mask");
    const matte = matteFromMask(mask, src.width, src.height);
    putMatte(hash, matte, device);
    void persistMatte(hash, matte);
  } catch (err) {
    waitingDownload.delete(hash);
    setStatus(hash, {
      state: "error",
      detail: err instanceof Error ? err.message : String(err),
    });
  }
}

/** Normalise the model's mask output into an ALPHA-channel canvas scaled to
 *  the source's pixel size (mask value → alpha, RGB left black — only alpha
 *  matters to destination-in). Handles the RawImage raw-data shape and the
 *  toCanvas fallback, the two cases this pipeline type actually produces
 *  (background-remover.tsx precedent). */
function matteFromMask(mask: unknown, w: number, h: number): HTMLCanvasElement {
  const m = mask as {
    width: number;
    height: number;
    data?: Uint8Array | Uint8ClampedArray;
    toCanvas?: () => HTMLCanvasElement;
  };
  const mw = m.width;
  const mh = m.height;
  const alpha = document.createElement("canvas");
  alpha.width = mw;
  alpha.height = mh;
  const actx = alpha.getContext("2d")!;
  const id = actx.createImageData(mw, mh);
  if (m.data && m.data.length >= mw * mh) {
    const channels = Math.round(m.data.length / (mw * mh));
    for (let i = 0; i < mw * mh; i++) id.data[i * 4 + 3] = m.data[i * channels];
  } else if (typeof m.toCanvas === "function") {
    const px = m.toCanvas().getContext("2d")!.getImageData(0, 0, mw, mh).data;
    for (let i = 0; i < mw * mh; i++) id.data[i * 4 + 3] = px[i * 4]; // grayscale rides in red
  } else {
    throw new Error("unrecognised mask shape");
  }
  actx.putImageData(id, 0, 0);
  if (mw === w && mh === h) return alpha;
  const scaled = document.createElement("canvas");
  scaled.width = w;
  scaled.height = h;
  scaled.getContext("2d")!.drawImage(alpha, 0, 0, w, h); // bilinear alpha upscale
  return scaled;
}

// ── IndexedDB matte cache (dexie v3 `mattes`) ────────────────────────────────
// Writes ride the persistence opt-in like every other IDB write; reads are
// unconditional (the table is simply empty when persistence was never on).

async function persistMatte(hash: string, matte: HTMLCanvasElement): Promise<void> {
  if (typeof indexedDB === "undefined" || !getPersistenceEnabled()) return;
  try {
    const db = getDB();
    if (await db.mattes.get(hash)) return;
    await db.mattes.put({ hash, blob: await canvasToBlob(matte), createdAt: Date.now() });
  } catch {
    // best-effort cache — quota/private-mode failures are non-fatal
  }
}

async function hydrateMatte(hash: string): Promise<boolean> {
  if (typeof indexedDB === "undefined") return false;
  try {
    const rec = await getDB().mattes.get(hash);
    if (!rec) return false;
    const bitmap = await createImageBitmap(rec.blob);
    const c = document.createElement("canvas");
    c.width = bitmap.width;
    c.height = bitmap.height;
    c.getContext("2d")!.drawImage(bitmap, 0, 0);
    bitmap.close();
    mattes.set(hash, c);
    return true;
  } catch {
    return false;
  }
}
