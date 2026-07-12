"use client";

import { useEffect } from "react";
import dynamic from "next/dynamic";
import {
  DndContext,
  PointerSensor,
  pointerWithin,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";

import { TopBar } from "@/components/substrata/top-bar";
import { Omnibar } from "@/components/substrata/omnibar/omnibar";
import { Sidebar } from "@/components/substrata/sidebar";
import { ModalHost } from "@/components/substrata/modal-host";
import { LayerContextMenu } from "@/components/substrata/layer-context-menu";
import { SelectionPopup } from "@/components/substrata/selection-popup";
import { SecureContextNotice } from "@/components/substrata/secure-context-notice";
import { EmptyHint } from "@/components/substrata/empty-hint";
import { SmallScreenNotice } from "@/components/substrata/small-screen-notice";
import { DockZones } from "@/components/substrata/dock-zones";
import { useEditorShortcuts } from "@/hooks/use-editor-shortcuts";
import { hydrateLayoutPrefs, setModuleDock, setOmnibarEdge, type DockTarget, type Edge } from "@/lib/substrata/dock-pref";
import { setPinned } from "@/lib/substrata/pin-pref";
import { endDockDrag, startDockDrag, type DockDrag } from "@/lib/substrata/drag-dock";

// The Fabric canvas is loaded only on the client: ssr:false keeps the heavy,
// browser-only Fabric module out of the static-export prerender. Everything
// imperative and canvas-related hangs off this single dynamic boundary.
const FabricCanvas = dynamic(
  () => import("@/components/substrata/fabric-canvas").then((m) => m.FabricCanvas),
  {
    ssr: false,
    // Inert loading placeholder — no user-facing copy (\u2211CG everywhere).
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
 * All visible strings in those surfaces are \u2211CG gaps to be filled via slopsieve.
 */
export function SubstrataShell() {
  useEditorShortcuts();

  // Restore the persisted dock/rail/pin layout after mount (kept out of the
  // initial render so it can't desync the prerendered HTML — see dock-pref).
  useEffect(() => {
    hydrateLayoutPrefs();
  }, []);

  // Drag-to-dock (dnd-kit): grips in module headers + the omnibar are the
  // draggables, dock-zones.tsx renders the droppables while a drag is live,
  // and the drop dispatches into the SAME persisted prefs the old Workspace
  // menu wrote. pointerWithin: the pointer picks the zone, not the grip rect;
  // the 4px activation keeps grip clicks inert.
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));
  const onDragStart = (e: DragStartEvent) => {
    const drag = e.active.data.current as DockDrag | undefined;
    if (drag) startDockDrag(drag);
  };
  const onDragEnd = (e: DragEndEvent) => {
    const drag = e.active.data.current as DockDrag | undefined;
    const over = e.over?.id;
    if (drag && typeof over === "string") {
      if (drag.kind === "module") {
        setModuleDock(drag.id, over as DockTarget);
        setPinned(drag.id, true); // dropping a module also shows it
      } else {
        setOmnibarEdge(over as Edge);
      }
    }
    endDockDrag();
  };

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={pointerWithin}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onDragCancel={() => endDockDrag()}
    >
    <div className="flex h-full w-full flex-col overflow-hidden">
      <TopBar />
      {/* degraded-context banner — renders null on https/localhost */}
      <SecureContextNotice />
      {/* Body: left sidebar · canvas area · right sidebar. Modules dock to a
          sidebar or the rail (drag a module's grip onto a drop zone); sidebars
          appear only when they hold a module. The omnibar + rail float over
          the canvas area. */}
      <div className="flex min-h-0 flex-1">
        <Sidebar side="left" />
        <div className="relative flex min-h-0 flex-1">
          <FabricCanvas />
          <Omnibar />
          {/* pixel-selection action strip — anchored by the canvas per frame */}
          <SelectionPopup />
          {/* starter card while the scene is empty */}
          <EmptyHint />
          {/* drag-to-dock drop targets — render only mid-drag */}
          <DockZones />
        </div>
        <Sidebar side="right" />
      </div>
      <ModalHost />
      {/* right-click layer menu — ONE instance; canvas + layers panel open it */}
      <LayerContextMenu />
      {/* sub-768px viewports: dismissible not-designed-for-this-yet banner */}
      <SmallScreenNotice />
    </div>
    </DndContext>
  );
}
