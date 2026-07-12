"use client";

// Client entry for the Substrata editor. Must be a Client Component because the
// shell below uses next/dynamic with { ssr: false } (Fabric is browser-only and
// must never be evaluated during the static export prerender). Metadata for this
// route lives in layout.tsx — a client page cannot export it.

import { SubstrataShell } from "@/components/substrata/substrata-shell";

export default function EditorPage() {
  return <SubstrataShell />;
}
