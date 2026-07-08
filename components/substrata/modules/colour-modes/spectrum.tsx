"use client";

import { useEffect, useRef, useState } from "react";
import { rgbToHex } from "@/lib/substrata/colour-convert";
import { setRgb, type ColourSnapshot } from "@/lib/substrata/colour-store";
import { bandCentre, spectrumToRgb } from "@/lib/substrata/colour-spectrum";
import { wavelengthToRgb } from "@/lib/substrata/colour-prism";
import { clamp01, usePointerArea } from "@/components/substrata/modules/colour-picker-kit";

/**
 * Spectrum mode (spectral EQ) — mode BODY only. A "graphic EQ for light": the user
 * sculpts a spectral power distribution as N intensity bands across 380–700 nm and
 * the engine integrates it into the physically-real colour it emits. Because it
 * mixes the whole spectrum (not one wavelength) it reaches colours no monochromatic
 * light can — magenta, pink, white, pastels.
 *
 * The EQ is ONE pointer surface: x → band index, (1 - y) → intensity, so a drag
 * sweeps across to paint several bars in a stroke and a click sets one bar. Each
 * bar is tinted by its own band-centre wavelength (colour-prism.wavelengthToRgb).
 *
 * All SPD→sRGB maths lives in lib/substrata/colour-spectrum; this file is pure UI +
 * pointer handling. Local `bands` is the source of truth and is pushed into the
 * shared colour-store on interaction only (never on mount, matching prism.tsx).
 */

/** Number of sculptable bands (even spacing across [SPECTRUM_LO, SPECTRUM_HI]). */
const N = 16;

/** Per-bar fill tint = the sRGB of that band's centre wavelength. Constant (N is
 *  fixed), so computed once at module load. */
const BAND_TINTS = Array.from({ length: N }, (_, i) =>
  rgbToHex(wavelengthToRgb(bandCentre(i, N))),
);

/** Initial SPD — a soft Gaussian bump (a gentle hill of light, floor 0.1 …
 *  peak 0.9, centred on band 6 ≈ 510 nm) that resolves to a pleasant mint. Shown
 *  until the first interaction; NOT pushed on mount. */
const INITIAL_BANDS = Array.from({ length: N }, (_, i) => {
  const t = (i - 6) / 3;
  return 0.1 + 0.8 * Math.exp(-0.5 * t * t);
});

export function SpectrumMode({ colour }: { colour: ColourSnapshot }) {
  // `colour` is part of the shared mode contract but SPECTRUM is a pure generator:
  // it writes the sculpted colour and never reads the incoming one (the footer
  // supplies the swatch/hex/name readout), so the prop is intentionally unused.
  void colour;

  const [bands, setBands] = useState<number[]>(INITIAL_BANDS);
  const touched = useRef(false);

  // Sweep-paint the EQ: x picks the band, (1 - y) sets its intensity. Functional
  // update so a fast drag across bars always builds on the latest snapshot and
  // never drops a bar; the === guard skips no-op repaints of the same value.
  const [eqRef, eqBind] = usePointerArea((x, y) => {
    const i = Math.min(N - 1, Math.floor(x * N));
    const v = clamp01(1 - y);
    touched.current = true;
    setBands((prev) => (prev[i] === v ? prev : prev.map((b, j) => (j === i ? v : b))));
  });

  // Push the sculpted SPD → colour on interaction only. Opening the tab must not
  // overwrite the current colour, so the mount run is skipped via `touched`.
  useEffect(() => {
    if (!touched.current) return;
    setRgb(spectrumToRgb(bands));
  }, [bands]);

  return (
    <div className="flex h-full flex-col">
      {/* the EQ — one pointer surface of N tinted bars; gap-px over bg-border
          draws the hairline gridlines between bars (grows to fill the panel) */}
      <div
        ref={eqRef}
        {...eqBind}
        aria-label="Spectral power distribution"
        className="flex min-h-0 flex-1 touch-none cursor-crosshair gap-px border-b border-border bg-border"
      >
        {bands.map((v, i) => (
          <div key={i} className="relative h-full flex-1 bg-muted">
            <span
              aria-hidden
              className="pointer-events-none absolute inset-x-0 bottom-0"
              style={{ height: `${v * 100}%`, backgroundColor: BAND_TINTS[i] }}
            />
          </div>
        ))}
      </div>
    </div>
  );
}
