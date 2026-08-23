# STATE — delphitools working state

Updated 2026-08-21, after the Auto Subtitle cue grid. A fresh session should read
this file, CLAUDE.md and PARITY.md before touching anything. Session log
runs bottom-up (newest last).

## Where the repo stands

- Ember app at the repo root (`v2-ember` branch). HEAD is `f977449`
  (feat: auto-subtitle tool). `f167b82` before it carries the dev-encoder
  batch, the `-genny` rename and the 404 scene. Ruby triggers commits
  explicitly.
- UNCOMMITTED on top: the second Auto Subtitle pass (model tiers, Accurate
  mode, progress aggregation, editable cue grid) — see the 2026-08-21
  session entry at the bottom.
- Verification (2026-08-16, all green): `bun run lint` 5/5, `bun run
test` 554 pass / 1 pre-existing skip, `node scripts/verify/classes.mjs`
  ALL PASS (2904), `node scripts/verify/all.mjs` 59/59 rigs, `bun run
verify:static` ALL PASS (34) on a FRESH build+prerender, main 130.8 kB.
  Prerender writes 80 routes plus `dist/404.html` for the Pages
  catch-all (SPA shell + 404 head; static.mjs checks it).
- PARITY.md: tracked 83 / web 79 / backlog 33 (agents raced the summary
  counts mid-batch; reconciled by hand — see session log).
- Copy gaps: none outstanding. `slopsieve --list` should stay empty; prompt
  files under docs/handoffs/ carry the literal token but are gitignored and
  invisible to slopsieve.
- No dependencies added this stretch; package-lock.json untouched since
  the 2026-08-13 resync.
- `scripts/verify/classes.mjs` fails when a `dt-`/`sub-` class used in any
  component has no rule under app/styles. It exists because a bulk scss
  edit once silently deleted an unrelated rule block — never edit scss by
  anchor-range slicing.
- Stale-Vite-graph note: `bun run start` accumulates in-place edits and
  can serve inconsistent modules; restart the dev server before trusting
  any mid-session rig failure, and `verify:static` needs a fresh
  `bun run build` + `bun run prerender` or og/budget checks fail
  spuriously.

## What exists after this stretch (compact)

- **Audio & Video category**, six tools: Subtitle Converter (srt↔vtt,
  shift, scale presets 23.976/24/25, VTT Kind/Language headers), Frame
  Extractor (stills + contact sheet, laserdisc transport ±5 s/±1 s/±frame
  at an assumed 30 fps, Download-all zip, photo-booth print animation),
  Video to GIF (range/fps/width, AnimatedGifEncoder in lib/gif.ts),
  Audio Trimmer (drag selection, fades, wav export, selection loop +
  playhead, zoom), Audio Atlas (meta incl. peak dBFS + BS.1770 LUFS,
  waveform + spectrogram, zoom minimap, play/pause, A–B loop over the
  zoom window, playhead, click-to-seek), Waveform Generator (size
  presets + custom, detail, colours, PNG/SVG).
- **Shared libs**: lib/subtitles.ts, lib/audio.ts (AudioIntake,
  ViewWindow, peaks, wav writer, fades, LUFS, FFT), lib/video.ts
  (VideoIntake, seekTo, resolveDuration), lib/omni.ts, lib/hero-art.ts;
  components/wave-minimap.gts (+ shared .dt-wavewrap/.dt-playhead).
- **Front page**: doodle layout (centred rotating hero art from the
  lib/hero-art manifest with credit + shuffle, omnibox under it).
  Omnibox reads colour / unit / bases / timestamp / expression / prose /
  ciphertext, routes dropped files via the registry `accepts` field,
  carries `?color=` into seven colour tools.
- **Shared UI anatomy** for AV tools: flush action bar → stacked-cell
  settings grid → work surface. `.segmented` needs explicit columns
  (bare use stacks vertically — bit twice).
- PARITY.md: 66 tracked / 62 web.
- **Colour palette dialog** (uncommitted, 2026-08-13):
  `components/colour-palette-dialog.gts`, opened from the About dialog.
  Reads the live `--token` values off `document.documentElement`, resolves
  each `oklch(...)` through a 1×1 canvas (so it follows the active theme
  and cannot drift from app.scss), and shows a card wall with hex/RGB/HSL/
  CMYK/OKLCH per colour, tokens that share a value folded onto one card.
  `rgbToCmyk` (naive, no ICC profile) added to colour-maths with a unit
  test; the CMYK footnote is a live copy gap.
- **Shared media accept lists** (uncommitted): `AUDIO_ACCEPT`/`VIDEO_ACCEPT`
     - `acceptAttr()` in tools.ts, used by both the registry `accepts` (omnibox
       drop routing) and each AV tool's own `<input accept>`, so the picker and
       the drop target cannot disagree. The extension list widens the bare
       `audio/*`/`video/*` wildcard for the iOS Files picker, which greys out
       formats it has no UTI for (.ogg/.mp3 were unselectable on iPad).

## Substrata bugs (Ruby's testing, 2026-08-11) — TRIAGED AND FIXED

1. **Preset sizes are not centred properly.** Real bug, fixed.
   `fitView` centred the artboard in the raw canvas element, ignoring the
   chrome painted over it: the 22px ruler bands and the omnibar/rail docks
   (82px at the bottom by default). Every fit put the artboard low, with
   its bottom edge under the omnibar. `chromeInset()` in fabric-canvas now
   measures each dock off its edge class and subtracts the ruler bands, and
   `fitView` centres in what is left. Covered by two new checks at the end
   of `scripts/verify/workspace.mjs`, which run with the omnibar docked
   LEFT so the inset generalises across edges.
2. **LOOKS and FX panels do not populate.** Not a defect — never ported.
   `omnibar/modules.gts` registered them with `body: ModuleStub` (an empty
   div) plus `// pass 2:` pointers at the Next sources. Adjust populated
   because its body was the real `ToolModuleBody`. Both ported now.
3. **The colour panel does not show up.** Same cause, same fix.
4. **Arrange does not show up** (reported after the first three landed).
   The fourth `ModuleStub`, ported the same way. Every module in the
   registry now has a real body, so `ModuleStub` and its `.sub-module-stub`
   rule are both gone; the panel rigs still assert the class is absent.

Ported this stretch (Next `.tsx` → `.gts`, logic libs were already in
place, so these were UI translations):

- `modules/looks-panel.gts` + `styles/substrata/_looks-panel.scss` —
  film-sim/LUT gallery, live per-layer thumbnails, None row, intensity.
- `modules/colour-panel.gts`, `modules/colour-picker-kit.gts`, the six
  files under `modules/colour-modes/` and `_colour-panel.scss` — the
  7-mode picker (the hue cube is inline in the panel).
- `modules/fx-panel.gts` + `_fx-panel.scss` — add picker, both pipeline
  zones with per-zone sortable, accordion blocks, generic param rows from
  the registry ParamSpecs, remove-background status body.
- `modifiers/pointer-area.ts` — the shared normalised drag surface
  (`usePointerArea`'s replacement), transient-bracketed.
- `lib/substrata/fx-icons.ts` — the FX type→icon map lives in a plain .ts
  because `scripts/gen-icons.mjs` imports it; names behind a map are
  invisible to the generator's template scan.
- `.sub-slider` in `_shared.scss` — a native range input replaces the
  Next app's Radix Slider (LOOKS intensity + every FX slider param).
- `modules/arrange-panel.gts` + `_arrange-panel.scss` — align to the
  artboard, distribute (≥3), rotate, flip, each one undo step through
  setTransforms.

New rigs: `scripts/verify/looks.mjs` (12), `colour-panel.mjs` (19),
`fx-panel.mjs` (19), `arrange.mjs` (16). `classes.mjs` now covers `sub-`
classes as well as `dt-` (2070 → 2465 uses checked); four
genuinely-unstyled substrata wrappers are listed in its
UNSTYLED_CONTAINERS with reasons.

`fx-panel.mjs` deliberately never adds **Remove Background** — the kick
downloads a ~44 MB model, which is `bg-removal.mjs`'s job. That left the
matte body uncovered, and it was broken: `ensureMatte()` ran inside the
`status` getter, dirtying a tag already consumed in the same render, so
Ember asserted and the body rendered EMPTY. The kick is now an element
modifier (post-render, like the React effect it was ported from). Verified
by hand before and after — 1 assertion + blank body, then 0 + "Downloading
model…".

Adjacent bug, FIXED 2026-08-13 (uncommitted): `layers-panel.gts`'s
`handleDragEnd` ignored `event.canceled`, so Escape mid-drag still committed
a layer reorder. Now `if (event.canceled) return;` after the draggingId
reset, matching the `substrata-shell.gts` dock-drag guard that fx-panel's
zones already use.

Also hardened: the pixel-selection popup rendered as soon as a selection
existed, but its position comes from the canvas's after:render pass, so
nothing stopped it painting at a stale anchor first.
`reportSelectionAnchor` now carries the selection's epoch and the popup
renders only once the anchor matches its own selection; `select.mjs`
waits for the popup instead of assuming the frame landed.

**Read this before chasing a substrata rig failure.** The symptom that
led here — `select.mjs` failing 3/3 with the popup stuck at 0,0 — turned
out to be mostly a STALE VITE MODULE GRAPH. A long-lived `bun run start`
accumulating many in-place edits serves inconsistent modules, and two
copies of selection-popup.gts mean the canvas reports the anchor into one
module's state while the rendered popup reads the other's. Restarting the
dev server made the same rig pass 3/3 with no code change. Restart it
before believing any editor-rig failure that appears mid-session.

## AV plan — remaining waves

Everything processes locally; ffmpeg.wasm stays ruled out (~31 MB +
COOP/COEP). Per-codec wasm self-hosted in /public (jxl pattern).

### Wave 3 — recorders (MediaRecorder) — SHIPPED `8d25430`

voice-recorder and screen-recorder both shipped (level meter, pause/resume,
playback via resolveDuration, webm/wav export, rigs). lib/video's
`resolveDuration` covers MediaRecorder's Infinity-duration output (Chromium
bug 642012).

### Wave 4 — first heavy dependencies

| Tool        | id            | Core                                                                                   |
| ----------- | ------------- | -------------------------------------------------------------------------------------- |
| Video Muter | `video-muter` | mp4box.js remux, drop audio track, no re-encode                                        |
| Video Atlas | `video-atlas` | mediainfo.js (~2.5 MB wasm, self-hosted): container, codecs, bitrate, real fps, tracks |

Video Atlas's container parsing also unlocks: true source sample rate in
Audio Atlas (decodeAudioData resamples to context rate today) and the
real frame rate for Frame Extractor's frame step (currently assumes
30 fps, marked in the component).

### Tier 2 / Tier 3 (surveyed, not scheduled)

- Tier 2: Audio Converter (per-codec wasm encoders), Audio Normaliser
  (LUFS measure + gain — `integratedLufs` already exists), Audio Speedup
  (soundtouch port), Audio Extractor (video → wav), Video Trimmer
  (mp4box keyframe cut; WebCodecs for exact cuts).
- Tier 3: Video Converter, Video Compressor, video social cropper, and
  **Subtitle Studio** (requested): video + subs matched and edited
  together over a waveform cue timeline; exports subtitle file → embedded
  track (mp4box remux) → burnt-in captions (canvas + WebCodecs).
  lib/subtitles.ts is its parse/write core; the trimmer/atlas zoom +
  minimap machinery (ViewWindow, WaveMinimap) is its timeline seed.

## Omnibox microtools — SHIPPED `8d25430`

Built: Encoding Tools row, Shavian, paper sizes, glyph lookup, Tailwind
class, URL→QR, SVG optimise, algebra. Ceilings fixed: named CSS colours now
parse (via a canvas resolve in colour-parse, NOT color-name-list — see the
bundle-budget note); unit detection falls through to unit-converter's
UNIT_CATEGORIES symbol index (e.g. `5km`).

## v1 sticker port — SHIPPED `8d25430`

Per-tool sticker + end-of-list sticker wall ported to `sticker-wall.gts` +
`_sticker-wall.scss`, `public/stickers/` restored, wired into the tool
template and About. Tools added since the v1 port (colour-atlas, the AV
tools) have no `lousy/<id>.png` art yet — the per-tool sticker renders
nothing for those; Ruby draws the missing art.

## Per-tool checklist (every tool, every time)

1. Component `app/components/tools/<id>.gts` — registry auto-globs.
2. Entry in `app/lib/tools.ts`; description is USER COPY — leave a copy
   gap with spec+sample. Names 1–3 words. `accepts` for file-taking
   tools; `carryColour` only if the tool reads `?color=`.
3. `app/styles/tools/_<id>.scss` + `@use` in app.scss; flush bar +
   stacked-cell settings grid anatomy; `.segmented` always with columns.
4. New icons → `node scripts/gen-icons.mjs`.
5. PARITY.md row + counts.
6. Unit tests for lib logic; harness checks for canvas/worker/transport
   behaviour (audio-tools.mjs / av-tools.mjs pattern).
7. `bun run lint`, `bun run test`, `node scripts/verify/classes.mjs`
   green before done.

## Deferred decisions

- mp3 export in Audio Trimmer: lamejs (~150 KB) or stay wav-only.
- Whether the video-to-gif settings row adopts the stacked-cell grid
  (only tool still on inline label+input pairs).
- Frame Extractor true-fps frame step (blocked on wave-4 mediainfo).

## Next actions

1. Re-run or diagnose the three unrelated aggregate-rig failures, then commit
   the accumulated stretch (close-out + six tools + passes + 404 + Auto
   Subtitle).
2. AV wave 4: Video Atlas (mediainfo.js, ~2.5 MB self-hosted wasm) and
   Video Muter (mp4box.js remux, no re-encode). Unlocks true sample rate
   in Audio Atlas and real fps in Frame Extractor (which then also drops
   the 30 fps assumption).
3. Turbo-nerd pack: Morse, Braille, IPA, NATO — cheap, no deps.
4. Sweep: every `crayon.screen("sm")` in app/styles applies at ALL widths
   (min-width, sm:0); audit which were meant as small-viewport rules.

Deferred decisions stay in the section below; the tool backlog lives in
`docs/handoffs/tool-backlog.md` (gitignored), mirrored in PARITY.md.
Recorded backlog decisions: Text & Typography utilities fold into the
Text Scratchpad (`markdown-writer`), never standalone tools; Metadata
Stripper stays plain EXIF/GPS/XMP (C2PA is detect-only, shown as a report
row, never stripped).

### Historical note

The four 2026-08-13 handoff prompts (AV wave 3 recorders, the omnibox
microtools, the v1 sticker port, the bundle-budget fix) all shipped in
`8d25430`; hero-art 2.8:1 is `7fb292e`. Batch 1 (PDF + images) is
`66b6f15`. All prompts live in `docs/handoffs/handoffs.md`.

## PDF batch (2026-08-14) — BUILT, all gates green, COMMITTED

Three PDF-category tools, all built and verified, committed on top of HEAD
`66b6f15`. Drove the batch with the **omp-batch** skill
(`.claude/skills/omp-batch/SKILL.md`, gitignored local): kimi via
`omp -p --cwd <repo> "@promptfile"`, plus a Claude subagent for the numberer
and the compressor. Dev server :3000 is Ruby's; restart if an editor rig flakes
(stale Vite graph).

Verification run (2026-08-14): `bun run build` (mupdf absent from the eager
graph), `verify:static` ALL PASS (31; main 129 kB), `bun run lint` (5/5),
`bun run test` (430 pass), `classes.mjs` ALL PASS, `pdf-page-numberer.mjs` 4/4,
`pdf-compressor.mjs` 5/5 (201588 → 29115 B, 12 pages kept). Cloudflare free
static limits: dist 454 files / 20,000 cap; largest file the pre-existing 20.6 MB
ONNX wasm / 25 MiB cap; mupdf-wasm.wasm 9.9 MB. package-lock resynced (mupdf).

1. **pdf-page-numberer** (built by me) — DONE, type-clean, NOT YET REGISTERED.
   Untracked files: `components/tools/pdf-page-numberer.gts`, `lib/pdf-stamp.ts`
   (placement + number-format maths, bun-validated), `tests/unit/lib/
pdf-stamp-test.ts`, `styles/tools/_pdf-page-numberer.scss`, `scripts/verify/
pdf-page-numberer.mjs`. Page numbers (template `{n}`/`{N}`, start-at,
   skip-first) + optional text stamp, both placed via a 3×3 anchor picker, drawn
   with pdf-lib Helvetica (dynamic-imported, lazy), no page re-encode. Blob
   download uses `new Uint8Array(out)` (the organiser's fresh-buffer fix — kimi
   caught the original type error). LANDED: registered in `tools.ts` (`pdf`
   category, icon `file-digit`, name "Page Numbers"), `@use` added, PARITY row
   added, rig 4/4.

2. **pdf-rotate-crop** (built by kimi via OMP) — DONE, REGISTERED, rig 19/19.
   Files: `components/tools/pdf-rotate-crop.gts`, `lib/pdf-crop.ts` (+ 11 unit
   tests), `styles/tools/_pdf-rotate-crop.scss` (`@use` added),
   `scripts/verify/pdf-rotate-crop.mjs`. `tools.ts` entry "Rotate & Crop" in the
   `pdf` category (icon `crop`). PARITY row currently in the Print & Production
   table (no PDF table yet). One copy gap: `tools.ts:590` (its description). No
   deps added. Crop converts preview px → PDF points via pdf.js viewport, stores
   in user space, intersects the existing CropBox on export.

3. **pdf-compressor** — BUILT (MuPDF wasm, in a Web Worker). Files:
   `components/tools/pdf-compressor.gts`; a three-file lib mirroring the pandoc
   split — `lib/pdf-compress-core.ts` (pure: `resizeTo` + `STRUCTURAL_OPTIONS` +
   types + `formatBytes`/`savingsPercent` re-export), `lib/pdf-compress.worker.ts`
   (all mupdf work: `getMupdf` + `recompressImages` walk + save), and
   `lib/pdf-compress.ts` (main-thread client: spawns/keeps the worker, `compressPdf`
   posts + transfers buffers); `tests/unit/lib/pdf-compress-test.ts` (6 tests, on
   the pure core), `styles/tools/_pdf-compressor.scss`,
   `scripts/verify/pdf-compressor.mjs` (own npm script `verify:pdf-compressor`,
   excluded from all.mjs — heavy wasm). Registered in `tools.ts` (icon `shrink`,
   name "PDF Compressor"), `@use` added, PARITY row added. The mupdf runtime is
   copied verbatim into `/public/mupdf/` (mupdf.js + mupdf-wasm.js +
   mupdf-wasm.wasm + LICENSE.mupdf.txt; re-copy from `node_modules/mupdf/dist/`
   on a version bump) and loaded INSIDE the worker through the jxl.ts `new Function`
   bundler-ignore idiom, so the 9.9 MB wasm never enters the module graph and
   default `new URL` resolution finds it as a sibling — no locateFile.
   `/public/mupdf/` is lint/prettier-excluded.

      WORKER + explicit trigger (Ruby: "it makes the entire browser hang while it
      compresses, and it does that automatically … make this async, non-blocking, and
      make the user actually click compress"): all mupdf calls are synchronous wasm,
      so they run in `pdf-compress.worker.ts` off the main thread — the tab stays
      responsive. Loading a file no longer compresses; it only reads the bytes. A
      **Compress** button (primary, in the action bar) starts the run; the spinner
      animates because the thread is free. Changing Images/Quality/Max size drops the
      stale result (`#invalidate`) rather than auto-recompressing, so the user
      re-clicks Compress. Download stays disabled until a result exists. The rig
      asserts "does not auto-compress on load".

      TWO shrink paths (Ruby: "the compressor barely does anything. can I at least
      have options for image compression"): (1) always-on structural pass
      (garbage=deduplicate, compress streams/images/fonts, subsetFonts) — lossless,
      but barely helps image-heavy PDFs; (2) NEW image recompression (default on) —
      walk every image XObject, optionally downscale to a longest-edge cap, re-encode
      as JPEG at a quality slider. NO binary swap was needed: the mupdf wasm already
      exposes Image.toPixmap → Pixmap.warp (downscale) → Pixmap.asJPEG(quality) plus
      PDFObject.writeRawStream to write it back in place. Controls: Images
      Keep/Recompress, Quality 30–90 (default 65), Max size Full/2400/1600/1000 px.
      Rig (image fixture): 847 kB → 351 kB at q65/Full. SAFE-v1 ceilings (named in
      the code): skips 1-bit ImageMask stencils and images with an SMask (JPEG has no
      alpha — never deletes the mask), skips codecs MuPDF cannot decode
      (JPEG2000/JBIG2, via try/catch), and only writes an image back when the JPEG is
      actually smaller than the stream it had (never enlarges; a standalone grayscale
      SMask object may still be re-encoded — minor). `mupdf` is in `dependencies`
      (never bundled — only the rig imports it and the re-copy needs it).

### Close-out — DONE

All landed: both new tools registered in the `pdf` category with `@use` lines;
PARITY split into `## PDF` (preflight, organiser, image-to-pdf, rotate-crop,
page-numberer, compressor) + `## Print & Production` (imposer, zine); counts
reconciled to tracked 76 / web 72; backlog trimmed to 39 (page-numberer +
compressor removed). All gates green (see the run above). package-lock resynced.
The `lib/pdf.ts` shared refactor stays deferred (ponytail — don't rewrite working
tools for no user gain).

REMAINING for Ruby: none. Resolved before commit:

- Copy gaps: all three PDF tool descriptions filled in `tools.ts`
  (`pdf-rotate-crop`, `pdf-page-numberer`, `pdf-compressor`); no `\u2211CG`
  tokens remain anywhere in the tree, so `slopsieve` reports zero gaps.
- The `docs/frontpage/README.md:123` leak is gone — the bare copy-gap token was
  stripped from that comment.
- The batch was committed in the same commit that carries this STATE edit.

## Session 2026-08-15 — metadata stripper + i2p tab polish (UNCOMMITTED)

Small UI/logic pass, sits on top of `efd9779` alongside Ruby's own unstaged
work (pdf-organiser, imposer, pdfjs, vite.config, etc. — left untouched).

- **Metadata Stripper**: dropped the "Pixel data: Untouched/Re-encoded" cell
  (noise — the re-encode fact is already in the "Removed" label as
  `All metadata (re-encoded)`). Removed the now write-only `reencoded` getter
  and `StripState.reencoded` field with it.
- **C2PA detection added** (read-only): `parseMetadata` now returns
  `c2pa: boolean`, set when the JUMBF superbox type `jumb` and the label `c2pa`
  both occur in the bytes (`bytesIndexOf`, whole-file scan, works across all
  four containers). Surfaced as a "Content Credentials → C2PA found / None"
  cell. A stripped image reports None afterward. Test: "flags a C2PA manifest
  by its JUMBF markers".
     - RECONCILES with the prior decision ("no C2PA credential removal", STATE
       line ~284 / tool-backlog line ~28): that ruled out _removal/re-signing_.
       This is _detection_ only — a report row, nothing is stripped or rewritten.
     - **SynthID deliberately NOT added**: it is an imperceptible pixel-domain
       watermark needing Google's proprietary detector model, not a metadata
       marker. Nothing to byte-scan; any indicator would be a guess.
- **Images to PDF**: gave `.dt-i2p-tab` `height: crayon.size(10)` +
  flex-centre so its tab buttons match the QR (`.dt-qr-tab`) and Barcode
  (`.dt-code-tab`) generators, which were already pinned to that height. The
  i2p tabs previously had no height rule and fell back to the shorter
  `.dt-tabs-trigger` padding.

Verification: `lint:types` clean, `npm test` 441 pass / 0 fail / 1 pre-existing
skip, prettier + eslint clean on changed files. Not committed (Ruby triggers
commits).

## Session 2026-08-15 (cont.) — DESIGN.md recovered + rewritten, ppn layout fix

Housekeeping, still UNCOMMITTED on top of `efd9779`.

- **DESIGN.md recovered and rewritten.** The file was deleted long ago; the last
  blob is in commit `90beb85` (`git show 90beb85:DESIGN.md`). That version
  documented the old Next/React/Tailwind tree (`.tsx`, `globals.css`, Radix), so
  it was rewritten for the current Ember/Glimmer + Crayon stack: the crayon API
  (`size`/`font-size`/`font-weight`/`font-family`/`color`, `vstack`/`hstack`/
  `hover`/`screen`/`dark` mixins), the OKLCH `var(--token)` set, zeroed radii,
  the two border weights, `.segmented` vs sibling-border hairlines, tool anatomy,
  the additive tabs primitive, `classes.mjs`, the copy-gap rule, and the gate
  commands. Canonical references updated to the real `.gts` tools (qr-genny,
  code-genny, background-remover, pdf-page-numberer).
- **pdf-page-numberer layout fix** (Ruby: "what the hell is this, looks so bad").
  Two real bugs in `_pdf-page-numberer.scss`:
     1. `.dt-ppn-fields` used `auto-fit minmax(size(28),1fr)`, cramming
        Font/Size/Margin/Position into narrow tracks; the 3-button segmented font
        picker had no `min-width:0` and overflowed into the Size column. Replaced
        with a fixed `minmax(0,1fr) minmax(0,1fr) auto` grid (Size · Margin ·
        Position on one row), Font + Format span full width, `min-width:0` on
        `.dt-ppn-field` and `.dt-ppn-opt`.
     2. `.dt-ppn-controls` had `background: var(--border)`; as a stretched grid item
        all space below the last block painted in the hairline colour (the dark
        void). Now `background: var(--card)` with blocks divided by `& + &`
        `border-top` hairlines. Template: Font field gets `dt-ppn-field-wide`.
        Verified in-browser at :3000 with a synthetic 8-page PDF (screenshot). stylelint
     - `classes.mjs` clean for `dt-ppn-*`; DESIGN.md prettier-clean.

**WARN**: `node scripts/verify/classes.mjs` FAILS on Ruby's uncommitted
`pdf-rotate-crop.gts` — `.dt-prc-settings-2` and `.dt-prc-paperfield` are used
with no rule in `app/styles`. Not mine; left untouched. Ruby's WIP to resolve
before that gate passes.

## Session 2026-08-15 (cont.) — pdf-page-numberer redesign pass

Second, larger pass on the same tool (Ruby: "too stretched, preview doesn't
respect aspect ratio, position selectors need lucide arrows, sections need a
pass, use shadcn not native checkboxes, put Apply at the bottom full-width").
All UNCOMMITTED.

- **Preview aspect ratio.** It distorted because the box got an explicit
  width+height and `max-width: 100%` squished width without height. Now the box
  is `width + aspect-ratio` with `container-type: inline-size`; `max-width: 100%`
  shrinks it proportionally. `#overlayStyle` was rewritten from absolute px to
  `cqw` units (`value / pageWidthPoints * 100`), so the number/stamp overlays
  track the page at any display size. Preview column 320→360px, vertically
  centred.
- **shadcn primitives.** The two native checkboxes are now `ui/switch` (Switch);
  the sections Style native `<select>` is now `ui/select` (Select/Trigger/Value/
  Content/Item). Handlers changed: `toggleNumbers/toggleStamp` →
  `setNumbersOn/setStampOn(boolean)`; `setSectionStyle(index, value)`.
- **Position pickers = lucide arrows.** The 3x3 dot grid is now directional arrow
  icons (arrow-up-left … arrow-down-right, `dot` centre) via an `ANCHOR_ICON`
  map read with the `{{get}}` helper. Icons added to `scripts/gen-icons.mjs`
  EXTRA (dynamic ref, invisible to the scan) and `node scripts/gen-icons.mjs`
  re-run (220 icons).
- **Layout de-stretched.** Size/Margin are now narrow inline inputs
  (`.dt-ppn-metrics`), Position dropped to its own full-width row below them, so
  no awkward L-gap. Sections numeric columns 5rem→3.5rem so the Style select
  shows "1, 2, 3" instead of truncating to "1..".
- **Apply moved** out of the top bar to a full-width primary `.dt-ppn-apply`
  button at the foot of the frame (`border-top: 2px`, height size(14)). The top
  bar keeps only the filename + Clear.
- **Rig updated**: `scripts/verify/pdf-page-numberer.mjs` clicked `.dt-ppn-go`
  (stale even before this session); now `.dt-ppn-apply`. Rig 4/4 green.

Verified end-to-end in-browser at :3000 (8-page synthetic PDF): overlays track
position clicks (cqw), stamp renders, download pipeline intact. lint:types +
stylelint + ember-template-lint clean; `classes.mjs` clean for `dt-ppn-*` (the
two pdf-rotate-crop failures above are still Ruby's, untouched).

## Session 2026-08-15 (cont.) — ppn sliders, inline rows, watermark mode

Third pass on pdf-page-numberer (Ruby: "sliders for size and margin with
debounced preview, position in line with the font/size/margin selectors, stamp
text should have LABEL and WATERMARK modes with an opacity slider"). UNCOMMITTED.

- **Label-beside-control rows** (`.dt-ppn-set`, `grid-template-columns: 5rem 1fr`)
  so Format, Font, Size, Margin, Position line up in one column. Replaces the old
  `.dt-ppn-field`/`.dt-ppn-metrics`/`.dt-ppn-metric` (all removed).
- **Sliders** for Size (`<input type=range>` 6–48) and Margin (0–120, step 2),
  each `.dt-ppn-slider` = range + `.dt-ppn-readout`. **Debounced preview**:
  `fontSize`/`margin`/`watermarkOpacity` are the committed source (readout +
  output, live); the overlay reads debounced mirrors `previewSize`/
  `previewMargin`/`previewOpacity`, copied 100ms after a drag settles via
  `#schedulePreview` (guards `isDestroyed`). Verified: readout jumps to 40
  immediately, overlay font-size 2.62→9.52cqw after the debounce.
- **Stamp LABEL / WATERMARK modes** (`stampMode`, `STAMP_MODES`, segmented
  `.dt-ppn-modes`). LABEL = the existing anchored gray text. WATERMARK = full-page
  diagonal text: centred, `rotate(-45deg)` in CSS / `degrees(45)` in pdf-lib,
  translucent via an Opacity slider (5–60%, `watermarkOpacity` 0–1). Size auto
  from `watermarkSize(pageW,pageH,textLen)` — targets 80% of the page diagonal
  from the string length alone (Helvetica ~0.55em/char), so CSS preview and drawn
  PDF match; apply() centres with `widthOfTextAtSize`. Position picker is hidden
  in watermark mode (replaced by Opacity).
- **apply()** imports `degrees`; branches label vs watermark per page.

Verified in-browser at :3000: watermark "CONFIDENTIAL" renders diagonal at 15%,
3 sliders, mode toggle swaps Position/Opacity, Apply with watermark throws no
error. Rig `pdf-page-numberer.mjs` 4/4 (label-mode numbering path). lint:types +
stylelint + ember-template-lint clean; `classes.mjs` clean for `dt-ppn-*` (the
two pdf-rotate-crop failures remain Ruby's).

Follow-up (same session): the Position 3x3 was lopsided (a 96px square left in a
wide cell). `.dt-ppn-anchors` is now `inline-size: 100%` and `.dt-ppn-anchor`
drops `aspect-ratio: 1` for `height: size(9)`, so the grid fills the control cell
and lines up with Format/Font/Size/Margin. Verified in-browser.

Follow-up 2: Sections rows reworked into a flush table on the `dt-harmony-row`
pattern (Ruby likes that look). `.dt-ppn-sections` is a 1px-bordered frame; a
`.dt-ppn-section-head` column header (From · Style · Start) plus rows, all
`display: grid` sharing `minmax(0,0.7fr) minmax(0,1.6fr) minmax(0,0.7fr) 2.25rem`,
`align-items: stretch`, cells divided by `> * + *` border-left and rows by
border-bottom (last none). Inputs (`.dt-ppn-section-num`) and the Select trigger
go borderless/transparent and fill their cell; remove ✕ is a flush cell. The old
`.dt-ppn-mini`/`.dt-ppn-mini-wide` and per-field labels are gone. Verified
in-browser (2 rows, "1, 2, 3" not truncated). Rig 4/4; gates clean.

## Session 2026-08-16 — rotate-crop close-out (UNCOMMITTED)

Ruby's pdf-rotate-crop WIP (margin insets, crop-to-paper-size) left two
`classes.mjs` failures; resolved:

- `.dt-prc-settings-2` now rules the second settings row as a fixed
  `repeat(3, minmax(0, 1fr))` grid (margins span 2 tracks, paper picker 1).
- Button alignment uses `.dt-prc-settings-2 .dt-prc-applyscope { margin-top:
auto; }`, NOT `justify-content: space-between` on the cells. Space-between
  floats the middle input (slack splits into both gaps), so the inputs can
  never line up across cells. Auto margin pins the buttons to the cell bottom
  and keeps every input 4px under its label.
- `dt-prc-paperfield` removed from the template: redundant once alignment
  lives on the apply scope.
- Prettier drift fixed on `metadata-stripper.gts` and STATE.md.

Verification: in-browser at :3000 (3-page A4 fixture) — inputs top-aligned
at 355, apply buttons bottom-aligned at 426. `classes.mjs` ALL PASS (2744),
`bun run lint` 5/5, `bun run test` 441 pass / 1 pre-existing skip, the
rotate-crop rig 19/19, `verify:static` ALL PASS (31). Note: `verify:static`
needs a fresh `bun run build` + `bun run prerender`; a stale dist fails the
og-card, dev-rig-stripped and eager-graph checks spuriously ("main is 0 kB").

Ready to commit: the full 11-file stretch (Ruby's 10 + the scss fix).

## Session 2026-08-16 (cont.) — dev-encoder batch (UNCOMMITTED)

Six tools shipped via omp-batch (kimi, shared tree) plus two Claude finisher
agents for the two kimi runs that died mid-flight:

- **json-formatter** "JSON Formatter" — source pane is a transparent-text
  textarea over a rendered line view (line numbers + error-row highlight,
  scroll-synced); indent 2/4/tab/minify; Text/Tree views (flattenTree in
  json-format.ts, no recursive component); line:column parse errors (the
  line/column grammar in the engine message is authoritative; bare positions
  are derived back through the source). Rig 26/26.
- **uuid-generator** "UUID Generator" — v4 + v7 (RFC 9562 bit layout by hand
  over getRandomValues) + Nano ID (`b % 64`, no modulo bias), bulk 1–100,
  uppercase/strip-hyphens; option changes reformat in place, never regenerate.
  Rig 15/15, 10 unit tests.
- **jwt-decoder** "JWT Decoder" — per-segment base64url decode (a bad segment
  fails only its own pane), registered time claims humanised, Expired badge,
  signature opaque by design. Rig 18/18, 15 unit tests.
- **password-generator** "Password Generator" — password mode (classes,
  no-lookalikes, rejection sampling) + diceware passphrase over the EFF large
  wordlist (public/data/, lazy-fetched, cached per session; failure path has
  a per-field error + Retry). Rig 22/22.
- **cron-builder** "Cron Builder" — builder and reader directions over
  lib/cron.ts (parser, describer, next-runs iterator; names JAN–DEC/SUN–SAT,
  0/7 Sunday, dom/dow OR semantics). Rig 15/15, 35 unit tests.
- **http-status** "HTTP Status" — 63 codes as typed static data (phrase,
  class, RFC ref + deep link, RFC 9111 cacheability), tailwind-cheatsheet
  anatomy, class tints on the chart tokens. Rig 17/17, 10 unit tests.

Batch mechanics worth remembering:

- Two of six kimi runs hit the 3600s wall mid-flight (password, cron) and one
  silently under-delivered (json-formatter: lib + test only). Completion was
  audited by listing the known deliverables per tool, not by trusting reports.
- The password rig shipped by its agent had never run green: clipboard needed
  `clipboard-sanitized-write` in the override list; a Set returned from
  page.evaluate arrives as an array (no .has); and the wordlist failure path
  must run before the first successful fetch because the lib caches the list
  per session. Fixed inline, rig green.
- image-to-pdf.mjs failure in the sweep predated the batch: the tool moved
  from a segmented `.dt-i2p-dir` to tabs (`.dt-i2p-tab`) on 2026-08-15 and the
  rig's direction click was never updated. Fixed; rig 12/12.
- PARITY summary counts raced between agents and were reconciled by hand:
  tracked 82 / web 78 / backlog 33.

Gates (final, this order): build main 130.6 kB; prerender 80 routes;
static.mjs ALL PASS (31); lint 5/5; 552 QUnit, 551 pass / 1 pre-existing
skip; classes.mjs ALL PASS (2901); all.mjs 59/59. No dependencies added, no
lock resync needed. Copy gaps: 8 (six registry descriptions in tools.ts,
cron-builder arity warning, password-generator wordlist error) — run
`slopsieve`.

Follow-up (2026-08-16, Ruby): Password Generator rows now render per
character — `charKind` in lib/password.ts (Record lookups, not Sets), digits
`var(--chart-3)`, symbols `var(--chart-2)`, letters unmarked; every row gets
`aria-label` with char spans `aria-hidden`. Rig grew to 25 (digit-marked
spans in the digits-only batch, spans rebuild the string exactly, three
colours pairwise distinct). Gates green: 554 QUnit pass, lint 5/5, classes 2901.

Follow-up 2 (2026-08-16, Ruby: "those long switch pills don't do it"): the
UUID Generator's switches edged to 198px because `.dt-uuid-field input {
width: 100% }` out-specifies `.dt-switch` (32px). Fixed two ways: the Count
rule is scoped to `input[type="number"]`, and the two UUID-only switches
merged into a single Options cell as labelled inline rows
(`.dt-uuid-options`/`.dt-uuid-option`) — pill + text label side by side.
Password-generator never had the trap (its inputs are all ranges). Rig 15/15,
classes 2903, lint 5/5.

Also fixed 2026-08-16: an unescaped apostrophe in Ruby's JWT description
(`'Decode a JWT's…'`) broke babel at tools.ts:726 — description is
double-quoted now and prettier-clean.

Generator→genny rename + Kind-in-bar (2026-08-16, Ruby): the four tools
whose file basenames carried `-generator` (uuid, password, matte, scroll)
are now `-genny` end to end — the registry loader keys components by file
basename, so the TOOL ID and route moved too (`/tools/uuid-genny`,
`/tools/password-genny`, `/tools/matte-genny`, `/tools/scroll-genny`);
display names still say Generator. Rigs, package scripts, app.scss @use
lines and PARITY rows all follow; PARITY needed a repair pass after a sed
escape slip (literal `\`` and an ANSI sequence written in). UUID Generator
got the layout move Ruby asked for: the Kind segmented sits in the top bar
(flush, no outer border, intrinsic 85px columns) between the count readout
and Copy all/Regenerate; the settings grid keeps only Count + Options.
Gates: lint 5/5, 554 QUnit, classes 2903, uuid rig 15/15, password rig
ALL PASS, full route sweep 79, static 31/31, main 130.8 kB.

404 adjustments (2026-08-16): tile size is now `25vw` — origin tile centred
bottom-mid with 1.5 regular tiles to each side, i.e. at most four full
tiles across. The bottom-tile cell also carries an opaque
`background: var(--background)`: both PNGs are RGBA, and without the
backdrop the regular grid showed through the art's transparent pixels,
reading as an overlap. Now neither tile paints through the other.

Cron Builder UI/UX pass (2026-08-16, Ruby: "very rough"). Root cause: the
five field cells were crammed at ~178px each into a `repeat(auto-fit)`
settings grid, label + 4-way segmented + inputs + mono field per cell.
Now each field is a full-width ROW (label rail 6rem, intrinsic segmented,
args + flex free-text side container), on the ppn label-beside-control
pattern Ruby already liked. Two footguns bit and are recorded: (1)
`crayon.screen("sm")` is mobile-first MIN-width (breakpoints sm:0 — it
applies at every width); crayon has no max-width mixin, so the narrow
collapse is a literal `@media (width <= 40rem)` (stylelint demands range
notation). (2) other tools' `screen("sm")` blocks everywhere silently apply
to all widths too. Rig 15/15, lint 5/5, classes 2904.

404 scene (2026-08-16, Ruby dropped `public/tiles/`): the not-found route now
escapes the app chrome (application.gts gained isBare = editor | not-found)
and renders a full-viewport TILE GRID: `regular-tile.png` repeats with
`background-position: center bottom`, so the grid's origin tile is the one at
50%/100% — bottom-middle exactly. `bottom-tile.png` overlays that one cell;
page and overlay share `--tile: clamp(6rem, 16vmin, 12rem)` so they can never
drift. Hero card (card bg, 2px border) is dead-centre: 404 / File not found
/ Back to safety. The old frown-icon block is gone. Cloudflare Pages side:
prerender.mjs now also writes `dist/404.html` (SPA shell + 404 head; Pages
serves it with status 404, Ember boots and renders the scene at the unknown
URL) and static.mjs checks its existence, title, and that a bogus route
renders `.dt-404-page` — static rig now 34 checks. Tile art is decorative
(`alt=""`; lint rejects the redundant role=presentation).

## Session 2026-08-20 — Auto Subtitle

New `auto-subtitle` in Audio & Video, registered with the shared combined
audio/video accept list, styled, and represented in PARITY (tracked 83 /
web 79). It is a local, browser-only transcription flow:

- `lib/transcribe.ts` dynamically imports the already-present
  `@huggingface/transformers` runtime, keeping its roughly 835 kB runtime out
  of the main bundle. Fast uses `Xenova/whisper-base`, Reasonable uses
  `Xenova/whisper-small`, and Accurate uses
  `onnx-community/whisper-large-v3-turbo`. Model weights are fetched from
  Hugging Face on first use and rely on the browser HTTP cache;
  transformers.js' Cache API layer is deliberately disabled for iOS Safari
  reliability. One pipeline is retained between runs; a mode or device change
  disposes it before loading the replacement.
- Media is decoded, downmixed, and resampled to 16 kHz mono through Web Audio.
  The ASR pipeline uses `q4` on WebGPU. Fast and Reasonable fall back to wasm
  `q8` if GPU pipeline creation or inference fails. Accurate requires WebGPU
  and does not load or fall back to its 1 GiB wasm model. Whisper asks for word
  timestamps; `wordsToCues` groups them into readable one-line cues, splitting
  at sentence endings, 0.8 s silence, 42 characters, or six seconds.
- The tool accepts a dropped, pasted, or picked media file; supports optional
  source language, SRT/VTT output, copy, download, and progress/status
  reporting. Existing `lib/subtitles.ts` writes the final formats.
- `tests/unit/lib/transcribe-test.ts` covers the exact model/device/dtype matrix,
  Accurate's wasm rejection, and deterministic word-to-cue grouping (empty
  input, sentence break, silence, character cap, and zero-length spans).

Follow-up close-out:

- The UI uses the DESIGN.md frame, flush action bar, hairline-divided settings,
  and a stacked mobile layout. The English translation control and pipeline
  task option were removed.
- `scripts/verify/auto-subtitle.mjs` now has 10 lightweight checks: combined
  media acceptance, disabled initial export controls, dropped-file intake,
  Fast selection, language, VTT selection, Accurate selection, and Clear. It
  deliberately avoids downloading model weights; add it through
  `verify:auto-subtitle` and it is auto-included by `verify`.
- Gates: `bun run lint` green; `bun run test` 562 pass / 1 pre-existing
  skip; `classes.mjs` ALL PASS (2929); fresh `build:static` +
  `verify:static` ALL PASS (34), with transformers in its own 835 kB chunk
  and the ONNX runtime found locally.
- The aggregate browser gate has 59/60 rigs passing, including Auto Subtitle.
  `chrome.mjs` still looks for the removed `.dt-404 h1`.

## Session 2026-08-21 — Auto Subtitle: progress fix + cue grid

- Progress bug (Ruby: "two progresses racing"): transformers.js 3.8.1
  dispatches `progress` per file (`hub.js:607`, fields `file`/`loaded`/
  `total`) and the encoder and decoder onnx files download concurrently, so
  the component showed whichever file's percentage arrived last.
  `progressAggregator()` in `lib/transcribe.ts` keeps a per-file map and emits
  `sum(loaded)/sum(total)`; a fresh aggregator per pipeline build. The
  percentage can drop once when a later file joins the sum — expected. Unit
  test covers two concurrent files plus ignored `download` and zero-total
  events.
- Cue grid replaces the readonly textarea: number gutter · Start · End · Text
  per cue, hairline rows, sticky head, `max-height: size(160)` scroll.
  Start/End commit on `change` through `parseTimestamp` (accepts `,` or `.`,
  optional hours) and snap back to the formatted value when unparseable, so
  the grid never shows a time the export lacks; Text updates on `input`.
  `output` still derives from `cues`, so copy/download stay classic SRT/VTT.
  Under 40rem the Text input spans its own row below the two timecodes.
  Column width for `HH:MM:SS.mmm` in the mono face is `size(34)` (`size(30)`
  clipped the last digit).
- Info button beside the Mode label (imposer's `Popover` + `info` icon
  pattern): lists the three modes with display names from `ModelSpec.name`
  ("Whisper 2 (Base)", "Whisper 2 (Small)", "Whisper 3 (Large Turbo)"), each
  linked to its Hugging Face page, plus the WebGPU note. Mode labels are
  Rough / Decent / Experimental (ids stay `fast`/`reasonable`/`accurate`).
  The settings grid is `auto minmax(0, 1fr) auto` so the Mode segmented
  sizes to its labels ("Reasonable" used to overflow a 1fr third), and
  stacks to one column under 40rem. `MODELS` is now exported from
  `lib/transcribe.ts` so the panel cannot drift from the resolver. The popover
  primitive has click-outside only, no Escape handler (its header comment
  claims both); the rig closes it by clicking the Subtitles label.
- Experimental did not work (Ruby, 2026-08-21 23:14): the component swallowed
  the error (now `console.error`ed). Cause, verified by reading the graph I/O
  names off the tail of each decoder onnx: `onnx-community/whisper-large-v3-
turbo`'s decoder exports no `cross_attentions.N` outputs (Xenova/whisper-base
  exports six), so transformers.js 3.8.1 throws "Model outputs must contain
  cross attentions to extract timestamps" for `return_timestamps: 'word'`. Its
  generation_config also carries large-v3's alignment heads (layers 9-23 on a
  4-layer decoder), a second failure behind the first. Switched Experimental to
  `onnx-community/whisper-large-v3-turbo_timestamped`: q4 encoder 425 MB +
  decoder 334 MB, `cross_attentions.0-3`, openai's own alignment heads.
  Unverified end to end in this session (needs the 760 MB download on a
  WebGPU browser); Ruby to run it.
- Experimental confirmation dialog (`ui/dialog` primitive, `.dt-asub-warn`):
  selecting Experimental opens a modal with Ruby's sticker art and their
  wording; `<form method="dialog">` buttons return `cancel`/`confirm`, and
  `@onClose` reads the native `returnValue`. Confirm sets the mode and is
  remembered for the component's lifetime (`#experimentalOk`), cancel keeps
  the previous mode. Art: `public/art/760mb.webp` (Procreate export 2732x2048
  RGBA -> `dt clip` 2448x1110 -> magick resize 960w -> cwebp q82, 69 kB).
  Rig +3 checks (hidden while closed, art loaded, cancel keeps mode, confirm
  selects). First version applied `vstack` (display: flex) to the dialog
  element itself, which overrode the UA's `dialog:not([open]) { display:
none }` and rendered the dialog inline under the tool; the flex layout is
  now scoped to `&[open]`.
- Dialog open/close zoom+fade (0.22 s, scale 0.9 -> 1, backdrop fade) is pure
  CSS: `@starting-style` plus `display`/`overlay` transitions with
  `allow-discrete`; reduced-motion turns it off. Probed in Chrome 151; Safari
  17.5+ / Firefox 129+ have the same features, older browsers open and close
  without animation.
- Dialog buttons follow the Substrata modal footer (`.sub-modal-btn`): flush
  row under a 2px top border, ghost Cancel (flex 1, hairline divider, accent
  hover) and primary Proceed (flex 2, semibold), 48px tall. `.dt-asub-warn`
  carries its own chrome (no `dt-dialog` class): tool partials are `@use`d at
  the top of app.scss, so `.dt-dialog` at line ~1400 wins any equal-
  specificity fight with a partial rule, e.g. its `padding: size(5)`.
- Empty state (`.dt-asub-drop`, the Background Remover's drop-zone shape:
  dashed 2px frame, upload icon, title, hint) replaces the cue grid while
  there are no cues and nothing runs; the label wraps its own file input on
  the shared accept list, drops still land on the frame handler. The title is
  a copy gap (`slopsieve --list` shows it, sample "Drop audio or video
  here"); the hint reuses Background Remover's "or click to select a file, or
  paste" verbatim.
- Bottom-edge progress bar (`.dt-asub-progress`, 2px, mirrors
  `.dt-bg-progress`) while busy: width = aggregated download percent; at 0
  or 100 (decode, inference, no progress events) a 30% segment slides
  (`dt-asub-slide`), reduced-motion shows a static full bar.
  `aria-valuenow` is omitted while indeterminate.
- Grid focus bug (Ruby: "defocuses after one keypress"): `#patch` replaces
  the cue object and `{{#each}}` keyed rows by identity, so the edited row was
  torn down each keystroke. Rows are now `key="@index"`. Edited rows show a
  small primary star after the running number: `original` is the snapshot
  taken when a transcription lands, `altered()` compares start/end/text per
  index. UI only, nothing exported.
- Language is `ui/language-combobox.gts` (Popover + Command, the paper-size
  combobox's shape): search input, Auto-detect (globe icon), a Common group of
  the first 12 entries of Whisper's order as a 4-column flag-tile grid (the
  colour-notation popover's tile look), then all 99 alphabetically with code.
  `LANGUAGES` in `lib/transcribe.ts` is transformers.js' `common_whisper.js`
  order (roughly by training-data volume); codes go to the pipeline. Flags:
  `circle-flags` 2.8.3 (MIT, new dependency; package-lock resynced with
  `/opt/homebrew/bin/npm install --package-lock-only`), copied by
  `scripts/copy-flags.mjs` into `public/flags/<code>.svg` (99 files, ~1 kB
  each; `jw` -> circle-flags `jv`, `sa` -> India's country flag) and rendered
  as `<img>` so no SVG enters a bundle. Settings grid is `1fr auto auto`.
  The tile rule is `.dt-command-item.dt-lang-combo-tile` because
  `.dt-command-item` (app.scss, emitted after the partial) sets
  `flex-direction: row` through `hstack`. Rig: opens the combobox, types
  "germ", picks German, asserts the trigger text and a loaded `/flags/de.svg`.
- Info panel shows each mode's download size (`ModelSpec.sizeMb`, encoder +
  merged decoder from the hub file listings on 2026-08-22: base 142/77,
  small 299/249, turbo 759/1085 MB for q4/q8). The panel picks the WebGPU
  figure when `navigator.gpu` exists, else the wasm one. Note: base's q4
  merged decoder (124 MB) is larger than its q8 (54 MB); the numbers are
  what transformers.js 3.8.1 fetches.
- Sonnet review (2026-08-22) found two defects, both fixed: `readFile` did
  not bump `#token` (a file dropped mid-run let the stale run's result land
  on the new file; it now cancels like `clear()` and resets `busy`), and the
  progress fill's inline `width` style beat `.is-indeterminate` (the style is
  now omitted while indeterminate).
- Not built: row insert/delete/merge, multi-line cue text (the Text cell is an
  `<input>`; `wordsToCues` emits single-line cues), start ≤ end / ordering
  validation.
- Gates: lint 5/5, `bun run test` 563 pass / 1 skip, classes.mjs 2940, rig
  `auto-subtitle.mjs` 15/15. The download path is still not rig-covered
  (rigs do not fetch weights).
- Seen, not touched: "Reasonable" overflows its segmented cell at the desktop
  width — part of the pending UI pass.

## Session 2026-08-22 — Subtitle Studio (UNCOMMITTED)

New `subtitle-studio` in Audio & Video: burns an SRT/VTT into a video in the
browser. Ruby's brief: Auto Subtitle's frame + multi-column table, the Frame
Extractor's transport, move/scale/colour/font controls.

- `lib/subtitle-burn.ts`: `drawSubtitle` (word wrap to 90% width, bottom-
  centre anchor + x/y offsets, outline/box/plain, four font stacks: platform
  sans/serif/mono plus the page's iA Writer Quattro), `activeCue`,
  `stripTags`, `wrapLines`, `pickVideoMime`, `extensionFor`. Unit-tested
  (wrap, active cue, tags, extension).
- Component: `VideoIntake` + a hidden `<video>`; the stage is a canvas at the
  video's intrinsic size that both the preview and the recorder draw through
  (`draw()` = frame + active cue). Drag on the canvas moves the subtitle
  (pointer deltas in CSS px become frame fractions, clamped). Settings:
  Font (Sans/Serif/Mono/Quattro), Size 2–14% of height, Colour (native
  picker), Style (Outline/Box/Plain), Position readout + Reset. Transport
  is the laserdisc row (±5 s/±1 s/±frame at an assumed 30 fps). Cue grid:
     # is a seek button, start/end read-only, text editable; the active cue's
     row highlights during playback. One drop can carry both files.
- Burn: `canvas.captureStream(30)` + the element's audio through a one-time
  `createMediaElementSource` graph (gain 0 to speakers while burning, 1
  after) into MediaRecorder (vp9/vp8 webm, Safari mp4), real-time: the
  video plays through once, bottom-edge progress bar, result shown as
  "webm · N.N MB" + Download in the output head. ponytail: faster-than-real-
  time needs WebCodecs + a muxer dependency.
- Copy gaps: five (`tools.ts` description, two drop titles, two error
  lines); `slopsieve --list` shows them.
- Export formats (`EXPORT_FORMATS` in the lib, a native `<select>` in the
  bar before Burn): MP4 H.264 / HEVC / AV1, WebM VP9 / VP8 / AV1. Each is
  probed with `MediaRecorder.isTypeSupported` per render and disabled when
  the browser cannot encode it; the first supported one is the default.
  Chrome 151 on this Mac answers yes to all six (HEVC only with the full
  `hvc1.1.6.L93.B0` string). Bitrate is `bitrateFor(w, h)` = 0.12 bit per
  pixel per frame at 30 fps, clamped 1–40 Mbps (7.5 Mbps at 1080p; the
  MediaRecorder default is 2.5 Mbps at any size); audio 128 kbps.
- Rig `scripts/verify/subtitle-studio.mjs` generates a 2 s webm in the page
  (canvas captureStream + MediaRecorder), drops it with an SRT, seeks a cue,
  picks Box, burns, and checks the result label.
- `tests/unit/lib/omni-test.ts`: an `.srt` now routes to both Subtitle
  Converter and Subtitle Studio (catalogue order); the expectation lists both.
- Gates: lint 5/5 (template-lint needed `no-pointer-down-event-binding`
  disabled on the drag canvas, and the range/colour wrappers are divs so the
  inputs have one label each), classes.mjs 3001, tests 567, rig 7/7
  including a real MediaRecorder burn of a 2 s generated webm.
- Burn aborts when the tab goes to the background (`visibilitychange` →
  reject, recorder stopped, `hidden` error): a background tab throttles rAF
  and the canvas capture, so the file would stutter or freeze. The fast
  path (WebCodecs) is deferred to wave 4, where `mp4box` arrives for the
  Video Muter anyway; with MediaRecorder 1× is the ceiling.
- Layout: the video's `W × H · duration` readout and the position readout
  are pills over the stage (top-left / top-right); in the bar the readout
  had squeezed the file name to one character. Settings are four cells
  (`auto minmax(size(40), 1fr) auto auto`), so the Size slider has room.

## Session 2026-08-22 — AV wave 4: Video Atlas + Video Muter (UNCOMMITTED)

Dependency decision, a deviation from the wave-4 plan: `mediabunny` 1.55
(MPL-2.0, pure JS demux/mux + WebCodecs glue) instead of `mp4box`. Its
`Conversion` with `audio: { discard: true }` is a packet copy, and the same
library covers the later Video Trimmer, embedded subtitle tracks and the
Subtitle Studio fast path, so one dependency serves the whole lane. MPL is
file-level copyleft and only binds modifications to its own files.
`mediainfo.js` 0.3.7 (BSD-2) stays for the Atlas: the deep fields (profile,
level, bit depth, colour primaries, bitrate mode, GOP) are MediaInfo's.

- `lib/mediainfo.ts`: the emscripten bundle is self-hosted at
  `public/mediainfo/` (`mediainfo.min.js` + 2.5 MB `MediaInfoModule.wasm` +
  licence, copied by `scripts/copy-mediainfo.mjs`; lint/prettier-ignored)
  and imported through the jxl/mupdf `new Function` idiom, so neither file
  enters the Vite graph. `analyzeMedia(file)` reads in chunks via
  `file.slice`. `sections()` turns MediaInfo tracks into titled panels of
  label/value rows (General, Video #n, Audio #n, Text #n), only fields
  present; `reportText()` is the clipboard form. Unit-tested on fixtures.
- `lib/media-probe.ts` (mediabunny, dynamic import): `probeVideo` (fps from
  `computePacketStats(200)`, size, rotation, codec, duration, audio-track
  count), `probeAudio` (sample rate, channels, codec), `muteVideo`
  (Conversion, WebM/MKV → WebM, else MP4; throws `mute-invalid` with the
  discard reasons when the muxer refuses).
- `video-atlas`: Audio Atlas's frame and cell grid around a Frame Extractor
  stage; bar shows "N streams" and Copy report. Rig generates a webm in the
  page, loads the wasm, checks Container/Codec/Frame size rows.
- `video-muter`: bar with probe meta (`W × H · fps · duration · N audio
tracks`), Mute disabled when the probe finds no audio track, progress bar
  from `conversion.onProgress`, result row (`ext · size` + Download) and the
  muted output playing in the stage so silence can be checked by ear. Rig
  generates a webm with an oscillator track and remuxes it.
- Muter output container select (Same as source / MP4 / MOV / WebM / MKV):
  each option is enabled only when `OutputFormat.getSupportedVideoCodecs()`
  lists the probed codec, so the remux never re-encodes (VP8 → MP4 is
  refused, for instance). Result extension and MIME come from the format.
- Stages paint black only behind the video/canvas box, not behind the
  empty-state drop zone (Atlas, Muter, Studio).
- Copy gaps: seven (two card descriptions, two drop titles, the Atlas read
  error, the Muter no-audio status and error line).
- Unlocks wired: `VideoIntake`/`AudioIntake` `onLoad` now receive the File.
  Frame Extractor and Subtitle Studio probe the real fps on load (30 until it
  answers) for the frame step and the meta readout; Audio Atlas shows the
  container's sample rate (with "decoded at N" when the AudioContext
  resampled) plus a Codec row. Video Atlas frame size shows the DAR as a
  familiar name (`formatRatio`: 16:9, 9:16, 2.39:1 …).

### Simplify pass (2026-08-22, four reviewers: reuse / simplification / efficiency / altitude)

Applied: `VideoIntake` owns `file` and a probed `fps` (opt-in `probeFps`),
so Frame Extractor and Subtitle Studio dropped their copies of the probe
dance; `formatFps` lives in `lib/media-probe.ts` and is the one fps
formatter; `VideoProbe.rotation/duration`, `AudioProbe.channels`,
`MuteResult.audioTracks` (and its extra `getAudioTracks`) removed as
unread; `extensionFor` removed in favour of `ExportFormat.ext`; the
export-format table is probed once per module; Studio keeps one `style`
object with `#patch`, derives `activeIndex` from `currentMs`, draws on
`requestVideoFrameCallback` (rAF fallback), writes `burnPct` only on
change, drops the `timeupdate` redraw, uses `AbortController` for the
visibility abort, `formatBytes`, `SUBTITLE_ACCEPT`, and gained the
`filePaste` modifier its hint promised; Atlas and Muter use the intake's
own `chooseFile`/`drop`/`dragOver`; Atlas `sections` and Audio Atlas `peak`
are `@cached`; module constants are referenced directly in templates; the
`new Function` import shim is one `lib/raw-import.ts` (jxl, mupdf worker,
mediainfo); MediaInfo specs pass functions and a `mapNum` helper; rigs
share `makeClip`/`dropClip` from `harness.mjs`.
Skipped: handing mediabunny's `Input` to the Muter component (keeps the
lib boundary; a second header parse per mute is cheap), the shared
`audioContext()` singleton in Studio (component-owned context has a clean
close), merging the transport methods across Frame Extractor and Studio,
memoised word-wrap per frame.

Code review (2026-08-22, 7/10, no critical): two important fixes applied —
`#stopBurn` now aborts a per-burn `AbortController` so a suspended `#burn`
(new file, Clear, teardown) rejects instead of holding the partial
recording and listeners until the tab is hidden; `analyzeMedia` queues
calls behind each other because the one MediaInfo instance refuses a
second analysis mid-read (a second drop on Video Atlas used to show the
read error). Also: `probeVideo`/`probeAudio` import inside `try`, and
Studio's `readAny` hands every non-subtitle file to `intake.load` so an
empty-MIME video gets the intake's own message. Left as notes: drag scale
when the canvas is letterboxed, `readSubs` without a token, Muter
`chooseFile` mid-remux, Audio Atlas name-only staleness guard, unguarded
`clipboard.writeText` in Atlas.

Static gate (2026-08-22, fresh `build:static`): `verify:static` ALL PASS
(34), 84 routes prerendered, main 132 kB, dist 611 files / 149 MB (largest
file still the 20.6 MB ONNX wasm; Cloudflare caps: 20,000 files, 25 MiB per
file). Auto Subtitle Experimental confirmed working end to end by Ruby.
Chunks: mediabunny lands in one 674 kB lazy chunk (`assets/src-*.js`),
pulled on the first file load by Frame Extractor, Subtitle Studio (both via
`VideoIntake.probeFps`), Video Muter and Audio Atlas; tool chunks are
subtitle-studio 24 kB, video-atlas 10 kB, video-muter 8 kB. `dist/mediainfo`
(wasm + glue + licence) and the 99 flags are copied through.

## Session 2026-08-22 (cont.) — Subtitle Studio fast path (UNCOMMITTED)

- Review notes closed: Studio drag scales against the drawn frame (object-fit
  letterboxing), `readSubs` has a token, a new file or Clear cancels a
  running remux (`muteVideo` takes an AbortSignal → `conversion.cancel()`),
  `AudioIntake` stores the File and Audio Atlas compares identity, Atlas
  clipboard write is guarded.
- Fast burn: `burnVideo` in `lib/media-probe.ts` runs a mediabunny
  `Conversion` with `video.process`: each decoded `VideoSample` is drawn to
  an OffscreenCanvas, `drawSubtitle` paints the cue, and a fresh
  `VideoSample` (pixels copied) goes to the encoder; audio packets are
  copied when the container carries the codec. `forceTranscode: true`,
  bitrate from `bitrateFor(w, h, intake.fps)`. Studio picks the fast path
  when `encodableCodecs()` (WebCodecs `canEncodeVideo` per codec, probed on
  video ready) has answered, else the MediaRecorder 1× path; the format
  select's support flags follow the encoder answers on the fast path.
  `ExportFormat` gained `codec`. Result label adds the speed factor
  (`mp4 · 13.7 KB · 5.1×` on the rig's 2 s 320×180 clip in headless Chrome
  151, which reports all five encoders). The hidden-tab abort stays on the
  live path only. Rig 9/9, now decoding the burned output and counting
  white pixels in the bottom band to prove the text is in the file.

## Session 2026-08-22 (cont.) — Video Trimmer (UNCOMMITTED)

`video-trimmer`: In/Out timecode fields (commit through `parseTimestamp`,
garbage snaps back) with Mark buttons from the playhead, a selection strip
over the duration, Cut mode Keyframe/Exact, container select (the Muter's
codec-gated list), the laserdisc transport, result row with the real cut
points and a preview of the output in the stage. `trimVideo` in
`lib/media-probe.ts`: Exact = mediabunny `Conversion` with `trim`
(mediabunny re-encodes video whenever the trim starts after the first
packet, which is what lands the cut on the frame); Keyframe = manual packet
copy: `EncodedPacketSink.getKeyPacket(start)` picks the keyframe at or
before In, video and audio packets are cloned with shifted timestamps into
`EncodedVideoPacketSource`/`EncodedAudioPacketSource`, interleaved by
timestamp so the muxer's per-track backpressure cannot stall, decoder
configs attached to the first packet of each track. Result reports the cut
actually made. Rig: 2.5 s generated webm, exact 0.5–1.8 → ~1.3 s file,
keyframe → starts at the keyframe before 0.5 (MediaRecorder's first key at
0), both decoded back for their duration. Two copy gaps (description, drop
title, error line).
Caught by the rig: the source `<video>` remounts when the result preview
leaves the stage, so `loadedmetadata` fires `onReady` again; the In/Out
reset now happens only while Out is still 0. The same remount happens in
Video Muter (harmless there, nothing is keyed on readiness).

## Session 2026-08-22 (cont.) — Audio Extractor (UNCOMMITTED)

`audio-extractor`: video in, its primary audio track out as WAV (PCM s16,
always available), M4A (AAC), Ogg (Opus) or FLAC; `extractAudio` in
`lib/media-probe.ts` is a mediabunny `Conversion` with the video discarded
and `audio.codec` set, so packets are copied when the source codec already
matches and WebCodecs encodes otherwise. `audioTargetSupport` gates the
select (PCM always, copy when codecs match, else `canEncodeAudio`). Bar
shows `codec · sample rate` from `probeAudio`, or the no-audio status; the
result row holds an `<audio controls>` player, the size and Download. Rig:
generated Opus webm → WAV decoded back to ~1.5 s, then Ogg as a copied
Opus stream. Three copy gaps (description, drop title, no-audio status,
error line).

## Session 2026-08-22 (cont.) — Audio Normaliser (UNCOMMITTED)

`audio-normaliser`: AudioIntake decode, one integrated-LUFS + sample-peak
measurement (deferred a macrotask so the bar paints first), target segmented
-14 Streaming / -16 Podcast / -23 Broadcast, `planGain` (pure, in
`lib/normalise.ts`) derives gain and the -1 dBFS sample-peak ceiling from
the measurement so target changes cost nothing; a status line says when the
ceiling capped the gain (copy gap). Normalise applies the gain to copies,
writes WAV through `encodeWav`, re-measures the render and shows
`wav · size · N LUFS` with a player and Download. ponytail: sample peak,
not true peak; a 4x oversampled true-peak meter is the upgrade. Unit tests
on a dual-mono 1 kHz sine: BS.1770 sums channel powers and K-weighting
adds ~0.7 dB at 1 kHz, so -20 dBFS peak per channel reads -20.0 LUFS; +6 dB
to -14, ceiling cap, silence, applyGainDb. Rig synthesises a WAV in
the page and checks the measurement, the re-plan on target change, and the
render (label at -14 LUFS, peak raised by the gain). Two copy gaps
(description, drop title, limited status).

### Simplify pass 2 (2026-08-22, four reviewers)

Applied: `lib/media-probe.ts` keeps `loadMediabunny`/`openInput`/probes;
everything that writes files moved to `lib/media-convert.ts` with one
`runConversion` (validity, progress, abort wiring, execute, buffer → Blob;
an aborted signal rejects with `AbortError`, components check
`error.name`), one `ConvertResult`, `BURN_CODECS` once. `VideoIntake`
owns the container probe (`probe: true`, `onProbe`, `intake.probe`), a
`canLoad` gate that covers drop, picker and paste, and the laserdisc
transport (`playing`, `togglePlayback`, `syncPlaying`, `jumpBy`,
`jumpFrame`); Frame Extractor, Studio, Muter, Trimmer dropped their
copies, and Muter/Trimmer probe the file once per load. Both stage videos
stay mounted (source `hidden` while the result shows), so the Trimmer's
readiness guard is gone. `burnVideo` takes `overlay(seconds)` and passes
cue-less frames through without the canvas round trip. The Normaliser
folds the gain into `encodeWav(channels, rate, gain)` and reports
`measured + gain` (one pass instead of three); `planNormalise`/`applyGainDb`
removed. Harness gained `captureObjectUrl` and `makeWav`; four rigs use
them. Small: `markPoint`, `#supports`, `probe: undefined | null`, constants
referenced directly in templates, `audioTargetSupport` in parallel.
Skipped: a `MediaJob` class for the four job state machines (a rewrite of
four components; the next refactor when a fifth tool appears), the worker
offload for LUFS, memoised word-wrap per cue, reusing the probe's `Input`
across actions.

Code review 2 (2026-08-22, 6/10 before fixes): critical — the
`.dt-vt-stage video { display: block }` rule beat the UA `[hidden]`, so the
hidden source video still rendered under a result (Trimmer and Muter; now
`video[hidden] { display: none }` in both partials). Important, all fixed:
mediabunny rejects with `ConversionCanceledError` on cancel, so
`runConversion` maps a rejection under an aborted signal to `AbortError`;
Muter's `willDestroy` aborts a running remux; Studio's transport is
disabled while burning (a jump paused the MediaRecorder source and the
burn hung); Trimmer's transport and strip hide while a result shows;
the keyframe copy skips decode-order leading frames whose PTS sits before
the key packet (open GOPs muxed as negative timestamps). Minor fixed:
audio the target container cannot carry is dropped instead of failing the
keyframe cut; Trimmer fields always normalise on commit; an empty encoder
Set falls back to MediaRecorder; the Normaliser's result loudness is
labelled as measured + gain in code. Left: `probeAudio` returns null for
both "no audio" and "unreadable". Also: an `apply()` helper that opened
the target for writing before its transform ran truncated
`video-trimmer.gts` (untracked, so no git copy); rewritten from the
session's own content, all rigs green afterwards.

## 2026-08-23: Workflows (Flow State)

A predefined chain of tools with a bar under the header. `lib/workflows.ts`
holds six chains (`audio-to-subtitles`, `trim-caption-burn`,
`paste-and-strip`, `trim-and-mute`, `extract-and-normalise`,
`colour-to-gradient`); `services/flow.ts` owns the current workflow, the
step, the bag of files earlier steps produced and the colour the current
tool shows. The record (workflow id + step) is in sessionStorage, tab
scoped; the files are in IndexedDB (`lib/flow-store.ts`, its own two-line
Dexie database, name and type stored beside the blob because WebKit once
returned stored Files as Blobs). No stragglers: the bag is cleared on
`start`, on `exit`, and on boot whenever the tab has no record, so a closed
tab's bag is swept by the next page load.

Tools stay unaware of chains. Two hooks at the altitude every tool already
passes through: `lib/download.ts` captures the blob into the bag instead of
saving it while a non-final step is current (`downloadUrl` fetches the
object URL first; `saveBlob` is the uncaptured path the bar's capture
buttons use), and the `filePaste` modifier asks the service for pending
files on install and hands them to the tool's own handler. Delivery rule
(`pendingFor`): per accept pattern, the newest matching file from earlier
steps, each file once per visit, so Subtitle Studio gets the trimmed video
and the SRT in two calls through its existing `readAny`. Colour flows carry
`?color=`; Colour Converter pushes `values.hex` into `flow.colour` through a
modifier and clears it on destroy. Paste Image moved from an inline anchor
to `downloadUrl`; the other 24 inline-anchor tools join a workflow the day
they switch to lib/download.

Pre-existing bug found by the rig and fixed at the root: Ember drops a query
param no controller declares, so every in-app `?color=` link (omnibox
carry included) landed on the tool's default; only a full page load ever
carried the colour. `app/controllers/tools/tool.ts` now declares `color`
with model scope. The omnibox rig asserts the landing, not only the href.

Surfaces: `FlowState` bar in application.gts (tiles, captures with save,
Next/Done, exit), `WorkflowGrid` section on the home catalogue, a Workflows
group in the sidebar. Tests: `lib/workflows-test`, `services/flow-test`
(stubbed router, real IndexedDB). Rig: `scripts/verify/workflows.mjs`
(10 checks: start, capture, hand-off, reload restore, orphan sweep, Done,
colour carry, exit). Left: two tabs running flows share one bag (per-tab key
when it matters); a flow whose step has no `filePaste`/intake hook
(`doc-converter`, `text-editor`, `text-diff`, `markdown-writer`) cannot
receive a hand-off yet.

Follow-up (same day): "Pass along". Every control that saves a file now
renders `<DownloadLabel>` (`components/download-label.gts`): its own label
outside a workflow, "Pass along" with an arrow while a later step waits;
icon-only controls use `passAlong()`/`capturing()` from `lib/flow-hooks`.
Five Sonnet agents swept the 48 tool components in parallel and moved the
24 inline-anchor tools onto `lib/download` (the editor's `lib/editor/
export.ts` private `downloadText` went the same way), so every tool can be
a non-final step. `doc-converter` and `text-diff` gained a `filePaste` hook;
`text-editor` and `markdown-writer` have no File load path at all and stay
hand-off-blind. Hand-off bug: Audio Trimmer (and every intake tool without
a `filePaste` modifier) never received the file because delivery only ran
from the modifier; it is now `deliverPending()` in `lib/flow-hooks`, called
from the modifier and from both intake constructors. `capturing` is true
only on the current step's own tool page, so a Substrata export from
`/editor` mid-flow still saves. Rig: Extract and normalise end to end
(clip → extractor → "Pass along" → normaliser through its intake →
"Download" on the last step). Audio to subtitles is redundant (Auto
Subtitle takes video directly); left in the list as Ruby said it is neither
here nor there.

## 2026-08-23: NDS loader

Every loading state renders `<NdsLoader>` (`components/ui/nds-loader.gts`,
`styles/_nds-loader.scss`), copied verbatim from Ruby's delphicomponents
repo (`NdsLoader/`, public domain): a 3x3 cell grid whose perimeter cells
light in turn, `currentcolor`, `role="status"`, reduced-motion slows the
step. `is-inline` is the delphitools size variant (16px, a size(4) icon)
for buttons and status lines; the 28px default is for stages and overlays.
Four Sonnet agents swept 21 tools: 23 Lucide `loader`/`loader-circle`/
`loader-2` sites plus the five `aria-busy` buttons that swapped their icon
name to `loader` and spun it (now `{{#if busy}}<NdsLoader
class="is-inline" />{{else}}<Icon …/>{{/if}}`). Gone: 15 per-tool
`@keyframes dt-<tool>-spin` blocks, their `animation:` rules and
reduced-motion overrides, the empty spinner classes, two dead nested
`.dt-icon` sizing rules, and the two loader icons from `lib/icons.ts`
(226 icons). Nothing in Substrata used a loader. When delphicomponents
updates the loader, re-copy the CSS into the partial; the `is-inline` block
at its end is the only local addition.

Follow-up (same day): the hand-off as a gesture. Every step passes its
output along, the last one included: `capturing` no longer stops at the
last step, so the last tool's control also reads "Pass along"; Done appears
in the bar only once that capture exists (`finished`) and saves it
(`flow.finish`: `saveBlob` + exit). The bar cannot press a tool's own
action, so the tool's output is the gate. Feedback: the service keeps the
rect of the last clicked control (one capture-phase click listener;
lib/download has no event to hand over) and gives it to the bar's
`captureListener`; the bar flies a disc along a quadratic arc (the curve
sampled into translate keyframes for the Web Animations API, 520 ms, a
size(6) disc with a background rim; Chrome
resolves `offset-path: path()` against the element's own box, so a motion
path was the wrong tool) into the Next slot and pulses it (160 ms); entering a flow is a plain route change, the slide only runs on
advance (forward: out left, in from the right) and on stepping back;
when the flight lands the service advances on its own (Next stays as the
manual fallback after going back). The page change starts a quarter of the way into the flight: two Web
Animations on `.dt-main` itself (out 140 ms, route swap, in 200 ms;
forward: out left, in from the right; back mirrored; the step commits
with the route swap so the old page keeps its label while leaving), not a
view transition, which snapshots the document and would freeze the disc
mid-flight. Reduced motion: plain transition, no disc. An earlier cut used `document.startViewTransition`;
two facts from it: Chrome fires an unhandled rejection for
`ViewTransition.ready` when a newer transition skips an older one, and the
document is not hit-testable while a view transition runs. Gradient Genny seeds
the carried `?color=` into every mode (first stop, top-left corner, first
mesh point) instead of the 2D corner only; the omnibox carry had the same
gap. Ruby's sidebar cleanup replaced the per-workflow buttons with one link
to a `workflows` route (template still to come); the dead code behind the
buttons is gone. Rig: 17 checks.

Finale (same day): once the last step has passed its output along, the bar
gets `is-finished`: it grows from size(12) to size(20), the button, now
"Download & Exit" with `file-down` (label from a GPT 5.6 Terra shortlist via
omp; Ruby found "Done" non-committal), renders larger with a slow
inset-ring beacon (off under reduced motion), and the tool
behind it steps back (`.dt-inset:has(> .dt-flow.is-finished) > .dt-main`:
opacity 0.5, 4px blur, no pointer events). Done saves and exits; the exit
cell also clears it. Rig: 18 checks.

Simplify pass (2026-08-23, four reviewers: reuse, simplification,
efficiency, altitude). Applied: one delivery site (the filePaste modifier;
the five intake-only tools got the modifier, the intake constructors lost
their hook), `pending()` guarded by the same on-step-page test as
`capturing` (a detour into another paste-hook tool no longer receives the
bag), Dexie out of the boot graph (lazy import; a localStorage flag says a
bag exists, so visitors who never ran a flow never open IndexedDB), the
click listener only while a flow is active, the capture in memory before
the IndexedDB write so the flight starts at once, the four A/V tools hand
`result.blob` over instead of fetching their object URL, `<main>` reaches
the service through a modifier and the finale is a plain `.is-behind`
class instead of `:has()`, `landing` moved into the service, `carryColour`
modifier in lib/colour-query (any colour tool is a source with one
attribute), `@cached` on `tools` and the converter's `values`, the beacon
animates opacity on a pseudo-element, `transitionTo(route, model,
{ queryParams })` now that the controller declares `color`, `<DownloadLabel>`
icon on by default (53 `@icon` args gone) with `@busy` for the two
generate-and-save buttons, `downloadIcon()` for the six icon-only controls,
the loader's size(4) cell is the default (`is-stage` for the four block
sites), `workflowTools` instead of a second flatMap, `reducedMotion`
shared, `waitUntil` instead of fixed sleeps in the service test, the
gradient seed back in the component, `downloadText` in placeholder-genny,
one `formatBytes` (three copies gone), dead `.dt-flow-nav`, a one-line
`workflows` template for the sidebar link. Kept: the loader's `@mode` and
its CSS (verbatim copy), the blur on the finished tool, the last step's
IndexedDB write (Done survives a reload), `toBlob` in gradient-genny.

Code review (2026-08-23, kimi-k3 via omp, 7/10 before fixes). Critical,
fixed: the bag was origin-wide with its lifetime keyed to one tab's record,
so a second tab's boot sweep wiped a live flow's captures and two concurrent
flows could deliver into each other. Now every row carries the run id of
the flow that wrote it (`crypto.randomUUID()` at `start`, stored in the
record and on each row, schema v2), a tab reads and clears only its own
run, and a boot with no record asks live tabs over a BroadcastChannel
roll-call (300 ms) and sweeps only the runs nobody answers for. Important,
all fixed: qr-genny's `getRawData` may resolve a string for SVG (wrapped in
a Blob); an aborted router transition (two quick navigations) and a
cancelled flight no longer reject unhandled; the bag flag is set after a
successful IndexedDB write, so a refused write (quota) leaves no phantom
bag and the session continues from memory; Back/Forward onto another
step's tool reconciles the step (`routeDidChange`); exiting or restarting
with captures asks first (`confirm`, two words); the finale puts `inert`
on `<main>` and focuses its one button; `downloadUrl`'s capture fetch
falls back to a real download. Minor, fixed: `flowHooks.current` cleared
on destroy, the click rect consumed per capture, storage access guarded,
the disc `aria-hidden`, markdown-writer's title follows `passAlong`. Left:
an IndexedDB write still in flight when `exit` runs lands after the clear
(the next boot's roll-call sweeps it). Rig: 20 checks, including a second
tab that leaves a live bag alone and a closed tab's run being swept.

## 2026-08-23: text tools take files

Markdown Writer and Text Editor declared `.md`/`.txt` in the registry (the
omnibox routed dropped files to them) but had no load path. Both now take a
file by paste (`filePaste`), by drop on the root, and as a workflow hand-off:
`readFile(file)` reads `file.text()`; the scratchpad replaces its draft
(asking first when one exists), the editor replaces its ProseMirror
document (or the source pane in code mode), and a file that lands before
the editor core has loaded waits in `#pendingText`. `TEXT_ACCEPT` in
lib/tools.ts is the one list for the registry and both tools. Rig:
`scripts/verify/text-intake.mjs` (2 checks).

## 2026-08-23: Workflows page

`/workflows` is a page in the tool-page shape (header with the workflow
icon, title, a copy gap for the description) over `WorkflowList`
(`components/workflow-list.gts`, replaces the grid): one flush 2px-framed
list, a row per chain divided by hairlines: a name cell with what goes in
(`workflowInput`, one word from the first tool's registry entry: video,
audio, image, PDF, text, colour), the steps as the Flow State bar's
numbered tiles, a primary Start cell. The home page carries one flush
link bar to the page instead of the list; the app header names the page.
Paste Image now declares `accepts: ['image/*']` (it always read images
from paste and drop; the omnibox never knew). Rig: workflows 21 checks.
