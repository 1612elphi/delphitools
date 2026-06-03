/* Web Worker that hosts the pandoc WebAssembly engine off the main thread.
 *
 * The worker is the boundary for the heavy work: instantiating the 58 MB module
 * and running conversions (a synchronous wasm call) here keeps the UI responsive.
 * The main thread talks to it only via the message protocol below.
 */
/// <reference lib="webworker" />
import { createPandocInstance } from "./pandoc-core.js";
import type { PandocInstance, PandocConvertResult, PandocQueryOptions } from "./pandoc-core.js";

declare const self: DedicatedWorkerGlobalScope;

type InMessage =
  | { type: "init"; wasm: ArrayBuffer }
  | { type: "query"; id: number; options: PandocQueryOptions }
  | {
      type: "convert";
      id: number;
      options: Record<string, unknown>;
      stdin: string | null;
      files: Record<string, Blob | string>;
    };

type OutMessage =
  | { type: "ready" }
  | { type: "init-error"; error: string }
  | { type: "result"; id: number; ok: true; data: unknown }
  | { type: "result"; id: number; ok: false; error: string };

let instance: PandocInstance | null = null;

self.onmessage = async (event: MessageEvent<InMessage>) => {
  const msg = event.data;

  if (msg.type === "init") {
    try {
      instance = await createPandocInstance(msg.wasm);
      self.postMessage({ type: "ready" } satisfies OutMessage);
    } catch (err) {
      self.postMessage({ type: "init-error", error: String(err) } satisfies OutMessage);
    }
    return;
  }

  if (!instance) {
    self.postMessage({
      type: "result",
      id: msg.id,
      ok: false,
      error: "Pandoc engine is not initialised yet.",
    } satisfies OutMessage);
    return;
  }

  try {
    if (msg.type === "query") {
      const data = instance.query(msg.options);
      self.postMessage({ type: "result", id: msg.id, ok: true, data } satisfies OutMessage);
    } else if (msg.type === "convert") {
      const data: PandocConvertResult = await instance.convert(msg.options, msg.stdin, msg.files);
      self.postMessage({ type: "result", id: msg.id, ok: true, data } satisfies OutMessage);
    }
  } catch (err) {
    self.postMessage({
      type: "result",
      id: msg.id,
      ok: false,
      error: String(err),
    } satisfies OutMessage);
  }
};
