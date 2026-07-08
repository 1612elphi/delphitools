# Substrata — STATE (current lay of the land)

Snapshot of the `delphitools-editor` branch for the Substrata editor. Companion
to `SPEC.md` (canonical spec) and `BUILD-PLAN.md` (milestone task breakdown).
This file = what actually exists in the code right now.

**Status:** M0 scaffold + M1 core + the full UI cockpit are complete. The **modals
pass is DONE** — Layers, Inspector, Colour (7-mode picker incl. the spectral EQ),
Arrange, and **FX** are real modules; Export + Canvas size are blocking modals.
**The ENTIRE filter story is LIVE (M3 Tier-0 + Tier-1)**: every registry type
renders — Fabric built-ins via filter-factory, seven custom shaders (levels,
threshold, posterise, vignette, duotone, colour balance, film-sim grades) via
filter-shaders — with preview-downscaled slider drags. The film-sim/LUT family
lives in its own **LOOKS module** (sixth module; live-thumbnail gallery) with
**8 authored grades + 8 real film LUTs** (RawTherapee collection, CC BY-SA,
33³ strips + a GPU LUT sampler). **The `effects[]` ENGINE is LIVE too
(M3 effects, 2026-07-05)**: all six registry effects (drop/inner shadow,
outer/inner glow, stroke incl. inner/centre, colour overlay) composite via
Canvas2D inside Fabric's object cache (effect-render + effects-image) —
30 headless pixel checks pass. M3 is CODE-COMPLETE incl. **M3-15
RASTERIZE (2026-07-07)**: context-menu Rasterize bakes shape/freehand/text
into a RasterLayer (same id, one undo step restores the vector) — content
bakes at current scale with flips folded in, angle stays live on the
transform, opacity stays a layer property; text plates bake via an
invisible-shadow bounds inflation (fabric's own mechanism). Unlocks
filters/effects + SELECT cut on every layer kind. 12-check
`.verify-rasterize.mjs` ALL PASS. **PIECES·Primitives is LIVE (M2-7,
2026-07-05)**: the five ratified shapes draw by drag (ShapeLayer schema v2,
shape→Fabric sync, real settings bloom, thumbnails/dims/FX-gating chrome) —
28 headless checks pass. **M6 EXPORT is LIVE (2026-07-06)**: PNG/JPEG/WebP
native + **JXL** (Ruby's call — JXL replaced AVIF upstream; vendored libjxl
WASM in a /public module worker), 1×/2×/3×, artboard/layer-solo scopes,
area-clamp + verify + shrink-retry, live size estimate — 28 headless checks
pass.

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
  TEXT/PIECES) with V/M/A/T/P keys + selected-tool hover-fan; **subtools are
  selectable modes** (Ruby's call): fan icons select + highlight like main
  tools (`tool.ts` `activeSubs`, remembered per stack; head = subs[0], soft
  stack-active look when a fan sub is live), a NON-default subtool pins its fan
  expanded until another tool is picked, re-firing the active tool's key cycles
  its subtools (M2-8 keymap), and the contextual-zone icon/title + SELECT chips
  track the live subtool. **Canonical subtool names (Ruby-authored chrome, used
  as zone title / tooltip / aria):** Move·Crop / Select·Lasso·Wand /
  Adjust (NO subtools — Ruby 2026-07-03: the FILTERS/COLOUR split collapsed
  once both families landed in one filters[] pipeline) / Text (Bezier/pen CUT from v1, Ruby 2026-07-07) /
  Pieces·Primitives·Brush·Pencil;
  **contextual
  settings zone** (Ruby's call: the middle reads the ACTIVE TOOL — icon + name
  + LIVE chips per tool: MOVE = selection X/Y from the doc; SELECT = subtool
  mode settings (marquee touch/cover + group/separate, lasso sensitivity, wand
  tolerance); ADJUST = the layer's stack labels via `fxDisplayLabel`, bloom/pin
  targets the FX module; TEXT = font + size; PIECES = shape. Non-doc chips read
  the new **`tool-settings.ts` store** — defaults now, the M2 tools write it
  later; stub tools peek a placeholder settings bloom (\u2211CG) and aren't pinnable
  until their settings exist); panel triggers with hover-peek blooms; overflow
  bar in line.
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
  trigger shows the live colour. **The SINK is LIVE (M4, 2026-07-06)** —
  `colour-sink.ts`: picked colours flow one-way to (a) the pieces fill setting
  (next draws) and (b) the ACTIVE shape/freehand layer's fill ("select a
  shape, pick a colour, it recolours"); picker drags bracket begin/commit
  transient in `usePointerArea` (ALL seven modes share it) so a drag = ONE
  undo step. v1 calls (doc'd in colour-sink.ts): fill only (vector stroke
  recolours via its Inspector row) · a flat pick REPLACES a gradient fill ·
  text joins in M2. The Inspector grew **Fill + Stroke rows** for shapes
  (fill hidden for lines) and a Fill row for freehand strokes —
  `setFill`/`setShapeStroke` in layer-ops (transient-aware), swatches via the
  shared **`transient-colour.tsx`** (the FX ColourRow's OS-picker
  settle-on-pause/blur/unmount mechanism, extracted; fx-panel now consumes
  it too). Rig: `colour(hex)`; harness `.verify-colour-sink.mjs` (8 checks
  ALL PASS: recolour, one-undo restore, next-draw seeding, no phantom
  history on settings-only picks, freehand).
- **Arrange** (merged Align + Rotate) — align-to-artboard (6) + rotate 90°/flip;
  distribute shown disabled (multi-select, M2).
- **FX** (title "FX", module id `effects`) — holds ALL THREE layer-property
  families (Ruby's call): **filters** = ALL adjustments, colour AND spatial
  (brightness…levels/duotone/blur), in `filters[]`; **colour** = the
  **film-sim/LUT family** (one `film-sim` type, also `filters[]`) picked from
  PRESETS named after film stocks/movies (names = \u2211CG; 8 placeholder looks in
  `FILM_SIM_PRESETS`, swatch gradients are placeholder visuals → real LUT looks
  in M3); effects (shadow/glow/stroke/overlay) in `effects[]`. ONE pipeline,
  two zones (filter chain incl. sims on top, effects below, 4px divider),
  drag-reorder per zone (dnd-kit), single-open accordion across both (grid-rows
  collapse anim, `inert` when closed), Add picker (popover: film-sim **preset
  cards** first, then hairline icon-card grids per type group — home-catalogue
  cell language, NO icon animations per Ruby; icons in panel-side `FX_ICONS`;
  **one-per-type** — ghosts present types / the active preset; picking another
  preset RETARGETS the layer's sim), per-block reset (hidden when disabled) /
  remove / enable switch, params rendered generically from registry ParamSpecs
  (slider/stepper/colour/select/**presets** — the sketch's flush swatch grid;
  film-sim blocks title themselves after their preset). Slider + colour-swatch
  gestures coalesce to ONE undo step via the transient path (gesture boundary
  on the pointer — Radix onValueCommit is unreliable in controlled mode).
  Effect + param labels are conventional graphics terms = functional chrome
  (Ruby's call, BLEND_OPTIONS precedent); voice-y microcopy + preset/category
  names stay \u2211CG. **EVERYTHING in the panel now moves pixels**: Tier-0/Tier-1
  filters via `filter-factory.ts`/`filter-sync.ts`, effects via
  `effect-render.ts`/`effects-image.ts` (below). Drop/inner shadow grew an
  Opacity param (default 35% — the layer-styles convention; a 100% black
  shadow is never what anyone wants).
- **Export modal — LIVE (M6, 2026-07-06)**: format segmented (PNG/JPEG/WebP/
  **JXL** — JXL replaced AVIF per Ruby, mirroring main's image-converter swap;
  disabled sans Worker) · 1×/2×/3× · **scope** Artboard / Layer (solo,
  transparent offscreen; needs a selection; JPEG disabled in layer scope — no
  alpha) · quality slider (lossy only) · Output strip = **clamped** dims +
  debounced **~size estimate** (proxy render + encode, area-scaled) ·
  downscale + failure notices (\u2211CG). Export runs the M6 orchestrator and
  downloads via `lib/download`. Ruby's M6 ratifications: JXL-not-AVIF ·
  **social presets SKIPPED for v1** · batch-zip skipped (SPEC post-v1).
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
- `doc-model.ts` — **SCHEMA_VERSION 2** (the ratified M2-1 shape model, landed
  with PIECES): `SubstrataDoc`/`Artboard`/`Layer` union (raster/text/shape/
  group), `Filter` (inside-only) vs `Effect` (outside-capable), `Transform`;
  ShapeLayer = discriminated **ShapeParams** (rectangle/ellipse/line/polygon/
  star, intrinsic geometry UNSCALED — the transform scales it) + `fill:
  string | Gradient` (stops + relative 0–1 coords) + `stroke: ShapeStroke |
  null`; factories (`createEmptyDoc`, `createRasterLayer`, `createShapeLayer`),
  `DEFAULT_ARTBOARD`. Dexie `version(2)` is a no-op (doc JSON is a stored
  value); `loadLatestProject` forward-stamps v1 docs (they contain no shapes).
  Remaining ratified kinds (full text/path/freehand) land additively in v2.
- `doc-store.ts` — observable doc + snapshot **history** (undo/redo/canUndo/canRedo).
- `sync.ts` — one-way doc→Fabric **reconciler**; artboard (+ transparency checker
  Pattern) + raster layers (as `EffectsImage`, the effect-compositing
  FabricImage subclass) + **shape layers** (Rect/Ellipse/Line/Polygon;
  in-place geometry updates verified against fabric 7.4.0 — Ellipse rx→width,
  Line coord props, Polyline.setDimensions — so drag-to-draw never churns
  objects; gradient fills map to fabric's "percentage" gradientUnits),
  clipPath, layer↔object id map (`getLayerIdForObject`). Shape stroke scales
  with the transform (Fabric default — consistent with "transform scales
  geometry").
- `shape-geometry.ts` (pure) — polygon/star vertex maths (first point up,
  circumradius), `shapeDims` (intrinsic bbox of what renders; line height 0),
  and **`layerDims`** — the ONE dims helper (raster natural size / shape
  geometry / null for text+group) behind Inspector W/H, Arrange align/
  distribute. Snap reads Fabric bboxes, so shapes joined it for free.
- `draw-shape.ts` — drag-to-draw maths + gesture doc-write: what a drag MEANS
  per primitive (rect/ellipse = dragged box, ⇧ square/circle start-anchored ·
  line = start→cursor, ⇧ 45° snap, angle in the transform · polygon/star =
  centre-out radius), `strokeForNewShape` (lines always stroke — fill
  fallback), `upsertLayerTransient` (root-append/replace on the transient
  path), SHAPE_NAMES (standard vocabulary = functional chrome).
- `layer-tree.ts` — pure tree utils over nested layers (find/map/remove/
  leafRenderList/flattenForPanel) + the ratified v1 GROUP SEMANTICS header.
- `layer-ops.ts` — TREE-AWARE doc mutations via `update()`: visibility, lock,
  transform (+ **setTransforms** batch = one undo step), opacity (transient-
  aware), blend, duplicate (deep-clone, groups too), **deleteLayers /
  groupLayers / ungroupLayer / setSiblingOrder** (all undoable).
- `artboard-ops.ts` — `setArtboard(patch)` (Canvas size modal; undoable).
- `guide-ops.ts` — guide mutations (add/setPos/remove, transient-aware) over
  `doc.guides` (`Guide {id, axis:"x"|"y", pos}` — axis "x" = vertical line).
- `param-spec.ts` — shared ParamSpec system (slider/stepper/colour/select +
  `defaultParams`) both FX registries and the panel consume.
- `effects.ts` — effect registry (drop-shadow/glow/stroke/overlay → inner/outer
  phase) + labels + typed ParamSpecs/defaults.
- `filters.ts` — filter registry (SPEC §9 Tier-0/Tier-1; `category:
  "colour" | "filter"` = UI taxonomy only; colour-overlay lives in effects.ts,
  not duplicated). Carries the look DATA beside the registry: **FILM_SIM_PRESETS
  (names AUTHORED by Claude per Ruby's 2026-07-03 grant — the one sanctioned
  no-copy exception; she may rename)** + **FILM_SIM_GRADES** (lift/gamma/gain+
  sat per look, tuned beside its swatch) + **DUOTONE_PAIRS** (8 pairs, names
  still \u2211CG). NOTE: `Filter.params` widened additively to `number | string`
  (Duotone/Vignette colours); SCHEMA_VERSION stays 1.
- `fx-ops.ts` — undoable mutations over BOTH stacks (add/remove/toggle/reset/
  param(transient-aware)/reorder), one-per-type guard, insert-at-top.
- `filter-factory.ts` — **M3-4 (Tier-0) + Tier-1 wiring**: doc-Filter → Fabric
  filter instances, ALL unit scaling centralised here (verified vs installed
  fabric 7.4.0 source; classes live under fabric's `filters` NAMESPACE, only
  backends export flat). **Ruby taste-QA'd 2026-07-02: all Tier-0 types
  approved** (brightness/contrast `/200`, exposure ±2 stops, temperature
  ±0.25 R/B gain, blur `radius / (0.12 × min side)`, kernels). Post-QA adds:
  sharpen/emboss Amount (lerps kernel identity→classic, default 100 = the
  approved look); noise mono/colour Mode. Tier-1 customs get PRE-NORMALISED
  props (0–1, vec3s) built from registry units + FILM_SIM_GRADES lookup.
- `filter-shaders.ts` — **the custom-filter module**: ColourNoise + the seven
  Tier-1 BaseFilter subclasses (SubstrataLevels/Threshold/Posterise/Vignette/
  Duotone/ColourBalance/FilmSim) + **SubstrataLut** (packed-strip 3D LUT:
  hardware bilinear in-slice + manual slice mix ≈ trilinear; strip uploads
  once via the backend texture cache keyed `substrata_<preset>`, binds
  TEXTURE1 — the BlendImage second-texture pattern), each with GLSL fragment +
  `applyTo2d` Canvas2D fallback + isNeutralState. Contract lore
  (source-verified): static `type` MUST be unique per class (WebGL program
  cache keys on it — a duplicate silently reuses another shader);
  uStepW/uStepH auto-sent by BaseFilter; constructor Object.assigns `defaults`
  so instance fields must be `declare`d. Headless pixel-verified to exact
  maths (duotone mid-grey within 1/255 of analytic; colour-balance = 0.3 ×
  4l(1−l) weight exactly). Taste knobs: colour-balance STRENGTH 0.3, vignette
  edge = midpoint×1.42 − feather/2, film-sim grade values (FILM_SIM_GRADES).
- `lut-data.ts` (fabric-free) — the film-LUT shelf: **LUT_LOOKS** (8 stocks:
  Portra 400 · Ektar 100 · Kodachrome 64 · Velvia 50 · Provia 100F · Pro 400H ·
  Polaroid 690 · Tri-X 400 — the collection's informational stock names, not
  authored copy), async strip loader (Image → RGBA table + GPU-ready canvas;
  `lutEpoch`/`subscribeLuts` re-render as strips arrive), CPU trilinear
  `applyLutToImageData` (Canvas2D fallback + thumbnails). Data:
  `public/substrata/luts/*.png` — the **RawTherapee Film Simulation
  Collection (CC BY-SA 4.0**, Pat David/Pavlov Dmitry/Michael Ezra →
  ACKNOWLEDGEMENTS.md) downsampled HaldCLUT → 33³ packed strip (33 slices of
  33×33 = 1089×33, blue picks the slice; ~50 KB each). Converter lived in the
  session scratchpad — trivially re-writable (hald cbrt decode → trilinear
  resample → strip re-pack in headless Chrome).
- `look-ops.ts` — the LOOKS module's thin doc interface (getLook/setLook/
  clearLook/setLookIntensity): a look is STILL the one film-sim entry in
  `filters[]` (zero schema change), pinned to the stack END by fx-ops (grades
  AFTER adjustments — CST-last convention); fx-ops setFxOrder now takes subset
  reorders (unlisted entries sink below the listed — keeps the pin under the
  FX panel's sim-less drag list).
- `effect-render.ts` (fabric-free) — **the M3 effects compositor**: pure
  Canvas2D, paints `effects[]` around the rendered content in the ratified
  order (outer behind → content+filters → inner masked to content alpha →
  opacity/blend at the blit). ONE primitive — the canvas shadow trick (paint
  the source at x−1e5 with shadowOffsetX pulled back: only the tinted/blurred
  silhouette lands; no ctx.filter, Safari-safe, Fabric's own mechanism) —
  composes everything: blur/tint stamps, 24-stamp ring dilation (shadow
  spread, outer stroke) and destination-in erosion (inner/centre stroke),
  carve fields (fill − blurred offset silhouette, masked to content = inner
  shadow/glow). Array order = apply order = paint order (top block deepest,
  the filters convention). Pixel-verified maths: 50 % shadow over white =
  (255,127,127) exact. Taste knobs awaiting Ruby: glow double-stamp curve
  (2a−a²), 35 % shadow default, 24-stamp ring facets at extreme width×zoom.
- `effects-image.ts` — **EffectsImage (the reconciler's image class)**:
  FabricImage subclass hooking the compositor into Fabric's object-cache
  pipeline — `_getCacheCanvasDimensions` pads the cache by `effectsReach` so
  outer effects draw outside the bounds (cacheTranslation centring absorbs
  it; selection bbox stays content-only, artboard clip still crops), and
  `drawObject` renders content to a device-space scratch then lets
  paintEffects composite. Perf rides Fabric's cache: recomposite only when
  dirty (fx edits, zoom), pans re-blit; `_limitCacheSize` bounds cost, so NO
  preview proxy needed. Effect units are SCENE px (effects don't scale with
  the layer — the PS convention; k = cacheZoom/objectScale). Shadow offsets
  are scene-absolute (counter-rotated at bake; an isCacheDirty pose check
  recomposites on rotation/flip changes, so they hold even mid-rotation-drag).
- `filter-sync.ts` — **M3-10**: reconciler-called `syncImageFilters` — per-image
  ENABLED-stack signature diff (cheap no-op per pass), **rAF-coalesced**
  `applyFilters`, **preview downscale** (transient gesture + source >1.5 MP →
  chain runs on a cached proxy handed to Fabric via `_element` +
  `_filterScaling`, own texture cacheKey — the WebGL backend caches source
  textures BY KEY — evicted on settle; `commitTransient` now emits so the
  full-res settle pass has a trigger; `isGestureActive()` exported from
  doc-store). **Stack order semantics (pixel-verified, RATIFIED by Ruby
  2026-07-03): array order = apply order, and fx-ops inserts at 0, so the
  panel's TOP block applies FIRST** (not Photoshop's top-applies-last —
  "most people won't even use two effects at once"). Also home to
  `syncImageEffects` (M3 effects): reference early-out (immutable doc — an
  unchanged stack ref exits before any work) → signature diff → hands the
  enabled stack to the EffectsImage WITH registry defaults merged
  (`defaultParams`, the filter-factory convention — renderer never guesses
  its own) and dirties its cache. No rAF/backend machinery; rotation/flip
  invalidation lives in EffectsImage.isCacheDirty, not here.

**Export (M6)**
- `export-core.ts` (pure) — format metadata (mime/ext/lossy/decodable),
  `resolveExportDims` (AREA budget: iOS 16.7M px sniffed vs 16384² desktop;
  downscale-to-fit + effectiveScale, NO tiling — ponytail: tile+stitch is the
  upgrade path, SPEC allows either), `verifyExportBlob` (SPEC §5 Safari
  silent-blank guard: size + decode-probe for decodable formats; size-only for
  JXL — no browser decodes it), estimate scaling, filename builder.
- `export-encode.ts` — png/jpeg/webp via native `toBlob` (mislabelled-format
  guard on blob.type); **JXL via `public/jxl/jxl-worker.js`** (module worker in
  /public — NEVER bundled, the Turbopack-deadlock lesson; imports the vendored
  `jxl_enc.js` glue relative to itself, ImageData in / bytes out, id-matched
  promises, dead-worker respawn). Options mirror image-converter's encodeJxl.
- `export-source.ts` — fabric-free renderer registry (viewport.ts pattern);
  fabric-canvas registers, orchestrator calls `renderForExport`.
- `sync.ts › renderExport` — fabric-side: `toCanvasElement` aimed at the
  artboard THROUGH the live viewportTransform (crop box is viewport-space,
  multiplier composes with zoom — verified vs installed 7.4.0 source; no vpt
  mutation, controls skipped, live ActiveSelection safe). Solo = hide all
  other leaves (target forced visible, flags INSIDE a soloed group still
  apply); checker never exports (null bg → hidden rect = real alpha; JPEG
  flattens white); everything snapshotted + restored, then requestRenderAll
  (the export-vpt after:render overlay repaint).
- `export-run.ts` — the orchestrator: resolve dims → render → encode →
  verify → shrink-retry (×0.7, ≤2) → `downloadBlob`; `estimateExportBytes`
  (≈0.26 MP proxy render + encode, byte-per-pixel extrapolation). An empty
  transparent artboard sets expectContent=false so verify doesn't false-fail.

**Assets + persistence**
- `raster-cache.ts` — in-memory hash→`<canvas>` cache + `sha256Hex`.
- `import-raster.ts` — decode/clamp/cache/append-layer (drop/paste).
- `blobs.ts` — Dexie blob persist/hydrate (opt-in gated).
- `db.ts` — Dexie schema v1 (projects/blobs/handles/snapshots).
- `autosave.ts` — save/restore/persistAll/clearPersistedData (opt-in gated).
- `persistence-pref.ts` — opt-in flag (off by default, purge on disable).

**UI state**
- `selection.ts` — active layer (SINGLE-select). `tool.ts` — active tool +
  active SUBTOOL per stack (`activeSubs`, remembered; `setActiveSub` selects
  both). `tool-settings.ts` — per-tool settings (move nudge · select mode/
  sensitivity/tolerance · text font/size · pieces shape/fill/stroke/
  corner-sides-star params — the drag-to-draw reads these at draw time) + the SHARED
  **`transformAsGroup`** flag (Ruby: "move is also transform" — MOVE bloom
  toggle + SELECT chips bind to one flag; "Separate" makes multi-selection
  rotate/scale act about each layer's OWN centre via per-frame matrix
  correction in fabric-canvas). **Separate-mode chrome is Affinity-style**
  (Ruby's ask): the ActiveSelection lays out via `AnchorBoxLayout` (box = the
  ANCHOR child, selection-store id[0]) so native border+handles sit on the
  first-selected object; other members get independent overlay boxes
  (calcACoords per frame); toggling Group/Separate rebuilds a live selection.
  Known: anchor = literal first id (canvas shift-click order ≈ canvas
  stacking); corner-scaling drifts the anchor off its box (own-centre
  scaling — centred scaling tracks exactly). Read by the contextual zone,
  written by the tool settings blooms / M2 tools.
  **Fabric coordinate lore (bug-earned):** a grouped object's `aCoords`/
  `calcACoords()` live in the PARENT plane (selection-relative inside an
  ActiveSelection) — compose with the group's `calcTransformMatrix()` before
  treating them as scene coords, or overlays render origin-anchored phantoms.
  Also: the top-context overlay must clear UNCONDITIONALLY each after:render
  (an early return leaves frozen stains). Dev builds expose a
  **`window.__substrata` debug rig** (selection/layers dumps, select,
  setSeparate, + M3: `fx`/`fxParam`/`effect`/`effectParam`/
  `gesture.begin|commit`/`samplePixel`/`elementSizes`/`vt`, + M2-7:
  `setTool`/`toolSettings`) and `.repro-phantom.mjs` + `.verify-effects.mjs`
  + `.verify-pieces.mjs` (all untracked) drive /editor headlessly via
  puppeteer-core (installed --no-save) + local Chrome — reusable for
  canvas-interaction verification (`.verify-effects.mjs` = the effects
  engine's 30-check regression harness — every effect type, opacity maths,
  spread, undo, one-undo-step gestures, stacking isolation;
  `.verify-pieces.mjs` = the primitives' 28-check harness — real mouse-drag
  draws for all five shapes, ⇧ modifiers, corner radius, one-undo-per-draw,
  MOVE round-trip, no-draw-in-MOVE/no-layer-on-click; NOTE it deselects
  before sampling — selection handles render on the LOWER canvas at rest and
  land under edge-adjacent pixels).
  `viewport.ts` — zoom bridge + cycle. `dock-pref.ts` — omnibar edge, rail edge,
  per-module dock target. `pin-pref.ts` — open (pinned) modules (`MODULE_IDS`:
  effects/layers/inspector/colour/arrange). `toast.ts` — status toasts.
  `modal.ts` — which blocking modal is open (export/canvas-size).
- `layout-storage.ts` — localStorage persistence for dock/rail/pin layout (not
  gated on the opt-in; UI ergonomics, not document content).
- `guides-pref.ts` — rulers/grid/snap toggles + `GRID_SIZE` (localStorage, same
  rationale). `snap-engine.ts` — pure snap maths (field build + computeSnap).

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
  (exports `BLEND_OPTIONS`), `modules/arrange-panel.tsx`, `modules/fx-panel.tsx`
  (the FX pipeline module; exports `FxBody`/`FxSub`; film-sim EXCLUDED — it
  filters the visible list and its picker lost the preset cards),
  `modules/looks-panel.tsx` (the LOOKS gallery: live thumbnails — the layer's
  cover-cropped raster through every grade/LUT via the pure CPU paths — slim
  None row, 2×8 card grid, pinned Intensity slider with the FX transient
  gesture; bloom-capped `max-h min(560px, 100vh−140px)`; module TITLE is a
  \u2211CG gap — Ruby's unnamed category).
- `modules/colour-panel.tsx` (tabbed shell + hue cube + footer) · `modules/
  colour-picker-kit.tsx` (shared `usePointerArea`/`Knob`) · `modules/colour-modes/*`
  (triangle · sliders · swatches · prism · spectrum · shade).
- `modal-host.tsx` + `modals/{export,canvas-size}-modal.tsx` (blocking dialogs).
- `components/colour-field.tsx` (repo root) — shared `ColourSwatchCell` +
  `DeferredHexInput` + `useDeferredInput`/`normalizeHex`; reused by the colour modal
  footer, the Canvas size modal, AND `components/tools/gradient-genny.tsx` (DRY).
- `toast-slot.tsx` · `persistence-toggle.tsx` · `secure-context-notice.tsx` (unmounted stub).
- `app/editor/{layout,page}.tsx` — route (server layout w/ metadata + client page).
- `hooks/use-editor-shortcuts.ts` — keymap: undo/redo, arrow nudge (MOVE-gated),
  Backspace/Delete = delete selected layers (same path as the panel footer).
- `lib/substrata/context-menu.ts` + `components/substrata/layer-context-menu.tsx`
  — **right-click layer menu (Ruby 2026-07-03)**: ONE menu instance (shell-
  mounted, Popover + virtual point anchor — portal/Escape/outside-dismiss/
  collision-flip free, no new dep), opened by BOTH surfaces: the canvas via
  **Fabric's own `contextmenu` canvas event** (a wrap DOM listener never
  receives it — bind `canvas.on("contextmenu")`, it hands over the hit target)
  and layers-panel rows. Hit inside the selection keeps it (menu acts on all);
  other layers become the selection; native menu suppressed. LAYER items
  (standard-vocabulary chrome): Duplicate · Group/Ungroup (panel-footer
  same-sibling rule) · Bring to Front/Forward / Send Backward/to Back
  (`reorderLayers` in layer-ops — block-aware stepping, subset-safe, one undo
  step; `parentIdOf` added to layer-tree) · Hide/Show · Lock/Unlock · Delete.
  **Blank space opens the CANVAS menu** (kind:"canvas" carries the scene
  point): Paste (`importClipboardImage` — async clipboard, lands AT the
  pointer, pixel-verified ≤1px; empty clipboard → "paste-empty" toast \u2211CG) ·
  Place Image… (file picker → `importImageFile({at})`) · Select All
  (effectively visible+unlocked leaves) · Zoom to Fit/100% (viewport) ·
  Grid/Snap check-toggles (stay open, guides-pref) · Canvas Size… (modal).
  `importImageFile` grew an `{at}` placement option. Dev rig grew
  `menuState`/`hitTest`.

---

## Stubs / placeholders (what's NOT done)

- **Multi-select is LIVE (M2 pass)** — `selection.ts` holds an ORDERED id list
  (last = primary; `getActiveLayerId()` unchanged for single-layer surfaces) +
  shift-range anchor. Canvas: Fabric `selection: true` (shift-click + rubber-
  band), doc↔canvas sync with an echo-squelch; ActiveSelection commits DISCARD
  first (Fabric bakes absolute coords; flips unfold from negative scale), then
  `setTransforms` (ONE undo step), then rebuild; the render loop ALSO tears a
  live ActiveSelection down before reconciling (children hold selection-
  relative coords — reconcile must never write into them). **Groups are LIVE
  as folders** (`layer-tree.ts` semantics: group transform stays identity;
  children scene-absolute; visibility/lock compose EFFECTIVELY; **group OPACITY
  composes multiplicatively down the tree (2026-07-07)** — leafRenderList
  entries carry effective opacity like visibility, reconciler applies it,
  footer opacity live for group primaries (per-leaf approximation: overlapping
  children show through — isolated compositing is the upgrade); group
  blend/fx stay deferred, footer-disabled). 10-check `.verify-layers-tree.mjs`
  ALL PASS. Layers panel:
  ⌘/ctrl-toggle + shift-range over visible rows, group rows (folder thumb ·
  bold name · collapse chevron in the lock slot · \u2211CG placeholder for unnamed),
  tree-elbow gutters, **cross-parent drag LIVE (2026-07-07)** — rows move between
  sibling lists (into/out of groups; drop on a collapsed group appends into
  it; flattened-neighbour parent-resolution rule doc'd in-code; a group can
  never enter its own subtree) via `moveLayer(id, parent, index)` in
  layer-ops, ONE undo step;
  Group/Ungroup + delete-selection + **duplicate-selection** footer (copies
  nudge +24 — group copies nudge their leaves — and become the selection, one
  undo step). Arrange: align/rotate/flip act on ALL selected leaves,
  root-composed effective flags filter out hidden/locked leaves everywhere
  (canvas + Arrange); **Distribute enabled** (≥3, spreads centres). Inspector
  shows a ×N marker (fields edit the primary); a GROUP primary gets a
  read-only identity + member count (no transform/blend fields — v1 group
  semantics). Tree elbows carry ancestor trails (correct at any depth).
  Reviewed by two subagents; all confirmed findings fixed. Known v1 limits
  (in-code):
  skew from scaling mixed-rotation selections is dropped on commit; canvas
  clicks select leaves (group selection via panel); only raster leaves have
  dims for align/distribute.
- **Module contents**: all six modules (Layers · FX · Inspector · Colour ·
  LOOKS · Arrange) are real. **FX: EVERYTHING renders** — every filter (Tier-0
  built-ins + the seven Tier-1 customs; Tier-0 taste-QA'd by Ruby, Tier-1
  grades/knobs await her eyes) AND every effect (M3 effects engine,
  2026-07-05; taste knobs — glow intensity curve, 35 % shadow default, stroke
  ring quality — await her eyes too). NOTHING in the FX panel is pixel-less
  any more.
  Panel niceties: paramless blocks (invert/greyscale/sepia/edge-detect) have
  no chevron/reset; duotone has the M3-9 preset-pair grid (pairs QUICK-SET
  both colours via `setFxParams`, one undo step; active pair is DERIVED from
  matching colours). Preview-downscale approximations (fine for a drag
  preview): pixelate/convolute kernels are absolute-px so they read slightly
  different at proxy scale; blur is relative so it matches. Export +
  Canvas size are **blocking modals** (Canvas size functional, Export a shell → M6).
- **Top bar**: **file ops are LIVE (M5, 2026-07-07)** — New scene (confirm
  \u2211CG when work would be lost) / Open… / Save (⌘S, re-saves into the held
  FS-Access handle) / Save a copy… (⇧⌘S) over the **`.substrata` format**
  (`substrata-file.ts`: fflate STORE zip of manifest.json + blobs/<sha256>
  PNGs, hash-verified on open, forward-stamped via the shared
  `stampLoadedDoc`); delivered by **browser-fs-access** (ratified dep;
  picker on Chromium, download/input fallback). Open adopts the scene into
  opted-in storage (persistAll). Autosave now also writes **recovery
  snapshots** (retention 20, same debounce; no UI yet — ponytail). "Open
  recent" stays a stub (project manager = SPEC post-v1 Should). Edit history
  list is a static visual stub; ACXV keypad no-op. **Export is LIVE**
  (button + Scene menu open the working Export modal). 9-check harness
  `.verify-persist.mjs` ALL PASS (pack/unpack round-trip incl. rasters,
  symbol, guide, fresh history).
- **Workspace**: Guides row — **Grid + Snap are LIVE** (M2-12): `guides-pref.ts`
  store (localStorage, snap defaults on), pure `snap-engine.ts` (artboard
  edges/centre + sibling bbox edges/centres + grid pitch `GRID_SIZE` 50,
  6-screen-px threshold ÷ zoom, unrotated-bbox approximation), wired to
  `object:moving` with primary-coloured smart-guide lines + a 12%-alpha grid
  drawn on the top context. **RULERS + GUIDES are LIVE
  (2026-07-07)**: 22px cream ruler bands per the backdrop sketch (scene-unit
  ticks via nice 1/2/5 steps, 9px Quattro major labels, corner box), drawn at
  the END of the after:render overlay pass; **drag-out guidelines** = doc
  content (`doc.guides`, additive in v2, undoable + autosaved) — drag from a
  ruler creates one (any tool; a capture-phase pointerdown on the wrap claims
  the gesture before Fabric sees it), MOVE-tool drag moves it (transient =
  ONE undo step), drop on a ruler deletes, guides join the snap field (green
  solid lines; smart guides stay red dashed). New `guides` VISIBILITY toggle
  in Workspace ▸ Guides (guides-pref; rulers now default ON). 18-check
  harness `.verify-guides.mjs` ALL PASS. Everything else in Workspace is
  live. Snap thresholds/feel + grid pitch await Ruby's QA.
- **Tools**: MOVE, **SELECT (all three subs)**, **PIECES·Primitives**,
  **PIECES·Brush/Pencil**, and **TEXT·Text** are behaviourally live; ADJUST +
  TEXT·Bezier set state only. **SELECT is LIVE (M2-10, 2026-07-07, Ruby's
  ratifications)**: Marquee · Lasso (magnetic = a lasso OPTION: per-gesture
  Sobel field + greedy edge snap, radius 4–20px by sensitivity) · Wand
  (contiguous scanline flood / "Global" = superflood colour-select; both
  sample the ACTIVE layer's solo render via the M6 renderExport path,
  tolerance = max per-channel RGBA Δ). Pixel mask = transient store
  (`pixel-selection.ts`, scene-space Uint8Array at artboard res, NOT doc) +
  pure maths in `select-mask.ts` (rect/polygon/flood/global/morphology 16-facet
  ring stamps/marching-squares traceOutline/sobel) + ops in `select-ops.ts`.
  **Contextual popup** (`selection-popup.tsx`, shell-mounted, anchored by the
  canvas per frame): extract (DEFAULT, also Enter) · cut · invert · grow ·
  shrink · deselect (also Escape); extract/cut gate on a raster active layer
  (\u2211CG-free: standard vocabulary chrome). **Extract** bakes the masked crop
  layer-space (source resolution preserved, filters/effects deep-copied,
  lands pixel-exact via centre-offset transform maths) → new content-addressed
  raster inserted above the source, ONE update(). **Cut** additionally bakes a
  destination-out hole into a NEW hash for the source — same single update()
  = one undo step; the reconciler now REBUILDS a fabric image when its layer's
  blobHash repoints (the immutable-per-layer assumption died with cut).
  Gestures are claimed at DOM CAPTURE phase (the guides pattern — Fabric's
  mousedown-on-empty would discard the active object the wand/extract need;
  pixel selections never disturb layer selection, PS semantics). Marching
  ants: cached Path2D outline, white underlay + crawling black dash on the
  overlay, 100ms phase timer only while a selection exists. Selection clears
  on tool-leave/artboard-resize/Escape. Lasso/wand settings blooms (magnetic
  switch + sensitivity, contiguous/global + tolerance); marquee keeps the
  placeholder (feather/combine are post-v1). v1 ceilings (`ponytail:` in
  code): binary mask (no AA/feather) · no ⇧/⌥ boolean combine · wand samples
  the active layer only · extract clips to the artboard · greedy magnetic
  (live-wire is the upgrade). **Adversarial review (9 confirmed, all fixed
  2026-07-07)**: rectMask clamps both ways (a gutter drag used to select the
  whole artboard via TypedArray negative-end fill) · extract/cut serialize on
  a bake-in-flight gate AND revalidate the source's blobHash+transform after
  the awaits (undo-mid-bake committed stale-pose cuts) · wand seeds are
  unrounded (round shifted right/bottom-half clicks a pixel; edge clicks
  silently deselected) · renderExport renders under an identity vpt so output
  dims are the exact artboard×scale product (float floor shorted the mask
  domain) · mid-drag tool switch kills drafts · ant timer resumes on remount ·
  mask invalidates on doc-identity change (survives undo/redo) · popup anchor
  clamps the top edge. 23-check harness `.verify-select.mjs` ALL PASS (incl.
  magnetic edge-hug, gutter-drag regression, cut hole punch + undo restore,
  popup gating). **TEXT (M2, 2026-07-06, Ruby's ratifications)**: fonts =
  **Sans/Serif/Mono system STACKS + FontFace upload** (her call — NO bundled
  woff2, so no fonts.ready gating; uploads are session-scoped, missing
  families fall back to sans — `fonts.ts`); **text styles** = Regular ·
  Outline · Pill · Rectangle (her list) as PRESETS quick-setting explicit
  `fill/stroke/plate` fields, active state DERIVED (duotone pattern,
  `text-style.ts`; plates carry auto contrast ink). Click empty canvas →
  create + enter editing immediately (NO placeholder copy — the layer starts
  empty; abandoning deletes it); `text:editing:exited` is the SECOND
  controlled Fabric→doc path (commit text + content-derived layer name);
  reconciler NEVER clobbers a live edit (isEditing skip).
  `SubstrataText extends IText` draws the plate (cache padded, EffectsImage
  precedent; selection bbox stays the text's — plate overhang isn't
  clickable, accepted v1). Bloom = font DROPDOWN (Ruby's ask; shared
  `FontSelect`, faces previewed) + Upload + size/style presets, and bloom
  edits LIVE-APPLY to the active text layer; Inspector Text section =
  font dropdown/size/style/accent; colour sink recolours the layer's ACCENT
  (style re-expresses: plate + contrast ink / stroke / fill). Mid-edit lore
  (bug-earned, 2026-07-06): font/size/style props apply DURING editing (only
  `text` stays fabric's until exit), and fabric anchors the LEFT edge while
  typing by mutating `left` — the exit commit adopts the visual centre into
  the transform or the text snaps back to the click point. layerDims: null for text (W/H fields hidden; align skips —
  measure-in-doc-space is a later nicety). **Object-level typography LIVE
  (2026-07-07)**: align (incl. justify) / lineHeight / charSpacing /
  direction (LTR/RTL) — additive optional TextLayer fields defaulted at
  consumers (no schema bump), applied mid-edit like font/size; Inspector
  grew Align segmented + Line height/Spacing steppers + LTR/RTL (shared
  `TextAlignRow` in text-style-row); TEXT bloom grew Align (writes
  tool-settings, new layers adopt it). 8-check `.verify-text-props.mjs`
  ALL PASS. Area mode + per-range deltas remain the deferred tail. 10-check harness
  `.verify-text.mjs` ALL PASS (click-to-type, plates, sink accent, edit
  round-trip, abandon). PIECES
  ratifications (Ruby 2026-07-05): **Pieces head sub = the preset-shapes
  GALLERY — LIVE (2026-07-07)**: 19 symbols (4+1 arrows · heart · cross ·
  cog · cloud · lightning · sun · moon · speech bubble · check · X · pin ·
  flag · drop · star) vendored from **Phosphor Icons v2.1.1 fill (MIT →
  ACKNOWLEDGEMENTS)** as single-path 256-grid data in `preset-shapes.ts`;
  ShapeParams grew an additive `symbol {symbolId, width, height}` variant
  (the 256 GRID maps onto the dragged box; nonzero winding — holes work);
  reconciler renders via parsePath→makePathSimpler→transformPath into a
  fabric.Path, in-place `_setPath` on reshape (no drag churn); gallery bloom
  = 5-col symbol grid + fill row; head-sub drags ALWAYS draw the picked
  symbol (primitives sub untouched); layers thumbs render symbol Path2Ds;
  symbol layers name themselves after their preset. 9-check harness
  `.verify-gallery.mjs` ALL PASS. Also ratified then: Brush/Pencil on **npm
  perfect-freehand ^1.2** (her M2-2 call — not the vendored tldraw fork;
  SHIPPED 2026-07-06). **Freehand (M2-2)**: raw `[x,y,pressure]` points are
  the doc truth (`FreehandLayer`, additive in schema v2; outline path never
  persisted), strokeOptions persisted per stroke so old art never reflows;
  `freehand.ts` (pure) wraps getStroke → outline → path-d + dims + the
  centre-normalise commit helper; reconciler renders a fill-only fabric.Path
  (reference-diffed rebuild); the LIVE stroke previews on the top-context
  overlay (exact final outline) and hits the doc ONCE on pointerup — one undo
  step by construction, taps draw nothing. Coalesced pointer events consumed;
  real pressure only from `pointerType === "pen"` (Firefox pointerup-0
  guarded), mouse/finger = simulatePressure. Brush = fat/pressure-expressive
  (thinning 0.6, streamline 0.5 — Ruby-approved), Pencil = thin + faithful,
  **streamline 0, NONE — ratified by Ruby 2026-07-06**; brush thinning is the
  remaining taste knob. Bloom = Colour + Size preset rows; chips show
  the live size; Layers thumbs trace the outline; layerDims covers freehand
  (outline bbox). 10-check harness `.verify-freehand.mjs` ALL PASS.
  Primitives ships per the built-tool rule: drag-to-draw all five
  shapes (transient gesture = ONE undo step incl. creation; click draws
  nothing; crosshair + skipTargetFind/selection-off while active, space-pan
  composes), real settings bloom (shape chooser · fill swatch+hex · stroke
  toggle/colour/width · per-shape params), live contextual chips (shape +
  sides/points/corner), shape thumbnails in Layers, Inspector W/H + Arrange
  align/distribute via `layerDims` (a line's 0-height axis gets no field).
  Fill/stroke of an EXISTING shape isn't editable yet — settings describe the
  NEXT shape; editing lands with the M4 picker sink. FX + LOOKS gate non-raster
  layers with \u2211CG hints (filters/effects are raster-pipeline; rasterize =
  M3-15). **Params ARE editable after the fact (Ruby 2026-07-06)**: a selected
  shape's Inspector grows a SHAPE section — corner/sides/points/inner as
  **preset rows + a custom (…) stepper** ("simple editor for simple people";
  `components/substrata/preset-row.tsx` = the shared PresetRow/Stepper/
  CornerPresetIcon language, also used by the bloom's param rows now; corner
  presets in the Inspector are SIZE-AWARE fractions of the min side, capped
  at min/2; edits go through `setShapeParams` in layer-ops, one undo step,
  in-place Fabric geometry update; the Inspector middle scrolls so the
  appearance bar survives the rail's uniform height; header dims rounded —
  shape bboxes are fractional). **RULE (Ruby): a built tool ships its
  settings + chrome.**
  **MOVE·Crop is LIVE (2026-07-07, ratified: NON-DESTRUCTIVE)** —
  `BaseLayer.crop?: CropRect` (layer-space, additive in v2) renders as an
  object-plane clipPath (one Rect per object, WeakMap-cached; verified vs
  fabric 7.4.0 source — effects hug the CROPPED silhouette); `setCrop` in
  layer-ops (transient-aware); the crop sub shows a four-rect dimmed veil +
  1px primary border + 8 handles on the overlay, drags claim at the shared
  capture listener (one undo step incl. pointercancel/unmount), clamp
  [0,dims] min 8×8, Escape returns to plain move. v1 ceilings (`ponytail:`):
  rotated layers skip crop editing (oriented maths later) · selection bbox
  stays the uncropped bounds · text has no dims → no crop. Rasterize bakes
  cropped pixels and drops the field (visual identity holds). 10-check
  `.verify-crop.mjs` ALL PASS. MOVE is otherwise complete per the rule: sketch-styled selection handles (8px square
  paper-fill/primary-border corners via shared `ownDefaults.controls`, circular
  rotate handle, theme-observed recolour — NOTE: Textbox needs its own control
  set in M2), smart guides now dashed-DESTRUCTIVE per the sketch, live
  **drag badges** (move → X/Y · scale → W×H · rotate → angle, primary pill under
  the bbox), **arrow-key nudge** (MOVE-gated, step = MOVE settings' nudge, ⇧
  ×10, one undo step/press, `nudgeSelection` in layer-ops), and a real **MOVE
  settings bloom** (`omnibar/tool-settings.tsx`: Snap/Grid switches sharing
  guides-pref + the nudge stepper). Other tools keep placeholder blooms until
  they land. Sketch extras still open: guide gap-pills, rulers renderer.
- **Copy**: all user-facing strings are `\u2211CG` (functional chrome labels use the
  mockup's words per Ruby's call; voice-y microcopy + toast text stay `\u2211CG`).
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

Copy in the sketches is illustrative; real strings stay `\u2211CG` (see Conventions).

---

## Conventions / invariants (do not break)

- Doc model is truth; Fabric never authoritative; one-way sync + single write-back.
- Fabric imported only behind the `ssr:false` boundary (fabric-canvas + sync +
  filter-backend). Never server-eval it (static export).
- No user-facing copy authored — `\u2211CG` gaps with spec/sample. British spelling.
- Persistence strictly opt-in; secure-context APIs guarded; raster-only export.
- New UI state → an external store bound via `useSyncExternalStore`.
- DRY on root `components/ui/*` shadcn primitives; Lucide icons; parity with
  `sketches/*.html` (gitignored visual source of truth).

---

## Next

**✅ M2-1 SCHEMA RATIFIED (Ruby, 2026-07-02)** — build against this shape:
- **TextLayer**: `mode: "point" | "area"` (+ area box w/h); object-level align
  (incl. justify) / lineHeight / charSpacing / direction (RTL/LTR) / baseline;
  **per-range deltas** `{start, end, style}` with the MINIMAL prop set
  {fontWeight, italic, fill, underline, overline, linethrough} (per-range
  size/family = v1.1, additive); `onPath: null` reserved; **NO dropShadow
  field** — `effects[]` owns shadows.
- **ShapeLayer**: discriminated params — rect{width,height,cornerRadius} ·
  ellipse{rx,ry} · line{length} · polygon{sides,radius} ·
  star{points,outerRadius,innerRadius}; `fill: string | Gradient`
  (`{type: "linear"|"radial", stops[{offset,colour}], coords}` — coords
  RELATIVE 0–1); `stroke: {colour,width,dash?} | null` (vector stroke;
  the stroke EFFECT stays the separate any-layer outline).
- **PathLayer** (new): `anchors[{x,y,inX,inY,outX,outY}]` (handles RELATIVE to
  their anchor) + `closed`; shape fill/stroke model.
- **FreehandLayer** (new): `rawPoints [x,y,pressure][]` is the truth (rendered
  path never persisted); `strokeOptions {size,thinning,smoothing,streamline,
  simulatePressure}` (perfect-freehand shape); fill.
- **Conventions**: centre-origin transform.x/y for ALL kinds ("centre origin is
  fine — this isn't gonna be a photoshop killer" — Ruby); intrinsic geometry
  unscaled in params, transform scales it. SCHEMA_VERSION 1→2, Dexie
  version(2) no-op upgrade, v1 docs restore with defaulted fields.

0. **✅ M3 FILTERS COMPLETE (Tier-0 2026-07-02, Tier-1 2026-07-03).** Tier-0
   shipped + Ruby-QA'd (her round applied: hue-rotate stepper→slider,
   sharpen/emboss Amount, noise mono/colour Mode, paramless blocks lost the
   dead chevron/reset; stack order ratified: top block applies first). Tier-1
   shipped on her four ratifications (2026-07-03): **M3-5** threshold/posterise
   ship as shaders · **M3-7** colour balance = three midtone-weighted sliders ·
   **M3-9** duotone preset pairs + custom · film-sim looks inspired by popular
   grades with **Claude-authored names** (her explicit grant; she may rename).
   All seven customs headless-verified to exact maths. **Awaiting Ruby's
   visual QA**: the eight film-sim grades, duotone pair colours, vignette
   shape/feel, colour-balance strength (0.3).
0b. **✅ LOOKS MODULE + FILM LUTs (2026-07-03, Ruby's ask).** The LUT/CST
   family pulled OUT of FX into a bespoke sixth module (live-thumbnail
   gallery, None row, intensity) — storage unchanged (film-sim entry in
   filters[], pinned to stack END = grades after adjustments), FX panel/picker
   exclude it, ADJUST omnibar button un-split (no more FILTERS/COLOUR subs).
   16 REAL film LUTs as 33³ packed strips + the SubstrataLut GPU sampler
   (async load pops in via lutEpoch): 8 from the RawTherapee collection
   (CC BY-SA → ACKNOWLEDGEMENTS) + **8 GENERATED with spectral_film_lut (MIT,
   Ruby-approved venv run)** — physically-modelled chains incl. Vision3
   5207→2383, Eterna 500→3513DI, Gold 200→Supra Endura, Aerochrome IR, Instax;
   generator preserved as `scripts/generate-film-luts.py` (venv +
   `pip install spectral_film_lut`). Headless-verified (pin-to-end, retarget,
   None, mono Tri-X, intensity-0 identity, live thumbs ×24). Open: module
   title \u2211CG (Ruby names the category), duotone pair NAMES still \u2211CG (grant
   covered LUT looks only), 24-card shelf may want curation (Ruby's eyes).
0c. **✅ M3 EFFECTS ENGINE (2026-07-05).** `effects[]` renders — all six
   registry types via the Canvas2D compositor inside Fabric's object cache
   (`effect-render.ts` + `effects-image.ts` + `syncImageEffects`; design notes
   in the file map). M3-14 was already live (ADJUST zone chips both stacks);
   M3-15 (rasterize-for-effects) DEFERRED until text/shape layers exist —
   today every layer is raster, so there is nothing to gate. Drop/inner
   shadow grew an Opacity param (default 35 %). 30-check headless harness
   `.verify-effects.mjs` ALL PASS; `npm run build` + `tsc --noEmit` green.
   **Awaiting Ruby's visual QA (taste, not correctness)**: default shadow
   opacity 35 %, glow double-stamp intensity curve, stroke ring quality at
   large widths, scene-px effect units (effects don't scale with the layer),
   scene-absolute shadow angles.
0d. **✅ PIECES·PRIMITIVES (M2-7, 2026-07-05).** All five ratified shapes
   draw (see the Tools section + file map: doc-model v2 · shape-geometry ·
   draw-shape · sync shapes). Ratified with it: freehand dep = **npm
   perfect-freehand ^1.2** (M2-2 closed) · Pieces head sub = preset-shapes
   gallery, later · primitives-first chunking. 28-check harness ALL PASS;
   build + tsc green. **Awaiting Ruby's QA (taste)**: drag semantics
   (centre-out polygon/star vs bbox), default fill green, star inner-ratio
   default 0.5, stroke-scales-with-transform convention.
0e. **✅ BRUSH/PENCIL FREEHAND (M2-2, 2026-07-06).** See the Tools section.
   PIECES is now fully live except the Pieces head sub (preset gallery —
   needs Ruby's preset list). Pencil streamline 0 ratified same day.
0f. **✅ M4 COLOUR SINK (2026-07-06).** The picker's missing sink — see the
   Colour module section. **Gradient authoring UI LIVE (2026-07-07)** —
   `gradient-row.tsx`: shape Fill row grows Solid/Gradient segmented; editor =
   Linear/Radial · preview strip w/ clickable stop markers · stop colour
   (transient mechanism, drags = one undo step) + offset stepper · add/remove
   (2–6) · angle stepper (CSS convention, corner-exact at 45°; maths doc'd +
   scratch-checked). setFill widened to string|Gradient (freehand guarded at
   the choke point); flat sink pick still replaces a gradient (ratified call).
   20-check `.verify-gradient.mjs` ALL PASS (headless UI via pinned
   Inspector). Taste for Ruby: solid→gradient far stop = ±0.18 OKLCH nudge ·
   marker DRAG skipped (steppers; ponytail) · radial renders elliptical on
   non-square shapes (pre-existing). Remaining M4 surface:
   recent-colours/palette integration (post-v1 per BUILD-PLAN).
0g. **✅ TEXT (M2, 2026-07-06).** See the Tools section. Ruby's calls baked
   in: Sans/Serif/Mono system stacks + upload (M2-3 CLOSED — no bundled
   files) · the four text styles. Open TEXT niceties (later, additive):
   area/Textbox mode, align/line-height/per-range styles (ratified schema),
   text-on-path (scope call still open), Bezier subtool (pen), text dims for
   align/arrange, persisted uploaded fonts (M5).
0h. **✅ M6 EXPORT (2026-07-06).** The full pipeline — see the Export modal
   section + file map. Ruby's ratifications baked in: **JXL replaces AVIF**
   (vendored libjxl reused from main via merge; /public module worker) ·
   **no social presets in v1** · no batch-zip (SPEC post-v1). Deliberate v1
   ceilings: no tile+stitch — area clamp downscales instead (`ponytail:`
   note in export-core names the upgrade path); JPEG-flatten branch not
   harness-covered (2 lines; solo covers the hide-rect path). Post-review
   hardening: verify decodes at NATURAL size and scans the full alpha channel
   (an 8×8 probe point-sampled small solo'd layers into false "Safari
   failures" — caught by review, regression-checked); the JXL worker no
   longer caches a failed module fetch. 28-check harness `.verify-export.mjs`
   ALL PASS; build + tsc green; worker/wasm MIME-verified out of `out/`.
   **Awaiting Ruby's eyes (taste + real Safari/iOS)**: modal layout, estimate
   accuracy feel, verify-guard behaviour on actual iOS Safari (the silent
   blank-canvas failure isn't reproducible in Chromium), slopsieve for the
   two new \u2211CG gaps (downscale + failure notices).
1. **✅ DECISION QUEUE CLEARED (Ruby, 2026-07-07)** — build against these:
   - **SELECT v1 (M2-10)**: Marquee · Lasso · Wand. Magnetic is a LASSO
     OPTION (setting, not a subtool). "Superflood" = the wand's global
     colour-select mode (non-contiguous; same threshold maths, no flood).
   - **Pixel-selection semantics**: BOTH extract-to-layer AND destructive
     ops, **extract is the default**. While pixel data is selected a
     CONTEXTUAL POPUP offers: extract (default action) · cut (destructive) ·
     invert · deselect · grow · shrink. Destructive edits bake a NEW
     content-addressed raster (old hash stays cached → undo snapshots keep
     working).
   - **Text-on-path: CUT** (M2-6 closed — not v1, not post-v1).
   - **Pieces preset gallery**: arrows + simple symbols (heart, cross, cog,
     cloud, …). Source path data from a free permissively-licensed library
     (vendor the paths as data + attribution; no new runtime dep).
   - **M5 tuning ratified**: IDB-only v1 (no OPFS) · snapshot retention ~20
     on the existing autosave debounce · `browser-fs-access` dep accepted.
   - **Rulers: IN, with drag-out GUIDELINES** — the guides are the point
     (Ruby uses them constantly); renderer + guide model needed.
2. **Build order**: ✅ rulers+guides → ✅ SELECT → ✅ Pieces gallery →
   ✅ M5 persist core (ALL 2026-07-07 — the full ratified decision queue is
   BUILT). M5 deliberate cuts: project-manager UI + Open-recent (SPEC
   post-v1 Should), OPFS (ratified out), handle persistence, zip worker
   (STORE = memcpy; ponytail notes in code). Review-hardening landed
   with SELECT: pointerId-claimed gestures + pointercancel recovery, undo/redo
   ignored mid-transient-gesture (doc-store root guard — also fixes the
   freehand hazard), drag-out auto-shows hidden guides, legacy guides-pref
   migrates rulers ON.
   Mid-size sweep COMPLETE (2026-07-07 PM): ✅ text typography props ·
   ✅ cross-parent drag + group opacity · ✅ rasterize (M3-15) · ✅ pen cut ·
   ✅ guide gap-pills · ✅ gradient authoring UI · ✅ MOVE·Crop
   (non-destructive, ratified). Still open: snap-feel QA, TEXT area mode +
   per-range styles, project manager (post-v1), Ruby's taste-QA backlog +
   slopsieve pass.
3. **✅ M7 SMARTS (2026-07-08) — the last BUILD-PLAN milestone.** Ruby's
   ratifications, all baked in:
   - **Model hosting**: reuse the background-remover tool's system — runtime
     fetch from the HF hub via the browser HTTP cache (`allowLocalModels=false`,
     `useBrowserCache=false`); NO self-hosted weights, the Cloudflare
     25 MiB/file problem evaporates. Model switched to MIT
     `onnx-community/BiRefNet_lite-ONNX` (BRIA dropped per licence).
   - **transformers v3→v4**: PIN BOTH — npm alias
     `@huggingface/transformers-v4` (^4.2.0) for the editor;
     /tools/background-remover keeps ^3.8.1 untouched.
     `serverExternalPackages` keeps v4's node build out of the SSR bundle
     (its `new URL()` asset refs break Turbopack).
   - **Magic-resize reflow**: ANCHOR + PROPORTIONAL — each leaf scales by the
     smaller axis factor and keeps its (scaled) offset from its nearest
     artboard anchor (corners/edge-midpoints/centre, per-axis ¼-span bands);
     guides rescale proportionally; one `update()` = one undo step.
   Built: `bg-removal.ts` (matte service on the lutEpoch pattern: serial
   main-thread bakes — ponytail, worker is the upgrade path; WebGPU fp16 →
   WASM fp32 fallback; sticky errors + retry; Dexie v3 `mattes` table keyed
   by SOURCE blobHash, persistence-gated, purged on opt-out) ·
   `remove-background` effect (paramless registry entry; EffectsImage
   `destination-in`s the matte over the content scratch BEFORE paintEffects,
   so shadows stamp the cutout silhouette; matteEpoch in isCacheDirty pops
   arrivals in; add = auto-bake, switch = instant toggle, hash repoint =
   auto re-bake) · FX-panel MatteBody (progress %, device chip, wasm-slower
   notice, retry — all \u2211CG) · `resizeArtboardReflow` + Canvas-size-modal
   reflow Switch (off by default; reflow path calls `viewport.fit()`).
   M7-6/7 align/distribute + M7-10 preset lib were ALREADY BUILT (arrange
   panel / lib/social-presets.ts) — only verified, not rebuilt. Deliberate
   cuts: no platform-labelled presets in the modal (dimension grid already
   covers the social staples; social-presets stays aspect-ratio data for the
   cropper) · no worker · crop/angle ride along in reflow (documented
   approximation). 15-check `.verify-m7.mjs` ALL PASS (synthetic-matte test
   seam `setMatte`/`matte`/`resizeReflow` on the rig — no model download in
   the harness); build + tsc green, routes smoke 200.
   **Awaiting Ruby's eyes**: the REAL model run (WebGPU fp16 quality, WASM
   fallback speed, iOS Safari) — unverifiable headlessly; reflow feel across
   presets; slopsieve for the new \u2211CG gaps (modal reflow label + switch,
   MatteBody's six status strings).
4. **✅ CLARITY-REVIEW FIXES (2026-07-08 PM).** Two-agent persona review
   (non-technical Canva-happy creator) → full report in chat; the FIX tier
   landed same day:
   - **Unsaved-work guard**: `beforeunload` warns when undoable work exists
     with persistence OFF (the silent-loss default path); status dot goes
     three-state (stored / AT-RISK amber / idle) with three \u2211CG labels.
   - **Empty-scene starter card** (`empty-hint.tsx`): import + text CTAs +
     drop/paste hint line (all \u2211CG), shown only while `layers.length === 0`;
     drag-over now shows a dashed drop-target highlight (was mute).
   - **Menus no longer lie**: fake Edit history REMOVED; Duplicate/Delete/
     Select-all wired for real; Cut/Copy/Paste + Scene Rename/Duplicate/
     Delete + Help items visibly disabled; ⌘N hint dropped (browsers reserve
     it); ⌘I import shortcut now actually works; **Scene ▸ Open recent is
     LIVE** (new `listRecentProjects`/`loadProject` in autosave.ts +
     `openRecent` in file-ops.ts, persistence-gated, same discard guard).
   - **Undo/redo stay put** — toast pill floats beside them instead of
     replacing them for 1.8s.
   - **Touch fan**: re-tapping the active tool head toggles the subtool fan
     (hover-only reveal locked touch users out of Crop/Lasso/Wand/shapes).
   - **Tooltips**: new `lib/substrata/hint.ts` (one string → aria-label +
     title); applied across omnibar panel buttons (module titles), layers
     panel, colour panel, FX controls, inspector transform fields, steppers,
     zoom/undo/redo. ~85 titled controls, verified.
   - **SecureContextNotice finally mounted**; MatteBody no longer leaks the
     raw device token / error string (detail moved to a hover title).
   14-check `.verify-review-fixes.mjs` ALL PASS; tsc green, no new lint
   errors. NOT built (feature tier, needs Ruby's call): named size presets,
   text role presets, emoji insert, clipboard export, recent colours,
   artboard gradients, raster PDF, rounded crop, QR insert — ranked list in
   the chat report. **slopsieve pass needed**: empty-state card (3), status
   dot (3), Open-recent placeholder, zoom/undo/redo tooltips, inspector
   rotation/scale tooltips.
5. **✅ COPY-GAP MARKER HYGIENE (2026-07-08 eve, Ruby's call).** slopsieve
   choked on marker misuse. Fixed repo-wide against gap.rs's ACTUAL parse
   rules (now documented in ~/GitRepos/slopsieve/CLAUDE.md + the global
   CLAUDE.md "Marker discipline" section):
   - ~150 prose mentions of the literal token de-tokenised to the escaped
     spelling \u2211CG (BUILD-PLAN/STATE/SPEC + ~25 code doc-comments + the
     verify scripts, which now build the token at runtime).
   - 20 split gaps (free-text wrap lines broke the annotation gather) and
     ~35 orphan placeholders (group annotations, comment-above-JSX-element,
     double markers) restructured: one annotation per placeholder, spec on
     one line, sample on its own line, block-comment terminators on their
     own line, annotations inside JSX prop lists.
   - `slopsieve --list`: 161 gaps, all real, zero .md noise (was ~290 with
     ~125 bogus). Gap-lint checker mimicking group_gaps: 0 HEADERONLY,
     0 ORPHAN, 0 PROSE. tsc green; both verify harnesses ALL PASS.
   Improvement ideas for the tool itself left in slopsieve's CLAUDE.md
   (parse header-line spec/sample, trim terminators, --lint mode).
6. **✅ WORKSPACE POLISH — drag-to-dock (2026-07-08 night, Ruby's call).**
   The Workspace menu's Omnibar/Rail edge rows + "Dock modules" letter grids
   were undiscoverable → replaced with direct manipulation:
   - Every module header (bloom, rail, dock) grows a visible GripVertical
     drag grip; dragging shows left/right/rail drop zones over the canvas
     (`dock-zones.tsx` overlay + `drag-dock.ts` transient store); dropping
     calls the SAME setModuleDock/setPinned prefs as before.
   - The omnibar has its own grip — drag the bar to any of four edge zones
     (replaces the T/B/L/R row). 4px threshold so clicks stay clicks;
     geometric hit-testing (overlay stays pointer-events-none); drag ghost
     chip names the module in hand.
   - Workspace menu now: Zoom · Guides · Theme only, and the Guides seg
     finally has an icon (lucide Frame). ponytail: the rail-edge pref lost
     its UI (rail follows the omnibar); re-surface if missed.
   Ruby's slopsieve pass landed in parallel (2 gaps left repo-wide); two of
   her fills hit react/no-unescaped-entities — wrapped verbatim in JSX
   string expressions, wording untouched. 10-check `.verify-workspace.mjs`
   ALL PASS + review-fixes harness regression ALL PASS; tsc green, lint at
   baseline.
