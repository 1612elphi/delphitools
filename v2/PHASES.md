# delphitools 2.0 — phase plan

Eight phases. Each states its difficulty, its cost, what it depends on, and the
condition that has to hold before the next one starts.

Difficulty is the phase's risk of going wrong, separate from its size. A long
phase of D2 work is predictable. A short phase of D5 work is not.

| Phase | Name | Difficulty | Days | Blocks |
| :-: | --- | :-: | ---: | --- |
| 0 | Prove the stack | **D5** | 10 | everything |
| 1 | Foundation | **D4** | 23 | 2–5 |
| 2 | Tools, mechanical | **D2** | 37 | — |
| 3 | Tools, stateful | **D3** | 27.5 | — |
| 4 | Tools, rebuilt | **D4** | 12 | needs the Phase 1 DnD decision |
| 5 | Substrata | **D5** | 30 | needs Phase 1 |
| 6 | New tools and features | — | open | needs Ruby's list |
| 7 | Cutover | **D3** | 5 | 1–5 |

Parity total: 144.5 days across phases 0–5 and 7. That is `CONVERSION.md`'s
135.5 plus Phase 0 and Phase 7, which are new work rather than ported work.

---

## Phase 0 — prove the stack

**D5 · 10 days · blocks everything**

A spike, thrown away afterwards. Its only purpose is to find out whether the
three unproven parts of this plan actually work, before 140 days go into them.

Build a throwaway Ember 7 app with three routes: the home catalogue, one D1 tool
(`px-to-rem`), and one canvas tool (`favicon-genny`). Then answer:

1. **Prerendering.** Does the headless-Chrome snapshot produce per-route HTML
   with correct head tags that Cloudflare Pages serves and scrapers accept?
   Verify with a real scraper, not by reading the file.
2. **OG rendering.** Does `lib/og-card.tsx` render through standalone `satori` +
   `@resvg/resvg-js` and produce a byte-comparable PNG to the current
   `out/tools/*/og.png`?
3. **Tailwind 4.** Does `@tailwindcss/vite` 4.3.3 work under `@embroider/vite`
   1.7.9, including the `tw-animate-css` and `@tailwindcss/typography` plugins?
4. **The jxl WASM path.** Does the `/public/jxl` runtime import work with
   `/* @vite-ignore */` where `webpackIgnore` is today?
5. **`ember-primitives` in practice.** Wire up `dialog`, `popover` and `slider`.
   Judge the accessibility behaviour against the Radix versions they replace.
6. **DnD.** Prototype a sortable list with `ember-sortable` and with native HTML
   drag-and-drop. Pick one. This decision blocks Phase 4 and half of Phase 5.

**Exit criteria.** All six answered. If 1 or 2 fails, stop and reconsider: the
share cards and search indexing shipped in `231b90b` and `c26dc47` depend on
them, and no amount of later work recovers them.

**Difficulty is D5** because a failure here invalidates the plan rather than
delaying it.

### Progress

The spike is in `v2/delphitools-v2` (Ember 7.1, Embroider + Vite). The app shell,
router, icon component and full catalogue grid render with the delphitools theme
in both light and dark.

| # | Question | State |
| :-: | --- | --- |
| 1 | Prerendering | **yes** — 57 routes, per-route head tags, verified against five scraper user agents |
| 2 | OG rendering | **yes** — pixel-identical to the Next cards after a 1px blur |
| 3 | Tailwind 4 under Embroider + Vite | **superseded** — Crayon replaces Tailwind |
| 4 | jxl WASM path | **yes**, with a Vite-specific workaround |
| 5 | Primitives in practice | **yes** — resolved as vendoring from shadcn-ember |
| 6 | DnD | **yes** — dnd-kit's core is framework-agnostic |

All six answered. The exit criterion is met: neither 1 nor 2 failed.

**1. Prerendering works.** `scripts/prerender.mjs` boots the built app in headless
Chrome at every route, checks it renders, and writes a per-route `index.html`
carrying that route's head tags, with the share card beside it. 57 routes. Head
tags match the Next build field for field on tool routes. Fetched as
facebookexternalhit, Twitterbot, Slackbot, Discordbot and Googlebot, every route
returns its own title, description and `og:image`. The prerendered pages still
boot the SPA, render no duplicate chrome, and client-side navigation works from
a prerendered entry point.

Two things to know. The registry is imported rather than parsed — Node 26 strips
TypeScript natively, so `app/lib/tools.ts` stays the single source of truth that
`PARITY.md` requires. And the body is left as the app shell rather than
snapshotted: scrapers do not run JS and take the head tags, humans get the SPA.
Serving pre-rendered body content would need Ember to adopt it rather than
replace it, which is a bigger question and is not needed for share cards.

**2. OG rendering works.** `scripts/og.mjs` ports `lib/og-card.tsx` to satori's
object form, no JSX and no React. Against the Next build's cards: RMSE 0.0043,
and after a 1px blur the two are pixel-identical. The raw pixel difference
(11.5% on the tool card) is entirely rasteriser antialiasing — `next/og` bundles
a WASM resvg, this uses the native `@resvg/resvg-js` — and every differing pixel
is within 20% colour of its counterpart.

**4. The jxl path works, but not the way the plan assumed.**
`/* @vite-ignore */` alone is not enough. It only suppresses analysis of a
*non-literal* specifier; written inline as a string, Rolldown still resolves it
and the build fails with `UNRESOLVED_IMPORT`. Moving the URL to a variable fixes
the build, but the dev server then rewrites the request to
`/jxl/jxl_enc.js?import` and tries to transform the emscripten glue as an ES
module. Building the import through `new Function` keeps it out of Vite's
transform in both modes. Verified end to end in dev and production: the codec
loads, and encoding a 256×256 canvas yields a valid JXL codestream (`FF 0A`),
714 bytes, ~70 ms. The codec's contents stay out of the bundle.

**6. dnd-kit, not ember-sortable.** dnd-kit's core is framework-agnostic as of
0.5.0: `@dnd-kit/dom` and `@dnd-kit/abstract` have no React dependency and no
peer dependencies. `@arthur5005/dnd-kit-ember` 0.1.2 (MIT, on npm since
2026-02-01) wraps it in Glimmer modifiers — draggable, droppable, handle,
sortable — including `SortableKeyboardPlugin`.

Recommendation: depend on `@dnd-kit/dom` directly and take the addon as the
reference for the modifier layer, the same play as shadcn-ember. The addon is
one author, two releases, last touched February, and pins `@dnd-kit` 0.2.x while
0.5.0 is current; the modifier layer it provides is five small files. The core
underneath is the maintained thing.

This is better than the plan assumed. Phase 4 budgeted 4 days each for
`gradient-genny` and `image-stitcher` on the premise that their drag-and-drop
would be rebuilt. Porting dnd-kit semantics rather than rebuilding them should
bring that down; the same applies to Substrata's dock and layer panels.

**Crayon replaces Tailwind 4.** `crayon-css` 0.9.1 is a Sass utility toolkit, so
`sass-embedded` is the preprocessor and `tailwindcss`, `@tailwindcss/vite`,
`@tailwindcss/typography` and `tw-animate-css` are removed. It compiles through
Embroider + Vite with no plugin, only `css.preprocessorOptions.scss.loadPaths`.
Built output is 144 kB CSS, 29 kB gzip, 17.5 kB brotli.

Four findings worth carrying forward:

- **Import specifier.** `crayon-css` exports only `"."` under a `sass`
  condition, so Vite's resolver rejects every subpath. The bare specifier is
  required under Vite and fails under the raw sass CLI, which needs
  `crayon-css/src/crayon`. Compile checks outside Vite will not resolve.
- **Dark mode.** Crayon's `dark` mixin is `@media (prefers-color-scheme: dark)`.
  delphitools toggles a `.dark` class from the no-flash script so an explicit
  choice survives, so `_crayon-config.scss` hides the mixin and redefines it
  against the class.
- **Colour opacity modifiers.** The `.bg-red-500\/50` variants are 1.12 MB of
  Crayon's 1.32 MB default output. With `$use-color-opacity-modifiers: false`
  the sheet is small enough that Crayon's suggested PurgeCSS step buys nothing.
- **Function names.** The lookups are `leading()` and `tracking()`, not
  `line-height()` and `letter-spacing()`.

**Token split.** Crayon owns the compile-time scales (spacing, type, radius,
breakpoints, palette). The semantic theme tokens stay CSS custom properties in
`:root`/`.dark`, because a Sass map cannot switch at runtime. Themed surfaces
therefore use component CSS rather than utility classes: there is no
`bg-background` class, and there cannot be one.

### Primitives: vendor shadcn-ember behaviour, restyle onto Crayon

`shadcn-ember` (MIT, IgnaceMaes, 0.2.1) is a CLI that copies component source
into the app, like real shadcn. Its 52-component registry covers all 12 Radix
primitives the Next app uses plus the five gaps costed at 10 days here: sidebar,
command, tooltip, select, collapsible.

Its components are Tailwind 4, and they use the four things Crayon rejects by
design: arbitrary values (`ring-[3px]`), variant prefixes (`focus-visible:`,
`dark:`), opacity modifiers (`ring-ring/50`), and arbitrary child selectors
(`[&_svg]:size-4`). The two cannot both style a component.

The behaviour is separable from the styling, and the behaviour is the expensive
part. `tooltip.gts` is 356 lines of floating-ui positioning, context plumbing and
hover/focus lifecycle, with three Tailwind class strings. So: vendor the file,
strip the class strings, style the hooks in Sass.

Vendored components live in `app/components/ui/`. Each keeps a header naming
the upstream version and listing every divergence.

**Consequences.**

- This is a fork, not a dependency. `shadcn-ember add` is not usable directly;
  every component needs the same restyle pass, and upstream fixes have to be
  pulled by hand.
- Animations are load-bearing, not decoration. Components that unmount on
  `animationend` (tooltip does) never close without real keyframes, and upstream
  gets those from `tw-animate-css`, which Crayon replaces.
- Upstream bugs come along. Two found in `tooltip.gts` so far: identical markup
  in both arms of the `@asChild` branch, and `focus`/`blur` handlers on the
  trigger, which do not bubble, so a focusable element nested inside the trigger
  never opens the tooltip for keyboard users. Both fixed in the vendored copy.

Revised primitives estimate: **10 days to 4**, so Phase 1 drops from 29 to 23
and parity from 150.5 to 144.5.

---

## Phase 1 — foundation

**D4 · 23 days · blocks phases 2–5**

The app that has no tools in it yet, but is otherwise finished.

| Work | D | Days |
| --- | :-: | ---: |
| App scaffold, router, route tree, Glint, Tailwind, path aliases | **D2** | 3 |
| Icon component over `lucide-static`, replacing 95 files of `lucide-react` | **D2** | 2 |
| UI primitives: vendor from shadcn-ember, restyle onto Crayon | **D3** | 4 |
| Sidebar (726 lines of shadcn, no counterpart) | **D3** | 3 |
| Site chrome: header, tool grid, home catalogue, banner, 404 | **D2** | 3 |
| Colour-notation React context becomes an Ember service | **D2** | 1 |
| The 5 React hooks become Glimmer equivalents | **D2** | 1 |
| Prerender + OG build scripts, promoted from the Phase 0 spike | **D3** | 3 |
| `ember-qunit` setup, and porting `window.__substrata` enough for the harnesses to boot | **D2** | 3 |

**Exit criteria.** The site builds, deploys to a Cloudflare Pages preview, has
per-route head tags and share cards, and every catalogue entry routes to an empty
tool page. `lib/tools.ts` keeps its IDs and exported shape so `PARITY.md` stays
true.

**Difficulty is D4** because the primitives are the part with no reference
implementation to port from.

---

## Phase 2 — tools, mechanical

**D2 · 37 days · no blockers beyond Phase 1**

The 42 D1 and D2 tools from `CONVERSION.md`. Form inputs and canvas drawing over
logic that already sits in `lib/` and does not change.

10 × D1 at 0.5 days, 32 × D2 at 1 day.

Predictable, parallelisable, and the phase to interrupt if something more
important appears. Each tool ships on its own; there is no ordering constraint
inside the phase.

Suggested order: the 10 D1 tools first, as a batch, to settle the conventions
before 32 repetitions of them.

**Exit criteria.** 42 tools at behaviour parity, each manually browser-tested
against the Next version running side by side.

---

## Phase 3 — tools, stateful

**D3 · 27.5 days**

The 11 D3 tools. Heavy state, workers, WASM, multi-step flows. Each needs a
design pass before translation, because the React versions carry state in ways
that do not map onto `@tracked` one-for-one.

Three cluster around workers and WASM (`doc-converter`, `image-converter`,
`image-tracer`) and should be done together, once, by whoever solves the first.

`text-editor` is cheaper than its rating suggests: ProseMirror is vanilla DOM and
only the wrapper changes. It is rated D3 for its 21 hooks of surrounding state.

**Exit criteria.** 11 tools at parity. The worker and WASM loading patterns are
documented once and reused.

---

## Phase 4 — tools, rebuilt

**D4 · 12 days · needs the Phase 0 DnD decision**

Three tools whose UI has no port path.

| Tool | Why | Days |
| --- | --- | ---: |
| `gradient-genny` | `@dnd-kit` stop reordering | 4 |
| `image-stitcher` | `@dnd-kit` tile reordering | 4 |
| `graph-calc` | `mafs` is a React plotting library with no vanilla core; the plot surface gets rebuilt on SVG with `mathjs` unchanged | 4 |

The two DnD tools should follow whichever Phase 5 dock work lands first, or lead
it. Doing them apart means solving drag-and-drop twice.

**Exit criteria.** Three tools at behaviour parity, including keyboard-accessible
reordering, which the `@dnd-kit` versions provide today.

---

## Phase 5 — Substrata

**D5 · 30 days · needs Phase 1**

16,398 lines of React over 9,201 lines of framework-free core that does not
change. Rated D5 for span, not for any single hard piece.

**Order is fixed:**

1. **`window.__substrata` first.** The 22 harnesses in `scripts/verify/` are the
   only regression net on the editor. Until the rig exists in the Ember build,
   every subsequent step is unverifiable. This is the single most important
   sequencing decision in the plan.
2. `fabric-canvas` core: mount, document model binding, selection, transform.
3. Panels, one at a time, each verified by its matching harness.
4. The dock and omnibar, which carry the `@dnd-kit` dependency.
5. Modals and notices.

**Exit criteria.** All 22 harnesses pass against the Ember build. `pieces.mjs`,
`persist.mjs` and `export.mjs` matter most; they cover the document model,
autosave and export, where a regression loses user work.

**Difficulty is D5** because it is the one segment where a partial port ships
nothing. Half a tool catalogue is 28 working tools. Half an editor is broken.

---

## Phase 6 — new tools and features

**open · needs Ruby's list**

This phase has no plan yet, on purpose. Inventing a feature list is not research.

What the rewrite makes cheap that is expensive today:

- **Unit tests.** Ember ships `ember-qunit`. The 16,495 framework-free lines in
  `lib/` become testable for the first time, with no framework decision to make.
- **A site-wide command palette.** `cmdk` is being rebuilt in Phase 1 anyway, so
  extending it past the current usage is small.
- **Offline.** A static site with no network dependency at runtime is close to a
  PWA already.

The one grounded catalogue gap, from `PARITY.md`: **Colour Camera** exists on iOS
and is marked ❌ on web. `getUserMedia` plus the existing colour maths in `lib/`
would close it.

**Open question for Ruby.** Which new tools, and what do they do? The catalogue
descriptions and any user-facing strings are copy gaps and are yours to write;
the plan will mark them with the usual token in code, not here.

---

## Phase 7 — cutover

**D3 · 5 days · needs phases 1–5**

| Work | Days |
| --- | ---: |
| Route-for-route diff against the Next build, including `public/_redirects` | 1 |
| Share card verification with a real scraper, every route | 1 |
| Lighthouse and bundle size comparison against `main` | 1 |
| `PARITY.md` and `README.md` updates; `CLAUDE.md` rewritten for the new stack | 1 |
| Cloudflare Pages build config, DNS, deploy, watch | 1 |

**Exit criteria.** `delphi.tools` serves the Ember build. The Next app stays on a
branch, not deleted, until a fortnight of clean production has passed.

---

## Kill switches

If this runs long, drop in this order. Each keeps a shippable product.

1. **Phase 6.** New work waits for parity. It always should.
2. **Phase 4.** Keep `gradient-genny`, `image-stitcher` and `graph-calc` on the
   old stack behind a route on the same domain. Three tools on a second origin is
   ugly and works.
3. **Phase 5.** Substrata is already outside the parity contract per `PARITY.md`
   and is web-only. Shipping 2.0 as the catalogue while `/editor` keeps serving
   the Next build is a legitimate end state, not a failure.
4. **Nothing else.** Phases 0, 1, 2, 3 and 7 are the product.

Dropping 4 and 5 takes the plan from 144.5 days to 102.5.

---

## Open decisions

| # | Decision | Blocks | Owner |
| :-: | --- | --- | --- |
| 1 | `ember-sortable` or native HTML drag-and-drop | Phase 4, half of Phase 5 | Phase 0 |
| 2 | `ember-power-select` or a styled native `<select>` | Phase 1 primitives | Phase 0 |
| 3 | Whether `ember-primitives` accessibility behaviour is good enough to depend on, or whether all primitives get hand-built | Phase 1 | Phase 0 |
| 4 | Which new tools Phase 6 contains | Phase 6 | Ruby |
| 5 | Whether the CLI and iOS repos take anything from this, or stay on the current `lib/tools.ts` contract | none | Ruby |
