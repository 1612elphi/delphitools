/**
 * Imposition Layout Engine
 *
 * Pure TypeScript module for computing print imposition layouts.
 * No React, no UI, no PDF dependencies — just geometry and page ordering.
 */

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

export const MM_TO_POINTS = 72 / 25.4;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface PaperSize {
  id: string;
  label: string;
  widthMm: number;
  heightMm: number;
}

/** A single page placed on one side of a sheet. */
export interface PagePlacement {
  /** 1-indexed document page number. 0 means blank. */
  pageNumber: number;
  /** X offset from sheet origin (mm), left edge. */
  x: number;
  /** Y offset from sheet origin (mm), top edge. */
  y: number;
  /** Width of the placed page area (mm). */
  width: number;
  /** Height of the placed page area (mm). */
  height: number;
  /** Rotation in degrees (0, 90, 180, 270). */
  rotation: number;
  /** Which side of the physical sheet this placement belongs to. */
  side: "front" | "back";
}

/** One physical sheet with placements on front and back. */
export interface SheetDefinition {
  sheetNumber: number;
  front: PagePlacement[];
  back: PagePlacement[];
}

export interface ImpositionConfig {
  /** ID of the layout to use. */
  layoutId: string;
  /** Output sheet size. */
  paperSize: PaperSize;
  /** Sheet orientation. */
  orientation: "portrait" | "landscape";
  /** Margin on each sheet edge (mm). */
  marginMm: number;
  /** Gap between page cells (mm). */
  gutterMm: number;
  /**
   * Creep compensation for saddle stitch (mm).
   * Inner pages shift outward by this amount per sheet from the centre.
   * Set to 0 to disable.
   */
  creepMm: number;
  /** How content is scaled to fit each cell. */
  scaling: "fit" | "fill" | "actual";
  /** How to handle incomplete final signature. */
  blankHandling: "auto" | "leave-empty";
  /** Whether to include crop marks in the result metadata. */
  cropMarks: boolean;
  /**
   * For N-up gang run and custom layouts: number of copies per sheet (gang run)
   * or [rows, cols] for custom N-up.
   */
  nUp?: number;
  /** For custom N-up: explicit [rows, cols]. If provided, overrides nUp grid lookup. */
  customGrid?: [number, number];
  /** Duplex flip direction. Long-edge is standard; short-edge adds 180° to back-side placements. */
  duplexFlip?: "long-edge" | "short-edge";
}

export interface ImpositionResult {
  sheets: SheetDefinition[];
  totalSheets: number;
  /** Total document pages (after padding to signature multiple). */
  totalPages: number;
  /** Number of pages from the source document actually placed. */
  pagesUsed: number;
  /** Number of blank pages inserted to complete the final signature. */
  blanksAdded: number;
}

export interface ImpositionLayout {
  id: string;
  name: string;
  description: string;
  useCase: string;
  /** Total page slots per physical sheet (front + back). */
  pagesPerSheet: number;
  calculate: (totalSourcePages: number, config: ImpositionConfig) => ImpositionResult;
}

// ---------------------------------------------------------------------------
// Paper sizes
// ---------------------------------------------------------------------------

export const PAPER_SIZES: PaperSize[] = [
  { id: "a4",      label: "A4 (210 × 297 mm)",       widthMm: 210,   heightMm: 297   },
  { id: "a3",      label: "A3 (297 × 420 mm)",       widthMm: 297,   heightMm: 420   },
  { id: "sra4",    label: "SRA4 (225 × 320 mm)",     widthMm: 225,   heightMm: 320   },
  { id: "sra3",    label: "SRA3 (320 × 450 mm)",     widthMm: 320,   heightMm: 450   },
  { id: "letter",  label: "Letter (8.5 × 11\")",      widthMm: 215.9, heightMm: 279.4 },
  { id: "legal",   label: "Legal (8.5 × 14\")",       widthMm: 215.9, heightMm: 355.6 },
  { id: "tabloid", label: "Tabloid (11 × 17\")",      widthMm: 279.4, heightMm: 431.8 },
  { id: "12x18",   label: "12 × 18\" (305 × 457 mm)", widthMm: 304.8, heightMm: 457.2 },
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Return the effective sheet dimensions after applying orientation. */
function sheetDimensions(
  paperSize: PaperSize,
  orientation: "portrait" | "landscape"
): { sheetW: number; sheetH: number } {
  const { widthMm, heightMm } = paperSize;
  if (orientation === "landscape") {
    return { sheetW: Math.max(widthMm, heightMm), sheetH: Math.min(widthMm, heightMm) };
  }
  return { sheetW: Math.min(widthMm, heightMm), sheetH: Math.max(widthMm, heightMm) };
}

/** Pad a page count up to the nearest multiple of `multiple`. */
function padToMultiple(n: number, multiple: number): number {
  const rem = n % multiple;
  return rem === 0 ? n : n + (multiple - rem);
}

/**
 * Build a grid of PagePlacements for one side of a sheet.
 * Pages are placed left-to-right, top-to-bottom.
 */
function buildGrid(
  pageNumbers: number[],
  rows: number,
  cols: number,
  sheetW: number,
  sheetH: number,
  marginMm: number,
  gutterMm: number,
  side: "front" | "back",
  rotations?: number[]
): PagePlacement[] {
  const usableW = sheetW - marginMm * 2 - gutterMm * (cols - 1);
  const usableH = sheetH - marginMm * 2 - gutterMm * (rows - 1);
  const cellW = usableW / cols;
  const cellH = usableH / rows;

  const placements: PagePlacement[] = [];
  for (let i = 0; i < pageNumbers.length; i++) {
    const col = i % cols;
    const row = Math.floor(i / cols);
    const x = marginMm + col * (cellW + gutterMm);
    const y = marginMm + row * (cellH + gutterMm);
    placements.push({
      pageNumber: pageNumbers[i],
      x,
      y,
      width: cellW,
      height: cellH,
      rotation: rotations ? (rotations[i] ?? 0) : 0,
      side,
    });
  }
  return placements;
}

/** Build an ImpositionResult with zero blanks from pre-constructed sheets. */
function makeResult(
  sheets: SheetDefinition[],
  totalSourcePages: number,
  totalPaddedPages: number
): ImpositionResult {
  const blanksAdded = totalPaddedPages - totalSourcePages;
  return {
    sheets,
    totalSheets: sheets.length,
    totalPages: totalPaddedPages,
    pagesUsed: totalSourcePages,
    blanksAdded: Math.max(0, blanksAdded),
  };
}

// ---------------------------------------------------------------------------
// Layout 1: 2-up Saddle Stitch
// ---------------------------------------------------------------------------

/**
 * Classic booklet imposition for saddle-stitched (stapled in the fold) books.
 *
 * For a document with N pages (padded to a multiple of 4):
 *   - Sheet 1 front:  [N, 1]  (outermost pages)
 *   - Sheet 1 back:   [2, N-1]
 *   - Sheet 2 front:  [N-2, 3]
 *   - Sheet 2 back:   [4, N-3]
 *   - …and so on
 *
 * Each sheet is landscape; pages are placed side by side.
 * The right page of the front and the left page of the back form the outer fold.
 *
 * Creep: with physical paper, inner sheets must shift slightly outward to
 * compensate for paper thickness. The creepMm value is applied per-sheet
 * offset from the centre-most sheet.
 */
function calculateSaddleStitch(
  totalSourcePages: number,
  config: ImpositionConfig
): ImpositionResult {
  const totalPages = padToMultiple(Math.max(totalSourcePages, 4), 4);
  const numSheets = totalPages / 4;

  const { sheetW, sheetH } = sheetDimensions(config.paperSize, config.orientation);
  const { marginMm, gutterMm, creepMm } = config;

  const sheets: SheetDefinition[] = [];

  for (let s = 0; s < numSheets; s++) {
    // Creep offset: outermost sheet (s=0) has largest creep, innermost has none.
    // Clamped to the margin so pages can't be pushed off the sheet edge.
    const rawCreep = (numSheets - 1 - s) * creepMm;
    const creepOffset = Math.min(rawCreep, marginMm);

    // Saddle stitch page assignment:
    // Sheet index s (0-based, outermost = 0) contains:
    //   front left:  totalPages - 2*s         (e.g. N, N-4, …)
    //   front right: 2*s + 1                   (e.g. 1, 5, …)
    //   back left:   2*s + 2                   (e.g. 2, 6, …)
    //   back right:  totalPages - 2*s - 1      (e.g. N-1, N-5, …)
    const frontLeft  = totalPages - 2 * s;
    const frontRight = 2 * s + 1;
    const backLeft   = 2 * s + 2;
    const backRight  = totalPages - 2 * s - 1;

    // Convert 1-indexed page numbers — pages beyond source become blank (0)
    const pageOrBlank = (p: number) => (p <= totalSourcePages ? p : 0);

    const usableW = sheetW - marginMm * 2;
    const usableH = sheetH - marginMm * 2;
    const halfW    = (usableW - gutterMm) / 2;

    // No rotation needed — page ordering handles correct reading after fold.
    const frontPlacements: PagePlacement[] = [
      {
        pageNumber: pageOrBlank(frontLeft),
        x: marginMm - creepOffset,
        y: marginMm,
        width: halfW,
        height: usableH,
        rotation: 0,
        side: "front",
      },
      {
        pageNumber: pageOrBlank(frontRight),
        x: marginMm + halfW + gutterMm + creepOffset,
        y: marginMm,
        width: halfW,
        height: usableH,
        rotation: 0,
        side: "front",
      },
    ];

    const backPlacements: PagePlacement[] = [
      {
        pageNumber: pageOrBlank(backLeft),
        x: marginMm - creepOffset,
        y: marginMm,
        width: halfW,
        height: usableH,
        rotation: 0,
        side: "back",
      },
      {
        pageNumber: pageOrBlank(backRight),
        x: marginMm + halfW + gutterMm + creepOffset,
        y: marginMm,
        width: halfW,
        height: usableH,
        rotation: 0,
        side: "back",
      },
    ];

    sheets.push({
      sheetNumber: s + 1,
      front: frontPlacements,
      back: backPlacements,
    });
  }

  return makeResult(sheets, totalSourcePages, totalPages);
}

// ---------------------------------------------------------------------------
// Layout 2: 2-up Perfect Bind
// ---------------------------------------------------------------------------

/**
 * Sequential two-up layout for perfect-bound books (pages cut and glued at spine).
 *
 * Each sheet carries two leaves side by side. After cutting down the centre,
 * each leaf has its front and back page correctly backed up (long-edge flip).
 *
 *   Sheet 1 front: [1, 3]   — page 1 left, page 3 right
 *   Sheet 1 back:  [2, 4]   — page 2 behind page 1, page 4 behind page 3
 *   Sheet 2 front: [5, 7]
 *   Sheet 2 back:  [6, 8]
 *   …
 */
function calculatePerfectBind(
  totalSourcePages: number,
  config: ImpositionConfig
): ImpositionResult {
  const totalPages = padToMultiple(Math.max(totalSourcePages, 4), 4);
  const numSheets = totalPages / 4;

  const { sheetW, sheetH } = sheetDimensions(config.paperSize, config.orientation);

  const sheets: SheetDefinition[] = [];
  const pageOrBlank = (p: number) => (p <= totalSourcePages ? p : 0);

  for (let s = 0; s < numSheets; s++) {
    const base = s * 4;
    // Front: odd-numbered pages of each leaf side by side
    const frontPages = [pageOrBlank(base + 1), pageOrBlank(base + 3)];
    // Back: even-numbered pages behind their fronts (same position after long-edge flip)
    const backPages  = [pageOrBlank(base + 2), pageOrBlank(base + 4)];

    sheets.push({
      sheetNumber: s + 1,
      front: buildGrid(frontPages, 1, 2, sheetW, sheetH, config.marginMm, config.gutterMm, "front"),
      back:  buildGrid(backPages,  1, 2, sheetW, sheetH, config.marginMm, config.gutterMm, "back"),
    });
  }

  return makeResult(sheets, totalSourcePages, totalPages);
}

// ---------------------------------------------------------------------------
// Layout 3: 2-up Step & Repeat
// ---------------------------------------------------------------------------

/**
 * The same single page repeated twice on every sheet (both sides if duplex,
 * or front-only for simplex). Typical use: postcards, flyers, business cards.
 *
 * Only page 1 of the source document is used; its number is duplicated into
 * both cell positions.
 */
function calculateStepAndRepeat(
  totalSourcePages: number,
  config: ImpositionConfig
): ImpositionResult {
  const { sheetW, sheetH } = sheetDimensions(config.paperSize, config.orientation);

  // Step & repeat always produces exactly one sheet (front only, or front + back
  // if there is a second source page to repeat on the back).
  const sourcePage = totalSourcePages >= 1 ? 1 : 0;
  const backPage   = totalSourcePages >= 2 ? 2 : sourcePage;

  const sheet: SheetDefinition = {
    sheetNumber: 1,
    front: buildGrid([sourcePage, sourcePage], 1, 2, sheetW, sheetH, config.marginMm, config.gutterMm, "front"),
    back:  buildGrid([backPage, backPage],      1, 2, sheetW, sheetH, config.marginMm, config.gutterMm, "back"),
  };

  return {
    sheets: [sheet],
    totalSheets: 1,
    totalPages: 2,
    pagesUsed: Math.min(totalSourcePages, 2),
    blanksAdded: 0,
  };
}

// ---------------------------------------------------------------------------
// Layout 4: 4-up Booklet (quarter-fold)
// ---------------------------------------------------------------------------

/**
 * Saddle-stitch style but with 4 quarter-size pages per side (2×2 grid).
 * The sheet is folded twice: once long-edge then short-edge (or vice versa).
 *
 * Page assignment per sheet (0-based sheet index s, total padded pages N):
 *   Front:  [N-4s, N-4s-1, 4s+1, 4s+2]   rotations: [180, 180, 0, 0]
 *   Back:   [4s+3, 4s+4, N-4s-2, N-4s-3]  rotations: [0, 0, 180, 180]
 *
 * Grid is 2 columns × 2 rows. Reading order after double-fold:
 * outer-spread top-right = page 1, outer-spread top-left = back cover.
 */
function calculateFourUpBooklet(
  totalSourcePages: number,
  config: ImpositionConfig
): ImpositionResult {
  const totalPages = padToMultiple(Math.max(totalSourcePages, 8), 8);
  const numSheets = totalPages / 8;

  const { sheetW, sheetH } = sheetDimensions(config.paperSize, config.orientation);
  const pageOrBlank = (p: number) => (p <= totalSourcePages ? p : 0);

  const sheets: SheetDefinition[] = [];

  for (let s = 0; s < numSheets; s++) {
    const N = totalPages;
    const base = s * 4; // 0-based offset within this 8-page signature

    // Front side: outer two pages (rotated) then inner two pages
    const frontPages = [
      pageOrBlank(N - base),
      pageOrBlank(N - base - 1),
      pageOrBlank(base + 1),
      pageOrBlank(base + 2),
    ];
    const frontRotations = [180, 180, 0, 0];

    // Back side: inner continuation then outer pages (rotated)
    const backPages = [
      pageOrBlank(base + 3),
      pageOrBlank(base + 4),
      pageOrBlank(N - base - 2),
      pageOrBlank(N - base - 3),
    ];
    const backRotations = [0, 0, 180, 180];

    sheets.push({
      sheetNumber: s + 1,
      front: buildGrid(frontPages, 2, 2, sheetW, sheetH, config.marginMm, config.gutterMm, "front", frontRotations),
      back:  buildGrid(backPages,  2, 2, sheetW, sheetH, config.marginMm, config.gutterMm, "back",  backRotations),
    });
  }

  return makeResult(sheets, totalSourcePages, totalPages);
}

// ---------------------------------------------------------------------------
// Layout 5: N-up Gang Run
// ---------------------------------------------------------------------------

/** Predefined grid layouts for standard N-up values. */
const GANG_RUN_GRIDS: Record<number, [number, number]> = {
  2: [1, 2],
  4: [2, 2],
  6: [2, 3],
  8: [2, 4],
  9: [3, 3],
};

/**
 * N copies of a single page repeated across the sheet (gang run / nesting).
 * All copies show the same source page. Useful for cutting multiple identical
 * items from one sheet (e.g. business cards, stickers).
 *
 * config.nUp controls how many copies per sheet (2, 4, 6, 8, or 9).
 * Falls back to 2 if the value is not recognised.
 */
function calculateGangRun(
  totalSourcePages: number,
  config: ImpositionConfig
): ImpositionResult {
  const nUp = config.nUp && GANG_RUN_GRIDS[config.nUp] ? config.nUp : 2;
  const [rows, cols] = GANG_RUN_GRIDS[nUp]!;

  const { sheetW, sheetH } = sheetDimensions(config.paperSize, config.orientation);

  // For gang runs we repeat the same page nUp times on every sheet.
  // One sheet per source page — or just page 1 if source has only one page.
  const numSourcePages = Math.max(totalSourcePages, 1);
  const sheets: SheetDefinition[] = [];

  for (let s = 0; s < numSourcePages; s++) {
    const srcPage = s + 1;
    const frontPages = Array(nUp).fill(srcPage) as number[];
    // Back uses the next page if available, otherwise repeats the same.
    const backSrcPage = s + 1 <= totalSourcePages ? srcPage : 0;
    const backPages = Array(nUp).fill(backSrcPage) as number[];

    sheets.push({
      sheetNumber: s + 1,
      front: buildGrid(frontPages, rows, cols, sheetW, sheetH, config.marginMm, config.gutterMm, "front"),
      back:  buildGrid(backPages,  rows, cols, sheetW, sheetH, config.marginMm, config.gutterMm, "back"),
    });
  }

  return {
    sheets,
    totalSheets: sheets.length,
    totalPages: numSourcePages,
    pagesUsed: numSourcePages,
    blanksAdded: 0,
  };
}

// ---------------------------------------------------------------------------
// Layout 6: Custom N-up
// ---------------------------------------------------------------------------

/**
 * User-specified rows × columns grid. Pages flow sequentially left-to-right,
 * top-to-bottom across all sheet fronts, then all sheet backs.
 *
 * config.customGrid = [rows, cols] — required for this layout.
 * Falls back to [2, 2] if not provided.
 */
function calculateCustomNUp(
  totalSourcePages: number,
  config: ImpositionConfig
): ImpositionResult {
  const [rows, cols] = config.customGrid ?? [2, 2];
  const cellsPerSide = rows * cols;
  const cellsPerSheet = cellsPerSide * 2; // front + back

  const { sheetW, sheetH } = sheetDimensions(config.paperSize, config.orientation);

  const totalPadded = padToMultiple(Math.max(totalSourcePages, cellsPerSheet), cellsPerSheet);
  const numSheets = totalPadded / cellsPerSheet;
  const pageOrBlank = (p: number) => (p <= totalSourcePages ? p : 0);

  const sheets: SheetDefinition[] = [];

  for (let s = 0; s < numSheets; s++) {
    const frontStart = s * cellsPerSheet + 1;
    const backStart  = frontStart + cellsPerSide;

    const frontPages: number[] = [];
    for (let i = 0; i < cellsPerSide; i++) {
      frontPages.push(pageOrBlank(frontStart + i));
    }

    const backPages: number[] = [];
    for (let i = 0; i < cellsPerSide; i++) {
      backPages.push(pageOrBlank(backStart + i));
    }

    sheets.push({
      sheetNumber: s + 1,
      front: buildGrid(frontPages, rows, cols, sheetW, sheetH, config.marginMm, config.gutterMm, "front"),
      back:  buildGrid(backPages,  rows, cols, sheetW, sheetH, config.marginMm, config.gutterMm, "back"),
    });
  }

  return makeResult(sheets, totalSourcePages, totalPadded);
}

// ---------------------------------------------------------------------------
// Duplex tumble post-processing
// ---------------------------------------------------------------------------

/**
 * Apply tumble (short-edge) rotation to all back-side placements.
 * Adds 180° (mod 360) to every back placement's rotation.
 * This compensates for the sheet being flipped upside-down during tumble duplex.
 */
function applyTumbleRotation(result: ImpositionResult): ImpositionResult {
  for (const sheet of result.sheets) {
    for (const p of sheet.back) {
      p.rotation = (p.rotation + 180) % 360;
    }
  }
  return result;
}

/** Layouts that support duplex direction (have fold geometry). */
export const DUPLEX_AWARE_LAYOUTS = new Set(["saddle-stitch", "perfect-bind", "four-up-booklet"]);

/**
 * Wrap a layout calculate function to apply tumble rotation when short-edge duplex is selected.
 */
function withDuplexPostProcess(
  calculateFn: (totalSourcePages: number, config: ImpositionConfig) => ImpositionResult,
  layoutId: string,
): (totalSourcePages: number, config: ImpositionConfig) => ImpositionResult {
  return (totalSourcePages, config) => {
    const result = calculateFn(totalSourcePages, config);
    if (config.duplexFlip === "short-edge" && DUPLEX_AWARE_LAYOUTS.has(layoutId)) {
      return applyTumbleRotation(result);
    }
    return result;
  };
}

// ---------------------------------------------------------------------------
// Layout registry
// ---------------------------------------------------------------------------

export const IMPOSITION_LAYOUTS: ImpositionLayout[] = [
  {
    id: "saddle-stitch",
    name: "2-up Saddle Stitch",
    description:
      "Pages reordered so the sheet can be folded in half and stapled at the spine. " +
      "The outermost sheet carries the cover (page 1) and back cover (page N).",
    useCase: "Booklets, magazines, zines, programmes",
    pagesPerSheet: 4,
    calculate: withDuplexPostProcess(calculateSaddleStitch, "saddle-stitch"),
  },
  {
    id: "perfect-bind",
    name: "2-up Perfect Bind",
    description:
      "Pages in sequential pairs, front then back. Sheets are stacked, trimmed, " +
      "and glued at the spine. No page reordering is required.",
    useCase: "Paperback books, catalogues, perfect-bound booklets",
    pagesPerSheet: 4,
    calculate: withDuplexPostProcess(calculatePerfectBind, "perfect-bind"),
  },
  {
    id: "step-and-repeat",
    name: "2-up Step & Repeat",
    description:
      "The same page (or pair of pages for duplex) is duplicated side by side on " +
      "every sheet. Cut to yield two identical copies per sheet.",
    useCase: "Flyers, postcards, invitations, business cards",
    pagesPerSheet: 2,
    calculate: calculateStepAndRepeat,
  },
  {
    id: "four-up-booklet",
    name: "4-up Booklet (Quarter Fold)",
    description:
      "Four quarter-size pages per side arranged for a double fold. The sheet is " +
      "folded long-edge then short-edge to produce a small booklet.",
    useCase: "Pocket booklets, pamphlets, menus",
    pagesPerSheet: 8,
    calculate: withDuplexPostProcess(calculateFourUpBooklet, "four-up-booklet"),
  },
  {
    id: "gang-run",
    name: "N-up Gang Run",
    description:
      "Multiple identical copies of a single page nested on one sheet. " +
      "Supports 2, 4, 6, 8, and 9 copies per sheet. Set config.nUp accordingly.",
    useCase: "Stickers, business cards, labels, short-run items",
    pagesPerSheet: 2, // minimum; actual value depends on nUp setting
    calculate: calculateGangRun,
  },
  {
    id: "custom-nup",
    name: "Custom N-up",
    description:
      "Pages flow sequentially through a user-defined rows × columns grid. " +
      "Set config.customGrid = [rows, cols] to control the layout.",
    useCase: "Thumbnails, proof sheets, custom print layouts",
    pagesPerSheet: 4, // default 2×2; actual value depends on customGrid
    calculate: calculateCustomNUp,
  },
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

export function getLayoutById(id: string): ImpositionLayout | undefined {
  return IMPOSITION_LAYOUTS.find((l) => l.id === id);
}

/**
 * For each placement, determine which edges face the sheet margin (outer)
 * vs an adjacent cell across a gutter (inner). Crop mark arms should only
 * be drawn on outer edges to avoid confusing convergence in gutters.
 */
export function getOuterEdges(placements: PagePlacement[]): {
  left: boolean; right: boolean; top: boolean; bottom: boolean;
}[] {
  if (placements.length === 0) return [];
  const eps = 0.5;
  const minX = Math.min(...placements.map((p) => p.x));
  const maxX = Math.max(...placements.map((p) => p.x + p.width));
  const minY = Math.min(...placements.map((p) => p.y));
  const maxY = Math.max(...placements.map((p) => p.y + p.height));

  return placements.map((p) => ({
    left:   Math.abs(p.x - minX) < eps,
    right:  Math.abs(p.x + p.width - maxX) < eps,
    top:    Math.abs(p.y - minY) < eps,
    bottom: Math.abs(p.y + p.height - maxY) < eps,
  }));
}
