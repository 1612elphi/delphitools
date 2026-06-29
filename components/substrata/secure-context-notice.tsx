"use client";

import { useEffect, useState } from "react";
import { detectCapabilities } from "@/lib/substrata/capabilities";

/**
 * Render-gated degraded-context banner (M0-7 stub). Returns null in a normal
 * secure context (https/localhost); only appears when Substrata is opened over
 * file:// or another insecure origin where Workers/OPFS/FS-Access/crypto.subtle/
 * WebGPU are unavailable. Detection runs in an effect so the static-export HTML
 * and first client render agree (no hydration mismatch).
 *
 * Not yet mounted in the shell — wiring + styling is gated UI work.
 */
export function SecureContextNotice() {
  const [insecure, setInsecure] = useState(false);

  useEffect(() => {
    setInsecure(!detectCapabilities().secureContext);
  }, []);

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
