# 1:1 conversion matrix

Every source file that changes, with a difficulty rating and its blocker.
Measured on `main` at c26dc47.

## Difficulty scale

| | Meaning | Days |
| :-: | --- | ---: |
| **D1** | Form inputs over pure functions. The logic already sits in `lib/`. Mechanical template rewrite. | 0.5 |
| **D2** | Local state, canvas drawing, or a vanilla dependency. No framework-bound code. | 1.0 |
| **D3** | Heavy state, multi-step flow, workers or WASM. Needs design thought, not only translation. | 2.5 |
| **D4** | Depends on a React-only library. The UI is rebuilt, not ported. | 4.0 |
| **D5** | Architectural. Spans many files and has no single-sitting version. | varies |

Days are for one engineer already fluent in Ember. Add a learning multiplier for
the first two weeks; see `PHASES.md` Phase 0.

---

## Framework-free, ports unchanged

No work beyond moving the file and fixing import paths.

| Path | Lines | Contents |
| --- | ---: | --- |
| `lib/substrata/*.ts` | 9,201 | doc model, layer ops, filters, effects, select mask, export, sync, autosave, colour maths |
| `lib/*.ts` (non-substrata) | ~7,000 | tool registry, palette strategies, colour names, pandoc client + worker, og-card parts |
| **Total** | **16,495** | |

Two caveats. `lib/og-card.tsx` opens with `import "server-only"`, a Next package;
drop that line. Five files in `hooks/` import React and become Glimmer
equivalents instead: `use-editor-shortcuts`, `use-breakpoint`,
`use-colour-notation`, `use-file-paste`, `use-mobile`. They total 257 lines.

`lib/tools.ts` keeps its exported shape and its tool IDs unchanged. `PARITY.md`
names it as the source of truth for the CLI and iOS repos. Only the `icon` field
changes type, from `LucideIcon` to an icon name string.

---

## Tools

56 components, 32,683 lines. **76.5 days.**

| Tool | LOC | hooks | | D | days | Note |
| --- | ---: | ---: | --- | :-: | ---: | --- |
| `gradient-genny` | 1540 | 24 | canvas | **D4** | 4.0 | @dnd-kit stop rows, to ember-sortable or native DnD |
| `image-stitcher` | 1100 | 7 | canvas | **D4** | 4.0 | @dnd-kit tile order, same replacement |
| `graph-calc` | 937 | 24 | | **D4** | 4.0 | mafs is React-only; rebuild the plot surface on SVG, keep mathjs |
| `imposer` | 1701 | 35 | canvas | **D3** | 2.5 | largest tool, pdf-lib plus canvas preview |
| `qr-generator` | 1646 | 13 | canvas | **D3** | 2.5 | qr-code-styling is vanilla; jszip batch export; `wifi-form` is its sub-panel |
| `pdf-preflight` | 1640 | 13 | canvas | **D3** | 2.5 | pdf-lib inspection, canvas page previews |
| `image-tracer` | 1208 | 22 | canvas | **D3** | 2.5 | imagetracerjs in a blob worker; router transition on hand-off |
| `image-converter` | 1147 | 5 | canvas | **D3** | 2.5 | gifenc/utif/jxl-wasm; the bundler-ignored jxl import changes comment form |
| `zine-imposer` | 1085 | 11 | canvas | **D3** | 2.5 | pdf-lib imposition, canvas preview |
| `palette-extractor` | 874 | 12 | canvas | **D3** | 2.5 | quantiser already framework-free |
| `palette-genny` | 840 | 20 | canvas | **D3** | 2.5 | strategy engine already in `lib/palette-strategies.ts` |
| `doc-converter` | 707 | 18 | | **D3** | 2.5 | pandoc.wasm worker; the native Worker URL form works better under Vite |
| `text-editor` | 658 | 21 | | **D3** | 2.5 | ProseMirror core is vanilla DOM; only the thin React wrapper changes |
| `social-cropper` | 384 | 18 | canvas | **D3** | 2.5 | pointer-drag crop, 18 hooks of state |
| `decoder` | 1221 | 3 | | **D2** | 1.0 | large, but mostly static tables and pure functions |
| `code-generator` | 954 | 9 | | **D2** | 1.0 | bwip-js is vanilla |
| `tailwind-cheatsheet` | 612 | 2 | | **D2** | 1.0 | |
| `time-calc` | 566 | 7 | | **D2** | 1.0 | |
| `colorblind-sim` | 556 | 3 | canvas | **D2** | 1.0 | includes the lightbox added in afa5ce7 |
| `shavian-transliterator` | 553 | 11 | canvas | **D2** | 1.0 | |
| `pixel-picker` | 543 | 7 | canvas | **D2** | 1.0 | |
| `matte-generator` | 541 | 13 | canvas | **D2** | 1.0 | |
| `paper-sizes` | 492 | 5 | | **D2** | 1.0 | uses `paper-size-combobox`, a select gap |
| `unit-converter` | 487 | 4 | | **D2** | 1.0 | |
| `watermarker` | 483 | 10 | canvas | **D2** | 1.0 | |
| `tailwind-shades` | 473 | 4 | | **D2** | 1.0 | reads query params; Ember router gives these directly |
| `sci-calc` | 469 | 8 | | **D2** | 1.0 | mathjs is vanilla |
| `paste-image` | 451 | 9 | canvas | **D2** | 1.0 | |
| `scroll-generator` | 450 | 6 | canvas | **D2** | 1.0 | |
| `harmony-genny` | 449 | 2 | | **D2** | 1.0 | |
| `algebra-calc` | 445 | 8 | | **D2** | 1.0 | nerdamer + katex, both vanilla, both dynamically imported |
| `colour-converter` | 444 | 2 | | **D2** | 1.0 | |
| `encoder` | 443 | 12 | | **D2** | 1.0 | crypto-js is vanilla |
| `base-converter` | 439 | 6 | | **D2** | 1.0 | |
| `background-remover` | 435 | 3 | canvas | **D2** | 1.0 | transformers.js pipeline already isolated in `lib/substrata/bg-removal.ts` |
| `markdown-writer` | 429 | 8 | | **D2** | 1.0 | markdown-it is vanilla |
| `text-diff` | 390 | 10 | | **D2** | 1.0 | |
| `contrast-checker` | 362 | 6 | | **D2** | 1.0 | |
| `font-explorer` | 361 | 6 | | **D2** | 1.0 | |
| `favicon-genny` | 333 | 3 | canvas | **D2** | 1.0 | |
| `regex-tester` | 318 | 6 | | **D2** | 1.0 | |
| `image-clipper` | 310 | 8 | canvas | **D2** | 1.0 | |
| `image-splitter` | 310 | 5 | canvas | **D2** | 1.0 | |
| `artwork-enhancer` | 305 | 8 | canvas | **D2** | 1.0 | |
| `placeholder-genny` | 278 | 7 | canvas | **D2** | 1.0 | |
| `large-type` | 172 | 9 | canvas | **D2** | 1.0 | fullscreen API |
| `svg-optimiser` | 287 | 8 | | **D1** | 0.5 | svgo is vanilla |
| `glyph-browser` | 272 | 4 | | **D1** | 0.5 | |
| `typo-calc` | 241 | 2 | | **D1** | 0.5 | |
| `base64-image-encoder` | 238 | 1 | | **D1** | 0.5 | |
| `meta-tag-genny` | 238 | 8 | | **D1** | 0.5 | |
| `px-to-rem` | 219 | 3 | | **D1** | 0.5 | |
| `line-height-calc` | 176 | 1 | | **D1** | 0.5 | |
| `palette-collection` | 157 | 3 | | **D1** | 0.5 | dexie store is framework-free |
| `wifi-form` | 157 | 1 | | **D1** | 0.5 | |
| `word-counter` | 157 | 3 | | **D1** | 0.5 | |

**D1** 10 · **D2** 32 · **D3** 11 · **D4** 3

---

## UI primitives

`components/ui/`, 24 files, 2,206 lines. **4 days**, vendoring behaviour from
shadcn-ember and restyling onto Crayon; see `PHASES.md` Phase 0.

| File | LOC | D | Target |
| --- | ---: | :-: | --- |
| `sidebar.tsx` | 726 | **D3** | full rewrite; shadcn's sidebar has no Ember counterpart. Collapsible rail, mobile sheet, keyboard toggle, cookie persistence. |
| `select.tsx` | 190 | **D3** | `ember-power-select` 9.0.2, or native `<select>` styled. Radix Select behaviour is not reproduced by either. |
| `command.tsx` | 187 | **D3** | build; `cmdk` has no Ember equivalent. Filtering, keyboard nav, grouping. |
| `paper-size-combobox.tsx` | 171 | **D2** | depends on the select decision above |
| `dialog.tsx` | 143 | **D1** | `ember-primitives` `dialog.gts` |
| `sheet.tsx` | 139 | **D2** | `ember-primitives` `drawer.gts` |
| `card.tsx` | 92 | **D1** | plain markup |
| `slider.tsx` | 67 | **D1** | `ember-primitives` `slider.gts` |
| `tabs.tsx` | 66 | **D1** | `ember-primitives` `tabs.gts` |
| `accordion.tsx` | 66 | **D1** | `ember-primitives` `accordion.gts` |
| `tooltip.tsx` | 61 | **D2** | build on `ember-velcro` (floating-ui). No primitive exists. |
| `popover.tsx` | 48 | **D1** | `ember-primitives` `popover.gts` |
| `switch.tsx` | 31 | **D1** | `ember-primitives` `switch.gts` |
| `button.tsx` | 31 | **D1** | plain markup; `cva` works unchanged in Ember |
| `separator.tsx` | 28 | **D1** | `ember-primitives` `separator.gts` |
| `badge.tsx` | 26 | **D1** | plain markup |
| `label.tsx` | 24 | **D1** | native `<label>` |
| `input.tsx` | 21 | **D1** | plain markup |
| `textarea.tsx` | 18 | **D1** | plain markup |
| `collapsible*.tsx` | 46 | **D2** | build, ~40 lines. No primitive exists. |
| `skeleton.tsx` | 13 | **D1** | plain markup |
| `skip-link.tsx` | 12 | **D1** | plain markup |

`clsx`, `tailwind-merge` and `class-variance-authority` are all
framework-independent and stay. The `cn()` helper in `lib/utils.ts` moves as-is.

---

## Site chrome

**8 days.**

| File | LOC | D | Note |
| --- | ---: | :-: | --- |
| `components/app-sidebar.tsx` | ~350 | **D3** | 95-file lucide dependency starts here; category grouping, active-route highlight, Pride build flag, commit SHA |
| `components/animated-icons/*.tsx` | 12 files | **D2** | `motion` per icon. Redo as CSS keyframes rather than adopt an animation addon. |
| `components/sticker-wall.tsx` | ~200 | **D2** | `motion` peel interaction |
| `components/tool-grid.tsx` | ~120 | **D1** | |
| `components/app-header.tsx` | ~80 | **D1** | route-derived breadcrumb |
| `components/favour-banner.tsx` | small | **D1** | |
| `components/colour-notation-provider.tsx` | small | **D2** | React context becomes an Ember service |
| `app/(site)/page.tsx` | ~200 | **D2** | home catalogue |
| `app/not-found.tsx` | small | **D1** | |

---

## Routing and build

**8 days.** Includes the app scaffold, the icon component and the
prerender/OG scripts, all of which are foundation rather than feature work.

| Next | Ember |
| --- | --- |
| `app/layout.tsx` | `app/templates/application.gts` plus `index.html` for the theme bootstrap script |
| `app/(site)/layout.tsx` | a `site` route with its own template |
| `app/editor/layout.tsx` + `page.tsx` | an `editor` route outside the `site` tree |
| `app/(site)/tools/[toolId]/page.tsx` | `tools/tool` dynamic segment; the 56-entry dynamic import map becomes a route-level async component resolve |
| `generateStaticParams` | the prerender script's route list, read from `lib/tools.ts` |
| `generateMetadata` | head tags written by the prerender script, not at runtime |
| `app/**/og.png/route.tsx` (3) | a build script using `satori` + `@resvg/resvg-js` over the existing `lib/og-card.tsx` parts |
| `next.config.ts` `env` | Vite `define` |
| `notFound()` | Ember's `error` substate |
| `next/link` (11 files) | `<LinkTo>` |
| `usePathname` (2), `useSearchParams` (1), `useRouter` (1) | the `router` service and route models |
| `output: "export"` | Vite static build to `out/`, then the prerender pass |
| `public/_redirects` | unchanged |

---

## Substrata

`components/substrata/**` 16,398 lines of React over `lib/substrata/*.ts` 9,201
lines that need no change. **30 days.** Rated as one segment because the pieces
share a document model and cannot ship independently.

| Component | LOC | D | Note |
| --- | ---: | :-: | --- |
| `fabric-canvas.tsx` | 2,549 | **D5** | the whole editor's imperative core. Fabric itself is unchanged; this is `useEffect` blocks becoming modifiers plus a service. Also the file that defines the `window.__substrata` test rig the 22 harnesses drive. |
| `modules/fx-panel.tsx` | 953 | **D4** | `@dnd-kit` effect reordering |
| `top-bar.tsx` | 699 | **D3** | menus, needs the menu primitive |
| `modules/inspector-panel.tsx` | 699 | **D3** | |
| `omnibar/tool-settings.tsx` | 693 | **D3** | per-tool settings surfaces |
| `modules/layers-panel.tsx` | 686 | **D4** | `@dnd-kit` layer reordering plus tree |
| `omnibar/omnibar.tsx` | 503 | **D4** | `@dnd-kit` dock drag |
| `modals/canvas-size-modal.tsx` | 344 | **D2** | |
| `modules/looks-panel.tsx` | 278 | **D2** | |
| `layer-context-menu.tsx` | 259 | **D3** | no menu primitive in ember-primitives beyond `menu.gts`; verify it fits |
| `gradient-row.tsx` | 258 | **D3** | |
| `modules/colour-modes/*` (5 files) | 989 | **D3** | triangle, sliders, shade, prism, swatches; all canvas or SVG over framework-free colour maths |
| `modals/export-modal.tsx` | 246 | **D2** | |
| `modals/onboarding-modal.tsx` | 216 | **D2** | |
| `modules/colour-panel.tsx` | 216 | **D2** | |
| `modules/arrange-panel.tsx` | 186 | **D2** | |
| `text-style-row.tsx` | 179 | **D2** | |
| `preset-row.tsx` | 176 | **D2** | |
| `omnibar/modules.tsx` | 145 | **D3** | `@dnd-kit` |
| `dock-zones.tsx`, `float-layer.tsx`, `substrata-shell.tsx` | ~500 | **D4** | the dock system, `@dnd-kit` throughout |
| remainder (notices, hints, toasts, modals) | ~2,000 | **D2** | `motion` in `toast-slot.tsx` and `omnibar/rail.tsx` |

**Prerequisite:** port `window.__substrata` first. The 22 harnesses in
`scripts/verify/` are the only regression net on the editor, and they cannot run
until that rig exists in the Ember build. Doing it first turns the rest of
Substrata into verifiable work.

---

## Testing

**3 days.**

| Today | 2.0 |
| --- | --- |
| no unit test framework | `ember-qunit` 9.1.0, `@ember/test-helpers`. Ember ships this; the framework-free `lib/` code becomes testable for the first time. |
| 22 puppeteer harnesses on `:3000` | unchanged, if the Vite dev server is pinned to port 3000 and `window.__substrata` is ported |
| `static-smoke.mjs` serves `out/` | unchanged, if the build output stays at `out/` |
| catalogue tools manually browser-tested | unchanged, unless the qunit rendering tests are extended to cover them |

---

## Total

| Segment | Days |
| --- | ---: |
| Tools (56) | 76.5 |
| Substrata | 30 |
| UI primitives | 4 |
| Site chrome | 8 |
| Routing and build | 8 |
| Testing | 3 |
| **1:1 parity** | **129.5** |

Excludes Phase 0 (proving the stack) and Phase 6 (new work). Both are costed in
`PHASES.md`.
