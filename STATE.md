# STATE — delphitools working state

Rewritten 2026-08-11, late in the AV/omnibox stretch. A fresh session
should read this file, CLAUDE.md and PARITY.md before touching anything.

## Where the repo stands

- Ember app at the repo root (`v2-ember` branch). Recent commits:
  `5ac7514` (AV wave 1), `5b18251` (front-page mocks rescued into
  docs/frontpage/), then HEAD is the big checkpoint (omnibox front
  page, AV wave 2, transports, polish round — this file ships in it, so
  it cannot name its own hash). Working tree clean; Ruby triggers
  commits explicitly.
- Verification: `bun run lint` (5 checks), `bun run test` (346 QUnit) and
  `node scripts/verify/all.mjs` (44 rigs) all green except two rigs that
  are stale for reasons of their own:
     - `gradient.mjs` drives `div.w-56.border-l`, the right sidebar that
       round-3 docking deleted in `8fbe785`. It crashes before its first
       check. Rewriting its panel drivers against the Inspector MODULE
       (`.sub-insp*`, opened from the omnibar — see layers-tree.mjs) is the
       fix; the checks themselves are still worth having.
     - `static-smoke.mjs` needs a `bun run build:static` first (reads
       `out/tools`); it is not run standalone.
- `review-fixes.mjs` was also failing before this stretch — its Edit-menu
  driver matched button text exactly, and the items now carry their
  shortcut hint inside the button ("Duplicate ⌘D"). Fixed to a prefix
  match; the menu itself was working.
- `scripts/verify/classes.mjs` is new and important: it fails when a
  `dt-` class used in any component has no definition under app/styles.
  It exists because a bulk stylesheet edit silently deleted an unrelated
  rule block (see memory `scss-bulk-edit-hazard`). Never edit scss by
  anchor-range slicing.
- Copy gaps: Ruby runs `slopsieve` and has filled every gap so far; the
  list is currently empty. Every new tool still leaves its description
  and 4+-word strings as gaps per the global rules.
- package-lock.json was never re-synced after `bun add` calls this
  stretch (`realnpm` absent from the agent shell); it is tracked for CF
  Pages deploys and is stale against package.json/bun.lock.

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

Known adjacent bug, NOT fixed (pre-existing, outside this stretch):
`layers-panel.gts`'s `handleDragEnd` ignores `event.canceled`, so Escape
mid-drag still commits a layer reorder. `substrata-shell.gts:67` shows the
guard; fx-panel's zones now use it.

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

Not yet built (README table in docs/frontpage/): Encoding Tools row,
Shavian, paper sizes, glyph lookup, Tailwind class, URL→QR, SVG
optimise, algebra. Known ceilings: named CSS colours do not parse;
unit detection covers px/pt/em/rem only (`5km` needs a symbol index over
unit-converter's UNIT_CATEGORIES).

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

1. Wave 3 recorders, the remaining omnibox microtools, or the v1 sticker
   port. The `gradient.mjs` rewrite is small and unclaimed.
