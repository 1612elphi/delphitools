"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import {
  Move,
  Crop,
  BoxSelect,
  Brush,
  Film,
  Lasso,
  Wand2,
  SlidersHorizontal,
  Type,
  Shapes,
  Square,
  Pencil,
  Layers,
  Box as BoxIcon,
  GripVertical,
  MoreHorizontal,
  AlignHorizontalDistributeCenter,
} from "lucide-react";
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
import { beginDockDragFromPointer } from "@/lib/substrata/drag-dock";
import { hint } from "@/lib/substrata/hint";
import { Rail } from "@/components/substrata/omnibar/rail";
import { ToolSettingsBody } from "@/components/substrata/omnibar/tool-settings";

/**
 * Omnibar (§8) — floating tool + panel cockpit, dockable to any edge. Tools
 * cockpit + settings + panel triggers; each panel/effects trigger peeks on hover
 * and pins to the rail on click (the rail renders the same module content at
 * uniform height). Top/bottom horizontal, left/right vertical. Copy \u2211CG.
 */

interface ToolDef {
  id: ToolId;
  key: string;
  /** the stack's subtools; [0] is the head/default. Ids are internal (tool.ts
   *  activeSubs vocabulary — lasso/wand key the contextual read-out); labels
   *  are Ruby's canonical subtool names (authored chrome, not \u2211CG). */
  subs: { id: string; label: string; icon: React.ReactNode }[];
}

const ICON = "size-[15px]";
const EMPTY_PINS: readonly ModuleId[] = [];

const TOOLS: ToolDef[] = [
  {
    id: "move",
    key: "V",
    subs: [
      { id: "move", label: "Move", icon: <Move className={ICON} /> },
      { id: "crop", label: "Crop", icon: <Crop className={ICON} /> },
    ],
  },
  {
    id: "select",
    key: "M",
    subs: [
      { id: "select", label: "Select", icon: <BoxSelect className={ICON} /> },
      { id: "lasso", label: "Lasso", icon: <Lasso className={ICON} /> },
      { id: "wand", label: "Wand", icon: <Wand2 className={ICON} /> },
    ],
  },
  {
    id: "adjust",
    key: "A",
    // No subtools (Ruby, 2026-07-03): the planned FILTERS/COLOUR split
    // collapsed once both families landed in the ONE filters[] pipeline —
    // a single ADJUST button fronts the whole FX mode.
    subs: [{ id: "adjust", label: "Adjust", icon: <SlidersHorizontal className={ICON} /> }],
  },
  {
    id: "text",
    key: "T",
    subs: [
      { id: "text", label: "Text", icon: <Type className={ICON} /> },
      // Bezier/pen CUT from v1 (Ruby 2026-07-07) — PathLayer stays ratified
      // schema for later; text-on-path (its main consumer) was already cut.
    ],
  },
  {
    id: "pieces",
    key: "P",
    subs: [
      { id: "pieces", label: "Pieces", icon: <Shapes className={ICON} /> },
      { id: "primitives", label: "Primitives", icon: <Square className={ICON} /> },
      { id: "brush", label: "Brush", icon: <Brush className={ICON} /> },
      { id: "pencil", label: "Pencil", icon: <Pencil className={ICON} /> },
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
  const [overflow, setOverflow] = useState(false);

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
      const hit = TOOLS.find((tool) => tool.key.toLowerCase() === e.key.toLowerCase());
      if (hit) {
        e.preventDefault();
        // re-firing the active tool's key cycles its subtools (M2-8 keymap)
        if (hit.id === getActiveTool()) {
          const ids = hit.subs.map((s) => s.id);
          const next = ids[(ids.indexOf(getActiveSubs()[hit.id]) + 1) % ids.length];
          setActiveSub(hit.id, next);
        } else {
          setActiveTool(hit.id);
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const bar = cn(
    "pointer-events-auto flex items-stretch border border-border bg-background shadow-lg",
    vertical ? "w-12 flex-col" : "h-12 flex-row",
  );

  const railEl = <Rail vertical={railVertical} />;
  const barrowEl = (
    <div className={cn("pointer-events-none flex items-start gap-2.5", vertical ? "flex-col" : "flex-row")}>
      <div className={bar}>
        {/* drag-to-dock grip — drag the whole bar to any edge (replaces the
            Workspace-menu Omnibar row) */}
        <span
          onPointerDown={(e) => {
            e.preventDefault();
            beginDockDragFromPointer(e, { kind: "omnibar" });
          }}
          className={cn(
            "grid shrink-0 cursor-grab touch-none place-items-center text-muted-foreground/50 hover:text-foreground",
            vertical ? "h-4" : "w-4",
          )}
          // ∑CG: aria-label + tooltip for the omnibar drag grip (drag to any edge)
          //   sample: "Move toolbar"
          {...hint("∑CG")}
        >
          <GripVertical className={cn("size-3", vertical && "rotate-90")} />
        </span>
        {/* tools */}
        <Zone vertical={vertical}>
          {TOOLS.map((tool) => (
            <ToolStack
              key={tool.id}
              tool={tool}
              selected={activeTool === tool.id}
              activeSub={activeSubs[tool.id]}
              vertical={vertical}
              onSelectSub={(sub) => setActiveSub(tool.id, sub)}
            />
          ))}
        </Zone>

        {/* contextual settings zone — the middle reads the ACTIVE TOOL (Ruby's
            call), not a fixed FX strip */}
        <ContextZone activeTool={activeTool} vertical={vertical} edge={edge} pinned={isPinned("effects")} />

        {/* panels */}
        <Panels vertical={vertical}>
          <PanelButton id="layers" icon={<Layers className={ICON} />} edge={edge} pinned={isPinned("layers")} />
          <PanelButton id="inspector" icon={<BoxIcon className={ICON} />} edge={edge} pinned={isPinned("inspector")} />
          <PanelButton id="colour" edge={edge} pinned={isPinned("colour")} icon={<ColourSwatchIcon />} />
          <PanelButton id="looks" icon={<Film className={ICON} />} edge={edge} pinned={isPinned("looks")} />
        </Panels>

        {/* overflow */}
        <Zone vertical={vertical}>
          <button
            onClick={() => setOverflow((v) => !v)}
            {...hint("More tools")}
            className={cn(
              "grid size-9 place-items-center",
              overflow ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-accent hover:text-accent-foreground",
            )}
          >
            <MoreHorizontal className={cn(ICON, "transition-transform", overflow && "rotate-180")} />
          </button>
        </Zone>
      </div>

      {/* overflow bar — in line, beside the main bar */}
      {overflow && (
        <div className={bar}>
          <Panels vertical={vertical}>
            <PanelButton id="arrange" icon={<AlignHorizontalDistributeCenter className={ICON} />} edge={edge} cross="center" pinned={isPinned("arrange")} />
          </Panels>
        </div>
      )}
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

function Zone({ vertical, children }: { vertical: boolean; children: React.ReactNode }) {
  return (
    <div className={cn("flex items-center gap-0.5 border-border p-1.5", vertical ? "flex-col [&+&]:border-t" : "[&+&]:border-l")}>
      {children}
    </div>
  );
}

function Panels({ vertical, children }: { vertical: boolean; children: React.ReactNode }) {
  return (
    <div className={cn("flex items-center gap-0.5 border-border p-1.5", vertical ? "flex-col border-t" : "border-l")}>
      {children}
    </div>
  );
}

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
 * The contextual settings zone (Ruby's call): the omnibar's middle reads the
 * ACTIVE TOOL — icon, name, and live chips summarising its state — and its
 * bloom opens that tool's settings. ADJUST is the FX mode: the bloom/pin
 * target is the FX module. Stub tools peek a placeholder settings bloom and
 * aren't pinnable until their real settings exist (M2 TEXT/PIECES/SELECT).
 */
function ContextZone({
  activeTool,
  vertical,
  edge,
  pinned,
}: {
  activeTool: ToolId;
  vertical: boolean;
  edge: Edge;
  pinned: boolean;
}) {
  const doc = useSyncExternalStore(subscribe, getSnapshot, () => null);
  const layerId = useSyncExternalStore(subscribeSelection, getActiveLayerId, () => null);
  const toolSettings = useSyncExternalStore(subscribeToolSettings, getToolSettings, getToolSettings);
  const activeSubs = useSyncExternalStore(subscribeTool, getActiveSubs, getActiveSubs);
  const isAdjust = activeTool === "adjust";
  const layer = doc && layerId ? findLayer(doc.layers, layerId) : null;
  const sub = activeSubs[activeTool];
  const chips = readoutChips(activeTool, sub, layer, toolSettings).slice(0, 2);
  const tool = TOOLS.find((t) => t.id === activeTool);
  const subDef = tool?.subs.find((s) => s.id === sub) ?? tool?.subs[0];
  const hot = isAdjust && pinned;

  return (
    <div
      onClick={isAdjust ? () => togglePin("effects") : undefined}
      className={cn(
        "group/trigger relative flex flex-1 select-none items-center hover:bg-accent",
        isAdjust ? "cursor-pointer" : "cursor-default",
        vertical ? "justify-center py-2" : "gap-2 px-3",
        hot ? "text-primary shadow-[inset_0_-2px_0_var(--primary)]" : "text-muted-foreground",
      )}
    >
      {/* icon + title track the ACTIVE SUBTOOL, not just the stack head */}
      <span className={hot ? "text-primary" : "text-foreground"}>{subDef?.icon}</span>
      {!vertical && (
        <span className="flex min-w-0 items-center gap-1.5 overflow-hidden">
          <span
            className={cn(
              "text-[10px] font-bold uppercase tracking-wide",
              hot ? "text-primary" : "text-foreground",
            )}
          >
            {subDef?.label}
          </span>
          {chips.map((c, i) => (
            <Tag key={i}>{c}</Tag>
          ))}
        </span>
      )}
      {isAdjust ? (
        !pinned && (
          <Bloom edge={edge} cross="center">
            {/* the FX module is interactive and this bloom lives INSIDE the
                trigger's click target — keep its clicks from toggling the pin */}
            <div onClick={(e) => e.stopPropagation()}>
              <ModuleBox id="effects" />
            </div>
          </Bloom>
        )
      ) : (
        <Bloom edge={edge} cross="center">
          <ToolSettingsBody tool={activeTool} sub={sub} title={subDef?.label ?? ""} />
        </Bloom>
      )}
    </div>
  );
}

/**
 * One tool stack: head + subtool fan. Subtools select like main tools (Ruby's
 * call): clicking one activates it (bg-primary), and while a NON-default
 * subtool is live the fan stays expanded — no hover needed — until another
 * tool is picked. The head is subs[0]; when a fan subtool is active the head
 * drops to the soft stack-active look so exactly one cell reads "current".
 */
function ToolStack({
  tool,
  selected,
  activeSub,
  vertical,
  onSelectSub,
}: {
  tool: ToolDef;
  selected: boolean;
  activeSub: string;
  vertical: boolean;
  onSelectSub: (sub: string) => void;
}) {
  const [head, ...rest] = tool.subs;
  const headActive = selected && activeSub === head.id;
  const fanPinned = selected && activeSub !== head.id;
  // Tap-to-expand (clarity review, touch): hover never fires on a touchscreen,
  // which locked every subtool away. Re-tapping the head of the already-active
  // stack now toggles the fan open; picking a subtool (or leaving the tool)
  // closes it again. Desktop hover behaviour is unchanged.
  const [fanOpen, setFanOpen] = useState(false);
  const fanShown = selected && (fanPinned || fanOpen);

  return (
    <div className="group/tool relative flex items-center">
      <div className={cn("flex items-center gap-0.5", vertical ? "flex-col" : "flex-row")}>
        <button
          onClick={() => {
            if (headActive && rest.length > 0) setFanOpen((o) => !o);
            else {
              onSelectSub(head.id);
              setFanOpen(false);
            }
          }}
          title={head.label}
          aria-label={head.label}
          className={cn(
            "relative grid size-9 place-items-center",
            headActive
              ? "bg-primary text-primary-foreground"
              : fanPinned
                ? "bg-primary/10 text-primary"
                : "text-muted-foreground hover:bg-accent hover:text-accent-foreground",
          )}
        >
          {head.icon}
          {rest.length > 0 && (
            <span className="absolute right-0.5 top-[3px] size-0 border-l-[3.5px] border-t-[3.5px] border-l-transparent border-t-current opacity-45" />
          )}
          <span className="absolute bottom-px right-0.5 text-[8px] font-bold opacity-65">{tool.key}</span>
        </button>
        {rest.map((sub) => {
          const subActive = selected && activeSub === sub.id;
          return (
            <button
              key={sub.id}
              onClick={() => {
                onSelectSub(sub.id);
                setFanOpen(false);
              }}
              title={sub.label}
              aria-label={sub.label}
              className={cn(
                "grid size-9 place-items-center overflow-hidden opacity-0 transition-all",
                subActive
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-accent hover:text-accent-foreground",
                vertical ? "h-0" : "w-0",
                selected && (vertical ? "group-hover/tool:h-[34px]" : "group-hover/tool:w-[34px]"),
                selected && "group-hover/tool:opacity-100",
                fanShown && (vertical ? "h-[34px]" : "w-[34px]"),
                fanShown && "opacity-100",
              )}
            >
              {sub.icon}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/** Colour panel trigger icon — a live swatch of the current picker colour. */
function ColourSwatchIcon() {
  const colour = useSyncExternalStore(subscribeColour, getColour, getColour);
  return (
    <span
      className="size-[18px] border border-foreground/35"
      style={{ backgroundColor: colour.hex, boxShadow: "inset 0 0 0 1px rgba(255,255,255,.4)" }}
    />
  );
}

function PanelButton({
  id,
  icon,
  edge,
  pinned,
  cross = "end",
}: {
  id: ModuleId;
  icon: React.ReactNode;
  edge: Edge;
  pinned: boolean;
  cross?: "center" | "end";
}) {
  return (
    <div className="group/trigger relative">
      <button
        onClick={() => togglePin(id)}
        // module title doubles as the hover tooltip (raw ids told a mouse
        // user nothing — clarity review #6)
        {...hint(MODULES[id].title)}
        className={cn(
          "grid size-9 place-items-center",
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
