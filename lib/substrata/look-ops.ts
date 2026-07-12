/**
 * Look ops — the looks module's thin doc interface (Ruby, 2026-07-03: the
 * LUT/CST family moves OUT of the FX panel into its own bespoke surface). A
 * look is STILL the one film-sim entry in `layer.filters[]` under the hood
 * (zero schema change; render/undo/autosave already work) — these ops are the
 * only writers, and fx-ops pins the entry to the stack's END so the look
 * grades after the adjustments (CST-last convention).
 */

import type { Filter, Layer } from "./doc-model";
import { addFx, removeFx, setFxParam } from "./fx-ops";

const LOOK_TYPE = "film-sim";

/** The layer's look entry (the pinned film-sim filter), if it wears one. */
export function getLook(layer: Layer): Filter | null {
  return layer.filters.find((f) => f.type === LOOK_TYPE) ?? null;
}

/**
 * Apply a look. One-per-layer: a second pick retargets the existing entry's
 * preset (addFx returns the existing instance's id — same contract the FX
 * picker used).
 */
export function setLook(layerId: string, layer: Layer, presetId: string): void {
  const existing = getLook(layer);
  if (existing) {
    if (existing.params.preset !== presetId) {
      setFxParam(layerId, "filters", existing.id, "preset", presetId);
    }
    return;
  }
  addFx(layerId, "filters", LOOK_TYPE, { preset: presetId });
}

export function clearLook(layerId: string, layer: Layer): void {
  const look = getLook(layer);
  if (look) removeFx(layerId, "filters", look.id);
}

/** 0–100; transient while the slider drags (one undo step per gesture). */
export function setLookIntensity(layerId: string, layer: Layer, pct: number, opts?: { transient?: boolean }): void {
  const look = getLook(layer);
  if (look) setFxParam(layerId, "filters", look.id, "intensity", pct, opts);
}
