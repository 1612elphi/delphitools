"use client";

import { GripVertical, Pin, PinOff, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { setClamped } from "@/lib/substrata/dock-pref";
import { togglePin, type ModuleId } from "@/lib/substrata/pin-pref";
import { useDraggable } from "@dnd-kit/core";
import { hint } from "@/lib/substrata/hint";
import { LayersBody, LayersCount } from "@/components/substrata/modules/layers-panel";
import { InspectorBody } from "@/components/substrata/modules/inspector-panel";
import { ColourBody, ColourName } from "@/components/substrata/modules/colour-panel";
import { ArrangeBody } from "@/components/substrata/modules/arrange-panel";
import { FxBody, FxSub } from "@/components/substrata/modules/fx-panel";
import { LooksBody, LooksSub } from "@/components/substrata/modules/looks-panel";
import { ToolModuleBody, ToolModuleSub } from "@/components/substrata/omnibar/tool-settings";

/**
 * Module registry + box wrapper (round 3): an open module renders in the
 * RAIL (uniform height, beside the omnibar) or FLOATS at an arbitrary point
 * (natural height, mini-when-idle — see float-layer.tsx). The box supplies
 * the header (grip · title · sub · clamp-when-floating · ✕). Titles =
 * mockup/omnibar words.
 */

export interface ModuleDef {
  id: ModuleId;
  title: string;
  width: string;
  body: React.ReactNode;
  sub?: React.ReactNode;
}

export const MODULES: Record<ModuleId, ModuleDef> = {
  tool: { id: "tool", title: "Tool Settings", width: "w-auto", body: <ToolModuleBody />, sub: <ToolModuleSub /> },
  layers: { id: "layers", title: "Layers", width: "w-[224px]", body: <LayersBody />, sub: <LayersCount /> },
  effects: { id: "effects", title: "FX", width: "w-[296px]", body: <FxBody />, sub: <FxSub /> },
  inspector: { id: "inspector", title: "Inspector", width: "w-[236px]", body: <InspectorBody /> },
  colour: { id: "colour", title: "Colour", width: "w-[236px]", body: <ColourBody />, sub: <ColourName /> },
  looks: { id: "looks", title: "Looks", width: "w-[312px]", body: <LooksBody />, sub: <LooksSub /> },
  arrange: { id: "arrange", title: "Arrange", width: "w-[224px]", body: <ArrangeBody /> },
};

/** Uniform rail height (the §8 "every pinned module is the same height"). */
const RAIL_H = "h-[300px]";

export type ModuleVariant = "rail" | "float";

/**
 * Render a module. `rail` = docked in the rail (own width, uniform height,
 * sticky header); `float` = free-floating (own width, natural height, clamp
 * toggle in the header). The float-layer owns mini/full switching — this box
 * always renders the FULL panel.
 */
export function ModuleBox({
  id,
  variant = "rail",
  clamped = false,
}: {
  id: ModuleId;
  variant?: ModuleVariant;
  clamped?: boolean;
}) {
  const def = MODULES[id];
  return (
    <div
      className={cn(def.width, "flex flex-col overflow-hidden", variant === "rail" ? RAIL_H : "max-h-[min(480px,60vh)]")}
    >
      <ModuleHeader id={id} variant={variant} clamped={clamped} />
      <div className="min-h-0 flex-1 overflow-auto">{def.body}</div>
    </div>
  );
}

/** The shared header row: grip · title · sub · (clamp) · ✕. Exported so the
 *  float-layer's mini card can render exactly this and nothing else. */
export function ModuleHeader({
  id,
  variant,
  clamped = false,
}: {
  id: ModuleId;
  variant: ModuleVariant;
  clamped?: boolean;
}) {
  const def = MODULES[id];
  return (
    <div
      className={cn(
        "flex h-[30px] shrink-0 items-center gap-1.5 border-b border-border bg-card pl-1 pr-[7px]",
        variant === "rail" && "sticky top-0 z-[2]",
      )}
    >
      <ModuleGrip id={id} from={variant} />
      <span className="whitespace-nowrap text-[10.5px] font-bold uppercase tracking-wide">{def.title}</span>
      {def.sub != null && (
        <span className="ml-auto min-w-0 truncate text-[10px] text-muted-foreground">{def.sub}</span>
      )}
      {variant === "float" && (
        <button
          onClick={() => setClamped(id, !clamped)}
          aria-pressed={clamped}
          {...hint(clamped ? "Unpin" : "Pin open")}
          className={cn(
            "grid size-[22px] shrink-0 place-items-center",
            def.sub == null && "ml-auto",
            clamped ? "bg-primary/10 text-primary ring-1 ring-inset ring-primary" : "text-muted-foreground hover:bg-accent hover:text-foreground",
          )}
        >
          {clamped ? <PinOff className="size-3.5" /> : <Pin className="size-3.5" />}
        </button>
      )}
      <button
        onClick={() => togglePin(id)}
        aria-label="Close panel"
        className={cn(
          "grid size-[22px] shrink-0 place-items-center text-muted-foreground hover:bg-accent hover:text-foreground",
          def.sub == null && variant !== "float" && "ml-auto",
        )}
      >
        <X className="size-3.5" />
      </button>
    </div>
  );
}

/** Drag grip (dnd-kit draggable): drag a module out of the rail to float it
 *  anywhere, drag a floating module to move it, drop on the rail zone to
 *  re-dock. The shell's DndContext owns sensors + the drop dispatch. */
function ModuleGrip({ id, from }: { id: ModuleId; from: ModuleVariant }) {
  const { attributes, listeners, setNodeRef } = useDraggable({
    id: `dock-module-${id}`,
    data: { kind: "module", id, from },
  });
  return (
    <span
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      className="grid h-full w-4 shrink-0 cursor-grab touch-none place-items-center text-muted-foreground/60 outline-none hover:text-foreground"
      {...hint("Drag to move")}
    >
      <GripVertical className="size-3" />
    </span>
  );
}
