# DESIGN.md — delphitools "dense / flush / hairline" system (Ember + Crayon)

The visual language for every tool. Read this plus one reference tool before you
restyle or build. The canonical, fully-realised references live in the current
codebase: **`app/components/tools/qr-genny.gts` + `app/styles/tools/_qr-genny.scss`**
and its sibling **`code-genny`** (the barcode generator). Study those first.

> Historical note: an earlier DESIGN.md described this same language for a
> Next.js / React / Tailwind tree (`.tsx`, `globals.css`, Radix). That tree is
> gone. The repo is now Ember/Glimmer (`.gts`) styled with Crayon (an SCSS
> framework) through per-tool partials. The feeling is unchanged; the mechanics
> below are the current ones.

---

## 1. The feeling

Dense, flush, square, hairline-ruled. Think spreadsheet, segmented control,
periodic table. Not soft cards. The governing rule:

> **Text breathes (keeps padding). Buttons and containers go flush** — edge to
> edge, no rounding, no inset gaps, big touch targets.

Be bold inside the system, but **never change a tool's functionality, state,
handlers, or DOM structure when you are only restyling.** A layout rewrite is a
deliberate act: verify it in the browser before you call it done (section 15).

---

## 2. Stack and file layout

- **Components**: `app/components/tools/<id>.gts` (Glimmer single-file
  components: class + `<template>`). The registry auto-globs this directory.
- **Styles**: one partial per tool, `app/styles/tools/_<id>.scss`, pulled in with
  a `@use "tools/<id>";` line in `app/styles/app.scss`. Every partial starts with
  `@use "../crayon-config" as crayon;`. One partial per tool is a hard rule —
  `app.scss` grew past 3000 lines and every new tool collided in it.
- **Shared chrome and utilities**: `app/styles/app.scss` (`.segmented`,
  `.dt-tabs-*`, `.dt-sr-only`, the theme token `:root`/`.dark` blocks, the
  `@font-face` pair).
- **Registry / metadata**: `app/lib/tools.ts`.
- **Icons**: `app/lib/icons.ts`, added with `node scripts/gen-icons.mjs`.

---

## 3. Crayon: the styling system

Crayon is configured once in `app/styles/_crayon-config.scss` (font stacks,
zeroed radii, brand colours, class-based dark mode). Never import `crayon-css`
directly; always `@use "../crayon-config" as crayon`.

**Spacing and sizing** use the Tailwind spacing scale through `crayon.size(n)`,
where `n` is 0.25rem units: `size(4)` = 1rem = 16px, `size(10)` = 2.5rem = 40px,
`size(12)` = 3rem. Fractions work: `size(1.5)`, `size(2.5)`.

**Functions** (call as `crayon.fn(...)`):

- `size(n)` — spacing / dimension.
- `font-size("xs" | "sm" | "base" | "lg" | "xl" | "2xl" | … "5xl")`. The UI runs
  small: `sm` and `xs` dominate; `lg` is a section heading.
- `font-weight("normal" | "medium" | "semibold" | "bold")`.
- `font-family("mono" | "sans" | "serif")` — mono and sans both resolve to iA
  Writer Quattro (section 4).
- `color("amber-500", …)` — the Tailwind palette, for the rare fixed colour that
  is not a theme token.
- `tracking(...)`, `leading(...)`, `rounded(...)` — letter-spacing, line-height,
  radius helpers (radius is already 0 globally, so `rounded` is seldom needed).

**Mixins** (`@include crayon.name(...)`):

- `vstack(n)` — `display:flex; flex-direction:column; gap: size(n)`.
- `hstack(n)` — the horizontal equivalent.
- `hover { … }` — hover styles gated so touch devices do not get stuck states.
  Use this instead of a bare `&:hover`.
- `screen("sm" | "md" | "lg" | "xl") { … }` — min-width breakpoints.
- `dark { … }` — emits `html.dark &`. This is the project's own mixin (defined in
  `_crayon-config.scss`), not Crayon's `prefers-color-scheme` one, because the
  theme is a `.dark` class written onto `<html>` by the no-flash bootstrap so an
  explicit user choice survives.

---

## 4. Typography

- One UI typeface: **iA Writer Quattro**, a self-hosted variable font
  (`public/fonts/…`, weight axis 400–700), declared as an `@font-face` pair in
  `app.scss`. Do not add another face.
- Crayon's `$font-families` maps **both** `mono` and `sans` to iA Writer Quattro,
  and `$default-font` is `mono`, so the whole UI reads as one monospaced-feeling
  family. `serif` stays a real serif stack (Georgia) for the rare serif need.
- Body text is Quattro by default. For a specific element, `font-family:
var(--font-mono)` also resolves to Quattro. Quattro is duospaced, not strictly
  monospaced; for columnar number alignment add `font-variant-numeric:
tabular-nums` (used throughout for page counts, readouts, sizes).

---

## 5. Colour tokens

Theme colours are OKLCH custom properties defined in the `:root` and `.dark`
blocks of `app.scss`. Use the tokens through `var(--token)`; never hardcode hex
for UI chrome. The ones you will reach for, by frequency:

- `--border` — every hairline and divider, and the background behind a 1px grid
  gap (the `.segmented` trick, section 8).
- `--foreground` / `--muted-foreground` — primary and secondary text.
- `--background` — input and control fields.
- `--card` — a tool's surface (the fill inside the frame).
- `--muted` — a recessed surface (preview grounds, hover fills).
- `--primary` / `--primary-foreground` — the highlighted action (green in light,
  amber in dark) and its text.
- `--destructive` — remove / delete affordances.
- `--accent`, `--popover`, `--ring` — menus, popovers, focus rings.

Dark mode flips these through the `.dark` class, so a correct token choice needs
no per-theme work.

---

## 6. Corners — square, globally

`_crayon-config.scss` zeroes every radius token except `full`:

```scss
$border-radii: (
	"none": 0,
	"sm": 0,
	"DEFAULT": 0,
	"md": 0,
	"lg": 0,
	"xl": 0,
	"2xl": 0,
	"3xl": 0,
	"full": 9999px,
);
```

So corners are square without effort. `full` stays for genuine pills, switches,
and avatars (see `.dt-code-switch` for the toggle pattern). When in doubt, square
it; keep `full` only on real toggles.

---

## 7. Border hierarchy

Two weights, and only two:

- **2px** (`border: 2px …`, `border-bottom: 2px`, `border-right: 2px`): the frame
  around a tool's editor, and the major dividers inside it — the input row versus
  the work area, or a two-column preview/options split.
- **1px** (`border: 1px …` with `var(--border)`): everything nested — sub-blocks,
  option groups, table rows and cells, segmented lines.

---

## 8. Hairlines: `.segmented` and the sibling-border pattern

Two ways to draw single hairlines between flush cells. Pick by what the cells are.

**`.segmented`** (global, in `app.scss`) — for a button/option group:

```scss
.segmented {
	display: grid;
	gap: 1px;
	background-color: var(--border);
	border: 1px solid var(--border);
}
.segmented > * {
	border: 0 !important;
	border-radius: 0 !important;
}
```

A 1px grid gap over a `--border` background shows as hairlines; child borders and
radii are neutralised. In the template, put `.segmented` plus the tool's own
class (which supplies the column count) on the group, e.g.
`class="segmented dt-ppn-font"` with `.dt-ppn-font { grid-template-columns:
repeat(3, 1fr); }`. Fill the grid — pick a column count with no empty cells.
Give grid children `min-width: 0` so long labels shrink instead of overflowing
the track (an overflowing segment paints over its neighbour — this was a real
bug in the page numberer).

**Sibling borders** — for stacked blocks or table rows, add `border-top: 1px
solid var(--border)` to each block after the first (`& + & { border-top: … }`),
or `border-bottom` per row. This keeps the container's own background (usually
`--card`) as the fill, so trailing empty space below the last block reads as
surface, not as a dark strip. Do **not** give a flush column a `background:
var(--border)`; a grid item stretches to the row height and any space below its
content then paints in the hairline colour (the "dark void" bug).

---

## 9. Flush containers and the bleed

Panels pad their text (`padding: size(4)`). Full-width containers inside a padded
panel — a `.segmented` group, a preview, a table — reach the panel edges. In this
SCSS tree the clean way is structural: build the container as its own grid cell or
give it explicit edge borders that meet the frame, rather than cancelling padding
with negative margins. See `code-genny`'s `.dt-code-main` (a 2-column grid whose
`.dt-code-preview` carries `border-right: 2px` and the options column pads its
own content).

---

## 10. Tool anatomy

The realized shape, top to bottom (see `code-genny`, `qr-genny`,
`background-remover`, `pdf-page-numberer`):

1. **Frame** — `border: 2px solid var(--border)` wrapping the whole editor.
2. **Action bar** — a flush row, `min-height: size(12)`, holding the file name /
   title on the left and the primary action on the right. Secondary controls are
   flush cells divided by `border-left: 1px`. The primary button carries
   `is-primary` (`background: var(--primary)`), fills the cell height
   (`align-self: stretch`), and is a big target.
3. **Body** — either a single work column or a `preview | controls` split. Splits
   are a grid; each column fills the row height. The divider between columns is a
   2px border on the preview side, or a 1px grid gap over `--border`.
4. **Option groups** — stacked blocks on the `--card` surface, divided by 1px
   sibling borders (section 8). Inputs keep padding; button groups go
   `.segmented`.

Primary "do the thing" buttons (Generate, Apply, Process, Download) are flush and
fill their container. Full-width primary: `width: 100%; height: size(14)`. In a
flush bar: a cell with `border-left: 1px`, `align-self: stretch`.

---

## 11. Tabs

The tabs primitive is `app/components/ui/tabs.gts`, styled by `.dt-tabs-list` /
`.dt-tabs-trigger` in `app.scss` (a flush segmented list: 1px frame over a
`--border` background, triggers fill and share `data-[state="active"]` fill). It
is already flush — do not re-skin the primitive per tool.

A tool passes its own class through `...attributes`, which Glimmer merges with the
primitive class, so `.dt-<tool>-tab` is **additive** to `.dt-tabs-trigger`. Use it
only to add layout, most commonly a fixed height: several tools pin
`.dt-<tool>-tab { display:flex; height: size(10); align-items:center;
justify-content:center; }` so tab buttons match across tools. Give the list its
column count (e.g. `grid-template-columns: repeat(4, 1fr)`).

---

## 12. Tables and repeated items

One row per item: cells divided by `border-left`, rows by `border-top` (or
`& + &`). A native colour input becomes a full-cell swatch by stacking a coloured
`<span>` under a transparent `input[type="color"]` (`opacity: 0`, absolutely
filling the cell). The complete pattern is `code-genny`'s `.dt-code-colour` row
(name cell · swatch · hex input · toggle cell) and `.dt-code-swatch`.

---

## 13. Icons

Icons are Lucide, rendered `<Icon @name="trash-2" />` from
`app/components/icon.gts`, backed by the map in `app/lib/icons.ts`. To use an icon
not yet in the map, add it and run `node scripts/gen-icons.mjs`. Names referenced
only behind a runtime map are invisible to the generator's template scan — if an
icon is chosen dynamically, keep the name list where the generator can see it (see
`lib/substrata/fx-icons.ts` for the precedent).

---

## 14. Naming

Flat, prefixed class names: `.dt-<abbrev>-<part>`, where `<abbrev>` is the tool's
short tag (`qr`, `code`, `ppn`, `i2p`, `strip`, …). No nesting-driven selectors
beyond a shallow state class (`.is-active`, `.is-primary`, `.is-checkered`).
State lives on `.is-*` modifier classes or `data-*`/`aria-*` attributes the
component already sets.

---

## 15. Guardrails and verification

- **`scripts/verify/classes.mjs`** fails when any `dt-` or `sub-` class used in a
  component has no definition under `app/styles`. It exists because a bulk
  stylesheet edit once silently deleted an unrelated rule block. Never edit SCSS
  by blind anchor-range slicing, and never leave a class in a template with no
  rule. Genuinely-unstyled wrappers go in its allow-list with a reason.
- **User-facing copy** (four or more words) is never authored here. Leave a copy
  gap with a commented spec/sample per the global rules; a tool's description in
  `tools.ts` is such a gap. Short labels (1–3 words: button text, headings) are
  written directly.
- **Verify a visual change in the browser before claiming it done.** The dev
  server runs on `localhost:3000`. Load the tool, exercise the changed path,
  screenshot it. A stale Vite module graph serves inconsistent modules after many
  in-place edits; restart the dev server before believing a surprising result.
- **Gates**, all green before done:
     - `npm run lint` — five checks: `lint:css` (stylelint), `lint:js` (eslint),
       `lint:hbs` (ember-template-lint), `lint:types` (ember-tsc), `lint:format`
       (prettier). Fix your own additions; do not chase pre-existing noise.
     - `npm run test` — QUnit (`vite build --mode development` then `ember test`).
     - `node scripts/verify/all.mjs` — the browser harness rigs.
     - `node scripts/verify/classes.mjs` — the class-definition check above.

---

## 16. Per-tool checklist

1. Component `app/components/tools/<id>.gts` (registry auto-globs).
2. Entry in `app/lib/tools.ts`: description is user copy — leave a copy gap with
   spec + sample; name is 1–3 words; `accepts` for file-taking tools;
   `carryColour` only if the tool reads `?color=`.
3. `app/styles/tools/_<id>.scss` plus its `@use` line in `app.scss`. Frame +
   action bar + hairline-divided option groups; `.segmented` for button groups
   with `min-width: 0` children; the two border weights only.
4. New icons → `node scripts/gen-icons.mjs`.
5. PARITY.md row and counts.
6. Unit tests for lib logic; a harness rig for canvas / worker / transport
   behaviour.
7. `npm run lint`, `npm run test`, `node scripts/verify/classes.mjs`, and a
   browser smoke test green before done.

---

## 17. Reference tools (study these)

- **`qr-genny` / `code-genny`** — the template. A 2px frame wrapping a flush type
  picker, an input row (2px divider), a fused preview | options split (2px
  section dividers), every option group `.segmented`, colour tables, sliders,
  accordion option groups.
- **`background-remover`** — frame, segmented quality selector, flush comparison
  grid, a full-width flush Process button, a flush Download action bar.
- **`pdf-page-numberer`** — frame, flush action bar with a primary Apply, a
  `preview | controls` split, controls as `--card`-surfaced blocks divided by 1px
  hairlines, a `1fr 1fr auto` field grid (Size · Margin · Position on one row)
  with `min-width: 0` fields so the segmented font picker cannot overflow.
