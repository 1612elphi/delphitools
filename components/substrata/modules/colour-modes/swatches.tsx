"use client";

import { useEffect, useRef } from "react";
import { cn } from "@/lib/utils";
import { rgbToHex } from "@/lib/substrata/colour-convert";
import { hslToRgb } from "@/lib/substrata/colour-hsv";
import { setRgb, type ColourSnapshot } from "@/lib/substrata/colour-store";

/**
 * Mode: swatches wall (fun modes). A horizontally drag-scrollable wall of 24px
 * colour cells — a neutrals (grey) column followed by 36 hue columns at 10°
 * steps, each an 11-row tone ramp (per-row lightness + saturation). Pointer-drag
 * scrolls the wall; a click that was NOT a drag picks that cell (its HSL → RGB
 * via hslToRgb → setRgb). The cell whose hex matches the current colour is ringed.
 *
 * Ported from sketches/pickers-fun.html (the SWATCHES IIFE). Maths lives in
 * colour-hsv / colour-convert; this file is pure UI + pointer handling.
 */

const CELL = 24; // px per cell (sketch .swcell)
const ROWS = 11; // tone rows per column
const HUE_COLS = 36; // hue columns at 10° steps → covers the full wheel
const DRAG_SLOP = 4; // px of movement before a press counts as a drag, not a click

// Per-row tone ramp (percent), from the sketch's Ls (lightness) / Ss (saturation).
const LS = [96, 89, 80, 70, 60, 50, 42, 34, 26, 18, 11];
const SS = [30, 42, 52, 58, 60, 60, 58, 55, 50, 45, 38];

interface Cell {
  h: number; // 0–360
  s: number; // 0–1
  l: number; // 0–1
  hex: string;
}

// Built once at module load (pure maths, no DOM): neutrals column then hue columns.
const CELLS: Cell[] = (() => {
  const out: Cell[] = [];
  const push = (h: number, s: number, l: number) => {
    out.push({ h, s, l, hex: rgbToHex(hslToRgb({ h, s, l })) });
  };
  for (let r = 0; r < ROWS; r++) push(0, 0, LS[r] / 100); // neutrals (grey) column
  for (let c = 0; c < HUE_COLS; c++) {
    const h = c * 10;
    for (let r = 0; r < ROWS; r++) push(h, SS[r] / 100, LS[r] / 100);
  }
  return out;
})();

export function SwatchesMode({ colour }: { colour: ColourSnapshot }) {
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const drag = useRef({ down: false, moved: false, sx: 0, sy: 0, sl: 0, st: 0 });
  const didCentre = useRef(false);

  // Centre the wall over the current colour's hue column, once on mount.
  useEffect(() => {
    const el = wrapRef.current;
    if (!el || didCentre.current) return;
    didCentre.current = true;
    const col = Math.round(colour.hsv.h / 10) % HUE_COLS;
    el.scrollLeft = (1 + col) * CELL - el.clientWidth / 2; // +1 skips neutrals column
  }, [colour.hsv.h]);

  const pick = (clientX: number, clientY: number) => {
    const hit = document.elementFromPoint(clientX, clientY);
    const cellEl = hit instanceof HTMLElement ? hit.closest<HTMLElement>("[data-sw]") : null;
    if (!cellEl) return;
    const cell = CELLS[Number(cellEl.dataset.sw)];
    if (cell) setRgb(hslToRgb({ h: cell.h, s: cell.s, l: cell.l }));
  };

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    const el = wrapRef.current;
    if (!el) return;
    drag.current = {
      down: true,
      moved: false,
      sx: e.clientX,
      sy: e.clientY,
      sl: el.scrollLeft,
      st: el.scrollTop,
    };
    el.setPointerCapture(e.pointerId);
  };

  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    const el = wrapRef.current;
    if (!d.down || !el) return;
    if (Math.abs(e.clientX - d.sx) + Math.abs(e.clientY - d.sy) > DRAG_SLOP) d.moved = true;
    el.scrollLeft = d.sl - (e.clientX - d.sx);
    el.scrollTop = d.st - (e.clientY - d.sy);
  };

  const onPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    d.down = false;
    wrapRef.current?.releasePointerCapture?.(e.pointerId);
    if (!d.moved) pick(e.clientX, e.clientY);
  };

  return (
    <div
      ref={wrapRef}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      role="group"
      // ∑CG: aria-label for the drag-scroll colour swatch wall — spec: ≤ 40 chars,
      //   describes a scrollable grid of pickable colours. sample: "Colour swatch wall"
      aria-label="∑CG"
      className={cn(
        // Fills the panel; the 11-row wall is taller than the slot, so it scrolls
        // in both axes (drag to roam) rather than resizing the panel.
        "h-full cursor-grab touch-none select-none overflow-auto border-b border-border active:cursor-grabbing",
        "[scrollbar-width:none] [&::-webkit-scrollbar]:hidden",
      )}
    >
      <div className="grid w-max auto-cols-[24px] grid-flow-col grid-rows-[repeat(11,24px)]">
        {CELLS.map((cell, i) => {
          const selected = cell.hex === colour.hex;
          return (
            <div
              key={i}
              data-sw={i}
              className={cn("h-6 w-6", selected && "relative z-[1]")}
              style={
                selected
                  ? {
                      background: cell.hex,
                      boxShadow: "inset 0 0 0 2px #fff, inset 0 0 0 4px var(--primary)",
                    }
                  : { background: cell.hex }
              }
            />
          );
        })}
      </div>
    </div>
  );
}
