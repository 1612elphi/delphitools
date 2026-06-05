# delphitools — Cross-Platform Tool Parity

This is the **canonical, hand-maintained** record of which tools exist on each
delphitools surface. It lives in the web repo (`delphitools`) because that is the
most complete implementation and the de-facto source of truth for the catalogue.

The three surfaces:

| Code | Surface | Repo | Registry (source of truth) |
| ---- | ------- | ---- | -------------------------- |
| **W** | Web app (Next.js) | `delphitools` | `lib/tools.ts` |
| **C** | Rust CLI (`delphi`/`dt`) | `delphitools-cli` | `src/cli.rs` (`Commands` enum) |
| **I** | iOS app (SwiftUI) | `delphitools-ios` | `delphitools/Core/ToolRegistry.swift` |

**Legend:** ✅ shipped · 🚧 planned / partial · ❌ gap (candidate to add) · ➖ not
applicable on this surface (hardware/native or format constraint).

> **Keeping this current:** when you add, rename, or remove a tool on any surface,
> update the matching row here in the same change. Tool **IDs** are the web IDs;
> the CLI uses different command names, shown in parentheses in the **C** column.

---

## Summary

- **Tools tracked:** 55
- **On all three surfaces:** 33
- **Web:** 52 · **CLI:** 38 · **iOS:** 51
- iOS-exclusive (native/hardware): Colour Camera, Document Scanner, Font Installer, NFC Reader/Writer
- Web-exclusive: Palette Extractor, Pixel Picker, Cipher Decoder, Document Converter (pandoc.wasm is GPL — incompatible with the App Store, and won't run on-device on iOS)
- CLI-only sub-feature: `hash` (text hashing, folded into Encoding Tools elsewhere)

---

## Colour

| Tool (web ID) | W | C | I | Notes |
| ------------- | :-: | :-: | :-: | ----- |
| Colour Converter (`colour-converter`) | ✅ | ✅ `colour` | ✅ | |
| Colour Blindness Simulator (`colorblind-sim`) | ✅ | ✅ `colorblind` | ✅ | |
| Contrast Checker (`contrast-checker`) | ✅ | ✅ `contrast` | ✅ | |
| Harmony Generator (`harmony-genny`) | ✅ | ✅ `harmony` | ✅ | |
| Palette Generator (`palette-genny`) | ✅ | ✅ `palette` | ✅ | CLI: 28 strategies |
| Palette Collection (`palette-collection`) | ✅ | ❌ | ✅ | |
| Palette Extractor (`palette-extractor`) | ✅ | ❌ | ❌ | iOS analog = Colour Camera |
| Pixel Picker (`pixel-picker`) | ✅ | ➖ | ❌ | iOS analog = Colour Camera |
| Colour Camera (`colour-camera`) | ❌ | ➖ | ✅ | iOS-only (live camera) |
| Gradient Generator (`gradient-genny`) | ✅ | ❌ | ✅ | |
| Tailwind Shade Generator (`tailwind-shades`) | ✅ | ✅ `tailwind-shades` | ✅ | |

## Images & Assets

| Tool (web ID) | W | C | I | Notes |
| ------------- | :-: | :-: | :-: | ----- |
| Artwork Enhancer (`artwork-enhancer`) | ✅ | ✅ `noise` | ✅ | colour-noise overlay |
| Background Remover (`background-remover`) | ✅ | ✅ `rmbg` | ✅ | ML model download |
| Favicon Generator (`favicon-genny`) | ✅ | ✅ `favicon` | ✅ | |
| Image Clipper (`image-clipper`) | ✅ | ✅ `clip` | ✅ | trim transparent edges |
| Image Converter (`image-converter`) | ✅ | ✅ `convert` | ✅ | |
| Image Splitter (`image-splitter`) | ✅ | ✅ `split` | ✅ | |
| Image Tracer (`image-tracer`) | ✅ | ✅ `trace` | ✅ | raster → SVG |
| SVG Optimiser (`svg-optimiser`) | ✅ | ✅ `svgo` | ✅ | |
| Paste Image (`paste-image`) | ✅ | ➖ | ✅ | clipboard-driven |
| Placeholder Generator (`placeholder-genny`) | ✅ | ❌ | ✅ | |
| Document Scanner (`document-scanner`) | ➖ | ➖ | ✅ | iOS-only (camera + OCR) |

## Social Media

| Tool (web ID) | W | C | I | Notes |
| ------------- | :-: | :-: | :-: | ----- |
| Matte Generator (`matte-generator`) | ✅ | ✅ `matte` | ✅ | |
| Seamless Scroll Generator (`scroll-generator`) | ✅ | ✅ `scroll` | ✅ | carousel tiles |
| Social Media Cropper (`social-cropper`) | ✅ | ✅ `crop` | ✅ | |
| Watermarker (`watermarker`) | ✅ | ✅ `watermark` | ✅ | |

## Typography & Text

| Tool (web ID) | W | C | I | Notes |
| ------------- | :-: | :-: | :-: | ----- |
| Document Converter (`doc-converter`) | ✅ | 🚧 | 🚧 | Web: pandoc 3.9 wasm, any-to-any (md/html/docx/odt/epub/latex/rst/org/…). CLI (planned): comrak core + optional system `pandoc` for the long tail (stays 0BSD). iOS (planned): native subset only — GPL ✗ App Store (VLC precedent) + no on-device wasm runtime |
| Font File Explorer (`font-explorer`) | ✅ | ✅ `font-info` | ✅ | |
| Glyph Browser (`glyph-browser`) | ✅ | ✅ `glyph` | ✅ | |
| Line Height Calculator (`line-height-calc`) | ✅ | ✅ `line-height` | ✅ | |
| PX to REM (`px-to-rem`) | ✅ | ✅ `px2rem`/`rem2px` | ✅ | |
| Typography Calculator (`typo-calc`) | ✅ | ✅ `typo` | ✅ | |
| Word Counter (`word-counter`) | ✅ | ✅ `wc` | ✅ | |
| Paper Sizes (`paper-sizes`) | ✅ | ✅ `paper` | ✅ | iOS groups under Print |
| Text Diff (`text-diff`) | ✅ | ❌ | ✅ | |
| Font Installer (`font-installer`) | ➖ | ➖ | ✅ | iOS-only (system fonts) |

## Print & Production

| Tool (web ID) | W | C | I | Notes |
| ------------- | :-: | :-: | :-: | ----- |
| PDF Preflight (`pdf-preflight`) | ✅ | ✅ `preflight` | ✅ | |
| Print Imposer (`imposer`) | ✅ | ✅ `impose` | ✅ | multi-sheet: saddle/perfect/N-up |
| **Zine Imposer (`zine-imposer`)** | ✅ | ✅ `zine` | ✅ | single-sheet folds — see fold table below |

## Other / Generators

| Tool (web ID) | W | C | I | Notes |
| ------------- | :-: | :-: | :-: | ----- |
| QR Generator (`qr-genny`) | ✅ | ✅ `qr` | ✅ | |
| Barcode Generator (`code-genny`) | ✅ | ✅ `barcode` | ✅ | |
| Meta Tag Generator (`meta-tag-genny`) | ✅ | ✅ `meta` | ✅ | |
| Regex Tester (`regex-tester`) | ✅ | ✅ `regex` | ✅ | |
| Tailwind Cheat Sheet (`tailwind-cheatsheet`) | ✅ | ❌ | ✅ | |
| Text Scratchpad (`markdown-writer`) | ✅ | ❌ | ✅ | plain textarea + text-manipulation utilities |
| Text Editor (`text-editor`) | ✅ | ❌ | ❌ | distraction-free live-preview Markdown writer (raw ProseMirror). CommonMark + GFM (tables, strikethrough, task lists, footnotes); click-to-convert block-type gutter menu; full-screen focus mode; Markdown paste; focus highlights + typewriter; exports md/html/clipboard/pdf |
| Cipher Decoder (`decoder`) | ✅ | ❌ | ❌ | classical ciphers (distinct from base64/url decode) |
| NFC Reader/Writer (`nfc-reader-writer`) | ➖ | ➖ | ✅ | iOS-only (NFC hardware) |

## Calculators & Encoding

| Tool (web ID) | W | C | I | Notes |
| ------------- | :-: | :-: | :-: | ----- |
| Scientific Calculator (`sci-calc`) | ✅ | ✅ `calc` | ✅ | |
| Algebra Calculator (`algebra-calc`) | ✅ | ❌ | ✅ | |
| Graph Calculator (`graph-calc`) | ✅ | ❌ | ✅ | |
| Base Converter (`base-converter`) | ✅ | ✅ `base` | ✅ | |
| Time Calculator (`time-calc`) | ✅ | ✅ `time` | ✅ | |
| Unit Converter (`unit-converter`) | ✅ | ✅ `unit` | ✅ | |
| Encoding Tools (`encoder`) | ✅ | ✅ `encode`/`decode`/`hash` | ✅ | CLI splits encode/decode/hash |

## Turbo-nerd

| Tool (web ID) | W | C | I | Notes |
| ------------- | :-: | :-: | :-: | ----- |
| Shavian Transliterator (`shavian-transliterator`) | ✅ | ✅ `shavian` | ✅ | |

---

## Feature parity: Zine Imposer fold types

The Zine Imposer composes a zine from **one sheet** of paper (the multi-sheet
booklet imposition lives in **Print Imposer**). Fold types are tracked per surface:

| Fold type | W | C | I | Pages | Sides | Cut |
| --------- | :-: | :-: | :-: | ----- | ----- | --- |
| 8-page mini-zine (slit & fold) | ✅ | ✅ | ✅ | 8 | single | 1 central slit |
| Accordion / concertina | ✅ | ✅ | ✅ | 4/6/8 (×2 if double-sided) | single or double | none, or 1 horizontal if split |

Accordion sub-options (all three surfaces): panel count **4/6/8**, **double-sided**
(continuous booklet, short-edge flip), and **split / two-up** (two identical
half-height copies stacked, cut apart — better panel aspect ratio; slot count
unchanged). On the CLI: `--panels`, `--double`, `--split` (the CLI imposes images
only and draws no guide lines, so the split cut is documented, not rendered).

Candidate future folds (single-sheet only — keep multi-sheet in Print Imposer):
4-page folio · quarter-fold card · tri-fold / gate leaflet · 16-page mini-zine.
