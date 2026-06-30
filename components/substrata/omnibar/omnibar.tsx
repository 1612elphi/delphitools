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

/**
 * Omnibar (§8) — floating bottom-centre tool + panel cockpit, parity with the
 * dock in sketches/mockup.html. THIS pass: the bar (tools / settings / panels /
 * overflow) with hover-peek blooms (CSS-driven). Pin-to-rail (the stateful FLIP
 * + uniform-height rail) and real module contents land next; bloom bodies are
 * placeholders for now. Functional labels use mockup words; copy stays ∑CG.
 */

interface SubTool {
  icon: React.ReactNode;
  // ∑CG: per-subtool tooltip — labels added with the tools themselves (M2)
}

interface ToolDef {
  id: ToolId;
  key: string;
  head: React.ReactNode;
  rest: SubTool[];
}

const ICON = "size-[15px]";

const TOOLS: ToolDef[] = [
  { id: "move", key: "V", head: <Move className={ICON} />, rest: [{ icon: <Crop className={ICON} /> }] },
  { id: "select", key: "M", head: <BoxSelect className={ICON} />, rest: [{ icon: <Lasso className={ICON} /> }, { icon: <Wand2 className={ICON} /> }] },
  { id: "adjust", key: "A", head: <SlidersHorizontal className={ICON} />, rest: [{ icon: <Sparkles className={ICON} /> }, { icon: <Palette className={ICON} /> }] },
  { id: "text", key: "T", head: <Type className={ICON} />, rest: [{ icon: <PenTool className={ICON} /> }] },
  { id: "pieces", key: "P", head: <Shapes className={ICON} />, rest: [{ icon: <Square className={ICON} /> }, { icon: <PenTool className={ICON} /> }, { icon: <Pencil className={ICON} /> }] },
];

export function Omnibar() {
  const activeTool = useSyncExternalStore(subscribeTool, getActiveTool, () => "move" as ToolId);
  const [overflow, setOverflow] = useState(false);

  // Single-key tool shortcuts (V/M/A/T/P), ignored while typing / with modifiers.
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

  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-0 z-40 flex flex-col items-center gap-3.5 p-4">
      {/* rail mounts here next pass */}

      {/* barrow: main bar + (when open) the overflow bar IN LINE to its right */}
      <div className="pointer-events-none flex items-start gap-2.5">
      <div className="pointer-events-auto flex h-12 items-stretch border border-border bg-background shadow-lg">
        {/* tools */}
        <Zone>
          {TOOLS.map((tool) => (
            <ToolStack key={tool.id} tool={tool} selected={activeTool === tool.id} onSelect={() => setActiveTool(tool.id)} />
          ))}
        </Zone>

        {/* settings (contextual; effects placeholder) */}
        <div className="group/trigger relative flex flex-1 cursor-pointer select-none items-center gap-2 px-3 text-muted-foreground hover:bg-accent">
          <span className="text-foreground">
            <Sparkles className={ICON} />
          </span>
          <span className="flex min-w-0 items-center gap-1.5 overflow-hidden">
            <span className="text-[10px] font-bold uppercase tracking-wide text-foreground">FX</span>
            <Tag>Bokeh</Tag>
            <Tag>Gaussian</Tag>
          </span>
          <Bloom align="center">
            <PlaceholderBox title="Effects" sub="Photo" width="w-[296px]" />
          </Bloom>
        </div>

        {/* panels */}
        <Panels>
          <PanelButton label="Layers" icon={<Layers className={ICON} />} />
          <PanelButton label="Inspector" icon={<BoxIcon className={ICON} />} />
          <PanelButton
            label="Colour"
            icon={<span className="size-[18px] border border-foreground/35" style={{ background: "#3E6B33", boxShadow: "inset 0 0 0 1px rgba(255,255,255,.4)" }} />}
          />
          <PanelButton label="Export" icon={<Download className={ICON} />} />
        </Panels>

        {/* overflow */}
        <Zone>
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

      {/* overflow bar — in line, to the right of the main bar */}
      {overflow && (
        <div className="pointer-events-auto flex h-12 items-stretch border border-border bg-background shadow-lg">
          <Panels>
            <PanelButton label="Canvas size" align="center" icon={<Frame className={ICON} />} />
            <PanelButton label="Align" align="center" icon={<AlignHorizontalDistributeCenter className={ICON} />} />
            <PanelButton label="Rotate & flip" align="center" icon={<RotateCw className={ICON} />} />
          </Panels>
        </div>
      )}
      </div>
    </div>
  );
}

/* ── building blocks ─────────────────────────────────────────────────────────── */

function Zone({ children }: { children: React.ReactNode }) {
  return <div className="flex items-center gap-0.5 border-border p-1.5 [&+&]:border-l">{children}</div>;
}

function Panels({ children }: { children: React.ReactNode }) {
  return <div className="flex items-center gap-0.5 border-l border-border p-1.5">{children}</div>;
}

function Tag({ children }: { children: React.ReactNode }) {
  return (
    <span className="whitespace-nowrap border border-border bg-card px-[7px] py-px text-[10.5px] text-muted-foreground">
      {children}
    </span>
  );
}

function ToolStack({ tool, selected, onSelect }: { tool: ToolDef; selected: boolean; onSelect: () => void }) {
  return (
    <div className="group/tool relative flex items-center" title={tool.id}>
      <div className="flex items-center gap-0.5">
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
        {tool.rest.map((sub, i) => (
          <button
            key={i}
            className={cn(
              "grid h-9 w-0 place-items-center overflow-hidden text-muted-foreground opacity-0 transition-all hover:bg-accent hover:text-accent-foreground",
              selected && "group-hover/tool:w-[34px] group-hover/tool:opacity-100",
            )}
          >
            {sub.icon}
          </button>
        ))}
      </div>
    </div>
  );
}

function PanelButton({ label, icon, align = "right" }: { label: string; icon: React.ReactNode; align?: "right" | "center" }) {
  return (
    <div className="group/trigger relative">
      <button
        // tool/panel name shown in the bloom header; the button is icon-only
        aria-label={label}
        className="grid size-9 place-items-center text-muted-foreground hover:bg-accent hover:text-accent-foreground"
      >
        {icon}
      </button>
      <Bloom align={align}>
        <PlaceholderBox title={label} />
      </Bloom>
    </div>
  );
}

/** Hover-peek bloom that rises above the omnibar. Pin-to-rail comes next pass. */
function Bloom({ align, children }: { align: "right" | "center"; children: React.ReactNode }) {
  return (
    <div
      className={cn(
        "pointer-events-none absolute bottom-full z-[60] pb-3.5",
        align === "center" ? "left-1/2 -translate-x-1/2" : "right-[-1px]",
      )}
    >
      <div className="translate-y-2.5 scale-[.99] border border-border bg-background opacity-0 shadow-lg transition-all duration-150 [transform-origin:bottom_center] group-hover/trigger:translate-y-0 group-hover/trigger:scale-100 group-hover/trigger:opacity-100 group-hover/trigger:[pointer-events:auto]">
        {children}
      </div>
    </div>
  );
}

/** Placeholder module box (header only) — real module contents land with the
 *  modals pass. Title is a functional label (mockup word). */
function PlaceholderBox({ title, sub, width = "w-[224px]" }: { title: string; sub?: string; width?: string }) {
  return (
    <div className={width}>
      <div className="flex h-[30px] items-center gap-2 border-b border-border bg-card pl-[11px] pr-[7px]">
        <span className="text-[10.5px] font-bold uppercase tracking-wide">{title}</span>
        {sub && <span className="ml-auto text-[10px] text-muted-foreground">{sub}</span>}
      </div>
      <div className="flex items-center gap-2 p-2.5">
        <Plus className="size-3.5 text-muted-foreground/50" />
        {/* ∑CG: empty module placeholder hint — module UIs land in the modals pass */}
        <span className="text-[11px] text-muted-foreground">∑CG</span>
      </div>
    </div>
  );
}
