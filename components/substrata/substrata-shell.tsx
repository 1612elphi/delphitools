"use client";

import { useEffect } from "react";
import dynamic from "next/dynamic";

import { TopBar } from "@/components/substrata/top-bar";
import { Omnibar } from "@/components/substrata/omnibar/omnibar";
import { Sidebar } from "@/components/substrata/sidebar";
import { ModalHost } from "@/components/substrata/modal-host";
import { LayerContextMenu } from "@/components/substrata/layer-context-menu";
import { SelectionPopup } from "@/components/substrata/selection-popup";
import { useEditorShortcuts } from "@/hooks/use-editor-shortcuts";
import { hydrateLayoutPrefs } from "@/lib/substrata/dock-pref";

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

  // Restore the persisted dock/rail/pin layout after mount (kept out of the
  // initial render so it can't desync the prerendered HTML — see dock-pref).
  useEffect(() => {
    hydrateLayoutPrefs();
  }, []);

  return (
    <div className="flex h-full w-full flex-col overflow-hidden">
      <TopBar />
      {/* Body: left sidebar · canvas area · right sidebar. Modules dock to a
          sidebar or the rail (Workspace ▸ Dock modules); sidebars appear only when
          they hold a module. The omnibar + rail float over the canvas area. */}
      <div className="flex min-h-0 flex-1">
        <Sidebar side="left" />
        <div className="relative flex min-h-0 flex-1">
          <FabricCanvas />
          <Omnibar />
          {/* pixel-selection action strip — anchored by the canvas per frame */}
          <SelectionPopup />
        </div>
        <Sidebar side="right" />
      </div>
      <ModalHost />
      {/* right-click layer menu — ONE instance; canvas + layers panel open it */}
      <LayerContextMenu />
    </div>
  );
}
