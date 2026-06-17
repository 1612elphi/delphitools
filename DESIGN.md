# DESIGN.md — delphitools "dense / flush / hairline" rework

This documents the in-progress visual redesign so a fresh agent can continue
applying it to the remaining tools. **`components/tools/qr-generator.tsx` is the
canonical, fully-realised reference — read it first.**

---

## 1. The feeling

Dense, flush, square, hairline-ruled. Think spreadsheet / segmented control /
periodic table — not soft cards. The governing rule:

> **Text breathes (keeps padding). Buttons and containers go flush** — edge to
> edge, no rounding, no inset gaps, big touch targets.

The owner is design-particular and iterates fast. Be bold inside the system, but
**never change a tool's functionality, state, handlers, or layout structure — restyle only.**

---

## 2. Typography

- The single UI typeface is **iA Writer Quattro** — self-hosted variable font
  (`public/fonts/iAWriterQuattroV.woff2` + `-Italic`, weight axis 400–700),
  declared in `app/globals.css`. IBM Plex Mono and Instrument Serif were removed
  (do not reintroduce them, incl. `font-family: 'Instrument Serif'`).
- It is wired through the `--font-mono` token (`@theme inline` in globals.css →
  `--font-mono: 'iA Writer Quattro', ui-monospace, monospace`). The body uses the
  `font-mono` class. So `font-mono` everywhere = Quattro (it is NOT monospaced).
- **For genuinely monospaced text** (terminal commands, code), do NOT use
  `font-mono`. Use an inline `ui-monospace` stack, e.g. the `mono` const in
  `components/download-card.tsx`: `{ fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace" }`.

---

## 3. Colour tokens

OKLCH tokens live in `app/globals.css` (`:root` + `.dark`). Use the Tailwind
semantic classes, never hardcoded hex for UI chrome:

- Hairlines / dividers: `border-border` (= `var(--border)`).
- Highlighted/primary action: the default `<Button>` variant (`bg-primary`,
  green in light / amber in dark).
- Surfaces: `bg-card`, `bg-muted`, `text-muted-foreground`, `text-foreground`.

---

## 4. Corners — square, globally

`app/globals.css` flattens **all** radius tokens to 0:

```css
:root { --radius: 0; }
@theme inline { --radius-sm:0px; --radius-md:0px; --radius-lg:0px;
                --radius-xl:0px; --radius-2xl:0px; --radius-3xl:0px; --radius-4xl:0px; }
```

So every `rounded-*` utility is already square. **Do not add `rounded-*`.**
`rounded-full` is NOT zeroed (pills/switches/avatars stay round) — but the owner
has chosen to square even decorative control pills inside tool surfaces when they
read as "rounded corners" (e.g. the palette swatch controls). When in doubt,
square it; leave `rounded-full` only on real toggles/switches.

---

## 5. Border hierarchy (important)

- **2px** (`border-2`, `border-b-2`, `border-r-2`): the top-level frame around a
  tool's editor, AND the major section dividers inside it (e.g. input-row vs
  preview/options, or a two-column split).
- **1px** (`border`, `border-b`, `border-l`, with `border-border`): everything
  nested — sub-sections, option-group boxes, table rows & cells, segmented lines.

---

## 6. `.segmented` — flush option groups (the core utility)

Defined in `app/globals.css` (in `@layer components` so utilities can override it):

```css
@layer components {
  .segmented { display:grid; gap:1px; background-color:var(--border); border:1px solid var(--border); }
  .segmented > * { border:0 !important; border-radius:0 !important; }
}
```

Any radio-like / segmented button group (was `grid ... gap-N` or
`flex flex-wrap gap-N` of `<Button>`s) becomes:

```jsx
<div className="segmented grid-cols-3"> {/* pick N so cells fill evenly */}
  <Button …/> …
</div>
```

- Children sit edge-to-edge separated by single 1px hairlines; their own
  borders/radii are neutralised automatically.
- Buttons fill their cells (grid stretch). The selected one uses the default
  (primary) variant; others `variant="outline"`.
- **Fill the grid** — no empty cells. Use an even count, or `col-span-*` on the
  last item (QR Quick Styles is 9 in `grid-cols-3`).

---

## 7. Flush containers — the bleed pattern

Panels pad their text (`p-4` / `px-4`). Full-width **containers** (a `.segmented`
group, a preview box, a table) bleed to the panel's edges:

```jsx
<div className="segmented grid-cols-4 -mx-4 border-x-0"> … </div>
{/* add -mb-4 border-b-0 too if it's the LAST child reaching the panel bottom */}
```

`-mx-4` cancels the panel's `px-4`; `border-x-0` drops the container's side
borders so it meets the frame cleanly (the frame/divider supplies the line).

### ⚠️ Gotcha: `overflow-hidden` clips the bleed

A negative-margin bleed is **clipped by any `overflow-hidden` ancestor** — most
notably Radix `<AccordionContent>`. Symptom: groups inside an accordion stay
inset no matter the `-mx-4`. **Fix (see QR):** take the horizontal padding OFF
the clipping element (the `AccordionItem` → `border-b border-border` only) and put
it on the trigger + content instead:

```jsx
<AccordionItem className="border-b border-border">
  <AccordionTrigger className="px-4 font-bold">…</AccordionTrigger>
  <AccordionContent className="space-y-4 px-4 pb-4"> {/* groups inside use -mx-4 border-x-0 */}
```

Now the content box is full-width, so the inner `-mx-4` reaches the edge un-clipped.

---

## 8. Tabs

`components/ui/tabs.tsx` is already flush — **do not restyle TabsList/TabsTrigger
per tool.** TabsList = `border-2 border-border` (2px frame), no bg/padding;
TabsTrigger = flush cells with `border-l border-border first:border-l-0` dividers
and `data-[state=active]:bg-muted`. In a tool, give TabsList the column count,
e.g. `className="grid w-full grid-cols-4"`.

---

## 9. Highlighted / primary action buttons

The green "highlighted" actions (Generate, Download PNG, Process…) should be
**flush and fill their container** — big touch targets, edge to edge, no
surrounding padding. In a flush bar/cell:

```jsx
<Button onClick={…} className="h-auto self-stretch rounded-none border-0 …">…</Button>
```

For a full-width primary (e.g. Process): `className="w-full h-14 text-lg font-bold"`.
For one inside a flush action bar (e.g. Download PNG): it's a flush cell with a
`border-l border-border` divider, `h-auto self-stretch`, that fills to the
container's edge. See `background-remover.tsx` Result bar.

---

## 10. Tables (repeated like-items: colours, results, presets)

One row per item; cells divided by `border-l`, rows by `border-b`; full-bleed
(`-mx-4 border-y` / `border-x-0`). Native colour input as a full-cell swatch:

```jsx
<div className="relative w-12 shrink-0 border-l border-border">
  <div className="size-full" style={{ backgroundColor: hex }} aria-hidden />
  <input type="color" value={hex} onChange={…}
         className="absolute inset-0 size-full cursor-pointer opacity-0" />
</div>
```

See QR's **Colours** table for the full pattern (name cell · swatch · hex input ·
optional toggle cell).

---

## 11. Controls-row pattern

A flush bar with a big central primary action flanked by secondary controls,
`min-h-16`, dividers between, each cell fills the height. Palette example:
`[ Strategy select | big central Generate | count −/+ ]` — see
`components/tools/palette-genny.tsx` Controls.

---

## 12. Reference tools (study these)

- **`components/tools/qr-generator.tsx`** — the template. One 2px frame wrapping
  tabs → input box → fused Preview | Options (2px section dividers), titles inside
  panels, every option group `.segmented`, containers bleed to edges, accordion
  padding relocation, colour table, 3×3 quick styles.
- `components/tools/background-remover.tsx` — frame, segmented quality selector,
  flush comparison grid, flush Process button, flush Download action bar.
- `components/tools/palette-genny.tsx` — frame, 2px section dividers, segmented
  export, flush controls bar, **colour list table**, flush colour strip.
  (Owner is still iterating on the strip — may want a more dramatic redo, e.g. an
  always-visible flush hex caption row, or flush per-swatch control bars.)

---

## 13. Workflow / guardrails

- **Build to verify:** `npm run build` (Next 16, static export, 56 pages, runs TS).
  Don't run concurrent builds. Dev server: `npm run dev` → `localhost:3000`.
- **Lint:** `npm run lint`. The repo has **pre-existing** lint noise (a minified
  data file; some unescaped apostrophes; a `set-state-in-effect` in palette-genny).
  Don't try to fix those — just don't ADD new errors. `<img>`/`no-img-element`
  warnings are expected (static export, `unoptimized: true`).
- Tool components: `components/tools/*.tsx`. Registry/metadata: `lib/tools.ts`.
  Shared UI primitives: `components/ui/*` (already adjusted — avoid per-tool
  changes there).
- `test.html` at repo root is an **untracked sandbox** — ignore / safe to delete.

---

## 14. Status & what's left

**Done:** home page redesign + iA Writer Quattro swap (committed `bbc2d5a`);
flush/segmented system + QR generator template (committed `0310887`).
**Uncommitted in working tree:** `palette-genny.tsx` and `background-remover.tsx`
restyles + refinements (review before committing — owner wasn't fully happy with
the palette strip/controls solution; expect to iterate).

**Remaining:** ~34 other tools in `components/tools/` still need the system
applied. Square corners are already global and tabs already cascade, so per tool
the work is: wrap in a 2px frame, give sections titles-inside + 2px dividers,
convert option groups to `.segmented`, bleed containers to edges (mind the
overflow gotcha), make primary actions flush/fill, and use tables for repeated
items. Suggested next batch: **Calculators** (most button/grid-heavy).

Branch: `feat/dense-redesign` (not pushed).
