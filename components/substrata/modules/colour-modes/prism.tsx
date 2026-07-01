"use client";

import { useState } from "react";
import { getColourName } from "@/lib/colour-names";
import { type ColourSnapshot, setRgb } from "@/lib/substrata/colour-store";
import {
  band,
  PRISM_HI,
  PRISM_LO,
  prismColour,
  type SpectralBand,
} from "@/lib/substrata/colour-prism";
import { clamp01, Knob, usePointerArea } from "@/components/substrata/modules/colour-picker-kit";

/**
 * Prism mode (spectroscope) — mode BODY only. A draggable spectrum bar tunes a
 * wavelength in [PRISM_LO, PRISM_HI]; a needle marks it. Two knobs (WATTS light
 * intensity, NTU haze) shape the result. All wavelength→sRGB maths lives in
 * lib/substrata/colour-prism; this file is pure UI + pointer handling.
 *
 * Local state (wavelength / watts / ntu) is the source of truth here and is
 * pushed into the shared colour-store on every change via setRgb(prismColour…).
 * Ported from sketches/pickers-fun.html (the PRISM IIFE — visual source of truth).
 */

// Spectrum gradient + tick overlay, lifted from the sketch's .spectrum styles.
const SPECTRUM_GRADIENT =
  "linear-gradient(to right,#7a00ff,#0040ff,#00b3ff,#00ff66,#caff00,#ff9100,#ff0000)";
const TICK_OVERLAY =
  "repeating-linear-gradient(to right,rgba(0,0,0,.28) 0 1px,transparent 1px 11px)";

// band() returns a semantic key; the human-facing family word for each band is
// ∑CG copy (do NOT hardcode "Green" etc. — these are display labels).
const BAND_LABELS: Record<SpectralBand, string> = {
  // ∑CG: violet band family label — spec: single word, uppercase display, ≤ 10 chars. sample: "Violet"
  violet: "∑CG",
  // ∑CG: blue band family label — spec: single word, uppercase display, ≤ 10 chars. sample: "Blue"
  blue: "∑CG",
  // ∑CG: cyan band family label — spec: single word, uppercase display, ≤ 10 chars. sample: "Cyan"
  cyan: "∑CG",
  // ∑CG: green band family label — spec: single word, uppercase display, ≤ 10 chars. sample: "Green"
  green: "∑CG",
  // ∑CG: yellow band family label — spec: single word, uppercase display, ≤ 10 chars. sample: "Yellow"
  yellow: "∑CG",
  // ∑CG: orange band family label — spec: single word, uppercase display, ≤ 10 chars. sample: "Orange"
  orange: "∑CG",
  // ∑CG: red band family label — spec: single word, uppercase display, ≤ 10 chars. sample: "Red"
  red: "∑CG",
};

export function PrismMode({ colour }: { colour: ColourSnapshot }) {
  // Spectroscope params — local UI state, not shared document truth.
  const [wl, setWl] = useState(532); // wavelength, nm (sketch default)
  const [watts, setWatts] = useState(100); // light intensity, 0–100 (sketch default)
  const [ntu, setNtu] = useState(6); // haze / turbidity, 0–100 (sketch default)

  // Push the shaped wavelength colour into the shared store — ONLY on user
  // interaction, never on mount (opening the Prism tab must not overwrite the
  // current colour). Prism is a generator: it writes, it doesn't read the colour.
  const push = (nwl: number, nwatts: number, nntu: number) =>
    setRgb(prismColour(nwl, { watts: nwatts / 100, ntu: nntu / 100 }));

  const [specRef, specBind] = usePointerArea((x) => {
    const v = PRISM_LO + x * (PRISM_HI - PRISM_LO);
    setWl(v);
    push(v, watts, ntu);
  });
  const [wattsRef, wattsBind] = usePointerArea((x) => {
    const v = Math.round(clamp01(x) * 100);
    setWatts(v);
    push(wl, v, ntu);
  });
  const [ntuRef, ntuBind] = usePointerArea((x) => {
    const v = Math.round(clamp01(x) * 100);
    setNtu(v);
    push(wl, watts, v);
  });

  const needleX = clamp01((wl - PRISM_LO) / (PRISM_HI - PRISM_LO));
  const bandLabel = BAND_LABELS[band(wl)];

  return (
    <div className="flex h-full flex-col">
      {/* spectrum bar — drag to tune the wavelength (grows to fill the panel) */}
      <div
        ref={specRef}
        {...specBind}
        // ∑CG: aria-label for the draggable spectrum bar — spec: names the wavelength control. sample: "Wavelength"
        aria-label="∑CG"
        className="relative min-h-[52px] flex-1 cursor-ew-resize touch-none border-b border-border"
        style={{ background: SPECTRUM_GRADIENT }}
      >
        <span
          aria-hidden
          className="pointer-events-none absolute inset-0 opacity-50"
          style={{ background: TICK_OVERLAY }}
        />
        {/* needle */}
        <span
          aria-hidden
          className="pointer-events-none absolute -inset-y-[3px] z-10 w-0.5 -translate-x-1/2 bg-white shadow-[0_0_0_1px_rgba(0,0,0,0.6)]"
          style={{ left: `${needleX * 100}%` }}
        >
          <span className="absolute left-1/2 top-0 size-0 -translate-x-1/2 border-x-4 border-t-[5px] border-x-transparent border-t-foreground" />
        </span>
      </div>

      {/* readout — wavelength (data) + nearest colour name (data) + band label */}
      <div className="flex items-baseline gap-1.5 border-b border-border px-3 py-2">
        <span className="text-[22px] font-bold tabular-nums tracking-tight text-foreground">
          {Math.round(wl)}
        </span>
        {/* "nm" is the SI unit symbol of the value above (data, not copy). */}
        <span className="text-[11px] text-muted-foreground">nm</span>
        <span className="truncate text-[11px] text-muted-foreground">
          {getColourName(colour.hex)}
        </span>
        <span className="ml-auto text-[10px] uppercase tracking-wide text-muted-foreground">
          {bandLabel}
        </span>
      </div>

      {/* WATTS */}
      <ParamRow
        // ∑CG: WATTS param name — spec: scientific unit, light intensity black→full, ≤ 8 chars, uppercase. sample: "WATTS"
        label="∑CG"
        // ∑CG: aria-label for the WATTS slider — spec: names the intensity control. sample: "Light intensity"
        ariaLabel="∑CG"
        value={watts}
        trackRef={wattsRef}
        bind={wattsBind}
      />

      {/* NTU */}
      <ParamRow
        // ∑CG: NTU param name — spec: scientific unit, haze/turbidity pure→milky, ≤ 8 chars, uppercase. sample: "NTU"
        label="∑CG"
        // ∑CG: aria-label for the NTU slider — spec: names the haze control. sample: "Haze"
        ariaLabel="∑CG"
        value={ntu}
        trackRef={ntuRef}
        bind={ntuBind}
      />
    </div>
  );
}

function ParamRow({
  label,
  ariaLabel,
  value,
  trackRef,
  bind,
}: {
  label: string;
  ariaLabel: string;
  value: number;
  trackRef: (el: HTMLDivElement | null) => void;
  bind: ReturnType<typeof usePointerArea>[1];
}) {
  return (
    <div className="flex items-center gap-3 border-b border-border px-3 py-2.5">
      <span className="w-12 shrink-0 text-[11px] font-bold tracking-wide text-foreground">
        {label}
      </span>
      <div
        ref={trackRef}
        {...bind}
        aria-label={ariaLabel}
        className="relative h-4 flex-1 touch-none bg-muted"
      >
        <span
          aria-hidden
          className="pointer-events-none absolute inset-y-0 left-0 bg-foreground/20"
          style={{ width: `${value}%` }}
        />
        <Knob x={value / 100} y={0.5} />
      </div>
      <span className="w-8 shrink-0 text-right text-[11px] tabular-nums text-muted-foreground">
        {value}
      </span>
    </div>
  );
}
