# delphitools — Cross-Platform Tool Parity

This is the **canonical, hand-maintained** record of which tools exist on each
delphitools surface. It lives in the web repo (`delphitools`) because that is the
most complete implementation and the de-facto source of truth for the catalogue.

The three surfaces:

| Code  | Surface                  | Repo              | Registry (source of truth)            |
| ----- | ------------------------ | ----------------- | ------------------------------------- |
| **W** | Web app (Ember)          | `delphitools`     | `app/lib/tools.ts`                    |
| **C** | Rust CLI (`delphi`/`dt`) | `delphitools-cli` | `src/cli.rs` (`Commands` enum)        |
| **I** | iOS app (SwiftUI)        | `delphitools-ios` | `delphitools/Core/ToolRegistry.swift` |

**Legend:** ✅ shipped · 🚧 planned / partial · ❌ gap (candidate to add) · ➖ not
applicable on this surface (hardware/native or format constraint).

> **Keeping this current:** when you add, rename, or remove a tool on any surface,
> update the matching row here in the same change. Tool **IDs** are the web IDs;
> the CLI uses different command names, shown in parentheses in the **C** column.

---

## Summary

- **Tools tracked:** 68
- **On all three surfaces:** 41
- **Web:** 64 · **CLI:** 46 · **iOS:** 51
- iOS-exclusive (native/hardware): Colour Camera, Document Scanner, Font Installer, NFC Reader/Writer
- Web-exclusive: Pixel Picker, Text Editor (pandoc.wasm note: GPL — incompatible with the App Store, and won't run on-device on iOS, hence Document Converter I 🚧)
- CLI-only sub-feature: `hash` (text hashing, folded into Encoding Tools elsewhere)
- Web-only **app**: Substrata — listed in the catalogue (`lib/tools.ts`, links out
  to `/editor`) but see the note below; excluded from the counts above.

---

## Substrata (image editor) — outside the parity contract

**Substrata** is a browser-based image editor at `/editor` in the web repo. It is
surfaced as a regular `app/lib/tools.ts` grid entry (Images & Assets + Greatest
Hits; `href: "/editor"`, no `/tools/[id]` page generated) plus a sidebar item
beside Home. It remains **web-only / explicitly non-parity**: a heavy Fabric.js canvas app (layers, per-layer effects
stack, local persistence) with no realistic CLI or iOS sibling, so it is excluded
from the W/C/I tables and the tool counts above. Precedent: the Pixel
Picker is similarly web-only.

---

## Colour

| Tool (web ID)                                 |  W  |          C           |  I  | Notes                                                       |
| --------------------------------------------- | :-: | :------------------: | :-: | ----------------------------------------------------------- |
| Colour Converter (`colour-converter`)         | ✅  |     ✅ `colour`      | ✅  |                                                             |
| Colour Atlas (`colour-atlas`)                 | ✅  |          ❌          | ❌  | v2 web only so far; one-colour interrogation page           |
| Colour Blindness Simulator (`colorblind-sim`) | ✅  |   ✅ `colorblind`    | ✅  |                                                             |
| Contrast Checker (`contrast-checker`)         | ✅  |    ✅ `contrast`     | ✅  |                                                             |
| Harmony Generator (`harmony-genny`)           | ✅  |     ✅ `harmony`     | ✅  |                                                             |
| Palette Generator (`palette-genny`)           | ✅  |     ✅ `palette`     | ✅  | CLI: 28 strategies                                          |
| Palette Collection (`palette-collection`)     | ✅  |          ❌          | ✅  |                                                             |
| Palette Extractor (`palette-extractor`)       | ✅  | ✅ `palette --from`  | ❌  | iOS analog = Colour Camera. CLI: median-cut, dominant-first |
| Pixel Picker (`pixel-picker`)                 | ✅  |          ➖          | ❌  | iOS analog = Colour Camera                                  |
| Colour Camera (`colour-camera`)               | ❌  |          ➖          | ✅  | iOS-only (live camera)                                      |
| Gradient Generator (`gradient-genny`)         | ✅  |          ➖          | ✅  | dropped from CLI specs (`5195897`)                          |
| Tailwind Shade Generator (`tailwind-shades`)  | ✅  | ✅ `tailwind-shades` | ✅  |                                                             |

## Images & Assets

| Tool (web ID)                                 |  W  |          C          |  I  | Notes                                                                                                                                                                                                                        |
| --------------------------------------------- | :-: | :-----------------: | :-: | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Artwork Enhancer (`artwork-enhancer`)         | ✅  |     ✅ `noise`      | ✅  | colour-noise overlay                                                                                                                                                                                                         |
| Background Remover (`background-remover`)     | ✅  |      ✅ `rmbg`      | ✅  | ML model download                                                                                                                                                                                                            |
| Favicon Generator (`favicon-genny`)           | ✅  |    ✅ `favicon`     | ✅  |                                                                                                                                                                                                                              |
| Image Clipper (`image-clipper`)               | ✅  |      ✅ `clip`      | ✅  | trim transparent edges                                                                                                                                                                                                       |
| Image Converter (`image-converter`)           | ✅  |    ✅ `convert`     | ✅  | CLI: + jxl (lossless-only) + icns (2026-07)                                                                                                                                                                                  |
| Image Splitter (`image-splitter`)             | ✅  |     ✅ `split`      | ✅  |                                                                                                                                                                                                                              |
| Image Stitcher (`image-stitcher`)             | ✅  |     ✅ `stitch`     | ✅  | new 2026-07; edge-stitch + batch grid. CLI: flat row/col + grid; nested mosaics editor-only. iOS (2026-07): full mosaic editor + batch grid + Stitch Images intent; PNG/JPEG only — ImageIO has no WebP/JXL encoder (probed) |
| Image Tracer (`image-tracer`)                 | ✅  |     ✅ `trace`      | ✅  | raster → SVG                                                                                                                                                                                                                 |
| SVG Optimiser (`svg-optimiser`)               | ✅  |      ✅ `svgo`      | ✅  |                                                                                                                                                                                                                              |
| Paste Image (`paste-image`)                   | ✅  |         ➖          | ✅  | clipboard-driven                                                                                                                                                                                                             |
| Placeholder Generator (`placeholder-genny`)   | ✅  |  ✅ `placeholder`   | ✅  | CLI: png or svg output                                                                                                                                                                                                       |
| Base64 Image Encoder (`base64-image-encoder`) | ✅  | ✅ `encode datauri` | ❌  | image file → Base64 data URI; CLI folds it into Encoding Tools                                                                                                                                                               |
| Document Scanner (`document-scanner`)         | ➖  |         ➖          | ✅  | iOS-only (camera + OCR)                                                                                                                                                                                                      |

## Audio & Video

| Tool (web ID)                             |  W  |  C  |  I  | Notes                                                                                     |
| ----------------------------------------- | :-: | :-: | :-: | ----------------------------------------------------------------------------------------- |
| Audio Atlas (`audio-atlas`)               | ✅  | ❌  | ❌  | new 2026-08; one-file interrogation: meta, peak dBFS, BS.1770 LUFS, waveform, spectrogram |
| Audio Trimmer (`audio-trimmer`)           | ✅  | ❌  | ❌  | new 2026-08; drag selection, fades, wav export (`lib/audio.ts`), mp3 deferred             |
| Frame Extractor (`frame-extractor`)       | ✅  | ❌  | ❌  | new 2026-08; video stills + contact sheet, `<video>` + canvas                             |
| Screen Recorder (`screen-recorder`)       | ✅  | ❌  | ❌  | new 2026-08; getDisplayMedia + MediaRecorder, optional mic mix-in, webm download          |
| Subtitle Converter (`subtitle-converter`) | ✅  | ❌  | ❌  | new 2026-08; srt↔vtt + shift/scale on `lib/subtitles.ts`                                  |
| Voice Recorder (`voice-recorder`)         | ✅  | ❌  | ❌  | new 2026-08; getUserMedia + MediaRecorder, level meter, pause/resume, playback, download  |
| Video to GIF (`video-to-gif`)             | ✅  | ❌  | ❌  | new 2026-08; canvas frames through `lib/gif.ts` `AnimatedGifEncoder`, no wasm             |
| Waveform Generator (`waveform-genny`)     | ✅  | ❌  | ❌  | new 2026-08; waveform → PNG/SVG at social sizes                                           |

## Social Media

| Tool (web ID)                                  |  W  |       C        |  I  | Notes          |
| ---------------------------------------------- | :-: | :------------: | :-: | -------------- |
| Matte Generator (`matte-generator`)            | ✅  |   ✅ `matte`   | ✅  |                |
| Seamless Scroll Generator (`scroll-generator`) | ✅  |  ✅ `scroll`   | ✅  | carousel tiles |
| Social Media Cropper (`social-cropper`)        | ✅  |   ✅ `crop`    | ✅  |                |
| Watermarker (`watermarker`)                    | ✅  | ✅ `watermark` | ✅  |                |

## Typography & Text

| Tool (web ID)                               |  W  |          C           |  I  | Notes                                                                                                                                                                                                                                                                       |
| ------------------------------------------- | :-: | :------------------: | :-: | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Document Converter (`doc-converter`)        | ✅  |       ✅ `doc`       | 🚧  | Web: pandoc 3.9 wasm, any-to-any (md/html/docx/odt/epub/latex/rst/org/…). CLI: comrak core (md→html/txt native) + system `pandoc` shell-out for the long tail (stays 0BSD). iOS (planned): native subset only — GPL ✗ App Store (VLC precedent) + no on-device wasm runtime |
| Font File Explorer (`font-explorer`)        | ✅  |    ✅ `font-info`    | ✅  |                                                                                                                                                                                                                                                                             |
| Glyph Browser (`glyph-browser`)             | ✅  |      ✅ `glyph`      | ✅  |                                                                                                                                                                                                                                                                             |
| Large Type (`large-type`)                   | ✅  |          ❌          | ❌  | new 2026-07; huge per-character transcription display                                                                                                                                                                                                                       |
| Line Height Calculator (`line-height-calc`) | ✅  |   ✅ `line-height`   | ✅  |                                                                                                                                                                                                                                                                             |
| PX to REM (`px-to-rem`)                     | ✅  | ✅ `px2rem`/`rem2px` | ✅  |                                                                                                                                                                                                                                                                             |
| Typography Calculator (`typo-calc`)         | ✅  |      ✅ `typo`       | ✅  |                                                                                                                                                                                                                                                                             |
| Word Counter (`word-counter`)               | ✅  |       ✅ `wc`        | ✅  |                                                                                                                                                                                                                                                                             |
| Paper Sizes (`paper-sizes`)                 | ✅  |      ✅ `paper`      | ✅  | iOS groups under Print                                                                                                                                                                                                                                                      |
| Text Diff (`text-diff`)                     | ✅  |      ✅ `diff`       | ✅  |                                                                                                                                                                                                                                                                             |
| Font Installer (`font-installer`)           | ➖  |          ➖          | ✅  | iOS-only (system fonts)                                                                                                                                                                                                                                                     |

## Print & Production

| Tool (web ID)                     |  W  |       C        |  I  | Notes                                     |
| --------------------------------- | :-: | :------------: | :-: | ----------------------------------------- |
| PDF Preflight (`pdf-preflight`)   | ✅  | ✅ `preflight` | ✅  |                                           |
| Print Imposer (`imposer`)         | ✅  |  ✅ `impose`   | ✅  | multi-sheet: saddle/perfect/N-up          |
| **Zine Imposer (`zine-imposer`)** | ✅  |   ✅ `zine`    | ✅  | single-sheet folds — see fold table below |

## Other / Generators

| Tool (web ID)                                |  W  |       C       |  I  | Notes                                                                                                                                                                                                                                                                                                                                   |
| -------------------------------------------- | :-: | :-----------: | :-: | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| QR Generator (`qr-genny`)                    | ✅  |    ✅ `qr`    | ✅  | WiFi form (security type, hidden SSID, spec-escaped `WIFI:` string): W ✅ · C ✅ `--wifi` · I ✅ (2026-07). "Add information" plaintext captions on exports: W ✅ · C ❌ · I ✅ (2026-07)                                                                                                                                               |
| Barcode Generator (`code-genny`)             | ✅  | ✅ `barcode`  | ✅  | Transparent PNG export: W ✅ · C ✅ `--bg transparent` · I ✅ (2026-07). Human-readable numbers (HRI) under 1D codes: W ✅ · C ✅ `--text` (system fonts via resvg) · I ✅ (2026-07)                                                                                                                                                    |
| Meta Tag Generator (`meta-tag-genny`)        | ✅  |   ✅ `meta`   | ✅  |                                                                                                                                                                                                                                                                                                                                         |
| Regex Tester (`regex-tester`)                | ✅  |  ✅ `regex`   | ✅  |                                                                                                                                                                                                                                                                                                                                         |
| Tailwind Cheat Sheet (`tailwind-cheatsheet`) | ✅  |      ➖       | ✅  | reference-browser UI, no CLI analog                                                                                                                                                                                                                                                                                                     |
| Text Scratchpad (`markdown-writer`)          | ✅  |      ➖       | ✅  | plain textarea + text-manipulation utilities; interactive editor, no CLI analog                                                                                                                                                                                                                                                         |
| Text Editor (`text-editor`)                  | ✅  |      ➖       | ❌  | interactive editor, no CLI analog (cf. `pixel-picker`); distraction-free live-preview Markdown writer (raw ProseMirror). CommonMark + GFM (tables, strikethrough, task lists, footnotes); click-to-convert block-type gutter menu; full-screen focus mode; Markdown paste; focus highlights + typewriter; exports md/html/clipboard/pdf |
| Cipher Decoder (`decoder`)                   | ✅  | ✅ `decipher` | ❌  | classical ciphers (distinct from base64/url decode)                                                                                                                                                                                                                                                                                     |
| NFC Reader/Writer (`nfc-reader-writer`)      | ➖  |      ➖       | ✅  | iOS-only (NFC hardware)                                                                                                                                                                                                                                                                                                                 |

## Calculators & Encoding

| Tool (web ID)                       |  W  |              C              |  I  | Notes                         |
| ----------------------------------- | :-: | :-------------------------: | :-: | ----------------------------- |
| Scientific Calculator (`sci-calc`)  | ✅  |          ✅ `calc`          | ✅  |                               |
| Algebra Calculator (`algebra-calc`) | ✅  |             ❌              | ✅  |                               |
| Graph Calculator (`graph-calc`)     | ✅  |         ✅ `graph`          | ✅  | CLI: png/svg; no inequalities |
| Base Converter (`base-converter`)   | ✅  |          ✅ `base`          | ✅  |                               |
| Time Calculator (`time-calc`)       | ✅  |          ✅ `time`          | ✅  |                               |
| Unit Converter (`unit-converter`)   | ✅  |          ✅ `unit`          | ✅  |                               |
| Encoding Tools (`encoder`)          | ✅  | ✅ `encode`/`decode`/`hash` | ✅  | CLI splits encode/decode/hash |

## Turbo-nerd

| Tool (web ID)                                     |  W  |      C       |  I  | Notes |
| ------------------------------------------------- | :-: | :----------: | :-: | ----- |
| Shavian Transliterator (`shavian-transliterator`) | ✅  | ✅ `shavian` | ✅  |       |

---

## Feature parity: Zine Imposer fold types

The Zine Imposer composes a zine from **one sheet** of paper (the multi-sheet
booklet imposition lives in **Print Imposer**). Fold types are tracked per surface:

| Fold type                      |  W  |  C  |  I  | Pages                      | Sides            | Cut                            |
| ------------------------------ | :-: | :-: | :-: | -------------------------- | ---------------- | ------------------------------ |
| 8-page mini-zine (slit & fold) | ✅  | ✅  | ✅  | 8                          | single           | 1 central slit                 |
| Accordion / concertina         | ✅  | ✅  | ✅  | 4/6/8 (×2 if double-sided) | single or double | none, or 1 horizontal if split |

Accordion sub-options (all three surfaces): panel count **4/6/8**, **double-sided**
(continuous booklet, short-edge flip), and **split / two-up** (two identical
half-height copies stacked, cut apart — better panel aspect ratio; slot count
unchanged). On the CLI: `--panels`, `--double`, `--split` (the CLI imposes images
only and draws no guide lines, so the split cut is documented, not rendered).

Candidate future folds (single-sheet only — keep multi-sheet in Print Imposer):
4-page folio · quarter-fold card · tri-fold / gate leaflet · 16-page mini-zine.
