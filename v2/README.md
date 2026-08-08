# delphitools 2.0 — scope

Rewrite of the web app from Next.js + React onto Ember 7, plus new tools and
features. This directory is the planning record.

| Document | Contents |
| --- | --- |
| `README.md` | scope, target stack, decisions, risks, cost |
| `CONVERSION.md` | the 1:1 matrix: every component, its difficulty, its blockers |
| `PHASES.md` | phase plan, difficulty ratings, ordering, exit criteria |

Branch: `v2-ember`. Nothing here is built yet.

---

## What exists today

Measured on `main` at c26dc47.

| Segment | Lines | Ports as-is? |
| --- | ---: | --- |
| `lib/**/*.ts` + `hooks` (framework-free logic) | 16,495 | yes, minus 5 hook files |
| `components/tools/*.tsx` (56 tools) | 32,683 | no, React |
| `components/substrata/**` (editor UI) | 16,398 | no, React |
| `lib/substrata/*.ts` (editor core) | 9,201 | yes |
| `components/ui/*.tsx` (24 shadcn primitives) | 2,206 | no, React + Radix |
| `app/**` (routes, layouts, OG routes) | ~600 | no, Next App Router |
| **Total source** | **66,817** | |

The split that matters: **16,495 lines are framework-free TypeScript and move
unchanged.** Around 50,150 lines are `.tsx` and get rewritten. `lib/substrata/`
in particular (doc model, layer ops, filters, export, sync, colour maths) has no
React in it at all.

## Target stack

| Concern | Today | 2.0 |
| --- | --- | --- |
| Framework | Next.js 16.2.10 | Ember 7.1 (released 2026-06-22) |
| Component authoring | `.tsx` | `.gts` template tag, Glimmer components |
| Build | Turbopack / webpack | Embroider + Vite (`@embroider/vite` 1.7.9) |
| Types | TypeScript strict | TypeScript strict + Glint |
| Routing | App Router, file-based | Ember router, `app/router.ts` |
| State | hooks | `@tracked`, `reactiveweb`, `ember-concurrency` |
| UI primitives | Radix + shadcn | `ember-primitives` 0.61.1 + hand-built gaps |
| Icons | `lucide-react` (95 files) | `lucide-static` inlined by a Glimmer helper |
| CSS | Tailwind 4 | Tailwind 4 via `@tailwindcss/vite` |
| Canvas editor | Fabric 7 (framework-agnostic) | Fabric 7, unchanged |
| Tests | 22 puppeteer harnesses, no unit tests | `ember-qunit` 9 + the existing harnesses |
| Output | `output: "export"` static | Vite static build + prerender pass |
| Host | Cloudflare Pages | unchanged |

All version numbers verified against the npm registry on 2026-08-08.

## Decisions

### Ember 7, Embroider + Vite, template tag

Ember 7.0 landed 2026-05-29, 7.1 on 2026-07-27. 6.12 was the final 6.x LTS.
Template tag (`.gts`) is a Polaris pillar with a released RFC and a codemod, so
it is the authoring format to start in rather than migrate to later.

### Fabric.js stays

Fabric is a canvas library with no framework binding. `import { Canvas } from
"fabric"` works identically in a Glimmer component. Only the 2,549-line React
wrapper `fabric-canvas.tsx` is rewritten, and it is mostly `useEffect` blocks
that become a modifier plus lifecycle hooks.

### ProseMirror stays

Same reasoning. ProseMirror's view layer writes to a plain DOM node. The React
wrapper in `text-editor.tsx` is thin, so this tool is cheaper than its 658 lines
suggest.

### Prerendering by headless snapshot, not prember

The site currently emits 59 HTML files, each with its own title, description and
og:image tags, plus 57 `og.png` rendered by satori at build time. An Ember SPA
emits one `index.html`. That breaks every share card.

`prember` is the traditional answer. Its last commit is 2024-07-05 and it depends
on `broccoli-*` and `ember-cli-babel`, the classic pipeline Ember 7 no longer
defaults to. Treating it as available is a risk we do not need to take.

Instead: a post-build script that boots the built app in headless Chrome, visits
each route, and writes the settled DOM to `out/<route>/index.html` with the head
tags substituted. `puppeteer-core` is already a devDependency and already drives
22 harnesses, so this adds no new tooling. The same script renders the `og.png`
set with `satori` + `@resvg/resvg-js`; `lib/og-card.tsx` is already plain satori
JSX reading fonts off disk and ports almost verbatim.

This decision is framework-independent. It would be the right call for a Vite +
React rewrite too.

### ember-primitives covers most, not all, of Radix

| Radix primitive in use | ember-primitives | Action |
| --- | --- | --- |
| accordion | `accordion.gts` | map |
| dialog | `dialog.gts` | map |
| popover | `popover.gts` | map |
| separator | `separator.gts` | map |
| slider | `slider.gts` | map |
| switch | `switch.gts` | map |
| tabs | `tabs.gts` | map |
| label | none | native `<label>` |
| slot | none | native `{{yield}}` |
| collapsible | none | build, ~40 lines |
| select | none | `ember-power-select` 9.0.2 or native `<select>` |
| tooltip | none | build on `ember-velcro` (floating-ui) |

Also missing: `cmdk`. The command palette (`components/ui/command.tsx`, 187
lines) has no Ember equivalent and gets built. `components/ui/sidebar.tsx` is
726 lines of shadcn and gets rewritten regardless.

`ember-primitives` is at 0.61.1, actively released (2026-07-20), maintained by
NullVoxPopuli under `universal-ember`. It has 46 GitHub stars. That is a small
project to depend on for accessibility behaviour; see risks.

### The three React-only tools

| Tool | Dependency | Why it cannot port |
| --- | --- | --- |
| `gradient-genny` (1,540 LOC) | `@dnd-kit/core` + `sortable` + `modifiers` | React DnD context and hooks throughout |
| `image-stitcher` (1,100 LOC) | same | same |
| `graph-calc` (937 LOC) | `mafs` | a React component library for plotting, no vanilla core |

`@dnd-kit` maps to `ember-sortable` (adopted-ember-addons, pushed 2026-08-03) or
to the native HTML drag-and-drop API. `mafs` has no equivalent: the plotting UI
gets rebuilt directly on SVG, with `mathjs` doing the evaluation as it already
does.

Substrata also uses `@dnd-kit` in 6 files for its dock and layer panels. Same
replacement.

`motion` (14 files) covers the 12 animated sidebar icons, the sticker wall and
two Substrata surfaces. Ember's answer is `ember-animated` or CSS. The animated
icons are small enough to redo as CSS keyframes.

## Cost

Rated in the matrix, summed in the phase plan.

| Segment | Days |
| --- | ---: |
| 56 tools | 76.5 |
| Substrata | 30 |
| UI primitives | 4 |
| Site chrome | 8 |
| Routing, build, prerender, OG | 8 |
| Test infrastructure | 3 |
| **1:1 parity total** | **129.5** |

130 engineer-days for parity, before Phase 0 and before any new work. Roughly
four months full time, or six at a sustainable solo pace alongside other things.

## Risks

**WARN** `ember-primitives` at 46 stars is the accessibility foundation for the
whole UI. If it stalls, the fallback is hand-built primitives, which is where the
`collapsible`/`tooltip`/`cmdk` work already sits. Budget for owning all of them.

**WARN** Prerendering is unproven on this stack. Prove it in Phase 0 on three
routes before committing to the rewrite, because a failure there costs the share
cards and search indexing that `231b90b` and `c26dc47` just delivered.

**WARN** `PARITY.md` names this repo as the source of truth for the CLI and iOS
siblings, keyed on `lib/tools.ts`. The registry must keep the same shape and IDs
through the rewrite, or the parity contract breaks silently.

**WARN** The 22 Substrata harnesses drive `window.__substrata`. That rig is
defined inside React components. Porting it is a prerequisite for the harnesses
to keep working, and the harnesses are the only regression net that exists.

**INFO** Three WASM and worker paths route around the bundler deliberately: jxl
(`/public/jxl`, `webpackIgnore` comment at `image-converter.tsx:192`), pandoc
(fetched from unpkg, `new Worker(new URL(...), import.meta.url)`), and
`pdf.worker.min.mjs`. Vite handles the second natively and better than webpack.
The first needs its ignore comment changed to `/* @vite-ignore */`.

## The question worth asking once

None of the 127 days buys a user-visible improvement. The catalogue works, the
share cards work, the editor works. If the goal is Ember, that is a legitimate
goal and the plan above delivers it. If the goal is 2.0 as a product, the new
tools and features in Phase 6 can ship on the current stack in a fraction of the
time.

Both are answered in `PHASES.md`: the phase plan is ordered so the framework
work and the product work stay separable, and either can be dropped.
