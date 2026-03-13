# Imposer Preview Redesign — Design Spec

**Date:** 2026-03-13
**Scope:** Sheet preview UI in `components/tools/imposer.tsx` + duplex direction in `lib/imposition.ts`

## Overview

Replace the vertical-scroll list of sheet previews with a paginated stack UI featuring a 3D flip animation, add a blank mode toggle, and add duplex direction support.

## Changes

### 1. Paginated Stack Preview

Replace the `ScrollArea` containing all sheets with a single-sheet-at-a-time view:

- **Stack visual:** The active sheet is shown full-size with 1-2 shadow layers behind it (offset down/right a few pixels, lower opacity) to suggest a stack of sheets.
- **3D flip animation:** Click the sheet or press Space to flip it with a CSS `rotateY(180deg)` transform on the card container. Use `perspective: 1200px` on the parent, `transform-style: preserve-3d` on the container, `backface-visibility: hidden` on both faces, `transition: transform 0.6s ease`. Front face has a cool-tinted cell background (`#e8edf3`), back face has a warm-tinted cell background (`#f0eee8`).
- **Mobile/touch fallback:** The same click-to-flip works on touch. No special handling needed — CSS transforms work on mobile.
- **Navigation:** Left/right arrow buttons flanking dot indicators. Arrow keys work too. Clicking a dot jumps to that sheet. Navigating resets flip to show front side.
- **Dot scalability:** When sheet count exceeds 10, replace dots with a compact "Sheet 3 / 25" label with left/right buttons. Dots are only shown for ≤10 sheets.
- **Boundary behaviour:** Arrow buttons disable (greyed out) at first/last sheet. No wrapping.
- **Keyboard hints:** Small muted text below navigation: `Space or click to flip · ← → to navigate`
- **Sheet label:** "Sheet N — Front" / "Sheet N — Back" shown on the active card, updates on flip.

### 2. Blank Mode

A toggle switch in the summary bar ("Blank mode") that switches from PDF thumbnail rendering to a clean template view:

- Each cell shows: large page number (centred), rotation indicator below it (e.g. "180°", only if non-zero), and cell dimensions in mm (e.g. "97.8 × 139.5 mm") at the bottom of the cell. These are the cell dimensions after margins/gutters, not the full sheet size.
- Cells have a `1.5px dashed #999` border on a `#fafafa` background.
- Crop marks still render (controlled by the existing crop marks toggle).
- Fold lines still render as dashed lines.
- Flipping to the back side in blank mode shows the back-side page numbers, rotations, and dimensions.
- **Default state:** Blank mode is ON when no PDF is loaded. When a PDF is loaded, it defaults to OFF but can be toggled on.
- This replaces the current fallback preview (blue-grey cells with page number badges drawn on canvas when no PDF is loaded). The old canvas-based fallback rendering in `drawSheetSide` for the no-PDF case is removed; blank mode takes over entirely using DOM elements instead of canvas.

### 3. Duplex Direction

Add a duplex flip direction option that controls back-side page rotation.

**UI:** A two-button selector in the configuration sidebar (below orientation, same style as the orientation toggle):
- **Long edge** (default) — standard duplex
- **Short edge** (tumble)

Hidden when the selected layout is step-and-repeat, gang-run, or custom-nup (those are effectively simplex or sequential — no fold geometry that interacts with duplex direction).

**Engine changes (`lib/imposition.ts`):**

Add `duplexFlip: "long-edge" | "short-edge"` to `ImpositionConfig`.

The existing fold-geometry rotations (180° on saddle stitch left-front/right-back, `[180,180,0,0]` on 4-up booklet, etc.) are **correct and must not be changed**. These rotations ensure pages read correctly after folding and are independent of duplex direction.

Duplex direction adds an **additional** rotation to all back-side placements when short-edge (tumble) is selected:
- **Long-edge (default):** No additional rotation. Back-side placements keep their existing fold-geometry rotations.
- **Short-edge (tumble):** All back-side placements get an extra 180° rotation added (modulo 360). This compensates for the sheet being flipped upside-down during tumble duplex. For example, a back placement currently at 0° becomes 180°, and one at 180° becomes 0°.

This extra rotation is applied as a post-processing step after the layout's `calculate` function returns — a single helper function iterates all back-side placements and adds 180° (mod 360) to their rotation. This keeps the layout functions themselves clean and unaware of duplex direction. The post-processing applies to saddle stitch, perfect bind, and 4-up booklet. For perfect bind, where back-side placements currently have 0° rotation, they become 180° under tumble — this is correct and expected. Step-and-repeat, gang-run, and custom-nup are unaffected (duplex selector is hidden for those layouts, and the post-processing is skipped).

**Print guide update:** The print order helper text changes dynamically: "Flip the paper along the **long edge**" or "Flip the paper along the **short edge**" based on the `duplexFlip` setting.

### 4. Summary Bar Update

The summary bar ("12 pages → 3 sheets, duplex") moves above the paginated stack (stays inside the preview area flex column). It gains the blank mode toggle on the right side.

## Implementation Notes

- The paginated stack replaces canvas-based rendering with **DOM-based rendering** for cells when in blank mode. When showing PDF thumbnails, canvas rendering is still used for the page content within each cell, but the cell layout (grid, labels, crop marks) can be DOM.
- The flip animation container needs a fixed aspect ratio matching the sheet's paper size and orientation so the card doesn't resize during flip.

## Files Changed

- `components/tools/imposer.tsx` — Preview UI rewrite (paginated stack, blank mode, duplex selector)
- `lib/imposition.ts` — Add `duplexFlip` to config, apply tumble rotation to back-side placements

## What This Does NOT Change

- Layout selection UI (sidebar radio group) — unchanged
- Configuration panel (paper size, margins, etc.) — unchanged except adding duplex direction
- PDF upload — unchanged
- PDF export — unchanged (uses the layout engine output which now includes duplex rotation)
