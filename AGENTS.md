# AGENTS.md

This file documents how to work safely and effectively in this repository.

## Project overview

- **Project name:** Tools
- **Purpose:** A collection of browser-based utilities for design, developer workflows, text processing, math, and print production.
- **Primary runtime:** Next.js App Router + React + TypeScript.
- **Hosting target:** https://tools.brodyberson.com
- **Origin:** Forked from [`1612elphi/delphitools`](https://github.com/1612elphi/delphitools).

## Architecture

### High-level

- `app/`: Next.js routing, root layout, and page entry points.
- `components/`: Shared UI scaffolding and all tool components.
- `components/tools/`: One file per tool implementation.
- `lib/`: Tool registry, constants, helper datasets, and utility logic.
- `public/`: Static assets, workers, and third-party browser-side scripts.
- `types/`: Ambient declarations for libraries without first-class TS typing.

### Routing model

- Home page lives at `app/page.tsx` and renders tool discovery UI.
- Tool pages use dynamic routing under `app/tools/[toolId]/page.tsx`.
- Tool metadata is centralized in `lib/tools.ts` and should be treated as source-of-truth for:
  - Category placement
  - Display names/descriptions
  - URL href/id mapping
  - `new`/`beta` flags

## Tool catalog

> Keep this list in sync with `lib/tools.ts`.

### Developer Tools
- `regex-tester` — Regex Tester
- `encoder` — Encoding Tools
- `json-formatter` — JSON Formatter
- `markdown-preview` — Markdown Preview / Markdown ↔ HTML *(new)*
- `case-converter` — Case Converter / Slugify
- `text-diff` — Text Diff / Compare *(new)*

### Calculators
- `sci-calc` — Scientific Calculator
- `graph-calc` — Graph Calculator
- `algebra-calc` — Algebra Calculator
- `base-converter` — Base Converter
- `time-calc` — Time Calculator
- `unit-converter` — Unit Converter

### Social Media
- `social-cropper` — Social Media Cropper
- `matte-generator` — Matte Generator
- `scroll-generator` — Seamless Scroll Generator
- `watermarker` — Watermarker

### Color
- `color-converter` — Color Converter
- `tailwind-shades` — Tailwind Shade Generator
- `harmony-genny` — Harmony Generator
- `palette-genny` — Palette Generator
- `palette-collection` — Palette Collection
- `contrast-checker` — Contrast Checker
- `colorblind-sim` — Color Blindness Simulator
- `gradient-genny` — Gradient Generator

### Images & Assets
- `favicon-genny` — Favicon Generator
- `svg-optimizer` — SVG Optimizer
- `placeholder-genny` — Placeholder Generator
- `image-splitter` — Image Splitter
- `image-converter` — Image Converter
- `artwork-enhancer` — Artwork Enhancer
- `background-remover` — Background Remover *(beta)*
- `image-tracer` — Image Tracer *(new)*

### Typography & Text
- `px-to-rem` — PX to REM
- `line-height-calc` — Line Height Calculator
- `typo-calc` — Typography Calculator
- `paper-sizes` — Paper Sizes
- `word-counter` — Word Counter
- `glyph-browser` — Glyph Browser
- `font-explorer` — Font File Explorer

### Print & Production
- `pdf-preflight` — PDF Preflight *(new)*
- `guillotine-director` — Guillotine Director *(new)*
- `zine-imposer` — Zine Imposer

### Other Tools
- `markdown-writer` — Text Scratchpad
- `tailwind-cheatsheet` — Tailwind Cheat Sheet
- `qr-genny` — QR Generator
- `code-genny` — Barcode Generator
- `meta-tag-genny` — Meta Tag Generator

## Dependency map

### Core framework
- `next`, `react`, `react-dom`, `typescript`

### UI and styling
- `tailwindcss`, `@tailwindcss/postcss`, `@tailwindcss/typography`, `tw-animate-css`
- `@radix-ui/*` primitives for accessible UI elements
- `lucide-react` for iconography
- `class-variance-authority`, `clsx`, `tailwind-merge` for styling composition

### Content, parsing, and formatting
- `react-markdown`, `remark-gfm`
- `katex` for mathematical rendering

### Imaging / graphics / media
- `svgo` (SVG optimization)
- `imagetracerjs` (raster-to-vector)
- `gifenc`, `utif` (image format handling)
- `pdf-lib`, `pdfjs-dist` (PDF processing)

### Math and calculator stack
- `mathjs`, `nerdamer`, `function-plot`, `mafs`, `@xyflow/react`

### Code and data generation
- `qrcode`, `qr-code-styling` (QR)
- `bwip-js` (barcodes)
- `crypto-js` (encoding/hash tools)
- `jszip` (archive export workflows)

### AI/ML
- `@huggingface/transformers` used by tools that run model-assisted processing in browser contexts.

## Development workflow

### Setup
```bash
bun install
bun run dev
```

### Quality checks
```bash
bun run lint
bun run build
```

### Conventions
- Use TypeScript and keep strict typing where practical.
- Prefer functional React components.
- Keep business logic in `lib/` when shared by multiple tools.
- Co-locate tool-specific logic within each tool component when not shared.
- Avoid unnecessary server dependencies; this project is intentionally client-forward.

## How to add a new tool

1. Create a new component in `components/tools/<tool-id>.tsx`.
2. Export/register it through existing tool index wiring (`components/tools/index.tsx`).
3. Add tool metadata to the proper category in `lib/tools.ts`.
4. Ensure `href` matches `/tools/<tool-id>`.
5. Verify rendering via `app/tools/[toolId]/page.tsx` path.
6. Run lint/build checks.
7. Update docs (`README.md`, `public/llms.txt`, and this file) with new tool/category details; keep all three files synchronized with `lib/tools.ts`.

## Privacy and product principles

- Tools should run locally in the browser where possible.
- Avoid introducing telemetry or data capture by default.
- Keep UX fast and focused with minimal friction.
- Favor practical defaults over over-configured workflows.
