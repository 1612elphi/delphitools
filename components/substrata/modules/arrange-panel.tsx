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
import { getActiveLayerId, subscribeSelection } from "@/lib/substrata/selection";
import { setTransform } from "@/lib/substrata/layer-ops";

/**
 * Arrange module (modals pass) — the merged Align + Rotate panel: align ·
 * distribute · rotate · flip for the selected layer. Align snaps the layer to the
 * ARTBOARD edges/centres (single-select is enough for that); distribute needs a
 * multi-selection (M2), so it's shown disabled until then. Rotate/flip mutate the
 * transform. Reads selection + doc; every action commits through setTransform
 * (one undoable step). DESIGN.md flush/segmented.
 *
 * Align uses the layer's own (unrotated) box — a rotation-aware bounding-box
 * align is a later refinement.
 */
export function ArrangeBody() {
  const doc = useSyncExternalStore(subscribe, getSnapshot, () => null);
  const activeId = useSyncExternalStore(subscribeSelection, getActiveLayerId, () => null);
  const layer = doc && activeId ? doc.layers.find((l) => l.id === activeId) ?? null : null;

  if (!doc || !layer) {
    return (
      <div className="p-4 text-center text-xs text-muted-foreground">
        {/* ∑CG: arrange empty-state hint (no selection)
            spec: ≤ 48 chars; tells the user to select a layer to arrange it; British spelling.
            sample: "Select a layer to arrange it." */}
        ∑CG
      </div>
    );
  }

  const ab = doc.artboard;
  const t = layer.transform;
  const dims =
    layer.kind === "raster"
      ? { w: layer.naturalWidth * t.scaleX, h: layer.naturalHeight * t.scaleY }
      : null;

  const setX = (x: number) => setTransform(layer.id, { ...t, x });
  const setY = (y: number) => setTransform(layer.id, { ...t, y });
  const rotate = (delta: number) =>
    setTransform(layer.id, { ...t, angle: (((t.angle + delta) % 360) + 360) % 360 });

  return (
    <div className="text-xs">
      {/* Align (to the artboard) */}
      <Section title="Align">
        {/* ∑CG: aria-labels for the six align actions, in order — align left, centre
            horizontally, align right, align top, centre vertically, align bottom.
            spec: each ≤ 24 chars, names the action; British spelling ("centre"). */}
        <div className="segmented grid-cols-6 border-x-0">
          <IconBtn icon={AlignStartVertical} aria="∑CG" disabled={!dims} onClick={() => dims && setX(dims.w / 2)} />
          <IconBtn icon={AlignCenterVertical} aria="∑CG" disabled={!dims} onClick={() => setX(ab.width / 2)} />
          <IconBtn icon={AlignEndVertical} aria="∑CG" disabled={!dims} onClick={() => dims && setX(ab.width - dims.w / 2)} />
          <IconBtn icon={AlignStartHorizontal} aria="∑CG" disabled={!dims} onClick={() => dims && setY(dims.h / 2)} />
          <IconBtn icon={AlignCenterHorizontal} aria="∑CG" disabled={!dims} onClick={() => setY(ab.height / 2)} />
          <IconBtn icon={AlignEndHorizontal} aria="∑CG" disabled={!dims} onClick={() => dims && setY(ab.height - dims.h / 2)} />
        </div>
      </Section>

      {/* Distribute — needs a multi-selection (M2); disabled until then. */}
      <Section title="Distribute">
        {/* ∑CG: aria-labels for the two distribute actions — distribute horizontally,
            distribute vertically. spec: each ≤ 28 chars; British spelling. */}
        <div className="segmented grid-cols-2 border-x-0">
          <IconBtn icon={AlignHorizontalDistributeCenter} aria="∑CG" disabled />
          <IconBtn icon={AlignVerticalDistributeCenter} aria="∑CG" disabled />
        </div>
      </Section>

      {/* Rotate & flip */}
      <Section title="Rotate & flip">
        {/* ∑CG: aria-labels for — rotate 90° left, rotate 90° right, flip horizontal,
            flip vertical. spec: each ≤ 28 chars; British spelling. */}
        <div className="segmented grid-cols-4 border-x-0">
          <IconBtn icon={RotateCcw} aria="∑CG" onClick={() => rotate(-90)} />
          <IconBtn icon={RotateCw} aria="∑CG" onClick={() => rotate(90)} />
          <IconBtn
            icon={FlipHorizontal2}
            aria="∑CG"
            active={t.flipX}
            onClick={() => setTransform(layer.id, { ...t, flipX: !t.flipX })}
          />
          <IconBtn
            icon={FlipVertical2}
            aria="∑CG"
            active={t.flipY}
            onClick={() => setTransform(layer.id, { ...t, flipY: !t.flipY })}
          />
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
