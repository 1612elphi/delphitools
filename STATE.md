# Substrata — STATE (current lay of the land)

Snapshot of the `delphitools-editor` branch for the Substrata editor. Companion
to `SPEC.md` (canonical spec) and `BUILD-PLAN.md` (milestone task breakdown).
This file = what actually exists in the code right now.

**Status:** M0 scaffold + M1 core + the full UI cockpit are complete. The **modals
pass is largely done** — Layers, Inspector, Colour (7-mode picker incl. the spectral
EQ), and Arrange are real modules; Export + Canvas size are blocking modals. **Only
FX (Effects) is left, deferred** to the M3 render engine.

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

**Modules & modals**
- **Layers** — drag-reorder (dnd-kit), show/hide (candy-stripe hidden rows), lock,
  select, live thumbnail, selected-arrow marker; pinned footer with blend/opacity for
  the active layer + Upload / Group(disabled) / Duplicate / Toss. Group + nested
  group rows / tree-elbows / nested drag deferred (multi-select, M2).
- **Inspector** — selected layer's transform (X/Y/W/H/∠/scale with field maths:
  `+100`,`*1.5`,…) + a pinned blend/opacity action-bar; **no selection → canvas/scene
  info** (dims, resolution, layers, storage) + a "Canvas size…" button.
- **Colour** — 7 picker modes over one HSV-internal current-colour store: hue cube ·
  HSV triangle · RGB/HSL sliders · swatches wall · prism · **spectral EQ** · shade.
  Shared footer swatch/hex/eyedropper (uses `components/colour-field`); the omnibar
  trigger shows the live colour. **No fill sink yet** (nothing consumes the colour → M4).
- **Arrange** (merged Align + Rotate) — align-to-artboard (6) + rotate 90°/flip;
  distribute shown disabled (multi-select, M2).
- **Export modal** — shell (format/scale/quality UI; Export is a no-op stub → M6).
  **Canvas size modal** — functional: dimension presets + W/H/resolution/background
  (+ transparent) committed via `setArtboard` (undoable). Both are blocking Radix
  dialogs (`ModalHost` + `lib/substrata/modal`), NOT dock modules.
- **Transparency** — a null artboard background renders a theme-aware **checkerboard
  Pattern** in artboard space (pans/zooms; layers composite over it).

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
- `sync.ts` — one-way doc→Fabric **reconciler**; artboard (+ transparency checker
  Pattern) + raster layers, clipPath, layer↔object id map (`getLayerIdForObject`).
- `layer-ops.ts` — doc mutations via `update()`: visibility, lock, transform,
  opacity (transient-aware), blend, **duplicate / delete / reorder** (all undoable).
- `artboard-ops.ts` — `setArtboard(patch)` (Canvas size modal; undoable).
- `effects.ts` — effect registry (drop-shadow/glow/stroke/overlay → inner/outer phase).

**Assets + persistence**
- `raster-cache.ts` — in-memory hash→`<canvas>` cache + `sha256Hex`.
- `import-raster.ts` — decode/clamp/cache/append-layer (drop/paste).
- `blobs.ts` — Dexie blob persist/hydrate (opt-in gated).
- `db.ts` — Dexie schema v1 (projects/blobs/handles/snapshots).
- `autosave.ts` — save/restore/persistAll/clearPersistedData (opt-in gated).
- `persistence-pref.ts` — opt-in flag (off by default, purge on disable).

**UI state**
- `selection.ts` — active layer (SINGLE-select). `tool.ts` — active tool.
  `viewport.ts` — zoom bridge + cycle. `dock-pref.ts` — omnibar edge, rail edge,
  per-module dock target. `pin-pref.ts` — open (pinned) modules (`MODULE_IDS`:
  effects/layers/inspector/colour/arrange). `toast.ts` — status toasts.
  `modal.ts` — which blocking modal is open (export/canvas-size).
- `layout-storage.ts` — localStorage persistence for dock/rail/pin layout (not
  gated on the opt-in; UI ergonomics, not document content).

**Colour maths (pure)**
- `colour-convert.ts` (sRGB↔OKLCH + hex), `colour-hsv.ts` (HSV/HSL↔sRGB),
  `colour-prism.ts` (wavelength→sRGB), `colour-spectrum.ts` (**SPD→sRGB** via the
  CIE 1931 Wyman analytic CMF — the spectral-EQ engine), `colour-store.ts` (the
  current-colour store, HSV-internal). `lib/colour-names.ts` (repo) — nearest name.

**Capability / GPU**
- `capabilities.ts` — secure-context/feature detection. `webgl-limits.ts`,
  `filter-backend.ts` — WebGL guard rails.

**Components (`components/substrata/*`)**
- `substrata-shell.tsx` — top bar · [left sidebar · canvas+omnibar · right sidebar].
- `fabric-canvas.tsx` — Fabric mount, reconcile loop, MOVE, viewport, restore/autosave
  (the single ssr:false boundary — Fabric imported ONLY here + sync/filter-backend).
- `top-bar.tsx` — §7 bar + all four menus + Workspace wiring.
- `omnibar/omnibar.tsx` · `omnibar/rail.tsx` · `omnibar/modules.tsx` (registry +
  `ModuleBox` variants bloom/rail/dock) · `sidebar.tsx`.
- `modules/layers-panel.tsx` (drag-reorder + footer), `modules/inspector-panel.tsx`
  (exports `BLEND_OPTIONS`), `modules/arrange-panel.tsx`.
- `modules/colour-panel.tsx` (tabbed shell + hue cube + footer) · `modules/
  colour-picker-kit.tsx` (shared `usePointerArea`/`Knob`) · `modules/colour-modes/*`
  (triangle · sliders · swatches · prism · spectrum · shade).
- `modal-host.tsx` + `modals/{export,canvas-size}-modal.tsx` (blocking dialogs).
- `components/colour-field.tsx` (repo root) — shared `ColourSwatchCell` +
  `DeferredHexInput` + `useDeferredInput`/`normalizeHex`; reused by the colour modal
  footer, the Canvas size modal, AND `components/tools/gradient-genny.tsx` (DRY).
- `toast-slot.tsx` · `persistence-toggle.tsx` · `secure-context-notice.tsx` (unmounted stub).
- `app/editor/{layout,page}.tsx` — route (server layout w/ metadata + client page).
- `hooks/use-editor-shortcuts.ts` — undo/redo keymap.

---

## Stubs / placeholders (what's NOT done)

- **Selection is SINGLE-SELECT only** (`selection.ts` holds one active layer id).
  Multi-select is **M2**. Everything that needs a multi-selection is therefore
  deferred / shown disabled: **Arrange ▸ Distribute**, **Layers ▸ Group**, and any
  range/shift-click selection or multi-layer op. Build single-select paths only and
  flag multi-select bits in-code.
- **Module contents**: Layers · Inspector · Colour · Arrange are real; **Effects**
  renders a placeholder → deferred (needs the M3 render engine). Export + Canvas
  size are **blocking modals** now (Canvas size functional, Export a shell → M6).
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

## Mockups / visual source of truth (`sketches/*.html`)

Static HTML+JS prototypes in **`sketches/`** (gitignored — present in the working
tree). They are the **canonical look + interaction** for each surface; read the
relevant one before (re)building a panel and match it (dense / flush / square /
hairline, iA Writer Quattro, cream-green-amber). Open them in a browser to see them
live. What each covers:

- **`backdrop-sketch.html`** — the whole editor: header, omnibar tool cockpit +
  rulers, workspace/artboard with selection handles + smart guides, and the right
  column (Inspector: seltype · Transform grid · Appearance · Adjust · Cutout · +
  Layers · status bar). The master layout reference.
- **`mockup.html`** — earlier full-app mockup (chrome / catalogue framing).
- **`modals.html`** — the three "designed-for-real" cards: **Effects** stack
  (single-open accordion — the FX build target), **Layers** panel (tree elbows,
  candy-stripe, blend/opacity footer, Upload/group/dupe/toss), **Colour** picker.
- **`omnibar.html`** — omnibar detail (tool stacks, hover-fans, docking).
- **`pickers.html`** — BASIC colour pickers: hue cube (SV + hue), HSV triangle,
  RGB sliders.
- **`pickers-fun.html`** — FUN colour pickers: swatches wall, prism (WATTS/NTU),
  shade reel. (Prism maths ported to `colour-prism.ts`.)

Copy in the sketches is illustrative; real strings stay `∑CG` (see Conventions).

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

1. **FX (Effects)** — the last panel of the modals pass. Single-open accordion per
   `sketches/modals.html`, wired to the layer's `effects[]` array (add / reorder /
   toggle / remove / params) using `effects.ts` registry. Structural only for now —
   the per-pixel render is the **M3** engine, so params won't move pixels yet.
2. **M2 (Make)** — **multi-select** (unblocks Arrange ▸ Distribute, Layers ▸ Group,
   range/shift-select, group rows + nested drag), TEXT / PIECES / SELECT tools,
   snapping + guides/rulers/grid (the remaining Workspace stubs).
3. **M3 effects engine**, **M4 colour** (fills for text/shapes — the colour picker's
   missing sink), **M5 persist** (project mgr + `.substrata`), **M6 export pipeline**,
   **M7 background removal** — per BUILD-PLAN.
