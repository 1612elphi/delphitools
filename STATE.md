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
- Verification is green across the board: `bun run lint` (5 checks),
  `bun run test` (346 QUnit), production build, and the harnesses —
  tools.mjs (63 routes), av-tools.mjs (6), audio-tools.mjs (16),
  omnibox.mjs (15), classes.mjs (static, ~2070 class uses).
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

## Substrata bugs (Ruby's testing, 2026-08-11 — unverified, not yet triaged)

Reported symptoms, in Ruby's words; the editor lives at /editor
(app/components/substrata/, lib/substrata/):

1. **Preset sizes are not centred properly** — a document created from a
   preset size sits off-centre (likely the canvas/artboard initial
   placement).
2. **LOOKS panel and FX panel do not populate at all**, although the
   content is known to be available. The Adjust tool's settings pane DOES
   populate fine — compare its wiring against the two dead panels for the
   difference.
3. **The colour panel does not show up at all.**

Starting points: the panel/docking system from commit `8fbe785`
("Substrata pass 1 — canvas, shell, panels, docking") and the dev-only
`window.__substrata` rig that the scripts/verify substrata harnesses
drive — a failing panel may already be reproducible headlessly there.

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

1. Substrata bug triage (the three reports above) — likely before wave 3,
   since it is fresh in Ruby's testing.
2. Then wave 3 recorders, or the remaining omnibox microtools, or the
   v1 sticker port.
