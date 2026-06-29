/**
 * Layer-style registry — the single, extensible source of truth for layer
 * styles (the family drop shadow belongs to). Adding a new style = add one entry
 * here; the document model only stores instances (LayerStyle) that reference a
 * `type`. This is the "other library" that declares whether each style renders
 * inner or outer, so the doc model needs neither two hard-coded arrays nor a
 * per-instance phase flag.
 *
 * DRAFT: this stub fixes the structure + the inner/outer classification only.
 * The render functions, typed param schemas/defaults, and the ∑CG display labels
 * land with the Effects panel (M3).
 */

import type { StylePhase } from "./doc-model";

export interface StyleDefinition {
  type: string;
  phase: StylePhase;
  /** accepted param keys; a typed schema + defaults arrive in M3 */
  params: string[];
  // label?: string  // ∑CG — user-facing name, added with the M3 Effects panel
}

export const STYLE_REGISTRY: Record<string, StyleDefinition> = {
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

export const getStyleDef = (type: string): StyleDefinition | undefined => STYLE_REGISTRY[type];

export const stylePhase = (type: string): StylePhase | undefined => STYLE_REGISTRY[type]?.phase;

/** Partition a layer's styles into render phases (outer behind, inner in front). */
export function byPhase<T extends { type: string }>(styles: T[]): { outer: T[]; inner: T[] } {
  const outer: T[] = [];
  const inner: T[] = [];
  for (const s of styles) {
    (stylePhase(s.type) === "inner" ? inner : outer).push(s);
  }
  return { outer, inner };
}
