# delphitools 2.0 — STATE (current lay of the land)

Snapshot of the `v2-ember` branch for the Next-to-Ember rewrite. Companion to
`README.md` (scope), `CONVERSION.md` (the 1:1 matrix) and `PHASES.md` (the phase
plan, which also carries the Phase 0 findings). This file is what actually
exists in the code right now.

**Status:** Phase 0 is CLOSED — all six questions answered, neither gate failed.
The site chrome is built and the first tool is at parity. One of 56 tools ported.

Branch: `v2-ember`. App: `v2/delphitools-v2/`. The Next app in the repo root is
untouched and still the production site.

```
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
npm start                 # vite, pinned to :3000 so the harnesses work
npm run build             # vite build -> dist/
npm run prerender         # per-route index.html + og.png, needs a build first
npm run gen-icons         # regenerate app/lib/icons.ts from what templates use
npm test                  # ember-qunit, 16 tests
npm run lint              # eslint + template-lint + stylelint + prettier
```

Gates, all green as of `ff5e044`: `ember-tsc --noEmit`, `eslint .`,
`ember-template-lint .`, `stylelint **/*.{css,scss}`, `prettier --check .`.

Behavioural checks are gitignored dot-files in the repo root (`/.v2-*.mjs`,
matching the parent repo's convention for one-off puppeteer rigs). Six matter:

| Rig | Covers |
| --- | --- |
| `.v2-chrome.mjs` | sidebar collapse, search, header title, active link, 404 |
| `.v2-palette.mjs` | generate, lock, add/remove, strategy combobox |
| `.v2-devmode.mjs` | the hidden export panel |
| `.v2-dialog.mjs` | native dialog: open, Escape, focus return, backdrop |
| `.v2-sharelink.mjs` | `?colors=` parsing and fallbacks |
| `.v2-tooltip.mjs` | collapsed-rail tooltips, unmount, keyboard focus |

They need the dev server up. None of them are committed; if they matter
long-term they should graduate into `tests/` or a `scripts/verify/` like the
parent repo has.

---

## What works

**Stack.** Ember 7.1, Embroider + Vite, TypeScript strict + Glint, `.gts`
template tag throughout. 6,113 lines of app source. Build is ~5s; output is
165 kB CSS and 652 kB JS.

**Styling on Crayon.** `crayon-css` 0.9.1 (Sass) replaces Tailwind 4 entirely.
`app/styles/_crayon-config.scss` is the single config; `app/styles/app.scss` is
the whole stylesheet, ported from the Next app's `globals.css` with the theme
token block byte-identical to it.

**Chrome.** Sidebar with collapsible icon rail (cookie-persisted, ⌘/Ctrl+B,
off-canvas below 768px, live search over the registry), header with
route-derived title and category badge, theme toggle, About dialog, 404. Pride
styling and the commit SHA come through Vite `define`.

**Routing.** `/`, `/tools/:tool_id`, `/editor` (stub), wildcard 404. URLs
unchanged from the Next app.

**Tools.** 1 of 56. `palette-genny` at full parity including the hidden
export-to-collection panel (press P). Unported ids fall through to a
placeholder card, so every catalogue link resolves.

**Static output.** `scripts/prerender.mjs` boots the built app in headless
Chrome at all 57 routes, checks each renders, and writes a per-route
`index.html` with that route's head tags plus its `og.png`. Verified against
five scraper user agents; head tags match the Next build field for field on
tool routes.

**Tests.** 16 qunit tests: 9 for the sidebar service, 7 for the share-link
parser. Both suites were checked against the pre-fix code to confirm they
actually fail.

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
`app/components/ui/` holds `tooltip`, `popover`, `command` (all MIT, from
IgnaceMaes/shadcn-ember 0.2.1) with their Tailwind class strings replaced by
`dt-*` hooks. Each keeps a header naming the upstream version and every
divergence. The behaviour is the expensive part and it ports; the styling does
not. This is a fork: `shadcn-ember add` is not usable directly, and upstream
fixes have to be pulled by hand.

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

**Tools.** 55 of 56. See `CONVERSION.md` for the per-tool difficulty matrix.

**Substrata.** Untouched. `window.__substrata` must be ported before any of it,
because the 22 harnesses in the parent repo's `scripts/verify/` are the only
regression net on the editor.

**Chrome leftovers.** Animated icons, sticker wall, favour banner, the TAXIWAY
split-flap and Friends of Delphi are all GSAP or motion and absent. The
colour-notation selector in the header is not wired, though its service exists.

**Primitives still to vendor.** collapsible, select, sheet/drawer, and whatever
later tools need. `select` is the notable gap: `paper-sizes` needs a combobox.

**Build output path.** `dist/`, where the parent repo's `static-smoke.mjs`
expects `out/`. One line in `vite.config.mjs` when it matters.

**`tailwind-merge`, `clsx`, `class-variance-authority`** are still in
`package.json`. `tailwind-merge` is dead with Tailwind gone; the other two are
framework-independent and may still earn their place.

**Deploy.** Nothing is wired to Cloudflare Pages. `public/_redirects` has not
been carried across.

---

## Next

The plan says Phase 1, and the cheapest useful thing is more tools, because the
tool-page shape now exists and every port inherits it.

1. A second and third tool, ideally a D2 canvas one (`favicon-genny`,
   `matte-generator`) to prove the canvas pattern, and `colour-converter` to
   exercise `colour-maths` and the notation service.
2. Wire the colour-notation selector into the header. The service is built; the
   header does not show it, so notation cannot currently be changed.
3. Vendor `select` when `paper-sizes` or `image-converter` needs it.
4. Decide whether the puppeteer rigs graduate into a committed
   `scripts/verify/`. They are the only coverage of the chrome and they are
   currently gitignored.

Revised estimate after Phase 0: 129.5 days to parity, of which roughly 14 days
of Phase 1 work exists.
