# Substrata — BUILD PLAN

> Executable milestone playbook generated from the `substrata-build-playbook` workflow
> (9 agents: one planner per milestone M0–M7 + a sequencing/gating director). Source of
> record for the build is `SPEC.md`; this file decomposes it into ordered, file-level tasks
> tagged by autonomy. **Not user-facing — a working doc.**

**Autonomy legend**

| Tag | Meaning |
| --- | --- |
| 🟢 **safe** | Mechanical + build/lint/tsc/route-render verifiable. An unattended agent can do *and* check it. |
| 🟡 **review** | It will compile, but whether it's *correct* is a visual/UX/taste call — needs Ruby's eyes. |
| 🔴 **decision** | Contains an open design/library call only Ruby should make. |

---

## Overnight execution strategy

### Recommended scope for an unattended run

ATTEMPT TONIGHT (self-verify by build/lint/tsc/route-smoke; treat all as DRAFTS, never "done"):

TRUST UNATTENDED (pure/mechanical, build-verifiable):
- M0-1 install fabric ^7.4.0 + dexie ^4 and run npm install (also repairs the absent node_modules so the baseline build gate can even run; confirm baseline 56 pages still emit).
- M0-9 PARITY.md Substrata web-only carve-out (factual only; any prose as ∑CG).
- M0-8 Dexie schema v1 lib (lazy/typeof-guarded, no indexedDB at module eval).
- M0-7 lib/substrata/capabilities.ts detection module only (leave secure-context-notice as a ∑CG-stub, render-gate it).
- M1-7 webgl-limits.ts + filter-backend.ts scaffold (the textureSize clamp is mechanically verifiable).
- Bonus namespace-neutral pure libs at root lib/ that need neither route nor doc-model: M4-1 (colour-convert, port oklch from palette-strategies, do NOT edit that shared file; add a scratchpad round-trip sanity script), M4-2 (colour-prism math), M7-10 (extract lib/social-presets.ts; verify /tools/social-cropper still renders identically).

ATTEMPT WITH A REVERT TRIPWIRE:
- M0-2 restructure to free /editor from the sidebar — pick the LOWER-blast-radius approach, then verify build green + page count preserved + automated render-smoke of /, a sample /tools/*, and /editor. If ANY existing-route smoke fails, git-revert the restructure and STOP. Flag the A-vs-B choice for Ruby's ratification regardless (the route cannot render sidebar-free without this — App Router has one root layout).
- M0-3 + M1-1 reconciled: stand up a compiling, sidebar-free /editor skeleton rendering an empty SubstrataShell + a disposed-on-unmount Fabric canvas mount behind dynamic ssr:false (grep-confirm fabric is never server-imported).
- M1-2 DRAFT the doc-model types + observable store as a PROPOSAL that compiles; do NOT let M1-3+ harden against it.

HARD STOP before: M0-4 top bar, M0-5 menus, M0-6 window-shell sizing (all taste + blocked on the unresolved ∑CG copy-boundary), and before TRUSTING any M1 correctness work (M1-3 reconciler fidelity, M1-5 import, M1-6 layers, M1-8 undo/redo, M1-9 autosave, M1-10 MOVE) — these compile but their correctness is unprovable without a test suite. STOP entirely before M2–M7 (each carries open decisions and/or hard-blocks on unbuilt M1/M3 APIs); the only later-milestone work worth touching tonight is the three namespace-neutral pure libs listed above. Do NOT author one word of user-facing copy anywhere; leave ∑CG gaps and hand off to slopsieve in the morning.

### Autonomy assessment (the honest take)

Brutal version: in this repo a green build proves only that code COMPILES (TS strict), JSX is valid, and the static export emits its routes — nothing about behaviour. There is no test suite, so for a stateful, imperative Fabric canvas editor the automated gate is far too weak. CAN be trusted unattended (pure, deterministic, build/scratch-verifiable): dependency installs, Dexie schema v1 (M0-8), capability detection (M0-7), the WebGL textureSize clamp (M1-7), and the namespace-neutral pure-math libs — colour-convert/prism (M4-1/M4-2), social-preset extraction (M7-10), and later-milestone arithmetic like area-clamp (M6-3), SHA-256 (M5-2), and align geometry (M7-6) IF their namespace is pinned first. CANNOT be trusted unattended (compiles but correctness/visual/data-safety is invisible to the build): the doc->Fabric reconciler (M1-3), undo/redo inverse-patch correctness (M1-8 — a bad inverse silently corrupts state), autosave round-trip + blob refcount/GC (M1-9/M5-5 — a refcount bug is silent raster data loss, not a crash), every layout/visual port (top bar, menus, window shell, Layers, Inspector, all module UIs), the four custom GLSL shaders (M3-6..M3-9 — wrong uniforms render silently wrong, never throw), the static-export Worker/WASM paths (M5-7/M6-5/M6-6/M7-3 — can 404/mis-MIME or no-op only in out/ or only on Safari), Safari's silent transparent-canvas export failure (M6-4, not reproducible in Chromium), tile seams with neighbour-sampling filters (M6-7), and the entire ML pipeline (M7-2..M7-5, needs WebGPU+WASM real-browser runs). Two structural catches make unattended depth worse: (1) M0 is genuinely un-built and the /editor route cannot render sidebar-free without the M0-2 whole-app restructure, whose regressions are visual-only; (2) the doc-model schema (M1-2) is load-bearing into M3/M5/M6 and must be ratified before downstream hardens. Net: let the agent scaffold a green-building, sidebar-free /editor skeleton plus the pure libs, and stop. Everything else is draft-only pending Ruby's eyes.

### Self-verification (no test suite in this repo)

Per-step gauntlet, in order, fail-closed: (1) npx tsc --noEmit (or rely on build's strict pass) — type errors STOP the run; (2) npm run lint — no NEW errors (pre-existing noise allowed) or STOP; (3) npm run build — must exit 0, emit out/, and preserve the baseline page count (~56 + /editor); a drop or failure STOPS; (4) route smoke-render — serve out/ statically and curl/headless-fetch /, a sample /tools/[toolId], and /editor, asserting HTTP 200 + an expected DOM marker per route and zero console errors; (5) discipline greps — grep ∑CG to confirm zero authored user-facing copy, grep to confirm `fabric` appears ONLY under an ssr:false dynamic boundary (never a server-evaluated import), and for any worker/wasm task ls out/_next/static (and out/wasm) to confirm the asset emits with a fetchable JS/wasm MIME (the static-export trap, not provable in dev); (6) for pure libs (M4-1/M4-2, area-clamp, hash) drop a NON-committed scratchpad script asserting round-trip/known-value stability — the only correctness proxy available. FAILURE POLICY: for foundation/safe tasks (M0-1/7/8/9, M1-7, M4-1/2, M7-10) any build/lint/tsc/smoke failure => STOP and log (these are the trust floor). For the M0-2 restructure specifically => git-revert and STOP if any existing-route smoke regresses. Skip-and-log is permitted ONLY for an isolated, non-foundational scaffold file that can be stubbed/∑CG-gated without breaking the build; if a failure cannot be isolated, STOP. Because correctness is unverifiable here, the executor must mark every needs-human-review task as "drafted, build-green" NOT "done", and append a morning checklist of exactly what Ruby must manually verify and which ∑CG gaps slopsieve must fill.

### Human gates — where the run must STOP for Ruby

| After | Why |
| --- | --- |
| **M0-2** | Ratify the sidebar restructure approach (A two root layouts vs B bare-root + (site) group) and visually QA all ~56 existing routes — skip-link, theme-flash script, ColourNotationProvider/providers, and sidebar presence — because these regressions are visual-only and NOT caught by the build. Also decide how users actually reach /editor (entry point is unspecified; nothing links to it). |
| **M0-3** | Resolve the ∑CG copy-boundary BEFORE M0-4/M0-5: Ruby's hard rule treats all button/menu/microcopy as copy, but the mockup uses literal chrome verbs (Undo/Open/Save/Export/Delete/Help) — confirm whether conventional chrome verbs are exempt or must be ∑CG. AND unify the Substrata namespace: M0/M1/M5 use lib/substrata + components/substrata, but the M3/M4 plans say components/editor and M2/M7 say app/editor/_components + app/editor/lib — pin one or every later file path churns. Both block all downstream UI/label work. |
| **M1-2** | Sign off the doc-model schema — group nesting depth, blendMode enumeration, where bit-depth/colour mode live, default artboard dimensions. It propagates into M3 effects, the M5 .substrata manifest, and M6 export, so it is the single most expensive thing to get wrong; M1-3..M1-10 and M2/M3/M5/M6 must not harden against it until ratified. |
| **M1-10** | Manual correctness review of all stateful core that compiles but is unprovable without tests: reconciler fidelity + blend/shadow mapping (M1-3), raster import placement + oversize clamp proving full render not ~30% (M1-5), Layers sketch fidelity + drag (M1-6), undo/redo inverse-patch correctness across every op (M1-8), autosave round-trip + blob dedupe/GC (M1-9), and the MOVE object:modified->doc write-back desync seam (M1-10). |
| **M2-1** | Open decisions gating M2 authoring: perfect-freehand npm vs vendored tldraw fork (M2-2), which woff2 faces to bundle (licensing, M2-3), and the biggest unknown — SELECT scope (which of marquee/lasso/magnet/flood/superflood lands) plus destructive-region-ops vs extract-to-new-layer semantics that conflict with the non-destructive doc-model contract (M2-10). |
| **M3-2** | Effect/shader design + API risk: Threshold/Posterize are mis-classified as shader-free and need a ship-as-GLSL vs defer call (M3-5); the OkLab Colour-Balance region model and Duotone presets are open (M3-7/M3-9); rasterize-for-effects editability semantics are under-specified (M3-15). Also verify the Fabric v7 custom BaseFilter uniform/fragmentSource API against the installed source/context7 (differs from v5/v6 docs) — wrong bindings render silently wrong. All four GLSL shaders require human visual QA. |
| **M4-7** | M4-8 active-colour-target resolution (multi-select? effect-slot focus? last-touched?) and the §14 'families from colour-names.ts' contradiction (getColourName returns nearest specific names, not 24 evenly-spaced family buckets) are design calls; M4-9 palette integration shape (strip vs source vs 4th tab, recent-colours is post-v1); and M4-8 hard-blocks on M1/M2/M3 fill APIs that don't exist yet. |
| **M5-4** | Tuning decisions: OPFS-vs-IDB size threshold and whether OPFS is worth it over IDB-only (M5-5), snapshot retention count + debounce that overlaps M1 autosave (M5-12), and browser-fs-access dep acceptance (M5-1). Then manual save->reload->open round-trip and refcount/GC data-loss smoke (M5-5/6/8/11) — silent data loss is not build-caught. |
| **M6-1** | @jsquash AVIF dependency add + WASM-under-static-export hosting strategy (copy-to-public vs resolveAlias; Turbopack ignores ?url/type:asset) (M6-6), canonical 2026 social preset dimensions + whether a preset resizes the artboard or only fits/crops (M6-2/M6-11), and batch-export v1 scope (M6-13). Then real Safari/iOS device verification of output-verify (M6-4), Worker/OffscreenCanvas + WASM (M6-5), and tile seams with neighbour-sampling filters (M6-7) — none reproducible in Chromium/CI. |
| **M7-1** | Hosting a ~115MB BiRefNet-lite model under static export collides with Cloudflare Pages' 25MiB/file limit (needs chunking/host decision), the transformers v3->v4 bump is a breaking change that also touches the existing /tools/background-remover, model licensing must drop BRIA, and the magic-resize reflow algorithm is entirely undefined in the spec (M7-8). The whole ML pipeline (M7-2..M7-5) needs WebGPU and WASM-fallback verification in real browsers. |

### Open gaps flagged by the director

- M0-2 sidebar-escape approach (two root layouts vs bare-root + (site) group) is unresolved and the only way to render /editor sidebar-free; plus the entry point to /editor is unspecified (nothing links to it).
- ∑CG copy-boundary is undefined and conflicts with the mockup's literal labels: are chrome verbs (Undo/Open/Save/Export/Delete/Help) exempt from the no-copy rule or ∑CG? This blocks every menu/top-bar/label across all milestones.
- NAMESPACE INCONSISTENCY across plans: M0/M1/M5 specify lib/substrata + components/substrata; M3/M4 use components/editor; M2/M7 use app/editor/_components + app/editor/lib. Unpinned, every later file path churns — must be decided before building any later-milestone files.
- Doc-model schema (M1-2) is load-bearing into M3/M5/M6 but undecided: group nesting depth, blendMode enumeration, bit-depth/colour location, default artboard dimensions.
- M0/M1 overlap is unreconciled: M0-3 and M1-1 both create the route/layout/canvas and both pin deps — without a reconciliation rule the agent duplicates or conflicts.
- M2-10 SELECT scope (which of marquee/lasso/magnet/flood/superflood ships) and destructive-ops-vs-extract-to-layer semantics are undefined and conflict with the non-destructive doc-model contract.
- M2-2 freehand library (perfect-freehand npm vs vendored tldraw fork) and M2-3 bundled-font licensing list are undecided.
- M3-5 Threshold/Posterize are mis-spec'd as Fabric built-ins (neither is); M3-7/M3-9 colour-balance/duotone models are open; M3-15 rasterize editability (frozen original vs re-edit-rebake) is under-specified; Fabric v7 custom-filter API must be verified against source, not training data.
- M4-8 active-colour-target resolution, M4-9 palette integration shape, and the §14 families-from-colour-names contradiction are all unresolved.
- M5-5 OPFS-vs-IDB size threshold and M5-12 snapshot retention/debounce (which overlaps M1 autosave) are tuning calls; browser-fs-access dep acceptance unconfirmed.
- M6-2 canonical 2026 preset dimensions, M6-6 @jsquash WASM static-export hosting strategy + dep add, M6-11 preset-resizes-artboard-vs-crop behaviour, and M6-13 batch scope are open.
- M7-1 model hosting (~115MB vs Cloudflare 25MiB/file), transformers v3->v4 breaking bump affecting the existing background-remover tool, BRIA->BiRefNet licensing migration, and M7-8 magic-resize reflow algorithm are all unresolved; the v4 bump is even flagged out-of-M0-scope yet required by M7.

### Full dependency-ordered execution sequence

```
M0-1 → M0-9 → M0-8 → M0-2 → M0-3 → M0-7 → M0-6 → M0-4 → M0-5 → M1-1 →
M1-2 → M1-7 → M1-3 → M1-4 → M1-8 → M1-5 → M1-6 → M1-9 → M1-10 → M2-1 →
M2-2 → M2-3 → M2-7 → M2-4 → M2-5 → M2-8 → M2-9 → M2-6 → M2-10 → M2-11 →
M2-12 → M2-13 → M3-1 → M3-2 → M3-3 → M3-4 → M3-11 → M3-5 → M3-6 → M3-7 →
M3-8 → M3-9 → M3-10 → M3-12 → M3-13 → M3-14 → M3-15 → M3-16 → M3-17 → M4-1 →
M4-2 → M4-3 → M4-4 → M4-5 → M4-6 → M4-7 → M4-8 → M4-9 → M4-10 → M5-1 →
M5-2 → M5-3 → M5-10 → M5-4 → M5-7 → M5-9 → M5-6 → M5-5 → M5-8 → M5-11 →
M5-12 → M5-13 → M5-14 → M5-15 → M6-1 → M6-6 → M6-2 → M6-3 → M6-4 → M6-5 →
M6-7 → M6-8 → M6-10 → M6-9 → M6-11 → M6-12 → M6-13 → M7-10 → M7-1 → M7-6 →
M7-2 → M7-3 → M7-4 → M7-5 → M7-7 → M7-8 → M7-9 → M7-11
```

---

## Milestones

### M0 — Scaffold (Substrata image editor)

Stand up the Substrata editor as a sidebar-free top-level route (app/editor/) inside the existing static-export Next 16 app: isolate it from the sidebar root layout, build the finalised §7 top bar and window shell per the mockup, pin fabric ^7.4.0 and add Dexie schema v1, add SSR-safe secure-context capability guards, and carve Substrata out of the parity contract in PARITY.md. No canvas/Fabric/effects logic yet (that is M1+); M0 produces a compiling, renderable skeleton that establishes every namespace, boundary, and convention the later milestones build on.

**Effort:** L — the scaffolding pieces are individually small, but the §7 top bar with four detailed menus is large, and M0-2 is a whole-app restructure with broad regression surface. Borderline XL if the top-bar menus are built to full mockup fidelity rather than presentational shells.

**Autonomy verdict:** Partly. The scaffolding half — deps (M0-1), Dexie schema (M0-8), capability guards (M0-7), the route/layout/shell plumbing (M0-3), and the PARITY carve-out (M0-9) — is mechanical and build/route-render verifiable, so an unattended agent can produce a green-building, renderable /editor skeleton by morning. The catch is two human gates that the build cannot prove: (1) M0-2 restructures the ENTIRE existing 56-page app to free /editor from the sidebar — an architectural choice (two root layouts vs bare-root+(site) group) whose regressions only show up in visual QA; and (2) the top bar + menus (M0-4/M0-5) and window shell (M0-6) are visual ports of the sketches whose fidelity is taste, and they collide with the unresolved ∑CG copy boundary. So: build it unattended, but do not consider M0 'done' until Ruby signs off on the restructure approach and the top-bar copy/visual, and runs slopsieve on the ∑CG gaps.

| Task | Title | Autonomy | Deps |
| --- | --- | --- | --- |
| M0-1 | Pin canvas + persistence deps and install | 🟢 safe | — |
| M0-2 | Isolate /editor from the sidebar root layout (route-group restructure) | 🔴 decision | — |
| M0-3 | Editor route shell: server layout + client page boundary | 🟢 safe | M0-2 |
| M0-4 | Finalised §7 top bar — chrome, centre, right cluster | 🟡 review | M0-3 |
| M0-5 | Top-bar menus: Scene / Edit / Workspace / Help (§7) | 🟡 review | M0-4 |
| M0-6 | Window shell — canvas area + dock placeholder regions | 🟡 review | M0-3 |
| M0-7 | Secure-context capability guards | 🟢 safe | M0-3 |
| M0-8 | Dexie schema v1 | 🟢 safe | M0-1 |
| M0-9 | PARITY.md non-parity carve-out for Substrata | 🟢 safe | — |

#### M0-1 · Pin canvas + persistence deps and install — 🟢 safe

- **Files:** `package.json`, `package-lock.json`
- **Deps:** —
- **Build:** Add to package.json dependencies: "fabric": "^7.4.0" (CVE-2026-27013 + CVE-2026-44311 both fixed only at 7.4.0) and "dexie": "^4.0.11" (declarative versioned migrations). Run npm install (node_modules is currently absent). Do NOT add fflate (M5), perfect-freehand (M2), or bump @huggingface/transformers ^3.8.1→^4.2 (M7) here — out of M0 scope and the transformers major bump is risky for the existing background-remover tool. Do NOT add any top-level (server-evaluated) import of fabric anywhere yet; fabric is ESM-heavy and only ever loaded via dynamic ssr:false in M1.
- **Done when:** npm install exits 0; `npm ls fabric dexie` reports fabric@7.4.x and dexie@4.x; `npm run build` is green (baseline 56 pages still emit).
- **Risk:** fabric v7 is ESM-first; an accidental non-dynamic import would break the static export. node_modules absent means the very first build gate also has to run install.

#### M0-2 · Isolate /editor from the sidebar root layout (route-group restructure) — 🔴 decision

- **Files:** `app/layout.tsx`, `app/(site)/layout.tsx`, `app/(site)/page.tsx`, `app/(site)/tools/[toolId]/page.tsx`, `app/not-found.tsx`
- **Deps:** —
- **Build:** Decide and implement how /editor escapes the sidebar. App Router has exactly one root layout (app/layout.tsx) and it currently hardcodes SidebarProvider/AppSidebar/AppHeader, so 'no sidebar' is impossible without restructuring. Two viable approaches, both requiring existing routes to move into a (site) group: (A) two real root layouts via route groups — app/(site)/layout.tsx (html/body+sidebar) and app/(editor)/layout.tsx (html/body, no sidebar), deleting the top-level app/layout.tsx (full reload on cross-group nav); or (B) keep app/layout.tsx as a BARE root (html, body, theme <script>, globals.css, ColourNotationProvider, SkipLink — no sidebar) and move the sidebar shell into a new app/(site)/layout.tsx wrapping the moved home + tools routes, with app/editor/ getting its own plain nested no-sidebar layout. Either way: move app/page.tsx → app/(site)/page.tsx and app/tools/ → app/(site)/tools/. Ruby picks A vs B.
- **Done when:** npm run build green and the existing page count is preserved; `/` and a sample `/tools/*` still render WITH the sidebar; a placeholder `/editor` renders WITHOUT the sidebar. Visual QA that no existing page regressed (skip-link, theme flash script, providers still wrap everything).
- **Risk:** Restructures the entire existing 56-page app; choice between two root layouts vs bare-root+(site) group has real reload/SEO/maintenance tradeoffs, and regressions across existing routes are only caught by visual QA, not the build.

#### M0-3 · Editor route shell: server layout + client page boundary — 🟢 safe

- **Files:** `app/editor/layout.tsx`, `app/editor/page.tsx`, `components/substrata/substrata-shell.tsx`
- **Deps:** M0-2
- **Build:** Create app/editor/layout.tsx as a Server Component that exports `metadata` (title etc.) and renders children full-viewport. Create app/editor/page.tsx with "use client" (required so M1 can use next/dynamic ssr:false, which Next 16 forbids in Server Components) that renders <SubstrataShell/>. Create components/substrata/substrata-shell.tsx (client) composing TopBar + WindowShell. IMPORTANT namespace note: lib/editor/ is already the ProseMirror text-editor tool — put all Substrata library code under lib/substrata/ and components under components/substrata/ (NOT components/tools/, Substrata is not a grid tool). Keep page.tsx free of any metadata export (it is a client component).
- **Done when:** npm run build green; out/editor/index.html (or out/editor.html) is emitted; navigating to /editor renders the shell with no sidebar; tsc clean.
- **Risk:** Client/server boundary mistakes (metadata in a client page, or a browser API evaluated during prerender) break the export.

#### M0-4 · Finalised §7 top bar — chrome, centre, right cluster — 🟡 review

- **Files:** `components/substrata/top-bar.tsx`
- **Deps:** M0-3
- **Build:** Build components/substrata/top-bar.tsx porting the mockup top bar (sketches/mockup.html lines 335-445), DESIGN.md language (square radius:0, hairline borders, iA Writer Quattro/font-mono, dense/flush). Left: delphitools logo (/delphi-lowlod.png) as a <Link href="/"> back-to-tools, the 'Substrata' wordmark, and the menubar container (menus themselves in M0-5). Centre: editable filename + local save-status indicator. Right: undo/redo buttons, zoom (− % + / fit), Export button, and the theme toggle reusing the existing components/theme-toggle.tsx. All actions are inert stubs/disabled in M0 (real undo/redo/zoom/export arrive in later milestones). Leave every spec-flagged user-facing string as a ∑CG gap with commented spec/sample: the save-status microcopy (mockup already shows the annotation at lines 430-432), the filename placeholder, and the 'Scene' file-noun. Do NOT author copy.
- **Done when:** Build green; /editor shows the three-zone top bar matching the mockup layout; logo navigates to /; theme toggle flips dark class. tsc clean.
- **Risk:** Visual fidelity to the sketches is a taste call. The ∑CG copy boundary is unresolved (see milestone risks): which chrome labels are gaps vs conventional verbs needs Ruby's confirmation.

#### M0-5 · Top-bar menus: Scene / Edit / Workspace / Help (§7) — 🟡 review

- **Files:** `components/substrata/menus/scene-menu.tsx`, `components/substrata/menus/edit-menu.tsx`, `components/substrata/menus/workspace-menu.tsx`, `components/substrata/menus/help-menu.tsx`
- **Deps:** M0-4
- **Build:** Build the four dropdown menus per §7 and the mockup (lines 339-424). Scene = two boxes (file menu: New scene/Open/Open recent/Import/Save/Save a copy/Export/Rename/Duplicate/Delete/Back to delphitools + a document-inspector box: dimensions/resolution/bit-depth/colour/layers/size/stored-local). Edit = big Undo/Redo + scrollable history list (current marked, redoable dimmed) + an ACXV keypad grid. Workspace = omnibar/rail position segments, per-module dock (L/R/Rail), zoom, rulers/grid/snap, theme. Help = shortcuts/about Substrata/about delphitools/source. Use a single click-to-open, one-at-a-time, click-outside-to-close mechanism (mockup pattern, or Radix Popover from components/ui/popover.tsx). All controls are presentational/no-op in M0 — the docking, history, and ACXV systems do not exist yet. Leave non-conventional strings + any onboarding as ∑CG; do not author copy.
- **Done when:** Build green; menus open one-at-a-time and close on outside click; each renders its §7/mockup contents; tsc clean.
- **Risk:** Large and easy to over/under-build because downstream systems (docking, history, ACXV) are absent — the right M0 depth (presentational shells) is a judgment call, plus the same ∑CG copy boundary.

#### M0-6 · Window shell — canvas area + dock placeholder regions — 🟡 review

- **Files:** `components/substrata/window-shell.tsx`
- **Deps:** M0-3
- **Build:** Build components/substrata/window-shell.tsx: a full-viewport flex column under the top bar (account for the global main wrapper's overflow-auto — Substrata wants a fixed 100dvh shell, not a scrolling page). A centred canvas region with a framed empty artboard placeholder (no Fabric yet — that is M1), and a dock region holding placeholder containers for the rail (above) and omnibar (below) per the mockup .app/.canvas/.artboard/.dock/.barrow structure (lines 447-461). Square/flush/hairline per DESIGN.md. The real omnibar/rail/modules are cross-cutting work in M1+; here they are inert placeholder boxes only.
- **Done when:** Build green; /editor fills the viewport with a canvas area + placeholder dock and no page scroll; tsc clean.
- **Risk:** Full-viewport sizing can fight the inherited main/overflow chrome; getting a stable 100dvh layout under static export is fiddly and visual.

#### M0-7 · Secure-context capability guards — 🟢 safe

- **Files:** `lib/substrata/capabilities.ts`, `components/substrata/secure-context-notice.tsx`
- **Deps:** M0-3
- **Build:** Create lib/substrata/capabilities.ts: pure, SSR-safe (typeof window guards) feature detection returning a typed Capabilities object — isSecureContext, crossOriginIsolated, WebGPU (navigator.gpu), OPFS (navigator.storage?.getDirectory), File System Access (window.showOpenFilePicker), Worker, crypto.subtle, WebGL2 (probe an offscreen canvas getContext('webgl2')), createImageBitmap. Add a degraded-state surface in the shell when !isSecureContext (e.g. opened over file://) so Workers/OPFS/FS-Access/crypto.subtle/WebGPU absence degrades gracefully rather than crashing. The banner's copy is a ∑CG gap (do not author). The detection module itself is the verifiable deliverable.
- **Done when:** tsc/build green; importing capabilities.ts during prerender does not crash (all access window-guarded); manual check: file:// shows the degraded notice, https/localhost shows normal shell.
- **Risk:** Per-browser false negatives in detection; the degraded-state UX/copy is ∑CG and needs human review, but the detection logic is build-verifiable.

#### M0-8 · Dexie schema v1 — 🟢 safe

- **Files:** `lib/substrata/db.ts`, `lib/substrata/types.ts`
- **Deps:** M0-1
- **Build:** Create lib/substrata/db.ts: a Dexie subclass SubstrataDB with version(1).stores({...}) per §9/§13 — projects (artboard + layer tree + effect stacks as JSON; indexes on updatedAt/name), blobs (content-addressed by sha256, ref-counted), handles (FS Access handles), snapshots (recovery). Add typed Table<> generics and a lazy client-only singleton (Dexie touches indexedDB; never instantiate at module eval during prerender — guard with typeof indexedDB / lazy getter). Create lib/substrata/types.ts with the doc-model interface stubs (Project, Layer, EffectStack, BlobRef) the stores reference. Migrations framework is established but v1 has no upgrade step; the rule from §13 is that future versions must never auto-migrate destructively.
- **Done when:** tsc/build green; in-browser the db opens at version 1 (a guarded one-off console/dev probe confirms db.open() resolves and the four stores exist); no indexedDB access during prerender.
- **Risk:** The exact store/index/field design ripples into M1 (autosave) and M5 (.substrata zip) and must be reviewed — getting v1 wrong is costly because migrations must stay non-destructive. indexedDB access at module eval would break the export if not lazily guarded.

#### M0-9 · PARITY.md non-parity carve-out for Substrata — 🟢 safe

- **Files:** `PARITY.md`
- **Deps:** —
- **Build:** Record Substrata as web-only / explicitly non-parity in PARITY.md, following the existing Base64 Image Encoder precedent (the 'Web-exclusive' bullet at line 30). Keep it factual — a list entry / table row noting it is the editor app carved out of the web/CLI/iOS parity contract. Do NOT author descriptive marketing prose; if any explanatory sentence is wanted, leave it as a ∑CG gap. Decide (with Ruby if unsure) whether it is a new short section or an append to the web-exclusive line.
- **Done when:** PARITY.md contains a factual Substrata web-only / non-parity entry; no build impact (doc-only).
- **Risk:** Copy-rule boundary: must stay factual (allowed) and not become user-facing prose; placement (section vs bullet) is a minor editorial call.

**Milestone risks**

- NAMESPACE COLLISION: lib/editor/ is already the ProseMirror text-editor tool — Substrata code must live under lib/substrata/ and components/substrata/, not lib/editor or components/tools. The route stays app/editor/ per spec.
- Escaping the sidebar requires a route-group restructure of the existing app (move app/page.tsx + app/tools/ into a (site) group); regressions across all existing pages are only caught by visual QA, not the build — Ruby must pick the approach and review.
- ∑CG COPY BOUNDARY is under-specified and conflicts with the mockup's real labels: the spec flags save-status, the 'Scene' file-noun, the history hint, picker names, and empty-state copy as ∑CG, but Ruby's global hard rule treats ALL button/menu/microcopy as copy. Need Ruby to confirm whether conventional chrome verbs (Undo/Open/Save/Export/Delete/Help) are exempt or also ∑CG before authoring the top bar.
- next/dynamic ssr:false is client-component-only in Next 16, so app/editor/page.tsx must be "use client" and metadata must live in app/editor/layout.tsx.
- fabric ^7.4.0 is ESM-first and must never be imported in a server-evaluated module under output:export — load only via dynamic ssr:false (M1). Adding the dep in M0 is safe as long as nothing imports it at build time.
- Dexie/IndexedDB and all capability probes must be lazily client-guarded — any access during prerender breaks the static export.
- Out of M0 scope but flag: @huggingface/transformers is ^3.8.1 while the spec wants ^4.2 for M7's BiRefNet path; the major bump touches the existing background-remover tool and should be planned separately.
- CLAUDE.md claims the tool registry is components/tools/index.tsx, but it actually lives in app/tools/[toolId]/page.tsx (toolComponents map) — irrelevant to Substrata (not a grid tool) but worth knowing during the M0-2 move.
- Entry point is unspecified: with the editor 'NOT in the tool grid' and domain/subdomain deferred, how a user reaches /editor is an open branding call (spec defers it) — no M0 task, but Ruby should be aware nothing links to it yet.
- node_modules is absent at the start, so the first build gate must npm install first.

---

### M1 — Canvas + layers (Substrata image editor)

Stand up the load-bearing core of Substrata: an imperative Fabric.js canvas whose single source of truth is an in-app document model (strict one-way doc→Fabric sync), an artboard with pan/zoom/fit, raster import via Upload/paste/drop with createImageBitmap downscale, the Layers module (per sketches/modals.html), the MOVE tool, command/patch undo/redo over the doc model, and debounced Dexie autosave with content-addressed blobs — plus the WebGL guard rails (textureSize clamp, context-loss fallback, preview-downscale scaffolding) wired in from day one. This is the foundation every later milestone (effects, colour, persist, export, smarts) stacks on, so the doc-model shape and the doc↔Fabric contract are the critical, expensive-to-change decisions here.

**Effort:** XL — this is the foundational milestone and effectively includes the un-built M0 scaffold. It spans a new full-viewport route, the first heavy imperative canvas integration in the repo (Fabric 7 under output:export/ssr:false), a bespoke immutable doc model + observable store, a one-way reconciler, a command/patch history with COW snapshots, Dexie persistence with content-addressed blobs, three-way raster import, the Layers UI matched to a detailed sketch, MOVE, and the WebGL guard rails — with most of it verifiable only by hand because there is no test harness.

**Autonomy verdict:** No — this milestone cannot safely run unattended to a trustworthy result. An agent CAN produce compiling, route-rendering code overnight (the scaffold M1-1, types M1-2, and the textureSize clamp M1-7 are genuinely self-verifiable), but the milestone's actual value lives in things a green build cannot prove: that the doc→Fabric reconciler renders faithfully (M1-3), that the Layers panel matches the sketch and drags well (M1-6), that MOVE feels right and its Fabric→doc write-back doesn't desync (M1-10), that undo/redo actually restores state across every op (M1-8), and that autosave round-trips and dedupes (M1-9). This repo has NO test suite, so 'it compiles + /editor renders' is the only automated gate and it is far too weak for a stateful canvas editor. Two hard catches make unattended execution worse: (1) M0 is not actually built — there is no app/editor route and neither fabric nor dexie is in package.json, so M1-1 has to silently absorb M0 scope or the whole milestone is blocked; and (2) the doc-model schema (M1-2) is a load-bearing decision that propagates into M3/M5/M6, so Ruby should sign it off before downstream code hardens. Verdict: let an agent scaffold and draft, but gate M1-3, M1-6, M1-8, M1-9, M1-10 on human review, and resolve the M0 gap + schema decision first.

| Task | Title | Autonomy | Deps |
| --- | --- | --- | --- |
| M1-1 | Editor route shell + Fabric/Dexie deps + canvas mount (client-only) | 🟢 safe | — |
| M1-2 | Document model types + observable doc store (single source of truth) | 🔴 decision | M1-1 |
| M1-3 | One-way doc→Fabric reconciler (Fabric never authoritative) | 🟡 review | M1-1, M1-2 |
| M1-4 | Artboard + viewport (pan / zoom / fit, instant open) | 🟡 review | M1-1 |
| M1-5 | Raster import — Upload / paste / drop with createImageBitmap downscale + clamp | 🟡 review | M1-2, M1-3, M1-7 |
| M1-6 | Layers module (panel) per sketches/modals.html | 🟡 review | M1-2, M1-3 |
| M1-7 | WebGL guard rails — textureSize clamp, context-loss fallback, preview-downscale scaffold | 🟢 safe | M1-1 |
| M1-8 | Undo/redo — command/patch history over the doc model | 🟡 review | M1-2 |
| M1-9 | Dexie schema v1 + content-addressed blobs + debounced autosave | 🟡 review | M1-2, M1-5, M1-8 |
| M1-10 | MOVE tool + minimal omnibar host + selection↔active-layer bridge | 🟡 review | M1-3, M1-6, M1-8 |

#### M1-1 · Editor route shell + Fabric/Dexie deps + canvas mount (client-only) — 🟢 safe

- **Files:** `package.json`, `app/editor/layout.tsx`, `app/editor/page.tsx`, `components/substrata/canvas-stage.tsx`, `components/substrata/fabric-canvas.tsx`
- **Deps:** —
- **Build:** Bootstraps the M0 foundation that is not present yet. Install fabric@^7.4.0 (pinned per §5 CVE-2026-44311) and dexie; confirm Fabric v7 ships its own TS types (no @types/fabric needed) — if not, add the type shim. Create app/editor/layout.tsx as an OWN root layout (full viewport, NO sidebar/SidebarProvider, no per-tool max-w chrome) and app/editor/page.tsx as a thin client entry that dynamic()-imports the canvas with ssr:false (Fabric must never run on the server under output:export). Create components/substrata/canvas-stage.tsx (the ssr:false wrapper) and components/substrata/fabric-canvas.tsx which mounts a fabric.Canvas on a <canvas> ref inside a useEffect, disposes on unmount, and draws nothing but a placeholder fill. Use the lib/substrata + components/substrata namespace throughout to avoid collision with the existing ProseMirror lib/editor. NOTE: this overlaps M0 — if M0 lands first, reconcile rather than duplicate the route/layout/pins.
- **Done when:** npm run build succeeds (static export, route /editor prerendered); npm run dev → /editor renders the canvas surface with no sidebar; grep confirms fabric is only imported under an ssr:false dynamic boundary (no server import).
- **Risk:** M0 (route shell, top bar, fabric/dexie pins, secure-context guards) is not built — this task quietly absorbs M0 scope. Fabric 7 is the first heavy imperative ESM lib in this repo; its interaction with Next 16 output:export/React 19 is unverified and could surface bundling/hydration issues.

#### M1-2 · Document model types + observable doc store (single source of truth) — 🔴 decision

- **Files:** `lib/substrata/doc-model.ts`, `lib/substrata/doc-store.ts`
- **Deps:** M1-1
- **Build:** Define the canonical doc model in lib/substrata/doc-model.ts: SubstrataDoc { id, artboard{width,height,resolution,bitDepth,colourMode,background}, layers: Layer[] }; a Layer discriminated union (raster|text|shape|group) with shared fields (id, name, visible, locked, opacity, blendMode (globalCompositeOperation), transform{x,y,scaleX,scaleY,angle,flipX,flipY}, shadow|null, effects: Effect[] (typed but empty in M1)); raster layers carry blobHash + naturalWidth/Height + a reference to the original; group layers carry children[]. Build lib/substrata/doc-store.ts as a tiny observable store exposing getSnapshot/subscribe (React 19 useSyncExternalStore — no new state dep) plus pure action creators that return new immutable doc states (every mutation will be routed through history in M1-8). This shape is load-bearing for M3 effects, M5 .substrata schema, and M6 export, so design it deliberately.
- **Done when:** tsc/npm run build clean with the types exported and consumed by a trivial selector; doc-store subscribe/getSnapshot wired into fabric-canvas via useSyncExternalStore without re-render thrash.
- **Risk:** The schema is the single most expensive thing to get wrong (it propagates into Dexie persistence, the .substrata zip manifest, the effects stack, and export). Group nesting depth, blendMode enumeration, and where bit-depth/colour live are open calls Ruby should sign off before downstream code hardens against them.

#### M1-3 · One-way doc→Fabric reconciler (Fabric never authoritative) — 🟡 review

- **Files:** `lib/substrata/sync.ts`, `components/substrata/fabric-canvas.tsx`
- **Deps:** M1-1, M1-2
- **Build:** Build lib/substrata/sync.ts: a reconciler that diffs the doc model against the live Fabric scene and creates/updates/removes Fabric objects to match — strict one-way, doc is truth (§5, §12). Stamp each Fabric object with its layer id; map id↔object; apply transform, opacity, visible, blendMode→globalCompositeOperation, shadow→fabric.Shadow, and z-order from layer order; recurse groups into fabric.Group. Diff to avoid full-scene rebuilds (only touch changed layers; the active layer is the dirty one). Subscribe the reconciler to the doc store so any doc change re-syncs. Add requestRenderAll coalescing via rAF.
- **Done when:** npm run build clean; in /editor, mutating the doc (toggle a layer's visibility/opacity, reorder) updates the canvas; z-order on screen matches layer order in the model. Visual fidelity (transforms, blend, shadow) requires Ruby's eye since there is no test suite.
- **Risk:** Two-model desync (§12) if any code path mutates Fabric directly instead of via the doc model. Blend-mode and shadow mapping fidelity can silently diverge from intent and only a human will notice.

#### M1-4 · Artboard + viewport (pan / zoom / fit, instant open) — 🟡 review

- **Files:** `lib/substrata/artboard.ts`, `components/substrata/fabric-canvas.tsx`, `components/substrata/viewport-controls.tsx`
- **Deps:** M1-1
- **Build:** lib/substrata/artboard.ts: render the artboard rectangle (the future export/clip region) with its background, sized from doc.artboard, opening instantly to a usable canvas with a sensible default preset — no wizard, no template wall (§6). Viewport controls in fabric-canvas.tsx: zoom (−/%/+), fit-to-viewport, scroll/space-drag pan, zoom-to-cursor; expose a small zoom control component to be hosted by the top bar later. Keep viewport state out of the doc model (it is not document truth).
- **Done when:** npm run build clean; artboard is visible and centred; fit recentres/rescales to the viewport; zoom in/out and pan work. Default artboard dimensions and zoom feel are a judgment call.
- **Risk:** Default artboard preset/dimensions is an unspecified product decision (§6 says preset-or-custom but names no default). Pan/zoom ergonomics are taste.

#### M1-5 · Raster import — Upload / paste / drop with createImageBitmap downscale + clamp — 🟡 review

- **Files:** `lib/substrata/import-raster.ts`, `components/substrata/canvas-stage.tsx`, `hooks/use-file-paste.ts`
- **Deps:** M1-2, M1-3, M1-7
- **Build:** lib/substrata/import-raster.ts: decode incoming files via createImageBitmap (pattern already in qr-generator.tsx), then downscale-on-import to fit the artboard AND clamp the working raster to min(CAP, gl.MAX_TEXTURE_SIZE) from M1-7 — this is the #1 must-do guard against Fabric #6805 (oversize sources silently render ~30% of pixels, no throw). Keep the original by reference (store the source blob for the blob layer in M1-9). Wire three entry points: an Upload button (Layers footer primary + a top-bar Import action), paste (reuse hooks/use-file-paste.ts), and drag-drop onto the canvas-stage. Each import appends a raster Layer to the doc model (object-making = layer-making, §6) → reconciler renders it.
- **Done when:** npm run build clean; uploading, pasting, and dropping an image each create a layer that appears on the artboard; a deliberately oversize (>8k) source renders fully (not clipped to ~30%) proving the clamp. Placement/scale correctness is visual.
- **Risk:** createImageBitmap orientation/colour-profile handling and downscale quality vary by browser; Safari quirks. Drop-target hit area and paste focus semantics need manual checking.

#### M1-6 · Layers module (panel) per sketches/modals.html — 🟡 review

- **Files:** `components/substrata/modules/layers-panel.tsx`, `components/substrata/modules/layer-row.tsx`, `lib/substrata/doc-store.ts`
- **Deps:** M1-2, M1-3
- **Build:** Build the Layers panel in DESIGN.md language (flush, hairline, square, segmented, British spelling) reproducing sketches/modals.html: list rows with thumbnail, name, eye-on-hover visibility, lock, candy-stripe for hidden rows, tree-elbow group nesting, active-layer arrow marker; footer with the 'Blend [select] at [opacity]' row and the Upload primary flanked by group/duplicate/toss icon buttons. Drag-reorder via @dnd-kit (already a dep) writing order back into the doc model. All actions (reorder, toggleVisible, toggleLock, rename, setOpacity, setBlend, group, duplicate, delete) are doc-store actions only (one-way to Fabric via M1-3). NO user-facing copy: every visible label, tooltip, and icon-button aria-label is a ∑CG gap with commented spec/sample; layer names and standard blend-mode terms (Normal/Multiply/…) are data/technical, not copy. Render the panel in a simple fixed dock for M1 — the full omnibar/rail docking system is cross-cutting/later.
- **Done when:** npm run build clean; panel renders the layer tree; toggling visibility/opacity/blend and drag-reordering update the canvas via the doc model; structure matches the sketch. Pixel-match to modals.html and drag feel are Ruby's call. slopsieve --list shows the ∑CG gaps.
- **Risk:** Group semantics (depth, drag into/out of groups) are under-specified. Tree-elbow + candy-stripe + eye-on-hover are fiddly to match exactly. Copy must be left as ∑CG, not authored.

#### M1-7 · WebGL guard rails — textureSize clamp, context-loss fallback, preview-downscale scaffold — 🟢 safe

- **Files:** `lib/substrata/webgl-limits.ts`, `lib/substrata/filter-backend.ts`, `components/substrata/fabric-canvas.tsx`
- **Deps:** M1-1
- **Build:** lib/substrata/webgl-limits.ts: read gl.MAX_TEXTURE_SIZE once, expose a CAP and a clamp() used by import (M1-5). lib/substrata/filter-backend.ts: at Fabric WebGL filter-backend init set config.textureSize = min(CAP, gl.MAX_TEXTURE_SIZE) (§5 #1 must-do); attach a webglcontextlost listener that flips to the Canvas2D filter backend. Add a preview-downscale scaffold (build a ~1–2MP fit-to-viewport proxy + an rAF-coalesced applyFilters hook stub) so M3 effects drop in without re-architecting — no actual filters run in M1. Guard everything on a secure-context check so file:// degrades gracefully (§5 static-export plumbing).
- **Done when:** npm run build clean; on canvas init the effective textureSize logs as ≤ gl.MAX_TEXTURE_SIZE; a webglcontextlost listener is attached and the backend swaps without crashing. The clamp is mechanically verifiable.
- **Risk:** The preview-downscale loop is partly speculative without real effects (M3) and may need rework once filters exist. Forcing the WebGL backend on init must not regress plain rendering on GPUs that report a low MAX_TEXTURE_SIZE.

#### M1-8 · Undo/redo — command/patch history over the doc model — 🟡 review

- **Files:** `lib/substrata/history.ts`, `lib/substrata/doc-store.ts`, `hooks/use-editor-shortcuts.ts`
- **Deps:** M1-2
- **Build:** lib/substrata/history.ts: a command/patch history where every doc mutation produces a forward + inverse patch (or a do/undo command), stored in a ring buffer (50–100 per §9). Route ALL doc-store actions through it. Use content-addressed copy-on-write for raster snapshots (structural edits = JSON patches; pixel edits reference a blob hash) and NEVER serialize Fabric JSON (§4/§5). Provide a coalesce window API for future slider drags (no-op target in M1). Wire to keyboard (Cmd/Ctrl+Z, Cmd/Ctrl+Shift+Z) via a useEditorShortcuts hook and expose undo/redo handlers for the top bar.
- **Done when:** npm run build clean; performing an op (import, reorder, transform, visibility) then Cmd+Z restores the exact prior doc state and redo re-applies; buffer caps at the limit. Correctness across every op type must be manually verified (no test suite).
- **Risk:** Patch/inverse correctness is subtle and there is no automated test to catch a bad inverse — a wrong patch silently corrupts state on undo. COW snapshot granularity vs memory is a tuning call.

#### M1-9 · Dexie schema v1 + content-addressed blobs + debounced autosave — 🟡 review

- **Files:** `lib/substrata/db.ts`, `lib/substrata/blobs.ts`, `lib/substrata/autosave.ts`, `lib/substrata/doc-store.ts`
- **Deps:** M1-2, M1-5, M1-8
- **Build:** lib/substrata/db.ts: declare the Dexie database with versioned migrations from day one (§13) and stores: projects (doc JSON), blobs (content-addressed by SHA-256, ref-counted), handles, snapshots (recovery). lib/substrata/blobs.ts: hash via crypto.subtle.digest (guard secure context), put-with-dedupe by hash, get, and ref-count GC. lib/substrata/autosave.ts: debounced transactional write of the active doc + its referenced blobs, subscribed to the doc store. OPFS for large rasters can be stubbed behind an interface and deferred to M5; the blob store and autosave land now. Never claim 'crash-proof'; surface state via the model only (save-status copy is M0/§7).
- **Done when:** npm run build clean; editing then reloading /editor restores the doc from IndexedDB; importing the same image twice stores one blob (dedupe visible in the IndexedDB inspector). Round-trip correctness is manual.
- **Risk:** Schema/migration shape overlaps M0 and must match the eventual .substrata manifest (M5) and export (M6). crypto.subtle/OPFS need a secure context — file:// must degrade. Autosave write amplification and ref-count GC edge cases (orphan blobs) need care.

#### M1-10 · MOVE tool + minimal omnibar host + selection↔active-layer bridge — 🟡 review

- **Files:** `components/substrata/omnibar/omnibar.tsx`, `components/substrata/tools/move-tool.ts`, `components/substrata/fabric-canvas.tsx`, `lib/substrata/sync.ts`
- **Deps:** M1-3, M1-6, M1-8
- **Build:** Implement MOVE (V) as the sole active tool in M1: enable Fabric selection/move/scale/rotate on the active layer. The one controlled Fabric→doc path lives here — on object:modified, translate the Fabric transform into a doc-store action (a command in history), then let the reconciler re-sync; the doc stays authoritative, the event is just an input. Bridge selection both ways for UX (canvas selection highlights the active layer in the Layers panel and vice versa) without making Fabric the truth. Add a minimal omnibar shell (components/substrata/omnibar/omnibar.tsx) hosting the TOOLS stack with MOVE selected (per sketches/mockup.html lines ~461–471); the full fan-out/rail-docking omnibar is cross-cutting/later. Crop (listed under MOVE in §8) is deferred — scope MOVE to move/transform/rotate for M1. Tooltips/aria-labels in the omnibar are ∑CG gaps.
- **Done when:** npm run build clean; selecting a layer shows transform handles; drag/scale/rotate updates the doc model and survives an undo and an autosave reload round-trip; canvas selection and Layers-panel active row stay in sync. Transform feel is a judgment call.
- **Risk:** The object:modified→doc commit is the exact seam where two-model desync (§12) creeps in if re-sync and history aren't ordered correctly. Transform precision (sub-pixel, rotation origin) can drift between Fabric and the model.

**Milestone risks**

- M0 is not built: no app/editor/ route or own root layout, and fabric/dexie are absent from package.json (transformers is also pinned ^3.8.1, not the spec's ^4.2). M1 either depends on M0 landing first or M1-1 must bootstrap it.
- Namespace collision: lib/editor/ already exists as the ProseMirror markdown-editor tool. Substrata code must live under lib/substrata/ and components/substrata/ to avoid confusion — this plan assumes that convention.
- The strict one-way doc→Fabric contract vs unavoidable interactive transforms: object:modified write-back (M1-10) is the exact seam where the two-model desync residual risk (§12) appears if re-sync/history ordering is wrong.
- No automated test suite: undo/redo patch correctness (M1-8) and autosave round-trip/dedup (M1-9) cannot be gated by build/lint — a bad inverse patch or orphaned blob fails silently and only manual verification catches it.
- Fabric 7 is the repo's first heavy imperative ESM lib; its behaviour under Next 16 output:export + React 19 + ssr:false is unverified (no existing canvas tool to copy from).
- The doc-model schema (M1-2) is load-bearing across M3 effects, M5 .substrata manifest, and M6 export; changing it later is expensive, so it needs Ruby's sign-off up front. Group nesting depth and default artboard dimensions are under-specified in the spec.
- Secure-context dependencies (crypto.subtle for blob hashing, OPFS, WebGL) must degrade gracefully on file://; only https/localhost work in real use (§5).
- Copy discipline: all visible labels/tooltips/aria-labels in the Layers panel, omnibar, and import empty-state must be left as ∑CG gaps (commented spec/sample) and filled later via slopsieve — none authored during the build.

---

### M2 — Make: TEXT, PIECES (shapes + basic Pen + perfect-freehand), SELECT, Inspector, snapping

M2 turns the M0/M1 viewer-with-rasters into an authoring tool: it adds the three creation tools (TEXT, PIECES, SELECT) plus the per-object Inspector and snapping. Everything hangs off two foundations that M2 must first lay: (a) extending the M1 doc model (the single source of truth, §5) with vector/text layer variants + a non-destructive Dexie migration, and (b) a FontFace registry that gates every measure/render on document.fonts.ready (§5 Text hard requirement). On top of that go in-canvas IText/Textbox editing with strict one-way doc→Fabric sync, the five PIECES shapes + a basic Pen state machine + perfect-freehand pressure pencil (raw points persisted, not Fabric JSON), a transient (non-mask) selection model, the pinnable Inspector module, and a smart-guide/grid snapping engine wired to Workspace ▸ Guides. NOTE: Substrata is currently un-scaffolded on the delphitools-editor branch (no fabric/dexie/perfect-freehand installed; lib/editor is the unrelated ProseMirror tool), so this plan assumes M0/M1 will have delivered the app/editor route, the Fabric canvas controller (dynamic ssr:false), the omnibar+rail shell, command/patch history, and Dexie v1. Engine code is namespaced under lib/substrata/ and route-private UI under app/editor/_components/ to avoid the lib/editor collision — confirm the actual M0/M1 layout before building.

**Effort:** XL — it is the broadest 'make' milestone: a text engine (FontFace gating + in-canvas IText/Textbox + per-range styles + on-path), five shape types, a Pen state machine, pressure freehand, a transient selection subsystem (with CV-grade magnet/flood), the Inspector, and a snapping engine are largely independent subsystems, each with its own interaction-correctness surface and no automated tests to lean on.

**Autonomy verdict:** No — not as a finished milestone. An unattended agent CAN land a compiling skeleton overnight: M2-1 (doc model + Dexie migration), M2-2 helpers, M2-3 font loader, M2-11 inspector binding, M2-12 snap math, and M2-13 wiring are all build/lint/route-render verifiable, and the rest can be stubbed to compile. But the bulk of M2 is interaction correctness that only COMPILES, it doesn't prove itself — text-editing feel and sync timing (M2-4/5), pen state machine (M2-8), pressure freehand cross-browser (M2-9), snap thresholds (M2-12) all need Ruby's eyes, and this repo has NO test suite so 'npm run build + the /editor route renders' is the only automated gate (it catches type/JSX breakage, nothing about whether the pen actually draws). Three items are hard blocks needing a Ruby decision before they can be 'done': SELECT scope + the destructive-vs-extract-to-layer semantics (M2-10), which content fonts to bundle (M2-3), and perfect-freehand-npm-vs-vendored-tldraw-fork (M2-2). The catch: this whole plan also presumes M0/M1 already shipped the app/editor route, the Fabric ssr:false canvas controller, the omnibar/rail shell, command/patch history, and Dexie v1 — if M1 isn't done, M2 cannot start.

| Task | Title | Autonomy | Deps |
| --- | --- | --- | --- |
| M2-1 | Extend doc model + Dexie schema for text/shape/path/freehand layers | 🟢 safe | — |
| M2-2 | Add freehand/pen geometry deps + pure helpers (perfect-freehand vs tldraw fork) | 🔴 decision | M2-1 |
| M2-3 | Font infrastructure — FontFace loader, fonts.ready gating, registry, local upload | 🟡 review | M2-1 |
| M2-4 | TEXT tool — create + in-canvas IText/Textbox editing with one-way doc→Fabric sync | 🟡 review | M2-1, M2-3 |
| M2-5 | TEXT contextual settings panel + per-range styles | 🟡 review | M2-4 |
| M2-6 | Text-on-path (decorative-grade) | 🔴 decision | M2-4, M2-8 |
| M2-7 | PIECES shapes — rect/ellipse/line/polygon/star + fill/stroke/opacity | 🟡 review | M2-1 |
| M2-8 | PIECES Pen — basic anchor/handle authoring → fabric.Path | 🟡 review | M2-2, M2-7 |
| M2-9 | PIECES Pencil — perfect-freehand pressure + PencilBrush fallback | 🟡 review | M2-2, M2-7 |
| M2-10 | SELECT tool — transient selection regions + region ops | 🔴 decision | M2-1 |
| M2-11 | Inspector module | 🟡 review | M2-1 |
| M2-12 | Snapping engine + smart guides + grid snap | 🟡 review | M2-1 |
| M2-13 | Wire contextual-settings routing + tool keymap + M2 integration gate | 🟢 safe | M2-4, M2-5, M2-7, M2-8, M2-9, M2-10, M2-11, M2-12 |

#### M2-1 · Extend doc model + Dexie schema for text/shape/path/freehand layers — 🟢 safe

- **Files:** `lib/substrata/doc/types.ts`, `lib/substrata/doc/factories.ts`, `lib/substrata/doc/patches.ts`, `lib/substrata/db.ts`, `lib/substrata/doc/manifest.ts`
- **Deps:** —
- **Build:** Extend the M1 doc model with discriminated-union layer variants beyond raster: TextLayer (mode point|area; text; fontFamily/size/weight/style; align incl justify; lineHeight; charSpacing object-level; fill; stroke; decorations under/over/strike; baseline; direction RTL/LTR; per-range styles stored as serialisable {start,end,style} deltas — NEVER Fabric JSON per §5; optional onPath ref; dropShadow). ShapeLayer (kind rect|ellipse|line|polygon|star + params cornerRadius/rx/ry/points/sides/innerRadius; fill = solid hex | gradient {type,stops,coords}; stroke {colour,width,dash}; opacity). PathLayer (anchors[{x,y,inX,inY,outX,outY}], closed). FreehandLayer (rawPoints:[x,y,pressure][], strokeOptions, fill). Add patch builders (create/update/transform) reusing M1's command/patch shape. Bump Dexie v1→v2 with a declarative non-destructive migration and bump the .substrata manifest schemaVersion guard (no destructive auto-migrate, §13).
- **Done when:** npm run build passes (TS strict, output:export); the Dexie version(2).stores()/upgrade migration compiles and opens in dev without throwing; layer factories type-check exhaustively against the union (switch with no default still compiles).
- **Risk:** Per-range text-style representation must round-trip cleanly to/from Fabric styles without ever persisting Fabric JSON; union must stay exhaustive so downstream sync code is type-safe.

#### M2-2 · Add freehand/pen geometry deps + pure helpers (perfect-freehand vs tldraw fork) — 🔴 decision

- **Files:** `package.json`, `lib/substrata/pieces/freehand.ts`, `lib/substrata/pieces/pen-path.ts`, `lib/substrata/pieces/vendor/perfect-freehand/`
- **Deps:** M2-1
- **Build:** Add perfect-freehand ^1.2 to package.json OR vendor tldraw's MIT fork (§5 explicitly says 'consider vendoring' — open call). Build pure, DOM-free helpers: a getStroke wrapper that turns raw [x,y,pressure] + options into an SVG path-d string; a pen-path serialiser converting PathLayer anchors/handles to a fabric.Path d-string and back; a catmull/bezier flatten util for hit-testing. No Fabric/React imports here so they stay unit-smoke-able.
- **Done when:** dep installs and npm run build passes; helpers are exported and type-check; a dev-only console smoke turns sample points into a non-empty path-d and round-trips PathLayer→d→PathLayer.
- **Risk:** Upstream perfect-freehand is low-maintenance with a known 'hot elbows' artifact; vendoring the tldraw fork adds maintenance surface — Ruby picks which.

#### M2-3 · Font infrastructure — FontFace loader, fonts.ready gating, registry, local upload — 🟡 review

- **Files:** `lib/substrata/fonts/registry.ts`, `lib/substrata/fonts/load-font.ts`, `hooks/use-fonts-ready.ts`, `app/editor/_components/font-picker.tsx`, `public/fonts/substrata/.gitkeep`
- **Deps:** M2-1
- **Build:** Build lib/substrata/fonts: a registry merging the system stack + a bundled woff2 set + user-uploaded local fonts. loadFont() uses native FontFace + per-face .load(); expose a useFontsReady hook and an ensureFonts(usedFamilies) gate so EVERY measure/render/export path can await document.fonts.ready (§5 Text). User-uploaded fonts: File → ArrayBuffer → FontFace → document.fonts.add, persisted as a content-hashed blob in Dexie so it survives reload and NEVER leaves the browser. Bundled woff2 live in public/fonts/substrata/. WHICH faces to bundle is a licensing decision — leave a ∑CG-marked manifest stub, do not author the list. Font-family picker UI for the TEXT settings panel.
- **Done when:** npm run build passes; in dev, uploading a local .woff2/.ttf adds it to the registry and a text layer renders in it after fonts.ready resolves; reload restores the uploaded font from Dexie and re-registers the FontFace.
- **Risk:** A single missing fonts.ready gate causes silent mis-measure/blank glyphs on first paint or export (hard req §5); the bundled-font set is a Ruby licensing decision (flagged separately).

#### M2-4 · TEXT tool — create + in-canvas IText/Textbox editing with one-way doc→Fabric sync — 🟡 review

- **Files:** `app/editor/_components/tools/text-tool.ts`, `lib/substrata/fabric/text-sync.ts`, `app/editor/_components/omnibar/tool-text.tsx`, `lib/substrata/fabric/canvas-controller.ts`
- **Deps:** M2-1, M2-3
- **Build:** Add the omnibar TEXT (T) tool stack with subtools point (IText) / area (Textbox) / on-path. Click-to-place point text; drag-to-create area text; enter Fabric's native in-canvas edit mode. Strict ONE-WAY doc→Fabric render; the ONLY write-back is commit-on-blur/edit-end, which patches content+geometry into the doc model (Fabric is never the authority, §5). Gate initial render on fonts.ready (M2-3). Each new text object = a new TextLayer (object-making = layer-making, §6) appearing in the M1 Layers module. Plug into the M1 dynamic ssr:false canvas controller.
- **Done when:** /editor renders; pressing T then clicking the canvas creates an editable text layer that shows in Layers; typing then clicking away persists the text into the doc model (verify via an undo/redo round-trip restoring the exact string); npm run build passes.
- **Risk:** Two-model desync (§12) if commit-on-blur isn't the strictly-only write-back path; IME/composition and empty-text-deletes-layer edge cases.

#### M2-5 · TEXT contextual settings panel + per-range styles — 🟡 review

- **Files:** `app/editor/_components/settings/text-settings.tsx`, `lib/substrata/fabric/text-sync.ts`, `lib/substrata/doc/patches.ts`
- **Deps:** M2-4
- **Build:** Populate the omnibar centre settings zone when TEXT is active: font family (M2-3 picker), size, weight, style (italic), align incl justify, line-height, char-spacing (object-level), fill, stroke, under/over/strike, baseline, RTL toggle, drop shadow. Edits commit to the active TextLayer via patches and re-sync to Fabric. Per-range styles: when a sub-range is selected in edit mode, store {start,end,style} deltas in the doc model and rebuild Fabric's styles object on sync. Fill/stroke use a basic colour input now with a clean seam for the M4 colour picker. DESIGN.md flush/segmented styling; British spelling; any user-facing string is a ∑CG gap — author none.
- **Done when:** npm run build + npm run lint clean (no new errors); changing each control updates the selected text live and survives undo/redo; selecting a char range and bolding it stores a range delta that reapplies on reselect.
- **Risk:** Per-range style round-trip complexity; the temporary fill UI is a seam until the M4 picker lands.

#### M2-6 · Text-on-path (decorative-grade) — 🔴 decision

- **Files:** `lib/substrata/fabric/text-on-path.ts`, `app/editor/_components/tools/text-tool.ts`
- **Deps:** M2-4, M2-8
- **Build:** on-path subtool: bind a TextLayer to a PathLayer/shape so glyphs lay along the curve, decorative-grade per §9 (NOT pro justified path text — that's deferred §10/§13). Fabric has no native path text, so sample the path and position per-glyph manually, re-running after fonts.ready. Store the path ref + start offset on the TextLayer. Keep tightly scoped: this is the first thing to cut if it threatens the milestone.
- **Done when:** npm run build passes; in dev a text layer follows a drawn path and re-flows when the path is edited; degrades cleanly if no path is selected.
- **Risk:** Whether this belongs in M2 at all and the acceptable quality bar are Ruby's calls; glyph metrics + RTL + per-range styles on a curve overrun easily.

#### M2-7 · PIECES shapes — rect/ellipse/line/polygon/star + fill/stroke/opacity — 🟡 review

- **Files:** `app/editor/_components/tools/shape-tool.ts`, `lib/substrata/fabric/shape-sync.ts`, `app/editor/_components/settings/shape-settings.tsx`, `app/editor/_components/omnibar/tool-pieces.tsx`
- **Deps:** M2-1
- **Build:** Add the omnibar PIECES (P) tool with the shape subtool + a shape chooser. Drag-to-draw: rectangle (corner radius), ellipse/circle (shift = circle), line (45° snap), polygon (n-gon with a sides control), star (computed points → fabric.Polygon per §9). Each new shape = a ShapeLayer; one-way doc→Fabric. PIECES contextual settings centre: fill (solid + gradient via fabric.Gradient), stroke (colour/width/dash), opacity, and shape-specific params (corner radius / sides / inner radius). Colour + gradient UI is basic pending M4.
- **Done when:** /editor renders; each of the 5 shapes can be drawn and appears as a layer; changing fill/stroke/params updates live and round-trips through undo/redo; npm run build passes.
- **Risk:** Gradient editing UX before the M4 picker exists; star/polygon point math and fidelity under non-uniform resize.

#### M2-8 · PIECES Pen — basic anchor/handle authoring → fabric.Path — 🟡 review

- **Files:** `app/editor/_components/tools/pen-tool.ts`, `lib/substrata/pieces/pen-path.ts`, `lib/substrata/fabric/shape-sync.ts`
- **Deps:** M2-2, M2-7
- **Build:** pen subtool state machine: click adds an anchor; click-drag pulls symmetric bezier handles; clicking the first anchor (or Enter) closes; Esc finishes an open path. Live preview drawn on the upper canvas; on finish, serialise anchors/handles to a PathLayer (M2-2 pen-path helper) and render a fabric.Path. BASIC authoring only — the full re-entrant bezier node editor is explicitly v1.1 (§10), do not build node select/move/add/delete. Fill/stroke come from the PIECES settings panel.
- **Done when:** npm run build passes; in dev a multi-anchor path with curved handles can be drawn, closed, and re-rendered identically from the stored PathLayer (undo/redo round-trips the path geometry).
- **Risk:** Pointer state-machine bugs (handle-drag vs new-anchor, double-click close); scope-creeping into a node editor.

#### M2-9 · PIECES Pencil — perfect-freehand pressure + PencilBrush fallback — 🟡 review

- **Files:** `app/editor/_components/tools/pencil-tool.ts`, `lib/substrata/pieces/freehand.ts`, `lib/substrata/fabric/shape-sync.ts`
- **Deps:** M2-2, M2-7
- **Build:** pencil subtool: capture pointer input via getCoalescedEvents(); use real e.pressure ONLY when pointerType==='pen', else simulatePressure=true; ignore Firefox's pointerup pressure===0; build the outline with the M2-2 getStroke wrapper. Persist raw [x,y,pressure] + stroke options to a FreehandLayer — the committed fabric.Path is a render artifact only (§5 Pieces). Provide a simple Fabric PencilBrush fallback path. On load/undo, rebuild the fabric.Path from the raw points, never from Fabric JSON.
- **Done when:** npm run build passes; freehand drawing produces a smooth pressure-varying stroke; reload/undo rebuilds the identical stroke from stored raw points (confirm the doc model holds rawPoints, not a serialised Fabric object).
- **Risk:** Cross-browser pointer/pressure quirks (Firefox pointerup-0, coalesced events, pen vs mouse); the 'hot elbows' artifact from upstream perfect-freehand.

#### M2-10 · SELECT tool — transient selection regions + region ops — 🔴 decision

- **Files:** `lib/substrata/select/region.ts`, `lib/substrata/select/ops.ts`, `app/editor/_components/tools/select-tool.ts`, `app/editor/_components/omnibar/tool-select.tsx`
- **Deps:** M2-1
- **Build:** Add the omnibar SELECT (M) tool with subtools marquee / lasso / magnet / flood / superflood. Build a TRANSIENT selection-region model — explicitly not a persistent mask/clip (§6, §11 non-goals). Land rectangular marquee + freehand lasso first; flood (colour-threshold select) next; magnet (edge-snapping lasso) and superflood are the hard CV pieces. Region ops: move / delete / fill / copy the selected pixels of the active raster layer. OPEN CALL: pixel move/delete is destructive to a raster and fights the non-destructive / doc-model-owns-truth contract — it must either be captured as a content-addressed COW snapshot in M1 history, OR be scoped to 'extract selection to a new layer'. The magnet/superflood cut-line within M2 and the destructive-vs-extract semantics are Ruby's to set.
- **Done when:** npm run build passes; marquee + lasso produce a marching-ants region; delete/fill/copy act on the region and round-trip through undo; magnet/superflood are either implemented or explicitly stubbed per the agreed cut-line (no silent no-op).
- **Risk:** Biggest scope risk in M2 — §8 lists magnet/superflood but §9 gives SELECT no detail; magnetic-lasso/flood are real CV work, and destructive region ops conflict with the non-destructive principle and doc-model authority.

#### M2-11 · Inspector module — 🟡 review

- **Files:** `app/editor/_components/modules/inspector.tsx`, `lib/substrata/doc/selection.ts`, `lib/substrata/doc/patches.ts`
- **Deps:** M2-1
- **Build:** Build the pinnable PANELS module (data-id='inspector') matching the mockup (sketches/mockup.html ~L513-522): a seg-grid X/Y/W/H + rotation, an opacity slider, and type-specific props (text: font/size; shape: fill/stroke/params; path/freehand: stroke). It reads the active selection from the doc model; field edits commit via patches and re-sync to Fabric live; it reflects no-selection and multi-selection states. DESIGN.md flush/segmented styling (seg-grid, hairlines, square). Any user-facing label that is copy stays a ∑CG gap.
- **Done when:** npm run build + lint clean; pin Inspector, select any object → live X/Y/W/H/rotation/opacity show; editing a field moves/resizes the object and round-trips through undo/redo; empty/multi-select states render without crashing.
- **Risk:** Field set and live-commit cadence are UX judgments; must stay strictly doc-model-driven so Fabric never becomes the authority.

#### M2-12 · Snapping engine + smart guides + grid snap — 🟡 review

- **Files:** `lib/substrata/snap/engine.ts`, `lib/substrata/snap/guides-overlay.ts`, `app/editor/_components/workspace/guides-toggle.tsx`, `lib/substrata/fabric/canvas-controller.ts`
- **Deps:** M2-1
- **Build:** Hook a snap engine into Fabric object:moving/object:scaling/object:rotating. Candidates: artboard edges + centre, sibling-layer bbox edges/centres, and optional grid lines. Threshold in SCREEN px (divide by current zoom), apply the correction, and draw smart-guide lines + dimension ticks on the upper canvas overlay. Wire the Workspace ▸ Guides toggles (Rulers / Grid / Snap, per mockup ~L412); persist toggle state to localStorage. Honour prefers-reduced-motion.
- **Done when:** npm run build passes; dragging a layer near another's edge/centre snaps and shows a guide; toggling Snap off disables it; grid snap aligns to grid; toggle state persists across reload.
- **Risk:** Snap thresholds/priority and guide rendering are taste-tuned; candidate-set must be capped to stay fast with many layers.

#### M2-13 · Wire contextual-settings routing + tool keymap + M2 integration gate — 🟢 safe

- **Files:** `app/editor/_components/omnibar/omnibar.tsx`, `lib/substrata/keymap.ts`, `app/editor/_components/settings/settings-router.tsx`
- **Deps:** M2-4, M2-5, M2-7, M2-8, M2-9, M2-10, M2-11, M2-12
- **Build:** Make the omnibar centre settings zone swap by active tool (MOVE→transform, SELECT→select opts, ADJUST→effects[from M3/existing seam], TEXT→M2-5, PIECES→M2-7). Register T/P/M shortcuts + subtool cycling in a keymap; ensure switching tools commits any in-progress edit (active text edit, open pen authoring) cleanly before swapping. Final build/lint pass; confirm /editor renders with every M2 tool selectable and the settings panel swapping.
- **Done when:** npm run build passes (static export, TS strict) and npm run lint adds no new errors; in dev, T/P/M switch tools and the centre settings panel swaps accordingly; switching tools mid-edit leaves the doc model consistent (undo history still coherent).
- **Risk:** Shortcut collisions with browser/edit-mode keys; tool-switch must flush pending Fabric edits or risk doc-model corruption.

**Milestone risks**

- Namespace collision: lib/editor is the unrelated ProseMirror markdown tool, so Substrata engine code cannot live there — this plan assumes lib/substrata/ + app/editor/_components/. Confirm the actual M0/M1 directory layout before building.
- Dependency on M0/M1: this milestone presumes the app/editor route, Fabric canvas controller (dynamic ssr:false), omnibar+rail shell, command/patch undo, and Dexie v1 already exist. Substrata is currently un-scaffolded (no fabric/dexie/perfect-freehand installed) — if M1 slips, M2 cannot begin.
- SELECT scope is the biggest unknown: §8 lists marquee/lasso/magnet/flood/superflood but §9's v1 contract gives SELECT no detail. Magnetic-lasso + flood-select are substantial CV work — needs an explicit cut-line for what lands in M2 (M2-10).
- Transient selection ops (move/delete/fill) are destructive to a raster layer, which conflicts with the non-destructive / doc-model-owns-truth contract (§5, §6, §11). Decide: destructive-as-COW-snapshot in history vs extract-selection-to-new-layer (M2-10).
- Bundled content fonts: which woff2 to ship is an undecided licensing call (∑CG) — the font loader can ship with system stack only until Ruby decides (M2-3).
- Freehand library: perfect-freehand npm vs vendoring tldraw's MIT fork — §5 explicitly says 'consider vendoring' (low-maintenance upstream, 'hot elbows' artifact). Ruby's call (M2-2).
- Text-on-path quality bar and whether it truly belongs in M2 vs deferral — glyph-on-curve work overruns easily (M2-6).
- Hard requirement compliance to watch: every text measure/render/export must await document.fonts.ready (§5 Text); freehand must persist raw [x,y,pressure] not Fabric JSON (§5 Pieces); all doc↔Fabric sync stays strictly one-way (§5). Easy to violate silently.
- No user-facing copy is authored anywhere — all labels/tooltips/empty-states stay ∑CG gaps for slopsieve.

---

### M3 — Effects

Build Substrata's per-layer, non-destructive effects stack: a declarative effect registry feeding (a) Tier-0 Fabric built-in filter factories and (b) four custom GLSL `BaseFilter` shaders (Levels, Colour Balance/OkLab, Vignette, Duotone) each with a Canvas2D fallback; wire a strict doc-model→Fabric `filters[]` sync with preview-downscale + rAF coalescing; render the flush single-open Effects accordion module from sketches/modals.html (driven entirely by the registry, all copy as ∑CG gaps); integrate add/remove/reorder/param edits into the M1 command/patch history + autosave; expose the stack through the omnibar ADJUST (A) mode; and add the rasterize-text/shape-for-effects command so pixel effects on non-raster layers never silently no-op.

**Effort:** XL — four hand-written GLSL shaders (+2D fallbacks) each needing visual tuning, a generic registry-driven param UI, an observational performance/correctness sync layer, and integration across five M0–M2 surfaces that do not exist in the tree yet. The shader correctness and Fabric-v7 custom-filter API are the long poles.

**Autonomy verdict:** Partially. An unattended agent can build the scaffolding that compiles and renders — data model + migration (M3-1), registry (M3-2), Tier-0 factory wiring (M3-4), the accordion UI shell (M3-12), the sync/history plumbing (M3-10/M3-11), and the final lazy-load/copy-gap/build gate (M3-17) — and prove a green `npm run build` + `/editor` render. The catch is threefold: (1) NONE of the visual output is trustworthy without Ruby's eyes — the four custom GLSL shaders (M3-6..M3-9, especially OkLab Colour Balance) and every Tier-0 value-scaling are correctness-by-taste and the gauntlet's #1 hazard is that wrong uniforms / oversize textures render SILENTLY WRONG, not crash; (2) two genuine open decisions need Ruby — Threshold/Posterize (mis-specced as shader-free, M3-5) and the Colour-Balance/Duotone models (M3-7/M3-9); (3) the whole milestone is built on M0–M2 surfaces (doc model, doc→Fabric sync, omnibar/rail, history, blob store, Fabric install) that do NOT exist in the tree yet, so an overnight run with stubbed foundations would produce a compiling skeleton with unverifiable effects, not a shippable M3.</autonomyVerdict>
<parameter name="milestoneRisks">["Fabric ^7.4.0 custom BaseFilter API (fragmentSource / getUniformLocations / sendUniformData / classRegistry) differs from older v5/v6 docs and from training data — must be verified against the installed fabric source or context7; wrong uniform plumbing renders silently wrong, never throws.","Hard dependency on M0–M2, which are NOT built in the working tree (app/editor/ does not exist, fabric/dexie not in package.json): doc model, strict one-way doc→Fabric sync, command/patch history, blob store, omnibar ADJUST tool, rail module mounting, and WebGL guard rails (textureSize clamp, preview-downscale) are all assumed.","Namespace clash: lib/editor/ is the ProseMirror markdown tool — Substrata engine code must live under a different namespace (lib/substrata/ assumed); confirm M0's actual choice or every file path here churns.","SPEC §9 mis-classifies Threshold and Posterize as Tier-0 'no shaders', but neither is a Fabric built-in nor a ColorMatrix — needs a ship/defer decision (M3-5).","Custom shader correctness is purely visual with NO automated test suite (repo has none): build green only proves it compiles, not that Levels/Colour-Balance/Vignette/Duotone look right — all need human QA.","Accepted v1 limitation: 8-bit intermediate textures band across long colour stacks (Colour Balance + Levels chained) until the v2 float pipeline — looks like a defect but is by design.","Silent-corruption guard rails must actually be exercised: oversize sources render ~30% of pixels (Fabric #6805) and Safari can silently produce transparent output — both are observational and easy to miss in an unattended run.","Large ∑CG copy surface (every effect name + param label + add-effect groups + rasterize gate + FX read-out) — no copy may be authored; must stay greppable ∑CG with commented spec/sample for slopsieve.","Rasterize-for-effects semantics ('layer stays editable in the doc model') are under-specified — frozen original vs re-edit-then-rebake is an unresolved design call (M3-15).","Must avoid toSVG entirely (CVE-2026-44311 / CVE-2026-27013) in the rasterize path — use toCanvasElement, not vector export."]

| Task | Title | Autonomy | Deps |
| --- | --- | --- | --- |
| M3-1 | Effects in the doc model + schema version/migration | 🟢 safe | — |
| M3-2 | Effect registry + param-schema system | 🟢 safe | M3-1 |
| M3-3 | Custom BaseFilter infrastructure + shared GLSL chunks | 🟡 review | M3-1 |
| M3-4 | Tier-0 Fabric built-in filter factories | 🟡 review | M3-2 |
| M3-5 | Threshold + Posterize — decision + impl | 🔴 decision | M3-2, M3-3 |
| M3-6 | Levels custom filter (GLSL + 2D) | 🟡 review | M3-2, M3-3 |
| M3-7 | Colour Balance (OkLab) custom filter | 🔴 decision | M3-2, M3-3 |
| M3-8 | Vignette custom filter (GLSL + 2D) | 🟡 review | M3-2, M3-3 |
| M3-9 | Duotone custom filter (GLSL + 2D) | 🔴 decision | M3-2, M3-3 |
| M3-10 | Effects→Fabric sync + preview-downscale + rAF coalescing | 🟡 review | M3-3, M3-4 |
| M3-11 | Undo/redo + autosave integration for effects | 🟡 review | M3-1 |
| M3-12 | Effects accordion module UI | 🟡 review | M3-2, M3-10, M3-11 |
| M3-13 | Add-Effect picker | 🟡 review | M3-2, M3-12 |
| M3-14 | ADJUST tool / omnibar settings wiring | 🟡 review | M3-2, M3-12 |
| M3-15 | Rasterize-for-effects command + non-raster gating | 🟡 review | M3-1, M3-10, M3-12 |
| M3-16 | Layer-level Drop Shadow (fabric.Shadow) | 🟡 review | M3-1, M3-12 |
| M3-17 | Lazy-load wiring + copy-gap pass + build/lint gate | 🟢 safe | M3-10, M3-12, M3-13, M3-14, M3-15 |

#### M3-1 · Effects in the doc model + schema version/migration — 🟢 safe

- **Files:** `lib/substrata/doc-model.ts`, `lib/substrata/db.ts`, `lib/substrata/migrations.ts`
- **Deps:** —
- **Build:** In the M1 doc model add an EffectInstance type ({id, type: EffectType, enabled, collapsed, params: Record<string, number|string|number[]>}) and an `effects: EffectInstance[]` field on each layer; add the EffectType union (Tier-0 list + Levels/ColourBalance/Vignette/Duotone) with a tier tag. Bump the doc-model schemaVersion and add a forward-compat migration that defaults missing `effects` to []. Effect stacks serialise as JSON inside the existing Dexie `projects` row (per SPEC §9/§13) — no Dexie store/index bump is needed unless M1 indexed layers separately; add the doc-model migration step and (de)serialise helpers either way.
- **Done when:** npm run build green (TS strict); a layer-with-effects round-trips through serialise/deserialise unchanged; an M1-era project without `effects` loads with effects:[].
- **Risk:** Assumes M1's layer shape and Dexie schema; if M1 stored layers as indexed rows rather than nested JSON this needs a real Dexie version bump. lib/editor/ is ProseMirror, so the Substrata namespace must be lib/substrata/ — confirm M0's chosen namespace.

#### M3-2 · Effect registry + param-schema system — 🟢 safe

- **Files:** `lib/substrata/effects/registry.ts`, `lib/substrata/effects/types.ts`
- **Deps:** M3-1
- **Build:** Create a declarative registry: one entry per v1 effect (all Tier-0 + Levels/ColourBalance/Vignette/Duotone) carrying {id, tier, defaultParams, params: ParamSpec[]}. ParamSpec kinds: slider/stepper/select/colour/presets with min/max/step/default/unit/options. The registry is the single source both the UI (M3-12) and the Fabric-construction layer (M3-4/M3-10) read. CRITICAL per the no-copy rule: every effect display name and every param label is a `∑CG` placeholder with an inert commented spec/sample — author NO real wording here.
- **Done when:** npm run build green; registry typechecks against EffectType; `slopsieve --list` (or grep ∑CG) enumerates every effect name + param label as a gap with none authored.
- **Risk:** Param ranges/defaults are first-guesses needing later tuning; the registry is a very large ∑CG surface (~20 names + dozens of labels).

#### M3-3 · Custom BaseFilter infrastructure + shared GLSL chunks — 🟡 review

- **Files:** `lib/substrata/effects/base-filter.ts`, `lib/substrata/effects/glsl-chunks.ts`
- **Deps:** M3-1
- **Build:** Create a SubstrataFilter base extending fabric.filters.BaseFilter for fabric ^7.4.0: fragmentSource string, getUniformLocations/sendUniformData (v7 signatures), mainParameters, a `type` tag, toObject for loadFromJSON round-trip, and fabric classRegistry registration. Define the Canvas2D applyTo2d fallback contract and a shared GLSL chunk module (sRGB↔linear, RGB↔OkLab) re-authored from the algorithms in lib/colour-notation.ts (re-implemented in GLSL, NOT imported). Provide a webglcontextlost hook that forces the 2D path.
- **Done when:** npm run build green; a trivial probe filter registers, round-trips via classRegistry, and renders identically-ish on a sample image in both the WebGL and forced-2D paths (human-observed).
- **Risk:** Fabric v7's custom-filter uniform/fragmentSource API differs from v5/v6 docs — verify against the fabric ^7.4.0 source / context7; a wrong uniform binding renders silently wrong rather than throwing.

#### M3-4 · Tier-0 Fabric built-in filter factories — 🟡 review

- **Files:** `lib/substrata/effects/tier0.ts`
- **Deps:** M3-2
- **Build:** Map each Tier-0 registry effect+params to fabric.filters.* instance(s): Brightness, Contrast, Saturation, Vibrance, HueRotation, Gamma, Grayscale, Invert, Sepia, Blur, Convolute (sharpen/emboss/edge kernels), Noise, Pixelate, BlendColor (Colour Overlay/Tint), plus ColorMatrix recipes for Exposure (linear gain) and Temperature (warm/cool R/B gain, NOT Kelvin). Centralise the param→filter value scaling so the UI sliders map sensibly.
- **Done when:** npm run build green; each Tier-0 effect added to a raster layer visibly transforms the canvas, and the Convolute presets switch kernels (human-observed).
- **Risk:** Param→filter scaling and Convolute kernel choices are taste calls; Exposure/Temperature ColorMatrix coefficients need tuning.

#### M3-5 · Threshold + Posterize — decision + impl — 🔴 decision

- **Files:** `lib/substrata/effects/tier0-extra.ts`
- **Deps:** M3-2, M3-3
- **Build:** SPEC §9 lists Threshold and Posterize as Tier-0 'Fabric built-ins, no shaders', but neither is a Fabric built-in and neither is expressible as a ColorMatrix (both are non-linear/step functions). Decide: implement as tiny SubstrataFilter GLSL+2D filters (via M3-3), or demote to v1.1. If kept, implement both.
- **Done when:** Decision recorded; if implemented, npm run build green and a visible hard threshold / level-quantise on the canvas (human-observed).
- **Risk:** Spec mis-classifies these as shader-free; this is a scope/quality call only Ruby should make (ship-now vs defer).

#### M3-6 · Levels custom filter (GLSL + 2D) — 🟡 review

- **Files:** `lib/substrata/effects/levels.ts`
- **Deps:** M3-2, M3-3
- **Build:** Implement Levels via M3-3: input black/white points + gamma, output black/white, with optional per-channel control. GLSL fragment shader + Canvas2D applyTo2d fallback.
- **Done when:** npm run build green; dragging level sliders visibly remaps tones and clamps correctly at the endpoints (human-observed).
- **Risk:** Per-channel scope and gamma-curve correctness are visual; 8-bit banding on extreme remaps is an accepted v1 limitation.

#### M3-7 · Colour Balance (OkLab) custom filter — 🔴 decision

- **Files:** `lib/substrata/effects/colour-balance.ts`
- **Deps:** M3-2, M3-3
- **Build:** Implement shadows/midtones/highlights colour shifts computed in OkLab (re-author RGB↔OkLab in GLSL from the colour-notation.ts algorithms), luminance-weighted region masks, with a preserve-luminosity option. GLSL + 2D fallback.
- **Done when:** npm run build green; per-region shifts read as expected and match a reference image side-by-side (human-judged).
- **Risk:** The OkLab region-weighting model (how shadow/mid/highlight masks are defined and whether luminosity is preserved) is an open design call; OkLab-in-shader correctness + 8-bit banding.

#### M3-8 · Vignette custom filter (GLSL + 2D) — 🟡 review

- **Files:** `lib/substrata/effects/vignette.ts`
- **Deps:** M3-2, M3-3
- **Build:** Implement radial darken/lighten via M3-3: params amount, midpoint, roundness, feather, colour. Handle non-square layer aspect (ellipse vs circle).
- **Done when:** npm run build green; visible radial falloff that respects each param and the layer aspect ratio (human-observed).
- **Risk:** Aspect-ratio handling on non-square layers; falloff curve feel is taste.

#### M3-9 · Duotone custom filter (GLSL + 2D) — 🔴 decision

- **Files:** `lib/substrata/effects/duotone.ts`
- **Deps:** M3-2, M3-3
- **Build:** Map layer luminance to a two-colour ramp (shadow + highlight colours, optional midpoint) via M3-3, and expose preset colour-pairs through the registry's 'presets' ParamSpec kind (the preset swatch grid from modals.html `.presets`).
- **Done when:** npm run build green; luminance maps onto the colour ramp and selecting a preset swaps the pair (human-observed).
- **Risk:** The default preset colour pairs are a taste call; any preset names are ∑CG copy gaps, not authored here.

#### M3-10 · Effects→Fabric sync + preview-downscale + rAF coalescing — 🟡 review

- **Files:** `lib/substrata/sync/effects-sync.ts`
- **Deps:** M3-3, M3-4
- **Build:** Extend M1's strict one-way doc→Fabric sync: on a layer's effects change, rebuild fabricImage.filters[] in stack order (skipping disabled) from the Tier-0 factories (M3-4) and custom filters (M3-6..M3-9), then call applyFilters() coalesced in a single rAF. Mark only the active layer dirty and cache the unfiltered source for others; during slider drag run the chain on a ~1–2 MP fit-to-viewport proxy and re-run full-res on pointerup commit; honour the M1 textureSize clamp (oversize sources silently render ~30% of pixels — Fabric #6805); fall back to Canvas2D on webglcontextlost.
- **Done when:** npm run build green; slider drag stays responsive on a large image and commits at full res; a source larger than gl.MAX_TEXTURE_SIZE renders fully (no #6805 partial render); forcing context loss falls back without a crash (all human-observed).
- **Risk:** Performance and the #1 silent-corruption hazard (oversize → 30% pixels) are observational, not unit-testable; depends on M1's sync + guard-rail API being in place.

#### M3-11 · Undo/redo + autosave integration for effects — 🟡 review

- **Files:** `lib/substrata/history/effect-commands.ts`
- **Deps:** M3-1
- **Build:** Represent add/remove/reorder/toggle/reset/param-change as command/patch ops on the M1 doc-model history; coalesce a continuous slider drag into a single history entry committed on pointerup; trigger the M1 debounced Dexie autosave on each committed change.
- **Done when:** npm run build green; undo/redo steps cleanly through effect edits; one slider drag = one undo step; reloading the project restores the saved effect stack (human-observed).
- **Risk:** Coalescing boundaries and patch granularity for nested params; depends on M1's history API.

#### M3-12 · Effects accordion module UI — 🟡 review

- **Files:** `components/editor/modules/effects-module.tsx`, `components/editor/modules/effect-param-control.tsx`
- **Deps:** M3-2, M3-10, M3-11
- **Build:** Port the sketches/modals.html Effects card to React using Radix Accordion (type="single" collapsible) and the DESIGN.md flush/segmented/hairline language (2px between effects, 1px nested rows, presets as a `.segmented` bleed grid; mind the AccordionContent overflow-hidden bleed gotcha, DESIGN.md §7). Each effect row: @dnd-kit grip reorder, chevron, name (from registry ∑CG), reset, trash, enable Switch; the body renders param controls generically from each ParamSpec (Slider / stepper / Select / colour chip / preset grid) via a shared EffectParamControl. All mutations go through the doc-model store → M3-11 history → M3-10 sync. No authored copy — names/labels come from the registry's ∑CG gaps.
- **Done when:** npm run build green; /editor renders the Effects module; the accordion is single-open; grip-reorder, toggle, reset and delete mutate the stack and re-render the canvas; layout matches modals.html (human-judged).
- **Risk:** Drag-reorder feel and accordion bleed/overflow gotcha; must visually match the sketch; depends on the M0/M2 rail mounting modules.

#### M3-13 · Add-Effect picker — 🟡 review

- **Files:** `components/editor/modules/add-effect-menu.tsx`
- **Deps:** M3-2, M3-12
- **Build:** Build the 'Add Effect' affordance: a popover/list of available effect types grouped by tier (read from the registry) that inserts a default EffectInstance at the top of the active layer's stack. For non-raster (text/shape) layers, surface the rasterize affordance instead of a silent insert (links to M3-15). Group labels are ∑CG.
- **Done when:** npm run build green; clicking Add Effect lists the effects grouped by tier and inserts one into the active layer (human-observed); the list/affordance reflects layer type.
- **Risk:** Grouping + labels are ∑CG; behaviour for effects added more than once needs deciding.

#### M3-14 · ADJUST tool / omnibar settings wiring — 🟡 review

- **Files:** `components/editor/omnibar/adjust-settings.tsx`, `lib/substrata/store.ts`
- **Deps:** M3-2, M3-12
- **Build:** Wire the omnibar ADJUST (A) tool (shell built in M0/M2) as a mode targeting the active layer's effects stack: the settings zone shows the FX read-out (current effect chips, ∑CG) and the bloom opens the Effects card; subtools fx/colour/styles per SPEC §8. Add a shared editor-store selector for the active layer that both the omnibar and the Effects module consume.
- **Done when:** npm run build green; selecting ADJUST surfaces the active layer's effects in the omnibar centre and the FX read-out reflects the stack (human-observed).
- **Risk:** Hard-depends on the M0/M2 omnibar+rail+store APIs being stable; FX read-out text is ∑CG.

#### M3-15 · Rasterize-for-effects command + non-raster gating — 🟡 review

- **Files:** `lib/substrata/commands/rasterize-layer.ts`, `components/editor/modules/rasterize-gate.tsx`
- **Deps:** M3-1, M3-10, M3-12
- **Build:** Implement a command that bakes a text/shape layer to raster so pixel effects can apply: await document.fonts.ready, render the Fabric object via toCanvasElement() (NEVER toSVG — CVE-2026-44311), createImageBitmap → content-addressed (SHA-256) blob stored via the M1 blob store, and switch the layer's render to raster while preserving the original text/shape params in the doc model. In the Effects module, gate non-raster layers: instead of a silent no-op, show the rasterize affordance (body copy = ∑CG) offering this command.
- **Done when:** npm run build green; adding a pixel effect to a text layer prompts rasterize (never a silent no-op); after rasterize the effect applies and the original text params remain in the doc model; baked text uses the loaded fonts (human-observed).
- **Risk:** SPEC's 'layer stays editable in the doc model' is under-specified (re-edit-then-rebake vs frozen original) — needs a call; fonts.ready timing; must avoid toSVG entirely.

#### M3-16 · Layer-level Drop Shadow (fabric.Shadow) — 🟡 review

- **Files:** `lib/substrata/effects/layer-shadow.ts`
- **Deps:** M3-1, M3-12
- **Build:** Optional: wire per-layer Drop Shadow (offset x/y, blur, colour, opacity) as the object-compositing part of the per-layer stack (SPEC §6/§9), as a fabric.Shadow on the object with params in the doc model + a registry-style spec. Decide whether it lives in the Effects module or the Inspector.
- **Done when:** npm run build green; toggling/adjusting the shadow updates it on the canvas (human-observed).
- **Risk:** Overlaps M1 Inspector / blend+opacity (which may already own object compositing) — could be folded there or deferred.

#### M3-17 · Lazy-load wiring + copy-gap pass + build/lint gate — 🟢 safe

- **Files:** `app/editor/page.tsx`, `components/editor/modules/effects-module.tsx`
- **Deps:** M3-10, M3-12, M3-13, M3-14, M3-15
- **Build:** Ensure all M3 effect code is code-split to the editor route (Fabric + custom filters dynamic-imported ssr:false; nothing added to landing-page weight). Sweep every new file to confirm all user-facing strings (registry names/labels, add-effect groups, rasterize gate, FX read-out) are ∑CG gaps with inert commented spec/sample — zero authored copy. Run the full gate and point the owner at slopsieve to fill gaps.
- **Done when:** npm run build green (static export output:export, TS strict); npm run lint shows no NEW errors; /editor renders with the Effects module; grep confirms zero authored user-facing copy (all ∑CG); the editor chunk is not pulled into the landing bundle.
- **Risk:** Bundle-split regressions pulling Fabric onto landing weight; a missed ∑CG gap leaking placeholder/real copy.

---

### M4 — Colour

Build Substrata's colour picker as a rail Module: one flush card with three tabs — Swatches (draggable hue×tone wall, default), Prism (wavelength spectroscope shaped by WATTS/NTU), Shade (24-hue infinite reel → 5 named tonal shades) — plus a live chip footer (swatch + nearest colour name + hex + notation readout). It reuses the existing colour algorithms (palette-strategies OkLCH math, colour-notation formatting, colour-names nearest-name lookup, palette generators) but requires a NEW bidirectional conversion module since the repo only has one-way hex→string today. The picker emits a hex and writes it to the currently selected fill target (piece fill, text fill, effect colour) via the doc model. The three tabs are a near-direct port of the working sketch sketches/pickers-fun.html in the DESIGN.md flush/hairline/square/Quattro skin, with every user-facing string left as a ∑CG copy gap.

**Effort:** M, leaning L if M4-8 binding and M4-9 palette are in scope. The colour math and all three tabs are well-scoped and already exist as working, skinned JS in sketches/pickers-fun.html — the porting effort is modest and low-risk. The size comes from integration, not invention: a new bidirectional conversion module (none exists today), reconciling the picker with M1's not-yet-built state/doc model, the fill-target binding across M2/M3 surfaces, and the cluster of open design decisions plus the ∑CG copy discipline. Pure-port + math is S–M; the cross-milestone wiring is what pushes it to M/L.

**Autonomy verdict:** Partially. The self-contained, build-verifiable pieces — M4-1 (conversion core), M4-2 (Prism math), M4-3 (state hook) — can run unattended and are gated by npm run build + lint plus a scratch round-trip script. The three tab components and the module shell (M4-4..M4-7) will COMPILE unattended (they are near-direct ports of the working sketch sketches/pickers-fun.html) but their correctness is purely visual — drag/scroll/snap feel and fidelity to the sketch — so they need Ruby's eye, not just a green build. The catch that breaks true overnight autonomy: (1) M0–M3 DO NOT EXIST in this tree (no app/editor route, no doc model, no rail/module registry, no fabric/dexie/zustand deps), so the picker has nothing to mount into and M4-8 (fill binding) is hard-blocked on M1/M2/M3 APIs that aren't written yet; (2) M4-8/M4-9/M4-10 carry open design decisions only Ruby can make (active-target resolution, palette integration shape, the §14 'families from names DB' contradiction); (3) the no-copy hard rule means every label stays a ∑CG gap — no wording can be authored overnight. So: build the colour math + isolated tabs unattended against a throwaway harness; defer mounting, binding, palette shape, and copy to a Ruby-in-the-loop pass.

| Task | Title | Autonomy | Deps |
| --- | --- | --- | --- |
| M4-1 | Bidirectional colour conversion core | 🟢 safe | — |
| M4-2 | Prism spectral math (wavelength + WATTS + NTU + band) | 🟢 safe | M4-1 |
| M4-3 | Active-colour state hook (decoupled from M1 store) | 🟢 safe | M4-1 |
| M4-4 | Swatches tab (draggable hue×tone wall) | 🟡 review | M4-1, M4-3 |
| M4-5 | Prism tab (wavelength spectroscope) | 🟡 review | M4-2, M4-3 |
| M4-6 | Shade tab (24-hue infinite reel → 5 tonal shades) | 🟡 review | M4-1, M4-3 |
| M4-7 | Colour module shell — tabbed card + live chip + notation readout | 🟡 review | M4-3, M4-4, M4-5, M4-6 |
| M4-8 | Bind active colour to fill targets (piece / text / effect colour) | 🔴 decision | M4-7 |
| M4-9 | Palette reuse + recent colours strip | 🔴 decision | M4-7 |
| M4-10 | ∑CG copy-gap audit + slopsieve handoff | 🔴 decision | M4-4, M4-5, M4-6, M4-7 |

#### M4-1 · Bidirectional colour conversion core — 🟢 safe

- **Files:** `lib/colour-convert.ts`
- **Deps:** —
- **Build:** Create a new colour-math module with FULL round-trippable conversions, since the repo currently only has one-way hex→string (lib/colour-notation.ts) and private/unexported oklch math (lib/palette-strategies.ts oklchToRgb/oklchToHex). Export: parseHex/normalizeHex, hexToRgb/rgbToHex, rgbToHsl/hslToRgb, rgbToHsv/hsvToRgb, hexToOklch/oklchToHex (port the algorithm from palette-strategies — do NOT edit that shared file, which is used by other catalogue tools and is parity-sensitive). Single source of truth across the picker = a hex string. British spelling in identifiers (colour). This is the foundation every tab depends on.
- **Done when:** npm run build green (TS strict, output:export) and npm run lint adds no new errors. Because there is no test suite, also drop a NON-committed round-trip sanity script in the scratchpad asserting hex→hsv→hex and hex→oklch→hex are stable within tolerance for a spread of inputs.
- **Risk:** Duplicates oklch math already living (privately) in palette-strategies.ts — two copies can drift. Round-trip accuracy is unverified by any committed test; the scratch script is the only guard.

#### M4-2 · Prism spectral math (wavelength + WATTS + NTU + band) — 🟢 safe

- **Files:** `lib/colour-prism.ts`
- **Deps:** M4-1
- **Build:** Port the Prism toy math from sketches/pickers-fun.html into a small module: wavelengthToRgb(nm) (the 380–700nm piecewise approximation), applyWatts(rgb, 0..100) (intensity multiply toward black), applyHaze(rgb, 0..100) (NTU milk toward white), nm→band classifier, and nm↔x position helpers. Pure functions returning hex. Keep separate from M4-1 so the general conversion core stays colorimetric and this stays a 'toy'.
- **Done when:** npm run build + lint clean; functions are pure and importable. Math is a direct port of the working sketch JS, so a scratch eval of a few nm values matching the sketch's output is sufficient.
- **Risk:** The spectral approximation is decorative, not colorimetric — it cannot represent non-spectral colours (magentas/browns), so Prism is inherently lossy and one-way; that is a design property, not a bug, but worth confirming.

#### M4-3 · Active-colour state hook (decoupled from M1 store) — 🟢 safe

- **Files:** `components/editor/colour/use-active-colour.tsx`
- **Deps:** M4-1
- **Build:** Create a self-contained 'use client' context/hook holding the picker's current colour (hex) plus a debounced/commit-split API: live value during drag, committed value on pointerup. Expose an injectable onCommit(hex) callback so the hook does NOT hard-depend on M1's not-yet-existent doc-model store — M4-8 later supplies the real target setter. Also expose the current external colour so tabs can reflect/highlight it (Swatches/Shade highlight nearest cell; Prism best-effort). This is the seam between the picker UI and the editor.
- **Done when:** Compiles and lints standalone; a throwaway harness can mount it and log committed vs live values. Final reconciliation with M1's store happens in M4-8.
- **Risk:** State-management pattern (context here) may not match whatever M1 actually ships (zustand? doc-model store?). Built decoupled to minimise rework, but a reconcile pass is inevitable once M1 lands.

#### M4-4 · Swatches tab (draggable hue×tone wall) — 🟡 review

- **Files:** `components/editor/colour/swatches-tab.tsx`
- **Deps:** M4-1, M4-3
- **Build:** Port the Swatches picker from sketches/pickers-fun.html: an 11-tone × (1 neutral + 36 hue) HSL grid (Ls/Ss tone arrays from the sketch), horizontal drag-to-scroll (pointer capture, move-vs-click threshold), click-to-select with the inset double-ring selected state, scroll-to-centre on the active colour. Emits hex to the M4-3 hook on commit; highlights the nearest cell when the external colour changes. Use lib/colour-convert for hex math (not the inline hslHex). Flush/hairline/square skin per DESIGN.md. This is the DEFAULT tab.
- **Done when:** npm run build + lint clean; tab renders in the harness and drag/scroll/select work. Correctness is visual — Ruby compares drag feel and grid against sketches/pickers-fun.html.
- **Risk:** Drag-vs-click feel, scroll inertia, and visual fidelity to the sketch are taste calls a build cannot judge. Calling getColourName on every drag frame will jank (O(n) over thousands) — name only on commit/throttled.

#### M4-5 · Prism tab (wavelength spectroscope) — 🟡 review

- **Files:** `components/editor/colour/prism-tab.tsx`
- **Deps:** M4-2, M4-3
- **Build:** Port the Prism picker from the sketch: a spectrum bar with ew-resize drag → nm, a needle indicator, a readout (nm value + band label), and two sliders for WATTS (intensity) and NTU (haze). Uses lib/colour-prism. Emits hex on drag/commit. Sliders can use components/ui/slider (shadcn) or the sketch's native range — pick one consistent with DESIGN. EVERY user-facing string here is a ∑CG gap: the tab/instrument name (sample: Prism/Spectra/Refract), the two param names (sample: WATTS/LUMENS/LUX; NTU/turbidity), and band names — leave placeholders with the spec/sample comment block already drafted in the sketch's ∑CG note (lines 103-106).
- **Done when:** npm run build + lint clean; tab renders and slider/spectrum drag update the swatch. Correctness is visual + copy-gap discipline (no real labels authored). Ruby eyeballs feel against the sketch.
- **Risk:** It is a deliberate 'toy'; whether it feels right and which slider widget reads best are taste. Param/instrument naming is unresolved copy (∑CG) that Ruby must fill via slopsieve before ship.

#### M4-6 · Shade tab (24-hue infinite reel → 5 tonal shades) — 🟡 review

- **Files:** `components/editor/colour/shade-tab.tsx`
- **Deps:** M4-1, M4-3
- **Build:** Port the Shade picker from the sketch: a horizontally scroll-snapping, infinitely-wrapping 24-hue reel (the 3×-buffer + scroll-reposition trick from the sketch) with a centre hue-marker, driving 5 tonal shade rows (TONES array) each showing a swatch + family-name + tone number, with row select. Uses lib/colour-convert. Emits hex on row select. The 24 family labels are a ∑CG gap — see M4-10 for the unresolved 'families from colour-names.ts' question.
- **Done when:** npm run build + lint clean; reel wraps seamlessly and shade rows update on hue change. Correctness is visual — Ruby checks the snap/wrap feel against sketches/pickers-fun.html.
- **Risk:** Infinite scroll-snap wrap math is fiddly and feel-dependent. The 24 family names are unresolved copy AND conceptually contested (see M4-10).

#### M4-7 · Colour module shell — tabbed card + live chip + notation readout — 🟡 review

- **Files:** `components/editor/colour/colour-module.tsx`, `components/editor/modules/registry.ts`
- **Deps:** M4-3, M4-4, M4-5, M4-6
- **Build:** Assemble the picker into one Module card: a flush shadcn Tabs (components/ui/tabs is already flush per DESIGN §8 — do NOT restyle it; give TabsList grid-cols-3) hosting Swatches (default) / Prism / Shade, plus a footer chip showing the big swatch + the nearest colour name (reuse getColourName from lib/colour-names.ts, throttled/on-commit only) + hex, with a notation readout/cycle reusing formatColour + COLOUR_NOTATIONS from lib/colour-notation.ts. Register the module in the editor's module/rail registry (assumed delivered by M1/cross-cutting; if absent, expose a default-exported Module descriptor and note the registration point). All labels (module title 'Colour', tab labels) are ∑CG placeholders.
- **Done when:** npm run build + lint clean; the module mounts in the editor rail (once M0/M1 exist), three tabs switch, and the chip reflects the selected colour in the active notation. Composition + DESIGN adherence is Ruby's visual call.
- **Risk:** The module registry path/shape is owned by M1 and does not exist yet — the registration line is a best-guess seam that may need adjustment. Overall density/flush composition vs sketches/mockup.html is a taste judgment.

#### M4-8 · Bind active colour to fill targets (piece / text / effect colour) — 🔴 decision

- **Files:** `components/editor/colour/bind-active-colour.ts`, `components/editor/colour/colour-module.tsx`
- **Deps:** M4-7
- **Build:** Wire the picker's committed hex into the doc model: set the selected layer's fill (PIECES solid fill, TEXT fill) and effect-colour params (Colour Overlay/Tint, Duotone, Vignette colour) through the one-way doc→Fabric sync, so colour changes are undoable patches (never Fabric-as-authority, per SPEC §5). Resolve which target is 'active' (selection-driven: a selected piece/text vs an effect's colour slot open in the Effects accordion). Supply the real onCommit setter to M4-3's hook. This is the integration layer that makes the picker actually do something.
- **Done when:** Once M1 (doc model + selection + undo), M2 (pieces/text fill), and M3 (effect colour params) exist: picking a colour changes the selected object's fill and is undoable; build + lint clean. Until then, only the adapter signature is verifiable.
- **Risk:** Hard-blocked on M1/M2/M3 internal APIs that DO NOT EXIST in this tree yet — an unattended agent cannot complete or verify this. The 'what is the active colour target' resolution (multi-select? effect slot focus? last-touched?) is an open design call only Ruby should make.

#### M4-9 · Palette reuse + recent colours strip — 🔴 decision

- **Files:** `components/editor/colour/palette-source.tsx`, `components/editor/colour/colour-module.tsx`
- **Deps:** M4-7
- **Build:** Deliver the milestone's explicit 'reuse palette' clause: surface a swatch source backed by generatePalette/getStrategiesByCategory (lib/palette-strategies.ts) and/or the curated sets in lib/palette-collection.ts, plus a recent-colours strip fed by committed picks. Decide the integration shape — a strip in the module footer, a source toggle inside Swatches, or a 4th tab. Names via getColourName.
- **Done when:** npm run build + lint clean; chosen palette surface renders and selecting a palette swatch sets the colour. Shape/placement is a visual call.
- **Risk:** SPEC under-specifies HOW palettes integrate into the three-tab picker (strip? source? tab?), and recent-colours is listed as post-v1 in §9 — scope and shape are an open Ruby decision, not a mechanical build.

#### M4-10 · ∑CG copy-gap audit + slopsieve handoff — 🔴 decision

- **Files:** `components/editor/colour/swatches-tab.tsx`, `components/editor/colour/prism-tab.tsx`, `components/editor/colour/shade-tab.tsx`, `components/editor/colour/colour-module.tsx`
- **Deps:** M4-4, M4-5, M4-6, M4-7
- **Build:** Sweep components/editor/colour/* and confirm EVERY user-facing string is a ∑CG placeholder with the commented spec/sample block (host-language comment, inert): module title, the three tab labels, Prism instrument + WATTS + NTU + band names, the 24 Shade family labels, tone-number formatting, and the chip's nearest-name (data, not authored copy — fine). Also surface the genuinely under-specified question: SPEC §14 says 'colour family names come from lib/colour-names.ts', but getColourName returns nearest SPECIFIC names, not 24 evenly-spaced family buckets — reconcile whether Shade families are hand-authored (∑CG) or derived from the DB. Do NOT author any wording; point Ruby at slopsieve.
- **Done when:** slopsieve --list enumerates every picker gap in the correct marker shape; grep finds no real user-facing wording committed; build + lint clean. Ruby fills the gaps via slopsieve.
- **Risk:** The 'families from colour-names.ts' instruction (§14) conflicts with what getColourName actually returns — an unresolved design contradiction. And by hard rule no copy may be authored unattended, so the strings themselves remain Ruby-only.

**Milestone risks**

- M0–M3 are not built in this tree (only SPEC.md is untracked; lib/editor/ is the unrelated ProseMirror editor; fabric/dexie/zustand absent). M4's mount point (rail/module registry), state home (doc model), and binding targets (piece/text/effect fills) are all dependencies that must land first — M4-8 is fully blocked until then.
- No reverse colour conversions exist anywhere in the repo (colour-notation.ts is hex→string only; palette-strategies oklch math is private). M4-1 must create them, and they will duplicate/risk drifting from palette-strategies' private oklch implementation.
- getColourName(hex) is an O(n) linear scan over thousands of entries — calling it per drag frame in Swatches/Shade/chip will jank; must be throttled or commit-only.
- SPEC §14 ('colour family names come from lib/colour-names.ts') contradicts what getColourName actually returns (nearest specific name, not 24 family buckets) — the Shade reel's family labels are an unresolved design question.
- Prism is a non-colorimetric 'toy': it cannot represent non-spectral colours, so it is inherently lossy and cannot faithfully reflect an arbitrary external colour. Confirm this is acceptable.
- The repo has NO automated test suite, so conversion correctness and picker feel have no regression gate beyond a green build and Ruby's manual visual QA — the same caveat DESIGN.md §13 already flags.
- Every picker label is user-facing copy and must stay a ∑CG gap under the hard no-copy rule (Prism/WATTS/NTU/families per §14, plus tab/module titles) — none can be authored unattended; slopsieve handoff is mandatory before ship.

---

### M5 — Persist

Build Substrata's persistence layer: content-addressed local autosave to Dexie/OPFS, a local project manager (thumbnails, open/rename/duplicate/delete), portable .substrata Save/Open (fflate STORE zip in a Worker + File System Access via browser-fs-access with a download/input fallback), crash-recovery snapshots, and the honest "stored in this browser / export is the durable truth" storage UX (persist()/estimate(), Safari-eviction nudge). The exported file is the source of truth; browser storage is best-effort cache. All foundational modules are build-verifiable; integrity-critical (refcount GC, round-trip) and all UI/copy are review-gated because the repo has no test suite.

**Effort:** L (bordering XL). 15 tasks, but the surface is genuinely large: content-addressed + ref-counted blob storage with IDB/OPFS routing and GC, a versioned portable zip format in a static-export Worker, the FS-Access-plus-fallback matrix across three browser families, crash recovery, a project-manager UI, and honest storage messaging. Much is mechanical (≈half the tasks are 'safe'), which keeps it from full XL, but the cross-browser fallback breadth, the data-integrity care required without any test harness, and the dependence on not-yet-built M0/M1 outputs all push effort and calendar time up.

**Autonomy verdict:** No — not safely unattended end-to-end. An agent CAN, overnight, build and build-verify the foundational layer: deps (M5-1), hash (M5-2), OPFS adapter (M5-3), Dexie schema/migrations (M5-4), the zip Worker (M5-7, the static-export MIME gotcha is the real check), the file-access wrappers (M5-9), and the storage-capability wrappers (M5-10) — these are mechanical and gated by npm run build/lint + route render. The catch is fourfold: (1) M5 sits on top of M0 (Dexie schema v1, route + top-bar/Scene-menu shell, secure-context guards) and M1 (doc-model TS types + autosave + Fabric canvas), none of which are built yet — several tasks assume their shapes and will need rework once those land. (2) The integrity-critical pieces — blob-store refcount/GC (M5-5), manifest round-trip + untrusted validation (M5-6), zip-client (M5-8), project-store duplicate/delete (M5-11) — compile but their correctness (and data-loss safety) is NOT build-verifiable in a repo with no test suite, so Ruby must manually smoke save→reload→open round-trips. (3) All UI (M5-13/14/15) is DESIGN.md/sketches taste plus ∑CG copy gaps — no wording may be authored, so it needs visual QA + a slopsieve pass. (4) Two genuine decisions: the OPFS-vs-IDB size threshold (M5-5) and snapshot retention/debounce (M5-12). Practical overnight plan: ship the safe foundation, scaffold the rest to compile with stubs + ∑CG markers, then hand the integrity smoke-tests, threshold decision, and visual/copy QA to Ruby.

| Task | Title | Autonomy | Deps |
| --- | --- | --- | --- |
| M5-1 | Add persistence dependencies | 🟢 safe | — |
| M5-2 | SHA-256 content-hash utility | 🟢 safe | — |
| M5-3 | OPFS adapter for large rasters | 🟢 safe | — |
| M5-4 | Dexie schema + versioned migrations (projects / blobs / handles / snapshots) | 🟢 safe | M5-1 |
| M5-5 | Content-addressed blob store with ref-counting + IDB/OPFS routing + GC | 🟡 review | M5-2, M5-3, M5-4 |
| M5-6 | Manifest schema + doc↔manifest serialization + untrusted-import validator | 🟡 review | M5-2, M5-4 |
| M5-7 | fflate STORE zip Worker (.js entry) | 🟢 safe | M5-1 |
| M5-8 | Zip client orchestration (save→file, file→scene) | 🟡 review | M5-5, M5-6, M5-7 |
| M5-9 | File access layer (FS Access pickers + fallback + handle persistence) | 🟢 safe | M5-1, M5-4 |
| M5-10 | Storage capability wrappers (persist / persisted / estimate) | 🟢 safe | — |
| M5-11 | Project store (CRUD + thumbnails) | 🟡 review | M5-4, M5-5, M5-6 |
| M5-12 | Crash-recovery snapshots | 🔴 decision | M5-4 |
| M5-13 | Project manager UI | 🟡 review | M5-11 |
| M5-14 | Storage UX surfaces (export-as-truth + persist prompt + inspector size/stored-local) | 🟡 review | M5-10, M5-11 |
| M5-15 | Wire Scene menu + save-status into persistence | 🟡 review | M5-8, M5-9, M5-11, M5-13, M5-14 |

#### M5-1 · Add persistence dependencies — 🟢 safe

- **Files:** `package.json`, `package-lock.json`
- **Deps:** —
- **Build:** Add fflate (STORE-mode zip) and browser-fs-access (FS Access + fallback) to package.json. Ensure dexie is present (it was meant to land in M0 for schema v1; add it if absent). Pin to caret ranges consistent with the repo. No app code yet — just deps + a clean install. Do NOT add jszip-based zipping; SPEC §4/§9 mandate fflate STORE mode.
- **Done when:** npm install succeeds; npm run build stays green (static export, 56 pages, TS strict); the new packages resolve in a throwaway import; npm run lint shows no new errors.
- **Risk:** Version drift vs Next 16 / React 19; browser-fs-access is a tiny lib but is a (mild) dep-vs-handroll call — milestone text names it, so treat as specified.

#### M5-2 · SHA-256 content-hash utility — 🟢 safe

- **Files:** `lib/substrata/persist/hash.ts`
- **Deps:** —
- **Build:** Create a content-hashing helper using crypto.subtle.digest('SHA-256', ...) that returns a lowercase hex digest for an ArrayBuffer/Blob/Uint8Array. Must run in both the main thread and a Worker, and be secure-context guarded (crypto.subtle is unavailable over file://) with a clear thrown error or capability flag so callers degrade gracefully. This is the addressing primitive for the blob store and .substrata blobs/<sha256> entries.
- **Done when:** tsc/build green; deterministic output observable via a dev call (same bytes → same hash, different bytes → different hash); returns/guards cleanly when crypto.subtle is absent.
- **Risk:** crypto.subtle requires a secure context — must not throw an unhandled error on file://; guard explicitly.

#### M5-3 · OPFS adapter for large rasters — 🟢 safe

- **Files:** `lib/substrata/persist/opfs.ts`
- **Deps:** —
- **Build:** Create a feature-detected OPFS wrapper (navigator.storage.getDirectory) exposing has/read/write/delete keyed by content hash, plus an isSupported() capability flag. Secure-context + feature guarded; when OPFS is unavailable, callers fall back to the IndexedDB blob store. Used to keep big raster ArrayBuffers out of IndexedDB.
- **Done when:** build green; route renders without error when OPFS is supported; isSupported() returns false (not throws) in a non-OPFS context; round-trip write→read→delete works in a dev smoke.
- **Risk:** OPFS API surface varies (Safari sync-access-handle vs async); secure-context required; needs graceful degradation, not a crash.

#### M5-4 · Dexie schema + versioned migrations (projects / blobs / handles / snapshots) — 🟢 safe

- **Files:** `lib/substrata/db.ts`
- **Deps:** M5-1
- **Build:** Define (or extend M0's) Dexie database with the four stores from SPEC §9: projects (artboard + layer tree + effect stacks as JSON + thumbnail + updatedAt), blobs (content-addressed by sha256, with refCount and a storage-location flag idb|opfs), handles (persisted FileSystemFileHandle per project for save-in-place), snapshots (recovery). Use Dexie declarative .version() migrations; migrations must be non-destructive (SPEC §13: never auto-migrate destructively). If M0 already created v1 with a subset, add a v2 migration that introduces the missing stores/columns rather than rewriting v1.
- **Done when:** build/tsc green; opening the DB on the /editor route does not throw and reports the expected version; migration chain compiles. Types for each store are exported and consumed by later tasks.
- **Risk:** Must reconcile with M0's actual schema v1 shape/version number (not built yet) to avoid a destructive or conflicting migration; coordinate the version counter.

#### M5-5 · Content-addressed blob store with ref-counting + IDB/OPFS routing + GC — 🟡 review

- **Files:** `lib/substrata/persist/blob-store.ts`
- **Deps:** M5-2, M5-3, M5-4
- **Build:** Build the blob store over Dexie (M5-4) + OPFS (M5-3): put(blob) hashes (M5-2), dedupes, increments refCount, and routes large rasters to OPFS and small blobs to the IndexedDB store (threshold is a tuning call — expose it as a named constant). get(hash), addRef/release(hash), and a gc() that deletes blobs at refCount 0 from BOTH stores. All mutations transactional. This is the data-loss-sensitive core: a refcount bug silently destroys referenced rasters.
- **Done when:** build/tsc green; manual smoke: put→get round-trips bytes, dedupe keeps one copy, release→gc removes orphans only, shared blobs survive one project's deletion. No automated gate for GC correctness.
- **Risk:** Refcount/GC errors = silent data loss (not a crash, not build-caught). The OPFS-vs-IDB size threshold (and whether OPFS is worth the complexity vs IDB-only) is an unspecified decision for Ruby.

#### M5-6 · Manifest schema + doc↔manifest serialization + untrusted-import validator — 🟡 review

- **Files:** `lib/substrata/persist/manifest.ts`, `lib/substrata/persist/validate.ts`
- **Deps:** M5-2, M5-4
- **Build:** Define the versioned manifest.json type (schemaVersion, artboard dims/resolution/bit-depth/colour, layers, per-layer effect stacks, blob-hash refs) per SPEC §13. Implement serializeDoc(doc)→manifest+blob set and deserializeManifest→doc against the M1 doc-model types. Add a hand-rolled validator (no zod in deps) that treats imported files as untrusted: check schemaVersion (reject/migrate, never auto-migrate destructively), verify each referenced blob's SHA-256 matches its content, ensure referenced blobs exist, and clamp artboard/raster dimensions to the iOS area budget (w·h ≤ 16,777,216). Raster-only — never reconstruct via Fabric toSVG (CVE surface).
- **Done when:** build/tsc green; manual round-trip smoke (doc→manifest→doc yields an equivalent scene); validator rejects a malformed/oversize/hash-mismatched manifest. No automated round-trip gate.
- **Risk:** Depends on the M1 doc-model shape, which is not built and may change — serialization contract may need revision. Untrusted-import hardening is security-load-bearing.

#### M5-7 · fflate STORE zip Worker (.js entry) — 🟢 safe

- **Files:** `lib/substrata/persist/zip.worker.js`, `lib/substrata/persist/zip.worker.d.ts`
- **Deps:** M5-1
- **Build:** Author the zip pack/unpack Worker that builds a .substrata STORE-mode zip = manifest.json + blobs/<sha256>, and unpacks it back to {manifest, Map<hash,bytes>}. MUST be a plain .js worker entry instantiated via new Worker(new URL('./zip.worker.js', import.meta.url)) — SPEC §5: a .ts entry can emit to /_next/static/media with a bad MIME under output:export. Provide a hand-written .d.ts for the message protocol. Hashing/verification of unpacked blobs reuses M5-2 inside the worker.
- **Done when:** npm run build green; inspect out/_next/static to confirm the worker emits as a fetchable JS asset (correct MIME), and the worker instantiates on the /editor route without a console error.
- **Risk:** Static-export worker URL/MIME gotcha (SPEC §5) is the whole point of this task — verify in the built out/ dir, not just dev.

#### M5-8 · Zip client orchestration (save→file, file→scene) — 🟡 review

- **Files:** `lib/substrata/persist/zip-client.ts`
- **Deps:** M5-5, M5-6, M5-7
- **Build:** Main-thread wrapper that, on Save: serializes the doc (M5-6), gathers the needed blobs from the blob store (M5-5), posts to the zip worker (M5-7), and returns a .substrata Blob/File. On Open: takes a File, posts to the worker to unpack, runs the untrusted validator (M5-6), writes blobs back into the blob store, and returns a doc ready to load. Handles worker lifecycle, transferables, and error propagation.
- **Done when:** build/tsc green; manual smoke: Save produces a .substrata file whose Open reconstructs the same scene; a tampered/corrupt file is rejected by the validator rather than loading garbage.
- **Risk:** End-to-end integrity (large-blob transfer, hash verification) is only confirmable by manual round-trip; no automated gate.

#### M5-9 · File access layer (FS Access pickers + fallback + handle persistence) — 🟢 safe

- **Files:** `lib/substrata/persist/file-access.ts`
- **Deps:** M5-1, M5-4
- **Build:** Wrap browser-fs-access (M5-1) for Save (fileSave) and Open (fileOpen, accept .substrata) with the <a download> (reuse lib/download.ts downloadBlob) and <input type=file> fallback for Firefox/Safari. On Chromium, persist the returned FileSystemFileHandle in the Dexie handles store (M5-4) so 'Save' (vs 'Save a copy') writes back to the same file; re-request permission on reuse. Secure-context guarded.
- **Done when:** build/lint green; /editor route renders Save/Open triggers; in Chromium the native picker opens and save-in-place reuses the handle; in Firefox/Safari the download + file-input fallback fires (observable).
- **Risk:** Save-in-place handle reuse needs a permission re-prompt (queryPermission/requestPermission) — the re-prompt UX is a small taste call worth a glance.

#### M5-10 · Storage capability wrappers (persist / persisted / estimate) — 🟢 safe

- **Files:** `lib/substrata/persist/storage.ts`
- **Deps:** —
- **Build:** Wrap navigator.storage.persist(), persisted(), and estimate() (usage/quota) with secure-context + feature guards returning typed capability results. Expose a persistOnFirstEdit() the editor calls once on the first mutation (SPEC §5), and an estimate accessor for the storage UX and the document inspector's size/stored-local fields.
- **Done when:** build/tsc green; on /editor the wrappers return sane values where supported and degrade (no throw) where not; persist() is requested at most once per session.
- **Risk:** persist() is heuristic and browser-dependent; persisted() may stay false on Safari — UI must not present it as a guarantee (handled in M5-14).

#### M5-11 · Project store (CRUD + thumbnails) — 🟡 review

- **Files:** `lib/substrata/persist/project-store.ts`
- **Deps:** M5-4, M5-5, M5-6
- **Build:** High-level API over Dexie + blob store: listProjects() (id, name, thumbnail, updatedAt, size), open(id)→doc, create(newScene), rename, duplicate (new id, addRef shared blobs — must not deep-copy rasters), delete (release blobs + run gc M5-5, drop handle). Capture a small thumbnail (downscaled Fabric canvas → blob/dataURL) on save/autosave and store it on the project record. Ties together M5-4/5/6.
- **Done when:** build/tsc green; manual smoke: create/list/open/rename/duplicate/delete behave correctly and duplicate shares (not copies) blobs while delete GCs only orphans.
- **Risk:** Duplicate ref-sharing and delete GC are data-integrity sensitive; thumbnail capture depends on the M1 Fabric canvas existing and on capture timing (autosave vs explicit save).

#### M5-12 · Crash-recovery snapshots — 🔴 decision

- **Files:** `lib/substrata/persist/recovery.ts`
- **Deps:** M5-4
- **Build:** Debounced transactional snapshot of the working doc into the Dexie snapshots store, plus on-open detection of a snapshot newer than the last saved project state to offer recovery. Coordinate with M1 autosave so this does not double-write; decide a retention count (e.g. keep last N per project). Recovery restore reloads the doc and re-points blobs.
- **Done when:** build/tsc green; manual smoke: kill the tab mid-edit, reopen, recovery is offered and restores; no recovery offered after a clean save.
- **Risk:** Overlaps M1 autosave (risk of double-writing / fighting it); snapshot debounce timing and retention count are tuning calls only Ruby should set.

#### M5-13 · Project manager UI — 🟡 review

- **Files:** `components/substrata/project-manager.tsx`
- **Deps:** M5-11
- **Build:** Build the project-manager surface (grid/list of saved scenes with thumbnails) reachable from the Scene menu (Open / Open recent / New scene). Apply DESIGN.md dense/flush/square language (radius 0, hairline 1px/2px hierarchy, .segmented groups, iA Writer Quattro, cream/forest-green/amber, text breathes / containers go flush). Actions: open, rename, duplicate, delete, new scene. Empty state when no projects. ALL user-facing strings are ∑CG copy-gaps (project-manager title, empty-state, action labels, delete confirmation, file-noun 'Scene') with commented spec/sample — author NO copy.
- **Done when:** build/lint green; /editor route renders the panel populated from the project store; visually matches DESIGN.md and the sketches/ mockups (owner QA). slopsieve --list shows the new ∑CG gaps.
- **Risk:** Layout/feel is taste against sketches/mockup.html; correctness of the dense/flush styling is not build-verifiable. Copy must be left as ∑CG (no words authored).

#### M5-14 · Storage UX surfaces (export-as-truth + persist prompt + inspector size/stored-local) — 🟡 review

- **Files:** `components/substrata/storage-status.tsx`
- **Deps:** M5-10, M5-11
- **Build:** Build the honest storage messaging surfaces: a persist/eviction nudge (especially Safari/iOS — prompt to export and/or Add-to-Home-Screen), the 'stored in this browser, exported file is the durable truth' framing, and wiring of estimate()/persisted() (M5-10) into the Scene menu's document-inspector size + stored-local fields (§7). Trigger persistOnFirstEdit on first mutation. NEVER present storage as 'crash-proof' (SPEC §5/§12). ALL strings are ∑CG copy-gaps (save-status text, persist prompt, Safari nudge, stored-local label) with commented spec/sample — author NO copy.
- **Done when:** build/lint green; /editor renders the storage surfaces; persist() requested once on first edit; estimate/persisted values shown; no string asserts durability. slopsieve --list shows the new ∑CG gaps.
- **Risk:** When/where to surface prompts (especially the Safari nudge) is a UX judgment; tone matters (honest, no dark patterns) but copy is ∑CG so wording is deferred to slopsieve.

#### M5-15 · Wire Scene menu + save-status into persistence — 🟡 review

- **Files:** `hooks/use-substrata-persist.ts`, `components/substrata/top-bar/scene-menu.tsx`
- **Deps:** M5-8, M5-9, M5-11, M5-13, M5-14
- **Build:** Connect the M0 top-bar/Scene-menu shell to the persistence stack: New scene, Open, Open recent, Import, Save, Save a copy, Rename, Duplicate, Delete handlers (Save vs Save-a-copy differ by handle reuse, M5-9). Wire the centre save-status indicator state machine (Saving… / Saved in browser / Unsaved changes — all ∑CG) off the autosave + zip-save pipeline. Provide a small React context/hook (hooks/use-substrata-persist.ts) exposing project state, save status, and the action handlers to the top bar and modules. (Export menu entry itself is M6.)
- **Done when:** build/lint green; /editor renders; each Scene-menu item invokes the correct flow (open project manager, file picker, save, etc.) and the save-status indicator reflects real state (observable). ∑CG gaps present for save-status strings.
- **Risk:** Depends on the not-yet-built M0 top-bar/Scene-menu component shape (path/props assumed); Save vs Save-a-copy and Open-recent semantics are UX calls to confirm against §7.

**Milestone risks**

- Prerequisite gap: M0 (Dexie schema v1, app/editor route + own root layout, top-bar/Scene-menu shell, secure-context guards) and M1 (doc-model TS types, autosave, Fabric canvas for thumbnails) are NOT built yet — every M5 task that touches the doc model, schema version, or top bar assumes a shape that may change.
- Namespace clash: lib/editor/ is already the unrelated ProseMirror text-editor tool. Substrata persistence must use a distinct namespace (proposed lib/substrata/ + components/substrata/, route app/editor/ per SPEC working name) — confirm M0's actual chosen layout before writing files there.
- No test suite: round-trip integrity (save→open yields an identical scene) and blob refcount/GC correctness (a bug = silent raster data loss, not a crash) cannot be gated by build/lint — they require manual smoke testing, which is Ruby's call to run/accept.
- Unspecified tuning decisions: the byte threshold routing 'large rasters' to OPFS vs the IndexedDB blob store (and whether OPFS is worth the complexity over IDB-only), plus snapshot retention count and debounce timing.
- browser-fs-access lib vs hand-roll: milestone text names browser-fs-access and the repo already hand-rolls downloads (lib/download.ts) — treat the lib as specified but confirm the extra dep is acceptable for offline/static-export/bundle.
- Recovery snapshots (M5-12) overlap M1 autosave — risk of two systems double-writing IndexedDB; their boundaries must be reconciled.
- Static-export Worker gotcha (SPEC §5): the zip worker must be a plain .js entry loaded via new Worker(new URL(...,'import.meta.url')); a .ts entry can ship with a broken MIME — must be verified in the built out/ dir, not just dev.
- Secure-context dependence: OPFS, FS Access, and crypto.subtle all need https/localhost; opening over file:// must degrade gracefully rather than throw.
- Honest-storage constraint (SPEC §2/§5/§12): no surface may claim durability/'crash-proof'; Safari/iOS ~7-day bucket eviction means the export-as-truth nudge is correctness, not polish.
- Copy freeze: every user-facing string (save-status, storage prompts, project-manager empty state, delete confirm, file-noun 'Scene') must be left as a ∑CG gap with commented spec/sample — no wording authored — and resolved later via slopsieve.

---

### M6 — Export (Substrata image editor)

Build the Substrata export pipeline: encode the artboard (or a soloed layer) to PNG/JPG/WebP via native canvas, AVIF via lazy @jsquash WASM, at 1×/2× scale with a lossy-only quality slider, social-size presets, a live debounced size estimate, and — critically — the gauntlet's silent-corruption guards: clamp every export to the iOS area budget (w·h ≤ 16,777,216, area-based not per-axis), tile+stitch when an output exceeds the budget/texture cap, and verify the produced blob (pixel-sample + size) to catch Safari's silent transparent-canvas failure and retry smaller. Surface it as a rail "Export" module plus the top-bar Export action. All user-facing strings are left as ∑CG gaps. The pure pipeline is built behind a RenderSource interface so it compiles before M1's Fabric/doc-model render path exists; wiring it to the real canvas, the WASM-under-static-export plumbing, tile-seam correctness, and Safari verification are the parts a machine cannot prove.

**Effort:** L, leaning XL. Roughly 13 tasks spanning pure math (clamp), worker+OffscreenCanvas plumbing, a new WASM dependency hosted under static export, tile+stitch, a verify/retry guard, a live-estimate hook, and a DESIGN-conformant module + top-bar wiring. The code volume is moderate, but three high-friction areas inflate it: the static-export WASM/worker minefield (SPEC §5's explicitly-flagged silent-failure class), tile-seam correctness with effects, and Safari/iOS verification — each needs real-device iteration rather than a quick build loop. Add the cross-milestone dependency on M1's render path (not yet built), and the realistic effort lands at the top of L / bottom of XL.

**Autonomy verdict:** Partly, with a real catch. An unattended agent CAN, overnight, build the pure spine and get a green build + a rendering /editor Export module: M6-1 (types/RenderSource), M6-2 structure, M6-3 (area-clamp), and the scaffolding of the encoder/orchestrator/module all compile and tsc-verify behind the RenderSource interface even before M1 lands. What it CANNOT self-certify is everything that matters for correctness: (1) the @jsquash AVIF WASM actually loading under output:'export' (Turbopack/static-export gotcha — compiles fine, can 404/mis-MIME only in the built output); (2) the Worker+OffscreenCanvas path on Safari and the main-thread fallback; (3) the output-verify guard against Safari's ACTUAL silent transparent-canvas failure, which is not reproducible in Chromium/CI; (4) tile-stitch seams with neighbour-sampling filters (visual-only artifact); (5) the module matching the sketches and the undecided preset-resizes-artboard-or-not UX call. So: build-green ≠ correct here. Treat the safe tasks as overnight-able and stage the needs-human-review/decision tasks for a hands-on Safari/iOS pass with Ruby. Hard blocker: M6 genuinely needs M1's doc→Fabric render path (RenderSource impl) and ideally M5's saver/zip — none of M0–M5 exist on this branch yet, so a fully end-to-end export can't be exercised until M1 is merged.

| Task | Title | Autonomy | Deps |
| --- | --- | --- | --- |
| M6-1 | Export core types + RenderSource interface + option model | 🟢 safe | — |
| M6-2 | Social-size preset table (platforms × pixel dimensions) | 🔴 decision | M6-1 |
| M6-3 | Area-clamp + scale/dimension resolver | 🟢 safe | M6-1 |
| M6-4 | Output verify + shrink-retry | 🟡 review | M6-1 |
| M6-5 | Encoder + Worker (native toBlob + native-first AVIF → lazy @jsquash WASM fallback) | 🟡 review | M6-1, M6-6 |
| M6-6 | Add @jsquash/avif + host its WASM under static export | 🔴 decision | — |
| M6-7 | Tile + stitch render path for oversize / 2× exports | 🟡 review | M6-1, M6-3 |
| M6-8 | Live size estimate (debounced background-encode of preview proxy) | 🟡 review | M6-1, M6-5 |
| M6-9 | Per-layer solo export (transparent offscreen) | 🟡 review | M6-1, M6-10 |
| M6-10 | Export orchestrator (resolve → render → tile → encode → verify → retry → deliver) | 🟡 review | M6-3, M6-4, M6-5, M6-7 |
| M6-11 | Export rail module UI | 🟡 review | M6-2, M6-8, M6-10 |
| M6-12 | Top-bar Export action wiring | 🟡 review | M6-11 |
| M6-13 | Batch social-size export → zip (post-v1 'should') | 🔴 decision | M6-10, M6-11 |

#### M6-1 · Export core types + RenderSource interface + option model — 🟢 safe

- **Files:** `lib/substrata/export/types.ts`
- **Deps:** —
- **Build:** Create the export module's TypeScript surface. Define ExportFormat ('png'|'jpeg'|'webp'|'avif'), ExportScale (1|2), ExportScope ('artboard'|'layer'), ExportOptions (format, scale, quality 1–100 lossy-only, preset?, scope, layerId?, background/transparency), and the result type (blob, dimensions, bytes, format, downscaled:boolean). Crucially, declare a `RenderSource` interface that decouples M6 from M1's Fabric internals: `{ width:number; height:number; render(opts:{ scale:number; region?:{x,y,w,h}; soloLayerId?:string; transparent:boolean }): Promise<HTMLCanvasElement|OffscreenCanvas|ImageBitmap> }`. M1's canvas controller will implement this. No copy here (types only).
- **Done when:** `npm run build` (which runs tsc strict) is green with the new module imported nowhere-breaking; types export cleanly. No new lint errors.
- **Risk:** RenderSource shape must match what M1 actually exposes; if M1 lands a different render signature this interface needs a one-line adapter. Low risk — it's the contract M1 should target.

#### M6-2 · Social-size preset table (platforms × pixel dimensions) — 🔴 decision

- **Files:** `lib/substrata/export/presets.ts`
- **Deps:** M6-1
- **Build:** Author a config table of social export presets reusing the existing data already in the repo: ratios from components/tools/social-cropper.tsx (IG 1:1/4:5/1.91:1/9:16, Bluesky, Threads) and pixel sizes from matte-generator.tsx (SIZE_PRESETS [1080,1200,1440,2048]) to produce concrete WxH targets (e.g. 1080×1080, 1080×1350, 1080×1920). Structure as factual config: platform id + width + height + a `labelKey`. Platform identifiers and pixel dimensions are factual data, NOT copy; any human-facing display name/description is a ∑CG gap with commented spec/sample (e.g. // ∑CG: preset display label, ≤16 chars). WHICH platforms and exact canonical dimensions ship is a product call for Ruby.
- **Done when:** Build green; table is typed against ExportOptions/preset type from M6-1; every display string is a ∑CG placeholder (grep `∑CG` finds them), no live wording.
- **Risk:** The canonical 2026 platform dimensions drift and aren't enumerated in SPEC; shipping wrong sizes silently produces mis-sized exports. Ruby must confirm the preset list. Also: does picking a preset resize the artboard or just fit/crop on export? — undecided in SPEC (see M6-11).

#### M6-3 · Area-clamp + scale/dimension resolver — 🟢 safe

- **Files:** `lib/substrata/export/area-clamp.ts`
- **Deps:** M6-1
- **Build:** Pure function: given artboard (or preset) dimensions, a requested scale (1×/2×), and the device GL/area caps, compute the actual output dimensions. Enforce the iOS AREA budget w·h ≤ 16,777,216 (SPEC §5: area-based, NOT a 4096 per-axis cap) and a texture-size cap passed in (min(cap, gl.MAX_TEXTURE_SIZE) from M1). Return { outW, outH, downscaled:boolean, needsTiling:boolean, tileGrid?, effectiveScale }. When 2× would exceed the area budget, downscale-to-fit and report effectiveScale < 2 so the UI can warn the user (∑CG message) that 2× was reduced. Decide tiling when a single output canvas would exceed the texture cap. Keep it dependency-free and exported for reuse by the worker.
- **Done when:** Build/tsc green; function is pure and exhaustively typed. Verify by hand in a devtools/scratch console: a 6000×6000 artboard at 2× resolves to downscaled:true with outW·outH ≤ 16,777,216; a small artboard passes through unchanged. (No automated test harness in repo.)
- **Risk:** Off-by-one between area clamp and texture-cap clamp could either over-shrink (quality loss) or leave an oversize tile (Fabric #6805 silently renders ~30% of pixels). Pure math, so reviewable by reading.

#### M6-4 · Output verify + shrink-retry — 🟡 review

- **Files:** `lib/substrata/export/verify.ts`
- **Deps:** M6-1
- **Build:** Implement the SPEC §5 verification guard that catches Safari's silent transparent-canvas / empty-blob export failure. After encoding, verify the blob: check blob.size is plausibly non-trivial (not ~0/header-only), and sample-decode it (createImageBitmap + draw a few scanlines to a 1×1/NxN probe canvas) to confirm non-empty / non-fully-transparent pixels where content is expected. On failure, return a retry directive (re-render at a smaller effective scale and re-encode), bounded to a small number of attempts before surfacing a hard error (∑CG error copy). Pure logic taking a blob + an expected-content predicate.
- **Done when:** Build green; function exported and called by the orchestrator (M6-10). Logic is deterministic and readable. Correctness against the ACTUAL Safari failure can only be confirmed on a real Safari/iOS device — flag for manual device check.
- **Risk:** The real Safari silent-failure trigger is environment-specific and not reproducible in CI/Chromium; the heuristic (size + pixel sample) may false-negative. Needs hands-on Safari/iOS verification — the #1 reason this milestone can't be signed off purely by build-green.

#### M6-5 · Encoder + Worker (native toBlob + native-first AVIF → lazy @jsquash WASM fallback) — 🟡 review

- **Files:** `lib/substrata/export/encode.ts`, `lib/substrata/export/encode.worker.js`
- **Deps:** M6-1, M6-6
- **Build:** Encode off the main thread. Worker ENTRY must be plain .js (SPEC §5: a .ts entry can emit to /_next/static/media with a bad MIME) instantiated via `new Worker(new URL('./encode.worker.js', import.meta.url))`. Worker draws the transferred ImageBitmap/region to an OffscreenCanvas and runs canvas.toBlob/convertToBlob for png/jpeg/webp; for AVIF, try native first and feature-detect via the returned blob.type (SPEC §5) — if it isn't 'image/avif', lazy-import @jsquash/avif and encode via WASM. Quality applies to lossy formats only (png ignores it). Provide a main-thread fallback path for browsers without OffscreenCanvas-in-worker (older Safari) with a visible 'slower' state (∑CG). Guard for secure context (Workers require https/localhost) and degrade gracefully over file://. Reuse the canvasToBlob/AVIF-detect patterns from components/tools/image-converter.tsx.
- **Done when:** Build green AND after `npm run build` the worker chunk is emitted under out/_next/static (observable). In `npm run dev`, exporting PNG/JPG/WebP downloads a valid file; AVIF downloads a valid .avif. Manual cross-browser check required (OffscreenCanvas + WASM).
- **Risk:** Worker + OffscreenCanvas under output:'export' is the static-export minefield; Safari OffscreenCanvas-in-worker support and the WASM-in-worker load path can compile fine yet fail at runtime. Build cannot prove it works — needs real-browser verification.

#### M6-6 · Add @jsquash/avif + host its WASM under static export — 🔴 decision

- **Files:** `package.json`, `public/wasm/`, `lib/substrata/export/avif-wasm.ts`, `next.config.ts`
- **Deps:** —
- **Build:** Add the @jsquash/avif dependency (the SPEC-mandated AVIF codec; Apache-2.0). Do NOT use `import x from 'x.wasm?url'` / `type:'asset'` — Turbopack ignores it under output:'export' (SPEC §5). Instead copy the codec .wasm into /public (e.g. public/wasm/) and wire @jsquash's locateFile/wasmBinary hook to fetch from the public path, or use resolveAlias + a static `new URL('x.wasm', import.meta.url)`. Add a tiny prebuild/copy step if needed so the wasm is always present in /public (and thus in `out/`). Document the exact loader wiring next to encode.worker.js.
- **Done when:** `npm run build` green; the .wasm file is present in `out/` after build (observable: `ls out/wasm`). In dev, an AVIF export produces a file whose first bytes are a valid AVIF/ftyp box. Cross-browser manual check.
- **Risk:** Adding a new runtime dep + the Turbopack/static-export WASM gotcha is exactly the class SPEC §5 flags as silently broken. Hosting strategy (copy-to-public vs resolveAlias) and dep-add are Ruby's call; getting it wrong yields an AVIF path that 404s or mis-MIMEs only in the exported build.

#### M6-7 · Tile + stitch render path for oversize / 2× exports — 🟡 review

- **Files:** `lib/substrata/export/tile-stitch.ts`
- **Deps:** M6-1, M6-3
- **Build:** When M6-3 reports needsTiling, render the artboard in a tile grid via repeated RenderSource.render({ region }) calls and stitch the tiles onto one output canvas (or stream tile blobs to the encoder when even the stitched canvas would exceed the cap). Each tile must respect the texture-size cap. Drive composition deterministically (row-major), draw at integer pixel offsets to avoid sub-pixel seams. CRITICAL CORRECTNESS NOTE for review: neighbour-sampling effects (Gaussian blur, convolute/sharpen/emboss, vignette) applied per-tile sample outside the tile and will produce visible seams; document this limitation and either render those layers whole when they fit, or add an overlap/bleed margin per tile and crop. Surface the chosen tradeoff.
- **Done when:** Build green; tiling logic exercised via a mock RenderSource that returns coloured regions, producing a correctly stitched output with no gaps/overlaps in a scratch harness. Seam-free correctness with real effects needs human visual review.
- **Risk:** Tile seams with neighbour-sampling WebGL filters are a genuine correctness hazard that compiles cleanly and only shows as artifacts in the pixels. Requires visual inspection of a tiled 2× export of a blurred/sharpened layer.

#### M6-8 · Live size estimate (debounced background-encode of preview proxy) — 🟡 review

- **Files:** `lib/substrata/export/use-size-estimate.ts`
- **Deps:** M6-1, M6-5
- **Build:** Implement a hook that estimates the output file size live as format/scale/quality change (SPEC §9 'live size estimate (bg-encode)'). Encode a downscaled preview proxy (the ~1–2MP fit-to-viewport proxy M1 already maintains) in the worker, scale the resulting byte count up by the area ratio to the full output to approximate the real size, and rAF/debounce-coalesce so dragging the quality slider doesn't thrash the worker. Show a clearly-approximate value (e.g. '~1.2 MB', the '~' conveyed in a ∑CG-labelled format string). Reuse the formatSize helper pattern from image-converter.tsx.
- **Done when:** Build green; hook returns a debounced estimate string; in dev the value updates without freezing the UI while dragging quality. 'Feels live / estimate is close enough' is a UX judgement.
- **Risk:** Proxy-scaled estimate can diverge from true size (compression isn't linear in area), risking a misleading number; acceptable-accuracy threshold is Ruby's call.

#### M6-9 · Per-layer solo export (transparent offscreen) — 🟡 review

- **Files:** `lib/substrata/export/solo.ts`
- **Deps:** M6-1, M6-10
- **Build:** Implement layer-solo export (SPEC §9 'per-layer solo (transparent offscreen)'): render a single doc-model layer in isolation onto a transparent offscreen surface via RenderSource.render({ soloLayerId, transparent:true }), with the layer's own effects stack + opacity/blend applied but composited against transparency (no artboard background, no other layers). Force PNG/WebP/AVIF (alpha-capable) and disable JPEG when scope=layer with transparency (∑CG note). Output is fed through the same clamp→tile→encode→verify path.
- **Done when:** Build green; soloing a layer in dev produces a correctly-cropped, alpha-preserving image (visual check). Depends on M1's render path honouring soloLayerId+transparent.
- **Risk:** Transparency/blend-mode fidelity in isolation depends entirely on M1's render implementation; premultiplied-alpha or blend-against-black bugs compile fine but corrupt edges. Visual review required.

#### M6-10 · Export orchestrator (resolve → render → tile → encode → verify → retry → deliver) — 🟡 review

- **Files:** `lib/substrata/export/run-export.ts`
- **Deps:** M6-3, M6-4, M6-5, M6-7
- **Build:** The single entry the UI calls: takes ExportOptions + a RenderSource, runs area-clamp (M6-3) to get dims/tiling, renders whole-canvas or via tile-stitch (M6-7) or solo (M6-9), encodes in the worker (M6-5), verifies + shrink-retries (M6-4), then delivers via the existing lib/download.ts `downloadBlob` (reuse, don't re-implement the <a download> dance) or hands the blob to FS Access if M5's saver is available. Emits progress events (encoding / tiling N of M / verifying / retrying-smaller) for the UI; all status strings are ∑CG. No new download primitive.
- **Done when:** Build green; a full export from the module in dev produces a verified file end-to-end across PNG/JPG/WebP/AVIF at 1× and 2×, including a forced-tiling large export. Progress states observable in UI.
- **Risk:** It's the integration seam across every other task plus M1's render path and M5's saver; many runtime-only failure modes (worker handoff, ImageBitmap transfer, retry loop termination) that build cannot catch.

#### M6-11 · Export rail module UI — 🟡 review

- **Files:** `components/substrata/modules/export-module.tsx`
- **Deps:** M6-2, M6-8, M6-10
- **Build:** Build the 'Export' module for the utility rail (SPEC §8 module list) following DESIGN.md (dense/flush/square, .segmented groups, 2px frame / 1px nested, font-mono, no rounded-*). Controls: format as a .segmented group (PNG/JPG/WebP/AVIF — mirror image-converter's segmented format picker), 1×/2× scale segmented toggle, quality Slider shown ONLY for lossy formats, social-preset picker (M6-2), scope toggle (whole artboard / current layer solo), the live size estimate (M6-8), a downscale/2×-reduced warning when effectiveScale<2, and a primary flush Export button (DESIGN §9 pattern). All labels/helptext/warnings/button copy are ∑CG gaps with commented spec/sample — author NO live wording. Wire to run-export (M6-10). UNDECIDED for Ruby: does choosing a social preset resize the artboard or only fit/crop on export?
- **Done when:** Build green; module renders inside the /editor route (observable render); pinned in the rail it conforms to one-uniform-height (SPEC §8); `grep ∑CG` finds every string, none are live copy; no new lint errors.
- **Risk:** Whether the layout/interaction matches the sketches (mockup.html / modals.html) and the preset-vs-artboard behaviour are taste/UX calls only Ruby can sign off; build only proves it compiles.

#### M6-12 · Top-bar Export action wiring — 🟡 review

- **Files:** `components/substrata/top-bar/export-action.tsx`
- **Deps:** M6-11
- **Build:** Wire the top-bar Export control (SPEC §7 right cluster: undo/redo · zoom · Export · theme) to the export flow — open/pin the Export module (M6-11) or trigger a one-click export of the last-used options, consistent with the omnibar/rail docking model from M0. Reuse the top-bar shell M0 builds; do not duplicate chrome. Any tooltip/label is ∑CG.
- **Done when:** Build green; the top-bar Export button appears on /editor and opens/triggers the export module (observable in dev). No live copy (∑CG only).
- **Risk:** Depends on M0's top-bar API existing; if M0 isn't merged this is blocked. Behaviour (open module vs instant export) is a UX call.

#### M6-13 · Batch social-size export → zip (post-v1 'should') — 🔴 decision

- **Files:** `lib/substrata/export/batch.ts`, `components/substrata/modules/export-module.tsx`
- **Deps:** M6-10, M6-11
- **Build:** Optional: export multiple selected social presets in one action, zipped. SPEC §9 lists 'batch social-size export' under Should (post-v1, pre-stretch), so confirm it's in M6 scope before building. Iterate the orchestrator (M6-10) over selected presets, collect verified blobs, and zip them — reuse M5's fflate STORE-mode zip-in-worker if available, else the jszip pattern already used in image-converter.tsx (downloadAllAsZip). Filenames are derived from preset ids (factual), not authored copy.
- **Done when:** Build green; selecting N presets produces one zip containing N verified images in dev. Gate behind Ruby's go/no-go for v1 scope.
- **Risk:** SPEC explicitly defers this to post-v1; building it now may be out of scope and competes with M6 core. Scope decision belongs to Ruby.

**Milestone risks**

- Static-export WASM/Worker plumbing (@jsquash AVIF, OffscreenCanvas) is SPEC §5's #1 silent-failure class: it compiles and passes build but can 404/mis-MIME or no-op only in the exported `out/` build or only on Safari — build-green is not proof.
- Output-verify is guarding against Safari's silent transparent-canvas failure, which is NOT reproducible in Chromium/CI; the size+pixel-sample heuristic can only be validated on real Safari/iOS.
- Tile+stitch with neighbour-sampling filters (blur/sharpen/convolute/vignette) produces seam artifacts that compile cleanly and only appear in pixels — needs visual review and a documented bleed/whole-render tradeoff.
- Area-clamp interacts with Fabric #6805: an oversize tile silently renders ~30% of pixels instead of throwing, so any off-by-one between the area budget (16,777,216) and the texture-size cap corrupts large exports invisibly.
- Hard cross-milestone dependency: M6 needs M1's doc→Fabric RenderSource (soloLayerId/transparent/region) and M0's top-bar + rail module system, plus M5's saver/zip — none exist on this branch yet, so end-to-end export can't be exercised until those land.
- Underspecified UX calls SPEC leaves open: whether a social preset resizes the artboard or only fits/crops on export; exact canonical 2026 preset dimensions; whether 2×-reduced-by-area-clamp needs an explicit user warning. These are Ruby decisions, not agent guesses.
- All user-facing strings (format warnings, '~size' estimate, downscale notice, errors, button/tooltip labels) must stay ∑CG per the no-copywriting rule; easy for an agent to accidentally author live microcopy.
- lib/editor/ is already the markdown text-editor's namespace — Substrata export code must live under lib/substrata/export/ (and components/substrata/) to avoid collision/confusion.

---

### M7 — Smarts (Remove Background bake effect · align/distribute · magic resize)

M7 adds the three "smart" capabilities to the Substrata editor: (1) Remove Background as an async, non-destructive bake effect on a raster layer — BiRefNet-lite fp16 ONNX run via @huggingface/transformers, self-hosted weights + ORT runtime, cached in IndexedDB (Dexie), WebGPU with a single-thread WASM fallback, emitting a grayscale alpha matte cached per layer and alpha-multiplied at composite (original RGBA preserved; toggle restores; re-bake only on source/param change); (2) align/distribute for multi-selected layers, surfaced in the omnibar overflow bar; (3) magic resize — change artboard dimensions to a preset/aspect and reflow layers. All client-only under output:"export", React 19, Fabric ^7.4.0, dense/flush/square DESIGN.md language, British spelling, and no authored user-facing copy (all strings left as ∑CG gaps).

**Effort:** XL. The background-removal bake alone is a vertical slice (v4 runtime upgrade + self-hosted ~115 MB weights pipeline + IndexedDB caching + worker + WebGPU/WASM fallback + non-destructive doc-model bake integration + async UI), every layer of which has an unproven/under-specified element. Add two more features (align/distribute, magic resize) and the hard reality that all M0-M6 prerequisites are still unbuilt on this branch (only SPEC/DESIGN/sketches exist). The two pure-geometry tasks are S, but the ML and resize spine push the whole milestone to XL.

**Autonomy verdict:** No — not safe to run unattended to a correct result. Two of the eleven tasks (M7-6 align geometry, M7-10 preset extraction) are genuinely safe/build-verifiable and could run overnight. But the milestone's spine cannot: M7-1 carries open decisions (how to host a ~115 MB model under static export given Cloudflare's 25 MiB/file limit, the breaking transformers v3→v4 bump, model licensing) and M7-8 magic-resize has an undefined reflow algorithm — both needs-human-decision. The ML pipeline (M7-2..M7-5) will compile but its correctness (WebGPU fp16 actually running, IndexedDB cache persisting, matte quality, alpha-composite/restore, fallback responsiveness) is only confirmable by a human running the real model in multiple browsers — there is NO automated test suite, so the only unattended gate is 'it builds + the /editor route renders'. The biggest catch: none of M0-M6 exist on this branch yet, so an agent has no doc model, bake framework, Effects module, omnibar overflow bar, Dexie schema, or multi-selection to build against — M7 is currently un-startable in isolation.

| Task | Title | Autonomy | Deps |
| --- | --- | --- | --- |
| M7-1 | Upgrade transformers to ^4.2, self-host BiRefNet-lite fp16 + ORT runtime, configure offline env | 🔴 decision | — |
| M7-2 | Model loader service: IndexedDB (Dexie) cache + WebGPU/WASM device detection + progress | 🟡 review | M7-1 |
| M7-3 | Background-removal inference + grayscale alpha matte extraction (worker) | 🟡 review | M7-2 |
| M7-4 | Remove Background bake effect in the doc model (matte cache, alpha-multiply composite, toggle/restore/re-bake) | 🟡 review | M7-3 |
| M7-5 | Remove Background bake UI in the Effects module (async row: trigger, progress, device state, error, toggle) | 🟡 review | M7-4 |
| M7-6 | Align / distribute geometry (pure functions over doc-model layer bboxes) | 🟢 safe | — |
| M7-7 | Align / distribute controls in the omnibar overflow bar | 🟡 review | M7-6 |
| M7-8 | Magic resize: artboard re-dimension + layer reflow engine | 🔴 decision | M7-10 |
| M7-9 | Magic resize UI (preset + custom-dimension picker in the overflow bar) | 🟡 review | M7-8 |
| M7-10 | Extract social-size presets into a shared lib reused by editor + cropper | 🟢 safe | — |
| M7-11 | M7 integration build gate + non-parity doc note | 🟢 safe | M7-5, M7-7, M7-9 |

#### M7-1 · Upgrade transformers to ^4.2, self-host BiRefNet-lite fp16 + ORT runtime, configure offline env — 🔴 decision

- **Files:** `package.json`, `scripts/fetch-birefnet-assets.mjs`, `app/editor/lib/bg-removal/transformers-env.ts`, `public/editor/models/birefnet-lite/.gitkeep`, `public/editor/ort/.gitkeep`, `.gitignore`
- **Deps:** —
- **Build:** Bump @huggingface/transformers from ^3.8.1 to ^4.2 in package.json (SPEC §4/§5 require v4 for BiRefNet-lite WebGPU fp16). Add scripts/fetch-birefnet-assets.mjs that downloads the MIT BiRefNet-lite fp16 ONNX weights + config/preprocessor json into public/editor/models/birefnet-lite/, and the onnxruntime-web .wasm/.mjs runtime into public/editor/ort/ (self-host — NEVER fetch from the HF CDN, per §5 privacy/offline). Add app/editor/lib/bg-removal/transformers-env.ts that sets env.allowRemoteModels=false, env.localModelPath='/editor/models/', and env.backends.onnx.wasm.wasmPaths='/editor/ort/' so the runtime loads only self-hosted assets under static export. Do NOT reuse the BRIA RMBG model from components/tools/background-remover.tsx (non-commercial — explicitly dropped in §4). Keep the heavy import lazy (dynamic import on first bake, never on editor route load, per §5).
- **Done when:** npm install resolves transformers ^4.2; scripts/fetch-birefnet-assets.mjs runs and populates public/editor/models/ + public/editor/ort/; npm run build stays green and the existing /tools/background-remover route still renders (verify the v3→v4 API change didn't break it, or that it is isolated).
- **Risk:** Two open calls only Ruby should make: (a) where/how to host a ~115 MB model under static export — Cloudflare Pages has a 25 MiB per-file limit (noted in lib/pandoc/client.ts), so committing/chunking/alt-host must be decided; (b) the v3→v4 transformers bump is a breaking API change that also affects the existing standalone background-remover tool, and §12 flags the v4 WebGPU runtime as 'unproven for BiRefNet-lite — smoke-test early'.

#### M7-2 · Model loader service: IndexedDB (Dexie) cache + WebGPU/WASM device detection + progress — 🟡 review

- **Files:** `app/editor/lib/bg-removal/model-loader.ts`, `app/editor/lib/db.ts`
- **Deps:** M7-1
- **Build:** Create app/editor/lib/bg-removal/model-loader.ts: a singleton that lazily resolves a transformers pipeline for BiRefNet-lite. Feature-detect navigator.gpu → device:'webgpu' (dtype fp16); on absence/failure fall back to device:'wasm' single-thread q8, exposing a flag the UI can surface as a 'slower on this browser' state (§5/§12). Cache the fetched model blobs in IndexedDB via a new Dexie 'models' store (content-keyed) — NOT the Cache API (§5: iOS ~50 MB partition cap throws QuotaExceededError). Add the 'models' table by bumping the Dexie schema version in app/editor/lib/db.ts (the M0 schema), declaratively and non-destructively. Surface a progress callback (downloading %, building, ready) and guard all secure-context APIs so file:// degrades gracefully (§5).
- **Done when:** tsc/npm run build clean; the Dexie version bump compiles and opens without a migration error; navigator.gpu detection branch is observable (e.g. logged device choice) when the editor route loads in WebGPU vs non-WebGPU browsers.
- **Risk:** Compiles but correctness (does the IndexedDB cache actually persist + reload the weights, does WASM fallback truly engage and stay responsive) can only be confirmed by running with the real ~115 MB model in WebGPU and non-WebGPU browsers — there is no test suite. Depends on the M0 Dexie schema existing.

#### M7-3 · Background-removal inference + grayscale alpha matte extraction (worker) — 🟡 review

- **Files:** `app/editor/lib/bg-removal/birefnet.worker.js`, `app/editor/lib/bg-removal/matte.ts`
- **Deps:** M7-2
- **Build:** Create app/editor/lib/bg-removal/birefnet.worker.js (prefer a .js worker entry — §5 warns a .ts entry can emit to /_next/static/media with a bad MIME under static export) instantiated via new Worker(new URL('./birefnet.worker.js', import.meta.url)). The worker runs the pipeline from M7-2 off the main thread on an ImageBitmap of the layer's source raster and posts back a single-channel grayscale alpha matte (Uint8 mask sized to the source). Add app/editor/lib/bg-removal/matte.ts with pure helpers to normalise the model output into a matte (port the mask-handling shape from components/tools/background-remover.tsx lines 130-213 — toDataURL/Blob/raw-data cases — but emit a matte, NOT a composited PNG). Cap/resize working raster to the textureSize budget before inference (§5 oversize-source rule).
- **Done when:** npm run build emits the worker chunk without MIME/URL errors and the editor route renders; matte.ts pure helpers type-check; manually triggering a bake produces a matte whose dimensions match the source.
- **Risk:** Worker-under-static-export plumbing is fiddly (the .ts→bad-MIME trap, transformers' own ORT-worker proxying may conflict with our worker). Matte quality vs the source is a visual judgment. Whether WebGPU inference runs at all inside a dedicated worker is unproven (§12).

#### M7-4 · Remove Background bake effect in the doc model (matte cache, alpha-multiply composite, toggle/restore/re-bake) — 🟡 review

- **Files:** `app/editor/lib/doc-model/effects.ts`, `app/editor/lib/doc-model/composite.ts`, `app/editor/lib/doc-model/types.ts`
- **Deps:** M7-3
- **Build:** Wire the bake into the M3 effects-stack data model (app/editor/lib/doc-model/*). Add a 'remove-background' async bake-effect descriptor to the layer's effects stack types; store the resulting matte cached per layer (content-addressed, ref to the source hash) so re-bake fires ONLY on source/param change (§6). At composite, alpha-multiply the layer's alpha by the cached matte — a generated alpha channel, NOT a Fabric clipPath/mask (§6/§11 'no masks'). Keep the original RGBA so toggling the effect off restores it. Bake mutations must flow doc→Fabric one-way and be undoable as command/patch entries on the doc model (§5), never via Fabric JSON. Gate against text layers (effects are Image-only) per §5 — either require rasterize-text first or disallow, never a silent no-op.
- **Done when:** tsc/npm run build clean; the effects stack serialises/deserialises a remove-background entry through the M5 Dexie/.substrata round-trip without loss; toggling the effect off and on, and undo/redo, are observable in the running editor and restore original pixels.
- **Risk:** Correctness of alpha-multiply at composite, original-RGBA preservation, re-bake invalidation, and undo coherence is all visual/behavioural with no automated gate. Depends on M3 effects-stack and M1 command/patch undo existing.

#### M7-5 · Remove Background bake UI in the Effects module (async row: trigger, progress, device state, error, toggle) — 🟡 review

- **Files:** `app/editor/components/modules/effects-module.tsx`, `app/editor/components/modules/bake-effect-row.tsx`
- **Deps:** M7-4
- **Build:** Add the async 'Remove Background' bake row to the M3 Effects accordion module (single-open accordion, flush/segmented per DESIGN.md §6-7, square radius:0, 1px nested / 2px section borders). UI states: idle (run button), downloading (progress %), processing, done (toggle on/off), error (retry), plus a visible 'slower on this browser' indicator when the WASM fallback path from M7-2 is active. Wire the run button to M7-4's bake action and the model-loader progress. ALL user-facing strings are ∑CG gaps with commented spec/sample (button label, progress states, the cutout/effect-gating body for text layers per §14, the WASM-fallback notice, error text) — author NO copy.
- **Done when:** npm run build green and the editor route renders the bake row inside the Effects accordion with correct flush/square styling; npm run lint adds no new errors; slopsieve --list shows the new ∑CG gaps (no live copy authored).
- **Risk:** Whether the async states read well and the row 'feels right' in the accordion is a taste/UX call for Ruby; copy must be filled via slopsieve before ship. Depends on the M3 Effects module existing.

#### M7-6 · Align / distribute geometry (pure functions over doc-model layer bboxes) — 🟢 safe

- **Files:** `app/editor/lib/geometry/align.ts`
- **Deps:** —
- **Build:** Create app/editor/lib/geometry/align.ts with pure, deterministic functions operating on the selected layers' bounding boxes from the doc model: align left / centre-h / right / top / middle-v / bottom, and distribute horizontally / vertically (equal gaps and equal centres). Support alignment relative to the selection bounds and relative to the artboard. Functions return position patches to apply via the M1 command/patch system (one-way doc→Fabric); no Fabric mutation here. British spelling in identifiers/comments (centre).
- **Done when:** tsc/npm run build clean; functions are pure (no DOM/Fabric imports) and deterministic — verifiable by build + a quick throwaway node script computing known bbox cases; outputs are position patches the M1 patch system accepts.
- **Risk:** Mechanical geometry; main risk is mismatch with the M1/M2 multi-selection model and patch shape, which the build will catch at the call site.

#### M7-7 · Align / distribute controls in the omnibar overflow bar — 🟡 review

- **Files:** `app/editor/components/omnibar/overflow-bar.tsx`, `app/editor/components/omnibar/align-controls.tsx`
- **Deps:** M7-6
- **Build:** Add the align/distribute icon grid to the omnibar overflow (second) bar — §8 places 'canvas size · document setup · align · rotate' there. Flush square icon buttons (lucide-react: AlignStartVertical/AlignCenterHorizontal/etc.), DESIGN.md .segmented grouping, disabled when fewer than 2 layers are selected (distribute needs 3). Each button calls an M7-6 function and dispatches the resulting patches. Any tooltips/labels are ∑CG gaps. No authored copy.
- **Done when:** npm run build green and the overflow bar renders the align grid with correct flush/square styling; buttons disable/enable on selection count; npm run lint adds no new errors.
- **Risk:** Visual placement/density in the overflow bar and the disabled-state UX are taste calls. Depends on the M0/cross-cutting omnibar + overflow bar and M1/M2 selection existing.

#### M7-8 · Magic resize: artboard re-dimension + layer reflow engine — 🔴 decision

- **Files:** `app/editor/lib/geometry/magic-resize.ts`
- **Deps:** M7-10
- **Build:** Create app/editor/lib/geometry/magic-resize.ts: given a target artboard size/aspect, resize the artboard and reflow layers. Implement at minimum the deterministic strategies (scale-to-fit, centre, anchor-based reposition, proportional scale of layer transforms relative to the artboard). Reuse the social presets (see M7-10). Output is a command/patch transaction (artboard dims + per-layer position/scale patches) so it is undoable via M1. Pure module — no Fabric.
- **Done when:** tsc/npm run build clean; module is pure/deterministic and emits a single undoable patch transaction; resizing to a preset then undoing restores prior dims/positions in the running editor.
- **Risk:** UNDER-SPECIFIED: the SPEC only names 'magic resize' in M7 (§15) and never defines the reflow behaviour (Canva's 'magic resize' implies content-aware re-layout). The reflow strategy/heuristics are an open design call Ruby must make before this can be built correctly.

#### M7-9 · Magic resize UI (preset + custom-dimension picker in the overflow bar) — 🟡 review

- **Files:** `app/editor/components/omnibar/overflow-bar.tsx`, `app/editor/components/omnibar/magic-resize-panel.tsx`
- **Deps:** M7-8
- **Build:** Add the magic-resize surface to the overflow bar's 'canvas size / document setup' area (§8). Preset list driven by the shared social presets (M7-10) plus a custom width×height input, applying via M7-8. Flush/square DESIGN.md styling, .segmented preset groups, British spelling. All labels/headings are ∑CG gaps.
- **Done when:** npm run build green and the panel renders with presets + custom dims in the overflow bar; choosing a preset triggers an observable artboard resize + layer reflow; npm run lint adds no new errors; new ∑CG gaps visible to slopsieve.
- **Risk:** Whether the reflow result 'looks right' across presets is purely visual; copy via slopsieve. Inherits the M7-8 open reflow-design call.

#### M7-10 · Extract social-size presets into a shared lib reused by editor + cropper — 🟢 safe

- **Files:** `lib/social-presets.ts`, `components/tools/social-cropper.tsx`
- **Deps:** —
- **Build:** Lift the platform/ratio preset table from components/tools/social-cropper.tsx into a new shared module lib/social-presets.ts (name, label, width, height) and import it back into social-cropper.tsx so behaviour is unchanged (pure refactor). The editor's magic-resize (M7-8/M7-9) imports the same module — SPEC §4 lists 'social-cropper presets' as a reuse target. Add concrete pixel dimensions (not just aspect ratios) suitable for artboard resizing.
- **Done when:** npm run build green; /tools/social-cropper still renders identically (restyle/refactor-only, no behaviour change per DESIGN.md guardrail); lib/social-presets.ts type-checks and is importable from both surfaces.
- **Risk:** Low — a mechanical extraction; only risk is altering social-cropper behaviour, which the build + a quick render check guard against.

#### M7-11 · M7 integration build gate + non-parity doc note — 🟢 safe

- **Files:** `PARITY.md`, `SPEC.md`
- **Deps:** M7-5, M7-7, M7-9
- **Build:** Final wiring/verification pass: confirm the editor route lazy-loads transformers + weights only on first bake (never on editor load), all secure-context guards degrade gracefully, and the three M7 surfaces (bake row, align controls, magic-resize panel) coexist in the omnibar/Effects module. Confirm PARITY.md needs no new rows (the editor is the M0 web-only carve-out; M7 features inherit that). Update SPEC §15 M7 status if the team tracks it there.
- **Done when:** npm run build green (static export, all pages incl. /editor); npm run lint adds no new errors beyond the documented pre-existing noise; the /editor route renders with bake/align/magic-resize present; no transformers/weights chunk appears in the landing-page bundle.
- **Risk:** Low; this is the observable build/render gate. The only catch is it can only assert 'compiles + renders', not ML correctness — that needs M7-2..M7-5 human review.

**Milestone risks**

- PREREQUISITE GAP: app/editor/ and all of M0-M6 (doc model, Fabric canvas, command/patch undo, M3 Effects module, omnibar + overflow bar, Dexie schema, multi-selection, M5/.substrata persistence) do not exist yet on the delphitools-editor branch — every M7 task assumes deliverables that aren't built. M7 cannot start until M0-M6 land.
- MODEL HOSTING: BiRefNet-lite fp16 is ~115 MB; lib/pandoc/client.ts documents Cloudflare Pages' 25 MiB per-file limit (and why pandoc.wasm is CDN-hosted) — self-hosting the weights under static export needs a chunking/host decision, and SPEC's 'self-host, no HF CDN' (privacy) collides with that limit.
- TRANSFORMERS v3→v4 BUMP: repo is on @huggingface/transformers ^3.8.1; SPEC needs ^4.2. This is a breaking change that also touches the existing /tools/background-remover (which uses the v3 pipeline API), and §12 flags the v4 WebGPU runtime as unproven for BiRefNet-lite — smoke-test before committing.
- LICENSING: the existing standalone components/tools/background-remover.tsx uses BRIA RMBG-1.4/2.0, which SPEC §4/§5 explicitly forbids shipping (non-commercial). M7 must NOT reuse that model; a separate cleanup of the standalone tool's licensing is implied but out of strict M7 scope.
- MAGIC RESIZE UNDER-SPECIFIED: §15 only names 'magic resize'; the SPEC never defines the layer-reflow behaviour. The reflow heuristics are an open design decision (M7-8).
- STATIC-EXPORT WORKER/WASM PLUMBING: §5 traps — prefer a .js worker entry (.ts can emit bad-MIME to /_next/static/media), copy .wasm to /public and load via locateFile/wasmPaths (Turbopack ignores ?url/type:asset). ORT runtime self-hosting + env.backends.onnx.wasm.wasmPaths must be verified under output:export.
- NO TEST SUITE: correctness of the ML pipeline, bake composite, and reflow is visual/behavioural only — the sole automated gate is 'npm run build green + /editor renders', so M7-2..M7-5 and M7-9 require human review in real browsers (WebGPU and non-WebGPU).
- iOS/Safari: IndexedDB model cache (not Cache API) per the ~50 MB partition cap; WASM single-thread fallback is 2-4× slower and can look hung (§12) — needs a clear UI signal, which is itself a ∑CG copy gap to fill via slopsieve.

---
