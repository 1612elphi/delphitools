# Substrata — SPEC

> delphitools **Substrata** — a simple, fast, completely-local image editor with
> light design-tool reach. The "anti-Canva": no accounts, no cloud, no template
> wall, no modal hell. It trusts you.

Working spec for the feature on the `delphitools-editor` branch. Library/engine
choices in §4–§7 were **researched and adversarially vetted** (two agent
workflows); the contested calls and what the gauntlet changed are recorded inline.
Visual source of truth = the interactive sketches under `sketches/` (gitignored),
see [§16](#16-sketches--visual-source-of-truth).

Status: **design phase complete; pre-build.**

---

## 1. Thesis

Canva is bloated, modal-heavy, template-pushing, slow on real files, and
account-gated. Substrata is the opposite: opens straight to a canvas, runs
entirely in the browser, keeps your work on your own machine, gets out of the way.

**The metaphor (and the name):** a stack of **layers** on one **artboard**, where
each layer carries its own **effects stack**. *Substrata* = sub-strata = layers.

---

## 2. Principles (non-negotiable)

- **Completely local.** All pixels stay on-device. No upload, no server-side
  processing, ever.
- **No account.** No login/signup/email. Usable anonymously and offline.
- **Optional persistence.** Local autosave by default; portable files are an
  explicit user action. Nothing required.
- **Honest, not patronising.** Status says it's stored *in this browser*, not the
  cloud. No fake "synced", no upsell, no dark patterns.
- **No modal hell.** One persistent surface (the omnibar) + summonable floating
  modules. What others trap in modals, we float in the rail.
- **Simple.** A focused 80/20 tool. See [non-goals](#13-non-goals).

Target users span the range deliberately: **Maddy** (20, casual), **Martha** (59,
non-technical), **Gravis** (power user who won't install GIMP for one edit). Every
surface must be legible to Martha, quick for Gravis, pleasant for Maddy.

---

## 3. Where it lives (architecture)

- **Own top-level route in the web repo:** `app/editor/` (working name) with its
  **own root layout** — no sidebar, no per-tool `max-w-4xl` chrome. Full viewport.
- **NOT a tool in the grid** (`/tools/[id]`, `lib/tools.ts`).
- **Web-only, explicitly non-parity.** A heavy canvas app with no realistic
  CLI/iOS sibling — carved out of the web/CLI/iOS parity contract in `PARITY.md`
  (precedent: the Base64 Image Encoder is already web-only).
- **Branded as a delphitool.** The delphitools logo (top-left) is **home /
  back-to-tools**. Domain/subdomain is a deferrable branding call.
- **Next 16 App Router, static export (`output:"export"`), React 19, client-only.**
  Everything runs in the browser; heavy deps are `dynamic()`-imported `ssr:false`
  and lazy-loaded.

---

## 4. Tech stack (vetted)

| Concern | Pick | Licence | Notes |
|---|---|---|---|
| Canvas / scene | **Fabric.js `^7.4.0`** | MIT | Imperative, **no** react binding; `ssr:false`. Object tree + `Image.filters[]` ≈ our layers + effects stack; only engine with native in-canvas text editing. |
| Effects engine | **Fabric WebGL filters[] + custom `BaseFilter` GLSL** | MIT | Native non-destructive, serializable, single shared GL context. `regl`/WebGL2 float-target compositor = **v2**. |
| Colour adjustments | **Own GLSL math** (Fabric built-ins + 2 custom shaders) | MIT (no new dep) | culori/colord/chroma are per-swatch — catastrophic per-pixel. OkLab only where it earns it. |
| Vector pieces | **Fabric shapes + custom Pen + `perfect-freehand ^1.2`** | MIT | Pencil = pressure freehand. **No Paper.js** (parallel renderer). |
| Text | **Fabric `IText`/`Textbox` + native `FontFace`** | MIT | `opentype.js` deferred to the outline-on-export milestone. |
| Background removal | **`@huggingface/transformers ^4.2` + BiRefNet-lite fp16 ONNX** | Apache-2.0 runtime / **MIT model** | WebGPU; self-host weights. **Drop BRIA RMBG (non-commercial).** |
| Persistence | **Dexie (IndexedDB) + OPFS + File System Access + `fflate`** | Apache-2.0 / MIT | Versioned migrations; `.substrata` zip. Exported file = durable truth. |
| Export | **native `canvas.toBlob` + lazy `@jsquash/avif` WASM** | Apache-2.0 | PNG/JPG/WebP native; AVIF only justifies WASM. **Raster-only; no `toSVG`.** |
| History | **Command/patch on our own doc model** | — | Content-addressed copy-on-write raster snapshots. **Never** Fabric JSON. |

**Reuse from delphitools (import directly):** `@huggingface/transformers`
plumbing (`components/tools/background-remover.tsx`), OkLCH/Lab colour math
(`lib/colour-notation.ts`, `lib/palette-strategies.ts`), `lib/colour-names.ts`,
`pixel-picker`, `image-converter`, `social-cropper` presets, `use-file-paste` hook.
⚠️ repo OkLCH math is TypeScript — it must be **re-authored in GLSL** (and any JS
fallback); "reuse" means the algorithms, not the code.

---

## 5. Hard requirements (build constraints surfaced by the gauntlet)

These are non-negotiable; several guard against **silent corruption**, not crashes.

**Fabric / security**
- Pin `fabric ^7.4.0` — 7.2.0 fixes CVE-2026-27013, **only 7.4.0** also fixes
  CVE-2026-44311 (both `toSVG` XSS, both in-scope because import uses
  `loadFromJSON`). **Export raster-only; avoid `toSVG` entirely.**
- **Doc model is the single source of truth** for layers + the non-destructive
  effects stack. Strict one-way `doc → Fabric` sync; Fabric is never the
  authority. Undo = patches on the doc model.

**WebGL effects**
- At filter-backend init: `config.textureSize = min(cap, gl.MAX_TEXTURE_SIZE)`
  **and** cap every working raster (downscale-on-import or tile). Oversize sources
  **silently render ~30% of pixels** (Fabric #6805), they don't throw — #1 must-do.
- **Preview-downscale**: run the chain on a ~1–2 MP fit-to-viewport proxy during
  slider drag; re-run full-res on commit. rAF-coalesce `applyFilters`; mark only
  the active layer dirty; cache unchanged layers. `webglcontextlost` → Canvas2D
  fallback.
- 8-bit intermediate textures band across long colour stacks — **accepted v1
  limitation**, fixed by the v2 float-target pipeline.

**Background removal**
- Default model **BiRefNet-lite fp16 (~115 MB, MIT)**; MODNet (Apache) is an
  optional **portrait-only** fast path (not interchangeable); full BiRefNet (~1 GB)
  opt-in only. **Never** ship BRIA RMBG-1.4/2.0 (non-commercial). transformers
  `^4.2`; smoke-test BiRefNet-lite on the v4 WebGPU runtime (fp16 quality).
- **WebGPU needs only HTTPS — no COOP/COEP** → runs in pure static export, zero
  special headers. (`next.config` `headers()` is ignored under `output:"export"`;
  COOP/COEP would only ever come from the host, and only for the WASM-thread
  fallback.) Feature-detect `navigator.gpu`; single-thread WASM (q8) fallback with
  a visible "slower on this browser" state.
- **Self-host** ONNX weights (and ideally the ORT runtime wasm) in app assets — no
  HF CDN fetch (privacy/offline). Cache the model **in IndexedDB**, not the Cache
  API (iOS ~50 MB per-partition cap throws `QuotaExceededError`).

**Persistence**
- **Dexie** (declarative versioned migrations) over raw `idb`.
- **The exported `.substrata` file is the durable source of truth.** Browser
  storage (IndexedDB/OPFS) is a best-effort autosave/recovery cache — **never say
  "crash-proof"** (Safari/iOS evict the whole origin bucket after ~7 idle days;
  `persist()` is heuristic). Call `storage.persist()` on first edit, surface
  `persisted()` state, prompt Safari/iOS users to export / Add-to-Home-Screen.
- File System Access (Chromium) via the `browser-fs-access` pattern + `<a download>`
  / `<input type=file>` fallback (Firefox/Safari have no disk pickers).

**Static-export plumbing**
- Workers: `new Worker(new URL('./w.js', import.meta.url))` survives static export
  (Next 16.2 worker-origin fix); prefer a `.js` worker entry (a `.ts` entry can
  emit to `/_next/static/media` with a bad MIME).
- WASM assets: **do not** use `import x from 'x.wasm?url'` / `type:'asset'` —
  Turbopack ignores it. Copy `.wasm` to `/public` and load via each codec's
  `locateFile`/`wasmBinary` hook (jSquash AVIF, libheif), or `resolveAlias` + a
  **static** `new URL('x.wasm', import.meta.url)`.
- Secure context required for Workers, OPFS, FS Access, `crypto.subtle`, WebGPU —
  guard every one so opening over `file://` degrades gracefully (https/localhost
  only in real use).

**Export**
- Clamp every export to the iOS **area** budget `w·h ≤ 16,777,216` (it is area-
  based, **not** a 4096 per-axis cap); downscale-to-fit or **tile + stitch** for
  large/2× exports. **Verify** the output (sample pixels / blob size) to catch
  Safari's silent transparent-canvas failure and retry smaller. Feature-detect
  AVIF via returned `blob.type`; default PNG/WebP; encode in a Worker.

**Text**
- Load fonts via native `FontFace`; gate every measure/render/export on
  `await document.fonts.ready` (+ per-`FontFace.load()`).
- Pixel effects don't touch text (Fabric filters are `Image`-only): provide an
  explicit **Rasterize-text-layer** command (bakes after `fonts.ready`, layer
  stays editable in the doc model) **or** disallow the effects stack on text
  layers — never a silent no-op.

**Pieces**
- `perfect-freehand`: persist raw `[x,y,pressure]` + stroke options per layer
  (committed `fabric.Path` is a render artifact). `simulatePressure=true`; real
  `e.pressure` only when `pointerType==='pen'`; consume `getCoalescedEvents()`;
  ignore Firefox's `pointerup` `pressure===0`. Consider vendoring tldraw's MIT fork
  (upstream is low-maintenance; "hot elbows" artifact).

**Everything heavy is lazy/code-split to the editor route** (transformers + weights,
opentype.js, AVIF WASM) — never on landing-page weight.

---

## 6. The document model

- **One document = one artboard** (preset or custom dims), opens instantly to a
  usable canvas — no wizard, no template wall. **Default = 2000×1500** (72 ppi,
  white), no prompt; a **new-scene preset panel** (Scene ▸ New scene) offers
  other sizes for those who want them. Preset list (social/print/device/…) is
  TBD; labels are `∑CG`. (Multi-artboard = later.)
- **Layers:** raster / text / shape. Reorder, show/hide, lock, opacity, blend,
  rename, group. **Object-making = layer-making** — no "add layer" button; the
  primary add is **Upload**.
- **Effects stack per layer**, two tiers in the data model:
  - **Pixel filters** (`image.filters[]`, raster only) — ordered, toggleable,
    reorderable, non-destructive.
  - **Object compositing** on the layer — opacity, blend mode
    (`globalCompositeOperation`), drop shadow (`fabric.Shadow`).
- **Background removal** is an async **"bake" effect**: the model emits a grayscale
  alpha matte, cached per layer and alpha-multiplied at composite — a generated
  alpha channel, **not** a Fabric `clipPath`/mask (satisfies *no masks*). Original
  RGBA kept; toggle-off restores; re-bake only on source/param change.
- **No masks, no clipping.** Selections (from SELECT) are transient regions for
  move/delete/fill/copy, not persistent masks.

---

## 7. Top bar (FINAL)

Anchored chrome — grounds the floating omnibar/rail so it reads as a deliberate
tool surface, not "unfinished".

- **Left:** delphitools logo (→ home/tools) · **Substrata** · menu bar.
- **Centre:** editable file name (`Untitled scene`) + **local save status** — must
  read as *in this browser* (`∑CG`: e.g. `Saved in browser` / `Saving…` /
  `Unsaved changes`).
- **Right:** undo/redo · zoom (− % + / fit) · **Export** · theme toggle.

**Menus (rebracketed — not File/Edit/View/Help):**
- **Scene** — two boxes: (1) the file menu (New scene / Open / Open recent /
  Import / Save / Save a copy / Export / Rename / Duplicate / Delete / **Back to
  delphitools**); (2) a **document inspector** (dimensions · resolution · bit depth
  · colour · layers · size · stored-local).
- **Edit** — two boxes: (1) **big Undo/Redo** + a **scrollable history list**
  (current step marked, redoable steps dimmed); (2) an **ACXV keypad**
  (Cut/Copy/Paste/Duplicate/Delete/Select-all as a flush icon grid).
- **Workspace** — the modular cockpit: move the **Omnibar** (T/B/L/R), move the
  **Rail**, **Dock modules** per-module `L / R / Rail`, plus zoom · rulers · grid ·
  snap · theme.
- **Help** — shortcuts · about Substrata · about delphitools · source.

**Right-click on the canvas** → context menu (ACXV + bring/send + select-all) —
a second surface for editing, kept for power users.

File-noun = **"Scene"** (`∑CG`-revisitable: Drop / Set / Plate / Board).
Deliberately absent: account/avatar, Share/collaborators, cloud-sync, template
gallery, upgrade/paywall.

---

## 8. UI system

Three persistent surfaces + the canvas; design language = `DESIGN.md` (dense,
flush, square `radius:0`, hairline-ruled, iA Writer Quattro mono,
cream/forest-green/amber; 2px major / 1px nested dividers; `.segmented` groups;
*text breathes, containers go flush*).

- **Omnibar** (floating, bottom by default): `[ TOOLS ] · [ SETTINGS ] · [ PANELS ]
  · [ › overflow ]`. Tools are **stacks**; only the **selected** tool fans its
  subtools on hover. The old always-on ⌘K command bar was **removed** (un-
  discoverable); the centre is contextual settings.
  - **MOVE** (V) move/transform/crop · **SELECT** (M) marquee/lasso/magnet/flood/
    superflood · **ADJUST** (A, a *mode* — surfaces the layer's effects stack)
    fx/colour/styles · **TEXT** (T) text/on-path · **PIECES** (P) shape/pen/pencil.
  - Overflow `›` → second bar: canvas size · document setup · align · rotate.
- **Utility rail** (above the omnibar): hover = peek, click = **pin**; pinned
  modules share **one uniform height** (tall ones scroll, sticky header) — this is
  what lets the bar+rail dock to any edge. Layout persists locally.
- **Modules:** Effects (single-open accordion) · Layers (flush, tree-elbow groups,
  candy-stripe hidden rows, eye-on-hover, `Blend [Normal] at [100%]`, big Upload +
  group/dupe/toss) · Inspector · **Colour** (live chip → tabbed picker) · Export ·
  overflow modules.
- **Colour picker** = one card, three tabs:
  - **Swatches** (default) — draggable hue×tone wall.
  - **Prism** — wavelength spectroscope (nm + band), shaped by `WATTS` (intensity)
    and `NTU` (haze). `∑CG` names.
  - **Shade** — 24-hue reel → 5 named tonal shades.

---

## 9. v1 feature contract (vetted lists)

**Effects — Tier 0 (Fabric built-ins, no shaders):** Brightness · Contrast ·
Exposure · Saturation · Vibrance · Hue Rotate · Temperature (warm/cool linear gain,
**not** Kelvin) · Grayscale/B&W · Sepia · Invert · Threshold · Gamma · Gaussian
Blur · Sharpen/Emboss/Edge (Convolute) · Noise/Grain · Pixelate · Colour
Overlay/Tint · Posterize.
**Effects — Tier 1 (custom GLSL, with Canvas2D fallback):** Levels · Colour
Balance (OkLab) · Vignette · Duotone.
**Layer-level:** Opacity · Blend mode · Drop Shadow.
**Async bake:** Remove Background.

**Colour adjustments cut-line:** Tier 0 built-ins + **Levels** + **Colour Balance**
only; everything multiplicative in **linear light**; OkLab reserved for Colour
Balance. (**Curves → v1.1.**)

**PIECES:** Rectangle (corner radius) · Ellipse/Circle · Line (45° snap) · Polygon
(n-gon) · Star (computed → `fabric.Polygon`) · **basic Pen authoring** (click
anchor / drag handles / close / Esc → `fabric.Path`) · **Pencil** (perfect-freehand
pressure) + simple `PencilBrush` fallback · per-piece fill (solid+gradient) /
stroke / opacity. (**Full bezier node editor → v1.1.**)

**Text:** point (`IText`) + area (`Textbox`), in-canvas editing; fonts = system
stack + bundled woff2 + user-uploaded local (`FontFace`, never leaves browser);
size/weight/style, align incl. justify, line-height, char-spacing (object-level),
fill (OkLCH/palette), stroke, under/over/strike, per-range styles, baseline, RTL,
drop shadow; text-on-path **decorative-grade**.

**Export & history:** PNG/JPG/WebP (native) + AVIF (lazy WASM, feature-detect) ·
1×/2× scale · quality slider (lossy only) · live size estimate (bg-encode) ·
whole-canvas + per-layer solo (transparent offscreen) · area-clamp + tile + output-
verify · import via `createImageBitmap` (downscale to artboard, keep original by
reference). History = command/patch ring buffer (50–100) over the doc model,
content-addressed COW raster snapshots, coalesced slider drags.

**Persistence:** Dexie stores (`projects` = artboard + layer tree + effect stacks
as JSON; `blobs` content-addressed by SHA-256, ref-counted; `handles`; `snapshots`
for recovery) · OPFS for large rasters · FS Access `.substrata` (+ fallback) ·
`fflate` STORE-mode zip (`manifest.json` + `blobs/<sha256>`) in a Worker ·
debounced transactional autosave · `persist()`/`estimate()` surfaced.

**Should (post-v1, pre-stretch):** local project manager (thumbnails) · align/
distribute · eyedropper + recent colours · drag-reorder rail · batch social-size
export · HEIC import (lazy libheif) · reduced-motion/high-contrast + keyboard a11y.

---

## 10. Deferred (v1.1 / v2)

- **Curves** (spline editor + LUT-texture binding) — v1.1.
- **Full re-entrant bezier node editor** (node select/move/add/delete, corner↔smooth,
  snapping) — v1.1.
- **regl / WebGL2 float-target offscreen compositor** — v2 (fixes 8-bit banding +
  GPU-memory pressure; the trigger is profiling, not a date).
- **Bokeh / lens blur** (multi-pass) — v2, needs the compositor.
- **opentype.js + text-as-outlines vector (SVG/PDF) export** — when vector export
  ships.
- **Pro typography** (per-char tracking/kerning, justified path text).
- **Multi-artboard / carousel**, brushes/retouch, on-device generative AI,
  user-built local templates, optional encrypted sync (never default).

---

## 11. Non-goals

No masks/clipping · no account/login/cloud/sharing/collaboration · no template
marketplace or templates-first onboarding · no paywall/watermarks/upsell · no
content tracking/ads/secret-remote-AI · not a Photoshop clone (no channels, smart
objects, CMYK/print colour management, RAW develop, 100-tool toolbar) · no embedded
stock/icon/font store · no silent project-format migration that breaks saved files.

---

## 12. Residual risks (accept + monitor)

- **8-bit banding** on long colour stacks until the v2 float pipeline.
- **Safari/iOS data loss** — ~7-day bucket eviction + heuristic `persist()`;
  mitigated (export-as-truth, A2HS prompt) not eliminated.
- **Model weight on mobile** (~115 MB) + the v4 WebGPU runtime unproven for
  BiRefNet-lite — smoke-test early.
- **Single-thread WASM** (Firefox / older Safari) is 2–4× slower and can look hung
  — needs a clear UI signal.
- **Two-model desync** (Fabric vs doc model) if one-way sync isn't strict.
- **GPU context loss** with many filtered layers — 2D fallback is degraded; the
  shared compositor may be forced forward from v2.
- **toSVG XSS** returns the moment vector export / shared-file import is added —
  only fully closed by staying raster-only.

---

## 13. Project file format

- **In-browser:** Dexie/IndexedDB doc JSON + content-hashed blobs + thumbnail;
  OPFS for big rasters.
- **Portable `.substrata`:** versioned `fflate` STORE zip = `manifest.json` (schema
  version, artboard, layers, effect stacks, blob-hash refs) + `blobs/<sha256>`.
- **Versioned & migratable** from day one (Dexie migrations); never auto-migrate
  destructively. Treat imported files as **untrusted**.

---

## 14. Copy gaps (∑CG)

All user-facing strings are `∑CG` gaps with commented spec/sample, filled via
**slopsieve**. Known: colour-picker names (Prism / WATTS / NTU + shade families),
the cutout/effect gating body, the **local save-status** text, the Edit history
hint, Clip mode descriptions (if reinstated), empty-state/onboarding microcopy, and
the file-noun ("Scene"). Colour *family* names come from `lib/colour-names.ts`.

---

## 15. Milestones

- **M0 — Scaffold.** `app/editor/` route + own root layout (no sidebar); window
  shell + **finalised top bar** (§7); PARITY.md non-parity carve-out; pin
  `fabric ^7.4.0`; secure-context guards; Dexie schema v1.
- **M1 — Canvas + layers.** Fabric canvas (imperative, doc-model-owns-truth),
  artboard, raster import (Upload/paste/drop, `createImageBitmap` downscale),
  Layers module, MOVE, undo/redo (command/patch), Dexie autosave. **WebGL guard
  rails in from day one** (textureSize clamp, preview-downscale).
- **M2 — Make.** TEXT (+ FontFace + fonts.ready gating), PIECES (shapes + basic
  Pen + perfect-freehand), SELECT, Inspector, snapping.
- **M3 — Effects.** Per-layer stack: Tier-0 built-ins + Levels/Colour-Balance/
  Vignette/Duotone customs; Effects accordion; rasterize-text-for-effects path.
- **M4 — Colour.** Tabbed picker (Swatches/Prism/Shade); reuse palette + names.
- **M5 — Persist.** Project manager, `.substrata` zip Save/Open (browser-fs-access
  + fallback), OPFS, storage UX (persist/estimate, export-as-truth messaging).
- **M6 — Export.** PNG/JPG/WebP @1×/2× + lazy AVIF; social presets; size estimate;
  area clamp + tile + output verify.
- **M7 — Smarts.** Remove Background (BiRefNet-lite fp16, self-hosted, IndexedDB
  cache, WebGPU + WASM fallback) as a bake effect; align/distribute; magic resize.
- **Cross-cutting:** omnibar + rail system, rail-anywhere docking, keyboard map,
  a11y, reduced-motion.

---

## 16. Sketches — visual source of truth

Interactive HTML mockups under `sketches/` (gitignored, not shipped):

- **`mockup.html`** — assembled MVP: top bar (Scene/Edit/Workspace/Help) + canvas +
  omnibar + rail with Effects/Layers/Colour pinned + context menu. Closest to "the app".
- **`omnibar.html`** — omnibar + pin-to-rail + docking.
- **`modals.html`** — flush Effects accordion + Layers panel.
- **`pickers.html`** — colour-picker basics (hue cube / HSV triangle / RGB).
- **`pickers-fun.html`** — the keepers: Swatches, Prism, Shade.
- **`backdrop-sketch.html`** — original full-editor layout study (pre-rename).

> The research + adversarial findings these decisions rest on live in the workflow
> transcripts; the surviving conclusions are captured above.
