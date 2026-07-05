"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import {
  Aperture,
  Binary,
  Blend,
  ChartColumnBig,
  ChevronDown,
  ChevronUp,
  CircleDashed,
  CircleDot,
  CircleSlash,
  Coffee,
  Contrast,
  Droplet,
  Droplets,
  Eclipse,
  Focus,
  Grid3x3,
  Grip,
  GripVertical,
  Lightbulb,
  PaintBucket,
  Plus,
  Rainbow,
  RotateCcw,
  Scale,
  ScanLine,
  SlidersHorizontal,
  Sparkle,
  Spline,
  Square,
  SquareSquare,
  SquareStack,
  Stamp,
  Sun,
  Thermometer,
  Trash2,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import {
  DndContext,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import { restrictToParentElement, restrictToVerticalAxis } from "@dnd-kit/modifiers";
import { SortableContext, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { cn } from "@/lib/utils";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { ColourSwatchCell, DeferredHexInput } from "@/components/colour-field";
import { beginTransient, commitTransient, getSnapshot, subscribe } from "@/lib/substrata/doc-store";
import { findLayer, isGroup } from "@/lib/substrata/layer-tree";
import { getActiveLayerId, subscribeSelection } from "@/lib/substrata/selection";
import { EFFECT_REGISTRY } from "@/lib/substrata/effects";
import { FILTER_REGISTRY } from "@/lib/substrata/filters";
import {
  addFx,
  fxDisplayLabel,
  getFxDef,
  removeFx,
  resetFx,
  setFxOrder,
  setFxParam,
  setFxParams,
  toggleFx,
  type FxItem,
  type FxStack,
} from "@/lib/substrata/fx-ops";
import type { Layer } from "@/lib/substrata/doc-model";
import type {
  ColourParam,
  PairsParam,
  ParamSpec,
  PresetsParam,
  SelectParam,
  SliderParam,
  StepperParam,
} from "@/lib/substrata/param-spec";

/**
 * FX module — the BODY only; the module box supplies the "FX" header. One
 * pipeline over BOTH of the selected layer's stacks (Ruby's call): the
 * filters[] chain (colour changes + spatial filters) as the top zone, the
 * effects[] stack as the bottom zone, split by a heavy divider — matching the
 * real composite order (outer fx → content + filters → inner fx) as closely as
 * one list can. Drag-reorder is constrained to each zone (the two doc arrays
 * cannot interleave); a single Add picker groups all three categories and
 * greys out types already on the layer (one-per-type).
 *
 * Sketch fidelity (modals.html Effects card): flush blocks with a muted title
 * bar, 2px dividers between blocks / 1px inside, single-open accordion with the
 * grid-rows collapse animation, grip · chevron · name · reset · toss · switch.
 * Params render generically from the registries' ParamSpecs; continuous gestures
 * (slider / swatch drag) coalesce into ONE undo step via the transient path.
 * Tier-0 filters render live (filter-factory/filter-sync); Tier-1 + effects
 * are stored + undoable but move no pixels until their engines land.
 */
export function FxBody() {
  const doc = useSyncExternalStore(subscribe, getSnapshot, () => null);
  const activeId = useSyncExternalStore(subscribeSelection, getActiveLayerId, () => null);
  const layer = doc && activeId ? findLayer(doc.layers, activeId) : null;

  // Single-open accordion across BOTH zones (ids are unique across stacks).
  const [openId, setOpenId] = useState<string | null>(null);

  if (!layer) {
    return (
      <div className="p-4 text-center text-xs text-muted-foreground">
        {/* ∑CG: FX empty-state hint (no selection)
            spec: ≤ 48 chars; tells the user to select a layer to edit its
            effects/filters; British spelling.
            sample: "Select a layer to add effects." */}
        ∑CG
      </div>
    );
  }

  // Group fx are v1-deferred (layer-tree.ts semantics — no group render
  // target); offering the stacks here would write dead data a future group
  // renderer would suddenly start reading (the Inspector gates the same way).
  if (isGroup(layer)) {
    return (
      <div className="p-4 text-center text-xs text-muted-foreground">
        {/* ∑CG: FX hint when a GROUP is selected (group effects arrive later)
            spec: ≤ 56 chars; group effects aren't available yet — select a
            layer inside the group; British spelling.
            sample: "Select a layer inside the group to add effects." */}
        ∑CG
      </div>
    );
  }

  const toggleOpen = (id: string) => setOpenId((cur) => (cur === id ? null : id));
  // The film-sim look lives in the LOOKS module (Ruby, 2026-07-03) — the FX
  // pipeline never shows it (it stays pinned at the stack's end regardless).
  const visibleFilters = layer.filters.filter((f) => f.type !== "film-sim");

  return (
    <div className="flex h-full flex-col overflow-hidden text-xs">
      <AddFxButton layer={layer} onAdded={setOpenId} />
      <div className="min-h-0 flex-1 overflow-auto">
        <FxZone layer={layer} stack="filters" openId={openId} onToggleOpen={toggleOpen} />
        {visibleFilters.length > 0 && layer.effects.length > 0 && (
          // the heavy pipeline divider between the filter chain and the effects
          <div aria-hidden className="h-1 shrink-0 bg-border" />
        )}
        <FxZone layer={layer} stack="effects" openId={openId} onToggleOpen={toggleOpen} />
      </div>
    </div>
  );
}

/** Active layer's name for the module box header (sub2 slot, per the sketch). */
export function FxSub() {
  const doc = useSyncExternalStore(subscribe, getSnapshot, () => null);
  const activeId = useSyncExternalStore(subscribeSelection, getActiveLayerId, () => null);
  const layer = doc && activeId ? findLayer(doc.layers, activeId) : null;
  return layer ? <>{layer.name}</> : null;
}

// ── Add picker ────────────────────────────────────────────────────────────────

/** Picker-card icon per registry type — a UI concern, so it lives here with the
 *  panel rather than in the registries. Falls back to Plus for unknown types. */
const FX_ICONS: Record<string, LucideIcon> = {
  brightness: Sun,
  contrast: Contrast,
  exposure: Aperture,
  saturation: Droplet,
  vibrance: Droplets,
  "hue-rotate": Rainbow,
  temperature: Thermometer,
  grayscale: Eclipse,
  sepia: Coffee,
  invert: CircleSlash,
  threshold: Binary,
  gamma: Spline,
  posterize: ChartColumnBig,
  levels: SlidersHorizontal,
  "colour-balance": Scale,
  duotone: Blend,
  "gaussian-blur": CircleDashed,
  sharpen: Focus,
  emboss: Stamp,
  "edge-detect": ScanLine,
  noise: Grip,
  pixelate: Grid3x3,
  vignette: CircleDot,
  "drop-shadow": SquareStack,
  "outer-glow": Lightbulb,
  stroke: Square,
  "inner-shadow": SquareSquare,
  "inner-glow": Sparkle,
  "colour-overlay": PaintBucket,
};

/** Typed-card picker groups: filters (zone 1) · effects (zone 2). The
 *  colour/film-sim family is NOT here — looks are picked in the LOOKS module
 *  (Ruby, 2026-07-03). */
const PICKER_GROUPS: { key: string; heading: string; stack: FxStack; types: string[] }[] = [
  {
    key: "filter",
    heading: "Filters",
    stack: "filters",
    types: Object.values(FILTER_REGISTRY).filter((d) => d.category === "filter").map((d) => d.type),
  },
  {
    key: "effect",
    heading: "Effects",
    stack: "effects",
    types: Object.keys(EFFECT_REGISTRY),
  },
];

/** Placeholder look chip for a film-sim preset (real LUT thumbnails are M3). */
const presetGradient = (swatch: string[]) =>
  `linear-gradient(135deg, ${swatch[0]}, ${swatch[1]} 55%, ${swatch[2]})`;

function AddFxButton({ layer, onAdded }: { layer: Layer; onAdded: (id: string) => void }) {
  const [open, setOpen] = useState(false);

  const pick = (stack: FxStack, type: string) => {
    const id = addFx(layer.id, stack, type);
    if (id) onAdded(id);
    setOpen(false);
  };

  const has = (stack: FxStack, type: string) =>
    (stack === "effects" ? layer.effects : layer.filters).some((fx) => fx.type === type);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="flex h-12 w-full shrink-0 items-center justify-center gap-2 border-b border-border bg-primary text-[12.5px] font-bold tracking-wide text-primary-foreground hover:brightness-105"
        >
          <Plus className="size-4" />
          {/* "Add Effect" is the mockup's word (functional chrome). */}
          Add Effect
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        sideOffset={0}
        className="max-h-[min(440px,var(--radix-popover-content-available-height))] w-[var(--radix-popover-trigger-width)] overflow-auto border-border p-0"
      >
        {/* film sims / LUTs live in the LOOKS module now — the picker holds
            only the two type groups */}
        {PICKER_GROUPS.map((group, gi) => (
          <div key={group.key}>
            <PickerHeading count={group.types.length}>{group.heading}</PickerHeading>
            <div
              className={cn(
                "segmented grid-cols-3 border-x-0",
                gi === PICKER_GROUPS.length - 1 && "border-b-0",
              )}
            >
              {group.types.map((type, i) => {
                const def = getFxDef(group.stack, type)!;
                const Icon = FX_ICONS[type] ?? Plus;
                // last cell spans the row remainder — no empty grid cells (DESIGN.md §6)
                const rem = group.types.length % 3;
                const isLast = i === group.types.length - 1;
                return (
                  <button
                    key={type}
                    type="button"
                    disabled={has(group.stack, type)}
                    onClick={() => pick(group.stack, type)}
                    className={cn(
                      "group flex min-h-[54px] flex-col items-center justify-center gap-1 bg-popover px-1 py-2 hover:bg-primary/[0.09] focus-visible:z-10 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring disabled:pointer-events-none disabled:opacity-30",
                      isLast && rem === 1 && "col-span-3",
                      isLast && rem === 2 && "col-span-2",
                    )}
                  >
                    <span
                      aria-hidden
                      className="grid place-items-center text-muted-foreground group-hover:text-primary group-focus-visible:text-primary"
                    >
                      <Icon className="size-[18px]" />
                    </span>
                    <span className="line-clamp-2 text-center text-[9.5px] leading-[1.2]">
                      {def.label}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </PopoverContent>
    </Popover>
  );
}

/** Mini section header inside the add-picker (the ToolGrid header, shrunk). */
function PickerHeading({ count, children }: { count: number; children: React.ReactNode }) {
  return (
    <div className="flex items-baseline gap-2 px-2.5 pb-1.5 pt-2">
      <span className="text-[9.5px] font-bold uppercase tracking-[0.14em] text-muted-foreground">
        {children}
      </span>
      <span className="text-[9px] tabular-nums text-muted-foreground/70">{count}</span>
      <span className="h-px flex-1 bg-border" />
    </div>
  );
}

// ── pipeline zones ────────────────────────────────────────────────────────────

function FxZone({
  layer,
  stack,
  openId,
  onToggleOpen,
}: {
  layer: Layer;
  stack: FxStack;
  openId: string | null;
  onToggleOpen: (id: string) => void;
}) {
  // filters zone hides the looks-module-owned film-sim; setFxOrder handles the
  // subset (unlisted entries sink to the end — where the sim is pinned anyway)
  const list: FxItem[] = (stack === "effects" ? layer.effects : layer.filters).filter(
    (fx) => fx.type !== "film-sim",
  );
  const ids = list.map((fx) => fx.id);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));

  const onDragEnd = (e: DragEndEvent) => {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const from = ids.indexOf(String(active.id));
    const to = ids.indexOf(String(over.id));
    if (from === -1 || to === -1) return;
    const next = [...ids];
    next.splice(to, 0, next.splice(from, 1)[0]);
    setFxOrder(layer.id, stack, next);
  };

  if (list.length === 0) return null;

  return (
    // The zone wrapper scopes last:border-b-0 AND restrictToParentElement.
    <div>
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        modifiers={[restrictToVerticalAxis, restrictToParentElement]}
        onDragEnd={onDragEnd}
      >
        <SortableContext items={ids} strategy={verticalListSortingStrategy}>
          {list.map((fx) => (
            <FxBlock
              key={fx.id}
              layerId={layer.id}
              stack={stack}
              fx={fx}
              open={fx.id === openId}
              onToggle={() => onToggleOpen(fx.id)}
            />
          ))}
        </SortableContext>
      </DndContext>
    </div>
  );
}

// ── one effect/filter block ───────────────────────────────────────────────────

function FxBlock({
  layerId,
  stack,
  fx,
  open,
  onToggle,
}: {
  layerId: string;
  stack: FxStack;
  fx: FxItem;
  open: boolean;
  onToggle: () => void;
}) {
  const def = getFxDef(stack, fx.type);
  // Paramless blocks (invert, greyscale, sepia, edge-detect…) have nothing to
  // open: no chevron, no toggle, no body, no reset (Ruby QA).
  const expandable = (def?.params.length ?? 0) > 0;
  const isOpen = expandable && open;
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: fx.id,
  });
  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.6 : undefined,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn("border-b-2 border-border last:border-b-0", !fx.enabled && !isDragging && "opacity-50")}
    >
      {/* title bar — muted strip: grip · toggle button (chevron + name) · ctls.
          The toggle is a real <button> (keyboard path + aria-expanded); the ctls
          and switch sit OUTSIDE it, so they can never toggle the accordion. */}
      <div className={cn("flex h-10 items-stretch bg-muted", isOpen && "border-b border-border")}>
        <span
          {...attributes}
          {...listeners}
          className="grid w-7 shrink-0 cursor-grab place-items-center self-stretch text-muted-foreground outline-none"
          // ∑CG: aria-label for the drag-reorder grip. sample: "Reorder"
          aria-label="∑CG"
        >
          <GripVertical className="size-3.5" />
        </span>
        {expandable ? (
          <button
            type="button"
            onClick={onToggle}
            aria-expanded={isOpen}
            className="flex min-w-0 flex-1 items-center gap-1.5 pr-2.5 text-left outline-none"
          >
            <ChevronDown
              aria-hidden
              className={cn(
                "size-3 shrink-0 text-muted-foreground transition-transform motion-reduce:transition-none",
                !isOpen && "-rotate-90",
              )}
            />
            {/* preset-carrying blocks (film-sim) title themselves after their look */}
            <span className="truncate font-semibold">{fxDisplayLabel(stack, fx)}</span>
          </button>
        ) : (
          // pl-[18px] = chevron (12px) + gap (6px), so titles align down the stack
          <span className="flex min-w-0 flex-1 items-center pl-[18px] pr-2.5">
            <span className="truncate font-semibold">{fxDisplayLabel(stack, fx)}</span>
          </span>
        )}
        {fx.enabled && expandable && (
          <CtlBtn
            icon={RotateCcw}
            onClick={() => resetFx(layerId, stack, fx.id)}
            // ∑CG: aria-label/tooltip for reset-params-to-defaults. sample: "Reset"
            aria="∑CG"
          />
        )}
        <CtlBtn
          icon={Trash2}
          onClick={() => removeFx(layerId, stack, fx.id)}
          // ∑CG: aria-label/tooltip for remove-from-stack. sample: "Remove"
          aria="∑CG"
        />
        <div className="grid place-items-center border-l border-border px-2.5">
          <Switch
            checked={fx.enabled}
            onCheckedChange={() => toggleFx(layerId, stack, fx.id)}
            // ∑CG: aria-label for the enable/disable switch. sample: "Enabled"
            aria-label="∑CG"
          />
        </div>
      </div>

      {/* collapsible body — grid-rows 1fr↔0fr (the sketch's animation). `inert`
          when collapsed: the clip is visual-only, so without it the hidden
          sliders/fields would stay in the tab order and take invisible edits. */}
      {expandable && (
      <div
        inert={!isOpen}
        className={cn(
          "grid transition-[grid-template-rows] duration-200 ease-out motion-reduce:transition-none",
          isOpen ? "grid-rows-[1fr]" : "grid-rows-[0fr]",
        )}
      >
        <div className="min-h-0 overflow-hidden">
          {def?.params.map((spec, i) =>
            spec.kind === "presets" ? (
              // presets bleed edge-to-edge (the sketch's flush swatch grid)
              <PresetsGrid
                key={spec.key}
                spec={spec}
                fx={fx}
                layerId={layerId}
                stack={stack}
                bordered={i > 0}
              />
            ) : spec.kind === "pairs" ? (
              <PairsGrid
                key={spec.key}
                spec={spec}
                fx={fx}
                layerId={layerId}
                stack={stack}
                bordered={i > 0}
              />
            ) : (
              <div
                key={spec.key}
                className={cn("flex items-center gap-2 px-2.5 py-2", i > 0 && "border-t border-border")}
              >
                <FxParamRow spec={spec} fx={fx} layerId={layerId} stack={stack} />
              </div>
            ),
          )}
        </div>
      </div>
      )}
    </div>
  );
}

/** A flush divided action cell in the block's title bar (reset / remove). */
function CtlBtn({ icon: Icon, aria, onClick }: { icon: LucideIcon; aria: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={aria}
      className="grid w-9 shrink-0 place-items-center border-l border-border text-muted-foreground hover:bg-accent hover:text-foreground"
    >
      <Icon className="size-3.5" />
    </button>
  );
}

// ── param rows (rendered generically from the registry ParamSpecs) ────────────

function FxParamRow({
  spec,
  fx,
  layerId,
  stack,
}: {
  spec: ParamSpec;
  fx: FxItem;
  layerId: string;
  stack: FxStack;
}) {
  switch (spec.kind) {
    case "slider":
      return <SliderRow spec={spec} fx={fx} layerId={layerId} stack={stack} />;
    case "stepper":
      return <StepperRow spec={spec} fx={fx} layerId={layerId} stack={stack} />;
    case "colour":
      return <ColourRow spec={spec} fx={fx} layerId={layerId} stack={stack} />;
    case "select":
      return <SelectRow spec={spec} fx={fx} layerId={layerId} stack={stack} />;
    case "presets":
    case "pairs":
      return null; // rendered full-bleed by the block body, never as a padded row
  }
}

function ParamLabel({ text }: { text: string }) {
  return <span className="shrink-0 text-[10.5px] text-muted-foreground">{text}</span>;
}

function numValue(fx: FxItem, spec: SliderParam | StepperParam): number {
  const v = fx.params[spec.key];
  return typeof v === "number" ? v : spec.default;
}

function strValue(fx: FxItem, spec: ColourParam | SelectParam | PresetsParam): string {
  const v = fx.params[spec.key];
  return typeof v === "string" ? v : spec.default;
}

/** The sketch's flush preset-swatch grid (modals.html `.presets`): 4-up,
 *  hairline-gapped, edge-to-edge; the chosen look wears an inset primary ring. */
function PresetsGrid({
  spec,
  fx,
  layerId,
  stack,
  bordered,
}: {
  spec: PresetsParam;
  fx: FxItem;
  layerId: string;
  stack: FxStack;
  bordered: boolean;
}) {
  const value = strValue(fx, spec);
  return (
    <div className={cn("grid grid-cols-4 gap-px bg-border", bordered && "border-t border-border")}>
      {spec.options.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => o.value !== value && setFxParam(layerId, stack, fx.id, spec.key, o.value)}
          aria-label={o.label}
          title={o.label}
          className={cn(
            "aspect-square",
            o.value === value && "shadow-[inset_0_0_0_2px_var(--primary)]",
          )}
          style={{ background: presetGradient(o.swatch) }}
        />
      ))}
    </div>
  );
}

/**
 * Duotone's preset pairs (M3-9): same flush grid as PresetsGrid, but a pair is
 * a QUICK-SET — clicking writes its `writes` patch (both colours, one undo
 * step via setFxParams) instead of storing a preset id. Active = the pair
 * whose writes all match the current params (derived, so hand-picked colours
 * simply light no pair up).
 */
function PairsGrid({
  spec,
  fx,
  layerId,
  stack,
  bordered,
}: {
  spec: PairsParam;
  fx: FxItem;
  layerId: string;
  stack: FxStack;
  bordered: boolean;
}) {
  const isActive = (o: PairsParam["options"][number]) =>
    Object.entries(o.writes).every(
      ([key, v]) => String(fx.params[key] ?? "").toLowerCase() === v.toLowerCase(),
    );
  return (
    <div className={cn("grid grid-cols-4 gap-px bg-border", bordered && "border-t border-border")}>
      {spec.options.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => !isActive(o) && setFxParams(layerId, stack, fx.id, o.writes)}
          aria-label={o.label}
          title={o.label}
          className={cn("aspect-square", isActive(o) && "shadow-[inset_0_0_0_2px_var(--primary)]")}
          // light→dark like the sim swatches: highlight leads, shadow trails
          style={{ background: `linear-gradient(135deg, ${o.colours[1]}, ${o.colours[0]})` }}
        />
      ))}
    </div>
  );
}

/** "100%" · "10.0 px" · "0°" — decimals follow the step; px gets a space. */
function fmtValue(v: number, spec: SliderParam | StepperParam): string {
  const decimals = spec.step < 0.1 ? 2 : spec.step < 1 ? 1 : 0;
  const s = v.toFixed(decimals);
  if (!spec.unit) return s;
  return spec.unit === "px" ? `${s} px` : `${s}${spec.unit}`;
}

/**
 * Slider drags coalesce into ONE undo step. The gesture boundary lives on the
 * POINTER, not on Radix's onValueCommit — in controlled mode Radix fires
 * onValueCommit BEFORE onValueChange for keyboard steps and not at all when a
 * drag ends back on its start value, both of which would corrupt the
 * begin/commit pairing. So: pointerdown opens the transient gesture (capture
 * phase — it fires even though Radix pointer-captures the thumb), pointerup/
 * cancel closes it, and a keyboard step arrives with no gesture open and
 * simply commits as one plain undo step per press (stepper-like).
 */
function SliderRow({
  spec,
  fx,
  layerId,
  stack,
}: {
  spec: SliderParam;
  fx: FxItem;
  layerId: string;
  stack: FxStack;
}) {
  const dragging = useRef(false);
  const value = numValue(fx, spec);

  const settle = () => {
    if (!dragging.current) return;
    commitTransient();
    dragging.current = false;
  };

  return (
    <>
      <ParamLabel text={spec.label} />
      <div
        className="flex min-w-0 flex-1"
        onPointerDownCapture={() => {
          dragging.current = true;
          beginTransient();
        }}
        onPointerUpCapture={settle}
        onPointerCancelCapture={settle}
      >
        <Slider
          value={[value]}
          min={spec.min}
          max={spec.max}
          step={spec.step}
          onValueChange={([v]) =>
            setFxParam(layerId, stack, fx.id, spec.key, v, { transient: dragging.current })
          }
          className="min-w-0 flex-1"
          aria-label={spec.label}
        />
      </div>
      <span className="min-w-[42px] shrink-0 text-right text-[10.5px] tabular-nums">
        {fmtValue(value, spec)}
      </span>
    </>
  );
}

/** ±step clicks; each click is one undo step (matches the sketch's stepper). */
function StepperRow({
  spec,
  fx,
  layerId,
  stack,
}: {
  spec: StepperParam;
  fx: FxItem;
  layerId: string;
  stack: FxStack;
}) {
  const value = numValue(fx, spec);
  const nudge = (dir: 1 | -1) => {
    const next = Math.min(spec.max, Math.max(spec.min, value + dir * spec.step));
    if (next !== value) setFxParam(layerId, stack, fx.id, spec.key, next);
  };
  return (
    <>
      <ParamLabel text={spec.label} />
      <div className="ml-auto flex items-stretch border border-border">
        <span className="grid h-6 min-w-[46px] place-items-center px-1 text-[11px] tabular-nums">
          {fmtValue(value, spec)}
        </span>
        <StepBtn
          icon={ChevronUp}
          onClick={() => nudge(1)}
          disabled={value >= spec.max}
          // ∑CG: aria-label for the stepper's increment button. sample: "Increase"
          aria="∑CG"
        />
        <StepBtn
          icon={ChevronDown}
          onClick={() => nudge(-1)}
          disabled={value <= spec.min}
          // ∑CG: aria-label for the stepper's decrement button. sample: "Decrease"
          aria="∑CG"
        />
      </div>
    </>
  );
}

function StepBtn({
  icon: Icon,
  aria,
  onClick,
  disabled,
}: {
  icon: LucideIcon;
  aria: string;
  onClick: () => void;
  disabled: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={aria}
      className="grid h-6 w-[22px] place-items-center border-l border-border text-muted-foreground hover:bg-accent hover:text-foreground disabled:pointer-events-none disabled:opacity-30"
    >
      <Icon className="size-3" />
    </button>
  );
}

/**
 * Colour param: full-cell native swatch + deferred hex field. The native picker
 * can stream changes while dragging (Chrome) and offers no reliable close
 * signal — the input may keep focus after the OS picker closes, so blur alone
 * can leave the transient gesture open forever. The gesture therefore settles
 * on whichever comes first: a pause in changes (trailing timer), the input
 * blurring, or the row unmounting. A long pause inside the OS picker splits
 * into two undo steps — acceptable. The hex field commits once on blur/Enter
 * by itself.
 */
function ColourRow({
  spec,
  fx,
  layerId,
  stack,
}: {
  spec: ColourParam;
  fx: FxItem;
  layerId: string;
  stack: FxStack;
}) {
  const dragging = useRef(false);
  const settleTimer = useRef<number | null>(null);
  const value = strValue(fx, spec);

  const settle = () => {
    if (settleTimer.current !== null) {
      window.clearTimeout(settleTimer.current);
      settleTimer.current = null;
    }
    if (!dragging.current) return;
    commitTransient();
    dragging.current = false;
  };

  // A still-open gesture must not outlive the row (deselect / remove mid-pick).
  useEffect(() => {
    return () => {
      if (settleTimer.current !== null) window.clearTimeout(settleTimer.current);
      if (dragging.current) {
        commitTransient();
        dragging.current = false;
      }
    };
  }, []);

  return (
    <>
      <ParamLabel text={spec.label} />
      <div className="ml-auto flex items-center gap-1.5" onBlur={settle}>
        <ColourSwatchCell
          colour={value}
          onChange={(hex) => {
            if (!dragging.current) {
              dragging.current = true;
              beginTransient();
            }
            setFxParam(layerId, stack, fx.id, spec.key, hex, { transient: true });
            if (settleTimer.current !== null) window.clearTimeout(settleTimer.current);
            settleTimer.current = window.setTimeout(settle, 600);
          }}
          className="h-6 w-9 shrink-0 border border-border"
          // ∑CG: aria-label for a param colour swatch. sample: "Pick colour"
          aria-label="∑CG"
        />
        <DeferredHexInput
          value={value}
          onChange={(hex) => setFxParam(layerId, stack, fx.id, spec.key, hex)}
          className="h-6 w-[76px] border-border bg-card px-1.5 text-[11px] tabular-nums shadow-none dark:bg-card md:text-[11px]"
          // ∑CG: aria-label for a param hex field. sample: "Hex value"
          aria-label="∑CG"
        />
      </div>
    </>
  );
}

/** One-of-N as a flush segmented group (e.g. stroke position). */
function SelectRow({
  spec,
  fx,
  layerId,
  stack,
}: {
  spec: SelectParam;
  fx: FxItem;
  layerId: string;
  stack: FxStack;
}) {
  const value = strValue(fx, spec);
  return (
    <>
      <ParamLabel text={spec.label} />
      <div className="segmented ml-auto" style={{ gridTemplateColumns: `repeat(${spec.options.length}, 1fr)` }}>
        {spec.options.map((o) => (
          <button
            key={o.value}
            type="button"
            // guard: re-clicking the active segment must not burn a history step
            onClick={() => o.value !== value && setFxParam(layerId, stack, fx.id, spec.key, o.value)}
            className={cn(
              "h-6 px-2 text-[10.5px]",
              o.value === value
                ? "bg-primary text-primary-foreground"
                : "bg-card text-muted-foreground hover:bg-accent hover:text-foreground",
            )}
          >
            {o.label}
          </button>
        ))}
      </div>
    </>
  );
}
