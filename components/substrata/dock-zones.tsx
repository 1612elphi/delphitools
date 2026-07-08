"use client";

import { useSyncExternalStore } from "react";
import { DragOverlay, useDroppable } from "@dnd-kit/core";
import { Dock, GripVertical, PanelBottom, PanelLeft, PanelRight, PanelTop } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { getDockDrag, subscribeDockDrag } from "@/lib/substrata/drag-dock";
import { getOmnibarEdge, subscribeDock, type Edge } from "@/lib/substrata/dock-pref";
import { MODULES } from "@/components/substrata/omnibar/modules";

/**
 * Drop targets for drag-to-dock, on dnd-kit: module drags get left-sidebar /
 * right-sidebar / rail droppables, an omnibar drag gets the four edges. The
 * zones render only while a drag is live (the shell's DndContext drives the
 * drag-dock store); collision is pointerWithin, so the pointer — not the tiny
 * grip rect — picks the target. The DragOverlay chip names what's in hand.
 */

type ZoneSpec = { id: string; icon: LucideIcon; cls: string };

/** Module-drag zones; the rail strip hugs the omnibar's current edge. */
function moduleZones(omniEdge: Edge): ZoneSpec[] {
  const rail: Record<Edge, string> = {
    bottom: "inset-x-32 bottom-2 h-20",
    top: "inset-x-32 top-2 h-20",
    left: "inset-y-32 left-28 w-20",
    right: "inset-y-32 right-28 w-20",
  };
  return [
    { id: "left", icon: PanelLeft, cls: "inset-y-2 left-2 w-20" },
    { id: "right", icon: PanelRight, cls: "inset-y-2 right-2 w-20" },
    { id: "rail", icon: Dock, cls: rail[omniEdge] },
  ];
}

const OMNIBAR_ZONES: ZoneSpec[] = [
  { id: "top", icon: PanelTop, cls: "inset-x-28 top-2 h-20" },
  { id: "bottom", icon: PanelBottom, cls: "inset-x-28 bottom-2 h-20" },
  { id: "left", icon: PanelLeft, cls: "inset-y-2 left-2 w-20" },
  { id: "right", icon: PanelRight, cls: "inset-y-2 right-2 w-20" },
];

export function DockZones() {
  const drag = useSyncExternalStore(subscribeDockDrag, getDockDrag, () => null);
  const omniEdge = useSyncExternalStore(subscribeDock, getOmnibarEdge, () => "bottom" as Edge);
  if (!drag) return null;
  const zones = drag.kind === "module" ? moduleZones(omniEdge) : OMNIBAR_ZONES;
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 z-50 select-none">
      {zones.map((z) => (
        <ZoneBox key={z.id} zone={z} />
      ))}
      <DragOverlay dropAnimation={null}>
        <div className="flex w-max items-center gap-1.5 border border-border bg-background px-2 py-1 text-[10.5px] font-bold uppercase tracking-wide shadow-lg">
          <GripVertical className="size-3 text-muted-foreground" />
          {drag.kind === "module" && MODULES[drag.id].title}
        </div>
      </DragOverlay>
    </div>
  );
}

function ZoneBox({ zone }: { zone: ZoneSpec }) {
  const { setNodeRef, isOver } = useDroppable({ id: zone.id });
  const Icon = zone.icon;
  return (
    <div
      ref={setNodeRef}
      data-dock-zone={zone.id}
      className={cn(
        "absolute grid place-items-center border-2 border-dashed border-primary transition-colors",
        isOver ? "bg-primary/25" : "bg-primary/5",
        zone.cls,
      )}
    >
      <Icon className={cn("size-5", isOver ? "text-primary" : "text-primary/60")} />
    </div>
  );
}
