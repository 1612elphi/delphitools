"use client";

import dynamic from "next/dynamic";

import { TopBar } from "@/components/substrata/top-bar";
import { Omnibar } from "@/components/substrata/omnibar/omnibar";
import { useEditorShortcuts } from "@/hooks/use-editor-shortcuts";

// The Fabric canvas is loaded only on the client: ssr:false keeps the heavy,
// browser-only Fabric module out of the static-export prerender. Everything
// imperative and canvas-related hangs off this single dynamic boundary.
const FabricCanvas = dynamic(
  () => import("@/components/substrata/fabric-canvas").then((m) => m.FabricCanvas),
  {
    ssr: false,
    // Inert loading placeholder — no user-facing copy (∑CG everywhere).
    loading: () => <div className="flex-1 bg-muted" aria-hidden />,
  },
);

/**
 * Top-level composition of the editor surface. In the skeleton this is just the
 * canvas filling the viewport.
 *
 * GATED — the following mount points are intentionally left as structural gaps
 * (built in later, human-reviewed milestones), NOT stubbed with placeholder UI:
 *   - <TopBar/>           §7 chrome: logo→home, Substrata, Scene/Edit/Workspace/Help,
 *                         scene name + save status, undo/redo, zoom, Export, theme  (M0-4/M0-5)
 *   - window-shell regions  dock for the omnibar + utility rail                     (M0-6)
 *   - <Omnibar/> / <Rail/>  the modular tool + panel surfaces                       (M1-10+)
 * All visible strings in those surfaces are ∑CG gaps to be filled via slopsieve.
 */
export function SubstrataShell() {
  useEditorShortcuts();

  return (
    <div className="flex h-full w-full flex-col overflow-hidden">
      <TopBar />
      {/* Canvas area (relative so the floating omnibar + rail position against it).
          Panels (Layers/etc.) now live in the omnibar — peek on hover, pin to the
          rail. The opt-in storage toggle rehomed to the Scene menu. */}
      <div className="relative flex min-h-0 flex-1">
        <FabricCanvas />
        <Omnibar />
      </div>
    </div>
  );
}
