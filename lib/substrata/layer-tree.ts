/**
 * Pure tree utilities over the nested Layer[] (M2 grouping — groups hold
 * children). M1 code was flat; every id-addressed op now walks recursively.
 * All functions are immutable: they rebuild only the path they change and
 * share every untouched node (history snapshots stay cheap).
 *
 * v1 GROUP SEMANTICS (ratified with the multi-select pass):
 *   - A group is an ORGANISATIONAL folder. Its own transform stays identity
 *     and is never composed; children keep SCENE-ABSOLUTE transforms. Moving/
 *     rotating a group as a unit happens through the canvas multi-selection,
 *     which writes each child's absolute transform. Real group-transform
 *     composition is deferred (M3+ render work).
 *   - Group visibility/lock/OPACITY apply to descendants EFFECTIVELY (composed
 *     at render/hit time via `leafRenderList`), without rewriting children.
 *     Opacity multiplies down the tree — an approximation of isolated group
 *     compositing (overlapping children show through each other), fine for v1.
 *   - Group blend/filters/effects are NOT applied in v1 (they need a real
 *     group render target) — the panel doesn't offer them on group rows.
 */

import type { GroupLayer, Layer } from "./doc-model";

export function isGroup(l: Layer): l is GroupLayer {
  return l.kind === "group";
}

/** Depth-first find anywhere in the tree. */
export function findLayer(layers: readonly Layer[], id: string): Layer | null {
  for (const l of layers) {
    if (l.id === id) return l;
    if (isGroup(l)) {
      const hit = findLayer(l.children, id);
      if (hit) return hit;
    }
  }
  return null;
}

/** Every id in the tree, depth-first (doc order). */
export function collectIds(layers: readonly Layer[], into: string[] = []): string[] {
  for (const l of layers) {
    into.push(l.id);
    if (isGroup(l)) collectIds(l.children, into);
  }
  return into;
}

/** The LEAF layers under a node (the node itself if it isn't a group). */
export function leafLayers(layer: Layer, into: Layer[] = []): Layer[] {
  if (isGroup(layer)) {
    for (const c of layer.children) leafLayers(c, into);
  } else {
    into.push(layer);
  }
  return into;
}

/** Map ONE layer (anywhere in the tree) through fn; rebuilds only its path. */
export function mapLayerInTree(layers: Layer[], id: string, fn: (l: Layer) => Layer): Layer[] {
  let changed = false;
  const next = layers.map((l) => {
    if (l.id === id) {
      changed = true;
      return fn(l);
    }
    if (isGroup(l)) {
      const children = mapLayerInTree(l.children, id, fn);
      if (children !== l.children) {
        changed = true;
        return { ...l, children };
      }
    }
    return l;
  });
  return changed ? next : layers;
}

/** Remove a set of ids anywhere in the tree (whole subtrees when a group id is
 *  listed). Returns the removed nodes in doc order. */
export function removeLayers(
  layers: Layer[],
  ids: ReadonlySet<string>,
): { layers: Layer[]; removed: Layer[] } {
  const removed: Layer[] = [];
  const walk = (list: Layer[]): Layer[] => {
    let changed = false;
    const out: Layer[] = [];
    for (const l of list) {
      if (ids.has(l.id)) {
        removed.push(l);
        changed = true;
        continue;
      }
      if (isGroup(l)) {
        const children = walk(l.children);
        if (children !== l.children) {
          changed = true;
          out.push({ ...l, children });
          continue;
        }
      }
      out.push(l);
    }
    return changed ? out : list;
  };
  const nextLayers = walk(layers);
  return { layers: nextLayers, removed };
}

/** The id of the group containing `id`: null when it sits at the root,
 *  undefined when it isn't in the tree (mirrors siblingListOf — the pair
 *  feeds setSiblingOrder). */
export function parentIdOf(layers: readonly Layer[], id: string): string | null | undefined {
  if (layers.some((l) => l.id === id)) return null;
  for (const l of layers) {
    if (isGroup(l)) {
      const hit = parentIdOf(l.children, id);
      if (hit !== undefined) return hit ?? l.id;
    }
  }
  return undefined;
}

/** The sibling list an id lives in: the root list or its group's children.
 *  Returns null when the id isn't in the tree. */
export function siblingListOf(layers: readonly Layer[], id: string): readonly Layer[] | null {
  if (layers.some((l) => l.id === id)) return layers;
  for (const l of layers) {
    if (isGroup(l)) {
      const hit = siblingListOf(l.children, id);
      if (hit) return hit;
    }
  }
  return null;
}

/** One flattened render entry: a LEAF layer + its composed ancestor flags. */
export interface LeafRenderEntry {
  layer: Layer;
  /** self && every ancestor visible */
  visible: boolean;
  /** self || any ancestor locked */
  locked: boolean;
  /** self × every ancestor's opacity — the FINAL value the renderer applies */
  opacity: number;
}

/** Doc-order leaf list with effective visibility/lock/opacity — what the
 *  reconciler renders (groups flatten away; children are scene-absolute, see
 *  header). */
export function leafRenderList(
  layers: readonly Layer[],
  into: LeafRenderEntry[] = [],
  visible = true,
  locked = false,
  opacity = 1,
): LeafRenderEntry[] {
  for (const l of layers) {
    const v = visible && l.visible;
    const k = locked || l.locked;
    const o = opacity * l.opacity;
    if (isGroup(l)) leafRenderList(l.children, into, v, k, o);
    else into.push({ layer: l, visible: v, locked: k, opacity: o });
  }
  return into;
}

/** One Layers-panel row (display order = top-first at every level). */
export interface PanelRow {
  layer: Layer;
  depth: number;
  parentId: string | null;
  /** the last visible child of its parent — draws the └ elbow (else ├) */
  lastChild: boolean;
  /** ancestor lastChild flags, root-level group first — trail[k] is whether the
   *  ancestor at depth k was the last of ITS siblings, so gutters know where a
   *  vertical guide continues past this row (deep-nesting tree lines). */
  trail: boolean[];
}

/** Flatten for the panel: top-first at each level; collapsed groups keep their
 *  row but omit descendants. */
export function flattenForPanel(
  layers: readonly Layer[],
  collapsed: ReadonlySet<string>,
  depth = 0,
  parentId: string | null = null,
  into: PanelRow[] = [],
  trail: boolean[] = [],
): PanelRow[] {
  const display = [...layers].reverse(); // doc bottom→top ⇒ display top-first
  display.forEach((l, i) => {
    const lastChild = i === display.length - 1;
    into.push({ layer: l, depth, parentId, lastChild, trail });
    if (isGroup(l) && !collapsed.has(l.id)) {
      flattenForPanel(l.children, collapsed, depth + 1, l.id, into, [...trail, lastChild]);
    }
  });
  return into;
}
