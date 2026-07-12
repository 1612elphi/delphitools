/**
 * FX mutations — the action layer over the doc store for BOTH per-layer stacks:
 * `filters[]` (the inside-only chain, incl. the colour changes) and `effects[]`
 * (the outside-capable family). The instance shapes are identical
 * ({id, type, enabled, params}), so one code path is generic over the stack;
 * every op goes through `update()`, so all of it is undoable for free.
 * Flat layers for now — group recursion lands with M2, like layer-ops.
 *
 * ONE PER TYPE (Ruby's call, all three categories): a stack never holds two
 * instances of the same type — addFx returns the existing instance's id instead
 * of inserting, and the picker disables entries already on the layer. Relaxing
 * this later is additive.
 */

import { getSnapshot, update, updateTransient } from "./doc-store";
import { newId } from "./doc-model";
import { getEffectDef } from "./effects";
import { getFilterDef } from "./filters";
import { findLayer, mapLayerInTree } from "./layer-tree";
import { defaultParams } from "./param-spec";
import type { Layer, SubstrataDoc } from "./doc-model";
import type { FxDefinition, PresetsParam } from "./param-spec";

/** Which per-layer stack an op targets. */
export type FxStack = "filters" | "effects";

/** The shared instance shape of Filter and Effect (structurally identical). */
export interface FxItem {
  id: string;
  type: string;
  enabled: boolean;
  params: Record<string, number | string>;
}

/** Registry lookup for either stack. */
export function getFxDef(stack: FxStack, type: string): FxDefinition | undefined {
  return stack === "effects" ? getEffectDef(type) : getFilterDef(type);
}

/** Display label for an instance — preset-carrying types (film-sim) title
 *  themselves after their chosen look. Used by the FX panel's block headers
 *  and the omnibar's contextual FX read-out chips. */
export function fxDisplayLabel(stack: FxStack, fx: FxItem): string {
  const def = getFxDef(stack, fx.type);
  const presetSpec = def?.params.find((p): p is PresetsParam => p.kind === "presets");
  const preset = presetSpec
    ? presetSpec.options.find((o) => o.value === fx.params[presetSpec.key])
    : undefined;
  return preset?.label ?? def?.label ?? fx.type;
}

function stackOf(layer: Layer, stack: FxStack): FxItem[] {
  return stack === "effects" ? layer.effects : layer.filters;
}

/** Rebuild one layer's stack immutably (tree-aware — nested layers included). */
function mapStack(
  layers: Layer[],
  layerId: string,
  stack: FxStack,
  fn: (list: FxItem[]) => FxItem[],
): Layer[] {
  return mapLayerInTree(layers, layerId, (l) =>
    stack === "effects" ? { ...l, effects: fn(l.effects) } : { ...l, filters: fn(l.filters) },
  );
}

function mapItem(list: FxItem[], fxId: string, fn: (fx: FxItem) => FxItem): FxItem[] {
  return list.map((fx) => (fx.id === fxId ? fn(fx) : fx));
}

/**
 * Add an instance of `type` at the TOP of the stack (index 0 — first in the
 * chain / pipeline order) with the registry defaults (merged with `params`
 * overrides — e.g. a picked film-sim preset — so the add is ONE undo step),
 * enabled. One-per-type: if the stack already holds this type, returns THAT
 * instance's id so the panel can open/retarget it instead. Returns null for
 * unknown types / no such layer.
 */
export function addFx(
  layerId: string,
  stack: FxStack,
  type: string,
  params?: Record<string, number | string>,
): string | null {
  const doc = getSnapshot();
  const layer = doc ? findLayer(doc.layers, layerId) : null;
  if (!layer) return null;
  const existing = stackOf(layer, stack).find((fx) => fx.type === type);
  if (existing) return existing.id;
  const def = getFxDef(stack, type);
  if (!def) return null;
  const fx: FxItem = {
    id: newId(),
    type,
    enabled: true,
    params: { ...defaultParams(def.params), ...params },
  };
  update((d) => ({
    ...d,
    // film-sim pins to the END: the look grades AFTER the adjustments (the
    // CST-last convention) — it lives in the looks module, not the FX panel,
    // so stack position must be right by construction, not by dragging.
    layers: mapStack(d.layers, layerId, stack, (list) =>
      type === "film-sim" ? [...list, fx] : [fx, ...list],
    ),
    updatedAt: Date.now(),
  }));
  return fx.id;
}

export function removeFx(layerId: string, stack: FxStack, fxId: string): void {
  update((doc) => ({
    ...doc,
    layers: mapStack(doc.layers, layerId, stack, (list) => list.filter((fx) => fx.id !== fxId)),
    updatedAt: Date.now(),
  }));
}

export function toggleFx(layerId: string, stack: FxStack, fxId: string): void {
  update((doc) => ({
    ...doc,
    layers: mapStack(doc.layers, layerId, stack, (list) =>
      mapItem(list, fxId, (fx) => ({ ...fx, enabled: !fx.enabled })),
    ),
    updatedAt: Date.now(),
  }));
}

/** Snap an instance's params back to the registry defaults (one undo step). */
export function resetFx(layerId: string, stack: FxStack, fxId: string): void {
  const doc = getSnapshot();
  const layer = doc ? findLayer(doc.layers, layerId) : null;
  const fx = layer && stackOf(layer, stack).find((f) => f.id === fxId);
  const def = fx && getFxDef(stack, fx.type);
  if (!def) return;
  update((d) => ({
    ...d,
    layers: mapStack(d.layers, layerId, stack, (list) =>
      mapItem(list, fxId, (f) => ({ ...f, params: defaultParams(def.params) })),
    ),
    updatedAt: Date.now(),
  }));
}

/**
 * Set one param. `transient: true` routes through the coalesced gesture path
 * (live update, no per-frame history) — used while a slider/colour drag is in
 * flight; the gesture's release commits the single history step (doc-store
 * beginTransient/commitTransient, driven by the panel).
 */
export function setFxParam(
  layerId: string,
  stack: FxStack,
  fxId: string,
  key: string,
  value: number | string,
  opts?: { transient?: boolean },
): void {
  const apply = (doc: SubstrataDoc): SubstrataDoc => ({
    ...doc,
    layers: mapStack(doc.layers, layerId, stack, (list) =>
      mapItem(list, fxId, (fx) => ({ ...fx, params: { ...fx.params, [key]: value } })),
    ),
    updatedAt: Date.now(),
  });
  if (opts?.transient) updateTransient(apply);
  else update(apply);
}

/**
 * Set several params at once as ONE undo step — the duotone preset pairs
 * write both colours together (a pair click must not leave a half-applied
 * look on the undo stack).
 */
export function setFxParams(
  layerId: string,
  stack: FxStack,
  fxId: string,
  patch: Record<string, number | string>,
): void {
  update((doc) => ({
    ...doc,
    layers: mapStack(doc.layers, layerId, stack, (list) =>
      mapItem(list, fxId, (fx) => ({ ...fx, params: { ...fx.params, ...patch } })),
    ),
    updatedAt: Date.now(),
  }));
}

/**
 * Reorder a stack to match `orderedIds` (index 0 = top of the pipeline).
 * `orderedIds` may be a SUBSET (the FX panel reorders the visible list, which
 * excludes the looks-module-owned film-sim): unlisted items keep their
 * relative order and sink below the listed ones — exactly the pin-to-end
 * behaviour the film-sim needs.
 */
export function setFxOrder(layerId: string, stack: FxStack, orderedIds: string[]): void {
  update((doc) => {
    let changed = false;
    const layers = mapStack(doc.layers, layerId, stack, (list) => {
      const byId = new Map(list.map((fx) => [fx.id, fx]));
      const next = orderedIds.map((id) => byId.get(id)).filter((fx): fx is FxItem => fx !== undefined);
      const listed = new Set(orderedIds);
      const rest = list.filter((fx) => !listed.has(fx.id));
      // Guard: ids must resolve cleanly (no unknowns dropped, no duplicates).
      if (next.length + rest.length !== list.length) return list;
      changed = true;
      return [...next, ...rest];
    });
    return changed ? { ...doc, layers, updatedAt: Date.now() } : doc;
  });
}
