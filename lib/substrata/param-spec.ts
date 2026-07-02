/**
 * Shared parameter-spec system for the two FX registries (effects.ts +
 * filters.ts). A ParamSpec describes ONE parameter of an effect/filter
 * instance: how the FX panel renders it (`kind`), its bounds/step/unit, and its
 * default. The registries are the single source of truth the panel reads —
 * adding a param to a registry entry is all it takes for the UI to grow the
 * row. Structural for now: specs drive storing/editing/undo of params; the
 * render maths that makes them move pixels is the M3 engine (attached
 * additively, no spec-shape change).
 *
 * Labels here are conventional graphics vocabulary treated as functional
 * chrome, NOT authored copy (Ruby's call — the BLEND_OPTIONS precedent).
 * British spelling.
 */

interface BaseParam {
  key: string;
  label: string;
}

interface NumericParam extends BaseParam {
  min: number;
  max: number;
  step: number;
  default: number;
  /** display unit ("px" | "%" | "°"); values are stored unit-less */
  unit?: string;
}

/** Continuous drag → transient doc updates; one undo step per gesture. */
export interface SliderParam extends NumericParam {
  kind: "slider";
}

/** Discrete ±step clicks; one undo step per click. */
export interface StepperParam extends NumericParam {
  kind: "stepper";
}

/** A #rrggbb colour (swatch + hex field in the panel). */
export interface ColourParam extends BaseParam {
  kind: "colour";
  default: string;
}

/** One-of-N choice rendered as a segmented cell group. */
export interface SelectParam extends BaseParam {
  kind: "select";
  default: string;
  options: { value: string; label: string }[];
}

/**
 * One-of-N look rendered as the flush swatch grid from the sketch
 * (modals.html `.presets`) — used by the film-sim/LUT family (and duotone
 * pairs in M3-9). `swatch` is a representative gradient (placeholder visual
 * data until the real looks exist in M3); labels are named looks = authored
 * copy → ∑CG gaps in the registry.
 */
export interface PresetsParam extends BaseParam {
  kind: "presets";
  default: string;
  options: { value: string; label: string; swatch: string[] }[];
}

export type ParamSpec = SliderParam | StepperParam | ColourParam | SelectParam | PresetsParam;

/**
 * The registry-entry shape both registries share, so the FX panel can render an
 * effect and a filter instance through one code path.
 */
export interface FxDefinition {
  type: string;
  label: string;
  params: ParamSpec[];
}

/** Seed a new instance's params from a spec list (the registry defaults). */
export function defaultParams(specs: ParamSpec[]): Record<string, number | string> {
  const out: Record<string, number | string> = {};
  for (const s of specs) out[s.key] = s.default;
  return out;
}
