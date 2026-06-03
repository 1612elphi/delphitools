/* Main-thread client for the pandoc Web Worker.
 *
 * This is our own (MIT) code — it never touches pandoc symbols directly, it only
 * fetches the GPL `pandoc.wasm` asset and exchanges messages with the worker.
 *
 * The engine is loaded lazily (only on the first conversion, never on page load)
 * and then kept alive for the rest of the session, so visitors who never use the
 * converter download nothing, and those who do fetch it at most once.
 */
import type { PandocConvertResult, PandocQueryOptions } from "./pandoc-core";

// The 58 MB pandoc.wasm is fetched from a public CDN (unpkg) rather than bundled
// into our own deploy. Why: it's far too big to self-host on Cloudflare Pages
// (hard 25 MiB per-file limit) and jsDelivr refuses it too (file-size limit) —
// unpkg serves it gzip-compressed (~16 MB over the wire) with permissive CORS.
// This mirrors how the Background Remover streams its ML model from the HF CDN.
// Version is pinned to keep it in lockstep with the vendored wrapper (pandoc-core.js).
const WASM_URL = "https://unpkg.com/pandoc-wasm@1.0.1/src/pandoc.wasm";

export type EngineState = "idle" | "loading" | "ready" | "error";

export interface LoadProgress {
  receivedBytes: number;
  totalBytes: number;
  /** received / total, clamped to [0,1]; null when total is unknown. */
  ratio: number | null;
}

interface Pending {
  resolve: (value: unknown) => void;
  reject: (reason: Error) => void;
}

let worker: Worker | null = null;
let readyPromise: Promise<void> | null = null;
let engineState: EngineState = "idle";
let nextId = 1;
const pending = new Map<number, Pending>();

export function getEngineState(): EngineState {
  return engineState;
}

function ensureWorker(): Worker {
  if (worker) return worker;
  const w = new Worker(new URL("./pandoc.worker.ts", import.meta.url), { type: "module" });
  w.addEventListener("message", (event: MessageEvent) => {
    const msg = event.data;
    if (msg?.type !== "result") return; // "ready"/"init-error" handled in loadEngine
    const entry = pending.get(msg.id);
    if (!entry) return;
    pending.delete(msg.id);
    if (msg.ok) entry.resolve(msg.data);
    else entry.reject(new Error(msg.error));
  });
  worker = w;
  return w;
}

async function fetchWasm(onProgress?: (p: LoadProgress) => void): Promise<ArrayBuffer> {
  const res = await fetch(WASM_URL);
  if (!res.ok) throw new Error(`Could not download the pandoc engine (HTTP ${res.status}).`);
  if (!res.body) return res.arrayBuffer();

  const totalBytes = Number(res.headers.get("content-length")) || 0;
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let received = 0;

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value) {
      chunks.push(value);
      received += value.length;
      onProgress?.({
        receivedBytes: received,
        totalBytes,
        // The CDN gzips the asset; the browser decodes it transparently, so the
        // bytes we count (decompressed) can exceed the declared (compressed)
        // content-length. When that happens, fall back to an indeterminate bar.
        ratio: totalBytes > 0 && received <= totalBytes ? received / totalBytes : null,
      });
    }
  }

  const out = new Uint8Array(received);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.length;
  }
  return decompressIfNeeded(out);
}

/**
 * The asset ships gzipped. Most hosts serve it verbatim (so we gunzip here);
 * if a host transparently decoded it (fetch strips Content-Encoding), the bytes
 * are already raw wasm. We branch on the magic number so either case works.
 *   gzip:  1f 8b …        wasm:  00 61 73 6d ("\0asm")
 */
async function decompressIfNeeded(bytes: Uint8Array<ArrayBuffer>): Promise<ArrayBuffer> {
  const isGzip = bytes[0] === 0x1f && bytes[1] === 0x8b;
  if (!isGzip) return bytes.buffer;

  if (typeof DecompressionStream === "undefined") {
    throw new Error(
      "This browser can't decompress the converter engine (no DecompressionStream). Please update your browser."
    );
  }
  const stream = new Response(bytes).body!.pipeThrough(new DecompressionStream("gzip"));
  return new Response(stream).arrayBuffer();
}

/** Download + instantiate the engine. Idempotent; safe to call repeatedly. */
export function loadEngine(onProgress?: (p: LoadProgress) => void): Promise<void> {
  if (readyPromise) return readyPromise;

  readyPromise = (async () => {
    engineState = "loading";
    try {
      const buffer = await fetchWasm(onProgress);
      const w = ensureWorker();
      await new Promise<void>((resolve, reject) => {
        const onMessage = (event: MessageEvent) => {
          const msg = event.data;
          if (msg?.type === "ready") {
            w.removeEventListener("message", onMessage);
            resolve();
          } else if (msg?.type === "init-error") {
            w.removeEventListener("message", onMessage);
            reject(new Error(msg.error));
          }
        };
        w.addEventListener("message", onMessage);
        // Transfer the buffer (zero-copy); the main thread no longer needs it.
        w.postMessage({ type: "init", wasm: buffer }, [buffer]);
      });
      engineState = "ready";
    } catch (err) {
      engineState = "error";
      readyPromise = null; // allow a retry
      throw err;
    }
  })();

  return readyPromise;
}

function call<T>(payload: Record<string, unknown>): Promise<T> {
  const w = ensureWorker();
  const id = nextId++;
  return new Promise<T>((resolve, reject) => {
    pending.set(id, { resolve: resolve as (v: unknown) => void, reject });
    w.postMessage({ ...payload, id });
  });
}

export function convert(
  options: Record<string, unknown>,
  stdin: string | null,
  files: Record<string, Blob | string> = {}
): Promise<PandocConvertResult> {
  return call<PandocConvertResult>({ type: "convert", options, stdin, files });
}

export function query<T = unknown>(options: PandocQueryOptions): Promise<T> {
  return call<T>({ type: "query", options });
}

/** Tear the worker down and free the module (e.g. on unmount). */
export function disposeEngine(): void {
  if (worker) {
    worker.terminate();
    worker = null;
  }
  pending.clear();
  readyPromise = null;
  engineState = "idle";
}
