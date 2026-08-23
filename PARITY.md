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

- **Tools tracked:** 89 (shipped, any surface)
- **On all three surfaces:** 41
- **Web:** 85 · **CLI:** 46 · **iOS:** 51
- **Backlog:** 29 planned tools (web-first) — see the Backlog section at the end.
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
| Image Compressor (`image-compressor`)         | ✅  |         ❌          | ❌  | new 2026-08; MozJPEG/WebP/OxiPNG/AVIF re-encode in a worker on @jsquash wasm, AVIF gated (slow)                                                                                                                              |
| Image Converter (`image-converter`)           | ✅  |    ✅ `convert`     | ✅  | CLI: + jxl (lossless-only) + icns (2026-07)                                                                                                                                                                                  |
| Image De-skewer (`image-deskewer`)            | ✅  |         ❌          | ❌  | new 2026-08; four draggable corners → planar homography, bilinear resample on the main thread, aspect presets (A4, Letter, …), PNG out                                                                                       |
| Image Splitter (`image-splitter`)             | ✅  |     ✅ `split`      | ✅  |                                                                                                                                                                                                                              |
| Image Stitcher (`image-stitcher`)             | ✅  |     ✅ `stitch`     | ✅  | new 2026-07; edge-stitch + batch grid. CLI: flat row/col + grid; nested mosaics editor-only. iOS (2026-07): full mosaic editor + batch grid + Stitch Images intent; PNG/JPEG only — ImageIO has no WebP/JXL encoder (probed) |
| Image Tracer (`image-tracer`)                 | ✅  |     ✅ `trace`      | ✅  | raster → SVG                                                                                                                                                                                                                 |
| Metadata Stripper (`metadata-stripper`)       | ✅  |         ❌          | ❌  | new 2026-08; EXIF/GPS/XMP/IPTC strip without re-encoding (JPEG/PNG/WebP/GIF segments), before/after removal list, ICC kept by default                                                                                        |
| SVG Optimiser (`svg-optimiser`)               | ✅  |      ✅ `svgo`      | ✅  |                                                                                                                                                                                                                              |
| Paste Image (`paste-image`)                   | ✅  |         ➖          | ✅  | clipboard-driven                                                                                                                                                                                                             |
| Placeholder Generator (`placeholder-genny`)   | ✅  |  ✅ `placeholder`   | ✅  | CLI: png or svg output                                                                                                                                                                                                       |
| Base64 Image Encoder (`base64-image-encoder`) | ✅  | ✅ `encode datauri` | ❌  | image file → Base64 data URI; CLI folds it into Encoding Tools                                                                                                                                                               |
| Document Scanner (`document-scanner`)         | ➖  |         ➖          | ✅  | iOS-only (camera + OCR)                                                                                                                                                                                                      |

## Audio & Video

| Tool (web ID)                             |  W  |  C  |  I  | Notes                                                                                                                                                                                |
| ----------------------------------------- | :-: | :-: | :-: | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Audio Atlas (`audio-atlas`)               | ✅  | ❌  | ❌  | new 2026-08; one-file interrogation: meta, peak dBFS, BS.1770 LUFS, waveform, spectrogram                                                                                            |
| Audio Extractor (`audio-extractor`)       | ✅  | ❌  | ❌  | new 2026-08; video → WAV / M4A (AAC) / Ogg (Opus) / FLAC through mediabunny `Conversion` (video discarded, packets copied when the codec matches, else WebCodecs encode)             |
| Audio Normaliser (`audio-normaliser`)     | ✅  | ❌  | ❌  | new 2026-08; integrated LUFS (BS.1770, `lib/audio.ts`) → gain to -14/-16/-23 with a -1 dBFS sample-peak ceiling (`lib/normalise.ts`), WAV out with the result re-measured            |
| Audio Trimmer (`audio-trimmer`)           | ✅  | ❌  | ❌  | new 2026-08; drag selection, fades, wav export (`lib/audio.ts`), mp3 deferred                                                                                                        |
| Auto Subtitle (`auto-subtitle`)           | ✅  | ❌  | ❌  | new 2026-08; local Whisper via transformers.js (`lib/transcribe.ts`), fast/reasonable/accurate modes, word→cue on `lib/subtitles.ts`; Accurate requires WebGPU                       |
| Frame Extractor (`frame-extractor`)       | ✅  | ❌  | ❌  | new 2026-08; video stills + contact sheet, `<video>` + canvas                                                                                                                        |
| Screen Recorder (`screen-recorder`)       | ✅  | ❌  | ❌  | new 2026-08; getDisplayMedia + MediaRecorder, optional mic mix-in, webm download                                                                                                     |
| Subtitle Converter (`subtitle-converter`) | ✅  | ❌  | ❌  | new 2026-08; srt↔vtt + shift/scale on `lib/subtitles.ts`                                                                                                                             |
| Subtitle Studio (`subtitle-studio`)       | ✅  | ❌  | ❌  | new 2026-08; burns SRT/VTT into video: canvas draw (`lib/subtitle-burn.ts`); WebCodecs via mediabunny (fast) with a MediaRecorder 1× fallback; font/size/colour/style, drag to place |
| Timecode Calculator (`timecode-calc`)     | ✅  | ❌  | ❌  | new 2026-08; SMPTE add/subtract, drop-frame correct, misinput-proof parser on `lib/timecode.ts` (user request)                                                                       |
| Voice Recorder (`voice-recorder`)         | ✅  | ❌  | ❌  | new 2026-08; getUserMedia + MediaRecorder, level meter, pause/resume, playback, download                                                                                             |
| Video Atlas (`video-atlas`)               | ✅  | ❌  | ❌  | new 2026-08; MediaInfo report (mediainfo.js wasm self-hosted in `public/mediainfo`): container, codecs, fps, bitrate, colour, per-stream panels                                      |
| Video Muter (`video-muter`)               | ✅  | ❌  | ❌  | new 2026-08; drops audio tracks by remux (mediabunny `Conversion`, packets copied, no re-encode), MP4/MOV → MP4, WebM/MKV → WebM                                                     |
| Video to GIF (`video-to-gif`)             | ✅  | ❌  | ❌  | new 2026-08; canvas frames through `lib/gif.ts` `AnimatedGifEncoder`, no wasm                                                                                                        |
| Video Trimmer (`video-trimmer`)           | ✅  | ❌  | ❌  | new 2026-08; In/Out + Mark from the playhead; Keyframe cut copies packets (mediabunny sinks/sources, no re-encode), Exact cut re-encodes via `Conversion` trim; container select     |
| Waveform Generator (`waveform-genny`)     | ✅  | ❌  | ❌  | new 2026-08; waveform → PNG/SVG at social sizes                                                                                                                                      |

## Social Media

| Tool (web ID)                              |  W  |       C        |  I  | Notes          |
| ------------------------------------------ | :-: | :------------: | :-: | -------------- |
| Matte Generator (`matte-genny`)            | ✅  |   ✅ `matte`   | ✅  |                |
| Seamless Scroll Generator (`scroll-genny`) | ✅  |  ✅ `scroll`   | ✅  | carousel tiles |
| Social Media Cropper (`social-cropper`)    | ✅  |   ✅ `crop`    | ✅  |                |
| Watermarker (`watermarker`)                | ✅  | ✅ `watermark` | ✅  |                |

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

## PDF

| Tool (web ID)                      |  W  |       C        |  I  | Notes                                                                                                |
| ---------------------------------- | :-: | :------------: | :-: | ---------------------------------------------------------------------------------------------------- |
| PDF Preflight (`pdf-preflight`)    | ✅  | ✅ `preflight` | ✅  |                                                                                                      |
| PDF Organiser (`pdf-organiser`)    | ✅  |       ❌       | ❌  | new 2026-08; merge, split (ranges / one file per page), drag-reorder page grid with rotate + delete  |
| Images ⇄ PDF (`image-to-pdf`)      | ✅  |       ❌       | ❌  | new 2026-08; one page per image with size/fit/margin; PDF pages out as PNGs                          |
| Rotate & Crop (`pdf-rotate-crop`)  | ✅  |       ❌       | ❌  | new 2026-08; per-page 90° rotation (+ rotate-all), drag-box crop applied to current or all pages     |
| Page Numbers (`pdf-page-numberer`) | ✅  |       ❌       | ❌  | new 2026-08; page numbers ({n}/{N}, start-at, skip-first) + optional text stamp, 3×3 anchor, pdf-lib |
| PDF Compressor (`pdf-compressor`)  | ✅  |       ❌       | ❌  | new 2026-08; MuPDF wasm (self-hosted, lazy); lossless structural squeeze, no image downsampling      |

## Print & Production

| Tool (web ID)                     |  W  |      C      |  I  | Notes                                     |
| --------------------------------- | :-: | :---------: | :-: | ----------------------------------------- |
| Print Imposer (`imposer`)         | ✅  | ✅ `impose` | ✅  | multi-sheet: saddle/perfect/N-up          |
| **Zine Imposer (`zine-imposer`)** | ✅  |  ✅ `zine`  | ✅  | single-sheet folds — see fold table below |

## Dev Tools

| Tool (web ID)                                |  W  |     C      |  I  | Notes                                                                                                                                                                                 |
| -------------------------------------------- | :-: | :--------: | :-: | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Meta Tag Generator (`meta-tag-genny`)        | ✅  | ✅ `meta`  | ✅  |                                                                                                                                                                                       |
| Regex Tester (`regex-tester`)                | ✅  | ✅ `regex` | ✅  |                                                                                                                                                                                       |
| Tailwind Cheat Sheet (`tailwind-cheatsheet`) | ✅  |     ➖     | ✅  | reference-browser UI, no CLI analog                                                                                                                                                   |
| HTTP Status (`http-status`)                  | ✅  |     ➖     | ➖  | new 2026-08; searchable 100–511 reference: phrase, defining RFC section (linked), default-cacheability; copy on code click                                                            |
| JWT Decoder (`jwt-decoder`)                  | ✅  |     ➖     | ➖  | new 2026-08; local decode of header & payload JSON, alg + iat/nbf/exp humanised, expired badge; signature opaque, not verified; no CLI/iOS analog                                     |
| UUID Generator (`uuid-genny`)                | ✅  |     ➖     | ➖  | new 2026-08; bulk UUID v4 / RFC 9562 v7 / Nano ID                                                                                                                                     |
| Cron Builder (`cron-builder`)                | ✅  |     ➖     | ➖  | new 2026-08; five-field builder (per-field presets + free edit), canonical expression, plain-language reading, next five local runs; dom/dow OR; names JAN–DEC/SUN–SAT, Sunday 0 or 7 |
| JSON Formatter (`json-formatter`)            | ✅  |     ➖     | ➖  | new 2026-08; format/minify at 2 or 4 spaces or tabs, collapsible tree view, engine message + line:column on parse errors with the source line highlighted; .json drop/open            |
| Request Builder (`request-builder`)          | ✅  |     ➖     | ❌  | new 2026-08; form → cURL command + raw HTTP/1.1 request, copy-only (nothing is sent); shell single-quote escaping, Host/Content-Length derived unless overridden                      |

## Other / Generators

| Tool (web ID)                           |  W  |       C       |  I  | Notes                                                                                                                                                                                                                                                                                                                                   |
| --------------------------------------- | :-: | :-----------: | :-: | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| QR Generator (`qr-genny`)               | ✅  |    ✅ `qr`    | ✅  | WiFi form (security type, hidden SSID, spec-escaped `WIFI:` string): W ✅ · C ✅ `--wifi` · I ✅ (2026-07). "Add information" plaintext captions on exports: W ✅ · C ❌ · I ✅ (2026-07)                                                                                                                                               |
| Barcode Generator (`code-genny`)        | ✅  | ✅ `barcode`  | ✅  | Transparent PNG export: W ✅ · C ✅ `--bg transparent` · I ✅ (2026-07). Human-readable numbers (HRI) under 1D codes: W ✅ · C ✅ `--text` (system fonts via resvg) · I ✅ (2026-07)                                                                                                                                                    |
| Text Scratchpad (`markdown-writer`)     | ✅  |      ➖       | ✅  | plain textarea + text-manipulation utilities; interactive editor, no CLI analog                                                                                                                                                                                                                                                         |
| Text Editor (`text-editor`)             | ✅  |      ➖       | ❌  | interactive editor, no CLI analog (cf. `pixel-picker`); distraction-free live-preview Markdown writer (raw ProseMirror). CommonMark + GFM (tables, strikethrough, task lists, footnotes); click-to-convert block-type gutter menu; full-screen focus mode; Markdown paste; focus highlights + typewriter; exports md/html/clipboard/pdf |
| Cipher Decoder (`decoder`)              | ✅  | ✅ `decipher` | ❌  | classical ciphers (distinct from base64/url decode)                                                                                                                                                                                                                                                                                     |
| NFC Reader/Writer (`nfc-reader-writer`) | ➖  |      ➖       | ✅  | iOS-only (NFC hardware)                                                                                                                                                                                                                                                                                                                 |
| Password Generator (`password-genny`)   | ✅  |      ➖       | ➖  | new 2026-08; crypto-sampled, unbiased; classes + lookalike exclusion; EFF-wordlist passphrase; bulk list + copy                                                                                                                                                                                                                         |

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

| Tool (web ID)                                     |  W  |      C       |  I  | Notes                                                                                                                      |
| ------------------------------------------------- | :-: | :----------: | :-: | -------------------------------------------------------------------------------------------------------------------------- |
| Shavian Transliterator (`shavian-transliterator`) | ✅  | ✅ `shavian` | ✅  |                                                                                                                            |
| Morse Code (`morse-code`)                         | ✅  |      ❌      | ❌  | new 2026-08; ITU Morse both ways, WebAudio playback                                                                        |
| Braille Converter (`braille-converter`)           | ✅  |      ❌      | ❌  | new 2026-08; uncontracted (Grade 1) Unicode braille both ways                                                              |
| IPA Transcription (`ipa-transcriber`)             | ✅  |      ❌      | ❌  | new 2026-08; CMU dictionary (shared with Shavian) → IPA, General American                                                  |
| NATO Phonetic (`nato-phonetic`)                   | ✅  |      ❌      | ❌  | new 2026-08; NATO/ICAO, DIN 5009:2022 and traditional German tables; interactive letter chart (Morse, semaphore, ICS flag) |

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

---

## Backlog — planned tools (web-first)

Not yet built. The full backlog with per-tool notes and effort tags lives in
`docs/handoffs/tool-backlog.md` (local-only). These are all web-first; the CLI
and iOS surfaces pick them up afterwards where they apply. When one ships, move
its row into the matching category table above and flip W to ✅.

**Decisions (2026-08-13):**

- Text & Typography utilities (line sort/dedupe, case conversion, whitespace and
  invisible-char cleaning, readability score, fancy-unicode) are NOT standalone
  tools — they fold into the Text Scratchpad (`markdown-writer`), already a
  "textarea + text-manipulation utilities" surface.
- Metadata Stripper stays plain EXIF/GPS/XMP; no AI, no C2PA credential removal.

| Category               | Planned tools                                                                                                                                                                                  |
| ---------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Audio & Video          | Video Atlas · Video Muter · Audio Normaliser · Audio Extractor · Audio Speedup · Audio Converter · Video Trimmer · Video Converter · Video Compressor · Video Social Cropper · Subtitle Studio |
| Images & Assets        | EXIF Viewer · Dithering · Blurhash / ThumbHash · Sprite Sheet Packer                                                                                                                           |
| Print & Production     | Label / Card Sheet Layout                                                                                                                                                                      |
| Other / Generators     | Data Format Converter · Hash / Checksum (file drop) · Cubic-bezier / Easing Editor · Lorem Ipsum Generator · URL / Query-string Editor · MIME Type Lookup                                      |
| Colour                 | Colour Mixer / Blender · Data-viz Scale Generator · Kelvin → RGB                                                                                                                               |
| Calculators & Encoding | Aspect Ratio Calculator · Percentage Calculator · Bitwise / Binary Calculator · Roman Numeral Converter                                                                                        |

Total: 29 planned (11 AV · 4 image · 1 PDF · 6 dev · 3 colour · 4 calc).
