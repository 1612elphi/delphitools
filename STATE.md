# STATE — delphitools working state

Rewritten 2026-08-11, late in the AV/omnibox stretch. A fresh session
should read this file, CLAUDE.md and PARITY.md before touching anything.

## Where the repo stands

- Ember app at the repo root (`v2-ember` branch). HEAD is `3ed7c6c`
  (the four substrata stub panels ported, artboard centring fixed);
  before it, `1dad2db` (omnibox front page, AV wave 2, transports,
  polish), `5ac7514` (AV wave 1), `5b18251` (front-page mocks into
  docs/frontpage/). Ruby triggers commits explicitly.
- An UNCOMMITTED close-out stretch sits on top of `3ed7c6c` (2026-08-13):
  the colour palette dialog (`components/colour-palette-dialog.gts` +
  `rgbToCmyk` in colour-maths + `.dt-palette-*`/`.dt-swatch*` scss, opened
  from the About dialog), shared `AUDIO_ACCEPT`/`VIDEO_ACCEPT` lists in
  tools.ts wired through the five AV file inputs, hero art moved to
  `public/heroes/` with a second piece, the real crayon glyph in the hero
  flip tile, plus the fixes listed below. All verification green except the
  one budget failure noted at the end of this section.
- Verification (2026-08-13): `bun run lint` (5 checks), `bun run test`
  (349 QUnit) and `node scripts/verify/all.mjs` (44 rigs) all green.
     - `gradient.mjs` was rewritten this stretch. It drove
       `div.w-56.border-l`, the right sidebar that round-3 docking deleted
       in `8fbe785`, and crashed before its first check. It now opens the
       Inspector MODULE from the omnibar (`openModule(page, "Inspector")`)
       and drives `.sub-grad-*` rows by label + buttons by aria-label, on
       the shared harness.mjs. 26 checks, ALL PASS.
     - `static-smoke.mjs` was DELETED this stretch. It read `out/tools`,
       the Next static-export directory the Ember build never produces
       (build target is `dist/`), so it could not pass and its own header
       said "delete after use". `static.mjs` supersedes it (reads `dist`,
       shared harness, `bun run verify:static`). Its one unique check — the
       dev rig (`window.__substrata`) not shipping in the prod build — was
       moved into static.mjs alongside a new editor-boot check.
- `review-fixes.mjs` was also failing before this stretch — its Edit-menu
  driver matched button text exactly, and the items now carry their
  shortcut hint inside the button ("Duplicate ⌘D"). Fixed to a prefix
  match; the menu itself was working.
- BUNDLE BUDGET (was failing, FIXED 2026-08-13, Prompt D): `static.mjs`'s
  "app/lib stays out of the eager graph" check was failing — `main` was
  286 kB against a 200 kB ceiling. ROOT CAUSE, from a sourcemap attribution
  of a HEAD build (worktree at 3ed7c6c, sourcemaps on, VLQ mappings decoded
  per source): `color-name-list` (the nearest-name dictionary) was 176 kB,
  62% of main, and EAGER via `omni.ts` (the front-page omnibox) → both
  `colour-parse.ts` (`detectColour` → `parseNamedColour`) and
  `colour-names.ts` (`getColourName`) → `color-name-list/bestof`. Every
  visitor who never typed a colour still downloaded the dictionary.
  FIX (three edits): (1) omni.ts dynamic-imports colour-names inside the
  async `colourAnswers`, so the dictionary loads only when a colour is
  actually read; (2) colour-parse.ts's `detectColour` now resolves CSS
  colour keywords through a 1x1 canvas (browser owns the list, zero data)
  instead of `parseNamedColour`, so it no longer imports colour-names — it
  deliberately no longer parses the fancy color-name-list names, only real
  CSS keywords; (3) `parseNamedColour`/`NAMED_COLOUR_MAP` removed from
  colour-names.ts as dead. colour-palette-dialog already dynamic-imports
  colour-names. Result: `main` 286 kB → 126 kB, color-name-list absent from
  main, `static.mjs` ALL PASS (31). `static.mjs` is excluded from all.mjs —
  run `bun run verify:static` to see the budget check.
- `scripts/verify/classes.mjs` is new and important: it fails when a
  `dt-` class used in any component has no definition under app/styles.
  It exists because a bulk stylesheet edit silently deleted an unrelated
  rule block (see memory `scss-bulk-edit-hazard`). Never edit scss by
  anchor-range slicing.
- Copy gaps: Ruby runs `slopsieve` and has filled every gap so far; the
  list is currently empty. Every new tool still leaves its description
  and 4+-word strings as gaps per the global rules.
- package-lock.json was resynced 2026-08-13 via `/opt/homebrew/bin/npm
install --package-lock-only` (the real npm binary, 11.18.0 — bypasses
  the fish `npm`→bun alias; `realnpm` is absent but unnecessary). Added
  `@bjorn3/browser_wasi_shim@0.4.2`. It is tracked for CF Pages deploys.
  This resync is part of the uncommitted stretch.

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

### Wave 3 — recorders (MediaRecorder)

| Tool            | id                | Core                                              |
| --------------- | ----------------- | ------------------------------------------------- |
| Voice Recorder  | `voice-recorder`  | getUserMedia + MediaRecorder, level meter, export |
| Screen Recorder | `screen-recorder` | getDisplayMedia + MediaRecorder, webm download    |

lib/video's `resolveDuration` already covers MediaRecorder's
Infinity-duration output (Chromium bug 642012).

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

## Omnibox — remaining microtools

Built (README table in docs/frontpage/): Encoding Tools row, Shavian,
paper sizes, glyph lookup, Tailwind class, URL→QR, SVG optimise, algebra.
Ceilings fixed: named CSS colours now parse; unit detection falls through
to unit-converter's UNIT_CATEGORIES symbol index (e.g. `5km`).

## v1 features still to port (requested 2026-08-11)

**Stickers under each tool** and the **sticker bin at the end of the
tool list**. v1 reference lives in git history (tree at `c6c6e6d~1`):

- `components/sticker-wall.tsx` holds the wall AND the per-tool
  `PeelSticker` mode (commits `19c45e8` peelable wall, `8567035`
  per-tool series, `ce4ed29` last art additions).
- Per-tool: `/stickers/lousy/<toolId>.png`, 52 die-cut stickers in 1x
  and @2x with transparent margins clipped, rendered beneath every tool
  page with a "Have a sticker!" caption; `app/tools/[toolId]/page.tsx`
  in that tree shows the wiring.
- Assets: `public/stickers/` (wall art plus `lousy/`, 108 tree entries)
  exists ONLY in git history — the current public/ has no stickers.
  Restore with `git checkout c6c6e6d~1 -- public/stickers`.
- templates/index.gts's header comment lists the sticker wall among the
  GSAP/motion-dependent "Phase 1" items (with TAXIWAY and Friends of
  Delphi); the peel animation either brings that dependency in or gets
  rebuilt without it. Tools added since the port (colour-atlas, the six
  AV tools) have no lousy sticker art yet — Ruby draws those.

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

Four handoff prompts are written in `docs/handoffs/handoffs.md` (gitignored,
local-only):

1. **Prompt A** — AV wave 3 recorders (voice-recorder, screen-recorder).
2. **Prompt B** — the remaining omnibox microtools (8 reading kinds).
3. **Prompt C** — the v1 sticker port (per-tool sticker + bin).
4. **Prompt D** — the `main` bundle budget failure (bundle trace: leak or
   recalibrate the ceiling).

The uncommitted close-out stretch is ready to commit whenever Ruby wants it;
the `gradient.mjs` rewrite and the `layers-panel` guard are already done.
