"use client";

import { Fragment, useEffect, useSyncExternalStore } from "react";
import {
  Move,
  Crop,
  BoxSelect,
  Brush,
  Film,
  Lasso,
  Wand2,
  SlidersHorizontal,
  Sparkles,
  Type,
  Shapes,
  Square,
  Pencil,
  Layers,
  Box as BoxIcon,
  GripVertical,
  AlignHorizontalDistributeCenter,
} from "lucide-react";
import { useDraggable } from "@dnd-kit/core";
import { cn } from "@/lib/utils";
import {
  getActiveSubs,
  getActiveTool,
  setActiveSub,
  setActiveTool,
  subscribeTool,
  type ToolId,
} from "@/lib/substrata/tool";
import { getOmnibarEdge, getRailEdge, subscribeDock, type Edge, type RailEdge } from "@/lib/substrata/dock-pref";
import { getPinned, subscribePins, togglePin, type ModuleId } from "@/lib/substrata/pin-pref";
import { getColour, subscribeColour } from "@/lib/substrata/colour-store";
import { getSnapshot, subscribe } from "@/lib/substrata/doc-store";
import { findLayer } from "@/lib/substrata/layer-tree";
import { getActiveLayerId, subscribeSelection } from "@/lib/substrata/selection";
import { fxDisplayLabel } from "@/lib/substrata/fx-ops";
import { fontLabel } from "@/lib/substrata/fonts";
import {
  getToolSettings,
  subscribeToolSettings,
  type PieceShape,
  type ToolSettings,
} from "@/lib/substrata/tool-settings";
import type { Layer } from "@/lib/substrata/doc-model";
import { ModuleBox, MODULES } from "@/components/substrata/omnibar/modules";
import { hint } from "@/lib/substrata/hint";
import { Rail } from "@/components/substrata/omnibar/rail";
import { PiecesFlyout, PrimitivesFlyout } from "@/components/substrata/omnibar/tool-settings";

/**
 * Omnibar (§8) — floating tool + panel cockpit, dockable to any edge (drag the
 * grip). UX pass (Ruby, 2026-07-08): FOUR separated units with space between —
 * [tools] [tool settings, inline + always visible] [panels/more] [colour].
 * Every subtool is a flat, FLUSH full-height button (a selected tool's
 * highlight touches the bar edges — no padding halo); no hover fans. Panel
 * triggers peek on hover and pin on click; the colour unit is one big
 * full-height swatch. Copy \u2211CG.
 */

interface ToolDef {
  id: ToolId;
  /** the tool's subtools, all rendered flat, each with its OWN shortcut key
   *  (badged on the button). Ids are internal (tool.ts activeSubs
   *  vocabulary); labels are Ruby's canonical subtool names (authored
   *  chrome, not \u2211CG). */
  subs: { id: string; label: string; key: string; icon: React.ReactNode }[];
}

const ICON = "size-[15px]";
const EMPTY_PINS: readonly ModuleId[] = [];

// Every subtool has a direct key (Ruby, 2026-07-08) — Photoshop-adjacent
// letters where they exist (V move · C crop · M marquee · L lasso · W wand ·
// U shapes · B brush). Plain keypresses, ignored while typing.
const TOOLS: ToolDef[] = [
  {
    id: "move",
    subs: [
      { id: "move", label: "Move", key: "V", icon: <Move className={ICON} /> },
      { id: "crop", label: "Crop", key: "C", icon: <Crop className={ICON} /> },
    ],
  },
  {
    id: "select",
    subs: [
      { id: "select", label: "Select", key: "M", icon: <BoxSelect className={ICON} /> },
      { id: "lasso", label: "Lasso", key: "L", icon: <Lasso className={ICON} /> },
      { id: "wand", label: "Wand", key: "W", icon: <Wand2 className={ICON} /> },
    ],
  },
  {
    id: "adjust",
    // No subtools (Ruby, 2026-07-03): the planned FILTERS/COLOUR split
    // collapsed once both families landed in the ONE filters[] pipeline —
    // a single ADJUST button fronts the whole FX mode.
    subs: [{ id: "adjust", label: "Adjust", key: "A", icon: <SlidersHorizontal className={ICON} /> }],
  },
  {
    id: "text",
    subs: [
      { id: "text", label: "Text", key: "T", icon: <Type className={ICON} /> },
      // Bezier/pen CUT from v1 (Ruby 2026-07-07) — PathLayer stays ratified
      // schema for later; text-on-path (its main consumer) was already cut.
    ],
  },
  {
    id: "pieces",
    subs: [
      { id: "pieces", label: "Pieces", key: "P", icon: <Shapes className={ICON} /> },
      { id: "primitives", label: "Primitives", key: "U", icon: <Square className={ICON} /> },
      { id: "brush", label: "Brush", key: "B", icon: <Brush className={ICON} /> },
      { id: "pencil", label: "Pencil", key: "N", icon: <Pencil className={ICON} /> },
    ],
  },
];

const DOCK_POS: Record<Edge, string> = {
  bottom: "inset-x-0 bottom-0 flex-col items-center justify-end",
  top: "inset-x-0 top-0 flex-col items-center justify-start",
  left: "inset-y-0 left-0 flex-row items-center justify-start",
  right: "inset-y-0 right-0 flex-row items-center justify-end",
};

export function Omnibar() {
  const activeTool = useSyncExternalStore(subscribeTool, getActiveTool, () => "move" as ToolId);
  const activeSubs = useSyncExternalStore(subscribeTool, getActiveSubs, getActiveSubs);
  const edge = useSyncExternalStore(subscribeDock, getOmnibarEdge, () => "bottom" as Edge);
  const pinned = useSyncExternalStore(subscribePins, getPinned, () => EMPTY_PINS);

  const railEdge = useSyncExternalStore(subscribeDock, getRailEdge, () => "follow" as RailEdge);
  const vertical = edge === "left" || edge === "right";
  const railFirst = edge === "bottom" || edge === "right";
  const isPinned = (id: ModuleId) => pinned.includes(id);

  // Rail position: "follow" → adjacent to the omnibar (in the dock); otherwise its
  // own edge, independent. If that edge IS the omnibar's edge, dock it adjacent
  // too (stacked) rather than as a separate container that would overlap.
  const follow = railEdge === "follow";
  const effRailEdge = follow ? edge : railEdge;
  const railVertical = effRailEdge === "left" || effRailEdge === "right";
  const inDock = effRailEdge === edge;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const t = e.target as HTMLElement | null;
      if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return;
      for (const tool of TOOLS) {
        const sub = tool.subs.find((x) => x.key.toLowerCase() === e.key.toLowerCase());
        if (sub) {
          e.preventDefault();
          setActiveSub(tool.id, sub.id);
          return;
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const box = cn(
    "pointer-events-auto flex items-stretch border border-border bg-background shadow-lg",
    vertical ? "flex-col" : "flex-row",
  );
  // units of different sizes align to the DOCKED edge (settings grows away
  // from it) — bottom/right docks align end, top/left align start
  const alignEdge = vertical
    ? edge === "right"
      ? "items-end"
      : "items-start"
    : edge === "bottom"
      ? "items-end"
      : "items-start";

  const railEl = <Rail vertical={railVertical} />;
  const barrowEl = (
    <div className={cn("pointer-events-none flex gap-2.5", vertical ? "flex-col" : "flex-row", alignEdge)}>
      {/* 1 · tools — flat, flush: a selected tool fills the bar's full cross
          section (no padding halo) */}
      <div className={box}>
        <OmnibarGrip vertical={vertical} />
        {TOOLS.map((tool, ti) => (
          <Fragment key={tool.id}>
            {ti > 0 && <span aria-hidden className={cn("shrink-0 bg-border", vertical ? "h-px w-full" : "w-px self-stretch")} />}
            {tool.subs.map((sub) => {
              const active = activeTool === tool.id && activeSubs[tool.id] === sub.id;
              // pieces/primitives carry a floating shape menu — the shape
              // choice IS subtool selection (Ruby)
              const flyout =
                sub.id === "primitives" ? <PrimitivesFlyout /> : sub.id === "pieces" ? <PiecesFlyout /> : null;
              const btn = (
                <button
                  key={flyout ? undefined : sub.id}
                  onClick={() => setActiveSub(tool.id, sub.id)}
                  title={sub.label}
                  aria-label={sub.label}
                  aria-pressed={active}
                  className={cn(
                    "relative grid shrink-0 place-items-center",
                    vertical ? "h-10 w-12" : "h-12 w-10",
                    active
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:bg-accent hover:text-accent-foreground",
                  )}
                >
                  {sub.icon}
                  <span className={cn("absolute bottom-0.5 right-1 text-[8px] font-bold", active ? "opacity-80" : "opacity-50")}>
                    {sub.key}
                  </span>
                </button>
              );
              return flyout ? (
                <div key={sub.id} className="group/trigger relative shrink-0">
                  {btn}
                  <Bloom edge={edge} cross="center">{flyout}</Bloom>
                </div>
              ) : (
                btn
              );
            })}
          </Fragment>
        ))}
      </div>

      {/* 2 · tool settings — the contextual trigger (Ruby's keeper shape):
          active subtool's icon + name + a couple of live setting chips at a
          glance; peeks/pins the TOOL module like every panel trigger */}
      <ToolSettingsUnit edge={edge} vertical={vertical} pinned={isPinned("tool")} />

      {/* 3 · panels ("more") — flush triggers + the overflow toggle */}
      <div className={box}>
        <PanelButton id="effects" icon={<Sparkles className={ICON} />} edge={edge} vertical={vertical} pinned={isPinned("effects")} />
        <PanelButton id="layers" icon={<Layers className={ICON} />} edge={edge} vertical={vertical} pinned={isPinned("layers")} />
        <PanelButton id="inspector" icon={<BoxIcon className={ICON} />} edge={edge} vertical={vertical} pinned={isPinned("inspector")} />
        <PanelButton id="looks" icon={<Film className={ICON} />} edge={edge} vertical={vertical} pinned={isPinned("looks")} />
        {/* arrange was the overflow bar's only occupant — pulled in (Ruby) */}
        <PanelButton id="arrange" icon={<AlignHorizontalDistributeCenter className={ICON} />} edge={edge} vertical={vertical} pinned={isPinned("arrange")} />
      </div>

      {/* 4 · colour — one big full-height swatch, its own unit */}
      <ColourButton edge={edge} vertical={vertical} pinned={isPinned("colour")} />
    </div>
  );

  return (
    <>
      <div className={cn("pointer-events-none absolute z-40 flex gap-3.5 p-4", DOCK_POS[edge])}>
        {inDock ? (railFirst ? (
          <>
            {railEl}
            {barrowEl}
          </>
        ) : (
          <>
            {barrowEl}
            {railEl}
          </>
        )) : (
          barrowEl
        )}
      </div>
      {/* rail decoupled from the omnibar — its own edge */}
      {!inDock && (
        <div className={cn("pointer-events-none absolute z-30 flex p-4", DOCK_POS[effRailEdge])}>{railEl}</div>
      )}
    </>
  );
}

/* ── building blocks ─────────────────────────────────────────────────────────── */

function Tag({ children }: { children: React.ReactNode }) {
  return (
    <span className="whitespace-nowrap border border-border bg-card px-[7px] py-px text-[10.5px] text-muted-foreground">
      {children}
    </span>
  );
}

const PIECE_LABEL: Record<PieceShape, string> = {
  rectangle: "Rectangle",
  ellipse: "Ellipse",
  line: "Line",
  polygon: "Polygon",
  star: "Star",
  symbol: "Symbol", // chip shows the generic kind; the layer names the preset
};

/**
 * Live read-out chips per tool (Ruby's spec): MOVE = the selection's X/Y ·
 * SELECT = the active subtool's mode settings (marquee touch/cover +
 * group/separate, lasso sensitivity, wand tolerance) · ADJUST = the layer's
 * stack labels · TEXT = font + size · PIECES = the chosen shape. All live —
 * doc/selection chips track the stores; the rest read tool-settings, so they
 * update the moment the M2 tools start writing it.
 */
function readoutChips(tool: ToolId, sub: string, layer: Layer | null, ts: ToolSettings): string[] {
  switch (tool) {
    case "move":
      return layer
        ? [`X ${Math.round(layer.transform.x)}`, `Y ${Math.round(layer.transform.y)}`]
        : [];
    case "select": {
      const s = ts.select;
      if (sub === "lasso") return [`Sensitivity ${s.sensitivity}%`];
      if (sub === "wand") return [`Tolerance ${s.tolerance}`];
      return [s.mode === "touch" ? "Touch" : "Cover", ts.transformAsGroup ? "Group" : "Separate"];
    }
    case "adjust":
      return layer
        ? [
            ...layer.filters.map((f) => fxDisplayLabel("filters", f)),
            ...layer.effects.map((f) => fxDisplayLabel("effects", f)),
          ]
        : [];
    case "text":
      return [fontLabel(ts.text.fontFamily), `${ts.text.fontSize} px`];
    case "pieces": {
      const p = ts.pieces;
      if (sub === "brush") return [`${p.brushSize} px`];
      if (sub === "pencil") return [`${p.pencilSize} px`];
      const extra =
        p.shape === "polygon"
          ? [`${p.sides} sides`]
          : p.shape === "star"
            ? [`${p.starPoints} points`]
            : p.shape === "rectangle" && p.cornerRadius > 0
              ? [`R ${p.cornerRadius}`]
              : [];
      return [PIECE_LABEL[p.shape], ...extra];
    }
  }
}

/**
 * The tool-settings UNIT — the contextual trigger: the active subtool's icon,
 * name, and up to two live chips summarising its settings at a glance. Hover
 * peeks the TOOL module (the full settings body); click pins it. Uniform bar
 * height; vertical docks show the icon only.
 */
function ToolSettingsUnit({ edge, vertical, pinned }: { edge: Edge; vertical: boolean; pinned: boolean }) {
  const doc = useSyncExternalStore(subscribe, getSnapshot, () => null);
  const layerId = useSyncExternalStore(subscribeSelection, getActiveLayerId, () => null);
  const toolSettings = useSyncExternalStore(subscribeToolSettings, getToolSettings, getToolSettings);
  const activeTool = useSyncExternalStore(subscribeTool, getActiveTool, () => "move" as ToolId);
  const activeSubs = useSyncExternalStore(subscribeTool, getActiveSubs, getActiveSubs);
  const layer = doc && layerId ? findLayer(doc.layers, layerId) : null;
  const sub = activeSubs[activeTool];
  const chips = readoutChips(activeTool, sub, layer, toolSettings).slice(0, 2);
  const tool = TOOLS.find((t) => t.id === activeTool);
  const subDef = tool?.subs.find((x) => x.id === sub) ?? tool?.subs[0];

  return (
    <div className="group/trigger pointer-events-auto relative shrink-0 border border-border bg-background shadow-lg">
      <button
        data-tool-unit
        onClick={() => togglePin("tool")}
        {...hint(MODULES.tool.title)}
        className={cn(
          "flex items-center",
          vertical ? "w-12 flex-col justify-center gap-1 py-3" : "h-12 gap-2 px-3",
          pinned
            ? "bg-primary/10 text-primary ring-1 ring-inset ring-primary"
            : "text-muted-foreground hover:bg-accent hover:text-accent-foreground",
        )}
      >
        <span className={pinned ? "text-primary" : "text-foreground"}>{subDef?.icon}</span>
        {!vertical && (
          <span className="flex min-w-0 items-center gap-1.5 overflow-hidden">
            <span className={cn("text-[10px] font-bold uppercase tracking-wide", pinned ? "text-primary" : "text-foreground")}>
              {subDef?.label}
            </span>
            {chips.map((c, i) => (
              <Tag key={i}>{c}</Tag>
            ))}
          </span>
        )}
      </button>
      {!pinned && (
        <Bloom edge={edge} cross="center">
          <ModuleBox id="tool" />
        </Bloom>
      )}
    </div>
  );
}

/** Omnibar drag grip (dnd-kit) — drag the whole bar onto an edge drop zone. */
function OmnibarGrip({ vertical }: { vertical: boolean }) {
  const { attributes, listeners, setNodeRef } = useDraggable({
    id: "dock-omnibar",
    data: { kind: "omnibar" },
  });
  return (
    <span
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      className={cn(
        "grid shrink-0 cursor-grab touch-none place-items-center text-muted-foreground/50 outline-none hover:text-foreground",
        vertical ? "h-4" : "w-4",
      )}
      {...hint("Move toolbar")}
    >
      <GripVertical className={cn("size-3", vertical && "rotate-90")} />
    </span>
  );
}

/** The colour trigger — its own UNIT: one big full-height live swatch.
 *  Same peek/pin semantics as every PanelButton, just louder. */
function ColourButton({ edge, pinned }: { edge: Edge; vertical?: boolean; pinned: boolean }) {
  const colour = useSyncExternalStore(subscribeColour, getColour, getColour);
  return (
    <div className="group/trigger pointer-events-auto relative shrink-0 border border-border bg-background shadow-lg">
      <button
        onClick={() => togglePin("colour")}
        {...hint(MODULES.colour.title)}
        className={cn(
          "grid size-12 place-items-center",
          pinned ? "bg-primary/10 ring-1 ring-inset ring-primary" : "hover:bg-accent",
        )}
      >
        <span
          className="size-[26px] border border-foreground/35"
          style={{ backgroundColor: colour.hex, boxShadow: "inset 0 0 0 1px rgba(255,255,255,.4)" }}
        />
      </button>
      {!pinned && (
        <Bloom edge={edge} cross="end">
          <ModuleBox id="colour" />
        </Bloom>
      )}
    </div>
  );
}

function PanelButton({
  id,
  icon,
  edge,
  vertical,
  pinned,
  cross = "end",
}: {
  id: ModuleId;
  icon: React.ReactNode;
  edge: Edge;
  vertical: boolean;
  pinned: boolean;
  cross?: "center" | "end";
}) {
  return (
    <div className="group/trigger relative shrink-0">
      <button
        onClick={() => togglePin(id)}
        // module title doubles as the hover tooltip (raw ids told a mouse
        // user nothing — clarity review #6)
        {...hint(MODULES[id].title)}
        className={cn(
          "grid place-items-center",
          vertical ? "h-10 w-12" : "h-12 w-10",
          pinned
            ? "bg-primary/10 text-primary ring-1 ring-inset ring-primary"
            : "text-muted-foreground hover:bg-accent hover:text-accent-foreground",
        )}
      >
        {icon}
      </button>
      {!pinned && (
        <Bloom edge={edge} cross={cross}>
          <ModuleBox id={id} />
        </Bloom>
      )}
    </div>
  );
}

/** Hover-peek bloom that rises toward the canvas from the docked edge. */
function Bloom({ edge, cross, children }: { edge: Edge; cross: "center" | "end"; children: React.ReactNode }) {
  const place: Record<Edge, string> = {
    bottom: cn("bottom-full pb-3.5", cross === "center" ? "left-1/2 -translate-x-1/2" : "right-[-1px]"),
    top: cn("top-full pt-3.5", cross === "center" ? "left-1/2 -translate-x-1/2" : "right-[-1px]"),
    left: cn("left-full pl-3.5", cross === "center" ? "top-1/2 -translate-y-1/2" : "bottom-[-1px]"),
    right: cn("right-full pr-3.5", cross === "center" ? "top-1/2 -translate-y-1/2" : "bottom-[-1px]"),
  };
  const enter: Record<Edge, string> = {
    bottom: "translate-y-2.5",
    top: "-translate-y-2.5",
    left: "-translate-x-2.5",
    right: "translate-x-2.5",
  };
  const origin: Record<Edge, string> = { bottom: "bottom center", top: "top center", left: "left center", right: "right center" };
  return (
    <div
      className={cn(
        // The wrapper's padding spans the trigger→bloom gap. It must become a
        // HOVER BRIDGE while the group is hovered (the classic hover-gap /
        // safe-triangle problem): with the wrapper stuck on pointer-events-none,
        // crossing the gap drops :hover off the trigger and the bloom collapses
        // before the cursor can reach it. Idle, it stays click-transparent.
        "pointer-events-none absolute z-[60] group-hover/trigger:[pointer-events:auto]",
        place[edge],
      )}
    >
      <div
        style={{ transformOrigin: origin[edge] }}
        className={cn(
          "scale-[.99] border border-border bg-background opacity-0 shadow-lg transition-all duration-150",
          enter[edge],
          "group-hover/trigger:translate-x-0 group-hover/trigger:translate-y-0 group-hover/trigger:scale-100 group-hover/trigger:opacity-100 group-hover/trigger:[pointer-events:auto]",
        )}
      >
        {children}
      </div>
    </div>
  );
}
