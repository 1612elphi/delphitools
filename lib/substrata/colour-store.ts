/**
 * Current-colour store (§8 Colour picker). One shared colour that every picker
 * mode (hue cube, HSV triangle, sliders, swatches, prism, shade) reads and
 * writes. TRANSIENT UI state — a colour isn't document truth until it's applied
 * to a fill (text/shapes, M2/M3); for now it's a self-contained current colour
 * with a swatch + hex readout, exposed via useSyncExternalStore.
 *
 * Stored internally as HSV + alpha so hue/saturation survive value→0 / sat→0
 * (see colour-hsv). The snapshot is recomputed once per change and cached, so
 * useSyncExternalStore sees a stable reference between edits.
 */

import { hexToRgb, rgbToHex, type RGB } from "./colour-convert";
import { hsvToRgb, rgbToHsv, type HSV } from "./colour-hsv";

const clamp01 = (v: number): number => Math.max(0, Math.min(1, v));

export interface ColourSnapshot {
  hsv: HSV;
  alpha: number;
  rgb: RGB;
  hex: string;
}

// Initial colour — the sketches' "Sea Green" (#3E6B33).
let hsv: HSV = rgbToHsv(hexToRgb("#3E6B33")!);
let alpha = 1;

const listeners = new Set<() => void>();

function compute(): ColourSnapshot {
  const rgb = hsvToRgb(hsv);
  return { hsv, alpha, rgb, hex: rgbToHex(rgb) };
}

let snapshot: ColourSnapshot = compute();

function commit(): void {
  snapshot = compute();
  for (const l of listeners) l();
}

export function getColour(): ColourSnapshot {
  return snapshot;
}

export function subscribeColour(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Patch the HSV channels (the SV square, hue slider, triangle, HSx sliders).
 *  Keeps the untouched channels — this is why the store is HSV-internal. */
export function setHsv(patch: Partial<HSV>): void {
  hsv = {
    h: patch.h ?? hsv.h,
    s: patch.s ?? hsv.s,
    v: patch.v ?? hsv.v,
  };
  commit();
}

export function setAlpha(a: number): void {
  alpha = clamp01(a);
  commit();
}

/** Set from explicit RGB (RGB sliders, prism, swatches). Re-derives HSV — hue
 *  is recomputed from the colour, which is correct for an explicit entry. */
export function setRgb(rgb: RGB): void {
  hsv = rgbToHsv(rgb);
  commit();
}

/** Set from a hex string; ignored if unparseable. Returns whether it parsed. */
export function setHex(hex: string): boolean {
  const rgb = hexToRgb(hex);
  if (!rgb) return false;
  hsv = rgbToHsv(rgb);
  commit();
  return true;
}
