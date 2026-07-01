"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import {
  Move,
  Crop,
  BoxSelect,
  Lasso,
  Wand2,
  SlidersHorizontal,
  Sparkles,
  Palette,
  Type,
  PenTool,
  Shapes,
  Square,
  Pencil,
  Layers,
  Box as BoxIcon,
  Download,
  MoreHorizontal,
  Frame,
  AlignHorizontalDistributeCenter,
  RotateCw,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { getActiveTool, setActiveTool, subscribeTool, type ToolId } from "@/lib/substrata/tool";
import { getOmnibarEdge, getRailEdge, subscribeDock, type Edge, type RailEdge } from "@/lib/substrata/dock-pref";
import { getPinned, subscribePins, togglePin, type ModuleId } from "@/lib/substrata/pin-pref";
import { getColour, subscribeColour } from "@/lib/substrata/colour-store";
import { ModuleBox } from "@/components/substrata/omnibar/modules";
import { Rail } from "@/components/substrata/omnibar/rail";

/**
 * Omnibar (§8) — floating tool + panel cockpit, dockable to any edge. Tools
 * cockpit + settings + panel triggers; each panel/effects trigger peeks on hover
 * and pins to the rail on click (the rail renders the same module content at
 * uniform height). Top/bottom horizontal, left/right vertical. Copy ∑CG.
 */

interface ToolDef {
  id: ToolId;
  key: string;
  head: React.ReactNode;
  rest: React.ReactNode[];
}

const ICON = "size-[15px]";
const EMPTY_PINS: readonly ModuleId[] = [];

const TOOLS: ToolDef[] = [
  { id: "move", key: "V", head: <Move className={ICON} />, rest: [<Crop key="c" className={ICON} />] },
  { id: "select", key: "M", head: <BoxSelect className={ICON} />, rest: [<Lasso key="l" className={ICON} />, <Wand2 key="w" className={ICON} />] },
  { id: "adjust", key: "A", head: <SlidersHorizontal className={ICON} />, rest: [<Sparkles key="f" className={ICON} />, <Palette key="p" className={ICON} />] },
  { id: "text", key: "T", head: <Type className={ICON} />, rest: [<PenTool key="o" className={ICON} />] },
  { id: "pieces", key: "P", head: <Shapes className={ICON} />, rest: [<Square key="s" className={ICON} />, <PenTool key="pn" className={ICON} />, <Pencil key="pc" className={ICON} />] },
];

const DOCK_POS: Record<Edge, string> = {
  bottom: "inset-x-0 bottom-0 flex-col items-center justify-end",
  top: "inset-x-0 top-0 flex-col items-center justify-start",
  left: "inset-y-0 left-0 flex-row items-center justify-start",
  right: "inset-y-0 right-0 flex-row items-center justify-end",
};

export function Omnibar() {
  const activeTool = useSyncExternalStore(subscribeTool, getActiveTool, () => "move" as ToolId);
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
        setActiveTool(hit.id);
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
        {/* tools */}
        <Zone vertical={vertical}>
          {TOOLS.map((tool) => (
            <ToolStack key={tool.id} tool={tool} selected={activeTool === tool.id} vertical={vertical} onSelect={() => setActiveTool(tool.id)} />
          ))}
        </Zone>

        {/* settings (effects) — pinnable */}
        <div
          onClick={() => togglePin("effects")}
          className={cn(
            "group/trigger relative flex flex-1 cursor-pointer select-none items-center hover:bg-accent",
            vertical ? "justify-center py-2" : "gap-2 px-3",
            isPinned("effects") ? "text-primary shadow-[inset_0_-2px_0_var(--primary)]" : "text-muted-foreground",
          )}
        >
          <span className={isPinned("effects") ? "text-primary" : "text-foreground"}>
            <Sparkles className={ICON} />
          </span>
          {!vertical && (
            <span className="flex min-w-0 items-center gap-1.5 overflow-hidden">
              <span className={cn("text-[10px] font-bold uppercase tracking-wide", isPinned("effects") ? "text-primary" : "text-foreground")}>FX</span>
              <Tag>Bokeh</Tag>
              <Tag>Gaussian</Tag>
            </span>
          )}
          {!isPinned("effects") && (
            <Bloom edge={edge} cross="center">
              <ModuleBox id="effects" />
            </Bloom>
          )}
        </div>

        {/* panels */}
        <Panels vertical={vertical}>
          <PanelButton id="layers" icon={<Layers className={ICON} />} edge={edge} pinned={isPinned("layers")} />
          <PanelButton id="inspector" icon={<BoxIcon className={ICON} />} edge={edge} pinned={isPinned("inspector")} />
          <PanelButton id="colour" edge={edge} pinned={isPinned("colour")} icon={<ColourSwatchIcon />} />
          <PanelButton id="export" icon={<Download className={ICON} />} edge={edge} pinned={isPinned("export")} />
        </Panels>

        {/* overflow */}
        <Zone vertical={vertical}>
          <button
            onClick={() => setOverflow((v) => !v)}
            // ∑CG: overflow toggle tooltip — sample: "More tools"
            aria-label="∑CG"
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
            <PanelButton id="csize" icon={<Frame className={ICON} />} edge={edge} cross="center" pinned={isPinned("csize")} />
            <PanelButton id="align" icon={<AlignHorizontalDistributeCenter className={ICON} />} edge={edge} cross="center" pinned={isPinned("align")} />
            <PanelButton id="rotate" icon={<RotateCw className={ICON} />} edge={edge} cross="center" pinned={isPinned("rotate")} />
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

function ToolStack({ tool, selected, vertical, onSelect }: { tool: ToolDef; selected: boolean; vertical: boolean; onSelect: () => void }) {
  return (
    <div className="group/tool relative flex items-center" title={tool.id}>
      <div className={cn("flex items-center gap-0.5", vertical ? "flex-col" : "flex-row")}>
        <button
          onClick={onSelect}
          className={cn(
            "relative grid size-9 place-items-center",
            selected ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-accent hover:text-accent-foreground",
          )}
        >
          {tool.head}
          {tool.rest.length > 0 && (
            <span className="absolute right-0.5 top-[3px] size-0 border-l-[3.5px] border-t-[3.5px] border-l-transparent border-t-current opacity-45" />
          )}
          <span className="absolute bottom-px right-0.5 text-[8px] font-bold opacity-65">{tool.key}</span>
        </button>
        {tool.rest.map((icon, i) => (
          <button
            key={i}
            // ∑CG: subtool tooltips — labels arrive with the tools (M2)
            aria-label={`${tool.id} subtool`}
            className={cn(
              "grid size-9 place-items-center overflow-hidden text-muted-foreground opacity-0 transition-all hover:bg-accent hover:text-accent-foreground",
              vertical ? "h-0" : "w-0",
              selected && (vertical ? "group-hover/tool:h-[34px]" : "group-hover/tool:w-[34px]"),
              selected && "group-hover/tool:opacity-100",
            )}
          >
            {icon}
          </button>
        ))}
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
        aria-label={id}
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
    <div className={cn("pointer-events-none absolute z-[60]", place[edge])}>
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
