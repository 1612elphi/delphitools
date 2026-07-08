"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { getColourName } from "@/lib/colour-names";
import { rgbToHex } from "@/lib/substrata/colour-convert";
import { hslToRgb } from "@/lib/substrata/colour-hsv";
import { setRgb, type ColourSnapshot } from "@/lib/substrata/colour-store";

/**
 * Mode: shade (fun modes). A horizontally snap-scrolling reel of 24 hue cells
 * under a fixed centre window picks the hue family; a column of five tonal shades
 * for that hue sits below. Scrolling the reel to a new hue, or clicking a shade,
 * commits the current colour (its HSL → RGB via hslToRgb → setRgb). Local state
 * holds the reel's hue index + the selected tone index; the shown names come from
 * the colour-names DB (data, not copy).
 *
 * Ported from sketches/pickers-fun.html (the SHADE IIFE). The sketch's infinite
 * wrap is simplified to a bounded 0–23 reel: leading/trailing half-cell spacers
 * let the first and last hue reach the centre window, and the drag/scroll feel is
 * kept (native snap for wheel/touch, manual grab-drag with snap suspended). Maths
 * lives in colour-hsv / colour-convert; this file is pure UI + pointer handling.
 */

const HUE_COUNT = 24;
const CELL_W = 34; // px per reel cell (sketch .hcell)

// The 24 evenly spaced hues (0,15,…,345°) shown in the reel.
const HUES = Array.from({ length: HUE_COUNT }, (_, i) => i * 15);

// Five tonal steps per hue (the sketch's TONES): saturation/lightness in percent;
// `w` is a nominal tone weight kept only as a stable list key. Rendered as hex.
const TONES: { w: number; s: number; l: number }[] = [
  { w: 10, s: 30, l: 90 },
  { w: 30, s: 40, l: 72 },
  { w: 60, s: 46, l: 46 },
  { w: 80, s: 44, l: 30 },
  { w: 95, s: 38, l: 18 },
];

const DEFAULT_TONE = 2; // the mid shade starts selected (as in the sketch)

const clampIndex = (i: number): number => Math.max(0, Math.min(HUE_COUNT - 1, i));

/** Nearest reel hue index for an HSV hue (0–360). */
const nearestHue = (h: number): number =>
  Math.round(((((h % 360) + 360) % 360) / 15)) % HUE_COUNT;

/** Hex for a hue index + tone (pure). */
const shadeHex = (hueIdx: number, tone: (typeof TONES)[number]): string =>
  rgbToHex(hslToRgb({ h: HUES[hueIdx], s: tone.s / 100, l: tone.l / 100 }));

export function ShadeMode({ colour }: { colour: ColourSnapshot }) {
  const [hueIdx, setHueIdx] = useState(() => nearestHue(colour.hsv.h));
  const [toneIdx, setToneIdx] = useState(DEFAULT_TONE);

  const reelRef = useRef<HTMLDivElement | null>(null);
  const drag = useRef({ down: false, sx: 0, sl: 0 });
  const idxRef = useRef(nearestHue(colour.hsv.h)); // last-committed hue index (dedups scroll)
  const didCentre = useRef(false);

  // Centre the reel over the current colour's hue, once on mount.
  useEffect(() => {
    const el = reelRef.current;
    if (!el || didCentre.current) return;
    didCentre.current = true;
    el.scrollLeft = nearestHue(colour.hsv.h) * CELL_W;
  }, [colour.hsv.h]);

  const commit = (h: number, t: number) => {
    const tone = TONES[t];
    setRgb(hslToRgb({ h: HUES[h], s: tone.s / 100, l: tone.l / 100 }));
  };

  // Reel scroll → recompute the centred hue; commit its selected tone on change.
  const onScroll = () => {
    const el = reelRef.current;
    if (!el) return;
    const idx = clampIndex(Math.round(el.scrollLeft / CELL_W));
    if (idx === idxRef.current) return;
    idxRef.current = idx;
    setHueIdx(idx);
    commit(idx, toneIdx);
  };

  // Mouse/touch grab-drag: suspend CSS snap while dragging, restore + snap on release.
  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    const el = reelRef.current;
    if (!el) return;
    drag.current = { down: true, sx: e.clientX, sl: el.scrollLeft };
    el.style.scrollSnapType = "none";
    el.setPointerCapture(e.pointerId);
  };

  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    const el = reelRef.current;
    if (!d.down || !el) return;
    el.scrollLeft = d.sl - (e.clientX - d.sx);
  };

  const onPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    const el = reelRef.current;
    drag.current.down = false;
    if (!el) return;
    el.releasePointerCapture?.(e.pointerId);
    el.style.scrollSnapType = "";
    el.scrollTo({ left: clampIndex(Math.round(el.scrollLeft / CELL_W)) * CELL_W, behavior: "smooth" });
  };

  const shades = useMemo(
    () =>
      TONES.map((tone) => {
        const hex = shadeHex(hueIdx, tone);
        return { w: tone.w, hex, name: getColourName(hex) };
      }),
    [hueIdx],
  );

  return (
    <div className="flex h-full flex-col">
      {/* hue reel */}
      <div className="relative shrink-0 border-b border-border">
        <div
          ref={reelRef}
          onScroll={onScroll}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          role="group"
          aria-label="Hue reel"
          className={cn(
            "flex h-12 cursor-grab touch-none select-none overflow-x-auto overflow-y-hidden overscroll-x-contain snap-x snap-mandatory active:cursor-grabbing",
            "[scrollbar-width:none] [&::-webkit-scrollbar]:hidden",
          )}
        >
          <div className="shrink-0" style={{ width: "calc(50% - 17px)" }} aria-hidden />
          {HUES.map((h) => (
            <div
              key={h}
              className="h-full w-[34px] shrink-0 snap-center border-r border-border"
              style={{ backgroundColor: `hsl(${h}, 58%, 52%)` }}
              aria-hidden
            />
          ))}
          <div className="shrink-0" style={{ width: "calc(50% - 17px)" }} aria-hidden />
        </div>
        <div
          className="pointer-events-none absolute inset-y-0 left-1/2 z-10 w-[34px] -translate-x-1/2"
          style={{ boxShadow: "inset 0 0 0 2px #fff, 0 0 0 1px rgba(0,0,0,0.55)" }}
          aria-hidden
        />
      </div>

      {/* tonal shades for the centred hue — distribute across the remaining height */}
      <div className="flex flex-1 flex-col">
        {shades.map((shade, k) => {
          const selected = k === toneIdx;
          return (
            <button
              key={shade.w}
              type="button"
              onClick={() => {
                setToneIdx(k);
                commit(hueIdx, k);
              }}
              className={cn(
                "relative flex min-h-0 w-full flex-1 cursor-default items-center border-b border-border p-0 text-left",
                selected ? "bg-accent" : "hover:bg-accent",
              )}
            >
              {selected && (
                <span className="absolute inset-y-0 left-0 z-[1] w-0.5 bg-primary" aria-hidden />
              )}
              <span
                className="w-[54px] shrink-0 self-stretch border-r border-border"
                style={{ backgroundColor: shade.hex }}
                aria-hidden
              />
              <span className="min-w-0 flex-1 truncate px-2.5 text-[11.5px] text-foreground">
                {shade.name}
              </span>
              <span className="shrink-0 pr-2.5 text-[10px] tabular-nums text-muted-foreground">
                {shade.hex.toUpperCase()}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
