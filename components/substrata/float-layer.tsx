"use client";

import { useState, useSyncExternalStore } from "react";
import { cn } from "@/lib/utils";
import { getPinned, subscribePins, type ModuleId } from "@/lib/substrata/pin-pref";
import {
  getClampedAll,
  getFloatPosAll,
  getModuleDockAll,
  subscribeDock,
} from "@/lib/substrata/dock-pref";
import { ModuleBox, ModuleHeader, MODULES } from "@/components/substrata/omnibar/modules";

const EMPTY: readonly ModuleId[] = [];

/**
 * Free-floating panels (round 3, Ruby 2026-07-12): an open module dragged out
 * of the rail lands here at an arbitrary canvas point. Idle floats render as
 * MINI cards — just the header row (title + live read-only summary + the
 * controls); hovering or keyboard-focusing one expands it to the full panel
 * in place, and the CLAMP toggle holds it full-size permanently. Positions
 * persist via dock-pref. Sits above the rail, below the omnibar.
 */
export function FloatLayer() {
  const pinned = useSyncExternalStore(subscribePins, getPinned, () => EMPTY);
  const docks = useSyncExternalStore(subscribeDock, getModuleDockAll, getModuleDockAll);
  const positions = useSyncExternalStore(subscribeDock, getFloatPosAll, getFloatPosAll);
  const clamps = useSyncExternalStore(subscribeDock, getClampedAll, getClampedAll);

  const floating = pinned.filter((id) => docks[id] === "float" && positions[id] !== null);
  if (floating.length === 0) return null;

  return (
    <>
      {floating.map((id) => (
        <FloatPanel key={id} id={id} pos={positions[id]!} clamped={clamps[id]} />
      ))}
    </>
  );
}

function FloatPanel({ id, pos, clamped }: { id: ModuleId; pos: { x: number; y: number }; clamped: boolean }) {
  const [hot, setHot] = useState(false);
  const full = clamped || hot;
  return (
    <div
      data-float-panel={id}
      className="absolute z-[35]"
      style={{ left: pos.x, top: pos.y }}
      onPointerEnter={() => setHot(true)}
      onPointerLeave={() => setHot(false)}
      onFocusCapture={() => setHot(true)}
      onBlurCapture={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setHot(false);
      }}
    >
      <div className="border border-border bg-background shadow-lg">
        {full ? (
          <ModuleBox id={id} variant="float" clamped={clamped} />
        ) : (
          // mini: the header row alone — title + live summary, read-only at a
          // glance, tighter than the module's full width
          <div className={cn("w-max", MODULES[id].sub != null && "min-w-[168px]")}>
            <ModuleHeader id={id} variant="float" clamped={clamped} />
          </div>
        )}
      </div>
    </div>
  );
}
