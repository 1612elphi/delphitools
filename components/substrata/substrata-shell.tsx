"use client";

import { useEffect, useRef } from "react";
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
import { ModalHost } from "@/components/substrata/modal-host";
import { LayerContextMenu } from "@/components/substrata/layer-context-menu";
import { SelectionPopup } from "@/components/substrata/selection-popup";
import { SecureContextNotice } from "@/components/substrata/secure-context-notice";
import { EmptyHint } from "@/components/substrata/empty-hint";
import { SmallScreenNotice } from "@/components/substrata/small-screen-notice";
import { DockZones } from "@/components/substrata/dock-zones";
import { FloatLayer } from "@/components/substrata/float-layer";
import { useEditorShortcuts } from "@/hooks/use-editor-shortcuts";
import { dockToRail, floatModule, hydrateLayoutPrefs, setOmnibarEdge, type Edge } from "@/lib/substrata/dock-pref";
import { setPinned } from "@/lib/substrata/pin-pref";
import { endDockDrag, startDockDrag, type DockDrag } from "@/lib/substrata/drag-dock";

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
 * Top-level composition of the editor surface: top bar over the canvas area,
 * with the omnibar, utility rail and free-floating panels layered above the
 * canvas (round-3 docking — the left/right sidebars are gone).
 */
export function SubstrataShell() {
  useEditorShortcuts();
  // float-drop coordinates are relative to the canvas area
  const canvasAreaRef = useRef<HTMLDivElement>(null);

  // Restore the persisted dock/rail/pin layout after mount (kept out of the
  // initial render so it can't desync the prerendered HTML — see dock-pref).
  useEffect(() => {
    hydrateLayoutPrefs();
  }, []);

  // Drag-to-dock (dnd-kit): grips in module headers + the omnibar are the
  // draggables. An omnibar drag targets the four edge zones; a MODULE drag
  // targets the rail strip (re-dock) or — anywhere else — floats the panel
  // at the drop point (round 3: the canvas itself is the target).
  // pointerWithin: the pointer picks the zone, not the grip rect; the 4px
  // activation keeps grip clicks inert.
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));
  const onDragStart = (e: DragStartEvent) => {
    const drag = e.active.data.current as DockDrag | undefined;
    if (drag) startDockDrag(drag);
  };
  const onDragEnd = (e: DragEndEvent) => {
    const drag = e.active.data.current as DockDrag | undefined;
    const over = e.over?.id;
    if (drag) {
      if (drag.kind === "module") {
        if (over === "rail") {
          dockToRail(drag.id);
          setPinned(drag.id, true);
        } else {
          // free drop: land the panel's header under the pointer
          const rect = canvasAreaRef.current?.getBoundingClientRect();
          const activator = e.activatorEvent as PointerEvent | undefined;
          if (rect && activator && typeof activator.clientX === "number") {
            const x = activator.clientX + e.delta.x - rect.left - 10;
            const y = activator.clientY + e.delta.y - rect.top - 10;
            floatModule(drag.id, {
              x: Math.max(0, Math.min(x, rect.width - 120)),
              y: Math.max(0, Math.min(y, rect.height - 40)),
            });
            setPinned(drag.id, true);
          }
        }
      } else if (typeof over === "string") {
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
      <div className="flex min-h-0 flex-1">
        <div ref={canvasAreaRef} className="relative flex min-h-0 flex-1">
          <FabricCanvas />
          <Omnibar />
          {/* free-floating panels (round 3) — mini when idle, full on
              hover/focus, clamp to hold */}
          <FloatLayer />
          {/* pixel-selection action strip — anchored by the canvas per frame */}
          <SelectionPopup />
          {/* starter card while the scene is empty */}
          <EmptyHint />
          {/* drag-to-dock drop targets — render only mid-drag */}
          <DockZones />
        </div>
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
