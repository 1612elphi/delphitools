# Substrata — STATE (current lay of the land)

Snapshot of the `delphitools-editor` branch for the Substrata editor. Companion
to `SPEC.md` (canonical spec) and `BUILD-PLAN.md` (milestone task breakdown).
This file = what actually exists in the code right now.

**Status:** M0 scaffold + M1 core complete; the full UI cockpit (top bar, omnibar,
rail, sidebars, docking, viewport, toasts) is built. **Next: the modals pass** —
real module contents (Effects accordion, Colour picker, Inspector, Export) to
replace the placeholders.

Route: `/editor` (sidebar-free, static-export, client-only via `dynamic ssr:false`).
Dev: `npm run dev` → http://localhost:3000/editor. Gate: `npm run build` + `tsc --noEmit`.

---

## What works

**Canvas core (M1)**
- Fabric v7 canvas, **doc-model-owns-truth** with a strict one-way doc→Fabric
  reconciler. The artboard clips the view (canvas is the frame); handles draw
  above the clip (`controlsAboveOverlay`) so off-canvas layers stay grabbable.
- Default artboard 2000×1500. Raster import via **drop + paste** (createImageBitmap,
  clamped to the GPU texture cap, content-addressed cache). Object = layer.
- **MOVE**: select/drag/scale/rotate; commits transform on `object:modified`
  (the one controlled Fabric→doc path); two-way selection sync with the panel.
- **Undo/redo**: snapshot history over the immutable doc at the `update()` choke
  point (⌘Z/⌘⇧Z/Ctrl+Y), cap 100.
- **Opt-in persistence**: NOTHING written to the browser until the storage toggle
  is on (Scene menu); Dexie doc + content-addressed blobs, debounced autosave,
  restore-on-load; disabling purges. WebGL guard rails (textureSize clamp,
  context-loss fallback) in place.
- **Viewport**: wheel-pan, ⌘/pinch zoom-to-cursor, space-drag pan (hand cursor),
  fit; zoom % control cycles 100%→fit→last-manual.

**UI cockpit**
- **Top bar (§7)** — Scene/Edit/Workspace/Help menus (Scene file menu + live
  doc inspector; Edit undo/redo + history-list stub + ACXV stub; Workspace fully
  wired; Help), editable-slot scene name + persistence-aware status dot, right
  cluster (status slot, zoom, fit, Export stub, theme).
- **Omnibar (§8)** — floating tool cockpit; 5 tool stacks (MOVE/SELECT/ADJUST/
  TEXT/PIECES) with V/M/A/T/P keys + selected-tool hover-fan; settings zone;
  panel triggers with hover-peek blooms; overflow bar in line.
- **Docking system** — modules peek (hover) or pin; dock target per module
  (**left sidebar / right sidebar / rail**); rail position independent of the
  omnibar (follow ↳ or own edge); omnibar dockable to any edge (T/B/L/R,
  vertical for L/R). All driven by the Workspace menu. Pin/unpin + reflow animate
  (motion `AnimatePresence` + `layout`, reduced-motion respected).
- **Status toasts** — transient confirmations in the top-bar status slot (swaps
  undo/redo out, auto-clears). Wired: canvas-fit, saved, storage-off, image-added.

---

## Architecture

**Single source of truth = the document model.** Fabric is a pure render target.
All edits mutate the doc store; the reconciler re-syncs Fabric. Interactive edits
(MOVE) commit back through exactly one path (`object:modified`).

**Store pattern:** small external stores bound to React via `useSyncExternalStore`
(no state library). Each: module-level state + `subscribe` + getters/actions.
Transient UI state (selection, tool, viewport, dock, pins, toast) is deliberately
NOT in the doc model.

Data flow: `doc-store.update(mutator)` → emit → (a) reconciler renders Fabric,
(b) React panels re-render, (c) history records, (d) autosave debounces (if opt-in).

---

## File map (`lib/substrata/*` unless noted)

**Document + render**
- `doc-model.ts` — ratified schema v1: `SubstrataDoc`/`Artboard`/`Layer` union
  (raster/text/shape/group), `Filter` (inside-only) vs `Effect` (outside-capable),
  `Transform`; factories (`createEmptyDoc`, `createRasterLayer`), `DEFAULT_ARTBOARD`.
- `doc-store.ts` — observable doc + snapshot **history** (undo/redo/canUndo/canRedo).
- `sync.ts` — one-way doc→Fabric **reconciler**; artboard + raster layers, clipPath,
  layer↔object id map (`getLayerIdForObject`).
- `layer-ops.ts` — doc mutations (visibility, transform) via `update()`.
- `effects.ts` — effect registry (drop-shadow/glow/stroke/overlay → inner/outer phase).

**Assets + persistence**
- `raster-cache.ts` — in-memory hash→`<canvas>` cache + `sha256Hex`.
- `import-raster.ts` — decode/clamp/cache/append-layer (drop/paste).
- `blobs.ts` — Dexie blob persist/hydrate (opt-in gated).
- `db.ts` — Dexie schema v1 (projects/blobs/handles/snapshots).
- `autosave.ts` — save/restore/persistAll/clearPersistedData (opt-in gated).
- `persistence-pref.ts` — opt-in flag (off by default, purge on disable).

**UI state**
- `selection.ts` — active layer. `tool.ts` — active tool. `viewport.ts` — zoom
  bridge + cycle. `dock-pref.ts` — omnibar edge, rail edge, per-module dock target.
- `pin-pref.ts` — open (pinned) modules. `toast.ts` — status toasts.
- `capabilities.ts` — secure-context/feature detection. `webgl-limits.ts`,
  `filter-backend.ts` — WebGL guard rails. `colour-convert.ts` (OKLCH),
  `colour-prism.ts` (wavelength) — pure colour maths for the picker.

**Components (`components/substrata/*`)**
- `substrata-shell.tsx` — top bar · [left sidebar · canvas+omnibar · right sidebar].
- `fabric-canvas.tsx` — Fabric mount, reconcile loop, MOVE, viewport, restore/autosave
  (the single ssr:false boundary — Fabric imported ONLY here + sync/filter-backend).
- `top-bar.tsx` — §7 bar + all four menus + Workspace wiring.
- `omnibar/omnibar.tsx` · `omnibar/rail.tsx` · `omnibar/modules.tsx` (registry +
  `ModuleBox` variants bloom/rail/dock) · `sidebar.tsx`.
- `modules/layers-panel.tsx` — real Layers module body (`LayersBody`/`LayersCount`).
- `toast-slot.tsx` · `persistence-toggle.tsx` · `secure-context-notice.tsx` (unmounted stub).
- `app/editor/{layout,page}.tsx` — route (server layout w/ metadata + client page).
- `hooks/use-editor-shortcuts.ts` — undo/redo keymap.

---

## Stubs / placeholders (what's NOT done)

- **Module contents**: only **Layers** is real. Effects / Inspector / Colour /
  Export / Canvas-size / Align / Rotate render a placeholder box → **the modals pass**.
- **Top bar**: file ops (New/Open/Save/…) are no-ops (→ M5/M6); Edit history list
  is a static visual stub (real labelled history later); ACXV keypad no-op; Export
  no-op (→ M6).
- **Workspace**: Guides (Rulers/Grid/Snap) not wired → **M2** (needs canvas overlays
  + the snapping engine). Everything else in Workspace is live.
- **Tools**: only MOVE is behaviourally live; SELECT/TEXT/PIECES/ADJUST set state
  only → **M2/M3**.
- **Copy**: all user-facing strings are `∑CG` (functional chrome labels use the
  mockup's words per Ruby's call; voice-y microcopy + toast text stay `∑CG`).
  Fill via **slopsieve**.
- Rail last-unpin exit skips its animation (rail unmounts to avoid a phantom gap).

---

## Conventions / invariants (do not break)

- Doc model is truth; Fabric never authoritative; one-way sync + single write-back.
- Fabric imported only behind the `ssr:false` boundary (fabric-canvas + sync +
  filter-backend). Never server-eval it (static export).
- No user-facing copy authored — `∑CG` gaps with spec/sample. British spelling.
- Persistence strictly opt-in; secure-context APIs guarded; raster-only export.
- New UI state → an external store bound via `useSyncExternalStore`.
- DRY on root `components/ui/*` shadcn primitives; Lucide icons; parity with
  `sketches/*.html` (gitignored visual source of truth).

---

## Next

1. **Modals pass** — real contents for Effects (single-open accordion, per
   `sketches/modals.html`), Colour (Swatches/Prism/Shade tabs, engines exist in
   `colour-convert`/`colour-prism` + `sketches/pickers-fun.html`), Inspector
   (X/Y/W/H/opacity from selection), Export (format/scale UI; wiring is M6).
2. **M2 (Make)** — TEXT, PIECES, SELECT tools; Inspector live; snapping + guides/
   rulers/grid (the remaining Workspace stubs).
3. **M3 effects engine**, **M4 colour**, **M5 persist (project mgr + .substrata)**,
   **M6 export**, **M7 background removal** — per BUILD-PLAN.
