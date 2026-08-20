# STATE — delphitools working state

Updated 2026-08-20, after Auto Subtitle WIP. A fresh session should read
this file, CLAUDE.md and PARITY.md before touching anything. Session log
runs bottom-up (newest last).

## Where the repo stands

- Ember app at the repo root (`v2-ember` branch). HEAD is `e6f4555`
  (docs: DESIGN.md recovered and rewritten for Ember/Crayon). Ruby
  triggers commits explicitly.
- A large UNCOMMITTED stretch sits on top (~50 files), in four parts:
     1. Ruby's own rotate-crop/imposer/organiser WIP plus the close-out:
        `.dt-prc-settings-2` grid added, `dt-prc-paperfield` removed
        (redundant), button alignment via `margin-top: auto` on the apply
        scope (NOT space-between — that floats the middle input).
     2. The dev-encoder batch (six tools via omp-batch + two Claude
        finishers): `json-formatter`, `uuid-genny`, `jwt-decoder`,
        `password-genny`, `cron-builder`, `http-status` — all shipped with
        libs, rigs, unit tests and PARITY rows; 8 copy gaps filled by Ruby
        via slopsieve (a stray apostrophe in the JWT description broke the
        build mid-fill; fixed).
     3. Follow-up passes: password rows render per character (digits
        chart-3, symbols chart-2, via lib/password.ts `charKind`); the
        `-generator`→`-genny` rename end to end (id = file basename, incl.
        routes; matte/scroll came along); UUID Generator's Kind segmented
        moved into the top bar and its switches fixed (the
        `.dt-uuid-field input { width: 100% }` specificity bug had stretched
        pills to 198px); Cron Builder's five cramped columns became full-
        width rows on the ppn label-beside-control pattern; the 404 scene
        (`not-found` escapes the chrome via isBare in application.gts):
        regular-tile grid anchored bottom-middle (`background-position:
center bottom`, `--tile: 25vw`, 4 tiles across), bottom-tile
        covering exactly the origin cell on an opaque backdrop, hero card
        dead-centre (404 / File not found / Back to safety).
     4. Auto Subtitle WIP: local Whisper transcription for audio/video,
        subtitle export, pure word-to-cue grouping tests, and an 11-check
        browser harness. Its focused checks and normal gates are green; the
        aggregate rig sweep has three existing unrelated failures.
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

## Session 2026-08-20 — Auto Subtitle (UNCOMMITTED, not yet verified)

New `auto-subtitle` in Audio & Video, registered with the shared combined
audio/video accept list, styled, and represented in PARITY (tracked 83 /
web 79). It is a local, browser-only transcription flow:

- `lib/transcribe.ts` dynamically imports the already-present
  `@huggingface/transformers` runtime, keeping its roughly 835 kB runtime out
  of the main bundle. Fast uses `Xenova/whisper-tiny`; Reasonable uses
  `Xenova/whisper-base`. Model weights are fetched from Hugging Face on first
  use and rely on the browser HTTP cache; transformers.js' Cache API layer is
  deliberately disabled for iOS Safari reliability.
- Media is decoded, downmixed, and resampled to 16 kHz mono through Web Audio.
  The ASR pipeline prefers WebGPU (`fp32`) and falls back to wasm (`q8`) both
  if GPU pipeline creation fails and if inference itself fails. Whisper asks
  for word timestamps; `wordsToCues` groups them into readable one-line cues,
  splitting at sentence endings, 0.8 s silence, 42 characters, or six
  seconds.
- The tool accepts a dropped, pasted, or picked media file; supports optional
  source language, English translation, SRT/VTT output, copy, download, and
  progress/status reporting. Existing `lib/subtitles.ts` writes the final
  formats.
- Experimental is intentionally a visible but unavailable Parakeet mode:
  `parakeet.js` is not installed, has an unreviewed API, requires WebGPU, and
  would bring a hundreds-of-MB model. The component reports that mode as not
  ready instead of pretending it works.
- `tests/unit/lib/transcribe-test.ts` currently covers deterministic
  word-to-cue grouping (empty input, sentence break, silence, character cap,
  and zero-length spans).

Follow-up close-out:

- All four copy strings were supplied (card description plus decode,
  experimental, and generic-error messages). The apostrophe in "Couldn't"
  needed double quotes so TypeScript could parse it.
- `scripts/verify/auto-subtitle.mjs` now has 11 lightweight checks: combined
  media acceptance, disabled initial export controls, dropped-file intake,
  Fast selection, language, translation, VTT selection, Experimental's
  unavailable state, and Clear. It deliberately avoids downloading model
  weights; add it through `verify:auto-subtitle` and it is auto-included by
  `verify`.
- Gates: `bun run lint` green; `bun run test` 560 pass / 1 pre-existing
  skip; `classes.mjs` ALL PASS (2930); fresh `build:static` +
  `verify:static` ALL PASS (34), with transformers in its own 835 kB chunk
  and the ONNX runtime found locally.
- The aggregate `bun run verify` could not be fully green: 57/60 rigs pass,
  including Auto Subtitle. `chrome.mjs` still looks for the removed
  `.dt-404 h1`; `select.mjs` ended with a Puppeteer protocol error; and
  `tools.mjs` ended with a detached-frame error. These do not implicate Auto
  Subtitle, but need a fresh/reproducible run before claiming a clean sweep.
