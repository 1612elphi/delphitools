/**
 * Selection-mask maths (M2-10 SELECT) — fabric-free, doc-model-free. A
 * PixelMask is one byte per SCENE pixel, strictly 0|255; marquee, lasso and
 * wand all reduce to one, the canvas wiring draws its outline, and the ops
 * module bakes extract/cut from it. Canvas2D is the only platform dependency:
 * it rasterises polygons and stamps the morphology (so half this module is
 * client-only, like everything behind the editor boundary) — the flood/global
 * predicates, bounds/area, Sobel field and marching squares are pure loops.
 *
 * ponytail: masks are binary — no anti-aliasing, no feather; alpha ≥128 wins
 * on every canvas readback. A Uint8 coverage mask is the upgrade path if soft
 * selections are ever wanted.
 */

export interface PixelMask {
  /** 0|255 per pixel, row-major, scene space */
  data: Uint8Array;
  width: number;
  height: number;
}

/** Tight integer bounding box of the selected pixels. */
export interface MaskBounds {
  x: number;
  y: number;
  w: number;
  h: number;
}

/* ------------------------------------------------------------------ */
/* Builders                                                            */
/* ------------------------------------------------------------------ */

/**
 * Marquee: axis-aligned rect from two drag corners (any order, fractional),
 * rounded to pixel edges and clamped to the scene. Degenerate drags yield an
 * empty mask.
 */
export function rectMask(
  width: number,
  height: number,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
): PixelMask {
  const data = new Uint8Array(width * height);
  const xa = Math.max(0, Math.round(Math.min(x0, x1)));
  const xb = Math.min(width, Math.round(Math.max(x0, x1)));
  const ya = Math.max(0, Math.round(Math.min(y0, y1)));
  const yb = Math.min(height, Math.round(Math.max(y0, y1)));
  for (let y = ya; y < yb; y++) data.fill(255, y * width + xa, y * width + xb);
  return { data, width, height };
}

function scratchContext(width: number, height: number): CanvasRenderingContext2D {
  const c = document.createElement("canvas");
  c.width = width;
  c.height = height;
  return c.getContext("2d")!;
}

/** Threshold a scratch canvas's alpha back into binary mask bytes. */
function alphaToMask(ctx: CanvasRenderingContext2D, width: number, height: number): Uint8Array {
  const px = ctx.getImageData(0, 0, width, height).data;
  const data = new Uint8Array(width * height);
  for (let i = 0; i < data.length; i++) if (px[i * 4 + 3] >= 128) data[i] = 255;
  return data;
}

/**
 * Lasso: fill the closed polygon into a scratch canvas and read the alpha
 * back — Canvas2D is the rasteriser (no hand-rolled scan conversion), which
 * clips to the scene for free. Fewer than 3 points → empty mask.
 */
export function polygonMask(
  width: number,
  height: number,
  points: { x: number; y: number }[],
): PixelMask {
  if (points.length < 3) return { data: new Uint8Array(width * height), width, height };
  const ctx = scratchContext(width, height);
  ctx.beginPath();
  ctx.moveTo(points[0].x, points[0].y);
  for (let i = 1; i < points.length; i++) ctx.lineTo(points[i].x, points[i].y);
  ctx.closePath();
  ctx.fill();
  return { data: alphaToMask(ctx, width, height), width, height };
}

/**
 * Wand colour predicate: matches when max per-channel |Δ| across ALL FOUR
 * RGBA channels vs the seed pixel is ≤ tolerance (0–255). Alpha counts —
 * transparent and opaque black are different colours.
 */
function matcher(
  data: Uint8ClampedArray,
  seedIndex: number,
  tolerance: number,
): (i: number) => boolean {
  const s = seedIndex * 4;
  const r = data[s];
  const g = data[s + 1];
  const b = data[s + 2];
  const a = data[s + 3];
  return (i) => {
    const j = i * 4;
    return (
      Math.abs(data[j] - r) <= tolerance &&
      Math.abs(data[j + 1] - g) <= tolerance &&
      Math.abs(data[j + 2] - b) <= tolerance &&
      Math.abs(data[j + 3] - a) <= tolerance
    );
  };
}

/**
 * Wand: scanline stack-of-runs flood fill from the seed — 4-connected,
 * contiguous. Out-of-bounds seed → empty mask.
 */
export function floodMask(
  image: ImageData,
  seedX: number,
  seedY: number,
  tolerance: number,
): PixelMask {
  const { width, height } = image;
  const data = new Uint8Array(width * height);
  const sx = Math.floor(seedX);
  const sy = Math.floor(seedY);
  if (sx < 0 || sy < 0 || sx >= width || sy >= height) return { data, width, height };
  const match = matcher(image.data, sy * width + sx, tolerance);

  const stack = [sy * width + sx];
  while (stack.length) {
    const idx = stack.pop()!;
    if (data[idx] || !match(idx)) continue;
    const y = (idx / width) | 0;
    const row = y * width;
    // expand the run left/right, then fill it in one go
    let x0 = idx - row;
    let x1 = x0;
    while (x0 > 0 && !data[row + x0 - 1] && match(row + x0 - 1)) x0--;
    while (x1 < width - 1 && !data[row + x1 + 1] && match(row + x1 + 1)) x1++;
    data.fill(255, row + x0, row + x1 + 1);
    // seed one entry per matching run on the rows above and below
    for (const ny of [y - 1, y + 1]) {
      if (ny < 0 || ny >= height) continue;
      let inRun = false;
      for (let x = x0; x <= x1; x++) {
        const k = ny * width + x;
        if (!data[k] && match(k)) {
          if (!inRun) stack.push(k);
          inRun = true;
        } else inRun = false;
      }
    }
  }
  return { data, width, height };
}

/**
 * Superflood (wand's global mode): same seed-colour predicate, one linear
 * pass, no contiguity requirement.
 */
export function globalMask(
  image: ImageData,
  seedX: number,
  seedY: number,
  tolerance: number,
): PixelMask {
  const { width, height } = image;
  const data = new Uint8Array(width * height);
  const sx = Math.floor(seedX);
  const sy = Math.floor(seedY);
  if (sx < 0 || sy < 0 || sx >= width || sy >= height) return { data, width, height };
  const match = matcher(image.data, sy * width + sx, tolerance);
  for (let i = 0; i < data.length; i++) if (match(i)) data[i] = 255;
  return { data, width, height };
}

/* ------------------------------------------------------------------ */
/* Set operations & morphology                                         */
/* ------------------------------------------------------------------ */

export function invertMask(mask: PixelMask): PixelMask {
  const data = new Uint8Array(mask.data.length);
  for (let i = 0; i < data.length; i++) data[i] = mask.data[i] ? 0 : 255;
  return { data, width: mask.width, height: mask.height };
}

/**
 * Morphological dilate/erode by stamping the mask at offsets on a circle of
 * the given radius (plus the centre): dilate = source-over union, erode =
 * destination-in intersection. Off-canvas is empty, so erode correctly eats
 * the scene border and dilate correctly clips at it.
 *
 * ponytail: 16 ring facets approximate the disc structuring element — plenty
 * at selection-tweak radii; bump the facet count (∝ radius) if big radii ever
 * show scalloping.
 */
function morphMask(mask: PixelMask, radius: number, op: GlobalCompositeOperation): PixelMask {
  const r = Math.max(1, Math.round(radius));
  const stamp = maskToCanvas(mask);
  const ctx = scratchContext(mask.width, mask.height);
  ctx.drawImage(stamp, 0, 0);
  ctx.globalCompositeOperation = op;
  const FACETS = 16;
  for (let i = 0; i < FACETS; i++) {
    const a = (i / FACETS) * 2 * Math.PI;
    ctx.drawImage(stamp, Math.cos(a) * r, Math.sin(a) * r);
  }
  return { data: alphaToMask(ctx, mask.width, mask.height), width: mask.width, height: mask.height };
}

/** Grow the selection outward by `radius` scene px (integer ≥1). */
export function growMask(mask: PixelMask, radius: number): PixelMask {
  return morphMask(mask, radius, "source-over");
}

/** Shrink the selection inward by `radius` scene px (integer ≥1). */
export function shrinkMask(mask: PixelMask, radius: number): PixelMask {
  return morphMask(mask, radius, "destination-in");
}

/* ------------------------------------------------------------------ */
/* Queries                                                             */
/* ------------------------------------------------------------------ */

/** Tight integer bbox of the selected pixels; null when nothing is selected. */
export function maskBounds(mask: PixelMask): MaskBounds | null {
  const { data, width, height } = mask;
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < height; y++) {
    const row = y * width;
    for (let x = 0; x < width; x++) {
      if (!data[row + x]) continue;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      maxY = y;
    }
  }
  if (maxX < 0) return null;
  return { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 };
}

/** Number of selected pixels. */
export function maskArea(mask: PixelMask): number {
  let n = 0;
  for (let i = 0; i < mask.data.length; i++) if (mask.data[i]) n++;
  return n;
}

/* ------------------------------------------------------------------ */
/* Outline (marching squares)                                          */
/* ------------------------------------------------------------------ */

/**
 * Directed marching-squares segments per cell case, corners packed as
 * TL·8|TR·4|BR·2|BL·1, edges 0=top 1=right 2=bottom 3=left. Directions keep
 * the selected region on a consistent side, so every crossing point starts
 * exactly one segment and ends exactly one — linking end→start walks whole
 * loops, and holes come out wound the opposite way for free. The two saddles
 * (5, 10) resolve as disconnected corners: 4-connectivity for the selection,
 * matching floodMask.
 */
const MS_SEGMENTS: readonly (readonly [number, number])[][] = [
  [], // 0
  [[3, 2]], // 1  BL
  [[2, 1]], // 2  BR
  [[3, 1]], // 3  bottom half
  [[1, 0]], // 4  TR
  [[1, 0], [3, 2]], // 5  saddle TR+BL
  [[2, 0]], // 6  right half
  [[3, 0]], // 7  all but TL
  [[0, 3]], // 8  TL
  [[0, 2]], // 9  left half
  [[0, 3], [2, 1]], // 10 saddle TL+BR
  [[0, 1]], // 11 all but TR
  [[1, 3]], // 12 top half
  [[1, 2]], // 13 all but BR
  [[2, 3]], // 14 all but BL
  [], // 15
];

/**
 * Trace the mask's outline as closed loop(s) in one Path2D, scene coords —
 * the marching-ants stroke crawls it and the ops bake clips by it. Sample
 * points sit at pixel centres, so a lone pixel traces as a diamond around
 * its centre and vertices land on half-integers; out-of-bounds samples read
 * as empty, which closes border-touching regions along the scene edge.
 * Handles any number of disjoint regions and holes.
 */
export function traceOutline(mask: PixelMask): Path2D {
  const { data, width, height } = mask;
  const path = new Path2D();
  // vertex coords are multiples of 0.5 in [0..width]×[0..height]; key on 2×
  const stride = 2 * width + 1;
  const key = (x: number, y: number) => Math.round(2 * y) * stride + Math.round(2 * x);
  const segs = new Map<number, number>(); // startKey → endKey

  const at = (px: number, py: number) =>
    px >= 0 && py >= 0 && px < width && py < height && data[py * width + px] ? 1 : 0;
  // cell (cx,cy) has pixel-centre corners TL=(cx-1,cy-1) … BR=(cx,cy);
  // edge midpoints: T=(cx,cy-.5) R=(cx+.5,cy) B=(cx,cy+.5) L=(cx-.5,cy)
  for (let cy = 0; cy <= height; cy++) {
    for (let cx = 0; cx <= width; cx++) {
      const cell =
        (at(cx - 1, cy - 1) << 3) | (at(cx, cy - 1) << 2) | (at(cx, cy) << 1) | at(cx - 1, cy);
      for (const [from, to] of MS_SEGMENTS[cell]) {
        const p = edgePoint(cx, cy, from);
        const q = edgePoint(cx, cy, to);
        segs.set(key(p.x, p.y), key(q.x, q.y));
      }
    }
  }

  for (const start of segs.keys()) {
    if (!segs.has(start)) continue; // consumed by an earlier loop
    path.moveTo(((start % stride) / 2), (Math.floor(start / stride) / 2));
    let cur = start;
    for (;;) {
      const next = segs.get(cur);
      segs.delete(cur);
      if (next === undefined || next === start) break; // closed (undefined can't happen)
      path.lineTo((next % stride) / 2, Math.floor(next / stride) / 2);
      cur = next;
    }
    path.closePath();
  }
  return path;
}

function edgePoint(cx: number, cy: number, edge: number): { x: number; y: number } {
  switch (edge) {
    case 0:
      return { x: cx, y: cy - 0.5 };
    case 1:
      return { x: cx + 0.5, y: cy };
    case 2:
      return { x: cx, y: cy + 0.5 };
    default:
      return { x: cx - 0.5, y: cy };
  }
}

/* ------------------------------------------------------------------ */
/* Canvas bridge                                                       */
/* ------------------------------------------------------------------ */

/**
 * The mask as an alpha canvas — opaque white where selected, transparent
 * elsewhere. This is the composite brush: destination-in against a layer
 * bake extracts the selection, destination-out cuts it.
 */
export function maskToCanvas(mask: PixelMask): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = mask.width;
  c.height = mask.height;
  const ctx = c.getContext("2d")!;
  const img = ctx.createImageData(mask.width, mask.height);
  for (let i = 0; i < mask.data.length; i++) {
    const j = i * 4;
    img.data[j] = 255;
    img.data[j + 1] = 255;
    img.data[j + 2] = 255;
    img.data[j + 3] = mask.data[i];
  }
  ctx.putImageData(img, 0, 0);
  return c;
}

/* ------------------------------------------------------------------ */
/* Magnetic lasso support                                              */
/* ------------------------------------------------------------------ */

/** Below this Sobel magnitude nothing counts as an edge — snap is a no-op. */
const EDGE_FLOOR = 24;

/**
 * Luminance Sobel gradient magnitude, one pass, clamped to Uint8
 * (hypot(gx,gy)/4 so a full 0→255 step maxes the scale). The outermost
 * pixel ring stays 0 — the magnetic lasso never snaps INTO the scene edge,
 * which is what you want.
 */
export function sobelField(image: ImageData): { mag: Uint8Array; width: number; height: number } {
  const { data, width, height } = image;
  const lum = new Uint8Array(width * height);
  for (let i = 0; i < lum.length; i++) {
    const j = i * 4;
    lum[i] = (data[j] * 77 + data[j + 1] * 150 + data[j + 2] * 29) >> 8;
  }
  const mag = new Uint8Array(width * height);
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const i = y * width + x;
      const tl = lum[i - width - 1];
      const t = lum[i - width];
      const tr = lum[i - width + 1];
      const l = lum[i - 1];
      const r = lum[i + 1];
      const bl = lum[i + width - 1];
      const b = lum[i + width];
      const br = lum[i + width + 1];
      const gx = tr + 2 * r + br - tl - 2 * l - bl;
      const gy = bl + 2 * b + br - tl - 2 * t - tr;
      mag[i] = Math.min(255, Math.round(Math.hypot(gx, gy) / 4));
    }
  }
  return { mag, width, height };
}

/**
 * Greedy strongest-edge search: return the centre of the highest-magnitude
 * pixel within the disc radius of (x,y) — nearer pixel wins ties, so the
 * point doesn't jitter along a uniform edge. No pixel clears EDGE_FLOOR →
 * the input point comes back untouched.
 */
export function snapToEdge(
  field: { mag: Uint8Array; width: number; height: number },
  x: number,
  y: number,
  radius: number,
): { x: number; y: number } {
  const { mag, width, height } = field;
  const r2 = radius * radius;
  let bestMag = 0;
  let bestD2 = Infinity;
  let bx = -1;
  let by = -1;
  const py0 = Math.max(0, Math.floor(y - radius));
  const py1 = Math.min(height - 1, Math.ceil(y + radius));
  const px0 = Math.max(0, Math.floor(x - radius));
  const px1 = Math.min(width - 1, Math.ceil(x + radius));
  for (let py = py0; py <= py1; py++) {
    for (let px = px0; px <= px1; px++) {
      const dx = px + 0.5 - x;
      const dy = py + 0.5 - y;
      const d2 = dx * dx + dy * dy;
      if (d2 > r2) continue;
      const m = mag[py * width + px];
      if (m < EDGE_FLOOR) continue;
      if (m > bestMag || (m === bestMag && d2 < bestD2)) {
        bestMag = m;
        bestD2 = d2;
        bx = px;
        by = py;
      }
    }
  }
  return bx < 0 ? { x, y } : { x: bx + 0.5, y: by + 0.5 };
}
