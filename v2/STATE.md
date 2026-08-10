# delphitools 2.0 — STATE (current lay of the land)

Snapshot of the `v2-ember` branch for the Next-to-Ember rewrite. Companion to
`README.md` (scope), `CONVERSION.md` (the 1:1 matrix) and `PHASES.md` (the phase
plan, which also carries the Phase 0 findings). This file is what actually
exists in the code right now.

**Status:** Phase 0 is CLOSED. Every catalogue tool is ported: 55 of 56.
What remains is Substrata, whose 67-file lib is ported and tested; its 39
components are not.

Branch: `v2-ember`. App: `v2/delphitools-v2/`. The Next app in the repo root is
untouched and still the production site.

```
f94b5b8  feat(v2): the zine bleed switch adds bleed
5c8e5f0  fix(v2): pdf-lib loads, and the pdf.js worker cannot drift again
1e26b3b  feat(v2): port the ten remaining D3 tools
55fce9c  perf(v2): one chunk per tool, and app/lib out of the eager graph
5b9df3b  feat(v2): port the last eleven D2 tools
a7735f6  feat(v2): port font-explorer, and rebuild the tool registry
71519ac  feat(v2): port regex-tester, text-diff and the three social canvas tools
8ac58dc  feat(v2): port sci-calc, completing the first D2 wave
cb083f3  feat(v2): port five more D2 tools
d4e6736  test(v2): cover the D1 tools' pure logic
d8957f6  feat(v2): port the eight D1 tools
064a773  chore(v2): prep for the D1 and D2 batch
c6c4aff  docs(v2): STATE.md for a complete Colour category
2ef7199  feat(v2): port gradient-genny, completing the Colour category
66da352  feat(v2): port colorblind-sim and palette-extractor
8046257  feat(v2): port pixel-picker
c5e0c04  feat(v2): port palette-collection
980f35b  feat(v2): port contrast-checker, harmony-genny and tailwind-shades
fd56e95  refactor(v2): one stylesheet partial per tool
0c2436e  perf(v2): half-precision weights, and fix a 180s cap on every rig
91b04ad  feat(v2): port background-remover, wasm runtime and all
2257299  fix(v2): the notation pipette stays visible on a narrow header
62301a1  docs(v2): bring STATE.md up to three tools and a committed rig suite
d53986f  test(v2): graduate the verification rigs into scripts/verify/
e49fbe0  feat(v2): wire the colour-notation selector into the header
b8b5d31  feat(v2): vendor the select, port colour-converter, one home for the maths
5384b8f  feat(v2): port favicon-genny, and a home for the verification rigs
00788d8  docs(v2): STATE.md for the rewrite, and a gen-icons script
ff5e044  chore(v2): silence the upstream if-function sass deprecation
fc1e2ec  fix(v2): sidebar hover and active states span the full row
26a4d7e  finish: validate the colour input, close the last unvalidated hex path
500ef73  refactor(v2): one primitive source, tested share link, shared colour maths
e9b0c39  style(v2): prettier sweep under the settled config
8df5edd  feat(v2): palette export dev mode, and fix the nested strategy button
d300874  feat(v2): port the palette generator, and the tool-page shape
d30e79e  feat(v2): answer the four open Phase 0 questions
5a7bbe5  fix(v2): restore -webkit-background-clip, make stylelint actually run
fd8ba23  feat(v2): Ember 7 spike on Crayon — scope docs, shell, chrome
```

---

## Run and verify

```bash
cd v2/delphitools-v2
npm start                 # vite, pinned to :3000 so the rigs work
npm run build             # vite build -> dist/
npm run build:static      # build, then prerender each route + its og.png
npm run gen-icons         # regenerate app/lib/icons.ts from what templates use
npm run test              # ember-qunit, 69 tests
npm run lint              # eslint + template-lint + stylelint + prettier
npm run verify            # 14 puppeteer rigs, needs npm start
npm run verify:static     # prerendered output, jxl and ONNX, needs build:static
npm run verify:model      # background removal end to end, downloads 88 MB
```

`npm test` is not the same command: `npm` is bun here, and bun takes `test` as
its own subcommand. `npm run test` builds a test bundle over `dist/`, so
`verify:static` after it reads the wrong build; rerun `build:static` first.

Gates, all green as of `f94b5b8`: `ember-tsc --noEmit`, `eslint .`,
`ember-template-lint .`, `stylelint **/*.{css,scss}`, `prettier --check .`.

**Never run `npm run format` from the repo root.** It formats the Next app, not
this one. Doing so once rewrote 313 files across Substrata, every tool and the
vendored minified assets in `public/`. This app has its own `npm run format`,
and the root `.prettierignore` excludes `/v2/`.

`scripts/verify/` holds the behavioural coverage that qunit cannot reach —
chrome that only exists once the whole app is booted, and tool behaviour that
depends on layout, portals or real input. `harness.mjs` gives every rig the same
contract as the parent repo's `scripts/verify`: console errors and uncaught
exceptions count as failures, and a failing run exits non-zero.

| Rig | Covers |
| --- | --- |
| `chrome.mjs` | sidebar, search, collapse and its cookie, routing, 404, icon sizing, sr-only clipping |
| `colour-converter.mjs` | the conversion table, and the whole vendored select including its keyboard |
| `devmode.mjs` | the hidden export panel: slug, JSON shape, category, import |
| `dialog.mjs` | native `<dialog>`: top layer, `::backdrop`, inertness, Escape, focus return |
| `favicon.mjs` | upload, canvas resize, the .ico bytes, the undecodable-file path |
| `mobile.mjs` | the off-canvas drawer, the scrim, and the desktop resize that used to strand it |
| `notation.mjs` | the header selector, which tools show it, and that the choice survives a reload |
| `palette.mjs` | generate, lock, the stepper, the strategy combobox |
| `sharelink.mjs` | `?colors=` on a cold load, and its fallbacks |
| `tooltip.mjs` | collapsed-rail tooltips, and that they unmount rather than linger |
| `tools.mjs` | every tool route renders its tool rather than the placeholder |
| `pdf.mjs` | pdf-lib and pdf.js end to end: preflight and imposer read a PDF, zine-imposer writes one with and without bleed |
| `stitch.mjs` | the mosaic, the four export formats by magic bytes, a side button, the batch pool |
| `graph.mjs` | the hand-written plot surface: axes, ticks, curve sampling, asymptote breaks, pan and zoom |
| `static.mjs` | the built output: per-route head tags, share cards, client-side nav, per-tool chunks, the jxl codec, the ONNX binary |
| `bg-removal.mjs` | the real model, end to end, checking a matte reaches the alpha channel |

`static.mjs` serves `dist/` itself, so it needs no separate server, and is
excluded from `npm run verify` because it needs a build rather than the dev
server. `bg-removal.mjs` is excluded because it downloads weights and runs
inference, which takes minutes and needs network.

---

## What works

**Stack.** Ember 7.1, Embroider + Vite, TypeScript strict + Glint, `.gts`
template tag throughout. 56,794 lines of app source, not counting the
stylesheets or the vendored pandoc wrapper. Build is ~26s.

**Bundle.** Each tool is its own chunk, fetched by the route's model hook during
the transition. First load is 18 files, 134 kB gzip: `main` 86 kB raw, the
`application` route chunk 158 kB raw, and the shared runtime. Ten more tools,
ProseMirror and pandoc among them, cost `main` 3 kB. Before the split it was
`main` at 1.65 MB, 463 kB gzip, carrying all 43 tools.

**Styling on Crayon.** `crayon-css` 0.9.1 (Sass) replaces Tailwind 4 entirely.
`app/styles/_crayon-config.scss` is the single config. `app/styles/app.scss`
holds the theme tokens, the chrome and the vendored primitives; each tool has
its own partial under `app/styles/tools/`, because one file made two tools
impossible to work on at once.

**Chrome.** Sidebar with collapsible icon rail (cookie-persisted, ⌘/Ctrl+B,
off-canvas below 768px, live search over the registry), header with
route-derived title, category badge and the colour-notation selector, theme
toggle, About dialog, 404. Pride styling and the commit SHA come through Vite
`define`.

**Routing.** `/`, `/tools/:tool_id`, `/editor` (stub), wildcard 404. URLs
unchanged from the Next app.

**Tools.** 55 of 56, by category:

| Category | State |
| --- | --- |
| Colour | 10 of 10 |
| Typography & Text | 11 of 11 |
| Calculators | 7 of 7 |
| Social Media | 4 of 4 |
| Images & Assets | 12 of 13 — `substrata` left |
| Other Tools | 7 of 7 |
| Print & Production | 3 of 3 |
| Turbo-nerd Shit | 1 of 1 |

Every Colour tool reads its conversions from `lib/colour-maths.ts` and formats
through the `colour-notation` service, so a value copied from one matches the
next, and none of them carries a format picker of its own.

### Dependency substitutions

Three tools use something the Next app has and this one does not. Each was
rebuilt on what is already installed rather than by adding a package. **None is
verified at parity — read the porting notes before trusting them.**

| Tool | Next app | Here |
| --- | --- | --- |
| `encoder` | crypto-js | Web Crypto and `btoa` |
| `algebra-calc` | nerdamer + katex | mathjs |
| `markdown-writer` | react-markdown + remark-gfm | no markdown library |

Installed so far: `svgo`, `mathjs`, `pdf-lib`, then `bwip-js`, `jszip`,
`qr-code-styling`, `pdfjs-dist`, `imagetracerjs` and the thirteen prosemirror
packages for the D3 batch, all at the versions the Next app pins. Two assets
are served rather than bundled: `public/pdf.worker.min.mjs` and
`public/lib/imagetracer_v1.2.6.js`, the latter because `image-tracer` builds
its Web Worker from that URL.

**Shared pieces the ports produced.** `lib/colour-maths.ts` holds both
directions of every colour transform, replacing the three copies the Next app
carried. `lib/ico.ts` builds the ICO container, which was inline and untested
there. `modifiers/file-paste.ts` replaces the `use-file-paste` hook that 23
Next tools use. The D3 batch added `lib/imposition.ts` and `lib/zine-folds.ts`
(both imposers), `ui/paper-size-combobox.gts`, `lib/editor/` (fourteen files of
ProseMirror), `lib/pandoc/`, `lib/social-presets.ts`, `lib/gif.ts` and
`lib/tiff.ts`.

**Primitives.** `app/components/ui/` holds `dialog` (local, over the native
element) plus `tooltip`, `popover`, `command`, `select` and `tabs` vendored
from shadcn-ember and restyled. `select` and `tabs` both gained the keyboard
handling upstream omits.

**Libraries.** `app/lib/` holds `colour-maths` (every conversion, both
directions), `colour-names`, `colour-notation`, `palette-strategies`,
`palette-collection` (284 palettes), `gradient`, `ico`, `bg-removal`, `jxl`,
`paper-sizes`, `math-constants`, `shavian/`, `tools`, `icons`, `build-flags`.

**Static output.** `scripts/prerender.mjs` boots the built app in headless
Chrome at all 57 routes, checks each renders, and writes a per-route
`index.html` with that route's head tags plus its `og.png` beside it. Verified
against five scraper user agents; head tags match the Next build field for
field on tool routes.

**Tests.** 309 qunit tests. 235 of them are the substrata lib, in
`tests/unit/substrata/`; one is skipped, naming a defect left alone
(`resolveExportDims` rounds each axis after computing the area clamp, so the
result can exceed the budget it was meant to fit — 16,777,310 against the iOS
ceiling for a 1000x3000 at 3x). The other 74 cover the pure logic: the sidebar service, two share
link parsers, the colour converter, the Tailwind ramp, the palette-extractor
quantiser, the ICO builder, the paste-accept matcher and the time-calc format
round trip. The quantiser takes
its random source as a parameter, so the clustering tests are deterministic.

---

## How a batch of ports is run

The D3 batch was ten tools in parallel, one agent each, in this working tree.
What made that safe is worth repeating rather than rediscovering.

**Nothing shared is touched by a port.** Before starting, the shared edits are
made once, centrally:

- install every dependency the batch needs, with `/opt/homebrew/bin/npm` so
  `package-lock.json` stays in step (plain `npm` is bun here)
- copy any vendored asset into `public/` and add it to `.prettierignore` and
  `eslint.config.mjs`
- create each tool's empty `app/styles/tools/_<id>.scss` and add its `@use`
  line to `app.scss`, sorted

Each agent then owns exactly three paths: its `.gts`, its `.scss`, and any
`app/lib/` file only it uses. The registry needs no edit at all, because it is
a glob. Two tools that share a library (`imposer` and `zine-imposer` share
`lib/imposition`) are sequenced: one owns and writes it, the other starts after
and imports it.

**Agents do not run browser checks, builds, or the dev server.** Vite HMR
remounts a component on every save, so a check running while a sibling agent
writes a file sees state wiped and reads as a broken tool. They run
`prettier --write`, `eslint`, `ember-template-lint`, `stylelint` and
`ember-tsc --noEmit` on their own files only, reading past errors from files
they do not own.

**The central pass afterwards is where the real verification happens:**
`npm run gen-icons` (a new tool's icon names are not in `icons.ts` until then),
then typecheck, lint, `build`, `build:static` — which boots all 57 routes in
Chrome and fails on a page error — then `verify:static`, the rigs, and the unit
tests. Then `slopsieve --list` to check the copy gaps parse.

**What that pass will not catch**, and did not: anything that only fails at
runtime inside a tool nobody drove. Both pdf failures survived every gate. The
rigs added since (`tools.mjs`, `pdf.mjs`) exist because of that.

---

## Architecture decisions

These are settled. The reasoning is here so they do not get re-litigated.

**Crayon owns compile-time scales, CSS custom properties own the theme.**
Spacing, type, radius, breakpoints and the palette come from Crayon. The
light/dark semantic tokens stay as custom properties in `:root`/`.dark`,
because a Sass map cannot switch at runtime. Consequence: themed surfaces use
component CSS, not utility classes. There is no `bg-background` class and there
cannot be one.

**Primitives are vendored from shadcn-ember and restyled, not depended on.**
`app/components/ui/` holds `tooltip`, `popover`, `command` and `select` (all
MIT, from IgnaceMaes/shadcn-ember 0.2.1) with their Tailwind class strings
replaced by `dt-*` hooks. Each keeps a header naming the upstream version and
every divergence. The behaviour is the expensive part and it ports; the styling
does not. This is a fork: `shadcn-ember add` is not usable directly, upstream
fixes have to be pulled by hand, and upstream bugs are ours to find — `select`
arrived with no keyboard handling at all and a registration modifier that
Glimmer rejects on the first arrow key.

**Dialog is local, over the native element.** `app/components/ui/dialog.gts`,
~90 lines on `<dialog>`/`showModal()`. Not vendored, because shadcn-ember's is
421 hand-rolled lines with `role="dialog"` and its own Escape handler, and not
`ember-primitives`, which is now removed. Focus trapping, Escape, the top layer
and `::backdrop` come from the browser.

**Prerendering by headless snapshot, not prember.** prember last shipped
2024-07-05 against the classic broccoli pipeline that Ember 7 no longer
defaults to. The snapshot approach is framework-independent and reuses the
`puppeteer-core` already present.

**DnD will be `@dnd-kit/dom` directly.** Not yet wired. dnd-kit's core is
framework-agnostic as of 0.5.0 (no React dependency, no peer deps).
`@arthur5005/dnd-kit-ember` wraps it in Glimmer modifiers and is worth using as
a reference, but it is one author, two releases, and pinned to `@dnd-kit` 0.2.x.

**Behavioural coverage is committed, and asserts.** The rigs in
`scripts/verify/` were 18 gitignored dot-files that printed observations and
never failed. They now follow the parent repo's contract instead. This is the
only coverage of the chrome, of the vendored primitives, and of anything that
needs a portal or real input, so it does not belong outside version control.

**The tool registry is a glob, and the route awaits it.**
`components/tools/registry.ts` is `import.meta.glob('./*.gts')`, so the id is
the file's own basename and a new tool registers itself. Vite expands the glob
into one literal `import()` per file, which is what gives each tool its own
chunk. `routes/tools/tool.ts` awaits the loader in `model`: Ember does not
render a route until its model resolves, so the chunk arrives with the
transition and the template gets a component or `undefined`, the same two cases
it had before. A template-side await would need a loading state on every tool
page for a fetch that is usually a few kB.

**`app/lib` is declared static.** `staticAppPaths: ['lib']` in
`ember-cli-build.mjs`. Nothing there is resolved by name, and the default puts
every one of them in `@embroider/virtual/compat-modules`, which the app entry
imports eagerly.

**`lib/tools.ts` keeps its shape and IDs.** `PARITY.md` in the repo root names
it as the source of truth for the CLI and iOS repos. The only change is `icon`,
now a kebab-case string rather than a `LucideIcon`.

---

## Gotchas worth not rediscovering

Each of these cost real time.

**Crayon import specifier.** `crayon-css` exports only `"."` under a `sass`
condition. The bare specifier is required under Vite and fails under the raw
sass CLI, which wants `crayon-css/src/crayon`. Compile checks outside Vite will
not resolve the config.

**Crayon's `dark` mixin is a media query.** `_crayon-config.scss` hides it and
redefines it against the `.dark` class, because delphitools has a manual toggle
that must survive.

**Crayon function names.** `leading()` and `tracking()`, not `line-height()`
and `letter-spacing()`.

**Colour opacity modifiers are 1.12 MB of Crayon's 1.32 MB default output.**
Off via `$use-color-opacity-modifiers: false`. With them off the sheet is small
enough that Crayon's suggested PurgeCSS step buys nothing.

**Animations are load-bearing on vendored components.** Tooltip and Popover
unmount on `animationend`. Without real keyframes they open and never close.
Upstream gets these from `tw-animate-css`, which Crayon replaces. Check this for
every new vendored component with an exit transition.

**shadcn-ember destructors re-read consumed context.** `CommandGroup` and
`CommandItem` used `this.commandContext!` inside `registerDestructor`, which
throws when a whole subtree unmounts (a Command inside a Popover) because the
parent is torn down first. Both now capture the context at registration. Expect
the same shape in other vendored components.

**`PopoverTrigger` renders its own `<button>`.** Wrapping your own button in it
produces nested buttons and the UA grey background. Use `@asChild`.

**`display: contents` breaks floating-ui.** An element with no box reports a
zero rect and the panel anchors to 0,0.

**Inline-block wrappers collapse their children.** `TooltipTrigger` is
inline-block, so wrapping a nav link in it made the link shrink to its text.
Scoped `display: block` in `.dt-nav-group`.

**`/* @vite-ignore */` alone does not work for literal specifiers.** Rolldown
still resolves them and the build fails with `UNRESOLVED_IMPORT`. A variable
fixes the build but the dev server then rewrites the request to `?import` and
tries to transform the emscripten glue. `lib/jxl.ts` goes through
`new Function` so dev and production take the same path.

**Ported TypeScript typechecks differently here.** The Ember blueprint sets
`noUncheckedIndexedAccess`; the Next tsconfig does not. Three ported libs threw
14 errors across 980 lines, all matched-regex or fixed-length-array indexing.
At that rate the remaining ~15.5k lines of framework-free code will need a
couple of hundred small fixes. Mechanical, but not free, and `CONVERSION.md`'s
"ports unchanged" should be read as runtime-only.

**A vendored component that reads its context inside a modifier re-runs on
every state change.** `context` is a `@cached` getter that recomputes whenever
anything tracked on the provider changes, so a modifier body that reads it is
torn down and rebuilt each time. In `select` that unregistered and re-registered
the item on every arrow key, writing to the item list after the listbox had
already read it, which Glimmer rejects as a backtracking update. Capture the
functions you need at construction. This is the same shape as the destructor bug
already fixed in `command.gts`, and worth checking in every vendored component.

**The copy-gap marker needs the canonical comment shape, which Handlebars
cannot give it.** slopsieve's parser ends an annotation at the first line that
does not look comment-ish, and a `{{! ... }}` block's closing `}}` on its own
line does not, so the placeholder below it orphans into a second bogus gap. Put
the string in a module constant above the template with `//` comments instead.
`slopsieve --lint` catches this; run it before ending a session that added one.

**gen-icons has to emit what prettier would.** It writes tabs, and quotes only
the hyphenated keys. Otherwise every regeneration leaves `lint:format` red and
needs a formatting pass over a file whose header says not to edit it.

**Round-tripping a colour through its own displayed string is lossy.** OKLCH
hue prints to one decimal place, which is not enough to pin a saturated colour
to the same byte, so `#ff0000` comes back as `#ff0001`. The Next app does the
same. Assert to within one 8-bit step, not exactly.

**Machine-learning weights are fetched, the ONNX runtime is bundled.** They
look like one concern and are two. transformers.js falls back to a jsdelivr URL
for the runtime only when nothing has set `wasmPaths`, and any bundler that can
resolve the binary sets it — Rolldown emits the 21.6 MB
ort-wasm-simd-threaded.jsep.wasm and rewrites the reference, exactly as
Turbopack does for the Next app. The dev server serves transformers unbundled
and so does use the CDN, which is the same dev-versus-build split `lib/jxl.ts`
documents. `static.mjs` asserts the built half.

**Ask for fp16 weights, not fp32.** On RMBG-1.4 that is 88 MB instead of 176 MB
and a WebGPU run of 10s instead of 24s, for a matte identical to three
significant figures. q8 is 44 MB and also matched, but on one stylised test
image, which is not where quantisation shows.

**RMBG's sigmoid does not saturate.** A fully kept pixel comes back at alpha
254, not 255. An assertion written against 255 reports zero opaque pixels and
reads exactly like a broken mask.

**Puppeteer rejects any CDP call outstanding after 180s.** That silently capped
every rig here at three minutes however long it asked for, and the rejection
surfaces as the rig's own timeout rather than as a protocol error, so a long
model run looks like a model failure. `protocolTimeout: 0` in the harness.

**A browser check run while anything is editing files will see state wiped.**
Vite HMR remounts the component on every save, so a rig that uploads an image
and asserts a second later can find the tool back at its drop zone. It looks
exactly like a tool that resets itself. Do not run browser checks against the
dev server while a port is in progress.

**Never run a repo-wide command from an unverified directory.** A `cd` that
silently fails leaves the next command running at the repo root, where
`npm run format` belongs to the Next app. That happened once and rewrote 313
files. Prep scripts should use absolute paths.

**Generate the tool registry, do not patch it.** The first integration script
inserted an entry and then re-sorted the list; once sorted, the next insert
appended a duplicate of every entry, which typescript caught as 31 duplicate
object keys. It was then rebuilt from the components on disk each time, and is
now `import.meta.glob`, which is the same idea with no script to run.

**Prettier strips quotes from single-word object keys.** `decoder: Decoder`,
not `'decoder': Decoder`. Any script that greps the registry or `icons.ts` for
`'name':` silently misses them, which reads as a tool that failed to register.

**Read the DOM before writing an assertion.** Five browser checks in this batch
failed against tools that were working: a bordered Select trigger read as a
native control, a selector that matched the sidebar search rather than the
tool, `sci-calc` being a keypad rather than a text field, `watermarker` needing
two images rather than one, and `encoder` putting its output in a textarea's
`value`, which never appears in `textContent`.

**Shell word-splitting bites here.** `for t in $TOOLS` treats the variable as a
single string in this shell, so a file-watcher built that way never matches.
Use python for anything involving a list.

**`npm` is a fish alias for `bun` on this machine.** Installs write `bun.lock`
and leave `package-lock.json` stale. Use `/opt/homebrew/bin/npm install
--package-lock-only` to resync; the parent repo tracks that file to pin the
Cloudflare Pages build.

**A tool that fails to export a default renders as "Coming Soon", and every
gate stays green.** `loadToolComponent` returns undefined, the route falls to
the placeholder, and the build, the five lint gates and the prerender pass all
succeed — prerender reads the page header, which comes from `lib/tools.ts`, not
from the component. A tool that throws while rendering looks the same to a
visitor. `scripts/verify/tools.mjs` exists for this: it visits all 53 routes and
asserts the placeholder is absent.

**pdf-lib needs both halves of an optimizeDeps entry.**
`@pdf-lib/standard-fonts` stores each font as a deflated payload in a file named
`.json`, and its own `es/Font.js` imports them as JSON. Vite's dep optimizer
parses them, fails the whole pass with "trailing characters", and takes the dev
server down, so pdf-lib is excluded from it. But excluding a package leaves its
dependencies unconverted, and pdf-lib reaches pako 1.0.11 — CommonJS — down
three paths, each resolving to its own nested copy. Served raw, any of them
throws "does not provide an export named 'default'" the first time a tool
touches pdf-lib. All three are named in `optimizeDeps.include`; an entry only
covers the copy at that exact path. The production build runs neither pass, so
`npm run build` stayed green through both failures.

**Clearing `node_modules/.vite` is how you find this class of bug.** The dev
server can be running happily on a cached prebundle while a cold start fails
outright, so a green dev server proves nothing about a new dependency until the
cache has been cleared once.

**Never copy a worker into `public/`.** `pdf.worker.min.mjs` was copied from the
Next app at 5.4.624 while this app installed 5.7.284, and pdf.js refuses to run
on any mismatch: "The API version X does not match the Worker version Y",
thrown on the first PDF opened rather than at build time. `lib/pdfjs.ts` imports
it as `pdfjs-dist/build/pdf.worker.min.mjs?url` instead, so npm moves both
together. `public/lib/imagetracer_v1.2.6.js` is a deliberate exception:
image-tracer builds a Worker from that URL at runtime and needs a stable path.

**Two engines are fetched at first use, not bundled.** RMBG-1.4 for
`background-remover` (88 MB of fp16 weights, from the Hugging Face CDN) and
pandoc for `doc-converter` (58 MB of wasm, 15.9 MB over the wire gzipped, from
unpkg — measured, not estimated). Neither is self-hosted: Cloudflare Pages has a
hard 25 MiB per-file limit and jsDelivr refuses the pandoc build too. Both cost
nothing until a visitor uses that tool, and both are cached afterwards. The
first conversion in `doc-converter` therefore has a real wait behind it and
that is expected, not a hang.

**Two ways the imposer preview looks broken when it is not.** The sheet paints
grey `#e8edf3` slots with page-number badges whenever `pdfDoc` is null, which is
what a failed pdf.js load looks like — flip, prev and next all keep working, so
it reads as a missing feature rather than an error. The other way is the **Blank
mode** switch, which stays available with a PDF loaded (in both apps) and swaps
the rendered sheet for numbered blank slots. The canvas does render real page
thumbnails: `tools.mjs` and `pdf.mjs` both pass through that path.

**Bleed is real geometry now, in `zine-imposer` only.** The switch used to
append `-bleed` to the filename and nothing else, here and in the Next app. It
now grows the page by 3mm on all four sides, keeps the sheet inside it, draws
each outer panel 3mm past the trim, and sets a `TrimBox` at the sheet edge. The
bleed margin lies outside every cell, so nothing bleeding into it can reach a
neighbour, and interior edges are folds that need none. `fill` crops to the box
it has to cover so bleed crops slightly less rather than stretching; `fit`
letterboxes inside its cell and never reaches an edge, so it is untouched. A
bleed PDF is 216x303mm and a home printer will scale it to fit — that is
inherent, and the UI does not say so.

**A catch that swallows shows the wrong cause.** pdf-preflight reported "Could
not parse this PDF file" for a pdf-lib that had failed to load at all, and
logged nothing, so the console was empty while the tool blamed the file. Every
analysis path there logs its cause now.

**Embroider's compat-modules is what actually decides the bundle.** Splitting
the tools into dynamic imports took `main` from 1.65 MB to 772 kB, and 448 kB of
what was left was the Shavian dictionary — a file only one tool imports, and
only through `?raw`. Every module under `app/lib/` was listed in
`@embroider/virtual/compat-modules` for the runtime resolver, and `app/app.ts`
imports that map eagerly, so a dynamic import elsewhere buys nothing. Components
are not affected: `staticInvokables` already keeps them out. Read the emitted
`main` before assuming an import graph explains it.

**Sass deprecation noise is upstream.** The `if-function` warnings come from
`crayon-css` (`_borders.scss` 38 and 88, `_svg_masks.scss` 22), not this app.
Narrowly silenced in `vite.config.mjs`; remove once Crayon ships the modern
syntax. The fix for Ash is three lines, but it raises Crayon's Sass floor to
1.100.

---

## Not done

**Tools.** One left, and it is half in.

### `substrata` — the lib is in, the components are not

Its own project, not a tool port. 106 files in the Next app: 67 under
`lib/substrata` and 39 under `components/substrata`.

**The lib is ported, tested and committed.** All 67 files, now 11,329 lines
under `app/lib/substrata`. The headline finding, which the earlier estimate got
wrong: **`lib/substrata` has zero React imports.** Every file is plain
TypeScript, so the port was the copy plus two import rewrites, and 54 of the 67
typechecked untouched. The other 13 failed only on `noUncheckedIndexedAccess`,
which is on here and off in the Next tsconfig — 149 errors, every one an
indexed access, all fixed type-level with no runtime change.

Three things came with it:

- `app/lib/tracked-external.ts`, the Ember side of the nineteen
  `subscribe`/`getSnapshot` stores. 34 components bind those with
  `useSyncExternalStore`; the stores themselves are framework-free and needed
  no change, so only the binding is per-framework.
- `app/lib/download.ts`, which the file and export paths import. The catalogue
  tools still each do the object-URL dance inline; they were not touched.
- a real `SegmentationPipeline` type in `substrata/bg-removal.ts`. It carried
  `any` plus `no-explicit-any` disables from the Next config, and this project
  runs `recommendedTypeChecked`. Note it is **not** a duplicate of
  `lib/bg-removal.ts` despite the name: that one is the model wrapper for the
  background-remover tool, this one is a per-hash matte cache with a
  WebGPU-to-WASM runtime fallback on top.

**235 unit tests over it**, 4,357 lines in `tests/unit/substrata/`, the first
this code has ever had. They pin the document model, the layer tree, every
structural op, the colour conversions, the geometry and the export dimension
maths. The immutability contract gets the most attention because it is what a
port breaks quietly: every op returns a new doc, leaves its input untouched,
and shares unvisited branches by reference — a port that deep-copies the tree
on every edit still "works" and makes history useless.

**What remains: 39 components, 11,475 lines, in two passes.**

Pass 1, about 6,000 lines — a usable editor most harnesses can drive:
`fabric-canvas` (2,549, and it owns `window.__substrata`), `substrata-shell`
(133), the `/editor` route, `top-bar` (699), `omnibar` (503) with
`omnibar/tool-settings` (693), `layers-panel` (686), `inspector-panel` (699).

Pass 2, about 5,500 lines: `fx-panel` (953), the four colour modes (880),
the modals (982), `looks-panel` (278), `arrange-panel` (186), and the rest.

**This is a Fable task.** Run the component agents on `fable`, the way
`text-editor` and `doc-converter` were. Opus was the wrong tier for it: this is
a 2,500-line imperative canvas controller with a 33-key debug surface that 22
harnesses assert against, not a form.

**Mounting.** Substrata is not a tool page. It is `/editor`, its own Next route
outside the `(site)` group, with its own layout and no sidebar; the registry
entry at `lib/tools.ts:157` already carries `href: '/editor'` and
`app/router.ts` already declares `this.route('editor')`. There is no
`app/templates/editor.gts` yet, so `/editor` renders the shell with an empty
outlet. The application template wraps everything in `.dt-shell` with the
sidebar, so the editor route has to break out of that the way the Next layout
does. `scripts/prerender.mjs` also writes `/tools/substrata` from the registry
and has no `/editor` entry — both need correcting when the shell lands.

**The rig surface is the contract.** The 22 harnesses in the **parent repo's**
`scripts/verify/` drive `window.__substrata` and are the only regression net
the editor has ever had. They use 33 keys, most heavily `setTool` (46 calls),
`toolSettings` (30), `layers` (27), `select` (25), `vt` (21) and `samplePixel`
(16). Reproducing that surface exactly is what makes the port testable, so it
lands with the canvas rather than after it.

They need no porting to run against this app: `scripts/verify/pieces.mjs` and
its siblings read `EDITOR_URL`, defaulting to `http://localhost:3000/editor`,
which is exactly where the Ember dev server serves it.

**They move into `v2/delphitools-v2/scripts/verify/`** and are adapted to this
app's `harness.mjs` (`launch` / `visit` / `check` / `finish`), so `npm run
verify` becomes 37 rigs and there is one copy, one command and one harness
style. The Next app's editor loses its only regression net; that is accepted,
because retiring it is the point.

**Docking runs on real dnd-kit.** `@dnd-kit/dom@0.5.0` and
`@dnd-kit/abstract@0.5.0` are installed — no React, no peer dependencies, which
is the decision already recorded under "Architecture decisions" and in
`PHASES.md`. Substrata's drag-to-dock ports faithfully rather than being
approximated: module grips and the omnibar grip are draggables, the four edge
zones and the rail strip are targets, anywhere else floats the panel.
`lib/substrata/drag-dock.ts` and `dock-pref.ts` are already across and drive it.
`@arthur5005/dnd-kit-ember` is the reference for the Glimmer modifier layer, not
a dependency: one author, two releases, pinned to `@dnd-kit` 0.2.x while 0.5.0
is current, and the modifier layer is five small files. Vendor and restyle it
the way `app/components/ui/` was. `touchnav.mjs` covers touch here.

**Copy.** The Next Substrata has no unfilled gaps: every string is shipped
wording, carried over verbatim like the other ports.

`wifi-form` was a sub-panel with no route of its own and is now part of
`qr-genny`, where it belongs.

**Chrome leftovers.** Animated icons, sticker wall, favour banner, the TAXIWAY
split-flap and Friends of Delphi are all GSAP or motion and absent.

**Primitives still to vendor.** collapsible and sheet/drawer, if a later tool
needs them. Nothing has yet: the D3 tools that wanted an Accordion or a Switch
built a toggle button and a styled checkbox instead, partly because
ember-template-lint's `no-nested-interactive` and `require-presentational-children`
reject several of the shapes the shadcn versions use.

**image-stitcher and graph-calc are covered.** `stitch.mjs` drives the mosaic,
the four export formats (PNG magic bytes, JXL codestream signature), a side
button growing the mosaic, and the batch pool. `graph.mjs` drives the sampler:
axes, grid and ticks present, an expression replacing the curve, tan(x) breaking
into seven subpaths and 1/x into two, an uncompilable expression reporting
itself, and pan and zoom moving the range fields.

**Most of the D3 batch is unexercised.** Ten tools render, boot without a
console error, and pass every gate; `tools.mjs` is a mount check rather than a
behaviour check. The three pdf tools now have `pdf.mjs` on top of that, and all
ten have been through a manual pass. What still has no automated coverage of
its actual output: no crop dragged, no document converted, no barcode decoded,
no traced SVG compared, nothing typed into the editor.

**Copy.** Eight unfilled gaps: `algebra-calc`, `favicon-genny`, `graph-calc`,
`image-stitcher`, `matte-generator`, `scroll-generator`, `social-cropper`,
`watermarker`.
`slopsieve` fills them. The D3 batch added only the one, because every other
string in those ten tools already exists verbatim in the Next app and was
carried across rather than rewritten.
Separately, `background-remover` carries the Next app's line about "a ~180MB
processing engine", which was accurate at fp32 and is now roughly 110 MB.

**Build output path.** `dist/`, where the parent repo's `static-smoke.mjs`
expects `out/`. One line in `vite.config.mjs` when it matters.

**`tailwind-merge`, `clsx`, `class-variance-authority`** are still in
`package.json`. `tailwind-merge` is dead with Tailwind gone.

**Deploy.** Nothing is wired to Cloudflare Pages. `public/_redirects` has not
been carried across.

**A failed chunk fetch has nowhere to go.** The route's model hook now awaits a
network request, and there is no `error` template, so a 404 on a tool chunk
leaves the transition aborted with a console error. The way that happens in
practice is a redeploy under an open tab: the cached `index.html` names hashes
that no longer exist. Static imports could not fail this way. It needs an
`error` route or a reload-on-chunk-error, and neither is worth building before
anything is deployed at all.

---

## Next

1. Substrata's components, 39 files and 11,475 lines. `fabric-canvas` and the
   `window.__substrata` surface first, because nothing about the editor can be
   regression-tested until that exists; then the shell and the `/editor` route;
   then the panels and modals.
2. Deploy. `public/_redirects` has not been carried across and the parent
   repo's `static-smoke.mjs` expects `out/` where this builds to `dist/`. Both
   are one-line jobs and nothing has been proven past `npm run build:static`.
3. Interaction coverage for the seven D3 tools that still have none. The ones
   worth doing first are those whose output a rig can check without a human
   eye: `code-genny` against a barcode decoder, `image-converter` round-tripping
   a known image (its GIF and TIFF encoders are hand-written and the least
   proven code in the app), `image-tracer` against a traced shape.
4. Two optional bundle jobs. A deep-linked tool page costs an extra round trip:
   only `main` knows the tool chunk's URL, so the fetch cannot start until
   `main` has run. `scripts/prerender.mjs` already boots each route in Chrome,
   so recording that route's asset requests and writing a `modulepreload` link
   per route is about five lines. And the 158 kB `application` chunk is the
   largest thing on first load, against an 86 kB `main`; nobody has looked at
   what is in it.

---

## Outstanding outside this branch

`components/substrata/substrata-shell.tsx` in the parent repo lost an
uncommitted edit when a repo-root `npm run format` ran by mistake and the
revert that undid it took four unstaged files with it. The untracked linter
config survived, and `package.json` plus both lockfiles were reconstructed from
the linter session's transcript. That one file went back to HEAD. APFS local
snapshots from before the incident exist:

```sh
mkdir -p /tmp/snap
sudo mount_apfs -o ro -s com.apple.TimeMachine.2026-08-09-175454.local / /tmp/snap
diff /tmp/snap/Users/ruby/GitRepos/delphitools/components/substrata/substrata-shell.tsx \
     components/substrata/substrata-shell.tsx
```
