# Tools

A privacy-first collection of browser-based utilities for design, development, content, and production workflows.

**Live site:** https://tools.brodyberson.com

> This project was forked from [delphitools](https://github.com/1612elphi/delphitools).

## Why this project exists

Tools is designed to be practical, fast, and low-friction:

- No account required
- No paywall for basic utility workflows
- No server-side processing for most actions
- No unnecessary data collection

Most operations happen directly in the browser so users can work quickly and keep control over their files.

## Tool categories

### Developer Tools
- Regex Tester
- Encoding Tools
- JSON Formatter
- UUID / ULID / NanoID Generator

### Calculators
- Scientific Calculator
- Graph Calculator
- Algebra Calculator
- Base Converter
- Time Calculator
- Unit Converter

### Social Media
- Social Media Cropper
- Matte Generator
- Seamless Scroll Generator
- Watermarker

### Color
- Color Converter
- Tailwind Shade Generator
- Harmony Generator
- Palette Generator
- Palette Collection
- Contrast Checker
- Color Blindness Simulator
- Gradient Generator

### Images & Assets
- Favicon Generator
- SVG Optimizer
- Placeholder Generator
- Image Splitter
- Image Converter
- Artwork Enhancer
- Background Remover *(beta)*
- Image Tracer *(new)*

### Typography & Text
- PX to REM
- Line Height Calculator
- Typography Calculator
- Paper Sizes
- Word Counter
- Glyph Browser
- Font File Explorer

### Print & Production
- PDF Preflight *(new)*
- Guillotine Director *(new)*
- Zine Imposer

### Other Tools
- Text Scratchpad
- Tailwind Cheat Sheet
- QR Generator
- Barcode Generator
- Meta Tag Generator

## Tech stack

- **Framework:** Next.js (App Router) + React + TypeScript
- **Styling/UI:** Tailwind CSS v4, Radix UI primitives, lucide-react icons
- **Core utility libraries:** `mathjs`, `nerdamer`, `katex`, `svgo`, `pdf-lib`, `pdfjs-dist`, `qrcode`, `bwip-js`, `imagetracerjs`, `gifenc`, `utif`, `jszip`

## Local development

> This repo includes `bun.lock`, so Bun is the primary package manager.

### 1) Install dependencies

```bash
bun install
```

### 2) Run development server

```bash
bun run dev
```

Open http://localhost:3000.

### 3) Run linting

```bash
bun run lint
```

### 4) Production build

```bash
bun run build
bun run start
```

## Project structure

```text
app/                 Next.js routes and pages
components/          Reusable UI and tool components
components/tools/    Individual tool implementations
lib/                 Shared constants, tool registry, and helpers
public/              Static assets and workers
types/               Custom TypeScript declarations
```

## Notes for contributors

- Add new tools to `lib/tools.ts` so they appear in navigation and routing.
- Keep tools client-first and privacy-respecting where possible.
- Prefer clear naming and small, composable React components.
- If a tool depends on heavy processing, document constraints in its component.

## License

MIT (see `LICENSE`).
