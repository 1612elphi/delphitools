"use client";

import { Fragment, useEffect, useState, useSyncExternalStore } from "react";
import {
  Move,
  Crop,
  BoxSelect,
  Brush,
  Film,
  Lasso,
  Wand2,
  Settings2,
  SlidersHorizontal,
  Sparkles,
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
import { ModuleBox, MODULES } from "@/components/substrata/omnibar/modules";
import { hint } from "@/lib/substrata/hint";
import { Rail } from "@/components/substrata/omnibar/rail";

/**
 * Omnibar (§8) — floating tool + panel cockpit, dockable to any edge (drag the
 * grip). UX pass (Ruby, 2026-07-08): every subtool is a VISIBLE flat button —
 * no hover fans (undiscoverable, touch-hostile); the old contextual middle
 * zone is gone — tool settings are a regular module (TOOL panel button), FX
 * got its own panel button, and the colour trigger is a full-height swatch.
 * Panel triggers peek on hover and pin on click. Copy \u2211CG.
 */

interface ToolDef {
  id: ToolId;
  key: string;
  /** the tool's subtools, all rendered flat; [0] is the default (carries the
   *  key badge). Ids are internal (tool.ts activeSubs vocabulary); labels are
   *  Ruby's canonical subtool names (authored chrome, not \u2211CG). */
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
        <OmnibarGrip vertical={vertical} />
        {/* tools — every subtool visible (flat: no hover fans, touch-safe);
            thin dividers separate the five stacks */}
        <Zone vertical={vertical}>
          {TOOLS.map((tool, ti) => (
            <Fragment key={tool.id}>
              {ti > 0 && (
                <span
                  aria-hidden
                  className={cn("shrink-0 bg-border", vertical ? "mx-auto my-0.5 h-px w-6" : "mx-0.5 my-auto h-6 w-px")}
                />
              )}
              {tool.subs.map((sub, si) => {
                const active = activeTool === tool.id && activeSubs[tool.id] === sub.id;
                return (
                  <button
                    key={sub.id}
                    onClick={() => setActiveSub(tool.id, sub.id)}
                    title={sub.label}
                    aria-label={sub.label}
                    aria-pressed={active}
                    className={cn(
                      "relative grid size-9 shrink-0 place-items-center",
                      active
                        ? "bg-primary text-primary-foreground"
                        : "text-muted-foreground hover:bg-accent hover:text-accent-foreground",
                    )}
                  >
                    {sub.icon}
                    {si === 0 && (
                      <span className={cn("absolute bottom-px right-0.5 text-[8px] font-bold", active ? "opacity-80" : "opacity-50")}>
                        {tool.key}
                      </span>
                    )}
                  </button>
                );
              })}
            </Fragment>
          ))}
        </Zone>

        {/* panels — tool settings + FX are regular modules now (the middle
            ContextZone is gone) */}
        <Panels vertical={vertical}>
          <PanelButton id="tool" icon={<Settings2 className={ICON} />} edge={edge} pinned={isPinned("tool")} />
          <PanelButton id="effects" icon={<Sparkles className={ICON} />} edge={edge} pinned={isPinned("effects")} />
          <PanelButton id="layers" icon={<Layers className={ICON} />} edge={edge} pinned={isPinned("layers")} />
          <PanelButton id="inspector" icon={<BoxIcon className={ICON} />} edge={edge} pinned={isPinned("inspector")} />
          <PanelButton id="looks" icon={<Film className={ICON} />} edge={edge} pinned={isPinned("looks")} />
        </Panels>

        {/* colour — full-height swatch, the bar's one BIG target (Ruby's call) */}
        <ColourButton edge={edge} vertical={vertical} pinned={isPinned("colour")} />

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
      // ∑CG: aria-label + tooltip for the omnibar drag grip (drag to any edge)
      //   sample: "Move toolbar"
      {...hint("∑CG")}
    >
      <GripVertical className={cn("size-3", vertical && "rotate-90")} />
    </span>
  );
}

/** The colour trigger — a full-height live swatch (the bar's one big target).
 *  Same peek/pin semantics as every PanelButton, just louder. */
function ColourButton({ edge, vertical, pinned }: { edge: Edge; vertical: boolean; pinned: boolean }) {
  const colour = useSyncExternalStore(subscribeColour, getColour, getColour);
  return (
    <div className={cn("group/trigger relative shrink-0", vertical ? "border-t" : "border-l", "border-border")}>
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
