/**
 * Zine Fold Templates
 *
 * Pure TypeScript module describing how a single sheet of paper is divided,
 * folded, and (optionally) cut to produce a small zine. No React, no PDF,
 * no canvas — just the page-placement geometry and fold/cut metadata.
 *
 * Every fold is made from ONE physical sheet (printed single- or double-sided).
 * Multi-sheet booklets (saddle stitch, perfect bind, N-up) live in the separate
 * Imposer tool — this module deliberately stays single-sheet.
 *
 * The 8-page mini-zine layout here is byte-for-byte the long-standing layout and
 * is treated as the known-good reference: any future fold geometry should be
 * sanity-checked against it.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ZineFoldId = "mini-8" | "accordion";

/** One page placed in a grid cell on one side of the sheet. */
export interface ZinePlacement {
  /** 1-indexed page/slot number. */
  page: number;
  /** Column index (0-based, left to right). */
  col: number;
  /** Row index (0-based, top to bottom). */
  row: number;
  /** Rotation in degrees applied when drawing (0 or 180). */
  rotation: number;
}

/** A fold crease drawn on the preview as guidance. */
export interface FoldLine {
  /** "v" = vertical crease, "h" = horizontal crease. */
  axis: "v" | "h";
  /** Position as a fraction (0..1) across the sheet (x for "v", y for "h"). */
  pos: number;
  /** Mountain (folds away) or valley (folds toward) — guidance only. */
  kind: "mountain" | "valley";
}

/** A cut line drawn solid/red on the preview. Coordinates are fractions (0..1). */
export interface CutLine {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

/** One printed side of the sheet. */
export interface ZineSide {
  side: "front" | "back";
  placements: ZinePlacement[];
}

/** A fully resolved fold layout ready for preview + PDF generation. */
export interface ZineFoldLayout {
  foldId: ZineFoldId;
  /** Grid columns on the (landscape) sheet. */
  cols: number;
  /** Grid rows on the (landscape) sheet. */
  rows: number;
  /** Total page slots the user must fill, across all sides. */
  pageCount: number;
  /** One entry for single-sided, two for double-sided. */
  sides: ZineSide[];
  foldLines: FoldLine[];
  cutLines: CutLine[];
  /** Recommended duplex setting when there are two sides. */
  duplexFlip?: "short-edge" | "long-edge";
  /** Step-by-step folding instructions for the resolved layout. */
  instructions: string[];
}

/** A user-selectable fold type and its configuration capabilities. */
export interface ZineFoldOption {
  id: ZineFoldId;
  name: string;
  /** Short tagline for the picker. */
  tagline: string;
  description: string;
  /** Whether the panel/page count is configurable. */
  configurablePanels: boolean;
  /** Allowed panel counts (accordion). */
  panelOptions?: number[];
  /** Whether a double-sided variant exists. */
  supportsDoubleSided: boolean;
  /** Whether a split (two-up) variant exists. */
  supportsSplit: boolean;
}

// ---------------------------------------------------------------------------
// Fold catalogue
// ---------------------------------------------------------------------------

export const ZINE_FOLDS: ZineFoldOption[] = [
  {
    id: "mini-8",
    name: "8-page mini-zine",
    tagline: "Classic slit & fold",
    description:
      "The classic single-sheet zine. Three folds plus one central cut turn one " +
      "sheet into an 8-page booklet. Printed single-sided.",
    configurablePanels: false,
    supportsDoubleSided: false,
    supportsSplit: false,
  },
  {
    id: "accordion",
    name: "Accordion / concertina",
    tagline: "Zig-zag fold-out",
    description:
      "A zig-zag concertina fold — no cutting. Single-sided makes a fold-out " +
      "panorama strip; double-sided makes a continuous booklet you read front " +
      "then back.",
    configurablePanels: true,
    panelOptions: [4, 6, 8],
    supportsDoubleSided: true,
    supportsSplit: true,
  },
];

export function getFoldOption(id: ZineFoldId): ZineFoldOption {
  return ZINE_FOLDS.find((f) => f.id === id) ?? ZINE_FOLDS[0];
}

// ---------------------------------------------------------------------------
// Layout builders
// ---------------------------------------------------------------------------

/**
 * Classic 8-page mini-zine on a single landscape sheet (4 columns × 2 rows).
 *
 *   [ p5↻ ][ p4↻ ][ p3↻ ][ p2↻ ]   top row, rotated 180°
 *   [ p6  ][ p7  ][ p8  ][ p1  ]   bottom row, upright
 *
 * Folded along the creases and cut along the central horizontal slit (middle
 * two columns only), it reads pages 1..8 in order. Preserved verbatim.
 */
function buildMini8(): ZineFoldLayout {
  const placements: ZinePlacement[] = [
    // Top row (rotated 180°): pages 5, 4, 3, 2
    { page: 5, col: 0, row: 0, rotation: 180 },
    { page: 4, col: 1, row: 0, rotation: 180 },
    { page: 3, col: 2, row: 0, rotation: 180 },
    { page: 2, col: 3, row: 0, rotation: 180 },
    // Bottom row (upright): pages 6, 7, 8, 1
    { page: 6, col: 0, row: 1, rotation: 0 },
    { page: 7, col: 1, row: 1, rotation: 0 },
    { page: 8, col: 2, row: 1, rotation: 0 },
    { page: 1, col: 3, row: 1, rotation: 0 },
  ];

  return {
    foldId: "mini-8",
    cols: 4,
    rows: 2,
    pageCount: 8,
    sides: [{ side: "front", placements }],
    foldLines: [
      { axis: "v", pos: 0.25, kind: "valley" },
      { axis: "v", pos: 0.5, kind: "mountain" },
      { axis: "v", pos: 0.75, kind: "valley" },
      { axis: "h", pos: 0.5, kind: "mountain" },
    ],
    // Solid central horizontal slit spanning the middle two columns only.
    cutLines: [{ x1: 0.25, y1: 0.5, x2: 0.75, y2: 0.5 }],
    instructions: [
      "Print the single page (single-sided, landscape).",
      "Fold in half lengthwise (top edge to bottom edge).",
      "Unfold, then fold in half widthwise (right edge to left).",
      "Fold in half widthwise again.",
      "Unfold completely — you'll see 8 panels.",
      "Cut along the red line (centre horizontal, middle two columns only).",
      "Fold lengthwise again, push ends together to form the booklet.",
    ],
  };
}

/**
 * Accordion / concertina fold on a single landscape sheet, divided into N
 * equal vertical panels (1 row × N columns). No cutting.
 *
 * Single-sided: pages 1..N run left to right; read by unfolding into a strip.
 *
 * Double-sided: the front carries pages 1..N (left to right) and the back
 * carries pages N+1..2N (left to right, leftmost = N+1). Printed with a
 * short-edge duplex flip, the back of the rightmost front panel becomes page
 * N+1, so reading front-then-back is continuous.
 *
 * Derivation (short-edge / vertical-axis flip): the back face of front panel c
 * lands at back-view column (N-1-c). Setting back column c' = page (N+1+c')
 * gives back-of-front-panel-(N-1) = page N+1 (first back page), …,
 * back-of-front-panel-0 = page 2N (last). Upright throughout (no rotation).
 *
 * Split (two-up): the panels are duplicated into two stacked lanes (rows = 2)
 * with a single horizontal cut between them. Cutting the sheet apart yields two
 * identical strips with half-height panels — a better aspect ratio than one tall
 * strip. The slot count is unchanged because the lanes are copies.
 */
function buildAccordion(
  panels: number,
  doubleSided: boolean,
  split: boolean,
): ZineFoldLayout {
  const n = Math.max(2, Math.round(panels));
  const rows = split ? 2 : 1;

  // Build one printed side. When split, the same panels are duplicated into
  // every lane (row) so cutting the sheet apart yields identical copies.
  const buildSide = (side: "front" | "back"): ZineSide => {
    const placements: ZinePlacement[] = [];
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < n; c++) {
        const page = side === "front" ? c + 1 : n + 1 + c;
        placements.push({ page, col: c, row: r, rotation: 0 });
      }
    }
    return { side, placements };
  };

  const sides: ZineSide[] = [buildSide("front")];
  if (doubleSided) sides.push(buildSide("back"));

  // Vertical creases between panels, alternating valley/mountain (full height,
  // shared by both lanes when split).
  const foldLines: FoldLine[] = [];
  for (let i = 1; i < n; i++) {
    foldLines.push({ axis: "v", pos: i / n, kind: i % 2 === 1 ? "valley" : "mountain" });
  }

  // When split, a single horizontal cut across the full width separates the
  // two identical strips.
  const cutLines: CutLine[] = split ? [{ x1: 0, y1: 0.5, x2: 1, y2: 0.5 }] : [];

  const foldStep =
    `Fold ${split ? "each strip" : "the sheet"} into ${n} equal vertical panels ` +
    "with an alternating zig-zag (concertina) fold — first crease toward you, " +
    "next away, and so on.";
  const cutStep =
    "Cut the sheet in half along the horizontal red line — two identical strips.";

  const instructions = doubleSided
    ? [
        "Print both pages double-sided. In the print dialog choose Two-Sided and " +
          "“Flip on short edge” so the back lines up correctly.",
        ...(split ? [cutStep] : []),
        foldStep,
        "Crease each fold firmly.",
        `Read the front panels left to right (pages 1–${n}), then flip the strip ` +
          `over its right edge and continue on the back (pages ${n + 1}–${n * 2}).` +
          (split ? " You now have two identical copies." : ""),
      ]
    : [
        "Print the single page (single-sided, landscape).",
        ...(split ? [cutStep] : []),
        foldStep,
        "Crease each fold firmly.",
        "The panels read left to right (page 1 is the leftmost panel). Unfold " +
          (split
            ? "to view as a fold-out — you now have two identical copies."
            : "completely to view it as a fold-out panorama."),
      ];

  return {
    foldId: "accordion",
    cols: n,
    rows,
    // The two split lanes are identical copies, so the slot count is unchanged.
    pageCount: doubleSided ? n * 2 : n,
    sides,
    foldLines,
    cutLines,
    duplexFlip: doubleSided ? "short-edge" : undefined,
    instructions,
  };
}

export interface FoldParams {
  panels?: number;
  doubleSided?: boolean;
  split?: boolean;
}

/** Resolve a fold id + params into a concrete layout. */
export function buildFoldLayout(id: ZineFoldId, params: FoldParams = {}): ZineFoldLayout {
  switch (id) {
    case "accordion":
      return buildAccordion(params.panels ?? 8, params.doubleSided ?? false, params.split ?? false);
    case "mini-8":
    default:
      return buildMini8();
  }
}
