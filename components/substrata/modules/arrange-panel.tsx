"use client";

import { useSyncExternalStore } from "react";
import {
  AlignCenterHorizontal,
  AlignCenterVertical,
  AlignEndHorizontal,
  AlignEndVertical,
  AlignHorizontalDistributeCenter,
  AlignStartHorizontal,
  AlignStartVertical,
  AlignVerticalDistributeCenter,
  FlipHorizontal2,
  FlipVertical2,
  RotateCcw,
  RotateCw,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { getSnapshot, subscribe } from "@/lib/substrata/doc-store";
import { findLayer, leafLayers, leafRenderList } from "@/lib/substrata/layer-tree";
import { getActiveLayerId, getSelectedLayerIds, subscribeSelection } from "@/lib/substrata/selection";
import { setTransforms } from "@/lib/substrata/layer-ops";
import type { Layer, Transform } from "@/lib/substrata/doc-model";

const EMPTY_IDS: readonly string[] = [];

/**
 * Arrange module — the merged Align + Rotate panel: align · distribute ·
 * rotate · flip over the WHOLE selection (M2 multi-select; groups expand to
 * their leaves). Align snaps every selected layer to the ARTBOARD
 * edges/centres; distribute (≥3) spreads the selection's centres evenly
 * between its outermost two; rotate/flip act on each layer around its own
 * centre. Every action commits through setTransforms — ONE undo step no
 * matter how many layers move. DESIGN.md flush/segmented.
 *
 * Align uses each layer's own (unrotated) box — a rotation-aware bounding-box
 * align, and rotate-as-a-unit around the selection's common centre, are later
 * refinements.
 */
export function ArrangeBody() {
  const doc = useSyncExternalStore(subscribe, getSnapshot, () => null);
  const selectedIds = useSyncExternalStore(subscribeSelection, getSelectedLayerIds, () => EMPTY_IDS);
  const activeId = useSyncExternalStore(subscribeSelection, getActiveLayerId, () => null);
  const primary = doc && activeId ? findLayer(doc.layers, activeId) : null;

  if (!doc || !primary) {
    return (
      <div className="p-4 text-center text-xs text-muted-foreground">
        {/* ∑CG: arrange empty-state hint (no selection)
            spec: ≤ 48 chars; tells the user to select a layer to arrange it; British spelling.
            sample: "Select a layer to arrange it." */}
        ∑CG
      </div>
    );
  }

  // The selection's LEAF layers (groups are folders — their members arrange),
  // filtered by ROOT-composed effective flags: hidden or (ancestor-)locked
  // leaves never move.
  const effective = new Map(leafRenderList(doc.layers).map((e) => [e.layer.id, e]));
  const leaves: Layer[] = [];
  for (const id of selectedIds) {
    const l = findLayer(doc.layers, id);
    if (!l) continue;
    for (const leaf of leafLayers(l)) {
      const e = effective.get(leaf.id);
      if (e && e.visible && !e.locked && !leaves.includes(leaf)) leaves.push(leaf);
    }
  }

  const ab = doc.artboard;
  const t = primary.transform;
  const dimsOf = (l: Layer) =>
    l.kind === "raster"
      ? { w: l.naturalWidth * l.transform.scaleX, h: l.naturalHeight * l.transform.scaleY }
      : null;
  // v1: only raster leaves have dimensions; others join align/distribute in M2+.
  const sized = leaves.filter((l) => dimsOf(l) !== null);
  const canAlign = sized.length > 0;
  const canDistribute = sized.length >= 3;

  const alignAll = (fn: (d: { w: number; h: number }) => Partial<Transform>) =>
    setTransforms(sized.map((l) => ({ id: l.id, transform: { ...l.transform, ...fn(dimsOf(l)!) } })));

  const distribute = (axis: "x" | "y") => {
    const sorted = [...sized].sort((a, b) => a.transform[axis] - b.transform[axis]);
    const lo = sorted[0].transform[axis];
    const hi = sorted[sorted.length - 1].transform[axis];
    const step = (hi - lo) / (sorted.length - 1);
    setTransforms(
      sorted.map((l, i) => ({ id: l.id, transform: { ...l.transform, [axis]: lo + i * step } })),
    );
  };

  const norm = (a: number) => ((a % 360) + 360) % 360;
  const rotate = (delta: number) =>
    setTransforms(
      leaves.map((l) => ({ id: l.id, transform: { ...l.transform, angle: norm(l.transform.angle + delta) } })),
    );
  const flip = (axis: "flipX" | "flipY") =>
    setTransforms(
      leaves.map((l) => ({ id: l.id, transform: { ...l.transform, [axis]: !l.transform[axis] } })),
    );

  return (
    <div className="text-xs">
      {/* Align (to the artboard) */}
      <Section title="Align">
        {/* ∑CG: aria-labels for the six align actions, in order — align left, centre
            horizontally, align right, align top, centre vertically, align bottom.
            spec: each ≤ 24 chars, names the action; British spelling ("centre"). */}
        <div className="segmented grid-cols-6 border-x-0">
          <IconBtn icon={AlignStartVertical} aria="∑CG" disabled={!canAlign} onClick={() => alignAll((d) => ({ x: d.w / 2 }))} />
          <IconBtn icon={AlignCenterVertical} aria="∑CG" disabled={!canAlign} onClick={() => alignAll(() => ({ x: ab.width / 2 }))} />
          <IconBtn icon={AlignEndVertical} aria="∑CG" disabled={!canAlign} onClick={() => alignAll((d) => ({ x: ab.width - d.w / 2 }))} />
          <IconBtn icon={AlignStartHorizontal} aria="∑CG" disabled={!canAlign} onClick={() => alignAll((d) => ({ y: d.h / 2 }))} />
          <IconBtn icon={AlignCenterHorizontal} aria="∑CG" disabled={!canAlign} onClick={() => alignAll(() => ({ y: ab.height / 2 }))} />
          <IconBtn icon={AlignEndHorizontal} aria="∑CG" disabled={!canAlign} onClick={() => alignAll((d) => ({ y: ab.height - d.h / 2 }))} />
        </div>
      </Section>

      {/* Distribute — spreads ≥3 selected layers' centres evenly. */}
      <Section title="Distribute">
        {/* ∑CG: aria-labels for the two distribute actions — distribute horizontally,
            distribute vertically. spec: each ≤ 28 chars; British spelling. */}
        <div className="segmented grid-cols-2 border-x-0">
          <IconBtn icon={AlignHorizontalDistributeCenter} aria="∑CG" disabled={!canDistribute} onClick={() => distribute("x")} />
          <IconBtn icon={AlignVerticalDistributeCenter} aria="∑CG" disabled={!canDistribute} onClick={() => distribute("y")} />
        </div>
      </Section>

      {/* Rotate & flip */}
      <Section title="Rotate & flip">
        {/* ∑CG: aria-labels for — rotate 90° left, rotate 90° right, flip horizontal,
            flip vertical. spec: each ≤ 28 chars; British spelling. */}
        <div className="segmented grid-cols-4 border-x-0">
          <IconBtn icon={RotateCcw} aria="∑CG" onClick={() => rotate(-90)} />
          <IconBtn icon={RotateCw} aria="∑CG" onClick={() => rotate(90)} />
          <IconBtn icon={FlipHorizontal2} aria="∑CG" active={t.flipX} onClick={() => flip("flipX")} />
          <IconBtn icon={FlipVertical2} aria="∑CG" active={t.flipY} onClick={() => flip("flipY")} />
        </div>
      </Section>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="px-3 pb-1.5 pt-2 text-[10.5px] font-bold uppercase tracking-wide text-muted-foreground">
        {title}
      </div>
      {children}
    </div>
  );
}

/** A flush segmented action cell. `active` marks a live toggle (flip); `disabled`
 *  greys it out (e.g. distribute without a multi-selection). */
function IconBtn({
  icon: Icon,
  aria,
  onClick,
  disabled,
  active,
}: {
  icon: LucideIcon;
  aria: string;
  onClick?: () => void;
  disabled?: boolean;
  active?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={aria}
      className={cn(
        "grid h-9 cursor-default place-items-center bg-card",
        active
          ? "bg-primary text-primary-foreground"
          : "text-muted-foreground hover:bg-accent hover:text-foreground",
        disabled && "pointer-events-none opacity-40",
      )}
    >
      <Icon className="size-4" />
    </button>
  );
}
