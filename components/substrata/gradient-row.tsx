"use client";

import { useState } from "react";
import { Minus, Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import { StepBtn, Stepper } from "@/components/substrata/preset-row";
import { TransientColourCell } from "@/components/substrata/transient-colour";
import { setFill } from "@/lib/substrata/layer-ops";
import { hexToOklch, oklchToHex } from "@/lib/substrata/colour-convert";
import type { Gradient, GradientStop } from "@/lib/substrata/doc-model";

/**
 * Inspector fill rows for SHAPE layers — the gradient authoring pass
 * (2026-07-07). The Fill row grows a Solid/Gradient mode pair (standard
 * vocabulary chrome, the LTR/RTL precedent); gradient mode opens a compact
 * editor: Linear/Radial pair, a preview strip with CLICKABLE stop markers
 * (v1 — no marker dragging, see ponytail note), the selected stop's
 * colour + offset, add/remove stop, and an angle stepper for linear.
 *
 * Every discrete edit is ONE setFill() → one undo step; the stop swatch rides
 * the shared transient-colour mechanism so OS-picker drags coalesce to one
 * step. Freehand fills stay solid-only (string-typed; the Inspector keeps its
 * plain FillRow for those). The colour SINK's ratified v1 call is unchanged:
 * a flat pick REPLACES a gradient fill (colour-sink.ts).
 */

const MAX_STOPS = 6;

/**
 * Linear coords from an angle through the unit box: 0° = left→right,
 * 90° = top→bottom (clockwise, y-down screen space). The line passes through
 * the centre (0.5, 0.5) along (cos θ, sin θ) and spans the box's full
 * projection onto it (len = |cos| + |sin|, the CSS-gradient convention), so
 * 45° runs corner to corner instead of stopping short. Endpoints poke ≤ ~0.11
 * outside 0–1 at oblique angles — canvas/fabric gradients accept that (the
 * 0–1 coords are a relative basis, not a clamp).
 * Mirrored by the scratch check .check-gradient-coords.mjs — keep in step.
 */
export function angleToCoords(deg: number): Gradient["coords"] {
  const t = (deg * Math.PI) / 180;
  const dx = Math.cos(t);
  const dy = Math.sin(t);
  const half = (Math.abs(dx) + Math.abs(dy)) / 2;
  const r = (v: number) => Math.round(v * 1000) / 1000 + 0; // + 0 folds −0 → 0
  return { x1: r(0.5 - dx * half), y1: r(0.5 - dy * half), x2: r(0.5 + dx * half), y2: r(0.5 + dy * half) };
}

/** Inverse for display: the stored line's direction, degrees 0–359. */
export function coordsToAngle(c: Gradient["coords"]): number {
  const deg = (Math.atan2(c.y2 - c.y1, c.x2 - c.x1) * 180) / Math.PI;
  return Math.round((deg + 360) % 360) % 360;
}

/** Centred radial default — inner point at the middle, outer radius to the
 *  edge midpoints. Focal/centre editing is deferred (v1). */
const RADIAL_COORDS: Gradient["coords"] = { x1: 0.5, y1: 0.5, x2: 0.5, y2: 0.5, r1: 0, r2: 0.5 };

/**
 * Solid → 2-stop linear (angle 0). The far stop is the SAME colour nudged
 * ±0.18 OKLCH lightness away from the nearer bound, so the ramp is always
 * visible whatever the base — chosen over "→ transparent" because the fill
 * pipeline and the hex-only colour cells speak #rrggbb.
 */
function solidToGradient(hex: string): Gradient {
  const lch = hexToOklch(hex) ?? { L: 0.5, C: 0, h: 0 };
  const far = oklchToHex({ ...lch, L: lch.L >= 0.5 ? lch.L - 0.18 : lch.L + 0.18 });
  return {
    type: "linear",
    stops: [
      { offset: 0, colour: hex },
      { offset: 1, colour: far },
    ],
    coords: angleToCoords(0),
  };
}

/** Local mirror of the Inspector's private ShapeRow (5 lines beat an import
 *  cycle — inspector-panel imports this file). */
function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex min-h-8 items-center justify-between gap-3 border-b border-border px-3 py-1 text-[11px] last:border-b-0">
      <span className="text-muted-foreground">{label}</span>
      {children}
    </div>
  );
}

/** Segmented two-option pair (the Inspector's LTR/RTL language). */
function ModePair<T extends string>({
  options,
  value,
  onPick,
}: {
  options: readonly T[];
  value: T;
  onPick: (v: T) => void;
}) {
  return (
    <span className="segmented grid-cols-2">
      {options.map((o) => (
        <button
          key={o}
          type="button"
          onClick={() => onPick(o)}
          className={cn(
            "h-6 px-2 text-[10.5px] capitalize",
            value === o
              ? "bg-primary text-primary-foreground"
              : "bg-card text-muted-foreground hover:bg-accent hover:text-foreground",
          )}
        >
          {o}
        </button>
      ))}
    </span>
  );
}

/** The shape Fill row(s): mode pair + solid swatch or the gradient editor.
 *  Key it by layer id at the call site so stop selection resets per layer. */
export function ShapeFillRows({ layerId, fill }: { layerId: string; fill: string | Gradient }) {
  const grad = typeof fill === "string" ? null : fill;
  const [sel, setSel] = useState(0);
  const selIdx = grad ? Math.min(sel, grad.stops.length - 1) : 0;

  return (
    <>
      <Row label="Fill">
        <div className="flex flex-col items-end gap-1">
          <ModePair
            options={["solid", "gradient"] as const}
            value={grad ? "gradient" : "solid"}
            onPick={(mode) => {
              if (mode === "gradient" && !grad) setFill(layerId, solidToGradient(fill as string));
              // switching back adopts stop[0]'s colour as the solid
              else if (mode === "solid" && grad) setFill(layerId, grad.stops[0]?.colour ?? "#888888");
            }}
          />
          {!grad && (
            <TransientColourCell
              value={fill as string}
              onApply={(v, transient) => setFill(layerId, v, transient ? { transient } : undefined)}
              // ∑CG: aria-label for the layer fill swatch. sample: "Fill colour"
              swatchAria="∑CG"
              // ∑CG: aria-label for the layer fill hex field. sample: "Fill hex"
              hexAria="∑CG"
            />
          )}
        </div>
      </Row>
      {grad && <GradientEditor layerId={layerId} grad={grad} selIdx={selIdx} setSel={setSel} />}
    </>
  );
}

function GradientEditor({
  layerId,
  grad,
  selIdx,
  setSel,
}: {
  layerId: string;
  grad: Gradient;
  selIdx: number;
  setSel: (i: number) => void;
}) {
  const stops = grad.stops;

  /** Commit new stops (kept offset-sorted so the CSS preview and undo diffs
   *  stay sane); selection follows `track` through the re-sort. */
  const commitStops = (next: GradientStop[], track?: GradientStop, transient?: boolean) => {
    const sorted = [...next].sort((a, b) => a.offset - b.offset);
    if (track) setSel(Math.max(0, sorted.indexOf(track)));
    setFill(layerId, { ...grad, stops: sorted }, transient ? { transient } : undefined);
  };

  const patchStop = (patch: Partial<GradientStop>, transient?: boolean) => {
    const next = { ...stops[selIdx], ...patch };
    commitStops(stops.map((s, i) => (i === selIdx ? next : s)), next, transient);
  };

  const addStop = () => {
    if (stops.length >= MAX_STOPS) return;
    const cur = stops[selIdx];
    const nb = stops[selIdx + 1] ?? stops[selIdx - 1]; // min 2 stops ⇒ a neighbour exists
    const stop: GradientStop = { offset: Math.round(((cur.offset + nb.offset) / 2) * 100) / 100, colour: cur.colour };
    commitStops([...stops, stop], stop);
  };

  const removeStop = () => {
    if (stops.length <= 2) return;
    setSel(Math.max(0, selIdx - 1));
    setFill(layerId, { ...grad, stops: stops.filter((_, i) => i !== selIdx) });
  };

  const previewCss = `linear-gradient(90deg, ${stops.map((s) => `${s.colour} ${s.offset * 100}%`).join(", ")})`;

  return (
    <>
      <Row label="Type">
        <ModePair
          options={["linear", "radial"] as const}
          value={grad.type}
          onPick={(type) => {
            if (type === grad.type) return;
            // type switch keeps the stops, resets coords to that type's default
            setFill(layerId, { ...grad, type, coords: type === "radial" ? RADIAL_COORDS : angleToCoords(0) });
          }}
        />
      </Row>
      {/* preview strip — stop order/colour along a flat 0→100% ramp (radial
          geometry previews on the canvas itself); markers select a stop.
          ponytail: markers are click-to-select only; drag-to-move via the
          Offset stepper — add pointer drag if it ever feels missing. */}
      <div className="border-b border-border px-3 py-2">
        <div className="relative mx-1.5 h-6 border border-border">
          <div className="absolute inset-0" style={{ backgroundImage: previewCss }} aria-hidden />
          {stops.map((s, i) => (
            <button
              key={i}
              type="button"
              onClick={() => setSel(i)}
              /* ∑CG: aria-label for a gradient stop marker (the ×N pattern —
                 the visible content is its colour). spec: identifies stop
                 i+1 of stops.length. sample: "Stop 2 of 3" */
              aria-label="∑CG"
              className={cn(
                "absolute top-0 h-full w-2.5 -translate-x-1/2 border",
                i === selIdx ? "z-10 border-primary ring-1 ring-primary" : "border-border",
              )}
              style={{ left: `${s.offset * 100}%`, backgroundColor: s.colour }}
            />
          ))}
        </div>
      </div>
      <Row label="Stop">
        <span className="flex items-stretch border border-border">
          <span className="grid h-6 min-w-[42px] place-items-center px-1 text-[11px] tabular-nums">
            {selIdx + 1}/{stops.length}
          </span>
          <StepBtn
            icon={Plus}
            onClick={addStop}
            disabled={stops.length >= MAX_STOPS}
            // ∑CG: aria-label for the add-stop button. sample: "Add stop"
            aria="∑CG"
          />
          <StepBtn
            icon={Minus}
            onClick={removeStop}
            disabled={stops.length <= 2}
            // ∑CG: aria-label for the remove-stop button. sample: "Remove stop"
            aria="∑CG"
          />
        </span>
      </Row>
      <Row label="Colour">
        <TransientColourCell
          value={stops[selIdx]?.colour ?? "#888888"}
          onApply={(hex, transient) => patchStop({ colour: hex }, transient)}
          // ∑CG: aria-label for the selected stop's colour swatch. sample: "Stop colour"
          swatchAria="∑CG"
          // ∑CG: aria-label for the selected stop's hex field. sample: "Stop hex"
          hexAria="∑CG"
        />
      </Row>
      <Row label="Offset">
        <Stepper
          value={Math.round((stops[selIdx]?.offset ?? 0) * 100)}
          onChange={(v) => patchStop({ offset: v / 100 })}
          min={0}
          max={100}
          step={5}
          unit="%"
        />
      </Row>
      {grad.type === "linear" && (
        <Row label="Angle">
          <Stepper
            value={coordsToAngle(grad.coords)}
            onChange={(deg) => setFill(layerId, { ...grad, coords: angleToCoords(deg) })}
            min={0}
            max={360}
            step={15}
            unit="°"
          />
        </Row>
      )}
    </>
  );
}
