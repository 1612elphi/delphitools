# STATE — audio/video tool expansion

Written 2026-08-11, immediately after the repo restructure, as the working
state for the next stretch of work. A fresh session should read this file,
CLAUDE.md, and PARITY.md before touching anything.

## Where the repo stands

- The Ember app is the repo root (commit `c6c6e6d`); the Next app is deleted.
  Rollback point for the whole restructure: `03ffd3d`. Module prefix in
  imports is still `delphitools-v2`.
- Verification from the root is green: `bun run build`, `bun run lint` (all
  five checks), `bun run test` (316 QUnit tests), and the scripts/verify
  harnesses against `bun run start` on :3000.
- Colour Atlas (`colour-atlas`) shipped as the newest tool. Its catalogue
  description in `app/lib/tools.ts` is still an unfilled copy gap; run
  `slopsieve` at the root to fill it (a second pre-existing gap sits in
  shavian-transliterator.gts).
- The old concept docs were deleted with the root cleanup. Backups (front-page
  omnibox mocks, the AV survey, the Next-era DESIGN.md) sit in the session
  scratchpad under `pre-move-backup/` — that is under /private/tmp and will
  not survive a reboot or tmp cleanup. Rescue anything worth keeping before
  then.

## The plan: audio & video tools

Everything processes locally. Tier 1 needs nothing heavier than a 2.5 MB
wasm module; Tier 2 adds one codec or DSP port per tool; Tier 3 is the
WebCodecs pipelines. Build Tier 1 first, in waves, shared libs before tools.

### New category

`Audio & Video` in `app/lib/tools.ts`, placed after Images & Assets. The
category ships with its first tool, not ahead of it.

### Shared libs to build first (wave 0)

- `app/lib/subtitles.ts` — srt/vtt parse and write, cue model
  `{start, end, text}` in ms, time-shift and scale helpers. Unit tests.
- `app/lib/audio.ts` — decode a File via `decodeAudioData`, peak extraction
  for waveform rendering (min/max per bucket), wav encoder (16-bit PCM
  writer, ~30 lines). Unit tests for the wav header and peak buckets.
- Waveform canvas rendering will be shared by Audio Trimmer, Audio Atlas and
  Waveform Generator — extract once the second consumer exists, not before.

### Wave 1 — zero new dependencies

| Tool               | id                   | Core                                                                              |
| ------------------ | -------------------- | --------------------------------------------------------------------------------- |
| Subtitle Converter | `subtitle-converter` | srt↔vtt, time shift/scale, drag or paste; pure text on lib/subtitles              |
| Frame Extractor    | `frame-extractor`    | `<video>` + canvas: scrub, grab stills, contact sheet, poster export              |
| Video → GIF        | `video-to-gif`       | canvas frames through the existing `app/lib/gif.ts`; fps + width + range controls |

### Wave 2 — Web Audio on lib/audio

| Tool               | id               | Core                                                                                                                          |
| ------------------ | ---------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| Audio Trimmer      | `audio-trimmer`  | waveform, cut range, fade in/out, export wav (mp3 via lamejs is a deferred decision)                                          |
| Audio Atlas        | `audio-atlas`    | interrogation page: duration, format, sample rate, channels, peak, LUFS (BS.1770 K-weighting, pure JS), waveform, spectrogram |
| Waveform Generator | `waveform-genny` | waveform as SVG/PNG at social sizes                                                                                           |

### Wave 3 — recorders

| Tool            | id                | Core                                              |
| --------------- | ----------------- | ------------------------------------------------- |
| Voice Recorder  | `voice-recorder`  | getUserMedia + MediaRecorder, level meter, export |
| Screen Recorder | `screen-recorder` | getDisplayMedia + MediaRecorder, webm download    |

### Wave 4 — first heavy dependencies

| Tool        | id            | Core                                                                                                            |
| ----------- | ------------- | --------------------------------------------------------------------------------------------------------------- |
| Video Muter | `video-muter` | mp4box.js remux, drop audio track, no re-encode                                                                 |
| Video Atlas | `video-atlas` | mediainfo.js (~2.5 MB wasm, self-hosted in /public like the jxl codec): container, codecs, bitrate, fps, tracks |

### Later (recorded in this file so the survey survives)

- Tier 2: Audio Converter (per-codec wasm encoders, jxl pattern), Audio
  Normaliser (LUFS measure + gain), Audio Speedup (soundtouch port), Audio
  Extractor (video → wav/mp3), Video Trimmer (mp4box keyframe cut; WebCodecs
  for exact cuts).
- Tier 3: Video Converter, Video Compressor (target size), video social
  cropper, and **Subtitle Studio** (requested): video + subtitle file
  matched and edited together — manual offset/stretch over a waveform cue
  timeline, cue text/split/merge/retime, live preview over `<video>`.
  Exports in three grades: subtitle file (free), embedded subtitle track
  (mp4box remux, no re-encode), captions burnt in (per-frame canvas
  compositing + WebCodecs encode — the rendering that makes it Tier 3).
  Subtitle Converter's lib/subtitles.ts is its parse/write core.
- ffmpeg.wasm stays ruled out (~31 MB + COOP/COEP); per-codec wasm modules
  self-hosted in /public instead.
- Omnibox/front-page concepts (separate effort, mocks in the tmp backup):
  drop of .mp3/.mp4/.srt routes to these tools; the two atlases are the
  headline drop destinations.

## Per-tool checklist (every tool, every time)

1. Component `app/components/tools/<id>.gts` — registry auto-globs, no list
   to edit.
2. Entry in `app/lib/tools.ts`. The description is USER COPY: leave a copy
   gap with spec+sample per the global CLAUDE.md rules, never draft wording
   directly. Names stay 1–3 words.
3. `app/styles/tools/_<id>.scss` + `@use "tools/<id>"` in app.scss, dense/
   flush/hairline idiom (2px frame, 1px nested hairlines, square corners).
4. New icons → `node scripts/gen-icons.mjs`.
5. PARITY.md row (W ✅, C/I ❌ until the siblings catch up) + summary counts.
6. Unit tests for lib logic (tests/unit/lib); tool-level tests only where
   pure functions are exported (see colour-converter-test.ts pattern).
7. `bun run lint` and `bun run test` green before calling it done; a
   scripts/verify harness only for tools with canvas/worker behaviour worth
   pinning.

## Status ledger

- 2026-08-11: Wave 1 built (uncommitted). `lib/subtitles.ts` +
  `AnimatedGifEncoder` in `lib/gif.ts`, both with unit tests; Subtitle
  Converter, Frame Extractor and Video → GIF shipped with the new
  Audio & Video category; PARITY.md rows + counts (63 tracked / 59 web).
  `lib/video.ts` added along the way: shared `seekTo` (same-position seeks
  may never fire `seeked`) and `resolveDuration` (MediaRecorder webm
  reports Infinity — Chromium bug 642012, the path a dropped screen
  recording takes). Lint and tests green (328); `scripts/verify/av-tools.mjs`
  drives all three tools with a synthesised webm (drop → resolve →
  encode/grab) and passes. `lib/audio.ts` deliberately deferred to wave 2 —
  it has no wave-1 consumer. Eleven new copy gaps (descriptions, drop-zone
  titles, error lines) — run `slopsieve`.

Next action: wave 2, `lib/audio.ts` first (decode + peaks + wav writer,
with tests), then Audio Trimmer.

## Deferred decisions

- mp3 export in Audio Trimmer: lamejs (~150 KB) or wav-only v1.
- LUFS in Audio Atlas: integrated only, or also short-term/momentary.
- Spectrogram: render cost cap (offline FFT vs AnalyserNode sweep).
- Whether Waveform Generator merges into Audio Atlas as an export instead
  of being its own catalogue entry.
