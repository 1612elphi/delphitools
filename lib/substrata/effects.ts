/**
 * Effect registry — the single, extensible source of truth for effects (the
 * family drop shadow belongs to: things that work on any layer kind and can draw
 * OUTSIDE the layer bounds, as opposed to filters, which stay inside the visible
 * pixels — see filters.ts for that registry). Adding a new effect = add one
 * entry here; the document model only stores instances (Effect) that reference
 * a `type`. This is the "other library" that declares whether each effect
 * renders inner or outer, so the doc model needs neither two hard-coded arrays
 * nor a per-instance phase flag.
 *
 * The inner/outer classification is frozen (schema v1) and descriptive: the
 * renderer (effect-render.ts) routes per type, with stroke split across both
 * passes by its `position` param. `params` carries the typed spec/defaults the
 * FX panel renders AND the renderer's defaults (syncImageEffects merges them
 * into every instance — declared once here, never re-typed in the painters).
 * Labels are standard layer-style terms — functional chrome per Ruby's call
 * (the BLEND_OPTIONS precedent), not authored copy.
 */

import type { EffectPhase } from "./doc-model";
import type { FxDefinition, ParamSpec } from "./param-spec";

export interface EffectDefinition extends FxDefinition {
  phase: EffectPhase;
}

const colour = (key: string, label: string, def: string): ParamSpec => ({
  kind: "colour",
  key,
  label,
  default: def,
});

const offset = (key: string, label: string, def: number): ParamSpec => ({
  kind: "stepper",
  key,
  label,
  min: -500,
  max: 500,
  step: 1,
  default: def,
  unit: "px",
});

export const EFFECT_REGISTRY: Record<string, EffectDefinition> = {
  "drop-shadow": {
    type: "drop-shadow",
    phase: "outer",
    label: "Drop shadow",
    params: [
      colour("colour", "Colour", "#000000"),
      { kind: "slider", key: "opacity", label: "Opacity", min: 0, max: 100, step: 1, default: 35, unit: "%" },
      { kind: "slider", key: "blur", label: "Blur", min: 0, max: 250, step: 1, default: 24, unit: "px" },
      offset("offsetX", "Offset X", 8),
      offset("offsetY", "Offset Y", 8),
      { kind: "slider", key: "spread", label: "Spread", min: 0, max: 100, step: 1, default: 0, unit: "px" },
    ],
  },
  "outer-glow": {
    type: "outer-glow",
    phase: "outer",
    label: "Outer glow",
    params: [
      colour("colour", "Colour", "#ffffff"),
      { kind: "slider", key: "blur", label: "Blur", min: 0, max: 250, step: 1, default: 40, unit: "px" },
      { kind: "slider", key: "intensity", label: "Intensity", min: 0, max: 100, step: 1, default: 50, unit: "%" },
    ],
  },
  // Stroke is nominally "outer", but `position` (outer|inner|centre, M3) lets a
  // single registered type cover all three — which a hard inner/outer array split
  // could not express.
  stroke: {
    type: "stroke",
    phase: "outer",
    label: "Stroke",
    params: [
      colour("colour", "Colour", "#000000"),
      { kind: "stepper", key: "width", label: "Width", min: 1, max: 100, step: 1, default: 2, unit: "px" },
      {
        kind: "select",
        key: "position",
        label: "Position",
        default: "outer",
        options: [
          { value: "outer", label: "Outer" },
          { value: "centre", label: "Centre" },
          { value: "inner", label: "Inner" },
        ],
      },
    ],
  },
  "inner-shadow": {
    type: "inner-shadow",
    phase: "inner",
    label: "Inner shadow",
    params: [
      colour("colour", "Colour", "#000000"),
      { kind: "slider", key: "opacity", label: "Opacity", min: 0, max: 100, step: 1, default: 35, unit: "%" },
      { kind: "slider", key: "blur", label: "Blur", min: 0, max: 250, step: 1, default: 18, unit: "px" },
      offset("offsetX", "Offset X", 6),
      offset("offsetY", "Offset Y", 6),
    ],
  },
  "inner-glow": {
    type: "inner-glow",
    phase: "inner",
    label: "Inner glow",
    params: [
      colour("colour", "Colour", "#ffffff"),
      { kind: "slider", key: "blur", label: "Blur", min: 0, max: 250, step: 1, default: 24, unit: "px" },
      { kind: "slider", key: "intensity", label: "Intensity", min: 0, max: 100, step: 1, default: 50, unit: "%" },
    ],
  },
  "colour-overlay": {
    type: "colour-overlay",
    phase: "inner",
    label: "Colour overlay",
    params: [
      colour("colour", "Colour", "#000000"),
      { kind: "slider", key: "opacity", label: "Opacity", min: 0, max: 100, step: 1, default: 100, unit: "%" },
    ],
  },
};

export const getEffectDef = (type: string): EffectDefinition | undefined => EFFECT_REGISTRY[type];
