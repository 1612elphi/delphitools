"use client";

import dynamic from "next/dynamic";

import { LayersPanel } from "@/components/substrata/modules/layers-panel";

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
  return (
    <div className="flex h-full w-full flex-col overflow-hidden">
      {/* ∑CG: <TopBar/> mounts here (M0-4/M0-5) — gated on visual review */}
      <div className="flex min-h-0 flex-1">
        <FabricCanvas />
        {/* Provisional fixed dock. The real omnibar + utility-rail docking system
            (move modules to any edge via the Workspace menu) is M0-6/cross-cutting
            and gated on visual review — this just makes the Layers module usable. */}
        <LayersPanel />
      </div>
    </div>
  );
}
