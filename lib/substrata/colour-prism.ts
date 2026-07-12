/**
 * Prism wavelength → sRGB (M4-2) for the "Prism" colour-picker tab (§8). A
 * spectroscope toy: a visible wavelength (nm) mapped to an approximate sRGB
 * colour, shaped by two OP-1-flavoured knobs:
 *   - WATTS — light intensity (black → full)
 *   - NTU   — haze / turbidity (pure → milky white)
 *
 * Ported faithfully from sketches/pickers-fun.html (the visual source of truth):
 * Bruton-style piecewise spectrum, edge intensity roll-off, 0.8 display gamma.
 * Approximate by design — a perceptual toy, not a colorimetric CMF integral.
 *
 * Pure + framework-free. Picker UI display names (WATTS/NTU + band labels) are
 * \u2211CG copy and live in the component, not here.
 */

/** Usable wavelength span for the Prism reel (nm). */
export const PRISM_LO = 380;
export const PRISM_HI = 700;

export type SpectralBand =
  | "violet"
  | "blue"
  | "cyan"
  | "green"
  | "yellow"
  | "orange"
  | "red";

/** Coarse band a wavelength falls into (drives the \u2211CG band label in the UI). */
export function band(wl: number): SpectralBand {
  return wl < 450
    ? "violet"
    : wl < 485
      ? "blue"
      : wl < 500
        ? "cyan"
        : wl < 565
          ? "green"
          : wl < 590
            ? "yellow"
            : wl < 625
              ? "orange"
              : "red";
}

export interface RGB {
  r: number;
  g: number;
  b: number;
}

export interface PrismKnobs {
  /** WATTS — light intensity, 0 (black) … 1 (full). */
  watts: number;
  /** NTU — haze/turbidity, 0 (pure) … 1 (milky white). */
  ntu: number;
}

/** Raw wavelength → sRGB (0–255), before the WATTS/NTU knobs. */
export function wavelengthToRgb(wl: number): RGB {
  let r = 0;
  let g = 0;
  let b = 0;

  if (wl < 440) {
    r = -(wl - 440) / 60;
    b = 1;
  } else if (wl < 490) {
    g = (wl - 440) / 50;
    b = 1;
  } else if (wl < 510) {
    g = 1;
    b = -(wl - 510) / 20;
  } else if (wl < 580) {
    r = (wl - 510) / 70;
    g = 1;
  } else if (wl < 645) {
    r = 1;
    g = -(wl - 645) / 65;
  } else {
    r = 1;
  }

  // Intensity roll-off at the spectrum edges (eye sensitivity falls away).
  let f = 1;
  if (wl < 420) f = 0.3 + (0.7 * (wl - 380)) / 40;
  else if (wl > 700) f = 0.3 + (0.7 * (780 - wl)) / 80;

  const ch = (c: number): number =>
    Math.round(255 * Math.pow(Math.max(0, Math.min(1, c)) * f, 0.8));

  return { r: ch(r), g: ch(g), b: ch(b) };
}

/** Wavelength + knobs → final sRGB (0–255). */
export function prismColour(wl: number, { watts, ntu }: PrismKnobs): RGB {
  const base = wavelengthToRgb(wl);
  const shape = (v: number): number => {
    let c = v * watts; // WATTS: scale intensity
    c = c + (255 - c) * ntu; // NTU: lift toward white (haze)
    return Math.round(Math.max(0, Math.min(255, c)));
  };
  return { r: shape(base.r), g: shape(base.g), b: shape(base.b) };
}

export function prismHex(wl: number, knobs: PrismKnobs): string {
  const { r, g, b } = prismColour(wl, knobs);
  return (
    "#" +
    [r, g, b].map((c) => c.toString(16).padStart(2, "0")).join("").toUpperCase()
  );
}
