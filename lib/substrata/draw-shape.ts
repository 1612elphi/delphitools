/**
 * Drag-to-draw maths (M2-7 PIECES) — pure. Turns a drag (start → cursor, in
 * scene coords) + the PIECES settings into the ratified ShapeParams and the
 * transform that places the shape. fabric-canvas.tsx owns the gesture (doc
 * transient = one undo step); this owns what the drag MEANS per primitive:
 *
 *   rectangle/ellipse — the dragged box (⇧ = square / circle)
 *   line              — start → cursor (⇧ = snap to 45° steps)
 *   polygon/star      — drag OUT FROM the centre (start = centre, dist = radius)
 *
 * Also the doc mutation for the live gesture: upsertLayerTransient replaces or
 * appends the in-flight layer at the ROOT (drawn layers land frontmost, like a
 * dropped image; grouping is a later act).
 */

import type { Layer, ShapeLayer, ShapeParams, Transform } from "./doc-model";
import { identityTransform } from "./doc-model";
import { updateTransient } from "./doc-store";
import type { PiecesSettings } from "./tool-settings";

export interface Pt {
  x: number;
  y: number;
}

/** Drags shorter than this (scene px) build nothing — a click draws no shape. */
const MIN_DRAG = 2;

/** Default layer names use the standard shape vocabulary — functional chrome
 *  (the BLEND_OPTIONS / effect-label precedent), not authored copy. */
export const SHAPE_NAMES: Record<ShapeParams["shape"], string> = {
  rectangle: "Rectangle",
  ellipse: "Ellipse",
  line: "Line",
  polygon: "Polygon",
  star: "Star",
};

export function buildDraggedShape(
  s: PiecesSettings,
  start: Pt,
  cur: Pt,
  shift: boolean,
): { params: ShapeParams; transform: Transform } | null {
  const dx = cur.x - start.x;
  const dy = cur.y - start.y;
  if (Math.max(Math.abs(dx), Math.abs(dy)) < MIN_DRAG) return null;

  const at = (x: number, y: number, angle = 0): Transform => ({
    ...identityTransform(),
    x,
    y,
    angle,
  });
  const midX = start.x + dx / 2;
  const midY = start.y + dy / 2;

  switch (s.shape) {
    case "rectangle": {
      const w = shift ? Math.max(Math.abs(dx), Math.abs(dy)) : Math.abs(dx);
      const h = shift ? w : Math.abs(dy);
      // ⇧-square still anchors at the start corner: centre sits half a side
      // along each drag direction.
      const cx = shift ? start.x + (Math.sign(dx) || 1) * (w / 2) : midX;
      const cy = shift ? start.y + (Math.sign(dy) || 1) * (h / 2) : midY;
      return {
        params: { shape: "rectangle", width: w, height: h, cornerRadius: s.cornerRadius },
        transform: at(cx, cy),
      };
    }
    case "ellipse": {
      const rx = shift ? Math.max(Math.abs(dx), Math.abs(dy)) / 2 : Math.abs(dx) / 2;
      const ry = shift ? rx : Math.abs(dy) / 2;
      const cx = shift ? start.x + (Math.sign(dx) || 1) * rx : midX;
      const cy = shift ? start.y + (Math.sign(dy) || 1) * ry : midY;
      return { params: { shape: "ellipse", rx, ry }, transform: at(cx, cy) };
    }
    case "line": {
      let angle = (Math.atan2(dy, dx) * 180) / Math.PI;
      if (shift) angle = Math.round(angle / 45) * 45;
      const length = Math.hypot(dx, dy);
      const rad = (angle * Math.PI) / 180;
      // Snapped lines keep the start endpoint anchored, not the midpoint.
      const cx = start.x + (Math.cos(rad) * length) / 2;
      const cy = start.y + (Math.sin(rad) * length) / 2;
      return { params: { shape: "line", length }, transform: at(cx, cy, angle) };
    }
    case "polygon": {
      const radius = Math.hypot(dx, dy);
      return { params: { shape: "polygon", sides: s.sides, radius }, transform: at(start.x, start.y) };
    }
    case "star": {
      const outerRadius = Math.hypot(dx, dy);
      return {
        params: {
          shape: "star",
          points: s.starPoints,
          outerRadius,
          innerRadius: outerRadius * s.starInnerRatio,
        },
        transform: at(start.x, start.y),
      };
    }
  }
}

/** The stroke a new shape gets: the settings' stroke, except a line always
 *  strokes (it has no fill to render with) — falls back to the fill colour. */
export function strokeForNewShape(s: PiecesSettings): ShapeLayer["stroke"] {
  if (s.stroke) return { colour: s.stroke.colour, width: s.stroke.width };
  return s.shape === "line" ? { colour: s.fill, width: 2 } : null;
}

/** Live-gesture doc write: replace the in-flight layer or append it (root
 *  level, frontmost). Runs on the transient path — begin/commit around the
 *  pointer gesture make the whole draw ONE undo step. */
export function upsertLayerTransient(layer: Layer): void {
  updateTransient((doc) => {
    const exists = doc.layers.some((l) => l.id === layer.id);
    return {
      ...doc,
      layers: exists
        ? doc.layers.map((l) => (l.id === layer.id ? layer : l))
        : [...doc.layers, layer],
      updatedAt: Date.now(),
    };
  });
}
