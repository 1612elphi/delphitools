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
 * Render-gated degraded-context banner (M0-7 stub). Returns null in a normal
 * secure context (https/localhost); only appears when Substrata is opened over
 * file:// or another insecure origin where Workers/OPFS/FS-Access/crypto.subtle/
 * WebGPU are unavailable.
 *
 * Not yet mounted in the shell — wiring + styling is gated UI work.
 */
export function SecureContextNotice() {
  const insecure = useSyncExternalStore(noopSubscribe, getInsecure, getServerInsecure);

  if (!insecure) return null;

  return (
    <div role="alert" className="border-b border-border bg-muted px-3 py-2 text-xs text-foreground">
      {/* ∑CG: degraded secure-context banner body
          spec: ≤140 chars, one plain non-alarming sentence; tells the user that
                saving/exporting/effects need a secure (https or localhost)
                context and that opening from a local file disables them; British
                spelling; no exclamation marks.
          sample: "Heads up — open Substrata over https or localhost; from a local file, saving and effects are switched off." */}
      ∑CG
    </div>
  );
}
