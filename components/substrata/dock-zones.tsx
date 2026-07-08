"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { Dock, GripVertical, PanelBottom, PanelLeft, PanelRight, PanelTop } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { endDockDrag, getDockDrag, subscribeDockDrag, type DockDrag } from "@/lib/substrata/drag-dock";
import {
  getOmnibarEdge,
  setModuleDock,
  setOmnibarEdge,
  subscribeDock,
  type DockTarget,
  type Edge,
} from "@/lib/substrata/dock-pref";
import { setPinned } from "@/lib/substrata/pin-pref";
import { MODULES } from "@/components/substrata/omnibar/modules";

/**
 * Drop-target overlay for drag-to-dock (the Workspace-menu dock rows'
 * replacement). Renders only while a drag is live: module drags get
 * left-sidebar / right-sidebar / rail strips, an omnibar drag gets the four
 * edges. The overlay is pointer-events-none throughout — hit-testing is
 * geometric against the zone rects, so the drag never fights the canvas —
 * and the drop dispatches into dock-pref/pin-pref (already persisted).
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
  // keyed so each drag mounts a fresh tracker — no state to reset between drags
  const key = drag.kind === "module" ? `m-${drag.id}` : "omnibar";
  return <ZoneLayer key={key} drag={drag} omniEdge={omniEdge} />;
}

function ZoneLayer({ drag, omniEdge }: { drag: DockDrag; omniEdge: Edge }) {
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);
  const [hover, setHover] = useState<string | null>(null);
  const zoneEls = useRef(new Map<string, HTMLDivElement>());

  useEffect(() => {
    const hit = (x: number, y: number): string | null => {
      for (const [id, el] of zoneEls.current) {
        const r = el.getBoundingClientRect();
        if (x >= r.left && x <= r.right && y >= r.top && y <= r.bottom) return id;
      }
      return null;
    };
    const onMove = (e: PointerEvent) => {
      setPos({ x: e.clientX, y: e.clientY });
      setHover(hit(e.clientX, e.clientY));
    };
    const onUp = (e: PointerEvent) => {
      const zone = hit(e.clientX, e.clientY);
      if (zone) {
        if (drag.kind === "module") {
          setModuleDock(drag.id, zone as DockTarget);
          setPinned(drag.id, true); // dropping a module also shows it
        } else {
          setOmnibarEdge(zone as Edge);
        }
      }
      endDockDrag();
    };
    const onCancel = () => endDockDrag();
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onCancel);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onCancel);
    };
  }, [drag]);

  const zones = drag.kind === "module" ? moduleZones(omniEdge) : OMNIBAR_ZONES;

  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 z-50 select-none">
      {zones.map((z) => {
        const Icon = z.icon;
        return (
          <div
            key={z.id}
            ref={(el) => {
              if (el) zoneEls.current.set(z.id, el);
              else zoneEls.current.delete(z.id);
            }}
            data-dock-zone={z.id}
            className={cn(
              "absolute grid place-items-center border-2 border-dashed border-primary transition-colors",
              hover === z.id ? "bg-primary/25" : "bg-primary/5",
              z.cls,
            )}
          >
            <Icon className={cn("size-5", hover === z.id ? "text-primary" : "text-primary/60")} />
          </div>
        );
      })}
      {/* drag ghost — names what's in hand */}
      {pos && (
        <div
          className="fixed z-[100] flex items-center gap-1.5 border border-border bg-background px-2 py-1 text-[10.5px] font-bold uppercase tracking-wide shadow-lg"
          style={{ left: pos.x + 12, top: pos.y + 12 }}
        >
          <GripVertical className="size-3 text-muted-foreground" />
          {drag.kind === "module" && MODULES[drag.id].title}
        </div>
      )}
    </div>
  );
}
