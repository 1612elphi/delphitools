/**
 * Secure-context + platform capability detection (M0-7). Pure and SSR-safe:
 * every browser-API access is guarded so importing or calling this during the
 * static-export prerender can never throw. Returns conservative `false`s off the
 * main thread / on the server.
 *
 * Substrata needs a secure context (https/localhost) for Workers, OPFS, File
 * System Access, crypto.subtle and WebGPU (§5). Opening over file:// must
 * degrade gracefully, not crash — callers gate on these flags.
 */

export interface Capabilities {
  /** https or localhost — gates Workers/OPFS/FS-Access/crypto.subtle/WebGPU */
  secureContext: boolean;
  /** COOP+COEP — only needed for the multi-thread WASM fallback, not WebGPU */
  crossOriginIsolated: boolean;
  webgpu: boolean;
  webgl2: boolean;
  /** Origin Private File System */
  opfs: boolean;
  /** File System Access API (Chromium disk pickers) */
  fileSystemAccess: boolean;
  worker: boolean;
  /** SubtleCrypto — needed for content-addressed blob hashing */
  cryptoSubtle: boolean;
  createImageBitmap: boolean;
}

function probeWebGL2(): boolean {
  if (typeof document === "undefined") return false;
  try {
    const canvas = document.createElement("canvas");
    return !!canvas.getContext("webgl2");
  } catch {
    return false;
  }
}

export function detectCapabilities(): Capabilities {
  if (typeof window === "undefined" || typeof navigator === "undefined") {
    return {
      secureContext: false,
      crossOriginIsolated: false,
      webgpu: false,
      webgl2: false,
      opfs: false,
      fileSystemAccess: false,
      worker: false,
      cryptoSubtle: false,
      createImageBitmap: false,
    };
  }

  return {
    secureContext: window.isSecureContext === true,
    crossOriginIsolated: window.crossOriginIsolated === true,
    webgpu: "gpu" in navigator,
    webgl2: probeWebGL2(),
    opfs: typeof navigator.storage?.getDirectory === "function",
    fileSystemAccess: "showOpenFilePicker" in window,
    worker: typeof Worker !== "undefined",
    cryptoSubtle: typeof crypto !== "undefined" && !!crypto.subtle,
    createImageBitmap: typeof createImageBitmap === "function",
  };
}
