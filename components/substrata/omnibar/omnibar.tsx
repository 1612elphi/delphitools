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
  Plus,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { getActiveTool, setActiveTool, subscribeTool, type ToolId } from "@/lib/substrata/tool";
import { getOmnibarEdge, subscribeDock, type Edge } from "@/lib/substrata/dock-pref";

/**
 * Omnibar (§8) — floating tool + panel cockpit, dockable to any edge (Workspace ▸
 * Omnibar). Top/bottom render horizontal; left/right render as a narrow vertical
 * palette (text tags hide). Hover-peek blooms point toward the canvas per edge.
 * Pin-to-rail + real module contents are the next pass; bloom bodies are
 * placeholders. Functional labels = mockup words; copy ∑CG.
 */

interface ToolDef {
  id: ToolId;
  key: string;
  head: React.ReactNode;
  rest: React.ReactNode[];
}

const ICON = "size-[15px]";

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
  const [overflow, setOverflow] = useState(false);
  const vertical = edge === "left" || edge === "right";

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

  return (
    <div className={cn("pointer-events-none absolute z-40 flex gap-3.5 p-4", DOCK_POS[edge])}>
      {/* rail mounts here next pass */}

      <div className={cn("pointer-events-none flex items-start gap-2.5", vertical ? "flex-col" : "flex-row")}>
        <div className={bar}>
          {/* tools */}
          <Zone vertical={vertical}>
            {TOOLS.map((tool) => (
              <ToolStack
                key={tool.id}
                tool={tool}
                selected={activeTool === tool.id}
                vertical={vertical}
                edge={edge}
                onSelect={() => setActiveTool(tool.id)}
              />
            ))}
          </Zone>

          {/* settings (contextual; effects placeholder) */}
          <div
            className={cn(
              "group/trigger relative flex flex-1 cursor-pointer select-none items-center text-muted-foreground hover:bg-accent",
              vertical ? "justify-center py-2" : "gap-2 px-3",
            )}
          >
            <span className="text-foreground">
              <Sparkles className={ICON} />
            </span>
            {!vertical && (
              <span className="flex min-w-0 items-center gap-1.5 overflow-hidden">
                <span className="text-[10px] font-bold uppercase tracking-wide text-foreground">FX</span>
                <Tag>Bokeh</Tag>
                <Tag>Gaussian</Tag>
              </span>
            )}
            <Bloom edge={edge} cross="center">
              <PlaceholderBox title="Effects" sub="Photo" width="w-[296px]" />
            </Bloom>
          </div>

          {/* panels */}
          <Panels vertical={vertical}>
            <PanelButton label="Layers" icon={<Layers className={ICON} />} edge={edge} />
            <PanelButton label="Inspector" icon={<BoxIcon className={ICON} />} edge={edge} />
            <PanelButton
              label="Colour"
              edge={edge}
              icon={<span className="size-[18px] border border-foreground/35" style={{ background: "#3E6B33", boxShadow: "inset 0 0 0 1px rgba(255,255,255,.4)" }} />}
            />
            <PanelButton label="Export" icon={<Download className={ICON} />} edge={edge} />
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
              <PanelButton label="Canvas size" icon={<Frame className={ICON} />} edge={edge} cross="center" />
              <PanelButton label="Align" icon={<AlignHorizontalDistributeCenter className={ICON} />} edge={edge} cross="center" />
              <PanelButton label="Rotate & flip" icon={<RotateCw className={ICON} />} edge={edge} cross="center" />
            </Panels>
          </div>
        )}
      </div>
    </div>
  );
}

/* ── building blocks ─────────────────────────────────────────────────────────── */

function Zone({ vertical, children }: { vertical: boolean; children: React.ReactNode }) {
  return (
    <div
      className={cn(
        "flex items-center gap-0.5 border-border p-1.5",
        vertical ? "flex-col [&+&]:border-t" : "[&+&]:border-l",
      )}
    >
      {children}
    </div>
  );
}

function Panels({ vertical, children }: { vertical: boolean; children: React.ReactNode }) {
  return (
    <div
      className={cn(
        "flex items-center gap-0.5 border-border p-1.5",
        vertical ? "flex-col border-t" : "border-l",
      )}
    >
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

function ToolStack({
  tool,
  selected,
  vertical,
  edge,
  onSelect,
}: {
  tool: ToolDef;
  selected: boolean;
  vertical: boolean;
  edge: Edge;
  onSelect: () => void;
}) {
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
            className={cn(
              "grid size-9 place-items-center overflow-hidden text-muted-foreground opacity-0 transition-all hover:bg-accent hover:text-accent-foreground",
              vertical ? "h-0" : "w-0",
              selected && (vertical ? "group-hover/tool:h-[34px]" : "group-hover/tool:w-[34px]"),
              selected && "group-hover/tool:opacity-100",
            )}
            // ∑CG: subtool tooltips — labels arrive with the tools (M2)
            aria-label={`${tool.id} subtool`}
          >
            {icon}
          </button>
        ))}
      </div>
      {/* unused edge ref keeps the prop meaningful for future fan direction tuning */}
      <span hidden data-edge={edge} />
    </div>
  );
}

function PanelButton({
  label,
  icon,
  edge,
  cross = "end",
}: {
  label: string;
  icon: React.ReactNode;
  edge: Edge;
  cross?: "center" | "end";
}) {
  return (
    <div className="group/trigger relative">
      <button
        aria-label={label}
        className="grid size-9 place-items-center text-muted-foreground hover:bg-accent hover:text-accent-foreground"
      >
        {icon}
      </button>
      <Bloom edge={edge} cross={cross}>
        <PlaceholderBox title={label} />
      </Bloom>
    </div>
  );
}

/** Hover-peek bloom that rises toward the canvas from the docked edge. */
function Bloom({ edge, cross, children }: { edge: Edge; cross: "center" | "end"; children: React.ReactNode }) {
  // Position the bloom on the canvas side of the bar, plus cross-axis alignment.
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
  const origin: Record<Edge, string> = {
    bottom: "bottom center",
    top: "top center",
    left: "left center",
    right: "right center",
  };
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

/** Placeholder module box (header only) — real contents land with the modals pass. */
function PlaceholderBox({ title, sub, width = "w-[224px]" }: { title: string; sub?: string; width?: string }) {
  return (
    <div className={width}>
      <div className="flex h-[30px] items-center gap-2 border-b border-border bg-card pl-[11px] pr-[7px]">
        <span className="text-[10.5px] font-bold uppercase tracking-wide">{title}</span>
        {sub && <span className="ml-auto text-[10px] text-muted-foreground">{sub}</span>}
      </div>
      <div className="flex items-center gap-2 p-2.5">
        <Plus className="size-3.5 text-muted-foreground/50" />
        {/* ∑CG: empty module placeholder — module UIs land in the modals pass */}
        <span className="text-[11px] text-muted-foreground">∑CG</span>
      </div>
    </div>
  );
}
