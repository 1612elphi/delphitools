# delphitools 2.0 — STATE (current lay of the land)

Snapshot of the `v2-ember` branch for the Next-to-Ember rewrite. Companion to
`README.md` (scope), `CONVERSION.md` (the 1:1 matrix) and `PHASES.md` (the phase
plan, which also carries the Phase 0 findings). This file is what actually
exists in the code right now.

**Status:** Phase 0 is CLOSED — all six questions answered, neither gate failed.
The site chrome is built, three tools are at parity, and the behavioural rigs
are committed rather than gitignored.

Branch: `v2-ember`. App: `v2/delphitools-v2/`. The Next app in the repo root is
untouched and still the production site.

```
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
npm test                  # ember-qunit, 35 tests
npm run lint              # eslint + template-lint + stylelint + prettier
npm run verify            # 10 puppeteer rigs, 183 checks, needs npm start
npm run verify:static     # prerendered output + jxl, needs npm run build:static
```

Gates, all green as of `d53986f`: `ember-tsc --noEmit`, `eslint .`,
`ember-template-lint .`, `stylelint **/*.{css,scss}`, `prettier --check .`.

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
| `static.mjs` | the built output: per-route head tags, share cards, client-side nav, the jxl codec |

`static.mjs` serves `dist/` itself, so it needs no separate server, and is
excluded from `npm run verify` because it needs a build rather than the dev
server.

---

## What works

**Stack.** Ember 7.1, Embroider + Vite, TypeScript strict + Glint, `.gts`
template tag throughout. 10,945 lines of app source. Build is ~5s; output is
174 kB CSS and 680 kB JS.

**Styling on Crayon.** `crayon-css` 0.9.1 (Sass) replaces Tailwind 4 entirely.
`app/styles/_crayon-config.scss` is the single config; `app/styles/app.scss` is
the whole stylesheet, ported from the Next app's `globals.css` with the theme
token block byte-identical to it.

**Chrome.** Sidebar with collapsible icon rail (cookie-persisted, ⌘/Ctrl+B,
off-canvas below 768px, live search over the registry), header with
route-derived title, category badge and the colour-notation selector, theme
toggle, About dialog, 404. Pride styling and the commit SHA come through Vite
`define`.

**Routing.** `/`, `/tools/:tool_id`, `/editor` (stub), wildcard 404. URLs
unchanged from the Next app.

**Tools.** 3 of 56.

| Tool | Notes |
| --- | --- |
| `palette-genny` | full parity, including the hidden export panel (press P) |
| `colour-converter` | checked numerically against the Next implementation, 6,488 inputs, zero differences |
| `favicon-genny` | canvas resize, per-size PNG, and the .ico container |

Unported ids fall through to a placeholder card, so every catalogue link
resolves.

**Shared pieces the ports produced.** `lib/colour-maths.ts` holds both
directions of every colour transform, replacing the three copies the Next app
carried. `lib/ico.ts` builds the ICO container, which was inline and untested
there. `modifiers/file-paste.ts` replaces the `use-file-paste` hook that 23
Next tools use.

**Primitives.** `app/components/ui/` holds `dialog` (local, over the native
element) plus `tooltip`, `popover`, `command` and `select` vendored from
shadcn-ember and restyled.

**Static output.** `scripts/prerender.mjs` boots the built app in headless
Chrome at all 57 routes, checks each renders, and writes a per-route
`index.html` with that route's head tags plus its `og.png` beside it. Verified
against five scraper user agents; head tags match the Next build field for
field on tool routes.

**Tests.** 35 qunit tests over the pure logic: the sidebar service, the share
link parser, the colour converter, the ICO builder and the paste-accept
matcher. Each suite was checked against the pre-fix code to confirm it fails.

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

**`npm` is a fish alias for `bun` on this machine.** Installs write `bun.lock`
and leave `package-lock.json` stale. Use `/opt/homebrew/bin/npm install
--package-lock-only` to resync; the parent repo tracks that file to pin the
Cloudflare Pages build.

**Sass deprecation noise is upstream.** The `if-function` warnings come from
`crayon-css` (`_borders.scss` 38 and 88, `_svg_masks.scss` 22), not this app.
Narrowly silenced in `vite.config.mjs`; remove once Crayon ships the modern
syntax. The fix for Ash is three lines, but it raises Crayon's Sass floor to
1.100.

---

## Not done

**Tools.** 53 of 56. See `CONVERSION.md` for the per-tool difficulty matrix.

**Substrata.** Untouched. `window.__substrata` must be ported before any of it,
because the 22 harnesses in the parent repo's `scripts/verify/` are the only
regression net on the editor.

**Chrome leftovers.** Animated icons, sticker wall, favour banner, the TAXIWAY
split-flap and Friends of Delphi are all GSAP or motion and absent.

**Primitives still to vendor.** collapsible, sheet/drawer, and whatever later
tools need. `select` is done; nothing has needed the other two yet.

**Copy.** One unfilled gap, in `favicon-genny.gts`: the message shown when a
chosen file will not decode. `slopsieve` fills it.

**Build output path.** `dist/`, where the parent repo's `static-smoke.mjs`
expects `out/`. One line in `vite.config.mjs` when it matters.

**`tailwind-merge`, `clsx`, `class-variance-authority`** are still in
`package.json`. `tailwind-merge` is dead with Tailwind gone; the other two are
framework-independent and may still earn their place.

**Deploy.** Nothing is wired to Cloudflare Pages. `public/_redirects` has not
been carried across.

---

## Next

The tool-page shape, the primitives and the rig harness all exist now, so each
further port inherits them. The cheapest useful work is more tools.

1. More Colour tools, which now cost the least: `contrast-checker`,
   `gradient-genny` and `harmony-genny` all read from `lib/colour-maths.ts` and
   the notation service, both of which are built and tested.
2. A tool that needs a dependency rather than a canvas — `qr-genny` or
   `svg-optimiser` — to find out what the static import map in
   `components/tools/registry.ts` costs before it holds fifty entries.
3. Wire the deploy. `public/_redirects` and the `dist/` versus `out/` mismatch
   are both one-line jobs, and until they are done nothing has been proven end
   to end past `npm run build:static`.
4. Substrata, which is its own project and wants `window.__substrata` first.

Revised estimate after Phase 0: 129.5 days to parity.
