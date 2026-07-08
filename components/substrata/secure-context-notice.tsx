"use client";

import { useSyncExternalStore } from "react";

// Cheap client-only read of secure-context state. useSyncExternalStore (with a
// server snapshot of `false`) reads a browser-only value without a hydration
// mismatch and without setState-in-effect. The full capability set lives in
// lib/substrata/capabilities.ts; only `isSecureContext` matters for this banner.
const noopSubscribe = () => () => {};
const getInsecure = () => typeof window !== "undefined" && window.isSecureContext === false;
const getServerInsecure = () => false;

/**
 * Render-gated degraded-context banner (M0-7). Returns null in a normal
 * secure context (https/localhost); only appears when Substrata is opened over
 * file:// or another insecure origin where Workers/OPFS/FS-Access/crypto.subtle/
 * WebGPU are unavailable. Mounted in the shell under the top bar.
 */
export function SecureContextNotice() {
  const insecure = useSyncExternalStore(noopSubscribe, getInsecure, getServerInsecure);

  if (!insecure) return null;

  return (
    <div role="alert" className="border-b border-border bg-muted px-3 py-2 text-xs text-foreground">
      {"This needs a secure context. If your browser doesn't support HTTPS, you can't save. Sorry!"}
    </div>
  );
}
