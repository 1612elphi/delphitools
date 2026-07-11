"use client";

import { useState, useSyncExternalStore } from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ColourSwatchCell, DeferredHexInput, normalizeHex } from "@/components/colour-field";
import { Switch } from "@/components/ui/switch";
import { getSnapshot, subscribe } from "@/lib/substrata/doc-store";
import { resizeArtboardReflow, setArtboard } from "@/lib/substrata/artboard-ops";
import { createScene } from "@/lib/substrata/file-ops";
import { closeModal } from "@/lib/substrata/modal";
import { DEFAULT_ARTBOARD } from "@/lib/substrata/doc-model";
import { viewport } from "@/lib/substrata/viewport";

/**
 * Canvas size modal (blocking, §7) — edits the document artboard. Reads the
 * current artboard once to seed a LOCAL DRAFT; editing only touches the draft.
 * Apply commits the draft through `setArtboard` (a single undoable step) then
 * closes; Cancel discards it. The modal is remounted per open (ModalHost renders
 * it conditionally), so a plain useState initialiser is the right seed — no need
 * to resync on later doc changes.
 *
 * Field labels + preset dimensions are functional chrome / data, not authored
 * copy. British spelling in our own identifiers ("colour").
 */

/** Common canvas sizes, shown as DIMENSION labels (data). First is the default. */
const PRESETS: { w: number; h: number }[] = [
  { w: 2000, h: 1500 },
  { w: 1080, h: 1080 },
  { w: 1080, h: 1920 },
  { w: 1920, h: 1080 },
  { w: 1200, h: 630 },
  { w: 1600, h: 900 },
];

/** Greatest common divisor for the aspect-ratio readout. */
function gcd(a: number, b: number): number {
  return b === 0 ? a : gcd(b, a % b);
}

export function CanvasSizeModal({ mode = "resize" }: { mode?: "resize" | "new" }) {
  const doc = useSyncExternalStore(subscribe, getSnapshot, () => null);
  const ab = doc?.artboard ?? DEFAULT_ARTBOARD;
  // "new" mode (the New-scene dialog) drafts a FRESH scene: seeded from the
  // default artboard, Apply lands a new doc via createScene instead of
  // resizing the current one. Same fields, presets and chrome otherwise.
  const seed = mode === "new" ? DEFAULT_ARTBOARD : ab;

  // Draft, seeded on first render only (see doc block).
  const [width, setWidth] = useState(() => String(seed.width));
  const [height, setHeight] = useState(() => String(seed.height));
  const [resolution, setResolution] = useState(() => String(seed.resolution));
  const [colour, setColour] = useState(() => normalizeHex(seed.background ?? "") ?? "#ffffff");
  const [transparent, setTransparent] = useState(() => seed.background === null);
  // Magic resize (M7-8/9): reflow layers with the artboard. Off by default —
  // a plain canvas-size edit stays a plain canvas-size edit.
  const [reflow, setReflow] = useState(false);

  // Picking any colour implies an opaque background.
  const pickColour = (hex: string) => {
    setColour(hex);
    setTransparent(false);
  };

  const applyPreset = (w: number, h: number) => {
    setWidth(String(w));
    setHeight(String(h));
  };

  const apply = () => {
    const w = Math.max(1, Math.round(Number(width) || DEFAULT_ARTBOARD.width));
    const h = Math.max(1, Math.round(Number(height) || DEFAULT_ARTBOARD.height));
    const res = Math.max(1, Math.round(Number(resolution) || DEFAULT_ARTBOARD.resolution));
    const artboard = { width: w, height: h, resolution: res, background: transparent ? null : colour };
    if (mode === "new") {
      // bitDepth/colourMode ride the defaults — the dialog only drafts dims + background
      createScene({ ...DEFAULT_ARTBOARD, ...artboard }); // fresh doc, history reset
      viewport.fit();
    } else if (reflow && (w !== ab.width || h !== ab.height)) {
      resizeArtboardReflow(artboard); // one undoable step: artboard + layer reflow
      viewport.fit(); // aspect jumps reframe — the reconciler never refits itself
    } else {
      setArtboard(artboard);
    }
    closeModal();
  };

  // Live readout (data): parse the draft; only valid, ≥1 integers get an aspect.
  const wNum = parseInt(width, 10);
  const hNum = parseInt(height, 10);
  const dimsValid = Number.isFinite(wNum) && Number.isFinite(hNum) && wNum >= 1 && hNum >= 1;
  const g = dimsValid ? gcd(wNum, hNum) : 1;

  return (
    <DialogContent
      className="max-w-md gap-0 border-2 border-border p-0"
      aria-describedby={undefined}
    >
      <DialogHeader className="border-b-2 border-border px-4 py-3 text-left">
        <DialogTitle className="pr-8 text-sm font-bold uppercase tracking-wide">
          {/* "New scene" reuses the Scene-menu item's shipped label */}
          {mode === "new" ? "New scene" : "Canvas size"}
        </DialogTitle>
      </DialogHeader>

      {/* Body — text/labels breathe (padded); segmented groups bleed to the
          frame edges via -mx-4 border-x-0 (DESIGN.md §6/§7). */}
      <div className="space-y-4 px-4 py-4">
        {/* Presets — dimension labels are data, not copy. */}
        <section className="space-y-2">
          <div className="text-[10.5px] font-bold uppercase tracking-wide text-muted-foreground">
            Presets
          </div>
          <div className="segmented -mx-4 grid-cols-3 border-x-0">
            {PRESETS.map((p) => {
              const active = wNum === p.w && hNum === p.h;
              return (
                <Button
                  key={`${p.w}x${p.h}`}
                  type="button"
                  variant={active ? "default" : "outline"}
                  onClick={() => applyPreset(p.w, p.h)}
                  className="h-10 text-xs tabular-nums"
                >
                  {p.w} × {p.h}
                </Button>
              );
            })}
          </div>
        </section>

        {/* Dimensions — Width | Height, then Resolution across both cells. */}
        <section className="space-y-2">
          <div className="segmented -mx-4 grid-cols-2 border-x-0">
            <NumberField label="Width" unit="px" value={width} onChange={setWidth} />
            <NumberField label="Height" unit="px" value={height} onChange={setHeight} />
            <NumberField
              label="Resolution"
              unit="ppi"
              value={resolution}
              onChange={setResolution}
              className="col-span-2"
            />
          </div>
          <div className="text-[11px] tabular-nums text-muted-foreground">
            {dimsValid ? `${wNum} × ${hNum} px · ${wNum / g}:${hNum / g}` : "—"}
          </div>
        </section>

        {/* Magic resize (M7): when on, Apply re-anchors + proportionally scales
            every layer with the artboard (anchor+proportional, ratified).
            Hidden in "new" mode — a fresh scene has no layers to reflow. */}
        {mode !== "new" && (
          <section className="-mx-4 flex items-center justify-between gap-3 border-y border-border bg-card px-4 py-2.5">
            <span className="text-xs">
              Reflow layers to fit
            </span>
            <Switch
              checked={reflow}
              onCheckedChange={setReflow}
              aria-label="Reflow layers to fit"
            />
          </section>
        )}

        {/* Background — swatch + hex, plus a Transparent toggle (→ background null). */}
        <section className="space-y-2">
          <div className="text-[10.5px] font-bold uppercase tracking-wide text-muted-foreground">
            Background
          </div>
          <div className="-mx-4 flex items-stretch border-y border-border">
            <div className="relative w-12 shrink-0 border-r border-border [background:repeating-conic-gradient(#ccc_0_25%,#fff_0_50%)_0_0/10px_10px]">
              <ColourSwatchCell
                colour={colour}
                onChange={pickColour}
                className="size-full"
                style={transparent ? { opacity: 0 } : undefined}
                aria-label="Background colour"
              />
            </div>
            <DeferredHexInput
              value={colour}
              onChange={pickColour}
              aria-label="Background hex value"
              className={cn(
                "h-11 min-w-0 flex-1 rounded-none border-0 bg-card font-mono text-xs uppercase tabular-nums shadow-none focus-visible:ring-0",
                transparent && "opacity-50",
              )}
            />
            <button
              type="button"
              aria-pressed={transparent}
              onClick={() => setTransparent((t) => !t)}
              className={cn(
                "shrink-0 border-l border-border px-4 text-xs",
                transparent
                  ? "bg-primary text-primary-foreground"
                  : "bg-card text-muted-foreground hover:bg-accent hover:text-foreground",
              )}
            >
              Transparent
            </button>
          </div>
        </section>
      </div>

      {/* Footer — flush bar closed off by a 2px major divider (§5/§9). The primary
          Apply dominates the width; Cancel discards and closes. */}
      <DialogFooter className="mt-0 flex-row gap-0 border-t-2 border-border">
        <Button
          type="button"
          variant="ghost"
          onClick={() => closeModal()}
          className="h-12 flex-1 rounded-none border-r border-border text-sm"
        >
          Cancel
        </Button>
        <Button
          type="button"
          onClick={apply}
          className="h-12 flex-[2] rounded-none text-sm font-semibold"
        >
          {mode === "new" ? (
            <>
              {/* ∑CG: New-scene dialog primary action button
                  spec: one word, imperative, confirms creating the fresh scene at the chosen size; pairs with the shipped "Cancel"; ≤ 10 chars
                  sample: "Create"
              */}
              {"∑CG"}
            </>
          ) : (
            "Apply"
          )}
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}

/** A flush, labelled numeric cell (draft-as-string; parsed/clamped on Apply).
 *  Wrapped in <label> so the visible label is the accessible name. */
function NumberField({
  label,
  unit,
  value,
  onChange,
  className,
}: {
  label: string;
  unit?: string;
  value: string;
  onChange: (next: string) => void;
  className?: string;
}) {
  return (
    <label className={cn("flex h-11 items-center gap-2 bg-card px-3", className)}>
      <span className="shrink-0 text-xs text-muted-foreground">{label}</span>
      <input
        type="text"
        inputMode="numeric"
        value={value}
        onChange={(e) => onChange(e.currentTarget.value)}
        onFocus={(e) => e.currentTarget.select()}
        className="w-full min-w-0 bg-transparent text-right text-sm tabular-nums outline-none"
      />
      {unit && <span className="shrink-0 text-[11px] text-muted-foreground">{unit}</span>}
    </label>
  );
}
