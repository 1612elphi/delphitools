/**
 * Effect registry — the single, extensible source of truth for effects (the
 * family drop shadow belongs to: things that work on any layer kind and can draw
 * OUTSIDE the layer bounds, as opposed to filters, which stay inside the visible
 * pixels). Adding a new effect = add one entry here; the document model only
 * stores instances (Effect) that reference a `type`. This is the "other library"
 * that declares whether each effect renders inner or outer, so the doc model
 * needs neither two hard-coded arrays nor a per-instance phase flag.
 *
 * v1 stub: the structure + the inner/outer classification are frozen. Render
 * functions, typed param schemas/defaults, and the ∑CG display labels are added
 * with the Effects panel (M3) — additively, no change to the entries' shape.
 */

import type { EffectPhase } from "./doc-model";

export interface EffectDefinition {
  type: string;
  phase: EffectPhase;
  /** accepted param keys; a typed schema + defaults arrive in M3 */
  params: string[];
  // label?: string  // ∑CG — user-facing name, added with the M3 Effects panel
}

export const EFFECT_REGISTRY: Record<string, EffectDefinition> = {
  "drop-shadow": {
    type: "drop-shadow",
    phase: "outer",
    params: ["colour", "blur", "offsetX", "offsetY", "spread"],
  },
  "outer-glow": {
    type: "outer-glow",
    phase: "outer",
    params: ["colour", "blur", "intensity"],
  },
  // Stroke is nominally "outer", but `position` (outer|inner|centre, M3) lets a
  // single registered type cover all three — which a hard inner/outer array split
  // could not express.
  stroke: {
    type: "stroke",
    phase: "outer",
    params: ["colour", "width", "position"],
  },
  "inner-shadow": {
    type: "inner-shadow",
    phase: "inner",
    params: ["colour", "blur", "offsetX", "offsetY"],
  },
  "inner-glow": {
    type: "inner-glow",
    phase: "inner",
    params: ["colour", "blur", "intensity"],
  },
  "colour-overlay": {
    type: "colour-overlay",
    phase: "inner",
    params: ["colour", "opacity"],
  },
};

export const getEffectDef = (type: string): EffectDefinition | undefined => EFFECT_REGISTRY[type];

export const effectPhase = (type: string): EffectPhase | undefined => EFFECT_REGISTRY[type]?.phase;

/** Partition a layer's effects into render phases (outer behind, inner in front). */
export function byPhase<T extends { type: string }>(effects: T[]): { outer: T[]; inner: T[] } {
  const outer: T[] = [];
  const inner: T[] = [];
  for (const e of effects) {
    (effectPhase(e.type) === "inner" ? inner : outer).push(e);
  }
  return { outer, inner };
}
